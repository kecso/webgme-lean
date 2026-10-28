/**
 * Core type definitions for webgme-lean
 */

export interface MetaAttribute {
  name: string;
  type: 'string' | 'integer' | 'float' | 'boolean' | 'asset';
  defaultValue?: string | number | boolean;
  enumValues?: string[];
}

export interface MetaPointer {
  name: string;
  targetTypes: string[];
  min: number;
  max: number | null;
}

export interface MetaSetMember {
  memberType: string;
  min: number;
  max: number | null;
}

export interface MetaSet {
  name: string;
  memberTypes: string[];
  /** How many members the set may hold, of any allowed type. */
  min: number;
  max: number | null;
  /** How many members of one type the set may hold. */
  members?: MetaSetMember[];
}

export interface MetaContainment {
  childType: string;
  min: number;
  max: number | null;
}

/**
 * Represents a node type in the WebGME metamodel.
 * 
 * A mixin contributes rules and answers `isA`. It does not add a Lean parent.
 * `childMin` and `childMax` bound how many children a node may have, of any allowed type.
 */
export interface MetaNode {
  name: string;
  isAbstract: boolean;
  baseType: string | null;
  mixins?: string[];
  /** Total children of any allowed type. null means no bound. */
  childMin?: number | null;
  childMax?: number | null;
  attributes: MetaAttribute[];
  pointers: MetaPointer[];
  sets: MetaSet[];
  containments: MetaContainment[];
}

export interface Metamodel {
  name: string;
  rootType: string;
  nodes: MetaNode[];
}

export interface NodeData {
  id: string;
  metaType: string;
  name: string;
  attributes: Record<string, unknown>;
  pointers: Record<string, string | null>;
  sets: Record<string, string[]>;
  children: string[];
  parent: string | null;
}

export interface ModelData {
  nodes: NodeData[];
  root: string;
}

export type ConstraintOperator =
  | 'forall'
  | 'exists'
  | 'implies'
  | 'and'
  | 'or'
  | 'not'
  | 'equals'
  | 'notEquals'
  | 'lessThan'
  | 'lessOrEqual'
  | 'greaterThan'
  | 'greaterOrEqual'
  | 'in'
  | 'notIn'
  | 'isEmpty'
  | 'count'
  | 'sum'
  | 'all'
  | 'any';

export interface ConstraintExpression {
  type: 'quantifier' | 'binary' | 'unary' | 'attribute' | 'pointer' | 'set' | 'literal' | 'variable' | 'call';
}

export interface QuantifierExpr extends ConstraintExpression {
  type: 'quantifier';
  quantifier: 'forall' | 'exists';
  variable: string;
  domain: string;
  condition?: ConstraintExpression;
  body: ConstraintExpression;
}

export interface BinaryExpr extends ConstraintExpression {
  type: 'binary';
  operator: string;
  left: ConstraintExpression;
  right: ConstraintExpression;
}

export interface UnaryExpr extends ConstraintExpression {
  type: 'unary';
  operator: string;
  operand: ConstraintExpression;
}

export interface AttributeExpr extends ConstraintExpression {
  type: 'attribute';
  target: ConstraintExpression;
  attribute: string;
}

export interface PointerExpr extends ConstraintExpression {
  type: 'pointer';
  target: ConstraintExpression;
  pointer: string;
}

export interface SetExpr extends ConstraintExpression {
  type: 'set';
  target: ConstraintExpression;
  setName: string;
}

export interface LiteralExpr extends ConstraintExpression {
  type: 'literal';
  value: string | number | boolean | null;
}

export interface VariableExpr extends ConstraintExpression {
  type: 'variable';
  name: string;
}

export interface CallExpr extends ConstraintExpression {
  type: 'call';
  function: string;
  arguments: ConstraintExpression[];
}

export interface Constraint {
  name: string;
  description?: string;
  expression: ConstraintExpression;
  severity: 'error' | 'warning' | 'info';
}

export interface FunctionDefinition {
  name: string;
  parameters: string[];
  body: ConstraintExpression;
  description?: string;
}

export interface ConstraintSet {
  name: string;
  /** The model root type - constraints are evaluated per instance of this type */
  targetType: string;
  /** Scoping mode for type references (default: descendants) */
  scopeMode?: 'descendants' | 'children' | 'global';
  /** User-defined helper functions */
  definitions?: FunctionDefinition[];
  constraints: Constraint[];
}

export interface VerificationResult {
  constraintName: string;
  passed: boolean;
  message?: string;
  violatingNodes?: string[];
  leanOutput?: string;
}

export interface VerificationReport {
  modelName: string;
  timestamp: string;
  results: VerificationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}
