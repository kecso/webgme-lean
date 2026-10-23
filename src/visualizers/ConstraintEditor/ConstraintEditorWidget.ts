/**
 * ConstraintEditor Widget
 * 
 * WebGME widget that provides a Monaco-based editor for domain constraints.
 * Integrates with the constraint language server for intelligent editing.
 * 
 * Features:
 * - Monaco-based editor with syntax highlighting and autocompletion
 * - AI-assisted constraint authoring (NL → DSL translation)
 * - Constraint explanation (DSL → NL)
 * - Real-time validation
 */

import { ConstraintLanguageServer } from '../../lsp/constraint-language-server';
import { generateDomainDSL, DomainDSL } from '../../generator/dsl-generator';
import { Metamodel } from '../../common/types';
import { NLConstraintTranslator, LLMProvider } from '../../nl/nl-translator';
import { ConstraintExplainer } from '../../nl/constraint-explainer';
import {
  registerConstraintLanguage,
  createCompletionProvider,
  createHoverProvider,
  LANGUAGE_ID,
} from '../monaco-config';

declare const define: any;
declare const require: any;

export interface AIServiceConfig {
  /** REST API endpoint for constraint translation service */
  apiEndpoint?: string;
  /** Custom LLM provider (overrides apiEndpoint) */
  llmProvider?: LLMProvider;
  /** Whether AI features are enabled */
  enabled?: boolean;
}

interface WidgetOptions {
  logger: any;
  client: any;
  /** AI service configuration */
  aiConfig?: AIServiceConfig;
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
  
  // AI assistance
  private aiConfig: AIServiceConfig;
  private nlTranslator: NLConstraintTranslator | null = null;
  private explainer: ConstraintExplainer | null = null;
  private aiPanel: HTMLElement | null = null;
  private aiPanelVisible = false;

  constructor(container: HTMLElement, options: WidgetOptions) {
    this.container = container;
    this.logger = options.logger.fork('ConstraintEditorWidget');
    this.client = options.client;
    this.aiConfig = options.aiConfig || { enabled: true };

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
    
    // AI assistance buttons
    const aiAssistBtn = this.createButton('AI Assist', () => this.toggleAIPanel(), '#6b4fbb');
    const explainBtn = this.createButton('Explain', () => this.explainSelectedConstraint(), '#4f8b6b');

    this.toolbar.appendChild(saveBtn);
    this.toolbar.appendChild(formatBtn);
    this.toolbar.appendChild(verifyBtn);
    this.toolbar.appendChild(this.createSeparator());
    this.toolbar.appendChild(aiAssistBtn);
    this.toolbar.appendChild(explainBtn);
    this.container.appendChild(this.toolbar);

    // Main content area (editor + optional AI panel)
    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    this.editorContainer = document.createElement('div');
    this.editorContainer.className = 'constraint-editor-container';
    this.editorContainer.style.cssText = `
      flex: 1;
      overflow: hidden;
    `;
    contentArea.appendChild(this.editorContainer);

    // AI assistance panel (initially hidden)
    this.aiPanel = this.createAIPanel();
    contentArea.appendChild(this.aiPanel);

    this.container.appendChild(contentArea);

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

  private createSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.style.cssText = `
      width: 1px;
      height: 20px;
      background: #3c3c3c;
      margin: 0 4px;
    `;
    return sep;
  }

