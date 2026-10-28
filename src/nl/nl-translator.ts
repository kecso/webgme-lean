/**
 * Natural Language to Constraint Translator
 * 
 * Translates natural language descriptions of constraints into
 * the WebGME-Lean constraint DSL syntax.
 * 
 * This module provides the core translation logic that can be used by:
 * - MCP servers (for gmebot integration)
 * - WebGME routers (for HTTP API access)
 * - Direct widget integration
 */

import { DomainDSL } from '../generator/dsl-generator';
import { createDomainContext, generateCompactContext } from './domain-context';
import { parseConstraint } from '../dsl/parser';
import { defaultLexer } from '../dsl/lexer';
import { checkText } from '../common/constraintCheck';

export interface TranslationConfig {
  domainDSL: DomainDSL;
  /** 
   * LLM provider function - takes a prompt and returns the completion.
   * This allows flexibility in which LLM backend is used.
   */
  llmProvider?: LLMProvider;
  /** Existing constraints for context */
  existingConstraints?: string;
  /** Target constraint set name (defaults to "Constraints") */
  constraintSetName?: string;
  /** Target root type (defaults to first type in DSL) */
  rootType?: string;
}

export interface LLMProvider {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

export interface TranslationResult {
  success: boolean;
  constraint?: string;
  constraintName?: string;
  severity?: 'error' | 'warning' | 'info';
  explanation?: string;
  validationErrors?: string[];
  rawLLMOutput?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * The model often writes where where the body colon belongs, and leaves a
 * quantifier bare after not. Both are repaired before the text is checked.
 */
const REPAIR_ATTEMPTS = 2;

export function normalizeGeneratedConstraint(source: string): string {
  const lines = String(source || '').split('\n').map(line => line
    .replace(
      /^(\s*constraint\s+[A-Za-z_]\w*)\s+(error|warning|info)\s*$/,
      '$1 [$2]'
    )
    .replace(
      /^(\s*(?:not\s+)?(?:forall|exists)\s+[A-Za-z_]\w*\s+in\s+[A-Za-z_]\w*)\s+where\s*$/,
      '$1:'
    )
    .replace(
      /\b((?:forall|exists)\s+[A-Za-z_]\w*\s+in\s+[A-Za-z_]\w*)\s+where\s+(?=not\b|forall\b|exists\b)/,
      '$1: '
    ));
  return wrapNegatedQuantifiers(lines);
}

function wrapNegatedQuantifiers(lines: string[]): string {
  const next = lines.slice();
  for (let i = 0; i < next.length; i += 1) {
    const match = /^(.*\bnot\s+)(exists|forall)\b(.*)$/.exec(next[i]);
    if (!match) {
      continue;
    }
    next[i] = match[1] + '(' + match[2] + match[3];
    const base = leadingIndent(next[i]);
    let end = i;
    for (let j = i + 1; j < next.length; j += 1) {
      if (next[j].trim() === '') {
        end = j;
        continue;
      }
      if (leadingIndent(next[j]) <= base) {
        break;
      }
      end = j;
    }
    next[end] = next[end] + ')';
  }
  return next.join('\n');
}

function leadingIndent(line: string): number {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0].replace(/\t/g, '  ').length : 0;
}

function expressionOf(constraintCode: string): string {
  const lines = String(constraintCode || '').split('\n');
  const expr: string[] = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^constraint\s+[A-Za-z_]\w*/.test(trimmed)) {
      started = true;
      continue;
    }
    if (!trimmed || trimmed.startsWith('//')) {
      continue;
    }
    if (started && /^(constraint|define|constraintset)\b/.test(trimmed)) {
      break;
    }
    if (!started && /^(define|constraintset)\b/.test(trimmed)) {
      continue;
    }
    expr.push(trimmed);
  }
  return expr.join(' ').trim();
}

/**
 * NL to Constraint Translator
 */
export class NLConstraintTranslator {
  private domainDSL: DomainDSL;
  private llmProvider: LLMProvider | null;
  private existingConstraints: string;
  private constraintSetName: string;
  private rootType: string;

