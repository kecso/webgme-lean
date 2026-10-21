/**
 * Parser for the constraint DSL
 * 
 * Parses constraint expressions into an AST that can be translated to Lean.
 */

import { CstParser, CstNode, IToken } from 'chevrotain';
import * as L from './lexer';
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

export class ConstraintParser extends CstParser {
  constructor() {
    super(L.allTokens);
    this.performSelfAnalysis();
  }

  public constraint = this.RULE('constraint', () => {
    this.SUBRULE(this.impliesExpr);
  });

  private impliesExpr = this.RULE('impliesExpr', () => {
    this.SUBRULE(this.orExpr, { LABEL: 'lhs' });
    this.MANY(() => {
      this.CONSUME(L.Implies);
      this.SUBRULE2(this.orExpr, { LABEL: 'rhs' });
    });
  });

  private orExpr = this.RULE('orExpr', () => {
    this.SUBRULE(this.andExpr, { LABEL: 'lhs' });
    this.MANY(() => {
      this.CONSUME(L.Or);
      this.SUBRULE2(this.andExpr, { LABEL: 'rhs' });
    });
  });

  private andExpr = this.RULE('andExpr', () => {
    this.SUBRULE(this.notExpr, { LABEL: 'lhs' });
    this.MANY(() => {
      this.CONSUME(L.And);
      this.SUBRULE2(this.notExpr, { LABEL: 'rhs' });
    });
  });

  private notExpr = this.RULE('notExpr', () => {
    this.OPTION(() => {
      this.CONSUME(L.Not);
    });
    this.SUBRULE(this.comparisonExpr);
  });

  private comparisonExpr = this.RULE('comparisonExpr', () => {
    this.SUBRULE(this.primaryExpr, { LABEL: 'lhs' });
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(L.Equals) },
        { ALT: () => this.CONSUME(L.NotEquals) },
        { ALT: () => this.CONSUME(L.LessThan) },
        { ALT: () => this.CONSUME(L.LessOrEqual) },
        { ALT: () => this.CONSUME(L.GreaterThan) },
        { ALT: () => this.CONSUME(L.GreaterOrEqual) },
        { ALT: () => this.CONSUME(L.In) }
      ]);
      this.SUBRULE2(this.primaryExpr, { LABEL: 'rhs' });
    });
  });

  private primaryExpr = this.RULE('primaryExpr', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.quantifierExpr) },
      { ALT: () => this.SUBRULE(this.functionCallExpr) },
      { ALT: () => this.SUBRULE(this.memberAccessExpr) },
      { ALT: () => this.SUBRULE(this.literalExpr) },
      { ALT: () => this.SUBRULE(this.parenExpr) }
    ]);
  });

  private quantifierExpr = this.RULE('quantifierExpr', () => {
    this.OR([
      { ALT: () => this.CONSUME(L.Forall) },
      { ALT: () => this.CONSUME(L.Exists) }
    ]);
    this.CONSUME(L.Identifier, { LABEL: 'variable' });
    this.CONSUME(L.In);
    this.CONSUME2(L.Identifier, { LABEL: 'domain' });
    this.OPTION(() => {
      this.CONSUME(L.Where);
      this.SUBRULE(this.constraint, { LABEL: 'condition' });
    });
    this.CONSUME(L.Colon);
    this.SUBRULE2(this.constraint, { LABEL: 'body' });
  });

  private functionCallExpr = this.RULE('functionCallExpr', () => {
    this.OR([
      { ALT: () => this.CONSUME(L.Count) },
      { ALT: () => this.CONSUME(L.Sum) },
      { ALT: () => this.CONSUME(L.All) },
      { ALT: () => this.CONSUME(L.Any) },
      { ALT: () => this.CONSUME(L.IsEmpty) },
      { ALT: () => this.CONSUME(L.IsNotEmpty) },
      { ALT: () => this.CONSUME(L.Unique) },
      { ALT: () => this.CONSUME(L.ReachableVia) },
      { ALT: () => this.CONSUME(L.ReachableBy) },
      { ALT: () => this.CONSUME(L.Connected) }
    ]);
    this.CONSUME(L.LParen);
    this.SUBRULE(this.argumentList);
    this.CONSUME(L.RParen);
  });

  private argumentList = this.RULE('argumentList', () => {
    this.OPTION(() => {
      this.SUBRULE(this.constraint, { LABEL: 'arg' });
      this.MANY(() => {
        this.CONSUME(L.Comma);
        this.SUBRULE2(this.constraint, { LABEL: 'arg' });
      });
    });
  });

  private memberAccessExpr = this.RULE('memberAccessExpr', () => {
    this.CONSUME(L.Identifier, { LABEL: 'base' });
    this.MANY(() => {
      this.CONSUME(L.Dot);
      this.OR([
        { ALT: () => this.CONSUME(L.Children) },
        { ALT: () => this.CONSUME(L.Parent) },
        { ALT: () => this.CONSUME(L.Siblings) },
        { ALT: () => this.CONSUME2(L.Identifier, { LABEL: 'member' }) }
      ]);
    });
  });

  private literalExpr = this.RULE('literalExpr', () => {
    this.OR([
      { ALT: () => this.CONSUME(L.Integer) },
      { ALT: () => this.CONSUME(L.Float) },
      { ALT: () => this.CONSUME(L.StringLiteral) },
      { ALT: () => this.CONSUME(L.True) },
      { ALT: () => this.CONSUME(L.False) },
      { ALT: () => this.CONSUME(L.Null) }
    ]);
  });

  private parenExpr = this.RULE('parenExpr', () => {
    this.CONSUME(L.LParen);
    this.SUBRULE(this.constraint);
    this.CONSUME(L.RParen);
  });
}

