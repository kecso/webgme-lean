/**
 * webgme-lean - Lean-based formal verification for WebGME domain models
 * 
 * This library provides:
 * - A domain-specific constraint language that uses concepts from your metamodel
 * - Translation of constraints to Lean 4 for formal verification
 * - WebGME plugin for integrated verification
 * 
 * @example
 * ```typescript
 * import { generateDomainDSL, translateConstraintSet, parseConstraint } from 'webgme-lean';
 * 
 * // Generate DSL from metamodel
 * const dsl = generateDomainDSL(metamodel);
 * 
 * // Parse and translate constraints
 * const expr = parseConstraint('forall s in State: s.name != ""');
 * const leanCode = translateConstraintSet(constraintSet, dsl);
 * ```
 */

export * from './common/types';

export { 
  generateDomainDSL, 
  generateLeanTypes, 
  generateDSLDocumentation,
  DomainDSL,
  TypeDefinition 
} from './generator/dsl-generator';

export { 
  translateConstraintSet, 
  translateConstraint,
  translateExpression,
  generateLeanModule,
  generateModelVerification 
} from './translator/lean-translator';

export { 
  parseConstraint,
  parser as constraintParser,
  ConstraintVisitor 
} from './dsl/parser';

export { 
  defaultLexer, 
  createDomainLexer, 
  allTokens 
} from './dsl/lexer';

export { 
  VerificationPlugin,
  PluginConfig 
} from './plugin/VerificationPlugin';
