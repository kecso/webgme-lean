/**
 * ConstraintEditor Widget
 * 
 * WebGME widget that provides a Monaco-based editor for domain constraints.
 * Integrates with the constraint language server for intelligent editing.
 */

import { ConstraintLanguageServer } from '../../lsp/constraint-language-server';
import { generateDomainDSL, DomainDSL } from '../../generator/dsl-generator';
import { Metamodel } from '../../common/types';
import {
  registerConstraintLanguage,
  createCompletionProvider,
  createHoverProvider,
  LANGUAGE_ID,
} from '../monaco-config';

declare const define: any;
declare const require: any;

interface WidgetOptions {
  logger: any;
  client: any;
}

interface MonacoEditor {
  getValue(): string;
  setValue(value: string): void;
  onDidChangeModelContent(callback: () => void): void;
  getModel(): any;
  updateOptions(options: any): void;
  layout(): void;
  dispose(): void;
}

interface Monaco {
  editor: {
    create(container: HTMLElement, options: any): MonacoEditor;
    setModelMarkers(model: any, owner: string, markers: any[]): void;
    defineTheme(name: string, theme: any): void;
  };
  languages: {
    register(language: any): void;
    setMonarchTokensProvider(id: string, provider: any): void;
    setLanguageConfiguration(id: string, config: any): void;
    registerCompletionItemProvider(id: string, provider: any): void;
    registerHoverProvider(id: string, provider: any): void;
  };
}

class ConstraintEditorWidget {
  private container: HTMLElement;
  private logger: any;
  private client: any;
  private monaco: Monaco | null = null;
  private editor: MonacoEditor | null = null;
  private languageServer: ConstraintLanguageServer | null = null;
  private currentNodeId: string | null = null;
  private domainDSL: DomainDSL | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private isLoading = false;

  private toolbar: HTMLElement | null = null;
  private statusBar: HTMLElement | null = null;
  private editorContainer: HTMLElement | null = null;

  constructor(container: HTMLElement, options: WidgetOptions) {
    this.container = container;
    this.logger = options.logger.fork('ConstraintEditorWidget');
    this.client = options.client;

    this.initializeUI();
    this.loadMonaco();
  }

  private initializeUI(): void {
    this.container.innerHTML = '';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.backgroundColor = '#1e1e1e';

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'constraint-editor-toolbar';
    this.toolbar.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      gap: 8px;
    `;

    const title = document.createElement('span');
    title.textContent = 'Constraint Editor';
    title.style.cssText = `
      color: #cccccc;
      font-weight: 500;
      font-size: 13px;
      flex: 1;
    `;
    this.toolbar.appendChild(title);

    const saveBtn = this.createButton('Save', () => this.saveConstraints());
    const formatBtn = this.createButton('Format', () => this.formatDocument());
    const verifyBtn = this.createButton('Verify', () => this.runVerification());

    this.toolbar.appendChild(saveBtn);
    this.toolbar.appendChild(formatBtn);
    this.toolbar.appendChild(verifyBtn);
    this.container.appendChild(this.toolbar);

    this.editorContainer = document.createElement('div');
    this.editorContainer.className = 'constraint-editor-container';
    this.editorContainer.style.cssText = `
      flex: 1;
      overflow: hidden;
    `;
    this.container.appendChild(this.editorContainer);

    this.statusBar = document.createElement('div');
    this.statusBar.className = 'constraint-editor-status';
    this.statusBar.style.cssText = `
      display: flex;
      align-items: center;
      padding: 4px 12px;
      background: #007acc;
      color: white;
      font-size: 12px;
      gap: 16px;
    `;
    this.statusBar.innerHTML = '<span>Ready</span>';
    this.container.appendChild(this.statusBar);
  }

  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 4px 12px;
      background: #0e639c;
      color: white;
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 12px;
    `;
    btn.onmouseover = () => { btn.style.background = '#1177bb'; };
    btn.onmouseout = () => { btn.style.background = '#0e639c'; };
    btn.onclick = onClick;
    return btn;
  }

  private async loadMonaco(): Promise<void> {
    this.setStatus('Loading editor...');

    const monacoPath = '/node_modules/monaco-editor/min/vs';
    
    return new Promise((resolve, reject) => {
      if (typeof require !== 'undefined' && require.config) {
        require.config({ paths: { vs: monacoPath } });
        require(['vs/editor/editor.main'], (monaco: Monaco) => {
          this.monaco = monaco;
          this.initializeEditor();
          resolve();
        }, reject);
      } else {
        const script = document.createElement('script');
        script.src = `${monacoPath}/loader.js`;
        script.onload = () => {
          (window as any).require.config({ paths: { vs: monacoPath } });
          (window as any).require(['vs/editor/editor.main'], (monaco: Monaco) => {
            this.monaco = monaco;
            this.initializeEditor();
            resolve();
          });
        };
        script.onerror = reject;
        document.head.appendChild(script);
      }
    });
  }