// Singleton parser instance
export const parser = new ConstraintParser();

/**
 * Visitor to convert CST to AST
 */
export class ConstraintVisitor {
  visit(cst: CstNode): ConstraintExpression {
    return this.visitConstraint(cst);
  }

  private visitConstraint(cst: CstNode): ConstraintExpression {
    const children = cst.children;
    if (children.impliesExpr) {
      return this.visitImpliesExpr(children.impliesExpr[0] as CstNode);
    }
    throw new Error('Invalid constraint CST');
  }

  private visitImpliesExpr(cst: CstNode): ConstraintExpression {
    const children = cst.children;
    let result = this.visitOrExpr((children.lhs as CstNode[])[0]);
    
    if (children.rhs) {
      for (const rhs of children.rhs as CstNode[]) {
        const right = this.visitOrExpr(rhs);
        result = {
          type: 'binary',
          operator: 'implies',
          left: result,
          right
        } as BinaryExpr;
      }
    }
    
    return result;
  }

  private visitOrExpr(cst: CstNode): ConstraintExpression {
    const children = cst.children;
    let result = this.visitAndExpr((children.lhs as CstNode[])[0]);
    
    if (children.rhs) {
      for (const rhs of children.rhs as CstNode[]) {
        const right = this.visitAndExpr(rhs);
        result = {
          type: 'binary',
          operator: 'or',
          left: result,
          right
        } as BinaryExpr;
      }
    }
    
    return result;
  }

  private visitAndExpr(cst: CstNode): ConstraintExpression {
    const children = cst.children;
    let result = this.visitNotExpr((children.lhs as CstNode[])[0]);
    
    if (children.rhs) {
      for (const rhs of children.rhs as CstNode[]) {
        const right = this.visitNotExpr(rhs);
        result = {
          type: 'binary',
          operator: 'and',
          left: result,
          right
        } as BinaryExpr;
      }
    }
    
    return result;
  }

  private visitNotExpr(cst: CstNode): ConstraintExpression {
    const children = cst.children;
    const hasNot = children.Not !== undefined;
    const inner = this.visitComparisonExpr(children.comparisonExpr![0] as CstNode);
    
    if (hasNot) {
      return {
        type: 'unary',
        operator: 'not',
        operand: inner
      } as UnaryExpr;
    }
    
    return inner;
  }

  private visitComparisonExpr(cst: CstNode): ConstraintExpression {
    const children = cst.children;
    const left = this.visitPrimaryExpr((children.lhs as CstNode[])[0]);
    
    if (children.rhs) {
      let operator: string;
      if (children.Equals) operator = 'equals';
      else if (children.NotEquals) operator = 'notEquals';
      else if (children.LessThan) operator = 'lessThan';
      else if (children.LessOrEqual) operator = 'lessOrEqual';
      else if (children.GreaterThan) operator = 'greaterThan';
      else if (children.GreaterOrEqual) operator = 'greaterOrEqual';
      else if (children.In) operator = 'in';
      else throw new Error('Unknown comparison operator');

      const right = this.visitPrimaryExpr((children.rhs as CstNode[])[0]);
      return {
        type: 'binary',
        operator,
        left,
        right
      } as BinaryExpr;
    }
    
    return left;
  }

