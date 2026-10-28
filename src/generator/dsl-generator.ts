/**
 * DSL Generator - Creates domain-specific constraint language from metamodel
 * 
 * This generator takes a WebGME metamodel and produces:
 * 1. Domain-specific keywords (type names as identifiers)
 * 2. Type definitions for the constraint language
 * 3. Validation rules based on metamodel constraints
 */

import { Metamodel, MetaNode, MetaAttribute, MetaPointer, MetaSet, MetaSetMember } from '../common/types';

export interface DomainDSL {
  name?: string;
  /** The concept constraints are about, such as StateChart. Not the WebGME project root. */
  mainType?: string;
  keywords: string[];
  typeDefinitions: TypeDefinition[];
  validationRules: ValidationRule[];
  leanImports: string[];
}

export interface TypeDefinition {
  name: string;
  attributes: AttributeDef[];
  pointers: PointerDef[];
  sets: SetDef[];
  containments: ContainmentDef[];
  baseType: string | null;
  mixins: string[];
  childMin: number | null;
  childMax: number | null;
}

export interface AttributeDef {
  name: string;
  type: 'string' | 'int' | 'float' | 'bool';
  leanType: string;
}

export interface PointerDef {
  name: string;
  targetTypes: string[];
  optional: boolean;
}

export interface SetDef {
  name: string;
  memberTypes: string[];
  min: number;
  max: number | null;
  members: MetaSetMember[];
}

export interface ContainmentDef {
  childType: string;
  min: number;
  max: number | null;
}

export interface ValidationRule {
  description: string;
  leanPredicate: string;
}

/**
 * Generate a domain-specific DSL from a metamodel
 */
export function generateDomainDSL(metamodel: Metamodel): DomainDSL {
  const keywords: string[] = [];
  const typeDefinitions: TypeDefinition[] = [];
  const validationRules: ValidationRule[] = [];
  const leanImports: string[] = [
    'WebGMELean.Core',
    'WebGMELean.Tactics'
  ];

  for (const node of metamodel.nodes) {
    keywords.push(node.name);
    
    const typeDef = generateTypeDefinition(node);
    typeDefinitions.push(typeDef);
    
    const rules = generateValidationRules(node);
    validationRules.push(...rules);
  }

  return {
    name: metamodel.name,
    mainType: metamodel.rootType,
    keywords,
    typeDefinitions,
    validationRules,
    leanImports
  };
}

function mapAttributeType(attrType: string): { type: AttributeDef['type']; leanType: string } {
  switch (attrType) {
    case 'string':
    case 'asset':
      return { type: 'string', leanType: 'String' };
    case 'integer':
      return { type: 'int', leanType: 'Int' };
    case 'float':
      return { type: 'float', leanType: 'Float' };
    case 'boolean':
      return { type: 'bool', leanType: 'Bool' };
    default:
      return { type: 'string', leanType: 'String' };
  }
}

function generateTypeDefinition(node: MetaNode): TypeDefinition {
  return {
    name: node.name,
    baseType: node.baseType,
    mixins: node.mixins || [],
    childMin: node.childMin ?? null,
    childMax: node.childMax ?? null,
    attributes: node.attributes.map(attr => {
      const { type, leanType } = mapAttributeType(attr.type);
      return {
        name: attr.name,
        type,
        leanType
      };
    }),
    pointers: node.pointers.map(ptr => ({
      name: ptr.name,
      targetTypes: ptr.targetTypes,
      optional: ptr.min === 0
    })),
    sets: node.sets.map(set => ({
      name: set.name,
      memberTypes: set.memberTypes,
      min: set.min,
      max: set.max,
      members: set.members || []
    })),
    containments: node.containments.map(cont => ({
      childType: cont.childType,
      min: cont.min,
      max: cont.max
    }))
  };
}

