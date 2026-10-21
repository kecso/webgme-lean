/**
 * Lean Translator - Converts parsed constraint AST to Lean 4 code
 * 
 * This translator takes constraint expressions and generates
 * Lean 4 definitions and theorems for formal verification.
 */

import {
  ConstraintExpression,
  QuantifierExpr,
  BinaryExpr,
  UnaryExpr,
  AttributeExpr,
  LiteralExpr,
  VariableExpr,
  CallExpr,
  Constraint,
  ConstraintSet
} from '../common/types';
import { DomainDSL, TypeDefinition } from '../generator/dsl-generator';

export interface TranslationContext {
  domainDSL: DomainDSL;
  currentScope: Map<string, string>;
  indentLevel: number;
}

/**
 * Translate a constraint set to Lean code
 * 
 * ## Scoping
 * 
 * The `targetType` (e.g., StateMachine) defines the "model root".
 * All type references within constraints are scoped to descendants
 * of the current model instance being verified.
 * 
 * For example, `forall s in State` means "for all State nodes that
 * are descendants of the current StateMachine instance".
 */
export function translateConstraintSet(
  constraintSet: ConstraintSet,
  domainDSL: DomainDSL
): string {
  const lines: string[] = [];
  const ctx: TranslationContext = {
    domainDSL,
    currentScope: new Map(),
    indentLevel: 0
  };

  const scopeMode = constraintSet.scopeMode || 'descendants';

  lines.push('/-!');
  lines.push(`# Constraints for ${constraintSet.name}`);
  lines.push('');
  lines.push(`Model root type: ${constraintSet.targetType}`);
  lines.push(`Scope: ${scopeMode} (type references are scoped to ${scopeMode} of each ${constraintSet.targetType} instance)`);
  lines.push('');
  lines.push('When a project contains multiple model instances (e.g., multiple StateMachines),');
  lines.push('these constraints are evaluated separately for each instance.');
  lines.push('-/');
  lines.push('');
  lines.push('import WebGMELean');
  lines.push('import Domain');
  lines.push('');
  lines.push(`namespace ${sanitizeIdentifier(constraintSet.name)}`);
  lines.push('');
  lines.push('open WebGMELean');
  lines.push('open Domain');
  lines.push('');
  lines.push(`/-- The model root type for scoping -/`);
  lines.push(`def modelRootType : String := "${constraintSet.targetType}"`);
  lines.push('');

  for (const constraint of constraintSet.constraints) {
    lines.push(translateConstraint(constraint, ctx));
    lines.push('');
  }

  lines.push(generateVerificationFunction(constraintSet, ctx));
  lines.push('');
  lines.push(`end ${sanitizeIdentifier(constraintSet.name)}`);

  return lines.join('\n');
}

/**
 * Translate a single constraint to Lean
 */
export function translateConstraint(
  constraint: Constraint,
  ctx: TranslationContext
): string {
  const lines: string[] = [];
  const safeName = sanitizeIdentifier(constraint.name);

  if (constraint.description) {
    lines.push(`/-- ${constraint.description} -/`);
  }

  lines.push(`def ${safeName} (m : Model) : Bool :=`);
  lines.push(`  ${translateExpression(constraint.expression, ctx)}`);

  if (constraint.severity === 'error') {
    lines.push('');
    lines.push(`/-- Theorem: ${safeName} holds for all valid models -/`);
    lines.push(`theorem ${safeName}_holds (m : Model) (h : ${safeName} m) : ${safeName} m := h`);
  }

  return lines.join('\n');
}

/**
 * Translate a constraint expression to Lean
 */
export function translateExpression(
  expr: ConstraintExpression,
  ctx: TranslationContext
): string {
  switch (expr.type) {
    case 'quantifier':
      return translateQuantifier(expr as QuantifierExpr, ctx);
    case 'binary':
      return translateBinary(expr as BinaryExpr, ctx);
    case 'unary':
      return translateUnary(expr as UnaryExpr, ctx);
    case 'attribute':
      return translateAttribute(expr as AttributeExpr, ctx);
    case 'literal':
      return translateLiteral(expr as LiteralExpr);
    case 'variable':
      return translateVariable(expr as VariableExpr, ctx);
    case 'call':
      return translateCall(expr as CallExpr, ctx);
    default:
      throw new Error(`Unknown expression type: ${(expr as ConstraintExpression).type}`);
  }
}

