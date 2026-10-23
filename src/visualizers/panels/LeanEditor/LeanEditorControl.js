/*globals define, WebGMEGlobal*/
/**
 * LeanEditor Control
 *
 * WebGME control that manages communication between the Lean Editor widget
 * and the WebGME client. Handles reading/writing the 'lean' registry from
 * the project's Root node.
 */

define([
    'js/Constants',
    'js/Utils/GMEConcepts',
    'js/NodePropertyNames',
    'webgme-lean/leanDocument',
    'webgme-lean/metaLean'
], function (
    CONSTANTS,
    GMEConcepts,
    nodePropertyNames,
    leanDocument,
    metaLean
) {
    'use strict';

    var REGISTRY_KEY = 'lean';

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

        var doc = leanDocument.parse(rootNode.getRegistry(REGISTRY_KEY));

        if (!doc.fix) {
            try {
                doc.fix = metaLean.generateFix(this._client) || '';
            } catch (err) {
                this._logger.error('Could not prefill the generated Lean text', err);
            }
        }

        if (this._widget.setParts) {
            this._widget.setParts(doc.fix, doc.user);
        } else {
            this._widget.setContent(leanDocument.compose(doc.fix, doc.user));
        }

        this._logger.debug('Loaded lean content, fix length:', (doc.fix || '').length);
    };

    LeanEditorControl.prototype.saveContent = function (doc) {
        var self = this;
        var stored = leanDocument.serialize(doc || {fix: '', user: ''});

        if (typeof this._rootNodeId !== 'string') {
            this._logger.error('No root node to save to');
            return Promise.reject(new Error('No root node'));
        }

        return new Promise(function (resolve, reject) {
            try {
                self._client.startTransaction('Update lean registry');
                self._client.setRegistry(self._rootNodeId, REGISTRY_KEY, stored);
                self._client.completeTransaction('Updated lean registry');
                self._logger.debug('Saved lean content');
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
        var doc;
        if (!rootNode) {
            return '';
        }

        doc = leanDocument.parse(rootNode.getRegistry(REGISTRY_KEY));
        return leanDocument.compose(doc.fix, doc.user);
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
            title: 'Save the Lean text on the project root',
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
