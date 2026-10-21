/**
 * ConstraintEditor Control
 * 
 * WebGME control that manages the constraint editor widget and
 * handles communication with the WebGME client.
 */

import ConstraintEditorWidget from './ConstraintEditorWidget';
import { Metamodel, MetaNode, MetaAttribute, MetaPointer, MetaSet, MetaContainment } from '../../common/types';

interface ControlOptions {
  logger: any;
  client: any;
}

interface GMEClient {
  getActiveProjectId(): string;
  getActiveProjectName(): string;
  getActiveBranchName(): string;
  getActiveCommitHash(): string;
  getActiveRootHash(): string;
  getNode(nodeId: string): GMENode | null;
  getAllMetaNodes(): Record<string, GMENode>;
  getRegistry(nodeId: string, name: string): any;
  setRegistry(nodeId: string, name: string, value: any): Promise<void>;
  startTransaction(message: string): void;
  completeTransaction(message: string): void;
  registerUIStateActiveObjectChanged(territoryId: string, callback: (nodeId: string) => void): void;
  addUI(component: any, callback: (events: any[]) => void, guid: string): string;
  updateTerritory(territoryId: string, patterns: Record<string, any>): void;
  removeUI(territoryId: string): void;
}

interface GMENode {
  getId(): string;
  getGuid(): string;
  getPath(): string;
  getRelid(): string;
  getAttribute(name: string): any;
  getOwnAttribute(name: string): any;
  getAttributeNames(): string[];
  getOwnAttributeNames(): string[];
  getRegistry(name: string): any;
  getOwnRegistry(name: string): any;
  getRegistryNames(): string[];
  getOwnRegistryNames(): string[];
  getPointer(name: string): { to: string | null };
  getPointerNames(): string[];
  getSetNames(): string[];
  getMemberIds(setName: string): string[];
  getChildrenIds(): string[];
  getParentId(): string | null;
  getBaseId(): string | null;
  getMetaTypeId(): string | null;
  isMetaNode(): boolean;
  isAbstract(): boolean;
}

class ConstraintEditorControl {
  private logger: any;
  private client: GMEClient;
  private widget: ConstraintEditorWidget;
  private currentNodeId: string | null = null;
  private territoryId: string | null = null;
  private patterns: Record<string, any> = {};

  constructor(options: ControlOptions, widget: ConstraintEditorWidget) {
    this.logger = options.logger.fork('ConstraintEditorControl');
    this.client = options.client;
    this.widget = widget;

    this.logger.debug('ConstraintEditorControl created');
  }

  /**
   * Called when the visualizer becomes active
   */
  selectedObjectChanged(nodeId: string): void {
    this.logger.debug('selectedObjectChanged:', nodeId);

    if (this.territoryId) {
      this.client.removeUI(this.territoryId);
    }

    this.currentNodeId = nodeId;

    if (!nodeId) {
      return;
    }

    this.territoryId = this.client.addUI(this, (events) => {
      this.processEvents(events);
    }, `ConstraintEditor_${Date.now()}`);

    this.patterns = {};
    this.patterns[nodeId] = { children: 0 };

    const metaNodes = this.client.getAllMetaNodes();
    for (const metaId of Object.keys(metaNodes)) {
      this.patterns[metaId] = { children: 0 };
    }

    this.client.updateTerritory(this.territoryId, this.patterns);
  }

  /**
   * Process WebGME territory events
   */
  private processEvents(events: any[]): void {
    this.logger.debug('Processing events:', events.length);

    let needsRefresh = false;

    for (const event of events) {
      if (event.etype === 'load' || event.etype === 'update') {
        needsRefresh = true;
      }
    }

    if (needsRefresh && this.currentNodeId) {
      this.refresh();
    }
  }

  /**
   * Refresh the editor with current data
   */
  private async refresh(): Promise<void> {
    if (!this.currentNodeId) return;

    try {
      const metamodel = this.extractMetamodel();
      this.widget.updateDomainDSL(metamodel);

      const rootId = this.findProjectRoot();
      await this.widget.loadConstraints(rootId || this.currentNodeId);
    } catch (error) {
      this.logger.error('Failed to refresh:', error);
    }
  }

  /**
   * Find the project root or FCO
   */
  private findProjectRoot(): string | null {
    const node = this.client.getNode(this.currentNodeId!);
    if (!node) return null;

    let current = node;
    while (current.getParentId()) {
      const parent = this.client.getNode(current.getParentId()!);
      if (!parent) break;
      current = parent;
    }

    return current.getId();
  }

  /**
   * Extract metamodel from WebGME
   */
  private extractMetamodel(): Metamodel {
    const metaNodes = this.client.getAllMetaNodes();
    const nodes: MetaNode[] = [];

    for (const [path, metaNode] of Object.entries(metaNodes)) {
      const node = this.extractMetaNode(metaNode);
      nodes.push(node);
    }

    const currentNode = this.client.getNode(this.currentNodeId!);
    const rootType = currentNode?.getMetaTypeId() 
      ? this.getNodeName(this.client.getNode(currentNode.getMetaTypeId()!)!)
      : 'FCO';

    return {
      name: this.client.getActiveProjectName() || 'Project',
      rootType,
      nodes
    };
  }

  private extractMetaNode(metaNode: GMENode): MetaNode {
    const name = this.getNodeName(metaNode);
    const baseId = metaNode.getBaseId();
    const baseNode = baseId ? this.client.getNode(baseId) : null;
    const baseType = baseNode ? this.getNodeName(baseNode) : null;

    const attributes: MetaAttribute[] = [];
    for (const attrName of metaNode.getOwnAttributeNames()) {
      const value = metaNode.getOwnAttribute(attrName);
      attributes.push({
        name: attrName,
        type: this.inferAttributeType(value)
      });
    }

    const pointers: MetaPointer[] = [];
    for (const ptrName of metaNode.getPointerNames()) {
      if (ptrName === 'base') continue;
      pointers.push({
        name: ptrName,
        targetTypes: [],
        min: 0,
        max: 1
      });
    }

    const sets: MetaSet[] = [];
    for (const setName of metaNode.getSetNames()) {
      sets.push({
        name: setName,
        memberTypes: [],
        min: 0,
        max: null
      });
    }

    const containments: MetaContainment[] = [];

    return {
      name,
      isAbstract: metaNode.isAbstract(),
      baseType,
      attributes,
      pointers,
      sets,
      containments
    };
  }

  private getNodeName(node: GMENode): string {
    const name = node.getAttribute('name');
    return typeof name === 'string' ? name : 'Unknown';
  }

  private inferAttributeType(value: any): MetaAttribute['type'] {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'float';
    }
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  /**
   * Handle widget resize
   */
  onResize(): void {
    this.widget.onResize();
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.territoryId) {
      this.client.removeUI(this.territoryId);
    }
    this.widget.destroy();
  }
}

export default ConstraintEditorControl;
