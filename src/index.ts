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
} from './plugins/VerificationPlugin';

export {
  ConstraintLanguageServer,
  Diagnostic,
  CompletionItem,
  HoverInfo
} from './lsp/constraint-language-server';

export {
  registerConstraintLanguage,
  createCompletionProvider,
  createHoverProvider,
  LANGUAGE_ID,
  monarchLanguage,
  languageConfiguration,
  darkTheme,
  lightTheme
} from './visualizers/monaco-config';

export {
  ConstraintEditor,
  ConstraintEditorWidget,
  ConstraintEditorControl
} from './visualizers/ConstraintEditor';

// NL Translation module
export {
  NLConstraintTranslator,
  TranslationConfig,
  TranslationResult,
  LLMProvider
} from './nl/nl-translator';

export {
  ConstraintExplainer,
  ExplanationConfig,
  ExplanationResult
} from './nl/constraint-explainer';

export {
  createDomainContext
} from './nl/domain-context';

// MCP Server for gmebot integration
export {
  ConstraintMCPServer,
  MCPServerConfig,
  MCPTool,
  MCPToolCall,
  MCPToolResult
} from './mcp/constraint-mcp-server';

export {
  createMCPHandler,
  createStdioServer,
  MCPHandlerConfig,
  MCPRequest,
  MCPResponse
} from './mcp/mcp-handler';

// WebGME Router
export {
  ConstraintRouter,
  createConstraintRouter,
  RouterConfig,
  RouterContext
} from './router/constraint-router';
