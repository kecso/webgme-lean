/**
 * Domain Context Generator
 * 
 * Generates LLM-friendly context from a domain DSL to help
 * the model understand the available types, attributes, and syntax.
 * 
 * TODO: WebGME meta language features not yet fully captured:
 * - Mixins: Multiple inheritance mechanism where mixins provide rules only
 *   (like interfaces), while base types provide rules + data + structure
 * - Set cardinality: Sets have min/max cardinality constraints
 * - Global containment cardinality: Cross-cutting containment rules
 * 
 * These should be added to DomainDSL and reflected in the context generation.
 */

import { DomainDSL, TypeDefinition } from '../generator/dsl-generator';

export interface DomainContext {
  systemPrompt: string;
  syntaxReference: string;
  typeDescriptions: string;
  examples: string;
}

/**
 * Create a rich context description from a domain DSL
 * This is used as system/context for LLM prompts
 */
export function createDomainContext(domainDSL: DomainDSL): DomainContext {
  return {
    systemPrompt: generateSystemPrompt(domainDSL),
    syntaxReference: generateSyntaxReference(),
    typeDescriptions: generateTypeDescriptions(domainDSL),
    examples: generateExamples(domainDSL)
  };
}

function generateSystemPrompt(dsl: DomainDSL): string {
  const typeNames = dsl.keywords.join(', ');
  
  return `You are an expert in formal constraint specification for WebGME domain models.
Your task is to translate between natural language descriptions and a domain-specific constraint language.

This domain has the following types: ${typeNames}

The constraint language uses first-order logic with quantifiers (forall, exists) and supports:
- Navigation through attributes (node.attrName)
- Navigation through pointers (node->ptrName) - use arrow notation to avoid ambiguity with attributes
- Navigation through sets (node[setName])
- Logical operators (and, or, not, implies)
- Comparison operators (==, !=, <, <=, >, >=)
- Built-in functions (count, isEmpty, all, any, unique, reachableVia, reachableBy, connected, pointingTo)

When translating natural language to constraints:
1. Identify the types and relationships mentioned
2. Determine if it's a universal (forall) or existential (exists) statement
3. Express the constraint using the appropriate syntax
4. Use descriptive constraint names

When explaining constraints in natural language:
1. Describe what the constraint enforces in plain English
2. Explain the severity level (error, warning, info)
3. Give examples of valid and invalid model configurations`;
}

function generateSyntaxReference(): string {
  return `## Constraint Language Syntax Reference

### Constraint Structure
\`\`\`
constraintset <Name> for <RootType>

// Optional helper functions
define <funcName>(<params>) = <expression>

constraint <ConstraintName> [severity]
// Comment describing the constraint
<expression>
\`\`\`

### Quantifiers
\`\`\`
forall <var> in <Type> [where <condition>]: <body>
exists <var> in <Type> [where <condition>]: <body>
\`\`\`

### Operators
- Logical: \`and\`, \`or\`, \`not\`, \`implies\`
- Comparison: \`==\`, \`!=\`, \`<\`, \`<=\`, \`>\`, \`>=\`
- Membership: \`in\`

### Navigation
- Attribute: \`node.attributeName\` (e.g., \`state.name\`)
- Pointer: \`node->pointerName\` (e.g., \`transition->source\`) - always use arrow notation
- Set: \`node[setName]\` (e.g., \`container[members]\`)
- Children: \`node.children\`
- Parent: \`node.parent\`
- Siblings: \`node.siblings\`

Note: Dot notation (.) is reserved for attributes only. Use arrow notation (->) for pointers
to avoid ambiguity when attribute and pointer names might clash.

### Built-in Functions
- \`count(collection)\` - Number of elements
- \`isEmpty(collection)\` - Check if empty
- \`all(collection, predicate)\` - All elements satisfy predicate
- \`any(collection, predicate)\` - Some element satisfies predicate
- \`unique(collection, attr)\` - Attribute values are unique
- \`reachableVia(src, dst, ConnType, "srcPtr", "dstPtr")\` - Path exists through connection objects
- \`reachableBy(src, dst, "ptrName")\` - Path exists via pointer chain
- \`connected(a, b, "ptrName")\` - Direct connection exists
- \`pointingTo(node, Type, "ptrName")\` - Find nodes whose pointer targets this node

### Severity Levels
- \`[error]\` - Model is invalid if constraint fails
- \`[warning]\` - Model may have issues
- \`[info]\` - Informational check`;
}

