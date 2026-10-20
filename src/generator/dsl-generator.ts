/**
 * DSL Generator - Creates domain-specific constraint language from metamodel
 * 
 * This generator takes a WebGME metamodel and produces:
 * 1. Domain-specific keywords (type names as identifiers)
 * 2. Type definitions for the constraint language
 * 3. Validation rules based on metamodel constraints
 */

import { Metamodel, MetaNode, MetaAttribute, MetaPointer, MetaSet } from '../common/types';

export interface DomainDSL {
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
      memberTypes: set.memberTypes
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

/**
 * Generate Lean type definitions from the domain DSL
 */
export function generateLeanTypes(dsl: DomainDSL): string {
  const lines: string[] = [];
  
  lines.push('/-!');
  lines.push('# Generated Domain Types');
  lines.push('');
  lines.push('This file is auto-generated from the metamodel.');
  lines.push('-/');
  lines.push('');
  lines.push('import WebGMELean');
  lines.push('');
  lines.push('namespace Domain');
  lines.push('');
  lines.push('open WebGMELean');
  lines.push('');
  
  for (const typeDef of dsl.typeDefinitions) {
    lines.push(`/-- Check if a node is of type ${typeDef.name} -/`);
    lines.push(`def is${typeDef.name} (n : Node) : Bool := n.metaType == "${typeDef.name}"`);
    lines.push('');
    
    lines.push(`/-- Get all ${typeDef.name} nodes from a model -/`);
    lines.push(`def get${typeDef.name}s (m : Model) : List Node := m.getNodesByType "${typeDef.name}"`);
    lines.push('');
    
    for (const attr of typeDef.attributes) {
      const attrFunc = attr.type === 'string' ? 'Attr.getStringAttr'
        : attr.type === 'int' ? 'Attr.getIntAttr'
        : attr.type === 'float' ? 'Attr.getFloatAttr'
        : 'Attr.getBoolAttr';
      
      lines.push(`/-- Get ${attr.name} attribute from a ${typeDef.name} -/`);
      lines.push(`def ${typeDef.name}_${attr.name} (n : Node) : Option ${attr.leanType} := ${attrFunc} n "${attr.name}"`);
      lines.push('');
    }
    
    for (const ptr of typeDef.pointers) {
      lines.push(`/-- Get ${ptr.name} pointer target from a ${typeDef.name} -/`);
      lines.push(`def ${typeDef.name}_${ptr.name} (n : Node) : Option NodeId := n.getPointer "${ptr.name}"`);
      lines.push('');
    }
    
    for (const set of typeDef.sets) {
      lines.push(`/-- Get ${set.name} set members from a ${typeDef.name} -/`);
      lines.push(`def ${typeDef.name}_${set.name} (n : Node) : List NodeId := n.getSetMembers "${set.name}"`);
      lines.push('');
    }
  }
  
  lines.push('end Domain');
  
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
  lines.push('- `isNotEmpty(collection)`: Check if not empty');
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