function generateValidationRules(node: MetaNode): ValidationRule[] {
  const rules: ValidationRule[] = [];
  
  for (const ptr of node.pointers) {
    if (ptr.min > 0) {
      rules.push({
        description: `${node.name}.${ptr.name} must be set`,
        leanPredicate: `fun (n : Node) => n.metaType == "${node.name}" → Connectivity.hasPointer n "${ptr.name}"`
      });
    }
    
    if (ptr.targetTypes.length > 0) {
      const typeCheck = ptr.targetTypes.map(t => `target.metaType == "${t}"`).join(' ∨ ');
      rules.push({
        description: `${node.name}.${ptr.name} must point to ${ptr.targetTypes.join(' or ')}`,
        leanPredicate: `fun (m : Model) (n : Node) => n.metaType == "${node.name}" → 
          match n.getPointer "${ptr.name}" with
          | none => true
          | some targetId => match m.getNode targetId with
            | none => false
            | some target => ${typeCheck}`
      });
    }
  }
  
  for (const cont of node.containments) {
    if (cont.min > 0) {
      rules.push({
        description: `${node.name} must contain at least ${cont.min} ${cont.childType}`,
        leanPredicate: `fun (m : Model) (n : Node) => n.metaType == "${node.name}" → 
          Connectivity.countChildrenOfType m n "${cont.childType}" ≥ ${cont.min}`
      });
    }
    
    if (cont.max !== null) {
      rules.push({
        description: `${node.name} must contain at most ${cont.max} ${cont.childType}`,
        leanPredicate: `fun (m : Model) (n : Node) => n.metaType == "${node.name}" → 
          Connectivity.countChildrenOfType m n "${cont.childType}" ≤ ${cont.max}`
      });
    }
  }
  
  return rules;
}

const LEAN_KEYWORDS = new Set([
  'end', 'by', 'from', 'if', 'then', 'else', 'true', 'false', 'structure', 'def',
  'where', 'class', 'instance', 'import', 'namespace', 'inductive', 'theorem',
  'abbrev', 'axiom', 'fun', 'forall', 'exists', 'let', 'in', 'match', 'with', 'do'
]);

function leanIdent(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, '_');
  if (!cleaned || /^[0-9]/.test(cleaned) || LEAN_KEYWORDS.has(cleaned)) {
    return `«${cleaned || 'x'}»`;
  }
  return cleaned;
}

function ctorIdent(name: string): string {
  return leanIdent(`c${name}`);
}

function techType(name: string): string {
  return `_${name}`;
}