function generateTypeDescriptions(dsl: DomainDSL): string {
  const lines: string[] = ['## Domain Types'];
  
  for (const typeDef of dsl.typeDefinitions) {
    lines.push('');
    lines.push(`### ${typeDef.name}`);
    
    if (typeDef.baseType) {
      lines.push(`Extends: ${typeDef.baseType}`);
    }
    
    if (typeDef.attributes.length > 0) {
      lines.push('');
      lines.push('**Attributes:**');
      for (const attr of typeDef.attributes) {
        lines.push(`- \`${attr.name}\` (${attr.type})`);
      }
    }
    
    if (typeDef.pointers.length > 0) {
      lines.push('');
      lines.push('**Pointers (→):**');
      for (const ptr of typeDef.pointers) {
        const optStr = ptr.optional ? ' (optional)' : ' (required)';
        lines.push(`- \`${ptr.name}\` → ${ptr.targetTypes.join(' | ')}${optStr}`);
      }
    }
    
    if (typeDef.sets.length > 0) {
      lines.push('');
      lines.push('**Sets:**');
      for (const set of typeDef.sets) {
        lines.push(`- \`${set.name}\`: collection of ${set.memberTypes.join(' | ')}`);
      }
    }
    
    if (typeDef.containments.length > 0) {
      lines.push('');
      lines.push('**Can contain:**');
      for (const cont of typeDef.containments) {
        const cardStr = cont.max === null 
          ? `${cont.min}..*` 
          : `${cont.min}..${cont.max}`;
        lines.push(`- ${cont.childType} [${cardStr}]`);
      }
    }
  }
  
  return lines.join('\n');
}

function generateExamples(dsl: DomainDSL): string {
  const examples: string[] = ['## Example Constraints'];
  
  if (dsl.typeDefinitions.length > 0) {
    const firstType = dsl.typeDefinitions[0];
    const typeName = firstType.name;
    
    examples.push('');
    examples.push('### Uniqueness Constraint');
    examples.push('**Natural Language:** "Every ' + typeName.toLowerCase() + ' must have a unique name"');
    examples.push('**Constraint:**');
    examples.push('```');
    examples.push(`constraint Unique${typeName}Names [error]`);
    examples.push(`forall e1 in ${typeName}:`);
    examples.push(`  forall e2 in ${typeName} where e1.name == e2.name:`);
    examples.push('    e1 == e2');
    examples.push('```');
    
    if (firstType.attributes.length > 0) {
      const attr = firstType.attributes[0];
      examples.push('');
      examples.push('### Attribute Constraint');
      examples.push(`**Natural Language:** "Every ${typeName.toLowerCase()} must have a non-empty ${attr.name}"`);
      examples.push('**Constraint:**');
      examples.push('```');
      examples.push(`constraint ${typeName}Has${capitalize(attr.name)} [error]`);
      examples.push(`forall e in ${typeName}: e.${attr.name} != ""`);
      examples.push('```');
    }
    
    if (firstType.pointers.length > 0) {
      const ptr = firstType.pointers[0];
      examples.push('');
      examples.push('### Pointer Constraint');
      examples.push(`**Natural Language:** "Every ${typeName.toLowerCase()} must have its ${ptr.name} pointer set"`);
      examples.push('**Constraint:**');
      examples.push('```');
      examples.push(`constraint ${typeName}Has${capitalize(ptr.name)} [error]`);
      examples.push(`forall e in ${typeName}: e->${ptr.name} != null`);
      examples.push('```');
    }
    
    examples.push('');
    examples.push('### Existence Constraint');
    examples.push(`**Natural Language:** "There must be at least one ${typeName.toLowerCase()}"`);
    examples.push('**Constraint:**');
    examples.push('```');
    examples.push(`constraint ${typeName}Exists [error]`);
    examples.push(`exists e in ${typeName}: true`);
    examples.push('```');
  }
  
  return examples.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generate a compact context string for inclusion in prompts
 */
export function generateCompactContext(dsl: DomainDSL): string {
  const ctx = createDomainContext(dsl);
  return [
    ctx.systemPrompt,
    '',
    ctx.typeDescriptions,
    '',
    ctx.syntaxReference,
    '',
    ctx.examples
  ].join('\n');
}
