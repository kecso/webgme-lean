/**
 * Language Server for the WebGME-Lean Constraint Language
 * 
 * Provides:
 * - Syntax validation
 * - Autocompletion for domain types, keywords, and attributes
 * - Hover documentation
 * - Diagnostics
 */

import { DomainDSL, TypeDefinition } from '../generator/dsl-generator';
import { defaultLexer } from '../dsl/lexer';
import { parser } from '../dsl/parser';

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Diagnostic {
  range: Range;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
}

export interface CompletionItem {
  label: string;
  kind: 'keyword' | 'type' | 'property' | 'function' | 'variable';
  detail?: string;
  documentation?: string;
  insertText?: string;
}

export interface HoverInfo {
  contents: string;
  range?: Range;
}

export interface LanguageServerConfig {
  domainDSL: DomainDSL;
}

const KEYWORDS = [
  { label: 'forall', detail: 'Universal quantifier', doc: 'forall <var> in <Type> [where <cond>]: <body>' },
  { label: 'exists', detail: 'Existential quantifier', doc: 'exists <var> in <Type> [where <cond>]: <body>' },
  { label: 'in', detail: 'Membership/iteration', doc: 'Used with forall/exists to iterate over a type' },
  { label: 'where', detail: 'Filter condition', doc: 'Optional filter in quantifier expressions' },
  { label: 'implies', detail: 'Logical implication', doc: 'A implies B: if A is true, then B must be true' },
  { label: 'and', detail: 'Logical AND', doc: 'Both conditions must be true' },
  { label: 'or', detail: 'Logical OR', doc: 'At least one condition must be true' },
  { label: 'not', detail: 'Logical NOT', doc: 'Negates the following condition' },
  { label: 'true', detail: 'Boolean literal', doc: 'Boolean true value' },
  { label: 'false', detail: 'Boolean literal', doc: 'Boolean false value' },
  { label: 'null', detail: 'Null literal', doc: 'Represents absence of value' },
];

const FUNCTIONS = [
  { label: 'count', detail: 'Count elements', doc: 'count(collection) - Returns the number of elements', insert: 'count($1)' },
  { label: 'isEmpty', detail: 'Check if empty', doc: 'isEmpty(collection) - True if collection has no elements. Use !isEmpty(x) for non-empty check.', insert: 'isEmpty($1)' },
  { label: 'all', detail: 'Universal check', doc: 'all(collection, predicate) - True if all elements satisfy predicate', insert: 'all($1, $2)' },
  { label: 'any', detail: 'Existential check', doc: 'any(collection, predicate) - True if any element satisfies predicate', insert: 'any($1, $2)' },
  { label: 'unique', detail: 'Uniqueness check', doc: 'unique(collection, attr) - True if attribute values are unique', insert: 'unique($1, $2)' },
  { label: 'reachableVia', detail: 'Reachability via edge objects', doc: 'reachableVia(src, tgt, ConnType, "srcPtr", "dstPtr") - Path exists through connection objects (e.g., Transitions)', insert: 'reachableVia($1, $2, ${3:Transition}, "${4:source}", "${5:target}")' },
  { label: 'reachableBy', detail: 'Reachability via pointer chain', doc: 'reachableBy(src, tgt, "ptrName") - Path exists following direct pointers (e.g., next)', insert: 'reachableBy($1, $2, "${3:next}")' },
  { label: 'connected', detail: 'Direct connection check', doc: 'connected(a, b, "ptrName") - True if a directly points to b', insert: 'connected($1, $2, "${3:target}")' },
];

const NAVIGATION = [
  { label: 'children', detail: 'Child nodes', doc: 'Get all child nodes of this node' },
  { label: 'parent', detail: 'Parent node', doc: 'Get the parent node' },
  { label: 'siblings', detail: 'Sibling nodes', doc: 'Get all sibling nodes (same parent)' },
];

const CONSTRAINT_STRUCTURE = [
  { label: 'constraintset', detail: 'Define constraint set', doc: 'constraintset <Name> for <Type>', insert: 'constraintset ${1:Name} for ${2:Type}\n\n' },
  { label: 'define', detail: 'Define helper function', doc: 'define name(params) = expression', insert: 'define ${1:name}(${2:param}) = ${3:expression}' },
  { label: 'constraint', detail: 'Define constraint', doc: 'constraint <Name> [severity]', insert: 'constraint ${1:Name} [${2:error}]\n// ${3:Description}\n${4:expression}' },
];

