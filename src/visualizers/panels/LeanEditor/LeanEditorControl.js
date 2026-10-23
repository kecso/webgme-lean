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
    'js/NodePropertyNames'
], function (
    CONSTANTS,
    GMEConcepts,
    nodePropertyNames
) {
    'use strict';

    var REGISTRY_KEY = 'constraints';

    function constraintText(raw) {
        if (typeof raw !== 'string' || raw === '') {
            return '';
        }
        var trimmed = raw.trim();
        if (trimmed.charAt(0) === '{') {
            try {
                var parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object' &&
                        (Object.prototype.hasOwnProperty.call(parsed, 'fix') ||
                            Object.prototype.hasOwnProperty.call(parsed, 'user'))) {
                    return '';
                }
            } catch (err) {
                return raw;
            }
        }
        return raw;
    }

    function LeanEditorControl(options) {
        this._logger = options.logger.fork('Control');
        this._client = options.client;
        this._widget = options.widget;

        this._currentNodeId = null;
        this._rootNodeId = null;
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
        this._patterns[this._rootNodeId] = { children: 0 };

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

        var text = constraintText(rootNode.getRegistry(REGISTRY_KEY));
        this._widget.setContent(text);

        this._logger.debug('Loaded constraints, length:', text.length);
    };

    LeanEditorControl.prototype.saveContent = function (text) {
        var self = this;
        var stored = typeof text === 'string' ? text : '';

        if (typeof this._rootNodeId !== 'string') {
            this._logger.error('No root node to save to');
            return Promise.reject(new Error('No root node'));
        }

        return new Promise(function (resolve, reject) {
            try {
                self._client.startTransaction('Update constraints');
                self._client.setRegistry(self._rootNodeId, REGISTRY_KEY, stored);
                self._client.completeTransaction('Updated constraints');
                self._logger.debug('Saved constraints');
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

        return constraintText(rootNode.getRegistry(REGISTRY_KEY));
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

        if (typeof this._currentNodeId === 'string') {
            var nodeId = this._currentNodeId;
            this._currentNodeId = null;
            WebGMEGlobal.State.registerActiveObject(nodeId, { suppressVisualizerFromNode: true });
        }
    };

    LeanEditorControl.prototype.onDeactivate = function () {
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

        this._toolbarItems.push(toolBar.addSeparator());

        this.$btnSave = toolBar.addButton({
            title: 'Save the constraints on the project root',
            icon: 'glyphicon glyphicon-floppy-disk',
            clickFn: function () {
                self._widget.saveContent();
            }
        });
        this._toolbarItems.push(this.$btnSave);

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

        this._toolbarInitialized = true;
    };

    LeanEditorControl.prototype.destroy = function () {
        this._detachClientEventListeners();
        this._removeToolbarItems();

        if (this._territoryId) {
            this._client.removeUI(this._territoryId);
        }
    };

    return LeanEditorControl;
});
