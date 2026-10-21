/**
 * MCP Server for Constraint Translation
 * 
 * Provides MCP (Model Context Protocol) tools for:
 * - Translating natural language to constraint DSL
 * - Explaining constraints in natural language
 * - Validating constraint syntax
 * - Getting domain information
 * 
 * This server can be used by gmebot or any MCP-compatible client
 * to provide AI-assisted constraint authoring.
 */

import { NLConstraintTranslator, type TranslationConfig, type LLMProvider } from '../nl/nl-translator';
import { ConstraintExplainer, type ExplanationConfig } from '../nl/constraint-explainer';
import { createDomainContext, generateCompactContext } from '../nl/domain-context';
import { DomainDSL } from '../generator/dsl-generator';
import { Metamodel } from '../common/types';
import { generateDomainDSL } from '../generator/dsl-generator';

export interface MCPServerConfig {
  /** Domain DSL or Metamodel to generate it from */
  domainDSL?: DomainDSL;
  metamodel?: Metamodel;
  /** Optional LLM provider for advanced translations */
  llmProvider?: LLMProvider;
  /** Server name for identification */
  serverName?: string;
  /** Server version */
  version?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * MCP Server implementation for constraint translation
 */
export class ConstraintMCPServer {
  private domainDSL: DomainDSL | null = null;
  private translator: NLConstraintTranslator | null = null;
  private explainer: ConstraintExplainer | null = null;
  private llmProvider: LLMProvider | null = null;
  private serverName: string;
  private version: string;

  constructor(config: MCPServerConfig = {}) {
    this.serverName = config.serverName || 'webgme-lean-constraints';
    this.version = config.version || '1.0.0';
    this.llmProvider = config.llmProvider || null;

    if (config.domainDSL) {
      this.setDomainDSL(config.domainDSL);
    } else if (config.metamodel) {
      this.setMetamodel(config.metamodel);
    }
  }

  /**
   * Set the domain DSL directly
   */
  setDomainDSL(dsl: DomainDSL): void {
    this.domainDSL = dsl;
    this.initializeServices();
  }

  /**
   * Set domain from metamodel
   */
  setMetamodel(metamodel: Metamodel): void {
    this.domainDSL = generateDomainDSL(metamodel);
    this.initializeServices();
  }

  /**
   * Set the LLM provider
   */
  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
    this.initializeServices();
  }

  private initializeServices(): void {
    if (this.domainDSL) {
      this.translator = new NLConstraintTranslator({
        domainDSL: this.domainDSL,
        llmProvider: this.llmProvider || undefined
      });

      this.explainer = new ConstraintExplainer({
        domainDSL: this.domainDSL,
        llmProvider: this.llmProvider || undefined
      });
    }
  }

  /**
   * Get server info (for MCP initialize)
   */
  getServerInfo(): { name: string; version: string } {
    return {
      name: this.serverName,
      version: this.version
    };
  }