  private visitPrimaryExpr(cst: CstNode): ConstraintExpression {
    const children = cst.children;
    
    if (children.quantifierExpr) {
      return this.visitQuantifierExpr(children.quantifierExpr[0] as CstNode);
    }
    if (children.functionCallExpr) {
      return this.visitFunctionCallExpr(children.functionCallExpr[0] as CstNode);
    }
    if (children.memberAccessExpr) {
      return this.visitMemberAccessExpr(children.memberAccessExpr[0] as CstNode);
    }
    if (children.literalExpr) {
      return this.visitLiteralExpr(children.literalExpr[0] as CstNode);
    }
    if (children.parenExpr) {
      return this.visitParenExpr(children.parenExpr[0] as CstNode);
    }
    
    throw new Error('Invalid primary expression');
  }

  private visitQuantifierExpr(cst: CstNode): QuantifierExpr {
    const children = cst.children;
    const quantifier = children.Forall ? 'forall' : 'exists';
    const variable = (children.variable as IToken[])[0].image;
    const domain = (children.domain as IToken[])[0].image;
    const body = this.visitConstraint((children.body as CstNode[])[0]);
    
    let condition: ConstraintExpression | undefined;
    if (children.condition) {
      condition = this.visitConstraint((children.condition as CstNode[])[0]);
    }
    
    return {
      type: 'quantifier',
      quantifier,
      variable,
      domain,
      condition,
      body
    };
  }

  private visitFunctionCallExpr(cst: CstNode): CallExpr {
    const children = cst.children;
    let functionName: string;
    
    if (children.Count) functionName = 'count';
    else if (children.Sum) functionName = 'sum';
    else if (children.All) functionName = 'all';
    else if (children.Any) functionName = 'any';
    else if (children.IsEmpty) functionName = 'isEmpty';
    else if (children.IsNotEmpty) functionName = 'isNotEmpty';
    else if (children.Unique) functionName = 'unique';
    else if (children.ReachableVia) functionName = 'reachableVia';
    else if (children.ReachableBy) functionName = 'reachableBy';
    else if (children.Connected) functionName = 'connected';
    else throw new Error('Unknown function');

    const args: ConstraintExpression[] = [];
    const argList = children.argumentList![0] as CstNode;
    if (argList.children.arg) {
      for (const arg of argList.children.arg as CstNode[]) {
        args.push(this.visitConstraint(arg));
      }
    }
    
    return {
      type: 'call',
      function: functionName,
      arguments: args
    };
  }

  private visitMemberAccessExpr(cst: CstNode): ConstraintExpression {
    const children = cst.children;
    const base = (children.base as IToken[])[0].image;
    
    let result: ConstraintExpression = {
      type: 'variable',
      name: base
    } as VariableExpr;
    
    if (children.member) {
      for (const member of children.member as IToken[]) {
        const memberName = member.image;
        result = {
          type: 'attribute',
          target: (result as VariableExpr).name,
          attribute: memberName
        } as AttributeExpr;
      }
    }
    
    if (children.Children) {
      result = {
        type: 'call',
        function: 'children',
        arguments: [result]
      } as CallExpr;
    }
    
    if (children.Parent) {
      result = {
        type: 'call',
        function: 'parent',
        arguments: [result]
      } as CallExpr;
    }
    
    if (children.Siblings) {
      result = {
        type: 'call',
        function: 'siblings',
        arguments: [result]
      } as CallExpr;
    }
    
    return result;
  }

  private visitLiteralExpr(cst: CstNode): LiteralExpr {
    const children = cst.children;
    
    if (children.Integer) {
      return { type: 'literal', value: parseInt((children.Integer as IToken[])[0].image) };
    }
    if (children.Float) {
      return { type: 'literal', value: parseFloat((children.Float as IToken[])[0].image) };
    }
    if (children.StringLiteral) {
      const str = (children.StringLiteral as IToken[])[0].image;
      return { type: 'literal', value: str.slice(1, -1) };
    }
    if (children.True) {
      return { type: 'literal', value: true };
    }
    if (children.False) {
      return { type: 'literal', value: false };
    }
    if (children.Null) {
      return { type: 'literal', value: null };
    }
    
    throw new Error('Invalid literal');
  }

  private visitParenExpr(cst: CstNode): ConstraintExpression {
    return this.visitConstraint(cst.children.constraint![0] as CstNode);
  }
}

/**
 * Parse a constraint string into an AST
 */
export function parseConstraint(input: string): ConstraintExpression {
  const lexResult = L.defaultLexer.tokenize(input);
  
  if (lexResult.errors.length > 0) {
    throw new Error(`Lexer errors: ${lexResult.errors.map(e => e.message).join(', ')}`);
  }
  
  parser.input = lexResult.tokens;
  const cst = parser.constraint();
  
  if (parser.errors.length > 0) {
    throw new Error(`Parser errors: ${parser.errors.map(e => e.message).join(', ')}`);
  }
  
  const visitor = new ConstraintVisitor();
  return visitor.visit(cst);
}
