/*globals define, require*/
/**
 * Constraint manager editor.
 *
 * The text in the panel is the constraint dialect stored on the project root.
 * Lean is produced later, from this text and the metamodel, and is not shown here.
 */

define([
    'css!./styles/LeanEditorWidget.css',
    'webgme-lean/metaLean'
], function (
    _css,
    metaLean
) {
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

    LeanEditorWidget.prototype._constraintAtCursor = function () {
        var model;
        var selection;
        var selected;
        var line;
        var start;
        var end;
        var count;

        if (!this._editor) {
            return '';
        }
        model = this._editor.getModel();
        selection = this._editor.getSelection();
        if (!model || !selection) {
            return '';
        }
        selected = model.getValueInRange(selection).trim();
        if (selected) {
            return selected;
        }

        line = selection.startLineNumber;
        start = line;
        while (start > 1 && !/^\s*constraint\b/.test(model.getLineContent(start))) {
            start -= 1;
        }
        if (!/^\s*constraint\b/.test(model.getLineContent(start))) {
            return model.getLineContent(line).trim();
        }
        end = start;
        count = model.getLineCount();
        while (end < count) {
            var next = model.getLineContent(end + 1);
            if (/^\s*(constraint|constraintset|define)\b/.test(next)) {
                break;
            }
            end += 1;
        }
        return model.getValueInRange(new this._monaco.Range(
            start, 1, end, model.getLineMaxColumn(end)
        )).trim();
    };

    LeanEditorWidget.prototype._ensureDialog = function () {
        var self = this;
        if (this._dialog) {
            return;
        }
        this._dialog = document.createElement('div');
        this._dialog.className = 'lean-nl-dialog';
        this._dialog.innerHTML = '' +
            '<div class="lean-nl-title"><span class="lean-nl-heading"></span>' +
            '<button type="button" class="lean-nl-close" title="Close">&times;</button></div>' +
            '<div class="lean-nl-body"></div>';
        this._dialog.querySelector('.lean-nl-close').addEventListener('click', function () {
            self._dialog.style.display = 'none';
        });
        this._el.append(this._dialog);
    };

    LeanEditorWidget.prototype._showDialog = function (title, fill) {
        this._ensureDialog();
        this._dialog.querySelector('.lean-nl-heading').textContent = title;
        var body = this._dialog.querySelector('.lean-nl-body');
        body.innerHTML = '';
        fill(body);
        this._dialog.style.display = 'flex';
    };

    LeanEditorWidget.prototype._postJson = function (path, payload) {
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (response) {
            return response.json().then(function (body) {
                return { ok: response.ok, status: response.status, body: body };
            });
        });
    };

    LeanEditorWidget.prototype.explainAtCursor = function () {
        var self = this;
        var text = this._constraintAtCursor();

        this._showDialog('Explain', function (body) {
            if (!text) {
                body.textContent = 'Place the cursor inside a constraint, or select the text to explain.';
                return;
            }
            body.textContent = 'Reading the constraint…';
            self._postJson('/leanllm/explain', { constraint: text }).then(function (result) {
                body.innerHTML = '';
                if (!result.ok || !result.body || result.body.success === false) {
                    var error = document.createElement('div');
                    error.className = 'lean-nl-error';
                    error.textContent = (result.body && (result.body.error || (result.body.validationErrors || []).join(' '))) ||
                        'Could not explain that constraint.';
                    body.appendChild(error);
                    return;
                }
                var summary = document.createElement('p');
                var summaryText = result.body.summary || result.body.explanation || '';
                var explanation = result.body.explanation || '';
                summary.textContent = summaryText;
                body.appendChild(summary);
                if (explanation.replace(/\.$/, '') !== summaryText.replace(/\.$/, '')) {
                    var more = document.createElement('p');
                    more.textContent = result.body.explanation;
                    body.appendChild(more);
                }
            }).catch(function (err) {
                body.innerHTML = '';
                var error = document.createElement('div');
                error.className = 'lean-nl-error';
                error.textContent = err.message || String(err);
                body.appendChild(error);
            });
        });
    };

    LeanEditorWidget.prototype.openDescribePopup = function () {
        var self = this;

        this._showDialog('Describe a constraint', function (body) {
            var hint = document.createElement('p');
            hint.textContent = 'Describe the constraint in ordinary language. The result is inserted at the cursor.';
            var input = document.createElement('textarea');
            input.placeholder = 'There is exactly one Init.';
            var actions = document.createElement('div');
            actions.className = 'lean-nl-actions';
            var generate = document.createElement('button');
            generate.type = 'button';
            generate.className = 'btn btn-xs btn-primary';
            generate.textContent = 'Generate';
            var status = document.createElement('div');
            actions.appendChild(generate);
            body.appendChild(hint);
            body.appendChild(input);
            body.appendChild(actions);
            body.appendChild(status);

            generate.addEventListener('click', function () {
                var description = input.value.trim();
                var vocab;
                if (!description) {
                    status.textContent = 'Write a description first.';
                    return;
                }
                vocab = metaLean.vocabulary(self._client);
                status.textContent = 'Generating…';
                self._postJson('/leanllm/translate', {
                    description: description,
                    existing: self.getContent(),
                    rootType: vocab.rootType,
                    types: vocab.types
                }).then(function (result) {
                    status.innerHTML = '';
                    if (!result.body || !result.body.constraint) {
                        var error = document.createElement('div');
                        error.className = 'lean-nl-error';
                        error.textContent = (result.body && (result.body.error ||
                            (result.body.validationErrors || []).join(' '))) ||
                            'No constraint was returned.';
                        status.appendChild(error);
                        return;
                    }
                    var preview = document.createElement('pre');
                    preview.textContent = result.body.constraint;
                    var note = document.createElement('p');
                    note.textContent = result.body.explanation || '';
                    var insert = document.createElement('button');
                    insert.type = 'button';
                    insert.className = 'btn btn-xs btn-success';
                    insert.textContent = 'Insert';
                    insert.addEventListener('click', function () {
                        self._insertText(result.body.constraint);
                        self._dialog.style.display = 'none';
                    });
                    status.appendChild(preview);
                    if (note.textContent) {
                        status.appendChild(note);
                    }
                    if (result.body.validationErrors && result.body.validationErrors.length) {
                        var warn = document.createElement('div');
                        warn.className = 'lean-nl-error';
                        warn.textContent = result.body.validationErrors.join(' ');
                        status.appendChild(warn);
                    }
                    status.appendChild(insert);
                }).catch(function (err) {
                    status.innerHTML = '';
                    var error = document.createElement('div');
                    error.className = 'lean-nl-error';
                    error.textContent = err.message || String(err);
                    status.appendChild(error);
                });
            });
        });
    };

    LeanEditorWidget.prototype._insertText = function (text) {
        var model;
        var position;
        var prefix;

        if (!this._editor || !text) {
            return;
        }
        model = this._editor.getModel();
        position = this._editor.getPosition();
        prefix = '';
        if (model.getValue()) {
            prefix = model.getEOL() + model.getEOL();
        }
        this._editor.executeEdits('describe', [{
            range: new this._monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: prefix + text + model.getEOL()
        }]);
    };

    return LeanEditorWidget;
});
