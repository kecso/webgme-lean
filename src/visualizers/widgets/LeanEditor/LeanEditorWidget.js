/*globals define, require*/
/**
 * Constraint manager editor.
 *
 * The text in the panel is the constraint dialect stored on the project root.
 * Lean is produced later, from this text and the metamodel, and is not shown here.
 */

define([
    'css!./styles/LeanEditorWidget.css'
], function () {
    'use strict';

    var WIDGET_CLASS = 'lean-editor';
    var LANGUAGE_ID = 'webgme-constraint';

    function LeanEditorWidget(logger, container, client) {
        this._logger = logger.fork('Widget');
        this._el = container;
        this._client = client;
        this._control = null;

        this._monaco = null;
        this._editor = null;
        this._content = '';
        this._isReadOnly = false;
        this._theme = 'lean-dark';
        this._guard = false;

        this._initialize();

        this._logger.debug('ctor finished');
    }

    LeanEditorWidget.prototype._initialize = function () {
        this._el.addClass(WIDGET_CLASS);

        this._editorEl = document.createElement('div');
        this._editorEl.className = 'lean-editor-monaco';
        this._el.append(this._editorEl);

        this._loadMonaco();
    };

    LeanEditorWidget.prototype._loadMonaco = function () {
        var self = this;

        require(['vs/editor/editor.main'], function (monaco) {
            self._monaco = monaco;
            self._initializeEditor();
        }, function (err) {
            self._logger.error('Failed to load Monaco:', err);
        });
    };

    LeanEditorWidget.prototype._initializeEditor = function () {
        var self = this;

        this._registerConstraintLanguage();

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

        this._editor.addCommand(this._monaco.KeyMod.CtrlCmd | this._monaco.KeyCode.KeyS, function () {
            self.saveContent();
        });

        this._applyTheme(this._theme);
        this._updateLayout();

        this._logger.debug('Monaco editor initialized');
    };

    LeanEditorWidget.prototype._registerConstraintLanguage = function () {
        var monaco = this._monaco;

        if (monaco.languages.getLanguages().some(function (lang) { return lang.id === LANGUAGE_ID; })) {
            return;
        }

        monaco.languages.register({ id: LANGUAGE_ID });

        monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
            defaultToken: '',
            tokenPostfix: '.constraint',
            keywords: [
                'constraintset', 'constraint', 'for', 'define',
                'forall', 'exists', 'in', 'where',
                'implies', 'and', 'or', 'not',
                'true', 'false', 'null'
            ],
            functions: [
                'count', 'isEmpty', 'all', 'any', 'unique',
                'reachableVia', 'reachableBy', 'connected', 'pointingTo',
                'children', 'parent', 'siblings'
            ],
            operators: ['==', '!=', '<=', '>=', '<', '>', '->', '=>'],
            symbols: /[=><!~?:&|+\-*\/\^%]+/,
            tokenizer: {
                root: [
                    [/\/\/.*$/, 'comment'],
                    [/constraintset/, 'keyword'],
                    [/constraint/, 'keyword'],
                    [/\[(?:error|warning|info)\]/, 'keyword'],
                    [/[a-z_$][\w$]*/, {
                        cases: {
                            '@keywords': 'keyword',
                            '@functions': 'keyword.tactic',
                            '@default': 'identifier'
                        }
                    }],
                    [/[A-Z][\w$]*/, 'type'],
                    [/[ \t\r\n]+/, 'white'],
                    [/[{}()\[\]]/, '@brackets'],
                    [/@symbols/, {
                        cases: {
                            '@operators': 'operator',
                            '@default': ''
                        }
                    }],
                    [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
                    [/\d+/, 'number'],
                    [/"([^"\\]|\\.)*$/, 'string.invalid'],
                    [/"/, 'string', '@string']
                ],
                string: [
                    [/[^\\"]+/, 'string'],
                    [/\\./, 'string.escape'],
                    [/"/, 'string', '@pop']
                ]
            }
        });

        monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
            comments: { lineComment: '//' },
            brackets: [['{', '}'], ['[', ']'], ['(', ')']],
            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' }
            ]
        });

        monaco.editor.defineTheme('lean-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: 'C586C0' },
                { token: 'keyword.tactic', foreground: 'DCDCAA' },
                { token: 'type', foreground: '4EC9B0' },
                { token: 'identifier', foreground: '9CDCFE' },
                { token: 'number', foreground: 'B5CEA8' },
                { token: 'string', foreground: 'CE9178' },
                { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
                { token: 'operator', foreground: 'D4D4D4' }
            ],
            colors: {
                'editor.background': '#1E1E1E',
                'editor.foreground': '#D4D4D4',
                'editorLineNumber.foreground': '#858585',
                'editorCursor.foreground': '#AEAFAD'
            }
        });

        monaco.editor.defineTheme('lean-light', {
            base: 'vs',
            inherit: true,
            rules: [
                { token: 'keyword', foreground: 'AF00DB' },
                { token: 'keyword.tactic', foreground: '795E26' },
                { token: 'type', foreground: '267F99' },
                { token: 'identifier', foreground: '001080' },
                { token: 'number', foreground: '098658' },
                { token: 'string', foreground: 'A31515' },
                { token: 'comment', foreground: '008000', fontStyle: 'italic' },
                { token: 'operator', foreground: '000000' }
            ],
            colors: {
                'editor.background': '#FFFFFF',
                'editor.foreground': '#000000'
            }
        });
    };

    LeanEditorWidget.prototype.toggleTheme = function () {
        return this._applyTheme(this._theme === 'lean-dark' ? 'lean-light' : 'lean-dark');
    };

    LeanEditorWidget.prototype._applyTheme = function (theme) {
        var dark = theme !== 'lean-light';
        var background = dark ? '#1e1e1e' : '#ffffff';

        this._theme = dark ? 'lean-dark' : 'lean-light';
        if (this._monaco) {
            this._monaco.editor.setTheme(this._theme);
        }
        this._el.css('background-color', background);
        this._el.closest('.constraint-manager-panel').css('background-color', background);
        return this._theme;
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
            if (this._editor.getValue() !== this._content) {
                this._guard = true;
                this._editor.setValue(this._content);
                this._guard = false;
            }
        }
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
            this._logger.error('No control connected');
            return;
        }

        if (this._isReadOnly) {
            this._logger.warn('Read-only mode');
            return;
        }

        this._control.saveContent(this.getContent())
            .then(function () {
                self._logger.debug('Saved');
            })
            .catch(function (err) {
                self._logger.error('Save failed:', err);
            });
    };

    LeanEditorWidget.prototype.setReadOnly = function (isReadOnly) {
        this._isReadOnly = isReadOnly;

        if (this._editor) {
            this._editor.updateOptions({ readOnly: isReadOnly });
        }
    };

    LeanEditorWidget.prototype.onWidgetContainerResize = function (width, height) {
        this._logger.debug('Widget resizing:', width, height);
        if (this._editor && width > 0 && height > 0) {
            this._editorEl.style.width = width + 'px';
            this._editorEl.style.height = height + 'px';
            this._editor.layout({ width: width, height: height });
        }
    };

    LeanEditorWidget.prototype.onActivate = function () {
        this._updateLayout();
    };

    LeanEditorWidget.prototype.onDeactivate = function () {
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