  private createAIPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'constraint-editor-ai-panel';
    panel.style.cssText = `
      width: 350px;
      background: #252526;
      border-left: 1px solid #3c3c3c;
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;

    // Panel header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px;
      background: #1e1e1e;
      border-bottom: 1px solid #3c3c3c;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'AI Constraint Assistant';
    headerTitle.style.cssText = `
      color: #cccccc;
      font-weight: 500;
      font-size: 13px;
    `;
    header.appendChild(headerTitle);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #cccccc;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
    `;
    closeBtn.onclick = () => this.toggleAIPanel();
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
      display: flex;
      background: #1e1e1e;
      border-bottom: 1px solid #3c3c3c;
    `;
    
    const createTab = (label: string, active: boolean, onClick: () => void) => {
      const tab = document.createElement('button');
      tab.textContent = label;
      tab.dataset.tab = label.toLowerCase().replace(' ', '-');
      tab.style.cssText = `
        flex: 1;
        padding: 8px;
        background: ${active ? '#252526' : 'transparent'};
        border: none;
        border-bottom: 2px solid ${active ? '#6b4fbb' : 'transparent'};
        color: ${active ? '#ffffff' : '#888888'};
        cursor: pointer;
        font-size: 12px;
      `;
      tab.onclick = onClick;
      return tab;
    };

    const translateTab = createTab('Translate', true, () => this.switchAITab('translate'));
    const explainTab = createTab('Explain', false, () => this.switchAITab('explain'));
    tabBar.appendChild(translateTab);
    tabBar.appendChild(explainTab);
    panel.appendChild(tabBar);

    // Content area
    const content = document.createElement('div');
    content.className = 'ai-panel-content';
    content.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 12px;
    `;

    // Translate section
    const translateSection = this.createTranslateSection();
    content.appendChild(translateSection);

    // Explain section (initially hidden)
    const explainSection = this.createExplainSection();
    explainSection.style.display = 'none';
    content.appendChild(explainSection);

    panel.appendChild(content);