function reaches(start: string, goal: string, adjacent: Map<string, string[]>): boolean {
  if (start === goal) {
    return true;
  }
  const seen = new Set<string>([start]);
  const stack = [...(adjacent.get(start) || [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (next === goal) {
      return true;
    }
    if (seen.has(next)) {
      continue;
    }
    seen.add(next);
    for (const further of adjacent.get(next) || []) {
      stack.push(further);
    }
  }
  return false;
}

interface LeanField {
  name: string;
  type: string;
  min?: number;
  max?: number | null;
  members?: MetaSetMember[];
}

interface LeanConcept {
  name: string;
  base: string | null;
  mixins: string[];
  childMin: number | null;
  childMax: number | null;
  attributes: LeanField[];
  pointers: LeanField[];
  sets: LeanField[];
  containments: ContainmentDef[];
}

/**
 * Generate Lean structures for the domain.
 *
 * The text is the program only. Each concept is a section opened by `-- Name definitions`.
 * The encoding rules live in docs/lean-encoding.md.
 * Containment is one `_containment : List _NodeId` on FCO. Every concept inherits that
 * list through `extends`. `_parent` is the id of the instance's parent, or `none`.
 * `isA` is the base chain plus mixins. A meta rule is a def named for the concept and
 * the rule, such as `_Compound_Port_child_cardinality`. The model section proves each
 * one. `resolve` is defined there.
 * The editor places user constraints after this text.
 */
export function generateLeanTypes(dsl: DomainDSL): string {
  const types = dsl.typeDefinitions;
  const adjacent = new Map<string, string[]>();
  for (const type of types) {
    const targets = [
      ...type.pointers.flatMap(pointer => pointer.targetTypes),
      ...type.sets.flatMap(set => set.memberTypes)
    ];
    adjacent.set(type.name, targets);
  }

  const refSums = new Map<string, string[]>();
  const targetTypeOf = (owner: string, targets: string[]): string => {
    if (targets.length === 0 || targets.some(target => reaches(target, owner, adjacent))) {
      return techType('NodeId');
    }
    if (targets.length === 1) {
      return leanIdent(targets[0]);
    }
    const refName = techType(`${targets.map(leanIdent).join('')}Ref`);
    refSums.set(refName, targets);
    return refName;
  };

  const toConcept = (type: TypeDefinition, base: string | null): LeanConcept => ({
    name: type.name,
    base,
    mixins: type.mixins || [],
    childMin: type.childMin ?? null,
    childMax: type.childMax ?? null,
    attributes: type.attributes
      .filter(attribute => attribute.name !== 'name')
      .map(attribute => ({
        name: leanIdent(attribute.name),
        type: attribute.leanType
      })),
    pointers: type.pointers.map(pointer => ({
      name: leanIdent(pointer.name),
      type: pointer.optional
        ? `Option ${targetTypeOf(type.name, pointer.targetTypes)}`
        : targetTypeOf(type.name, pointer.targetTypes)
    })),
    sets: type.sets.map(set => ({
      name: leanIdent(set.name),
      type: `List ${targetTypeOf(type.name, set.memberTypes)}`,
      min: set.min,
      max: set.max,
      members: set.members || []
    })),
    containments: type.containments
  });

  const fcoNode = types.find(type => type.name === 'FCO');
  const fco = fcoNode ? toConcept(fcoNode, null) : {
    name: 'FCO',
    base: null,
    mixins: [],
    childMin: null,
    childMax: null,
    attributes: [],
    pointers: [],
    sets: [],
    containments: []
  };
  const concepts: LeanConcept[] = types
    .filter(type => type.name !== 'FCO')
    .map(type => toConcept(type, type.baseType || 'FCO'));

  const lines: string[] = [];
  const namespace = leanIdent(dsl.name || 'Domain');
  lines.push(`namespace ${namespace}`);
  lines.push('');
  lines.push(`structure ${techType('NodeId')} where`);
  lines.push('  path : String');
  lines.push('  deriving DecidableEq, Repr');
  lines.push('');
  lines.push(`class ${techType('Contained')} (parent child : Type) where`);
  lines.push('  children : parent → List child');
  lines.push('');

  const emitted = new Set<string>(['FCO']);

  const pending = new Set(concepts.map(concept => concept.name));
  const ordered: LeanConcept[] = [];
  while (pending.size > 0) {
    let progressed = false;
    for (const concept of concepts) {
      if (!pending.has(concept.name)) {
        continue;
      }
      const needed = [...concept.pointers, ...concept.sets]
        .map(field => field.type.replace(/^(Option |List )/, ''))
        .filter(typeName => concepts.some(other => leanIdent(other.name) === typeName));
      if (concept.base) {
        needed.push(leanIdent(concept.base));
      }
      if (needed.every(typeName => emitted.has(typeName))) {
        ordered.push(concept);
        pending.delete(concept.name);
        emitted.add(leanIdent(concept.name));
        progressed = true;
      }
    }
    if (!progressed) {
      ordered.push(...concepts.filter(concept => pending.has(concept.name)));
      break;
    }
  }

  const emitStructure = (concept: LeanConcept) => {
    const owner = leanIdent(concept.name);
    const parent = concept.base ? leanIdent(concept.base) : null;
    const fields: string[] = [];
    if (!parent) {
      fields.push(`  _id : ${techType('NodeId')}`);
      fields.push(`  _type : ${techType('Type')}`);
      fields.push('  name : String');
      fields.push(`  _containment : List ${techType('NodeId')}`);
      fields.push(`  _parent : Option ${techType('NodeId')}`);
    }
    for (const attribute of concept.attributes) {
      fields.push(`  ${attribute.name} : ${attribute.type}`);
    }
    for (const pointer of concept.pointers) {
      fields.push(`  ${pointer.name} : ${pointer.type}`);
    }
    for (const set of concept.sets) {
      fields.push(`  ${set.name} : ${set.type}`);
    }
    if (parent && fields.length === 0) {
      lines.push(`structure ${owner} extends ${parent} deriving Repr`);
    } else if (parent) {
      lines.push(`structure ${owner} extends ${parent} where`);
      lines.push(...fields);
      lines.push('  deriving Repr');
    } else {
      lines.push(`structure ${owner} where`);
      lines.push(...fields);
      lines.push('  deriving Repr');
    }
    lines.push('');
    lines.push(`instance : BEq ${owner} where`);
    lines.push('  beq a b := a._id == b._id');
    lines.push('');
    if (parent) {
      lines.push(`instance : Coe ${owner} ${parent} where`);
      lines.push(`  coe := ${owner}.to${parent}`);
      lines.push('');
    }
  };

  const byName = new Map<string, LeanConcept>();
  for (const concept of [fco, ...concepts]) {
    byName.set(concept.name, concept);
  }
  const related = (concept: LeanConcept, mixins: boolean): LeanConcept[] => {
    const found: LeanConcept[] = [];
    const queue: LeanConcept[] = [concept];
    const guard = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift() as LeanConcept;
      if (guard.has(current.name)) {
        continue;
      }
      guard.add(current.name);
      found.push(current);
      if (current.base) {
        const base = byName.get(current.base);
        if (base) {
          queue.push(base);
        }
      }
      if (mixins) {
        for (const mixinName of current.mixins) {
          const mixin = byName.get(mixinName);
          if (mixin) {
            queue.push(mixin);
          }
        }
      }
    }
    return found;
  };
  const effectiveContainments = (concept: LeanConcept): ContainmentDef[] => {
    const seen = new Set<string>();
    const rules: ContainmentDef[] = [];
    for (const current of related(concept, true)) {
      for (const rule of current.containments) {
        if (!rule.childType || seen.has(rule.childType)) {
          continue;
        }
        seen.add(rule.childType);
        rules.push(rule);
      }
    }
    return rules;
  };
  const typeClosure = (name: string): string[] => {
    const start = byName.get(name);
    return start ? related(start, true).map(concept => concept.name) : [name];
  };
  const effectiveSets = (concept: LeanConcept): LeanField[] => {
    const seen = new Set<string>();
    const sets: LeanField[] = [];
    for (const current of related(concept, false)) {
      for (const set of current.sets) {
        if (seen.has(set.name)) {
          continue;
        }
        seen.add(set.name);
        sets.push(set);
      }
    }
    return sets;
  };
  const childBounds = (concept: LeanConcept): { min: number | null; max: number | null } => {
    let min: number | null = null;
    let max: number | null = null;
    for (const current of related(concept, true)) {
      if (min === null && current.childMin != null) {
        min = current.childMin;
      }
      if (max === null && current.childMax != null) {
        max = current.childMax;
      }
    }
    return { min, max };
  };

  const span = (min: number | null, max: number | null): string => {
    const low = min != null && min > 0 ? String(min) : '*';
    const high = max != null ? String(max) : '*';
    return `${low}..${high}`;
  };
  const comparison = (countExpr: string, min: number | null, max: number | null): string | null => {
    const low = min != null && min > 0;
    const high = max != null;
    if (low && high) {
      return `(let n := ${countExpr}; n ≥ ${min} && n ≤ ${max})`;
    }
    if (low) {
      return `${countExpr} ≥ ${min}`;
    }
    if (high) {
      return `${countExpr} ≤ ${max}`;
    }
    return null;
  };
  const emitRule = (name: string, owner: string, needsResolve: boolean, comment: string, body: string) => {
    const resolveArg = needsResolve
      ? ` (resolve : ${techType('NodeId')} → Option ${techType('Type')})`
      : '';
    lines.push(`-- ${comment}`);
    lines.push(`def ${name} (m : ${owner})${resolveArg} : Bool :=`);
    lines.push(`  ${body}`);
    lines.push('');
  };
  const memberCount = (set: LeanField, memberType: string): { expr: string; needsResolve: boolean } => {
    const element = set.type.replace(/^List /, '');
    const want = `.${ctorIdent(memberType)}`;
    if (element === techType('NodeId')) {
      return {
        expr: `countOfType m.${set.name} ${want} resolve`,
        needsResolve: true
      };
    }
    if (element.startsWith('_') && element.endsWith('Ref')) {
      return {
        expr: `countWhere m.${set.name} ${element}.typeOf ${want}`,
        needsResolve: false
      };
    }
    return {
      expr: `countWhere m.${set.name} (fun item => item._type) ${want}`,
      needsResolve: false
    };
  };

  const emitBounds = (concept: LeanConcept) => {
    const owner = leanIdent(concept.name);
    const fcoView = owner === 'FCO' ? 'm' : 'm.toFCO';
    emitRule(
      `_${owner}_child_type`,
      owner,
      true,
      `Every child of ${owner} has a type ${owner} may contain.`,
      `childrenAllowed ${fcoView} resolve`
    );
    for (const child of effectiveContainments(concept)) {
      const childName = leanIdent(child.childType);
      const body = comparison(
        `countOfType m._containment .${ctorIdent(child.childType)} resolve`,
        child.min,
        child.max
      );
      if (!body) {
        continue;
      }
      emitRule(
        `_${owner}_${childName}_child_cardinality`,
        owner,
        true,
        `${owner} contains ${span(child.min, child.max)} ${childName}.`,
        body
      );
    }
    const totals = childBounds(concept);
    const totalBody = comparison('m._containment.length', totals.min, totals.max);
    if (totalBody) {
      emitRule(
        `_${owner}_child_cardinality`,
        owner,
        false,
        `${owner} contains ${span(totals.min, totals.max)} children.`,
        totalBody
      );
    }
    for (const set of effectiveSets(concept)) {
      const total = comparison(`(m.${set.name}).length`, set.min ?? null, set.max ?? null);
      if (total) {
        emitRule(
          `_${owner}_${set.name}_member_cardinality`,
          owner,
          false,
          `${set.name} of ${owner} has ${span(set.min ?? null, set.max ?? null)} members.`,
          total
        );
      }
      for (const member of set.members || []) {
        const counted = memberCount(set, member.memberType);
        const body = comparison(counted.expr, member.min, member.max);
        if (!body) {
          continue;
        }
        const memberName = leanIdent(member.memberType);
        emitRule(
          `_${owner}_${set.name}_${memberName}_member_cardinality`,
          owner,
          counted.needsResolve,
          `${set.name} of ${owner} has ${span(member.min, member.max)} ${memberName} members.`,
          body
        );
      }
    }
  };

  const emitConcept = (concept: LeanConcept) => {
    const typeName = leanIdent(concept.name);
    lines.push(`-- ${typeName} definitions`);
    emitStructure(concept);
    emitted.add(typeName);
  };

  const emitMetaRules = () => {
    const allConcepts = [fco, ...concepts];
    lines.push('def isA (child parent : _Type) : Bool :=');
    lines.push('  match child, parent with');
    for (const concept of allConcepts) {
      for (const ancestor of typeClosure(concept.name)) {
        lines.push(`  | .${ctorIdent(concept.name)}, .${ctorIdent(ancestor)} => true`);
      }
    }
    lines.push('  | _, _ => false');
    lines.push('');
    lines.push('def allowed (parent child : _Type) : Bool :=');
    lines.push('  match parent with');
    for (const concept of allConcepts) {
      const rules = effectiveContainments(concept);
      if (rules.length === 0) {
        continue;
      }
      const checks = rules.map(rule => `isA child .${ctorIdent(rule.childType)}`);
      lines.push(`  | .${ctorIdent(concept.name)} => ${checks.join(' || ')}`);
    }
    lines.push('  | _ => false');
    lines.push('');
    lines.push('def countOfType (ids : List _NodeId) (want : _Type) (resolve : _NodeId → Option _Type) : Nat :=');
    lines.push('  ids.foldl (fun acc id =>');
    lines.push('    match resolve id with');
    lines.push('    | some t => if isA t want then acc + 1 else acc');
    lines.push('    | none => acc) 0');
    lines.push('');
    lines.push('def countWhere {α : Type} (items : List α) (typeOf : α → _Type) (want : _Type) : Nat :=');
    lines.push('  items.foldl (fun acc item => if isA (typeOf item) want then acc + 1 else acc) 0');
    lines.push('');
    lines.push('def childrenAllowed (n : FCO) (resolve : _NodeId → Option _Type) : Bool :=');
    lines.push('  n._containment.all fun id =>');
    lines.push('    match resolve id with');
    lines.push('    | some t => allowed n._type t');
    lines.push('    | none => false');
    lines.push('');
    lines.push('def parentOf (n : FCO) : Option _NodeId :=');
    lines.push('  n._parent');
    lines.push('');
    for (const concept of allConcepts) {
      emitBounds(concept);
    }
  };

  lines.push(`inductive ${techType('Type')} where`);
  for (const conceptName of ['FCO', ...ordered.map(concept => concept.name)]) {
    lines.push(`  | ${ctorIdent(conceptName)}`);
  }
  lines.push('  deriving DecidableEq, Repr');
  lines.push('');

  emitted.clear();
  emitConcept(fco);
  const waiting = new Map(ordered.map(concept => [leanIdent(concept.name), concept]));
  const structReady = (typeName: string) => !waiting.has(typeName);
  while (waiting.size > 0) {
    let progressed = false;
    for (const [typeName, concept] of waiting) {
      if (concept.base && !structReady(leanIdent(concept.base))) {
        continue;
      }
      const fieldTypes = [...concept.pointers, ...concept.sets]
        .map(field => field.type.replace(/^(?:Option |List )/, ''))
        .filter(name => waiting.has(name) || refSums.has(name));
      const blocked = fieldTypes.some(name => {
        if (refSums.has(name)) {
          return !emitted.has(name);
        }
        return !structReady(name) && waiting.has(name);
      });
      const needsRef = fieldTypes.some(name => refSums.has(name) && !emitted.has(name));
      if (blocked || needsRef) {
        continue;
      }
      emitConcept(concept);
      waiting.delete(typeName);
      progressed = true;
    }
    if (!progressed) {
      for (const [refType, members] of refSums) {
        if (emitted.has(refType)) {
          continue;
        }
        if (members.some(member => waiting.has(leanIdent(member)))) {
          continue;
        }
        lines.push(`inductive ${refType} where`);
        for (const member of members) {
          lines.push(`  | ${ctorIdent(member)} : ${leanIdent(member)} → ${refType}`);
        }
        lines.push('  deriving Repr');
        lines.push('');
        lines.push(`def ${refType}._id : ${refType} → ${techType('NodeId')}`);
        for (const member of members) {
          lines.push(`  | .${ctorIdent(member)} node => node._id`);
        }
        lines.push('');
        lines.push(`def ${refType}.typeOf : ${refType} → ${techType('Type')}`);
        for (const member of members) {
          lines.push(`  | .${ctorIdent(member)} node => node._type`);
        }
        lines.push('');
        lines.push(`instance : BEq ${refType} where`);
        lines.push('  beq a b := a._id == b._id');
        lines.push('');
        emitted.add(refType);
        progressed = true;
      }
    }
    if (!progressed) {
      for (const concept of waiting.values()) {
        emitConcept(concept);
      }
      break;
    }
  }

  emitMetaRules();
  return lines.join('\n');
}

/**
 * Generate DSL grammar extension documentation
 */
export function generateDSLDocumentation(dsl: DomainDSL): string {
  const lines: string[] = [];
  
  lines.push('# Domain-Specific Constraint Language');
  lines.push('');
  lines.push('This document describes the constraint language for this domain.');
  lines.push('');
  lines.push('## Types');
  lines.push('');
  
  for (const typeDef of dsl.typeDefinitions) {
    lines.push(`### ${typeDef.name}`);
    lines.push('');
    
    if (typeDef.baseType) {
      lines.push(`Extends: ${typeDef.baseType}`);
      lines.push('');
    }
    
    if (typeDef.attributes.length > 0) {
      lines.push('**Attributes:**');
      for (const attr of typeDef.attributes) {
        lines.push(`- \`${attr.name}\`: ${attr.type}`);
      }
      lines.push('');
    }
    
    if (typeDef.pointers.length > 0) {
      lines.push('**Pointers:**');
      for (const ptr of typeDef.pointers) {
        const optStr = ptr.optional ? ' (optional)' : '';
        lines.push(`- \`${ptr.name}\` → ${ptr.targetTypes.join(' | ')}${optStr}`);
      }
      lines.push('');
    }
    
    if (typeDef.sets.length > 0) {
      lines.push('**Sets:**');
      for (const set of typeDef.sets) {
        lines.push(`- \`${set.name}\`: ${set.memberTypes.join(' | ')}`);
      }
      lines.push('');
    }
    
    if (typeDef.containments.length > 0) {
      lines.push('**Containments:**');
      for (const cont of typeDef.containments) {
        const cardStr = cont.max === null 
          ? `${cont.min}..*` 
          : `${cont.min}..${cont.max}`;
        lines.push(`- ${cont.childType} [${cardStr}]`);
      }
      lines.push('');
    }
  }
  
  lines.push('## Constraint Syntax');
  lines.push('');
  lines.push('### Quantifiers');
  lines.push('```');
  lines.push('forall <var> in <Type> [where <condition>]: <body>');
  lines.push('exists <var> in <Type> [where <condition>]: <body>');
  lines.push('```');
  lines.push('');
  lines.push('### Operators');
  lines.push('- Logical: `and`, `or`, `not`, `implies`');
  lines.push('- Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`');
  lines.push('- Membership: `in`');
  lines.push('');
  lines.push('### Functions');
  lines.push('- `count(collection)`: Count elements');
  lines.push('- `isEmpty(collection)`: Check if empty');
  lines.push('- `all(collection, predicate)`: All satisfy predicate');
  lines.push('- `any(collection, predicate)`: Some satisfy predicate');
  lines.push('- `unique(collection, attribute)`: Attribute values are unique');
  lines.push('');
  lines.push('### Navigation');
  lines.push('- `node.attribute`: Access attribute');
  lines.push('- `node.pointer`: Follow pointer');
  lines.push('- `node.setName`: Access set members');
  lines.push('- `node.children`: Get children');
  lines.push('- `node.parent`: Get parent');
  lines.push('- `node.siblings`: Get siblings');
  lines.push('');
  
  return lines.join('\n');
}
