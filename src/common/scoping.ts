/**
 * Constraint Scoping
 * 
 * Defines how constraints are scoped to model instances.
 * 
 * ## The Scoping Problem
 * 
 * A WebGME project typically contains:
 * 1. Language definition (metamodel) - the types like State, Transition
 * 2. Multiple model instances - e.g., TrafficLightStatechart, ElevatorStatechart
 * 
 * When we write `forall s in State`, we need to know WHICH States:
 * - All States in the entire project? (Usually wrong)
 * - All States within a specific model instance? (Usually right)
 * 
 * ## Solution: Model Root Scoping
 * 
 * The `constraintset X for Y` syntax defines:
 * - Y = the "model root type" (e.g., StateMachine)
 * 
 * All type references within that constraintset are automatically scoped
 * to descendants of the current model root instance being verified.
 * 
 * ## Example
 * 
 * ```
 * constraintset StatechartConstraints for StateMachine
 * 
 * constraint UniqueStateNames [error]
 * forall s in State: ...
 * ```
 * 
 * When verifying:
 * 1. Find all StateMachine instances in the project
 * 2. For each StateMachine:
 *    - `State` refers to State nodes that are descendants of THIS StateMachine
 *    - Evaluate constraints
 *    - Report violations with model instance context
 * 
 * ## Scoping Modes
 * 
 * For flexibility, we support different scoping modes:
 * 
 * 1. `descendants` (default) - Type refers to all descendants of model root
 * 2. `children` - Type refers to direct children only
 * 3. `global` - Type refers to all instances in project (rarely needed)
 */

import { ModelData, NodeData } from './types';

export type ScopeMode = 'descendants' | 'children' | 'global';

export interface ScopeContext {
  modelRootId: string;
  modelRootType: string;
  scopeMode: ScopeMode;
}

export interface ScopedModel {
  context: ScopeContext;
  nodes: NodeData[];
  root: string;
}

/**
 * Get all descendants of a node (including the node itself)
 */
export function getDescendants(model: ModelData, nodeId: string): NodeData[] {
  const result: NodeData[] = [];
  const nodeMap = new Map(model.nodes.map(n => [n.id, n]));
  
  function collect(id: string): void {
    const node = nodeMap.get(id);
    if (!node) return;
    
    result.push(node);
    for (const childId of node.children) {
      collect(childId);
    }
  }
  
  collect(nodeId);
  return result;
}

/**
 * Get direct children of a node
 */
export function getChildren(model: ModelData, nodeId: string): NodeData[] {
  const nodeMap = new Map(model.nodes.map(n => [n.id, n]));
  const node = nodeMap.get(nodeId);
  if (!node) return [];
  
  return node.children
    .map(id => nodeMap.get(id))
    .filter((n): n is NodeData => n !== undefined);
}

/**
 * Find all instances of a model root type in the project
 */
export function findModelRoots(model: ModelData, modelRootType: string): NodeData[] {
  return model.nodes.filter(n => n.metaType === modelRootType);
}

/**
 * Create a scoped view of the model for a specific model instance
 */
export function createScopedModel(
  model: ModelData,
  modelRootId: string,
  modelRootType: string,
  scopeMode: ScopeMode = 'descendants'
): ScopedModel {
  let scopedNodes: NodeData[];
  
  switch (scopeMode) {
    case 'descendants':
      scopedNodes = getDescendants(model, modelRootId);
      break;
    case 'children':
      scopedNodes = getChildren(model, modelRootId);
      const rootNode = model.nodes.find(n => n.id === modelRootId);
      if (rootNode) scopedNodes.unshift(rootNode);
      break;
    case 'global':
      scopedNodes = model.nodes;
      break;
  }
  
  return {
    context: {
      modelRootId,
      modelRootType,
      scopeMode
    },
    nodes: scopedNodes,
    root: modelRootId
  };
}

/**
 * Get nodes of a specific type within a scope
 */
export function getNodesOfType(scopedModel: ScopedModel, typeName: string): NodeData[] {
  return scopedModel.nodes.filter(n => n.metaType === typeName);
}

/**
 * Verify all model instances in a project
 * 
 * @param model The full project model
 * @param modelRootType The type that defines a "model" (e.g., StateMachine)
 * @param verifyFn Function to verify a single scoped model
 * @returns Results for each model instance
 */
export async function verifyAllModelInstances<T>(
  model: ModelData,
  modelRootType: string,
  verifyFn: (scopedModel: ScopedModel) => Promise<T>
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  const modelRoots = findModelRoots(model, modelRootType);
  
  for (const root of modelRoots) {
    const scopedModel = createScopedModel(model, root.id, modelRootType);
    const result = await verifyFn(scopedModel);
    results.set(root.id, result);
  }
  
  return results;
}

/**
 * Helper to get a human-readable name for a model instance
 */
export function getModelInstanceName(model: ModelData, nodeId: string): string {
  const node = model.nodes.find(n => n.id === nodeId);
  if (!node) return nodeId;
  return node.name || node.id;
}
