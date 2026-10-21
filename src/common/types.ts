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

export interface MetaSet {
  name: string;
  memberTypes: string[];
  min: number;
  max: number | null;
}

export interface MetaContainment {
  childType: string;
  min: number;
  max: number | null;
}

export interface MetaNode {
  name: string;
  isAbstract: boolean;
  baseType: string | null;
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
  | 'isNotEmpty'
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
  target: string;
  attribute: string;
}

export interface PointerExpr extends ConstraintExpression {
  type: 'pointer';
  target: string;
  pointer: string;
}

export interface SetExpr extends ConstraintExpression {
  type: 'set';
  target: string;
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

export interface ConstraintSet {
  name: string;
  /** The model root type - constraints are evaluated per instance of this type */
  targetType: string;
  /** Scoping mode for type references (default: descendants) */
  scopeMode?: 'descendants' | 'children' | 'global';
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
