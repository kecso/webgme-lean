/**
 * Constraint Explainer
 * 
 * Translates constraint DSL expressions into natural language descriptions.
 * Supports both LLM-based explanation and rule-based pattern matching.
 */

import { DomainDSL, TypeDefinition } from '../generator/dsl-generator';
import { createDomainContext, generateCompactContext } from './domain-context';
import { parseConstraint, ConstraintVisitor, parser } from '../dsl/parser';
import { defaultLexer } from '../dsl/lexer';
import {
  ConstraintExpression,
  QuantifierExpr,
  BinaryExpr,
  UnaryExpr,
  AttributeExpr,
  PointerExpr,
  SetExpr,
  LiteralExpr,
  VariableExpr,
  CallExpr
} from '../common/types';

export interface ExplanationConfig {
  domainDSL: DomainDSL;
  /** LLM provider for advanced explanations */
  llmProvider?: LLMProvider;
  /** Include examples in explanation */
  includeExamples?: boolean;
  /** Verbosity level */
  verbosity?: 'brief' | 'normal' | 'detailed';
}

export interface LLMProvider {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

export interface ExplanationResult {
  success: boolean;
  explanation?: string;
  summary?: string;
  examples?: {
    valid: string[];
    invalid: string[];
  };
  severity?: 'error' | 'warning' | 'info';
  technicalDetails?: string;
  error?: string;
}

/**
 * Explains constraints in natural language
 */
export class ConstraintExplainer {
  private domainDSL: DomainDSL;
  private llmProvider: LLMProvider | null;
  private includeExamples: boolean;
  private verbosity: 'brief' | 'normal' | 'detailed';
  private typeMap: Map<string, TypeDefinition>;

  constructor(config: ExplanationConfig) {
    this.domainDSL = config.domainDSL;
    this.llmProvider = config.llmProvider || null;
    this.includeExamples = config.includeExamples ?? true;
    this.verbosity = config.verbosity ?? 'normal';
    this.typeMap = new Map();
    
    for (const typeDef of config.domainDSL.typeDefinitions) {
      this.typeMap.set(typeDef.name, typeDef);
    }
  }

  /**
   * Explain a constraint block (with name, severity, and expression)
   */
  async explainConstraintBlock(constraintBlock: string): Promise<ExplanationResult> {
    const nameMatch = constraintBlock.match(/constraint\s+(\w+)\s*\[(error|warning|info)\]/);
    const commentMatch = constraintBlock.match(/\/\/\s*(.+)$/m);
    
    const constraintName = nameMatch?.[1] || 'Unknown';
    const severity = (nameMatch?.[2] as 'error' | 'warning' | 'info') || 'error';
    const comment = commentMatch?.[1] || '';

    const lines = constraintBlock.split('\n');
    const expressionLines: string[] = [];
    let foundHeader = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('constraint ')) {
        foundHeader = true;
        continue;
      }
      if (foundHeader && trimmed && !trimmed.startsWith('//')) {
        expressionLines.push(trimmed);
      }
    }
    
    const expression = expressionLines.join(' ').trim();
    
    if (!expression) {
      return {
        success: false,
        error: 'No constraint expression found'
      };
    }

    const ruleBasedResult = this.explainExpressionRuleBased(expression);
    
    let explanation = ruleBasedResult.explanation || '';
    let summary = ruleBasedResult.summary;
    let examples = ruleBasedResult.examples;

    if (this.llmProvider && this.verbosity === 'detailed') {
      try {
        const llmResult = await this.explainWithLLM(constraintBlock);
        if (llmResult.explanation) {
          explanation = llmResult.explanation;
          if (llmResult.examples) examples = llmResult.examples;
        }
      } catch {
      }
    }

    if (comment && !summary) {
      summary = comment;
    }

    const severityText = {
      error: 'This is a required constraint. If violated, the model is invalid.',
      warning: 'This is a recommended constraint. Violations indicate potential issues.',
      info: 'This is an informational constraint. Violations are noted but not problematic.'
    };