  /**
   * List available tools
   */
  listTools(): MCPTool[] {
    return [
      {
        name: 'translate_constraint',
        description: 'Translate a natural language description into a formal constraint in the domain-specific constraint language. Use this when you want to create a new constraint from a plain English description.',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Natural language description of the constraint (e.g., "Every state must have a unique name")'
            },
            severity: {
              type: 'string',
              description: 'Constraint severity level',
              enum: ['error', 'warning', 'info']
            },
            existingConstraints: {
              type: 'string',
              description: 'Optional: existing constraints in the project for context'
            }
          },
          required: ['description']
        }
      },
      {
        name: 'explain_constraint',
        description: 'Explain a formal constraint in natural language. Use this to understand what a constraint does or to generate documentation.',
        inputSchema: {
          type: 'object',
          properties: {
            constraint: {
              type: 'string',
              description: 'The constraint code to explain (including name, severity, and expression)'
            },
            verbosity: {
              type: 'string',
              description: 'Level of detail in the explanation',
              enum: ['brief', 'normal', 'detailed']
            }
          },
          required: ['constraint']
        }
      },
      {
        name: 'validate_constraint',
        description: 'Check if a constraint expression is syntactically valid and uses correct types/attributes.',
        inputSchema: {
          type: 'object',
          properties: {
            constraint: {
              type: 'string',
              description: 'The constraint code to validate'
            }
          },
          required: ['constraint']
        }
      },
      {
        name: 'get_domain_info',
        description: 'Get information about the domain types, attributes, and pointers available for writing constraints.',
        inputSchema: {
          type: 'object',
          properties: {
            typeName: {
              type: 'string',
              description: 'Optional: specific type to get detailed info about'
            }
          }
        }
      },
      {
        name: 'get_constraint_syntax',
        description: 'Get the syntax reference for the constraint language, including examples.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'generate_constraint_template',
        description: 'Generate a constraint template without using LLM, based on pattern matching. Useful for common constraint patterns.',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description: 'Natural language description matching a common pattern (e.g., "every X must have unique Y")'
            }
          },
          required: ['description']
        }
      }
    ];
  }

  /**
   * Call a tool
   */
  async callTool(call: MCPToolCall): Promise<MCPToolResult> {
    try {
      switch (call.name) {
        case 'translate_constraint':
          return await this.handleTranslateConstraint(call.arguments);
        case 'explain_constraint':
          return await this.handleExplainConstraint(call.arguments);
        case 'validate_constraint':
          return this.handleValidateConstraint(call.arguments);
        case 'get_domain_info':
          return this.handleGetDomainInfo(call.arguments);
        case 'get_constraint_syntax':
          return this.handleGetConstraintSyntax();
        case 'generate_constraint_template':
          return this.handleGenerateTemplate(call.arguments);
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${call.name}` }],
            isError: true
          };
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        isError: true
      };
    }
  }

  private async handleTranslateConstraint(args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.translator) {
      return {
        content: [{ type: 'text', text: 'Domain not configured. Please set a metamodel or domain DSL first.' }],
        isError: true
      };
    }

    const description = args.description as string;
    
    if (args.existingConstraints) {
      this.translator.updateConfig({
        existingConstraints: args.existingConstraints as string
      });
    }

    if (this.llmProvider) {
      const result = await this.translator.translate(description);
      
      if (result.success) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              constraint: result.constraint,
              name: result.constraintName,
              severity: result.severity,
              explanation: result.explanation
            }, null, 2)
          }]
        };
      } else {
        const templateResult = this.translator.generateTemplate(description);
        
        if (templateResult.success) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                constraint: templateResult.constraint,
                name: templateResult.constraintName,
                severity: templateResult.severity,
                note: 'Generated using pattern matching (LLM translation failed)'
              }, null, 2)
            }]
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              errors: result.validationErrors,
              llmOutput: result.rawLLMOutput
            }, null, 2)
          }],
          isError: true
        };
      }
    } else {
      const result = this.translator.generateTemplate(description);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: result.success,
            constraint: result.constraint,
            name: result.constraintName,
            severity: result.severity,
            errors: result.validationErrors,
            note: result.success ? 'Generated using pattern matching' : 'No pattern matched. Consider using LLM-based translation.'
          }, null, 2)
        }],
        isError: !result.success
      };
    }
  }

  private async handleExplainConstraint(args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.explainer) {
      return {
        content: [{ type: 'text', text: 'Domain not configured. Please set a metamodel or domain DSL first.' }],
        isError: true
      };
    }

    const constraint = args.constraint as string;
    const verbosity = (args.verbosity as 'brief' | 'normal' | 'detailed') || 'normal';
    
    this.explainer.updateConfig({ verbosity });
    
    const result = await this.explainer.explainConstraintBlock(constraint);
    
    if (result.success) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            summary: result.summary,
            explanation: result.explanation,
            severity: result.severity,
            examples: result.examples,
            technicalDetails: result.technicalDetails
          }, null, 2)
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: result.error
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private handleValidateConstraint(args: Record<string, unknown>): MCPToolResult {
    if (!this.translator) {
      return {
        content: [{ type: 'text', text: 'Domain not configured.' }],
        isError: true
      };
    }

    const constraint = args.constraint as string;
    const result = this.translator.validateConstraint(constraint);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          valid: result.valid,
          errors: result.errors,
          warnings: result.warnings
        }, null, 2)
      }],
      isError: !result.valid
    };
  }

  private handleGetDomainInfo(args: Record<string, unknown>): MCPToolResult {
    if (!this.domainDSL) {
      return {
        content: [{ type: 'text', text: 'Domain not configured.' }],
        isError: true
      };
    }

    const typeName = args.typeName as string | undefined;
    
    if (typeName) {
      const typeDef = this.domainDSL.typeDefinitions.find(t => t.name === typeName);
      if (!typeDef) {
        return {
          content: [{
            type: 'text',
            text: `Type '${typeName}' not found. Available types: ${this.domainDSL.keywords.join(', ')}`
          }],
          isError: true
        };
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: typeDef.name,
            baseType: typeDef.baseType,
            attributes: typeDef.attributes,
            pointers: typeDef.pointers,
            sets: typeDef.sets,
            containments: typeDef.containments
          }, null, 2)
        }]
      };
    }

    const context = createDomainContext(this.domainDSL);
    return {
      content: [{
        type: 'text',
        text: context.typeDescriptions
      }]
    };
  }

  private handleGetConstraintSyntax(): MCPToolResult {
    if (!this.domainDSL) {
      const ctx = {
        systemPrompt: '',
        syntaxReference: '',
        typeDescriptions: '',
        examples: ''
      };
      return {
        content: [{
          type: 'text',
          text: 'No domain configured yet.\n\n' + require('../nl/domain-context').generateCompactContext({ keywords: [], typeDefinitions: [], validationRules: [], leanImports: [] })
        }]
      };
    }
    
    const context = createDomainContext(this.domainDSL);
    return {
      content: [{
        type: 'text',
        text: context.syntaxReference + '\n\n' + context.examples
      }]
    };
  }

  private handleGenerateTemplate(args: Record<string, unknown>): MCPToolResult {
    if (!this.translator) {
      return {
        content: [{ type: 'text', text: 'Domain not configured.' }],
        isError: true
      };
    }

    const description = args.description as string;
    const result = this.translator.generateTemplate(description);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: result.success,
          constraint: result.constraint,
          name: result.constraintName,
          severity: result.severity,
          errors: result.validationErrors
        }, null, 2)
      }],
      isError: !result.success
    };
  }
}

export default ConstraintMCPServer;
