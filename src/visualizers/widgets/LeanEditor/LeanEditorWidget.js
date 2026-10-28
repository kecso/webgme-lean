/*globals define, require, $*/
/**
 * Constraint manager editor.
 *
 * The text in the panel is the constraint dialect stored on the project root.
 * Lean is produced later, from this text and the metamodel, and is not shown here.
 */

define([
    'css!./styles/LeanEditorWidget.css',
    'blob/BlobClient',
    'webgme-lean/metaLean'
], function (
    _css,
    BlobClient,
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
            minimap: { enabled: false },
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

        this._editor.onDidChangeCursorPosition(function () {
            self._notifyConstraintCursor();
        });
        this._editor.onDidChangeModelContent(function (event) {
            self._keepHeader(event);
            self._notifyConstraintCursor();
        });
        this._editor.onKeyDown(function (event) {
            self._blockHeaderEdit(event);
        });
        this._notifyConstraintCursor();
        this._markHeader();

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
        var position;
        var model;
        var line;
        var column;

        this._content = content || '';
        this._headerLine = this._headerFrom(this._content);

        if (this._editor) {
            if (this._editor.getValue() !== this._content) {
                position = this._editor.getPosition();
                this._guard = true;
                this._editor.setValue(this._content);
                this._guard = false;
                if (position && position.lineNumber > 1) {
                    model = this._editor.getModel();
                    line = Math.min(position.lineNumber, model.getLineCount());
                    column = Math.min(position.column, model.getLineMaxColumn(line));
                    this._editor.setPosition({lineNumber: line, column: column});
                }
            }
            this._markHeader();
        }
    };

    LeanEditorWidget.prototype._headerFrom = function (text) {
        var line = String(text || '').split(/\r?\n/, 1)[0];
        return /^\s*constraintset\s+\S+\s+for\s+\S+/.test(line) ? line : '';
    };

    LeanEditorWidget.prototype._markHeader = function () {
        var range;
        var options;
        if (!this._editor || !this._monaco || !this._headerLine) {
            return;
        }
        range = new this._monaco.Range(1, 1, 1, 1);
        options = {
            description: 'constraintset-header',
            isWholeLine: true,
            className: 'lean-readonly-line',
            marginClassName: 'lean-readonly-margin',
            stickiness: this._monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            hoverMessage: {value: 'This line follows the scope. Change it from the scope menu.'}
        };
        if (!this._headerDecorations) {
            this._headerDecorations = this._editor.createDecorationsCollection([
                {range: range, options: options}
            ]);
        } else {
            this._headerDecorations.set([{range: range, options: options}]);
        }
    };

    LeanEditorWidget.prototype._changeTouchesHeader = function (event) {
        return (event.changes || []).some(function (change) {
            return change.range.startLineNumber === 1;
        });
    };

    LeanEditorWidget.prototype._keepHeader = function (event) {
        if (this._guard || this._headerGuard || !this._headerLine || !event || event.isFlush) {
            return;
        }
        if (!this._changeTouchesHeader(event)) {
            return;
        }
        if (event.isUndoing || event.isRedoing) {
            this._repairHeader();
            return;
        }
        this._headerGuard = true;
        this._editor.trigger('constraintset-header', 'undo', null);
        this._headerGuard = false;
        if (this._editor.getModel().getLineContent(1) !== this._headerLine) {
            this._repairHeader();
        } else {
            this._markHeader();
        }
    };

    LeanEditorWidget.prototype._repairHeader = function () {
        var model = this._editor.getModel();
        var header = this._headerLine;
        var first = model.getLineContent(1);
        var eol = model.getEOL();
        var rest = '';
        var range;
        var text;

        if (!header || first === header) {
            this._markHeader();
            return;
        }
        if (/^\s*constraintset\b/.test(first)) {
            if (first.indexOf(header) === 0) {
                rest = first.slice(header.length);
            }
            range = new this._monaco.Range(1, 1, 1, model.getLineMaxColumn(1));
            text = header + (rest ? eol + rest : '');
        } else {
            range = new this._monaco.Range(1, 1, 1, 1);
            text = header + eol;
        }
        this._guard = true;
        model.applyEdits([{range: range, text: text}]);
        this._guard = false;
        this._markHeader();
    };

    LeanEditorWidget.prototype._blockHeaderEdit = function (event) {
        var selection;
        var start;
        var code;
        var KeyCode;
        if (!this._editor || !this._headerLine) {
            return;
        }
        selection = this._editor.getSelection();
        if (!selection) {
            return;
        }
        start = selection.getStartPosition();
        code = event.keyCode;
        KeyCode = this._monaco.KeyCode;
        if (start.lineNumber !== 1) {
            if (code === KeyCode.Backspace &&
                    selection.isEmpty() &&
                    start.lineNumber === 2 &&
                    start.column === 1) {
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) {
            if (code === KeyCode.KeyV || code === KeyCode.KeyX) {
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        if (code === KeyCode.LeftArrow || code === KeyCode.RightArrow ||
                code === KeyCode.UpArrow || code === KeyCode.DownArrow ||
                code === KeyCode.PageUp || code === KeyCode.PageDown ||
                code === KeyCode.Home || code === KeyCode.End ||
                code === KeyCode.Escape) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
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

    function cheatElement(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = text;
        }
        return node;
    }

    function typesByName(types) {
        var index = {};
        (types || []).forEach(function (type) {
            if (type && type.name) {
                index[type.name] = type;
            }
        });
        return index;
    }

    function typeChain(index, type) {
        var chain = [];
        var seen = {};
        var current = type;
        while (current && !seen[current.name]) {
            seen[current.name] = true;
            chain.push(current);
            current = current.baseType ? index[current.baseType] : null;
        }
        return chain;
    }

    function inheritedMembers(chain, field) {
        var seen = {};
        var members = [];
        chain.forEach(function (type) {
            (type[field] || []).forEach(function (item) {
                if (!item || !item.name || seen[item.name]) {
                    return;
                }
                seen[item.name] = true;
                members.push({item: item, owner: type.name});
            });
        });
        return members;
    }

    function sampleConcept(index, concepts) {
        var best = concepts.length ? concepts[0] : null;
        concepts.forEach(function (name) {
            var type = index[name];
            var bestType = index[best];
            var score = (type.containments || []).length * 10 + (type.pointers || []).length;
            var bestScore = (bestType.containments || []).length * 10 + (bestType.pointers || []).length;
            if (score > bestScore) {
                best = name;
            }
        });
        return best ? index[best] : null;
    }

    function exampleVariable(typeName) {
        var letter = (typeName || 'x').charAt(0).toLowerCase();
        return /[a-z]/.test(letter) ? letter : 'x';
    }

    function fillCheatSheet(body, vocabulary, scope) {
        var index = typesByName(vocabulary && vocabulary.types);
        var concepts = Object.keys(index).filter(function (name) {
            return name !== 'FCO' && name !== 'META';
        }).sort();
        var sample = sampleConcept(index, concepts);
        var sampleVar = sample ? exampleVariable(sample.name) : 'x';
        var sampleChain = sample ? typeChain(index, sample) : [];
        var sampleAttrs = inheritedMembers(sampleChain, 'attributes');
        var samplePtrs = inheritedMembers(sampleChain, 'pointers');
        var intro = cheatElement('p');
        var shape = cheatElement('pre', 'lean-cheat-pre');
        var conceptsTitle = cheatElement('h3', null, 'Concepts');

        intro.textContent = scope === 'ROOT'
            ? 'Constraints in this set apply across the whole project.'
            : scope
                ? 'Constraints in this set apply inside one ' + scope + '.'
                : 'Choose a scope concept to say which model these constraints describe.';
        body.appendChild(intro);

        body.appendChild(cheatElement('h3', null, 'Shape'));
        shape.textContent = [
            scope ? 'constraintset Name for ' + scope : 'constraintset Name for ScopeType',
            '',
            'constraint Name [error]',
            sample
                ? 'forall ' + sampleVar + ' in ' + sample.name + ':'
                : 'forall x in Type:',
            sampleAttrs.length
                ? '  ' + sampleVar + '.' + sampleAttrs[0].item.name + ' != ""'
                : '  true'
        ].join('\n');
        body.appendChild(shape);
        body.appendChild(cheatElement('p', 'lean-cheat-meta',
            'Severity is error, warning, or info. exists asks for one match. where filters the matches.'));

        body.appendChild(cheatElement('h3', null, 'Navigation'));
        body.appendChild(cheatElement('pre', 'lean-cheat-pre', [
            'node.attribute',
            'node->pointer',
            'node[set]',
            'node.children',
            'node.parent',
            'node.siblings'
        ].join('\n')));

        body.appendChild(cheatElement('h3', null, 'Checks'));
        body.appendChild(cheatElement('pre', 'lean-cheat-pre', cheatPatterns(index, concepts, scope)));

        body.appendChild(conceptsTitle);
        if (!concepts.length) {
            body.appendChild(cheatElement('p', null, 'This project has no concepts yet.'));
            return;
        }
        concepts.forEach(function (name) {
            body.appendChild(renderConcept(index, index[name]));
        });
    }

    function cheatPatterns(index, concepts, scope) {
        var lines = [];
        var contained = null;
        var pointerOwner = null;
        concepts.forEach(function (name) {
            var type = index[name];
            (type.containments || []).forEach(function (child) {
                if (!contained && child.childType) {
                    contained = child.childType;
                }
            });
            if (!pointerOwner && type.pointers && type.pointers.length) {
                pointerOwner = type;
            }
        });
        if (contained) {
            lines.push('count(' + contained + ') == 1');
            lines.push('isEmpty(' + contained + ')');
        } else if (concepts.length) {
            lines.push('count(' + concepts[0] + ') == 1');
        }
        if (pointerOwner) {
            var variable = exampleVariable(pointerOwner.name);
            var pointer = pointerOwner.pointers[0];
            lines.push('forall ' + variable + ' in ' + pointerOwner.name + ':');
            lines.push('  ' + variable + '->' + pointer.name + ' != null');
            lines.push('pointingTo(' + variable + ', ' + pointerOwner.name + ', "' + pointer.name + '")');
        }
        if (concepts.length > 1) {
            lines.push('unique(' + concepts[0] + ', "name")');
        }
        if (!lines.length) {
            lines.push('count(Type) == 1');
        }
        if (scope === 'ROOT') {
            lines.unshift('// applies across the whole project');
        } else if (scope) {
            lines.unshift('// applies to one ' + scope);
        }
        return lines.join('\n');
    }

    function renderConcept(index, type) {
        var section = cheatElement('section');
        var chain = typeChain(index, type);
        var title = type.name + (type.isAbstract ? '  abstract' : '');
        var base = type.baseType && type.baseType !== 'FCO'
            ? 'extends ' + type.baseType
            : '';
        var attributes = inheritedMembers(chain, 'attributes');
        var pointers = inheritedMembers(chain, 'pointers');
        var sets = inheritedMembers(chain, 'sets');
        var lines = [];

        section.appendChild(cheatElement('h4', null, title));
        if (base) {
            section.appendChild(cheatElement('p', 'lean-cheat-meta', base));
        }
        attributes.forEach(function (entry) {
            var suffix = entry.owner === type.name ? '' : '  (from ' + entry.owner + ')';
            lines.push('.' + entry.item.name + ' : ' + (entry.item.type || 'string') + suffix);
        });
        pointers.forEach(function (entry) {
            var targets = (entry.item.targetTypes || []).join(', ');
            var suffix = entry.owner === type.name ? '' : '  (from ' + entry.owner + ')';
            lines.push('-> ' + entry.item.name + (targets ? ' : ' + targets : '') + suffix);
        });
        sets.forEach(function (entry) {
            var suffix = entry.owner === type.name ? '' : '  (from ' + entry.owner + ')';
            lines.push('[' + entry.item.name + ']' + suffix);
        });
        (type.containments || []).forEach(function (child) {
            lines.push('contains ' + child.childType);
        });
        if (lines.length) {
            section.appendChild(cheatElement('pre', 'lean-cheat-pre', lines.join('\n')));
        } else {
            section.appendChild(cheatElement('p', 'lean-cheat-meta', 'No attributes, pointers, or sets.'));
        }
        return section;
    }

    LeanEditorWidget.prototype.isCheatSheetOpen = function () {
        return !!(this._sheet && this._sheet.parentNode);
    };

    LeanEditorWidget.prototype.toggleCheatSheet = function (scope) {
        if (this.isCheatSheetOpen()) {
            this.hideCheatSheet();
            return false;
        }
        this.showCheatSheet(scope);
        return true;
    };

    LeanEditorWidget.prototype.showCheatSheet = function (scope) {
        var self = this;
        var body;
        var vocabulary = metaLean.vocabulary(this._client);
        if (!this._sheet) {
            this._sheet = document.createElement('aside');
            this._sheet.className = 'lean-cheat-sheet';
            this._sheet.innerHTML = '' +
                '<div class="lean-cheat-head">' +
                    '<button type="button" class="close" aria-label="Close">&times;</button>' +
                    '<div class="lean-cheat-title">Cheat sheet</div>' +
                '</div>' +
                '<div class="lean-cheat-body"></div>';
            this._sheet.querySelector('.close').addEventListener('click', function () {
                self.hideCheatSheet();
                if (typeof self.onCheatSheetToggle === 'function') {
                    self.onCheatSheetToggle(false);
                }
            });
            document.body.appendChild(this._sheet);
        }
        body = this._sheet.querySelector('.lean-cheat-body');
        body.innerHTML = '';
        fillCheatSheet(body, vocabulary, scope || '');
    };

    LeanEditorWidget.prototype.hideCheatSheet = function () {
        if (this._sheet && this._sheet.parentNode) {
            this._sheet.parentNode.removeChild(this._sheet);
        }
        this._sheet = null;
    };

    LeanEditorWidget.prototype.destroy = function () {
        this.hideCheatSheet();
        this._hideDialog();
        if (this._editor) {
            this._editor.dispose();
            this._editor = null;
        }
        this._el.empty();
    };

    LeanEditorWidget.prototype.isCursorInConstraint = function () {
        var model;
        var selection;
        var line;
        var text;

        if (!this._editor) {
            return false;
        }
        model = this._editor.getModel();
        selection = this._editor.getSelection();
        if (!model || !selection) {
            return false;
        }
        line = selection.startLineNumber;
        while (line > 1 && !/^\s*constraint\s+\w+/.test(model.getLineContent(line))) {
            text = model.getLineContent(line - 1);
            if (text.trim() === '' || /^\s*(constraintset|define)\b/.test(text)) {
                return false;
            }
            line -= 1;
        }
        return /^\s*constraint\s+\w+/.test(model.getLineContent(line));
    };

    LeanEditorWidget.prototype._notifyConstraintCursor = function () {
        if (typeof this.onConstraintCursor === 'function') {
            this.onConstraintCursor(this.isCursorInConstraint());
        }
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

    LeanEditorWidget.prototype._hideDialog = function () {
        if (this._dialog) {
            this._dialog.modal('hide');
        }
    };

    LeanEditorWidget.prototype._showDialog = function (title, fill) {
        var self = this;
        var body;

        this._hideDialog();
        this._dialog = $(
            '<div class="lean-nl-dialog modal fade" tabindex="-1" role="dialog">' +
                '<div class="modal-dialog">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<button type="button" class="close" data-dismiss="modal">&times;</button>' +
                            '<h4 class="modal-title"></h4>' +
                        '</div>' +
                        '<div class="modal-body"></div>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
        this._dialog.find('.modal-title').text(title);
        body = this._dialog.find('.modal-body').get(0);
        fill(body);
        this._dialog.on('hidden.bs.modal', function () {
            var dialog = $(this);
            dialog.remove();
            if (self._dialog && self._dialog[0] === dialog[0]) {
                self._dialog = null;
            }
        });
        this._dialog.modal({
            backdrop: 'static',
            keyboard: true,
            show: true
        });
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
                        self._hideDialog();
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

    LeanEditorWidget.prototype.openValidateDialog = function (options) {
        var self = this;

        this._showDialog('Validate', function (body) {
            var intro = document.createElement('p');
            var actions;
            var button;
            var status;

            intro.textContent = 'Check that these constraints parse and that their concepts, attributes, pointers, and sets are in the META.';
            body.appendChild(intro);

            actions = document.createElement('div');
            actions.className = 'lean-nl-actions';
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-primary';
            button.textContent = 'Validate';
            status = document.createElement('div');
            status.className = 'lean-nl-result';
            actions.appendChild(button);
            body.appendChild(actions);
            body.appendChild(status);

            button.addEventListener('click', function () {
                status.textContent = 'Checking…';
                button.disabled = true;
                options.run().then(function (result) {
                    button.disabled = false;
                    self._renderValidation(status, result);
                }).catch(function (err) {
                    button.disabled = false;
                    status.innerHTML = '';
                    var error = document.createElement('p');
                    error.className = 'lean-nl-error';
                    error.textContent = err.message || String(err);
                    status.appendChild(error);
                });
            });
        });
    };

    LeanEditorWidget.prototype.openLeanDialog = function (options) {
        var self = this;
        var scope = options.scope || 'model';
        var wholeProject = scope === 'ROOT';

        this._showDialog('Check with Lean', function (body) {
            var intro = document.createElement('p');
            var select;
            var actions;
            var button;
            var status;

            intro.textContent = wholeProject
                ? 'Run Lean on the project root.'
                : options.instances.length
                    ? 'Choose a ' + scope + ' to check with Lean.'
                    : 'There is no ' + scope + ' in the project.';
            body.appendChild(intro);
            if (!wholeProject && !options.instances.length) {
                return;
            }

            actions = document.createElement('div');
            actions.className = 'lean-nl-actions';
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-primary';
            button.textContent = 'Run Lean';
            status = document.createElement('div');
            status.className = 'lean-nl-result';
            actions.appendChild(button);
            if (!wholeProject) {
                select = document.createElement('select');
                select.className = 'form-control';
                var placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = 'Choose a model';
                select.appendChild(placeholder);
                options.instances.forEach(function (item, index) {
                    var option = document.createElement('option');
                    option.value = String(index);
                    option.textContent = item.label;
                    option.title = item.path || item.label;
                    select.appendChild(option);
                });
                body.appendChild(select);
            }
            body.appendChild(actions);
            body.appendChild(status);

            button.addEventListener('click', function () {
                var nodeId = '';
                if (!wholeProject) {
                    if (select.value === '') {
                        status.textContent = 'Choose a model first.';
                        return;
                    }
                    nodeId = options.instances[Number(select.value)].id;
                }
                status.textContent = 'Running Lean…';
                button.disabled = true;
                options.run(nodeId).then(function (result) {
                    button.disabled = false;
                    self._renderValidation(status, result);
                }).catch(function (err) {
                    button.disabled = false;
                    status.innerHTML = '';
                    var error = document.createElement('p');
                    error.className = 'lean-nl-error';
                    error.textContent = err.message || String(err);
                    status.appendChild(error);
                });
            });
        });
    };

    LeanEditorWidget.prototype._renderValidation = function (status, result) {
        var messages = (result && result.messages || []).filter(function (message) {
            var severity = message.severity || 'info';
            return severity === 'error' || severity === 'warning';
        });
        status.innerHTML = '';
        if (result && result.error && !messages.length) {
            var failure = document.createElement('p');
            failure.className = 'lean-nl-error';
            failure.textContent = result.error;
            status.appendChild(failure);
            this._renderRunRecord(status, result.artifacts);
            return;
        }
        if (!messages.length) {
            var fine = document.createElement('p');
            fine.className = 'lean-nl-ok';
            fine.textContent = result && result.successText || 'The constraints are well formed.';
            status.appendChild(fine);
            this._renderRunRecord(status, result && result.artifacts);
            return;
        }
        function addLine(message, className) {
            var line = document.createElement('p');
            line.className = className;
            line.textContent = message.message || '';
            status.appendChild(line);
        }
        messages.forEach(function (message) {
            var severity = message.severity || 'info';
            if (severity === 'error') {
                addLine(message, 'lean-nl-error');
            } else if (severity === 'warning') {
                addLine(message, 'lean-nl-warning');
            } else {
                addLine(message, 'lean-nl-ok');
            }
        });
        (result && result.messages || []).forEach(function (message) {
            if ((message.severity || 'info') === 'info') {
                addLine(message, 'lean-nl-ok');
            }
        });
        this._renderRunRecord(status, result && result.artifacts);
    };

    function recordText(content) {
        if (typeof content === 'string') {
            return content;
        }
        if (content && typeof content.byteLength === 'number') {
            return new TextDecoder('utf-8').decode(content);
        }
        return JSON.stringify(content, null, 2);
    }

    LeanEditorWidget.prototype._renderRunRecord = function (status, artifacts) {
        var hashes = artifacts || [];
        var blobClient;
        var section;
        var heading;
        if (!hashes.length) {
            return;
        }
        blobClient = new BlobClient({logger: this._logger.fork('BlobClient')});
        section = document.createElement('div');
        section.className = 'lean-run-record';
        heading = document.createElement('h4');
        heading.textContent = 'Run record';
        section.appendChild(heading);
        hashes.forEach(function (hash) {
            var download = document.createElement('a');
            download.href = blobClient.getDownloadURL(hash);
            download.target = '_blank';
            download.rel = 'noopener';
            download.textContent = 'Download the run record';
            section.appendChild(download);
            blobClient.getMetadata(hash).then(function (metadata) {
                var names = Object.keys(metadata.content || {});
                var order = { 'constraints.txt': 0, 'model.json': 1, 'model.lean': 2, 'lean.log': 3 };
                names.sort(function (a, b) {
                    var left = order[a] === undefined ? 10 : order[a];
                    var right = order[b] === undefined ? 10 : order[b];
                    return left - right || (a < b ? -1 : a > b ? 1 : 0);
                });
                if (metadata.name) {
                    download.textContent = 'Download ' + metadata.name;
                }
                names.forEach(function (name) {
                    var details = document.createElement('details');
                    var summary = document.createElement('summary');
                    var pre = document.createElement('pre');
                    var fileLink = document.createElement('a');
                    details.open = name === 'lean.log';
                    summary.textContent = name;
                    pre.className = 'lean-run-pre';
                    pre.textContent = 'Loading…';
                    fileLink.href = blobClient.getDownloadURL(hash, name);
                    fileLink.target = '_blank';
                    fileLink.rel = 'noopener';
                    fileLink.textContent = 'Download ' + name;
                    details.appendChild(summary);
                    details.appendChild(fileLink);
                    details.appendChild(pre);
                    section.appendChild(details);
                    blobClient.getObject(hash, function (err, content) {
                        pre.textContent = err ? (err.message || String(err)) : recordText(content);
                    }, name);
                });
            }).catch(function (err) {
                var problem = document.createElement('p');
                problem.className = 'lean-nl-error';
                problem.textContent = err.message || String(err);
                section.appendChild(problem);
            });
        });
        status.appendChild(section);
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
        if (!position || position.lineNumber < 2) {
            position = {lineNumber: Math.max(2, model.getLineCount()), column: 1};
        }
        prefix = '';
        if (model.getLineContent(position.lineNumber).trim()) {
            prefix = model.getEOL() + model.getEOL();
        }
        this._editor.executeEdits('describe', [{
            range: new this._monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: prefix + text + model.getEOL()
        }]);
    };

    return LeanEditorWidget;
});
