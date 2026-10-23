/*globals define, require*/
/**
 * LeanEditor Widget
 *
 * Monaco-based editor widget for viewing and editing Lean content stored
 * in the 'lean' registry of the WebGME project's Root node.
 *
 * Features:
 * - Monaco editor with Lean 4 syntax highlighting
 * - Save button to persist changes to the registry
 * - Auto-resize support
 * - Read-only mode support
 */

define([
    'css!./styles/LeanEditorWidget.css'
], function () {
    'use strict';

    var WIDGET_CLASS = 'lean-editor';
    var LANGUAGE_ID = 'lean4';

    function LeanEditorWidget(logger, container, client) {
        this._logger = logger.fork('Widget');
        this._el = container;
        this._client = client;
        this._control = null;

        this._monaco = null;
        this._editor = null;
        this._content = '';
        this._isReadOnly = false;
        this._isDirty = false;

        this._initialize();

        this._logger.debug('ctor finished');
    }

    LeanEditorWidget.prototype._initialize = function () {
        var self = this;

        this._el.addClass(WIDGET_CLASS);

        this._containerEl = document.createElement('div');
        this._containerEl.className = 'lean-editor-container';
        this._el.append(this._containerEl);

        this._toolbarEl = document.createElement('div');
        this._toolbarEl.className = 'lean-editor-toolbar';
        this._containerEl.appendChild(this._toolbarEl);

        this._createToolbar();

        this._editorEl = document.createElement('div');
        this._editorEl.className = 'lean-editor-monaco';
        this._containerEl.appendChild(this._editorEl);

        this._statusEl = document.createElement('div');
        this._statusEl.className = 'lean-editor-status';
        this._statusEl.textContent = 'Loading editor...';
        this._containerEl.appendChild(this._statusEl);

        this._loadMonaco();
    };

    LeanEditorWidget.prototype._createToolbar = function () {
        var self = this;

        var titleSpan = document.createElement('span');
        titleSpan.className = 'lean-editor-title';
        titleSpan.textContent = 'Lean Editor';
        this._toolbarEl.appendChild(titleSpan);

        var spacer = document.createElement('div');
        spacer.className = 'lean-editor-toolbar-spacer';
        this._toolbarEl.appendChild(spacer);

        this._saveBtn = document.createElement('button');
        this._saveBtn.className = 'lean-editor-btn lean-editor-btn-save';
        this._saveBtn.textContent = 'Save';
        this._saveBtn.title = 'Save changes (Ctrl+S)';
        this._saveBtn.onclick = function () {
            self.saveContent();
        };
        this._toolbarEl.appendChild(this._saveBtn);

        this._statusIndicator = document.createElement('span');
        this._statusIndicator.className = 'lean-editor-status-indicator';
        this._toolbarEl.appendChild(this._statusIndicator);
    };

    LeanEditorWidget.prototype._loadMonaco = function () {
        var self = this;
        
        // Use the configured requirejs path
        require(['vs/editor/editor.main'], function (monaco) {
            self._monaco = monaco;
            self._initializeEditor();
        }, function (err) {
            self._logger.error('Failed to load Monaco:', err);
            self._setStatus('Failed to load editor', 'error');
        });
    };

    LeanEditorWidget.prototype._initializeEditor = function () {
        var self = this;

        this._registerLeanLanguage();

        this._editor = this._monaco.editor.create(this._editorEl, {
            value: this._content,
            language: LANGUAGE_ID,
            theme: 'lean-dark',
            automaticLayout: false,
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            tabSize: 2,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            folding: true,
            bracketPairColorization: { enabled: true },
            readOnly: this._isReadOnly
        });

        this._editor.onDidChangeModelContent(function () {
            if (!self._isReadOnly) {
                self._isDirty = true;
                self._updateStatusIndicator();
            }
        });

        this._editor.addCommand(this._monaco.KeyMod.CtrlCmd | this._monaco.KeyCode.KeyS, function () {
            self.saveContent();
        });

        this._setStatus('Ready');
        this._updateLayout();

        this._logger.debug('Monaco editor initialized');
    };

    LeanEditorWidget.prototype._registerLeanLanguage = function () {
        var monaco = this._monaco;

        if (monaco.languages.getLanguages().some(function (lang) { return lang.id === LANGUAGE_ID; })) {
            return;
        }

        monaco.languages.register({ id: LANGUAGE_ID });

        monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
            defaultToken: '',
            tokenPostfix: '.lean',

            keywords: [
                'theorem', 'lemma', 'def', 'definition', 'axiom', 'constant',
                'structure', 'class', 'instance', 'inductive', 'coinductive',
                'where', 'with', 'match', 'if', 'then', 'else', 'do', 'let',
                'in', 'have', 'show', 'by', 'fun', 'assume', 'return',
                'namespace', 'section', 'end', 'open', 'import', 'export',
                'universe', 'variable', 'variables', 'implicit', 'explicit',
                'private', 'protected', 'public', 'mutual', 'partial',
                'noncomputable', 'unsafe', 'example', 'deriving', 'extends',
                'attribute', 'syntax', 'macro', 'macro_rules', 'notation',
                'infix', 'infixl', 'infixr', 'prefix', 'postfix',
                'set_option', 'abbrev', 'opaque', 'scoped', 'local'
            ],

            builtinTypes: [
                'Type', 'Prop', 'Sort', 'Nat', 'Int', 'Bool', 'String', 'Char',
                'Float', 'Unit', 'List', 'Array', 'Option', 'IO', 'True', 'False'
            ],

            tactics: [
                'apply', 'exact', 'intro', 'intros', 'cases', 'induction',
                'rfl', 'rw', 'rewrite', 'simp', 'simpa', 'ring', 'linarith',
                'omega', 'decide', 'native_decide', 'trivial', 'constructor',
                'exists', 'use', 'refine', 'sorry', 'admit', 'done',
                'contradiction', 'exfalso', 'absurd', 'unfold', 'dsimp',
                'conv', 'calc', 'suffices', 'obtain', 'rcases', 'ext', 'funext',
                'congr', 'norm_num', 'positivity', 'push_neg', 'contrapose',
                'by_contra', 'by_cases', 'split', 'left', 'right', 'assumption',
                'exact?', 'apply?', 'rw?', 'simp?', 'aesop', 'tauto', 'first',
                'repeat', 'iterate', 'try', 'focus', 'all_goals', 'any_goals',
                'fail', 'trace'
            ],

            operators: [
                '=', '≠', '!=', '<', '>', '≤', '<=', '≥', '>=',
                '+', '-', '*', '/', '%', '^', '∧', '&&', '∨', '||', '¬', '!',
                '→', '->', '←', '<-', '↔', '<->', '∀', '∃', 'λ',
                '∈', '∉', '⊂', '⊆', '⊃', '⊇', '∪', '∩',
                ':=', '|', '.', ',', ';', ':', '::', '..', '…',
                '⟨', '⟩', '⦃', '⦄', '«', '»'
            ],

            symbols: /[=><!~?:&|+\-*\/\^%@#∀∃λ∈∉⊂⊆⊃⊇∪∩∧∨¬→←↔≤≥≠]+/,

            escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

            tokenizer: {
                root: [
                    [/--.*$/, 'comment'],
                    [/\/-/, 'comment', '@blockComment'],

                    [/#\w+/, 'keyword.directive'],

                    [/[a-z_$][\w$']*/, {
                        cases: {
                            '@keywords': 'keyword',
                            '@tactics': 'keyword.tactic',
                            '@default': 'identifier'
                        }
                    }],

                    [/[A-Z][\w$']*/, {
                        cases: {
                            '@builtinTypes': 'type.builtin',
                            '@default': 'type'
                        }
                    }],

                    { include: '@whitespace' },

                    [/[{}()\[\]⟨⟩⦃⦄«»]/, '@brackets'],
                    [/@symbols/, {
                        cases: {
                            '@operators': 'operator',
                            '@default': ''
                        }
                    }],

                    [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
                    [/\d+/, 'number'],

                    [/[;,.]/, 'delimiter'],

                    [/"([^"\\]|\\.)*$/, 'string.invalid'],
                    [/"/, 'string', '@string'],
                    [/'[^']*'/, 'string.char']
                ],

                blockComment: [
                    [/[^\/-]+/, 'comment'],
                    [/\/-/, 'comment', '@push'],
                    [/-\//, 'comment', '@pop'],
                    [/[\/-]/, 'comment']
                ],

                string: [
                    [/[^\\"]+/, 'string'],
                    [/@escapes/, 'string.escape'],
                    [/\\./, 'string.escape.invalid'],
                    [/"/, 'string', '@pop']
                ],

                whitespace: [
                    [/[ \t\r\n]+/, 'white']
                ]
            }
        });

        monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
            comments: {
                lineComment: '--',
                blockComment: ['/-', '-/']
            },
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
                ['⟨', '⟩'],
                ['⦃', '⦄']
            ],
            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: '⟨', close: '⟩' },
                { open: '⦃', close: '⦄' }
            ],
            surroundingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: '⟨', close: '⟩' }
            ],
            indentationRules: {
                increaseIndentPattern: /^\s*(theorem|lemma|def|structure|class|instance|inductive|where|namespace|section|if|match|do|by)\b/,
                decreaseIndentPattern: /^\s*(end|else)\b/
            }
        });

        monaco.editor.defineTheme('lean-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: 'C586C0' },
                { token: 'keyword.tactic', foreground: 'DCDCAA', fontStyle: 'italic' },
                { token: 'keyword.directive', foreground: '569CD6' },
                { token: 'type', foreground: '4EC9B0' },
                { token: 'type.builtin', foreground: '4EC9B0', fontStyle: 'bold' },
                { token: 'identifier', foreground: '9CDCFE' },
                { token: 'number', foreground: 'B5CEA8' },
                { token: 'number.float', foreground: 'B5CEA8' },
                { token: 'string', foreground: 'CE9178' },
                { token: 'string.char', foreground: 'CE9178' },
                { token: 'string.escape', foreground: 'D7BA7D' },
                { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
                { token: 'operator', foreground: 'D4D4D4' },
                { token: 'delimiter', foreground: 'D4D4D4' }
            ],
            colors: {
                'editor.background': '#1E1E1E',
                'editor.foreground': '#D4D4D4',
                'editorLineNumber.foreground': '#858585',
                'editorCursor.foreground': '#AEAFAD',
                'editor.selectionBackground': '#264F78',
                'editor.inactiveSelectionBackground': '#3A3D41'
            }
        });

        monaco.editor.defineTheme('lean-light', {
            base: 'vs',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: 'AF00DB' },
                { token: 'keyword.tactic', foreground: '795E26', fontStyle: 'italic' },
                { token: 'keyword.directive', foreground: '0000FF' },
                { token: 'type', foreground: '267F99' },
                { token: 'type.builtin', foreground: '267F99', fontStyle: 'bold' },
                { token: 'identifier', foreground: '001080' },
                { token: 'number', foreground: '098658' },
                { token: 'string', foreground: 'A31515' },
                { token: 'comment', foreground: '008000', fontStyle: 'italic' },
                { token: 'operator', foreground: '000000' },
                { token: 'delimiter', foreground: '000000' }
            ],
            colors: {
                'editor.background': '#FFFFFF',
                'editor.foreground': '#000000'
            }
        });

        this._logger.debug('Lean language registered');
    };

    LeanEditorWidget.prototype._setStatus = function (message, type) {
        type = type || 'normal';
        this._statusEl.textContent = message;
        this._statusEl.className = 'lean-editor-status lean-editor-status-' + type;
    };

    LeanEditorWidget.prototype._updateStatusIndicator = function () {
        if (this._isDirty) {
            this._statusIndicator.className = 'lean-editor-status-indicator lean-editor-dirty';
            this._statusIndicator.title = 'Unsaved changes';
        } else {
            this._statusIndicator.className = 'lean-editor-status-indicator lean-editor-saved';
            this._statusIndicator.title = 'All changes saved';
        }
    };

    LeanEditorWidget.prototype._updateLayout = function () {
        if (this._editor) {
            this._editor.layout();
        }
    };

    LeanEditorWidget.prototype.setControl = function (control) {
        this._control = control;
    };

    LeanEditorWidget.prototype.setContent = function (content) {
        this._content = content || '';

        if (this._editor) {
            var currentValue = this._editor.getValue();
            if (currentValue !== this._content) {
                this._editor.setValue(this._content);
            }
        }

        this._isDirty = false;
        this._updateStatusIndicator();
    };

    LeanEditorWidget.prototype.getContent = function () {
        if (this._editor) {
            return this._editor.getValue();
        }
        return this._content;
    };

    LeanEditorWidget.prototype.saveContent = function () {
        var self = this;

        if (!this._control) {
            this._setStatus('No control connected', 'error');
            return;
        }

        if (this._isReadOnly) {
            this._setStatus('Read-only mode', 'warning');
            return;
        }

        var content = this.getContent();

        this._setStatus('Saving...');
        this._saveBtn.disabled = true;

        this._control.saveContent(content)
            .then(function () {
                self._isDirty = false;
                self._updateStatusIndicator();
                self._setStatus('Saved');
                self._saveBtn.disabled = false;
            })
            .catch(function (err) {
                self._setStatus('Save failed: ' + err.message, 'error');
                self._saveBtn.disabled = false;
            });
    };

    LeanEditorWidget.prototype.setReadOnly = function (isReadOnly) {
        this._isReadOnly = isReadOnly;

        if (this._editor) {
            this._editor.updateOptions({ readOnly: isReadOnly });
        }

        if (this._saveBtn) {
            this._saveBtn.disabled = isReadOnly;
        }
    };

    LeanEditorWidget.prototype.setTitle = function (title) {
        var titleEl = this._toolbarEl.querySelector('.lean-editor-title');
        if (titleEl) {
            titleEl.textContent = title;
        }
    };

    LeanEditorWidget.prototype.onWidgetContainerResize = function (width, height) {
        this._logger.debug('Widget resizing:', width, height);
        this._updateLayout();
    };

    LeanEditorWidget.prototype.onActivate = function () {
        this._logger.debug('LeanEditorWidget activated');
        this._updateLayout();
    };

    LeanEditorWidget.prototype.onDeactivate = function () {
        this._logger.debug('LeanEditorWidget deactivated');
    };

    LeanEditorWidget.prototype.destroy = function () {
        if (this._editor) {
            this._editor.dispose();
            this._editor = null;
        }
        this._el.empty();
    };

    return LeanEditorWidget;
});