function translateQuantifier(expr: QuantifierExpr, ctx: TranslationContext): string {
  const varName = sanitizeIdentifier(expr.variable);
  const domain = expr.domain;
  
  const newScope = new Map(ctx.currentScope);
  newScope.set(expr.variable, varName);
  const innerCtx = { ...ctx, currentScope: newScope };
  
  const domainExpr = `m.getNodesByType "${domain}"`;
  const body = translateExpression(expr.body, innerCtx);
  
  if (expr.quantifier === 'forall') {
    if (expr.condition) {
      const cond = translateExpression(expr.condition, innerCtx);
      return `(${domainExpr}).all fun ${varName} => (${cond}) → (${body})`;
    }
    return `(${domainExpr}).all fun ${varName} => ${body}`;
  } else {
    if (expr.condition) {
      const cond = translateExpression(expr.condition, innerCtx);
      return `(${domainExpr}).any fun ${varName} => (${cond}) && (${body})`;
    }
    return `(${domainExpr}).any fun ${varName} => ${body}`;
  }
}

function translateBinary(expr: BinaryExpr, ctx: TranslationContext): string {
  const left = translateExpression(expr.left, ctx);
  const right = translateExpression(expr.right, ctx);
  
  switch (expr.operator) {
    case 'and':
      return `(${left}) && (${right})`;
    case 'or':
      return `(${left}) || (${right})`;
    case 'implies':
      return `(${left}) → (${right})`;
    case 'equals':
      return `(${left}) == (${right})`;
    case 'notEquals':
      return `(${left}) != (${right})`;
    case 'lessThan':
      return `(${left}) < (${right})`;
    case 'lessOrEqual':
      return `(${left}) ≤ (${right})`;
    case 'greaterThan':
      return `(${left}) > (${right})`;
    case 'greaterOrEqual':
      return `(${left}) ≥ (${right})`;
    case 'in':
      return `(${right}).contains (${left})`;
    default:
      throw new Error(`Unknown binary operator: ${expr.operator}`);
  }
}

function translateUnary(expr: UnaryExpr, ctx: TranslationContext): string {
  const operand = translateExpression(expr.operand, ctx);
  
  switch (expr.operator) {
    case 'not':
      return `!(${operand})`;
    default:
      throw new Error(`Unknown unary operator: ${expr.operator}`);
  }
}

function translateAttribute(expr: AttributeExpr, ctx: TranslationContext): string {
  const target = ctx.currentScope.get(expr.target) || expr.target;
  return `${target}.getAttribute "${expr.attribute}"`;
}

function translateLiteral(expr: LiteralExpr): string {
  if (expr.value === null) {
    return 'AttrValue.null';
  }
  if (typeof expr.value === 'string') {
    return `AttrValue.string "${expr.value}"`;
  }
  if (typeof expr.value === 'number') {
    if (Number.isInteger(expr.value)) {
      return `AttrValue.int ${expr.value}`;
    }
    return `AttrValue.float ${expr.value}`;
  }
  if (typeof expr.value === 'boolean') {
    return `AttrValue.bool ${expr.value}`;
  }
  throw new Error(`Unknown literal type: ${typeof expr.value}`);
}

function translateVariable(expr: VariableExpr, ctx: TranslationContext): string {
  return ctx.currentScope.get(expr.name) || expr.name;
}

function translateCall(expr: CallExpr, ctx: TranslationContext): string {
  const args = expr.arguments.map(arg => translateExpression(arg, ctx));
  
  switch (expr.function) {
    case 'count':
      return `(${args[0]}).length`;
    case 'isEmpty':
      return `(${args[0]}).isEmpty`;
    case 'isNotEmpty':
      return `!(${args[0]}).isEmpty`;
    case 'all':
      if (args.length >= 2) {
        return `(${args[0]}).all (${args[1]})`;
      }
      return `(${args[0]}).all (fun _ => true)`;
    case 'any':
      if (args.length >= 2) {
        return `(${args[0]}).any (${args[1]})`;
      }
      return `(${args[0]}).any (fun _ => true)`;
    case 'unique':
      return `Cardinality.attributeUnique (${args[0]}) "${args[1] || 'name'}"`;
    case 'reachable':
      return `Graph.isReachable (Graph.extractPointerEdges m) (${args[0]}) (${args[1]})`;
    case 'children':
      return `(${args[0]}).children.filterMap m.getNode`;
    case 'parent':
      return `(${args[0]}).parent.bind m.getNode`;
    case 'siblings':
      return `Graph.getSiblings m (${args[0]})`;
    default:
      return `${expr.function}(${args.join(', ')})`;
  }
}