  constructor(config: TranslationConfig) {
    this.domainDSL = config.domainDSL;
    this.llmProvider = config.llmProvider || null;
    this.existingConstraints = config.existingConstraints || '';
    this.constraintSetName = config.constraintSetName || 'Constraints';
    this.rootType = config.rootType || config.domainDSL.keywords[0] || 'Root';
  }

  /**
   * Translate a natural language description to a constraint
   */
  async translate(naturalLanguage: string): Promise<TranslationResult> {
    if (!this.llmProvider) {
      return {
        success: false,
        validationErrors: ['No LLM provider configured']
      };
    }

    const context = generateCompactContext(this.domainDSL);
    const systemPrompt = this.buildSystemPrompt();

    try {
      let prompt = this.buildTranslationPrompt(naturalLanguage, context);
      let attempt = 0;

      while (attempt <= REPAIR_ATTEMPTS) {
        const rawOutput = await this.llmProvider.complete(prompt, systemPrompt);
        const parsed = this.parseTranslationResponse(rawOutput);
        if (parsed.constraint) {
          parsed.constraint = normalizeGeneratedConstraint(parsed.constraint);
        }

        if (!parsed.constraint) {
          attempt += 1;
          prompt = this.buildRepairPrompt(naturalLanguage, rawOutput, [
            'No constraint block was found. Return one constraint inside a constraint code block.'
          ]);
          continue;
        }

        const validation = this.validateConstraint(parsed.constraint);
        if (validation.valid) {
          return {
            success: true,
            constraint: parsed.constraint,
            constraintName: parsed.constraintName,
            severity: parsed.severity,
            explanation: parsed.explanation,
            rawLLMOutput: rawOutput
          };
        }

        attempt += 1;
        prompt = this.buildRepairPrompt(naturalLanguage, parsed.constraint, validation.errors);
      }

      return {
        success: false,
        validationErrors: ['That could not be written as a constraint. Try describing it another way.']
      };

    } catch (error) {
      return {
        success: false,
        validationErrors: [`Translation error: ${(error as Error).message}`]
      };
    }
  }