    return panel;
  }

  private createTranslateSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'ai-translate-section';

    // Instruction
    const instruction = document.createElement('p');
    instruction.textContent = 'Describe your constraint in natural language:';
    instruction.style.cssText = `
      color: #888888;
      font-size: 12px;
      margin: 0 0 8px 0;
    `;
    section.appendChild(instruction);

    // Input textarea
    const input = document.createElement('textarea');
    input.id = 'ai-nl-input';
    input.placeholder = 'e.g., "Every state must have a unique name" or "There must be exactly one initial state"';
    input.style.cssText = `
      width: 100%;
      height: 80px;
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      color: #cccccc;
      padding: 8px;
      font-size: 12px;
      font-family: inherit;
      resize: vertical;
      box-sizing: border-box;
    `;
    section.appendChild(input);

    // Severity selector
    const severityGroup = document.createElement('div');
    severityGroup.style.cssText = `
      margin: 8px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    const severityLabel = document.createElement('label');
    severityLabel.textContent = 'Severity:';
    severityLabel.style.cssText = 'color: #888888; font-size: 12px;';
    
    const severitySelect = document.createElement('select');
    severitySelect.id = 'ai-severity-select';
    severitySelect.style.cssText = `
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      color: #cccccc;
      padding: 4px 8px;
      font-size: 12px;
    `;
    ['error', 'warning', 'info'].forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      severitySelect.appendChild(opt);
    });

    severityGroup.appendChild(severityLabel);
    severityGroup.appendChild(severitySelect);
    section.appendChild(severityGroup);

    // Generate button
    const generateBtn = document.createElement('button');
    generateBtn.textContent = 'Generate Constraint';
    generateBtn.style.cssText = `
      width: 100%;
      padding: 8px 16px;
      background: #6b4fbb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 4px;
    `;
    generateBtn.onmouseover = () => { generateBtn.style.background = '#7b5fcb'; };
    generateBtn.onmouseout = () => { generateBtn.style.background = '#6b4fbb'; };
    generateBtn.onclick = () => this.translateNLToConstraint();
    section.appendChild(generateBtn);

    // Result area
    const resultContainer = document.createElement('div');
    resultContainer.id = 'ai-translate-result';
    resultContainer.style.cssText = `
      margin-top: 16px;
      display: none;
    `;

    const resultLabel = document.createElement('div');
    resultLabel.textContent = 'Generated Constraint:';
    resultLabel.style.cssText = `
      color: #888888;
      font-size: 12px;
      margin-bottom: 8px;
    `;
    resultContainer.appendChild(resultLabel);

    const resultCode = document.createElement('pre');
    resultCode.id = 'ai-translate-result-code';
    resultCode.style.cssText = `
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      padding: 12px;
      color: #cccccc;
      font-size: 12px;
      font-family: 'Consolas', 'Monaco', monospace;
      overflow: auto;
      max-height: 200px;
      white-space: pre-wrap;
      margin: 0;
    `;
    resultContainer.appendChild(resultCode);

    // Insert button
    const insertBtn = document.createElement('button');
    insertBtn.id = 'ai-insert-btn';
    insertBtn.textContent = 'Insert into Editor';
    insertBtn.style.cssText = `
      width: 100%;
      padding: 8px 16px;
      background: #4f8b6b;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 8px;
    `;
    insertBtn.onmouseover = () => { insertBtn.style.background = '#5f9b7b'; };
    insertBtn.onmouseout = () => { insertBtn.style.background = '#4f8b6b'; };
    insertBtn.onclick = () => this.insertGeneratedConstraint();
    resultContainer.appendChild(insertBtn);

    section.appendChild(resultContainer);

    return section;
  }

  private createExplainSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'ai-explain-section';

    // Instruction
    const instruction = document.createElement('p');
    instruction.innerHTML = 'Select a constraint in the editor and click <strong>Explain</strong>, or paste constraint code below:';
    instruction.style.cssText = `
      color: #888888;
      font-size: 12px;
      margin: 0 0 8px 0;
    `;
    section.appendChild(instruction);

    // Input textarea
    const input = document.createElement('textarea');
    input.id = 'ai-explain-input';
    input.placeholder = 'Paste constraint code here...';
    input.style.cssText = `
      width: 100%;
      height: 120px;
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      color: #cccccc;
      padding: 8px;
      font-size: 12px;
      font-family: 'Consolas', 'Monaco', monospace;
      resize: vertical;
      box-sizing: border-box;
    `;
    section.appendChild(input);

    // Explain button
    const explainBtn = document.createElement('button');
    explainBtn.textContent = 'Explain Constraint';
    explainBtn.style.cssText = `
      width: 100%;
      padding: 8px 16px;
      background: #4f8b6b;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      margin-top: 8px;
    `;
    explainBtn.onmouseover = () => { explainBtn.style.background = '#5f9b7b'; };
    explainBtn.onmouseout = () => { explainBtn.style.background = '#4f8b6b'; };
    explainBtn.onclick = () => this.explainConstraintFromInput();
    section.appendChild(explainBtn);

    // Result area
    const resultContainer = document.createElement('div');
    resultContainer.id = 'ai-explain-result';
    resultContainer.style.cssText = `
      margin-top: 16px;
      display: none;
    `;

    const resultContent = document.createElement('div');
    resultContent.id = 'ai-explain-result-content';
    resultContent.style.cssText = `
      background: #1e1e1e;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      padding: 12px;
      color: #cccccc;
      font-size: 12px;
      line-height: 1.5;
    `;
    resultContainer.appendChild(resultContent);

    section.appendChild(resultContainer);

    return section;
  }

  private switchAITab(tab: 'translate' | 'explain'): void {
    if (!this.aiPanel) return;

    const tabs = this.aiPanel.querySelectorAll('[data-tab]');
    tabs.forEach((t: Element) => {
      const htmlTab = t as HTMLElement;
      const isActive = htmlTab.dataset.tab === tab;
      htmlTab.style.background = isActive ? '#252526' : 'transparent';
      htmlTab.style.borderBottom = `2px solid ${isActive ? '#6b4fbb' : 'transparent'}`;
      htmlTab.style.color = isActive ? '#ffffff' : '#888888';
    });

    const translateSection = this.aiPanel.querySelector('.ai-translate-section') as HTMLElement;
    const explainSection = this.aiPanel.querySelector('.ai-explain-section') as HTMLElement;

    if (translateSection) translateSection.style.display = tab === 'translate' ? 'block' : 'none';
    if (explainSection) explainSection.style.display = tab === 'explain' ? 'block' : 'none';
  }

  private toggleAIPanel(): void {
    if (!this.aiPanel) return;

    this.aiPanelVisible = !this.aiPanelVisible;
    this.aiPanel.style.display = this.aiPanelVisible ? 'flex' : 'none';
    
    // Trigger editor relayout
    if (this.editor) {
      setTimeout(() => this.editor?.layout(), 0);
    }
  }

  private async translateNLToConstraint(): Promise<void> {
    const input = document.getElementById('ai-nl-input') as HTMLTextAreaElement;
    const severitySelect = document.getElementById('ai-severity-select') as HTMLSelectElement;
    const resultContainer = document.getElementById('ai-translate-result') as HTMLElement;
    const resultCode = document.getElementById('ai-translate-result-code') as HTMLPreElement;

    if (!input?.value.trim()) {
      this.setStatus('Please enter a constraint description', 'warning');
      return;
    }

    this.setStatus('Generating constraint...', 'normal');

    try {
      if (this.nlTranslator) {
        // Use local translator
        const result = this.nlTranslator.generateTemplate(input.value.trim());
        
        if (result.success && result.constraint) {
          resultCode.textContent = result.constraint;
          resultContainer.style.display = 'block';
          this.setStatus('Constraint generated');
        } else {
          // Try with severity adjustment
          const description = input.value.trim();
          const nlWithSeverity = `${description} [${severitySelect.value}]`;
          const retryResult = this.nlTranslator.generateTemplate(nlWithSeverity);
          
          if (retryResult.success && retryResult.constraint) {
            resultCode.textContent = retryResult.constraint;
            resultContainer.style.display = 'block';
            this.setStatus('Constraint generated');
          } else {
            this.setStatus('Could not generate constraint. Try rephrasing.', 'warning');
            resultContainer.style.display = 'none';
          }
        }
      } else if (this.aiConfig.apiEndpoint) {
        // Use API endpoint
        const response = await fetch(`${this.aiConfig.apiEndpoint}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: input.value.trim(),
            severity: severitySelect.value,
            existingConstraints: this.editor?.getValue()
          })
        });

        const data = await response.json();

        if (data.success && data.constraint) {
          resultCode.textContent = data.constraint;
          resultContainer.style.display = 'block';
          this.setStatus('Constraint generated');
        } else {
          this.setStatus(data.errors?.[0] || 'Translation failed', 'warning');
          resultContainer.style.display = 'none';
        }
      } else {
        this.setStatus('AI service not configured', 'warning');
      }
    } catch (error) {
      this.setStatus(`Error: ${(error as Error).message}`, 'error');
      this.logger.error('Translation error:', error);
    }
  }

  private insertGeneratedConstraint(): void {
    const resultCode = document.getElementById('ai-translate-result-code') as HTMLPreElement;
    
    if (!this.editor || !resultCode?.textContent) return;

    const currentContent = this.editor.getValue();
    const newContent = currentContent.trim() + '\n\n' + resultCode.textContent;
    
    this.isLoading = true;
    this.editor.setValue(newContent);
    this.isLoading = false;
    
    this.setStatus('Constraint inserted');
    
    // Close the panel
    this.toggleAIPanel();
  }

  private async explainSelectedConstraint(): Promise<void> {
    if (!this.editor) return;

    const selection = this.editor.getModel()?.getValueInRange(
      (this.editor as any).getSelection()
    );

    if (!selection?.trim()) {
      // Switch to explain tab and show panel
      this.aiPanelVisible = false;
      this.toggleAIPanel();
      this.switchAITab('explain');
      return;
    }

    // Show panel with explain tab and populate input
    this.aiPanelVisible = false;
    this.toggleAIPanel();
    this.switchAITab('explain');

    const explainInput = document.getElementById('ai-explain-input') as HTMLTextAreaElement;
    if (explainInput) {
      explainInput.value = selection;
      await this.explainConstraintFromInput();
    }
  }

  private async explainConstraintFromInput(): Promise<void> {
    const input = document.getElementById('ai-explain-input') as HTMLTextAreaElement;
    const resultContainer = document.getElementById('ai-explain-result') as HTMLElement;
    const resultContent = document.getElementById('ai-explain-result-content') as HTMLElement;

    if (!input?.value.trim()) {
      this.setStatus('Please enter a constraint to explain', 'warning');
      return;
    }

    this.setStatus('Explaining constraint...', 'normal');

    try {
      if (this.explainer) {
        const result = await this.explainer.explainConstraintBlock(input.value.trim());
        
        if (result.success && result.explanation) {
          resultContent.innerHTML = this.formatExplanation(result);
          resultContainer.style.display = 'block';
          this.setStatus('Explanation generated');
        } else {
          this.setStatus(result.error || 'Could not explain constraint', 'warning');
          resultContainer.style.display = 'none';
        }
      } else if (this.aiConfig.apiEndpoint) {
        const response = await fetch(`${this.aiConfig.apiEndpoint}/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            constraint: input.value.trim(),
            verbosity: 'normal'
          })
        });

        const data = await response.json();

        if (data.success) {
          resultContent.innerHTML = this.formatExplanation(data);
          resultContainer.style.display = 'block';
          this.setStatus('Explanation generated');
        } else {
          this.setStatus(data.error || 'Explanation failed', 'warning');
          resultContainer.style.display = 'none';
        }
      } else {
        this.setStatus('AI service not configured', 'warning');
      }
    } catch (error) {
      this.setStatus(`Error: ${(error as Error).message}`, 'error');
      this.logger.error('Explanation error:', error);
    }
  }

  private formatExplanation(result: any): string {
    let html = '';

    if (result.summary) {
      html += `<div style="font-weight: 500; margin-bottom: 8px;">${this.escapeHtml(result.summary)}</div>`;
    }

    if (result.severity) {
      const severityColors: Record<string, string> = {
        error: '#c42b1c',
        warning: '#f9a825',
        info: '#007acc'
      };
      html += `<div style="margin-bottom: 8px;">
        <span style="display: inline-block; padding: 2px 6px; background: ${severityColors[result.severity]}; border-radius: 3px; font-size: 11px; color: white;">
          ${result.severity.toUpperCase()}
        </span>
      </div>`;
    }

    if (result.explanation) {
      html += `<div style="margin-bottom: 12px;">${this.escapeHtml(result.explanation)}</div>`;
    }

    if (result.examples) {
      if (result.examples.valid?.length > 0) {
        html += `<div style="margin-bottom: 8px;">
          <div style="color: #4f8b6b; font-weight: 500; margin-bottom: 4px;">✓ Valid Examples:</div>
          <ul style="margin: 0; padding-left: 20px;">
            ${result.examples.valid.map((e: string) => `<li>${this.escapeHtml(e)}</li>`).join('')}
          </ul>
        </div>`;
      }
      if (result.examples.invalid?.length > 0) {
        html += `<div>
          <div style="color: #c42b1c; font-weight: 500; margin-bottom: 4px;">✗ Invalid Examples:</div>
          <ul style="margin: 0; padding-left: 20px;">
            ${result.examples.invalid.map((e: string) => `<li>${this.escapeHtml(e)}</li>`).join('')}
          </ul>
        </div>`;
      }
    }

    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private createButton(text: string, onClick: () => void, color = '#0e639c'): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    const hoverColor = this.lightenColor(color);
    btn.style.cssText = `
      padding: 4px 12px;
      background: ${color};
      color: white;
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 12px;
    `;
    btn.onmouseover = () => { btn.style.background = hoverColor; };
    btn.onmouseout = () => { btn.style.background = color; };
    btn.onclick = onClick;
    return btn;
  }

  private lightenColor(hex: string): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + 20);
    const g = Math.min(255, ((num >> 8) & 0xff) + 20);
    const b = Math.min(255, (num & 0xff) + 20);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
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

    // Initialize AI services
    this.nlTranslator = new NLConstraintTranslator({
      domainDSL: this.domainDSL,
      llmProvider: this.aiConfig.llmProvider
    });

    this.explainer = new ConstraintExplainer({
      domainDSL: this.domainDSL,
      llmProvider: this.aiConfig.llmProvider
    });

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
   * Configure AI service
   */
  configureAI(config: AIServiceConfig): void {
    this.aiConfig = { ...this.aiConfig, ...config };
    
    if (this.domainDSL && config.llmProvider) {
      this.nlTranslator?.updateConfig({ llmProvider: config.llmProvider });
      this.explainer?.updateConfig({ llmProvider: config.llmProvider });
    }
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

export { ConstraintEditorWidget };
export default ConstraintEditorWidget;