export class ConstraintLanguageServer {
  private domainDSL: DomainDSL;
  private typeMap: Map<string, TypeDefinition>;

  constructor(config: LanguageServerConfig) {
    this.domainDSL = config.domainDSL;
    this.typeMap = new Map();
    
    for (const typeDef of config.domainDSL.typeDefinitions) {
      this.typeMap.set(typeDef.name, typeDef);
    }
  }

  /**
   * Update the domain DSL (when metamodel changes)
   */
  updateDomainDSL(domainDSL: DomainDSL): void {
    this.domainDSL = domainDSL;
    this.typeMap.clear();
    for (const typeDef of domainDSL.typeDefinitions) {
      this.typeMap.set(typeDef.name, typeDef);
    }
  }

  /**
   * Validate document and return diagnostics
   */
  validate(text: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = text.split('\n');
    
    let inConstraint = false;
    let constraintBody = '';
    let constraintStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('constraintset ')) {
        const match = trimmed.match(/constraintset\s+(\w+)\s+for\s+(\w+)/);
        if (!match) {
          diagnostics.push({
            range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
            message: 'Invalid constraintset syntax. Expected: constraintset <Name> for <Type>',
            severity: 'error'
          });
        } else if (!this.typeMap.has(match[2])) {
          const startChar = line.indexOf(match[2]);
          diagnostics.push({
            range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + match[2].length } },
            message: `Unknown type '${match[2]}'. Available types: ${this.domainDSL.keywords.join(', ')}`,
            severity: 'error'
          });
        }
      } else if (trimmed.startsWith('constraint ')) {
        if (inConstraint && constraintBody.trim()) {
          const bodyDiags = this.validateConstraintBody(constraintBody.trim(), constraintStartLine);
          diagnostics.push(...bodyDiags);
        }
        
        const match = trimmed.match(/constraint\s+(\w+)(?:\s*\[(\w+)\])?/);
        if (!match) {
          diagnostics.push({
            range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
            message: 'Invalid constraint syntax. Expected: constraint <Name> [severity]',
            severity: 'error'
          });
        } else if (match[2] && !['error', 'warning', 'info'].includes(match[2])) {
          const startChar = line.indexOf('[') + 1;
          diagnostics.push({
            range: { start: { line: i, character: startChar }, end: { line: i, character: startChar + match[2].length } },
            message: `Invalid severity '${match[2]}'. Expected: error, warning, or info`,
            severity: 'warning'
          });
        }
        
        inConstraint = true;
        constraintBody = '';
        constraintStartLine = i + 1;
      } else if (inConstraint && trimmed && !trimmed.startsWith('//')) {
        constraintBody += ' ' + trimmed;
      }
    }

    if (inConstraint && constraintBody.trim()) {
      const bodyDiags = this.validateConstraintBody(constraintBody.trim(), constraintStartLine);
      diagnostics.push(...bodyDiags);
    }

    return diagnostics;
  }

  private validateConstraintBody(body: string, startLine: number): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    
    try {
      const lexResult = defaultLexer.tokenize(body);
      
      if (lexResult.errors.length > 0) {
        for (const error of lexResult.errors) {
          diagnostics.push({
            range: {
              start: { line: startLine, character: error.column || 0 },
              end: { line: startLine, character: (error.column || 0) + (error.length || 1) }
            },
            message: error.message,
            severity: 'error'
          });
        }
        return diagnostics;
      }

      parser.input = lexResult.tokens;
      parser.constraint();
      
      if (parser.errors.length > 0) {
        for (const error of parser.errors) {
          diagnostics.push({
            range: {
              start: { line: startLine, character: 0 },
              end: { line: startLine, character: body.length }
            },
            message: error.message,
            severity: 'error'
          });
        }
      }

      for (const token of lexResult.tokens) {
        if (token.tokenType.name === 'Identifier') {
          const name = token.image;
          if (name[0] === name[0].toUpperCase() && !this.typeMap.has(name)) {
            const knownKeywords = [...KEYWORDS.map(k => k.label), ...FUNCTIONS.map(f => f.label), ...NAVIGATION.map(n => n.label)];
            if (!knownKeywords.includes(name)) {
              diagnostics.push({
                range: {
                  start: { line: startLine, character: (token.startColumn || 1) - 1 },
                  end: { line: startLine, character: (token.endColumn || token.startColumn || 1) }
                },
                message: `Unknown type '${name}'. Did you mean one of: ${this.domainDSL.keywords.join(', ')}?`,
                severity: 'warning'
              });
            }
          }
        }
      }
    } catch (e) {
      diagnostics.push({
        range: {
          start: { line: startLine, character: 0 },
          end: { line: startLine, character: body.length }
        },
        message: `Parse error: ${(e as Error).message}`,
        severity: 'error'
      });
    }

    return diagnostics;
  }

  /**
   * Get completions at position
   */
  getCompletions(text: string, position: Position): CompletionItem[] {
    const lines = text.split('\n');
    const line = lines[position.line] || '';
    const prefix = line.substring(0, position.character);
    const completions: CompletionItem[] = [];

    if (prefix.trim() === '' || prefix.endsWith('\n')) {
      completions.push(...CONSTRAINT_STRUCTURE.map(s => ({
        label: s.label,
        kind: 'keyword' as const,
        detail: s.detail,
        documentation: s.doc,
        insertText: s.insert
      })));
    }

    if (/\b(forall|exists)\s+\w*$/.test(prefix)) {
      completions.push({
        label: 'in',
        kind: 'keyword',
        detail: 'Iterate over type',
        insertText: 'in '
      });
    }

    if (/\bin\s+\w*$/.test(prefix) || /for\s+\w*$/.test(prefix)) {
      for (const typeName of this.domainDSL.keywords) {
        const typeDef = this.typeMap.get(typeName);
        completions.push({
          label: typeName,
          kind: 'type',
          detail: `Domain type`,
          documentation: typeDef ? this.formatTypeDoc(typeDef) : undefined
        });
      }
    }

    const dotMatch = prefix.match(/(\w+)\.\s*(\w*)$/);
    if (dotMatch) {
      const varName = dotMatch[1];
      const partial = dotMatch[2] || '';
      
      completions.push(...NAVIGATION.map(n => ({
        label: n.label,
        kind: 'property' as const,
        detail: n.detail,
        documentation: n.doc
      })));

      for (const typeDef of this.domainDSL.typeDefinitions) {
        for (const attr of typeDef.attributes) {
          completions.push({
            label: attr.name,
            kind: 'property',
            detail: `${attr.type} attribute`,
            documentation: `Attribute from ${typeDef.name}`
          });
        }
        for (const ptr of typeDef.pointers) {
          completions.push({
            label: ptr.name,
            kind: 'property',
            detail: `Pointer to ${ptr.targetTypes.join(' | ')}`,
            documentation: ptr.optional ? 'Optional pointer' : 'Required pointer'
          });
        }
        for (const set of typeDef.sets) {
          completions.push({
            label: set.name,
            kind: 'property',
            detail: `Set of ${set.memberTypes.join(' | ')}`,
            documentation: 'Set member collection'
          });
        }
      }
    }

    if (!dotMatch) {
      completions.push(...KEYWORDS.map(k => ({
        label: k.label,
        kind: 'keyword' as const,
        detail: k.detail,
        documentation: k.doc
      })));

      completions.push(...FUNCTIONS.map(f => ({
        label: f.label,
        kind: 'function' as const,
        detail: f.detail,
        documentation: f.doc,
        insertText: f.insert
      })));
    }

    const wordMatch = prefix.match(/(\w+)$/);
    if (wordMatch) {
      const partial = wordMatch[1].toLowerCase();
      return completions.filter(c => 
        c.label.toLowerCase().startsWith(partial)
      );
    }

    return completions;
  }

  /**
   * Get hover information at position
   */
  getHover(text: string, position: Position): HoverInfo | null {
    const lines = text.split('\n');
    const line = lines[position.line] || '';
    
    const wordMatch = this.getWordAtPosition(line, position.character);
    if (!wordMatch) return null;

    const word = wordMatch.word;

    const keyword = KEYWORDS.find(k => k.label === word);
    if (keyword) {
      return {
        contents: `**${keyword.label}** - ${keyword.detail}\n\n${keyword.doc}`,
        range: {
          start: { line: position.line, character: wordMatch.start },
          end: { line: position.line, character: wordMatch.end }
        }
      };
    }

    const func = FUNCTIONS.find(f => f.label === word);
    if (func) {
      return {
        contents: `**${func.label}** - ${func.detail}\n\n${func.doc}`,
        range: {
          start: { line: position.line, character: wordMatch.start },
          end: { line: position.line, character: wordMatch.end }
        }
      };
    }

    const typeDef = this.typeMap.get(word);
    if (typeDef) {
      return {
        contents: this.formatTypeDoc(typeDef),
        range: {
          start: { line: position.line, character: wordMatch.start },
          end: { line: position.line, character: wordMatch.end }
        }
      };
    }

    for (const td of this.domainDSL.typeDefinitions) {
      const attr = td.attributes.find(a => a.name === word);
      if (attr) {
        return {
          contents: `**${attr.name}**: ${attr.type}\n\nAttribute of ${td.name}`,
          range: {
            start: { line: position.line, character: wordMatch.start },
            end: { line: position.line, character: wordMatch.end }
          }
        };
      }

      const ptr = td.pointers.find(p => p.name === word);
      if (ptr) {
        return {
          contents: `**${ptr.name}** → ${ptr.targetTypes.join(' | ')}\n\nPointer from ${td.name}${ptr.optional ? ' (optional)' : ' (required)'}`,
          range: {
            start: { line: position.line, character: wordMatch.start },
            end: { line: position.line, character: wordMatch.end }
          }
        };
      }
    }

    return null;
  }

  private getWordAtPosition(line: string, character: number): { word: string; start: number; end: number } | null {
    const match = line.match(/\w+/g);
    if (!match) return null;

    let pos = 0;
    for (const word of match) {
      const start = line.indexOf(word, pos);
      const end = start + word.length;
      if (character >= start && character <= end) {
        return { word, start, end };
      }
      pos = end;
    }
    return null;
  }

  private formatTypeDoc(typeDef: TypeDefinition): string {
    const lines: string[] = [`**${typeDef.name}**`];
    
    if (typeDef.baseType) {
      lines.push(`\nExtends: ${typeDef.baseType}`);
    }

    if (typeDef.attributes.length > 0) {
      lines.push('\n**Attributes:**');
      for (const attr of typeDef.attributes) {
        lines.push(`- \`${attr.name}\`: ${attr.type}`);
      }
    }

    if (typeDef.pointers.length > 0) {
      lines.push('\n**Pointers:**');
      for (const ptr of typeDef.pointers) {
        lines.push(`- \`${ptr.name}\` → ${ptr.targetTypes.join(' | ')}${ptr.optional ? ' (optional)' : ''}`);
      }
    }

    if (typeDef.sets.length > 0) {
      lines.push('\n**Sets:**');
      for (const set of typeDef.sets) {
        lines.push(`- \`${set.name}\`: ${set.memberTypes.join(' | ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format document
   */
  format(text: string): string {
    const lines = text.split('\n');
    const formatted: string[] = [];
    let indentLevel = 0;
    let inConstraintBody = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        formatted.push('');
        continue;
      }

      if (trimmed.startsWith('constraintset ')) {
        indentLevel = 0;
        formatted.push(trimmed);
        continue;
      }

      if (trimmed.startsWith('constraint ')) {
        indentLevel = 1;
        inConstraintBody = false;
        formatted.push('\n' + '  '.repeat(indentLevel - 1) + trimmed);
        continue;
      }

      if (trimmed.startsWith('//')) {
        formatted.push('  '.repeat(indentLevel) + trimmed);
        inConstraintBody = true;
        continue;
      }

      if (inConstraintBody || indentLevel > 0) {
        formatted.push('  '.repeat(indentLevel) + trimmed);
      } else {
        formatted.push(trimmed);
      }
    }

    return formatted.join('\n');
  }
}

export default ConstraintLanguageServer;