function generateVerificationFunction(
  constraintSet: ConstraintSet,
  ctx: TranslationContext
): string {
  const lines: string[] = [];
  const constraintNames = constraintSet.constraints.map(c => sanitizeIdentifier(c.name));

  lines.push('/-- Verify all constraints in this set -/');
  lines.push('def verifyAll (m : Model) : List (String × Bool) :=');
  lines.push('  [');
  
  for (let i = 0; i < constraintNames.length; i++) {
    const name = constraintNames[i];
    const comma = i < constraintNames.length - 1 ? ',' : '';
    lines.push(`    ("${name}", ${name} m)${comma}`);
  }
  
  lines.push('  ]');
  lines.push('');
  lines.push('/-- Check if all constraints pass -/');
  lines.push('def allPass (m : Model) : Bool :=');
  lines.push('  (verifyAll m).all (·.2)');

  return lines.join('\n');
}

function sanitizeIdentifier(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1');
}

/**
 * Generate a complete Lean module from constraints and model data
 */
export function generateLeanModule(
  moduleName: string,
  constraintSets: ConstraintSet[],
  domainDSL: DomainDSL
): string {
  const lines: string[] = [];

  lines.push('/-!');
  lines.push(`# ${moduleName}`);
  lines.push('');
  lines.push('Auto-generated verification module.');
  lines.push('-/');
  lines.push('');
  lines.push('import WebGMELean');
  lines.push('');

  for (const cs of constraintSets) {
    lines.push(translateConstraintSet(cs, domainDSL));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate Lean code to load and verify a model instance
 */
export function generateModelVerification(
  modelJson: string,
  constraintModule: string
): string {
  const lines: string[] = [];

  lines.push('/-!');
  lines.push('# Model Verification');
  lines.push('');
  lines.push('Verifies a specific model instance against constraints.');
  lines.push('-/');
  lines.push('');
  lines.push('import WebGMELean');
  lines.push(`import ${constraintModule}`);
  lines.push('');
  lines.push('open WebGMELean');
  lines.push('');
  lines.push('/-- The model to verify -/');
  lines.push('def modelData : Model := ');
  lines.push(generateModelLiteral(modelJson));
  lines.push('');
  lines.push('/-- Run verification -/');
  lines.push(`#eval ${constraintModule}.verifyAll modelData`);
  lines.push('');
  lines.push(`#check ${constraintModule}.allPass modelData`);

  return lines.join('\n');
}

function generateModelLiteral(modelJson: string): string {
  const model = JSON.parse(modelJson);
  const lines: string[] = [];
  
  lines.push('  { nodes := [');
  
  for (let i = 0; i < model.nodes.length; i++) {
    const node = model.nodes[i];
    const comma = i < model.nodes.length - 1 ? ',' : '';
    lines.push(`    { id := ⟨"${node.id}"⟩`);
    lines.push(`    , metaType := "${node.metaType}"`);
    lines.push(`    , name := "${node.name || ''}"`);
    lines.push(`    , attributes := [${formatAttributes(node.attributes)}]`);
    lines.push(`    , pointers := [${formatPointers(node.pointers)}]`);
    lines.push(`    , sets := [${formatSets(node.sets)}]`);
    lines.push(`    , children := [${formatNodeIds(node.children)}]`);
    lines.push(`    , parent := ${node.parent ? `some ⟨"${node.parent}"⟩` : 'none'}`);
    lines.push(`    }${comma}`);
  }
  
  lines.push('  ]');
  lines.push(`  , root := ⟨"${model.root}"⟩`);
  lines.push('  }');
  
  return lines.join('\n');
}

function formatAttributes(attrs: Record<string, unknown>): string {
  if (!attrs) return '';
  return Object.entries(attrs)
    .map(([k, v]) => {
      const val = formatAttrValue(v);
      return `("${k}", ${val})`;
    })
    .join(', ');
}

function formatAttrValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'AttrValue.null';
  }
  if (typeof value === 'string') {
    return `AttrValue.string "${value}"`;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return `AttrValue.int ${value}`;
    }
    return `AttrValue.float ${value}`;
  }
  if (typeof value === 'boolean') {
    return `AttrValue.bool ${value}`;
  }
  return 'AttrValue.null';
}

function formatPointers(ptrs: Record<string, string | null>): string {
  if (!ptrs) return '';
  return Object.entries(ptrs)
    .map(([k, v]) => {
      const target = v ? `some ⟨"${v}"⟩` : 'none';
      return `{ name := "${k}", target := ${target} }`;
    })
    .join(', ');
}

function formatSets(sets: Record<string, string[]>): string {
  if (!sets) return '';
  return Object.entries(sets)
    .map(([k, v]) => {
      const members = v.map(id => `⟨"${id}"⟩`).join(', ');
      return `{ name := "${k}", members := [${members}] }`;
    })
    .join(', ');
}

function formatNodeIds(ids: string[]): string {
  if (!ids) return '';
  return ids.map(id => `⟨"${id}"⟩`).join(', ');
}
