/**
 * ConstraintEditor Visualizer
 * 
 * Main WebGME visualizer entry point that creates the widget and control.
 * This file follows WebGME's visualizer pattern.
 */

import ConstraintEditorWidget from './ConstraintEditorWidget';
import ConstraintEditorControl from './ConstraintEditorControl';

const VISUALIZER_ID = 'ConstraintEditor';

interface VisualizerOptions {
  container: HTMLElement;
  logger: any;
  client: any;
}

class ConstraintEditor {
  private widget: ConstraintEditorWidget;
  private control: ConstraintEditorControl;
  private logger: any;

  constructor(options: VisualizerOptions) {
    this.logger = options.logger.fork('ConstraintEditor');
    this.logger.debug('Creating ConstraintEditor visualizer');

    this.widget = new ConstraintEditorWidget(options.container, {
      logger: options.logger,
      client: options.client
    });

    this.control = new ConstraintEditorControl({
      logger: options.logger,
      client: options.client
    }, this.widget);
  }

  /**
   * Called by WebGME when the selected node changes
   */
  selectedObjectChanged(nodeId: string): void {
    this.logger.debug('Selected object changed:', nodeId);
    this.control.selectedObjectChanged(nodeId);
  }

  /**
   * Called by WebGME when the visualizer panel is resized
   */
  onResize(): void {
    this.control.onResize();
  }

  /**
   * Called by WebGME when the visualizer is destroyed
   */
  destroy(): void {
    this.logger.debug('Destroying ConstraintEditor visualizer');
    this.control.destroy();
  }
}

(ConstraintEditor as any).getDefaultConfig = function () {
  return {
    theme: 'dark',
    autoSave: true,
    autoSaveDelay: 2000,
    fontSize: 14
  };
};

(ConstraintEditor as any).getComponentId = function () {
  return VISUALIZER_ID;
};

export default ConstraintEditor;