  /**
   * Generate a constraint template without LLM
   * Uses pattern matching on common constraint patterns
   */
  generateTemplate(naturalLanguage: string): TranslationResult {
    const lower = naturalLanguage.toLowerCase();
    
    const patterns = [
      {
        match: /every\s+(\w+)\s+must\s+have\s+(?:a\s+)?unique\s+(\w+)/i,
        generate: (m: RegExpMatchArray) => {
          const type = this.findMatchingType(m[1]);
          const attr = m[2];
          return {
            constraint: `constraint Unique${type}${this.capitalize(attr)} [error]\n// Every ${type.toLowerCase()} must have a unique ${attr}\nforall e1 in ${type}:\n  forall e2 in ${type} where e1.${attr} == e2.${attr}:\n    e1 == e2`,
            constraintName: `Unique${type}${this.capitalize(attr)}`
          };
        }
      },
      {
        match: /every\s+(\w+)\s+must\s+have\s+(?:a\s+)?(?:non-empty\s+)?(\w+)/i,
        generate: (m: RegExpMatchArray) => {
          const type = this.findMatchingType(m[1]);
          const attr = m[2];
          return {
            constraint: `constraint ${type}Has${this.capitalize(attr)} [error]\n// Every ${type.toLowerCase()} must have a ${attr}\nforall e in ${type}: e.${attr} != ""`,
            constraintName: `${type}Has${this.capitalize(attr)}`
          };
        }
      },
      {
        match: /there\s+must\s+be\s+(?:at\s+least\s+)?(?:one|an?)\s+(\w+)/i,
        generate: (m: RegExpMatchArray) => {
          const type = this.findMatchingType(m[1]);
          return {
            constraint: `constraint ${type}Exists [error]\n// There must be at least one ${type.toLowerCase()}\nexists e in ${type}: true`,
            constraintName: `${type}Exists`
          };
        }
      },
      {
        match: /no\s+(\w+)\s+(?:can|should)\s+(?:have\s+)?(?:a\s+)?self[- ]?loop/i,
        generate: (m: RegExpMatchArray) => {
          const type = this.findMatchingType(m[1]);
          return {
            constraint: `constraint No${type}SelfLoop [error]\n// No ${type.toLowerCase()} should have a self-loop\nforall e in ${type}: e->source != e->target`,
            constraintName: `No${type}SelfLoop`
          };
        }
      },
      {
        match: /(\w+)\s+(?:cannot|must\s+not|should\s+not)\s+be\s+both\s+(\w+)\s+and\s+(\w+)/i,
        generate: (m: RegExpMatchArray) => {
          const type = this.findMatchingType(m[1]);
          const attr1 = m[2];
          const attr2 = m[3];
          return {
            constraint: `constraint ${type}Not${this.capitalize(attr1)}And${this.capitalize(attr2)} [error]\n// A ${type.toLowerCase()} cannot be both ${attr1} and ${attr2}\nforall e in ${type}: not (e.${attr1} == true and e.${attr2} == true)`,
            constraintName: `${type}Not${this.capitalize(attr1)}And${this.capitalize(attr2)}`
          };
        }
      },
      {
        match: /only\s+one\s+(\w+)\s+(?:can|should)\s+be\s+(\w+)/i,
        generate: (m: RegExpMatchArray) => {
          const type = this.findMatchingType(m[1]);
          const attr = m[2];
          return {
            constraint: `constraint Single${this.capitalize(attr)}${type} [error]\n// Only one ${type.toLowerCase()} can be ${attr}\nforall e1 in ${type} where e1.${attr} == true:\n  forall e2 in ${type} where e2.${attr} == true:\n    e1 == e2`,
            constraintName: `Single${this.capitalize(attr)}${type}`
          };
        }
      }
    ];

    for (const pattern of patterns) {
      const match = lower.match(pattern.match);
      if (match) {
        const result = pattern.generate(match);
        const validation = this.validateConstraint(result.constraint);
        return {
          success: validation.valid,
          constraint: result.constraint,
          constraintName: result.constraintName,
          severity: 'error',
          validationErrors: validation.errors.length > 0 ? validation.errors : undefined
        };
      }
    }

    return {
      success: false,
      validationErrors: ['Could not match natural language to a known pattern. Please use LLM-based translation or write the constraint manually.']
    };
  }

