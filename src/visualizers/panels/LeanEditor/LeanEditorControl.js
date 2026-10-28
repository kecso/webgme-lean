/*globals define, WebGMEGlobal*/
/**
 * Constraint manager control.
 *
 * Reads and writes the constraint dialect on the project root.
 * The generated Lean program is not loaded into the editor.
 */

define([
    'js/Constants',
    'js/Utils/GMEConcepts',
    'js/NodePropertyNames',
    'webgme-lean/constraintCheck'
], function (
    CONSTANTS,
    GMEConcepts,
    nodePropertyNames,
    constraintCheck
) {
    'use strict';

    var REGISTRY_KEY = 'constraints';
    var TREE_DEPTH = 40;

    function LeanEditorControl(options) {
        this._logger = options.logger.fork('Control');
        this._client = options.client;
        this._widget = options.widget;

        this._currentNodeId = null;
        this._rootNodeId = null;
        this._scope = constraintCheck.DEFAULT_SCOPE;
        this._territoryId = null;
        this._patterns = {};

        this._logger.debug('ctor finished');
    }

    LeanEditorControl.prototype.selectedObjectChanged = function (nodeId) {
        var self = this;

        this._logger.debug('selectedObjectChanged:', nodeId);

        if (typeof nodeId !== 'string') {
            return;
        }

        this._currentNodeId = nodeId;

        if (this._territoryId) {
            return;
        }

        // The project root id is the empty string. This visualizer only reads that node.
        this._rootNodeId = '';
        this._territoryId = this._client.addUI(this, function (events) {
            self._eventCallback(events);
        }, 'LeanEditor_' + Date.now());

        this._patterns = {};
        this._patterns[this._rootNodeId] = { children: TREE_DEPTH };

        this._client.updateTerritory(this._territoryId, this._patterns);
    };

    LeanEditorControl.prototype._eventCallback = function (events) {
        var i = events ? events.length : 0;

        this._logger.debug('_eventCallback \'' + i + '\' items');

        for (i = 0; i < events.length; i++) {
            if (events[i].etype === 'load' || events[i].etype === 'update') {
                if (events[i].eid === this._rootNodeId) {
                    this._refresh();
                    break;
                }
            }
        }
    };

    LeanEditorControl.prototype._refresh = function () {
        var rootNode = this._client.getNode(this._rootNodeId);
        if (!rootNode) {
            return;
        }

        var stored = constraintCheck.readStored(rootNode.getRegistry(REGISTRY_KEY));
        this._scope = stored.scope || constraintCheck.DEFAULT_SCOPE;
        this._widget.setContent(constraintCheck.ensureHeader(stored.text, this._scope));
        this._syncScopeControl();

        this._logger.debug('Loaded constraints, length:', stored.text.length, 'scope:', stored.scope);
    };

    LeanEditorControl.prototype.saveContent = function (text) {
        var next;
        this._scope = this._scope || constraintCheck.DEFAULT_SCOPE;
        next = constraintCheck.ensureHeader(text, this._scope);
        if (next !== text) {
            this._widget.setContent(next);
        }
        return this._persist(next, this._scope);
    };

    LeanEditorControl.prototype._persist = function (text, scope) {
        var self = this;

        if (typeof this._rootNodeId !== 'string') {
            this._logger.error('No root node to save to');
            return Promise.reject(new Error('No root node'));
        }

        return new Promise(function (resolve, reject) {
            try {
                self._client.startTransaction('Update constraints');
                self._client.setRegistry(
                    self._rootNodeId,
                    REGISTRY_KEY,
                    constraintCheck.writeStored(text, scope)
                );
                self._client.completeTransaction('Updated constraints');
                self._logger.debug('Saved constraints, scope:', scope);
                resolve();
            } catch (err) {
                self._logger.error('Failed to save:', err);
                reject(err);
            }
        });
    };

    LeanEditorControl.prototype.getContent = function () {
        if (typeof this._rootNodeId !== 'string') {
            return '';
        }

        var rootNode = this._client.getNode(this._rootNodeId);
        if (!rootNode) {
            return '';
        }

        return constraintCheck.readStored(rootNode.getRegistry(REGISTRY_KEY)).text;
    };

    LeanEditorControl.prototype._stateActiveObjectChanged = function (model, activeObjectId) {
        if (this._currentNodeId === activeObjectId) {
            return;
        }
        this.selectedObjectChanged(activeObjectId);
    };

    LeanEditorControl.prototype.onActivate = function () {
        this._attachClientEventListeners();
        this._displayToolbarItems();
        this._setExplainEnabled(this._widget.isCursorInConstraint());
        this._startDescribeWatch();

        if (typeof this._currentNodeId === 'string') {
            var nodeId = this._currentNodeId;
            this._currentNodeId = null;
            WebGMEGlobal.State.registerActiveObject(nodeId, { suppressVisualizerFromNode: true });
        }
    };

    LeanEditorControl.prototype.onDeactivate = function () {
        this._stopDescribeWatch();
        this._widget.hideCheatSheet();
        this._setCheatSheetButton(false);
        this._detachClientEventListeners();
        this._hideToolbarItems();
    };

    LeanEditorControl.prototype._attachClientEventListeners = function () {
        this._detachClientEventListeners();
        WebGMEGlobal.State.on('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged, this);
    };

    LeanEditorControl.prototype._detachClientEventListeners = function () {
        WebGMEGlobal.State.off('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged);
    };

    LeanEditorControl.prototype._displayToolbarItems = function () {
        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].show();
            }
        } else {
            this._initializeToolbar();
        }
    };

    LeanEditorControl.prototype._hideToolbarItems = function () {
        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].hide();
            }
        }
    };

    LeanEditorControl.prototype._removeToolbarItems = function () {
        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].destroy();
            }
        }
    };

    LeanEditorControl.prototype._initializeToolbar = function () {
        var self = this;
        var toolBar = WebGMEGlobal.Toolbar;

        this._toolbarItems = [];

        function quiet(button) {
            var link = button && button.el && button.el.find('a');
            if (!link || !link.length) {
                return;
            }
            link.addClass('lean-quiet-btn');
            link.removeAttr('href');
            link.on('mousedown', function (event) {
                event.preventDefault();
            });
        }

        this._toolbarItems.push(toolBar.addSeparator());

        this.$btnScope = toolBar.addDropDownButton({
            title: 'Scope concept',
            icon: 'glyphicon glyphicon-tag',
            left: true,
            text: 'Scope'
        });
        this._toolbarItems.push(this.$btnScope);
        quiet(this.$btnScope);

        this.$btnSave = toolBar.addButton({
            title: 'Save the constraints on the project root',
            icon: 'glyphicon glyphicon-floppy-disk',
            clickFn: function () {
                self._widget.saveContent();
            }
        });
        this._toolbarItems.push(this.$btnSave);
        quiet(this.$btnSave);

        this.$btnTheme = toolBar.addButton({
            title: 'Switch the editor to light mode',
            icon: 'glyphicon glyphicon-adjust',
            clickFn: function () {
                var theme = self._widget.toggleTheme();
                var next = theme === 'lean-dark'
                    ? 'Switch the editor to light mode'
                    : 'Switch the editor to dark mode';
                self.$btnTheme.el.find('a').attr('title', next);
            }
        });
        this._toolbarItems.push(this.$btnTheme);
        quiet(this.$btnTheme);

        this.$btnSheet = toolBar.addButton({
            title: 'Show the constraint cheat sheet',
            icon: 'glyphicon glyphicon-list-alt',
            clickFn: function () {
                self._toggleCheatSheet();
            }
        });
        this._toolbarItems.push(this.$btnSheet);
        quiet(this.$btnSheet);
        this._widget.onCheatSheetToggle = function (open) {
            self._setCheatSheetButton(open);
        };

        this.$btnExplain = toolBar.addButton({
            title: 'Place the cursor in a constraint',
            icon: 'glyphicon glyphicon-info-sign',
            clickFn: function () {
                self._widget.explainAtCursor();
            }
        });
        this._toolbarItems.push(this.$btnExplain);
        quiet(this.$btnExplain);
        this.$btnExplain.enabled(false);

        this.$btnDescribe = toolBar.addButton({
            title: 'Checking the model server',
            icon: 'glyphicon glyphicon-comment',
            clickFn: function () {
                self._widget.openDescribePopup();
            }
        });
        this._toolbarItems.push(this.$btnDescribe);
        quiet(this.$btnDescribe);
        this.$btnDescribe.enabled(false);

        this.$btnValidate = toolBar.addButton({
            title: 'Check that the constraints are well formed',
            icon: 'glyphicon glyphicon-ok',
            clickFn: function () {
                self._openValidate();
            }
        });
        this._toolbarItems.push(this.$btnValidate);
        quiet(this.$btnValidate);

        this.$btnLean = toolBar.addButton({
            title: 'Check a model with Lean',
            icon: 'glyphicon glyphicon-play',
            clickFn: function () {
                self._openLean();
            }
        });
        this._toolbarItems.push(this.$btnLean);
        quiet(this.$btnLean);

        this._widget.onConstraintCursor = function (active) {
            self._setExplainEnabled(active);
        };
        this._setExplainEnabled(this._widget.isCursorInConstraint());
        this._refreshDescribe();
        this._syncScopeControl();

        this._toolbarInitialized = true;
    };

    LeanEditorControl.prototype._concepts = function () {
        var meta = this._client.getAllMetaNodes(true) || {};
        var list = [];
        Object.keys(meta).forEach(function (path) {
            var node = meta[path];
            var name = node && node.getAttribute('name');
            if (!name || name === 'FCO' || name === 'META') {
                return;
            }
            list.push({name: name, path: path});
        });
        list.sort(function (a, b) {
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
        return list;
    };

    LeanEditorControl.prototype._syncScopeControl = function () {
        var self = this;
        var concepts;
        if (!this.$btnScope) {
            return;
        }
        concepts = this._concepts();
        this.$btnScope.clear();
        this.$btnScope.addButton({
            text: 'ROOT',
            title: 'The whole project',
            data: {name: constraintCheck.DEFAULT_SCOPE},
            clickFn: function (data) {
                self._setScope(data.name);
            }
        });
        concepts.forEach(function (concept) {
            if (concept.name === constraintCheck.DEFAULT_SCOPE) {
                return;
            }
            self.$btnScope.addButton({
                text: concept.name,
                title: concept.path,
                data: {name: concept.name},
                clickFn: function (data) {
                    self._setScope(data.name);
                }
            });
        });
        this._scope = this._scope || constraintCheck.DEFAULT_SCOPE;
        this.$btnScope.dropDownText(this._scope);
        if (this.$btnValidate) {
            this.$btnValidate.enabled(true);
            this.$btnValidate.el.find('a').attr('title', 'Check that the constraints are well formed');
        }
        if (this.$btnLean) {
            this.$btnLean.enabled(true);
            this.$btnLean.el.find('a').attr('title', this._scope === constraintCheck.DEFAULT_SCOPE
                ? 'Check the project root with Lean'
                : 'Check a ' + this._scope + ' with Lean');
        }
    };

    LeanEditorControl.prototype._setScope = function (name) {
        var text;
        if (!name || name === this._scope) {
            this._syncScopeControl();
            return;
        }
        this._scope = name;
        text = constraintCheck.ensureHeader(this._widget.getContent(), name);
        this._widget.setContent(text);
        this._syncScopeControl();
        this._persist(text, name);
        if (this._widget.isCheatSheetOpen()) {
            this._widget.showCheatSheet(this._scope);
        }
    };

    LeanEditorControl.prototype._toggleCheatSheet = function () {
        var open = this._widget.toggleCheatSheet(this._scope);
        this._setCheatSheetButton(open);
    };

    LeanEditorControl.prototype._setCheatSheetButton = function (open) {
        if (!this.$btnSheet) {
            return;
        }
        this.$btnSheet.el.find('a').attr('title', open
            ? 'Hide the constraint cheat sheet'
            : 'Show the constraint cheat sheet');
    };

    LeanEditorControl.prototype._conceptByName = function (name) {
        var concepts = this._concepts();
        var i;
        for (i = 0; i < concepts.length; i += 1) {
            if (concepts[i].name === name) {
                return concepts[i];
            }
        }
        return null;
    };

    LeanEditorControl.prototype._instancesOf = function (conceptPath) {
        var found = [];
        var counts = {};
        var selfClient = this._client;

        function nodeName(node, id) {
            return node.getAttribute('name') || (id === '' ? 'ROOT' : id);
        }

        function containmentPath(node) {
            var names = [];
            var current = node;
            var guard = 0;
            while (current && guard < 64) {
                var id = current.getId();
                if (id === '') {
                    if (!names.length) {
                        names.push(nodeName(current, id));
                    }
                    break;
                }
                names.unshift(nodeName(current, id));
                current = selfClient.getNode(current.getParentId());
                guard += 1;
            }
            return '/' + names.join('/');
        }

        function walk(id) {
            var node = selfClient.getNode(id);
            if (!node) {
                return;
            }
            if (!node.isMetaNode() && node.getMetaTypeId() === conceptPath) {
                found.push({
                    id: id,
                    name: nodeName(node, id),
                    path: containmentPath(node)
                });
            }
            (node.getChildrenIds() || []).forEach(walk);
        }

        walk('');
        found.forEach(function (item) {
            counts[item.path] = (counts[item.path] || 0) + 1;
        });
        found.forEach(function (item) {
            var path = item.path;
            if (counts[item.path] > 1) {
                path = path + ' [' + (item.id || '/') + ']';
            }
            item.label = item.name + ' (' + path + ')';
        });
        found.sort(function (a, b) {
            return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
        });
        return found;
    };

    LeanEditorControl.prototype._openLean = function () {
        var self = this;
        var concept;
        var scope = this._scope || constraintCheck.DEFAULT_SCOPE;
        if (scope === constraintCheck.DEFAULT_SCOPE) {
            this._widget.showCheckResult('Check with Lean', this._runLean(''));
            return;
        }
        concept = this._conceptByName(scope);
        this._widget.openLeanDialog({
            scope: scope,
            instances: concept ? this._instancesOf(concept.path) : [],
            run: function (nodeId) {
                return self._runLean(nodeId);
            }
        });
    };

    LeanEditorControl.prototype._runLean = function (nodeId) {
        var self = this;
        var scope = this._scope || constraintCheck.DEFAULT_SCOPE;
        var text = constraintCheck.ensureHeader(this._widget.getContent(), scope);

        return this._persist(text, scope).catch(function () {
            return null;
        }).then(function () {
            return self._whenSynced();
        }).then(function () {
            return new Promise(function (resolve) {
                var context = self._client.getCurrentPluginContext('CheckWithLean', nodeId, []);
                context.pluginConfig = {text: text, scope: scope};
                self._client.runServerPlugin('CheckWithLean', context, function (err, result) {
                    var messages = result && result.messages || [];
                    var infos = messages.filter(function (message) {
                        return (message.severity || 'info') === 'info';
                    });
                    if (err) {
                        resolve({
                            error: err.message || String(err),
                            messages: messages,
                            artifacts: result && result.artifacts || [],
                            successText: 'Lean accepted the model.'
                        });
                        return;
                    }
                    resolve({
                        error: '',
                        messages: messages,
                        artifacts: result && result.artifacts || [],
                        successText: infos.map(function (message) {
                            return message.message;
                        }).join('\n') || 'Lean accepted the model.'
                    });
                });
            });
        });
    };

    LeanEditorControl.prototype._openValidate = function () {
        this._widget.showCheckResult('Validate', this._runValidate());
    };

    LeanEditorControl.prototype._runValidate = function () {
        var self = this;
        var scope = this._scope || constraintCheck.DEFAULT_SCOPE;
        var text = constraintCheck.ensureHeader(this._widget.getContent(), scope);

        return this._persist(text, scope).catch(function () {
            return null;
        }).then(function () {
            return self._whenSynced();
        }).then(function () {
            return new Promise(function (resolve) {
                var context = self._client.getCurrentPluginContext('ValidateConstraints', '', []);
                context.pluginConfig = {text: text, scope: scope};
                self._client.runServerPlugin('ValidateConstraints', context, function (err, result) {
                    if (err) {
                        resolve({
                            error: err.message || String(err),
                            messages: result && result.messages || []
                        });
                        return;
                    }
                    resolve({
                        error: '',
                        messages: result && result.messages || []
                    });
                });
            });
        });
    };

    LeanEditorControl.prototype._whenSynced = function () {
        var self = this;
        return new Promise(function (resolve) {
            var tries = 0;
            (function tick() {
                var status = self._client.getBranchStatus();
                if (!status || status === 'SYNC' || tries > 25) {
                    resolve();
                    return;
                }
                tries += 1;
                setTimeout(tick, 200);
            }());
        });
    };

    LeanEditorControl.prototype._setExplainEnabled = function (active) {
        if (!this.$btnExplain) {
            return;
        }
        this.$btnExplain.enabled(!!active);
        this.$btnExplain.el.find('a').attr('title', active
            ? 'Explain the constraint at the cursor'
            : 'Place the cursor in a constraint');
    };

    LeanEditorControl.prototype._refreshDescribe = function () {
        var self = this;
        if (!this.$btnDescribe) {
            return;
        }
        fetch('/leanllm/status')
            .then(function (response) { return response.json(); })
            .then(function (body) {
                var ok = !!(body && body.ok);
                var title = ok
                    ? 'Write a constraint from a description'
                    : ((body && body.reason) || 'The model server is not available');
                self.$btnDescribe.enabled(ok);
                self.$btnDescribe.el.find('a').attr('title', title);
            })
            .catch(function () {
                self.$btnDescribe.enabled(false);
                self.$btnDescribe.el.find('a').attr('title', 'The model check failed');
            });
    };

    LeanEditorControl.prototype._startDescribeWatch = function () {
        var self = this;
        this._stopDescribeWatch();
        this._refreshDescribe();
        this._describeTimer = setInterval(function () {
            self._refreshDescribe();
        }, 10000);
    };

    LeanEditorControl.prototype._stopDescribeWatch = function () {
        if (this._describeTimer) {
            clearInterval(this._describeTimer);
            this._describeTimer = null;
        }
    };

    LeanEditorControl.prototype.destroy = function () {
        this._stopDescribeWatch();
        this._detachClientEventListeners();
        this._removeToolbarItems();

        if (this._territoryId) {
            this._client.removeUI(this._territoryId);
        }
    };

    return LeanEditorControl;
});