  private initializeEditor(): void {
    if (!this.monaco || !this.editorContainer) return;

    registerConstraintLanguage(this.monaco);

    this.editor = this.monaco.editor.create(this.editorContainer, {
      value: this.getDefaultContent(),
      language: LANGUAGE_ID,
      theme: 'constraint-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: 'on',
      renderWhitespace: 'selection',
      tabSize: 2,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      folding: true,
      bracketPairColorization: { enabled: true },
      suggest: {
        showKeywords: true,
        showSnippets: true,
      }
    });

    this.editor.onDidChangeModelContent(() => {
      this.onContentChanged();
    });

    this.setStatus('Ready');
  }

  private getDefaultContent(): string {
    return `// Domain Constraints
// Define your model constraints here

constraintset MyConstraints for Root

constraint ExampleConstraint [error]
// Every element must have a non-empty name
forall e in Element: e.name != ""
`;
  }

  private onContentChanged(): void {
    if (this.isLoading) return;

    this.validateDocument();

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.autoSave();
    }, 2000);
  }

  private validateDocument(): void {
    if (!this.languageServer || !this.editor || !this.monaco) return;

    const text = this.editor.getValue();
    const diagnostics = this.languageServer.validate(text);

    const markers = diagnostics.map(d => ({
      severity: d.severity === 'error' ? 8 : d.severity === 'warning' ? 4 : 2,
      message: d.message,
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
    }));

    this.monaco.editor.setModelMarkers(this.editor.getModel(), 'constraint-validator', markers);

    const errorCount = diagnostics.filter(d => d.severity === 'error').length;
    const warningCount = diagnostics.filter(d => d.severity === 'warning').length;

    if (errorCount > 0) {
      this.setStatus(`${errorCount} error(s), ${warningCount} warning(s)`, 'error');
    } else if (warningCount > 0) {
      this.setStatus(`${warningCount} warning(s)`, 'warning');
    } else {
      this.setStatus('No issues');
    }
  }

  private setStatus(message: string, type: 'normal' | 'error' | 'warning' = 'normal'): void {
    if (!this.statusBar) return;

    const colors = {
      normal: '#007acc',
      error: '#c42b1c',
      warning: '#f9a825'
    };

    this.statusBar.style.background = colors[type];
    this.statusBar.innerHTML = `<span>${message}</span>`;
  }

  private async saveConstraints(): Promise<void> {
    if (!this.editor || !this.currentNodeId) return;

    const text = this.editor.getValue();
    
    try {
      this.setStatus('Saving...');
      await this.client.setRegistry(this.currentNodeId, 'constraints', text);
      this.setStatus('Saved');
    } catch (error) {
      this.setStatus('Save failed', 'error');
      this.logger.error('Failed to save constraints:', error);
    }
  }

  private autoSave(): void {
    this.saveConstraints();
  }

  private formatDocument(): void {
    if (!this.editor || !this.languageServer) return;

    const text = this.editor.getValue();
    const formatted = this.languageServer.format(text);
    
    this.isLoading = true;
    this.editor.setValue(formatted);
    this.isLoading = false;
    
    this.setStatus('Formatted');
  }

  private runVerification(): void {
    this.setStatus('Verification not yet implemented', 'warning');
  }

  /**
   * Update the domain DSL based on metamodel
   */
  updateDomainDSL(metamodel: Metamodel): void {
    this.domainDSL = generateDomainDSL(metamodel);
    
    if (this.languageServer) {
      this.languageServer.updateDomainDSL(this.domainDSL);
    } else {
      this.languageServer = new ConstraintLanguageServer({
        domainDSL: this.domainDSL
      });
    }

    if (this.monaco) {
      this.monaco.languages.registerCompletionItemProvider(
        LANGUAGE_ID,
        createCompletionProvider(this.languageServer)
      );
      this.monaco.languages.registerHoverProvider(
        LANGUAGE_ID,
        createHoverProvider(this.languageServer)
      );
    }

    this.validateDocument();
  }

  /**
   * Load constraints for a node
   */
  async loadConstraints(nodeId: string): Promise<void> {
    this.currentNodeId = nodeId;
    this.isLoading = true;

    try {
      const constraints = await this.client.getRegistry(nodeId, 'constraints');
      
      if (this.editor) {
        this.editor.setValue(constraints || this.getDefaultContent());
      }
    } catch (error) {
      this.logger.warn('No constraints found, using default');
      if (this.editor) {
        this.editor.setValue(this.getDefaultContent());
      }
    }

    this.isLoading = false;
    this.validateDocument();
  }

  /**
   * Handle container resize
   */
  onResize(): void {
    if (this.editor) {
      this.editor.layout();
    }
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    if (this.editor) {
      this.editor.dispose();
    }
    this.container.innerHTML = '';
  }
}

export default ConstraintEditorWidget;