    return {
      success: true,
      explanation,
      summary: summary || explanation.split('.')[0] + '.',
      examples,
      severity,
      technicalDetails: this.verbosity === 'detailed' 
        ? `Severity: ${severity}\n${severityText[severity]}\n\nExpression: ${expression}`
        : undefined
    };
  }

  /**
   * Explain a single constraint expression
   */
  explainExpression(expression: string): ExplanationResult {
    return this.explainExpressionRuleBased(expression);
  }

  /**
   * Rule-based explanation of a constraint expression
   */
  private explainExpressionRuleBased(expression: string): ExplanationResult {
    try {
      const lexResult = defaultLexer.tokenize(expression);
      if (lexResult.errors.length > 0) {
        return {
          success: false,
          error: `Lexer error: ${lexResult.errors[0].message}`
        };
      }

      parser.input = lexResult.tokens;
      const cst = parser.constraint();
      
      if (parser.errors.length > 0) {
        return {
          success: false,
          error: `Parse error: ${parser.errors[0].message}`
        };
      }

      const visitor = new ConstraintVisitor();
      const ast = visitor.visit(cst);
      
      const explanation = this.explainAST(ast);
      
      return {
        success: true,
        explanation: explanation.text,
        summary: explanation.summary,
        examples: this.includeExamples ? this.generateExamples(ast) : undefined
      };

    } catch (e) {
      return {
        success: false,
        error: `Failed to parse expression: ${(e as Error).message}`
      };
    }
  }

  /**
   * Explain an AST node recursively
   */
  private explainAST(expr: ConstraintExpression, context: ExplainContext = {}): { text: string; summary?: string } {
    switch (expr.type) {
      case 'quantifier':
        return this.explainQuantifier(expr as QuantifierExpr, context);
      case 'binary':
        return this.explainBinary(expr as BinaryExpr, context);
      case 'unary':
        return this.explainUnary(expr as UnaryExpr, context);
      case 'attribute':
        return this.explainAttribute(expr as AttributeExpr, context);
      case 'pointer':
        return this.explainPointer(expr as PointerExpr, context);
      case 'set':
        return this.explainSet(expr as SetExpr, context);
      case 'literal':
        return this.explainLiteral(expr as LiteralExpr);
      case 'variable':
        return this.explainVariable(expr as VariableExpr, context);
      case 'call':
        return this.explainCall(expr as CallExpr, context);
      default:
        return { text: 'Unknown expression' };
    }
  }

  private explainQuantifier(expr: QuantifierExpr, context: ExplainContext): { text: string; summary?: string } {
    const varName = expr.variable;
    const domain = expr.domain;
    const domainLower = domain.toLowerCase();
    
    const newContext = { ...context, [varName]: { type: domain, name: varName } };
    
    const bodyExplanation = this.explainAST(expr.body, newContext);
    
    if (expr.quantifier === 'forall') {
      if (expr.condition) {
        const condExplanation = this.explainAST(expr.condition, newContext);
        
        if (this.isUniquenessPattern(expr)) {
          const attr = this.extractUniquenessAttribute(expr);
          return {
            text: `Every ${domainLower} must have a unique ${attr}. No two ${domainLower}s can share the same ${attr}.`,
            summary: `Unique ${attr} for ${domainLower}s`
          };
        }
        
        return {
          text: `For every ${domainLower} where ${condExplanation.text}, it must be that ${bodyExplanation.text}.`,
          summary: `${domain} condition check`
        };
      } else {
        return {
          text: `Every ${domainLower} must satisfy: ${bodyExplanation.text}.`,
          summary: `Constraint on all ${domainLower}s`
        };
      }
    } else {
      if (expr.condition) {
        const condExplanation = this.explainAST(expr.condition, newContext);
        return {
          text: `There must exist at least one ${domainLower} where ${condExplanation.text} and ${bodyExplanation.text}.`,
          summary: `Required ${domainLower} with condition`
        };
      } else {
        return {
          text: `There must exist at least one ${domainLower} such that ${bodyExplanation.text}.`,
          summary: `Required ${domainLower}`
        };
      }
    }
  }

  private explainBinary(expr: BinaryExpr, context: ExplainContext): { text: string; summary?: string } {
    const left = this.explainAST(expr.left, context);
    const right = this.explainAST(expr.right, context);
    
    const operators: Record<string, string> = {
      'and': 'and',
      'or': 'or',
      'implies': 'implies that',
      'equals': 'equals',
      'notEquals': 'is not equal to',
      'lessThan': 'is less than',
      'lessOrEqual': 'is at most',
      'greaterThan': 'is greater than',
      'greaterOrEqual': 'is at least',
      'in': 'is in'
    };
    
    const op = operators[expr.operator] || expr.operator;
    
    if (expr.operator === 'equals' && expr.left.type === 'variable' && expr.right.type === 'variable') {
      const leftVar = (expr.left as VariableExpr).name;
      const rightVar = (expr.right as VariableExpr).name;
      return {
        text: `${leftVar} and ${rightVar} are the same element`,
        summary: 'Identity check'
      };
    }
    
    if (expr.operator === 'notEquals' && expr.right.type === 'literal') {
      const rightLit = expr.right as LiteralExpr;
      if (rightLit.value === '' || rightLit.value === null) {
        return {
          text: `${left.text} is set (not empty or null)`,
          summary: 'Non-empty check'
        };
      }
    }
    
    return {
      text: `${left.text} ${op} ${right.text}`
    };
  }

  private explainUnary(expr: UnaryExpr, context: ExplainContext): { text: string; summary?: string } {
    const operand = this.explainAST(expr.operand, context);
    
    if (expr.operator === 'not') {
      return {
        text: `it is NOT the case that ${operand.text}`
      };
    }
    
    return { text: `${expr.operator} ${operand.text}` };
  }

  private explainAttribute(expr: AttributeExpr, context: ExplainContext): { text: string; summary?: string } {
    const target = this.explainAST(expr.target, context);
    return {
      text: `the ${expr.attribute} of ${target.text}`
    };
  }

  private explainPointer(expr: PointerExpr, context: ExplainContext): { text: string; summary?: string } {
    const target = this.explainAST(expr.target, context);
    return {
      text: `the ${expr.pointer} target of ${target.text}`
    };
  }

  private explainSet(expr: SetExpr, context: ExplainContext): { text: string; summary?: string } {
    const target = this.explainAST(expr.target, context);
    return {
      text: `the ${expr.setName} members of ${target.text}`
    };
  }

  private explainLiteral(expr: LiteralExpr): { text: string; summary?: string } {
    if (expr.value === null) return { text: 'null' };
    if (expr.value === true) return { text: 'true' };
    if (expr.value === false) return { text: 'false' };
    if (typeof expr.value === 'string') {
      return { text: expr.value === '' ? 'empty string' : `"${expr.value}"` };
    }
    return { text: String(expr.value) };
  }

  private explainVariable(expr: VariableExpr, context: ExplainContext): { text: string; summary?: string } {
    const info = context[expr.name];
    if (info) {
      return { text: `the ${info.type.toLowerCase()} (${expr.name})` };
    }
    return { text: expr.name };
  }

  private explainCall(expr: CallExpr, context: ExplainContext): { text: string; summary?: string } {
    const args = expr.arguments.map(a => this.explainAST(a, context).text);
    
    switch (expr.function) {
      case 'count':
        return { text: `the count of ${args[0]}` };
      case 'isEmpty':
        return { text: `${args[0]} is empty` };
      case 'all':
        return { text: `all elements in ${args[0]} satisfy the condition` };
      case 'any':
        return { text: `some element in ${args[0]} satisfies the condition` };
      case 'unique':
        return { text: `all ${args[1] || 'values'} in ${args[0]} are unique` };
      case 'reachableVia':
        return { text: `${args[0]} can reach ${args[1]} via ${args[2] || 'connections'}` };
      case 'reachableBy':
        return { text: `${args[0]} can reach ${args[1]} following ${args[2] || 'pointer'} links` };
      case 'connected':
        return { text: `${args[0]} is directly connected to ${args[1]}` };
      case 'pointingTo':
        return { text: `all ${args[1] || 'elements'} whose ${args[2] || 'pointer'} points to ${args[0]}` };
      case 'children':
        return { text: `the children of ${args[0]}` };
      case 'parent':
        return { text: `the parent of ${args[0]}` };
      case 'siblings':
        return { text: `the siblings of ${args[0]}` };
      default:
        return { text: `${expr.function}(${args.join(', ')})` };
    }
  }

  /**
   * Check if this is a uniqueness pattern (nested forall with equality check)
   */
  private isUniquenessPattern(expr: QuantifierExpr): boolean {
    if (expr.quantifier !== 'forall') return false;
    if (expr.body.type !== 'quantifier') return false;
    
    const inner = expr.body as QuantifierExpr;
    if (inner.quantifier !== 'forall') return false;
    if (!inner.condition) return false;
    if (inner.body.type !== 'binary') return false;
    
    const bodyBinary = inner.body as BinaryExpr;
    if (bodyBinary.operator !== 'equals') return false;
    if (bodyBinary.left.type !== 'variable' || bodyBinary.right.type !== 'variable') return false;
    
    const leftVar = (bodyBinary.left as VariableExpr).name;
    const rightVar = (bodyBinary.right as VariableExpr).name;
    
    return leftVar === expr.variable && rightVar === inner.variable;
  }

  private extractUniquenessAttribute(expr: QuantifierExpr): string {
    const inner = expr.body as QuantifierExpr;
    if (!inner.condition || inner.condition.type !== 'binary') return 'attribute';
    
    const cond = inner.condition as BinaryExpr;
    if (cond.left.type === 'attribute') {
      return (cond.left as AttributeExpr).attribute;
    }
    return 'attribute';
  }

  /**
   * Generate valid/invalid examples based on the constraint
   */
  private generateExamples(ast: ConstraintExpression): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    if (ast.type === 'quantifier') {
      const q = ast as QuantifierExpr;
      const domain = q.domain;
      
      if (q.quantifier === 'forall') {
        if (this.isUniquenessPattern(q)) {
          const attr = this.extractUniquenessAttribute(q);
          valid.push(`${domain} A (${attr}="foo"), ${domain} B (${attr}="bar") - unique ${attr}s`);
          invalid.push(`${domain} A (${attr}="foo"), ${domain} B (${attr}="foo") - duplicate ${attr}`);
        } else {
          valid.push(`All ${domain}s satisfying the required condition`);
          invalid.push(`A ${domain} that violates the condition`);
        }
      } else {
        valid.push(`Model containing at least one qualifying ${domain}`);
        invalid.push(`Model with no ${domain} that satisfies the condition`);
      }
    }

    return { valid, invalid };
  }

  /**
   * Use LLM for detailed explanation
   */
  private async explainWithLLM(constraintBlock: string): Promise<ExplanationResult> {
    if (!this.llmProvider) {
      return { success: false, error: 'No LLM provider configured' };
    }

    const context = generateCompactContext(this.domainDSL);
    
    const prompt = `${context}

Please explain the following constraint in natural language. Provide:
1. A plain English explanation of what this constraint enforces
2. Examples of valid and invalid model configurations
3. When this constraint would be useful

Constraint:
\`\`\`
${constraintBlock}
\`\`\``;

    const systemPrompt = `You are an expert in formal methods and model verification. 
Explain constraints clearly for users who may not be familiar with formal logic.
Use simple, direct language and concrete examples.`;

    try {
      const response = await this.llmProvider.complete(prompt, systemPrompt);
      
      return {
        success: true,
        explanation: response
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExplanationConfig>): void {
    if (config.domainDSL) {
      this.domainDSL = config.domainDSL;
      this.typeMap.clear();
      for (const typeDef of config.domainDSL.typeDefinitions) {
        this.typeMap.set(typeDef.name, typeDef);
      }
    }
    if (config.llmProvider) this.llmProvider = config.llmProvider;
    if (config.includeExamples !== undefined) this.includeExamples = config.includeExamples;
    if (config.verbosity) this.verbosity = config.verbosity;
  }
}

interface ExplainContext {
  [varName: string]: {
    type: string;
    name: string;
  };
}

export default ConstraintExplainer;
