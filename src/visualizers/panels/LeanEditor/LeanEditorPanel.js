/*globals define, _, WebGMEGlobal*/
/**
 * LeanEditor Panel
 *
 * WebGME panel for the Lean Editor visualizer that provides a Monaco-based
 * editor for viewing and editing the 'lean' registry of the project Root node.
 */

define([
    'js/PanelBase/PanelBaseWithHeader',
    'js/PanelManager/IActivePanel',
    'widgets/LeanEditor/LeanEditorWidget',
    './LeanEditorControl'
], function (
    PanelBaseWithHeader,
    IActivePanel,
    LeanEditorWidget,
    LeanEditorControl
) {
    'use strict';

    function LeanEditorPanel(layoutManager, params) {
        var options = {};
        options[PanelBaseWithHeader.OPTIONS.LOGGER_INSTANCE_NAME] = 'LeanEditorPanel';
        options[PanelBaseWithHeader.OPTIONS.FLOATING_TITLE] = true;

        PanelBaseWithHeader.apply(this, [options, layoutManager]);

        this._client = params.client;

        this._initialize();

        this.logger.debug('ctor finished');
    }

    _.extend(LeanEditorPanel.prototype, PanelBaseWithHeader.prototype);
    _.extend(LeanEditorPanel.prototype, IActivePanel.prototype);

    LeanEditorPanel.prototype._initialize = function () {
        var self = this;

        this.setTitle('Lean Editor');

        this.widget = new LeanEditorWidget(this.logger, this.$el, this._client);

        this.widget.setTitle = function (title) {
            self.setTitle(title);
        };

        this.control = new LeanEditorControl({
            logger: this.logger,
            client: this._client,
            widget: this.widget
        });

        this.widget.setControl(this.control);

        this.onActivate();
    };

    LeanEditorPanel.prototype.onReadOnlyChanged = function (isReadOnly) {
        PanelBaseWithHeader.prototype.onReadOnlyChanged.call(this, isReadOnly);
        if (this.widget && typeof this.widget.setReadOnly === 'function') {
            this.widget.setReadOnly(isReadOnly);
        }
    };

    LeanEditorPanel.prototype.onResize = function (width, height) {
        this.logger.debug('onResize --> width: ' + width + ', height: ' + height);
        if (this.widget) {
            this.widget.onWidgetContainerResize(width, height);
        }
    };

    LeanEditorPanel.prototype.destroy = function () {
        this.control.destroy();
        this.widget.destroy();

        PanelBaseWithHeader.prototype.destroy.call(this);
        WebGMEGlobal.KeyboardManager.setListener(undefined);
        WebGMEGlobal.Toolbar.refresh();
    };

    LeanEditorPanel.prototype.onActivate = function () {
        this.widget.onActivate();
        this.control.onActivate();
        WebGMEGlobal.KeyboardManager.setListener(this.widget);
        WebGMEGlobal.Toolbar.refresh();
    };

    LeanEditorPanel.prototype.onDeactivate = function () {
        this.widget.onDeactivate();
        this.control.onDeactivate();
        WebGMEGlobal.KeyboardManager.setListener(undefined);
        WebGMEGlobal.Toolbar.refresh();
    };

    return LeanEditorPanel;
});
