/**
 * Lexer for the constraint DSL
 * 
 * The lexer is designed to be extensible with domain-specific keywords
 * that are generated from the metamodel.
 */

import { createToken, Lexer, TokenType } from 'chevrotain';

// Keywords
export const Forall = createToken({ name: 'Forall', pattern: /forall/ });
export const Exists = createToken({ name: 'Exists', pattern: /exists/ });
export const In = createToken({ name: 'In', pattern: /in/ });
export const Where = createToken({ name: 'Where', pattern: /where/ });
export const Implies = createToken({ name: 'Implies', pattern: /implies/ });
export const And = createToken({ name: 'And', pattern: /and/ });
export const Or = createToken({ name: 'Or', pattern: /or/ });
export const Not = createToken({ name: 'Not', pattern: /not|!/ });
export const True = createToken({ name: 'True', pattern: /true/ });
export const False = createToken({ name: 'False', pattern: /false/ });
export const Null = createToken({ name: 'Null', pattern: /null/ });
export const IsEmpty = createToken({ name: 'IsEmpty', pattern: /isEmpty/ });
export const IsNotEmpty = createToken({ name: 'IsNotEmpty', pattern: /isNotEmpty/ });
export const Count = createToken({ name: 'Count', pattern: /count/ });
export const Sum = createToken({ name: 'Sum', pattern: /sum/ });
export const All = createToken({ name: 'All', pattern: /all/ });
export const Any = createToken({ name: 'Any', pattern: /any/ });
export const Children = createToken({ name: 'Children', pattern: /children/ });
export const Parent = createToken({ name: 'Parent', pattern: /parent/ });
export const Siblings = createToken({ name: 'Siblings', pattern: /siblings/ });
export const ReachableVia = createToken({ name: 'ReachableVia', pattern: /reachableVia/ });
export const ReachableBy = createToken({ name: 'ReachableBy', pattern: /reachableBy/ });
export const Connected = createToken({ name: 'Connected', pattern: /connected/ });
export const Unique = createToken({ name: 'Unique', pattern: /unique/ });

// Operators
export const Equals = createToken({ name: 'Equals', pattern: /==/ });
export const NotEquals = createToken({ name: 'NotEquals', pattern: /!=/ });
export const LessOrEqual = createToken({ name: 'LessOrEqual', pattern: /<=/ });
export const GreaterOrEqual = createToken({ name: 'GreaterOrEqual', pattern: />=/ });
export const LessThan = createToken({ name: 'LessThan', pattern: /</ });
export const GreaterThan = createToken({ name: 'GreaterThan', pattern: />/ });
export const Arrow = createToken({ name: 'Arrow', pattern: /->/ });
export const DoubleArrow = createToken({ name: 'DoubleArrow', pattern: /=>/ });

// Punctuation
export const Dot = createToken({ name: 'Dot', pattern: /\./ });
export const Comma = createToken({ name: 'Comma', pattern: /,/ });
export const Colon = createToken({ name: 'Colon', pattern: /:/ });
export const Semicolon = createToken({ name: 'Semicolon', pattern: /;/ });
export const LParen = createToken({ name: 'LParen', pattern: /\(/ });
export const RParen = createToken({ name: 'RParen', pattern: /\)/ });
export const LBracket = createToken({ name: 'LBracket', pattern: /\[/ });
export const RBracket = createToken({ name: 'RBracket', pattern: /\]/ });
export const LBrace = createToken({ name: 'LBrace', pattern: /\{/ });
export const RBrace = createToken({ name: 'RBrace', pattern: /\}/ });
export const At = createToken({ name: 'At', pattern: /@/ });
export const Hash = createToken({ name: 'Hash', pattern: /#/ });

// Literals
export const Integer = createToken({ name: 'Integer', pattern: /-?[0-9]+/ });
export const Float = createToken({ name: 'Float', pattern: /-?[0-9]+\.[0-9]+/ });
export const StringLiteral = createToken({ 
  name: 'StringLiteral', 
  pattern: /"[^"]*"|'[^']*'/ 
});

// Identifier - must come after keywords
export const Identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });

// Whitespace and comments
export const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: Lexer.SKIPPED
});

export const Comment = createToken({
  name: 'Comment',
  pattern: /\/\/[^\n]*/,
  group: Lexer.SKIPPED
});

export const BlockComment = createToken({
  name: 'BlockComment',
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED
});

// Base tokens in priority order (keywords before identifier)
const baseTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  BlockComment,
  
  // Multi-char operators first
  Equals,
  NotEquals,
  LessOrEqual,
  GreaterOrEqual,
  DoubleArrow,
  Arrow,
  
  // Single-char operators
  LessThan,
  GreaterThan,
  Dot,
  Comma,
  Colon,
  Semicolon,
  LParen,
  RParen,
  LBracket,
  RBracket,
  LBrace,
  RBrace,
  At,
  Hash,
  
  // Literals (float before integer for proper matching)
  Float,
  Integer,
  StringLiteral,
  
  // Keywords (before Identifier)
  Forall,
  Exists,
  In,
  Where,
  Implies,
  And,
  Or,
  Not,
  True,
  False,
  Null,
  IsEmpty,
  IsNotEmpty,
  Count,
  Sum,
  All,
  Any,
  Children,
  Parent,
  Siblings,
  ReachableVia,
  ReachableBy,
  Connected,
  Unique,
  
  // Identifier last
  Identifier
];

/**
 * Create a lexer with domain-specific keywords added
 */
export function createDomainLexer(domainKeywords: string[]): Lexer {
  const domainTokens: TokenType[] = domainKeywords.map(keyword =>
    createToken({ name: `Domain_${keyword}`, pattern: new RegExp(keyword) })
  );
  
  // Insert domain tokens before Identifier
  const allTokens = [
    ...baseTokens.slice(0, -1),
    ...domainTokens,
    Identifier
  ];
  
  return new Lexer(allTokens);
}

// Default lexer without domain-specific keywords
export const defaultLexer = new Lexer(baseTokens);

// Export all tokens for the parser
export const allTokens = baseTokens;