  /**
   * Validate a constraint expression
   */
  validateConstraint(constraintCode: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const expression = expressionOf(constraintCode);

    if (!expression) {
      errors.push('No constraint expression found');
      return { valid: false, errors, warnings };
    }

    const lexResult = defaultLexer.tokenize(expression);
    if (lexResult.errors.length > 0) {
      for (const error of lexResult.errors) {
        errors.push(`Lexer error: ${error.message}`);
      }
      return { valid: false, errors, warnings };
    }

    for (const token of lexResult.tokens) {
      if (token.tokenType.name === 'Identifier') {
        const name = token.image;
        if (name[0] === name[0].toUpperCase() && !this.domainDSL.keywords.includes(name)) {
          const suggestion = this.findSimilarType(name);
          if (suggestion) {
            errors.push(`Unknown type '${name}'. Did you mean '${suggestion}'?`);
          } else {
            errors.push(`Unknown type '${name}'. Available types: ${this.domainDSL.keywords.join(', ')}`);
          }
        }
      }
    }

    if (/^\s*constraint\s+/m.test(constraintCode)) {
      const dialect = checkText(constraintCode);
      if (!dialect.ok) {
        dialect.messages.forEach(message => errors.push(message.message));
      }
    } else {
      try {
        parseConstraint(expression);
      } catch (e) {
        errors.push(`Parse error: ${(e as Error).message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TranslationConfig>): void {
    if (config.domainDSL) this.domainDSL = config.domainDSL;
    if (config.llmProvider) this.llmProvider = config.llmProvider;
    if (config.existingConstraints !== undefined) this.existingConstraints = config.existingConstraints;
    if (config.constraintSetName) this.constraintSetName = config.constraintSetName;
    if (config.rootType) this.rootType = config.rootType;
  }

  private buildSystemPrompt(): string {
    return `You are an expert in formal constraint specification. You translate natural language descriptions into domain-specific constraint language syntax.

Your output MUST be valid constraint syntax that can be parsed. Always respond with:
1. A constraint block with name and severity
2. A comment describing what it does
3. The constraint expression using forall/exists quantifiers

A quantifier body always starts with a colon:
  forall init in InitState:
    true
where is only a filter, and it comes before the colon:
  forall e2 in State where e1.name == e2.name:
    e1 == e2
Never write where where the colon belongs.

not, and, or, and implies take expressions. Put a quantifier in parentheses when it is an expression:
  forall init in InitState:
    not (exists trans in Transition:
      trans->dst == init)

Format your response as:
\`\`\`constraint
constraint <Name> [severity]
// <Description>
<expression>
\`\`\`

Followed by a brief explanation in natural language.`;
  }

  private buildRepairPrompt(description: string, attempt: string, errors: string[]): string {
    const problems = errors.length ? errors.map(error => `- ${error}`).join('\n') : '- The constraint does not parse.';
    return `${generateCompactContext(this.domainDSL)}

The constraint for this description does not parse yet:

"${description}"

Attempt:
${attempt}

Problems:
${problems}

Return one corrected constraint block and nothing else. The header is \`constraint Name [error]\`, \`[warning]\`, or \`[info]\`. A quantifier body starts with a colon. Put parentheses around a quantifier used as an expression. Use only types from the domain.`;
  }

  private buildTranslationPrompt(nl: string, context: string): string {
    let prompt = `${context}\n\n`;
    
    if (this.existingConstraints) {
      prompt += `## Existing Constraints in this project:\n\`\`\`\n${this.existingConstraints}\n\`\`\`\n\n`;
    }
    
    prompt += `## Task
Translate the following natural language description into a constraint:

"${nl}"

Remember:
- Use the types and attributes defined in this domain
- Choose an appropriate severity level (error for must-have, warning for should-have, info for nice-to-have)
- Use descriptive constraint names in PascalCase
- Add a comment explaining the constraint
- Start each quantifier body with a colon. Use where only to filter, before the colon
- Wrap a quantifier in parentheses when it is an expression, as in not (exists t in Transition: t->dst == init)

Respond with the constraint code block followed by a brief explanation.`;

    return prompt;
  }

  private parseTranslationResponse(response: string): {
    constraint?: string;
    constraintName?: string;
    severity?: 'error' | 'warning' | 'info';
    explanation?: string;
  } {
    const codeBlockMatch = response.match(/```(?:constraint)?\s*\n?([\s\S]*?)```/);
    
    if (!codeBlockMatch) {
      const constraintMatch = response.match(/constraint\s+(\w+)\s*\[(error|warning|info)\][^]*?(?=\n\n|$)/m);
      if (constraintMatch) {
        return {
          constraint: constraintMatch[0].trim(),
          constraintName: constraintMatch[1],
          severity: constraintMatch[2] as 'error' | 'warning' | 'info'
        };
      }
      return {};
    }

    const constraint = codeBlockMatch[1].trim();
    const nameMatch = constraint.match(/constraint\s+(\w+)\s*\[(error|warning|info)\]/);
    
    const afterCode = response.slice(response.indexOf('```', response.indexOf('```') + 3) + 3).trim();
    
    return {
      constraint,
      constraintName: nameMatch?.[1],
      severity: nameMatch?.[2] as 'error' | 'warning' | 'info' | undefined,
      explanation: afterCode || undefined
    };
  }

  private findMatchingType(input: string): string {
    const lower = input.toLowerCase();
    for (const type of this.domainDSL.keywords) {
      if (type.toLowerCase() === lower || type.toLowerCase() === lower + 's' || type.toLowerCase() + 's' === lower) {
        return type;
      }
    }
    return this.capitalize(input);
  }

  private findSimilarType(input: string): string | null {
    const lower = input.toLowerCase();
    for (const type of this.domainDSL.keywords) {
      if (this.levenshteinDistance(type.toLowerCase(), lower) <= 2) {
        return type;
      }
    }
    return null;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

export default NLConstraintTranslator;
