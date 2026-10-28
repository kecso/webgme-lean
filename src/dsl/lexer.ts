/**
 * Lexer for the constraint DSL
 * 
 * The lexer is designed to be extensible with domain-specific keywords
 * that are generated from the metamodel.
 */

import { createToken, Lexer, TokenType } from 'chevrotain';

// Identifier is created first so a keyword can prefer it when the keyword is only a prefix.
export const Identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });

function keyword(name: string, pattern: RegExp) {
  return createToken({ name, pattern, longer_alt: Identifier });
}

// Keywords
export const Forall = keyword('Forall', /forall/);
export const Exists = keyword('Exists', /exists/);
export const In = keyword('In', /in/);
export const Where = keyword('Where', /where/);
export const Implies = keyword('Implies', /implies/);
export const And = keyword('And', /and/);
export const Or = keyword('Or', /or/);
export const Not = keyword('Not', /not|!/);
export const True = keyword('True', /true/);
export const False = keyword('False', /false/);
export const Null = keyword('Null', /null/);
export const IsEmpty = keyword('IsEmpty', /isEmpty/);
export const Define = keyword('Define', /define/);
export const Count = keyword('Count', /count/);
export const Sum = keyword('Sum', /sum/);
export const All = keyword('All', /all/);
export const Any = keyword('Any', /any/);
export const Children = keyword('Children', /children/);
export const Parent = keyword('Parent', /parent/);
export const Siblings = keyword('Siblings', /siblings/);
export const ReachableVia = keyword('ReachableVia', /reachableVia/);
export const ReachableBy = keyword('ReachableBy', /reachableBy/);
export const Connected = keyword('Connected', /connected/);
export const PointingTo = keyword('PointingTo', /pointingTo/);
export const Unique = keyword('Unique', /unique/);

// Operators
export const Equals = createToken({ name: 'Equals', pattern: /==/ });
export const NotEquals = createToken({ name: 'NotEquals', pattern: /!=/ });
export const LessOrEqual = createToken({ name: 'LessOrEqual', pattern: /<=/ });
export const GreaterOrEqual = createToken({ name: 'GreaterOrEqual', pattern: />=/ });
export const LessThan = createToken({ name: 'LessThan', pattern: /</ });
export const GreaterThan = createToken({ name: 'GreaterThan', pattern: />/ });
export const Arrow = createToken({ name: 'Arrow', pattern: /->/ });
export const DoubleArrow = createToken({ name: 'DoubleArrow', pattern: /=>/ });
export const Assign = createToken({ name: 'Assign', pattern: /=(?!=)/ });

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
  Assign,
  
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
  Define,
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
  PointingTo,
  Unique,
  
  // Identifier last
  Identifier
];

/**
 * Create a lexer with domain-specific keywords added
 */
export function createDomainLexer(domainKeywords: string[]): Lexer {
  const domainTokens: TokenType[] = domainKeywords.map(name =>
    createToken({ name: `Domain_${name}`, pattern: new RegExp(name), longer_alt: Identifier })
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
