/**
 * WebGME Router for Constraint Translation
 * 
 * Provides REST API endpoints for constraint NL translation.
 * Can be mounted in a WebGME server or used standalone.
 * 
 * Endpoints:
 * - POST /translate - Translate NL to constraint
 * - POST /explain - Explain constraint in NL
 * - POST /validate - Validate constraint syntax
 * - GET /domain - Get domain info
 * - GET /syntax - Get syntax reference
 * - POST /mcp - MCP JSON-RPC endpoint
 */

import { NLConstraintTranslator, LLMProvider } from '../nl/nl-translator';
import { ConstraintExplainer } from '../nl/constraint-explainer';
import { createDomainContext, generateCompactContext } from '../nl/domain-context';
import { createMCPHandler } from '../mcp/mcp-handler';
import { DomainDSL, generateDomainDSL } from '../generator/dsl-generator';
import { Metamodel } from '../common/types';

export interface RouterConfig {
  /** Domain DSL or Metamodel */
  domainDSL?: DomainDSL;
  metamodel?: Metamodel;
  /** LLM provider for advanced features */
  llmProvider?: LLMProvider;
  /** Base path for router (default: /api/constraints) */
  basePath?: string;
  /** Enable CORS (default: true) */
  cors?: boolean;
}

export interface RouterContext {
  domainDSL: DomainDSL | null;
  translator: NLConstraintTranslator | null;
  explainer: ConstraintExplainer | null;
  mcpHandler: ReturnType<typeof createMCPHandler>;
}

export interface RouterRequest {
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface RouterResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * Create a constraint router
 */
export function createConstraintRouter(config: RouterConfig = {}): ConstraintRouter {
  return new ConstraintRouter(config);
}

/**
 * Constraint Router for WebGME integration
 */
export class ConstraintRouter {
  private config: RouterConfig;
  private context: RouterContext;
  private basePath: string;

  constructor(config: RouterConfig = {}) {
    this.config = config;
    this.basePath = config.basePath || '/api/constraints';
    
    let domainDSL: DomainDSL | null = null;
    
    if (config.domainDSL) {
      domainDSL = config.domainDSL;
    } else if (config.metamodel) {
      domainDSL = generateDomainDSL(config.metamodel);
    }

    this.context = {
      domainDSL,
      translator: domainDSL ? new NLConstraintTranslator({
        domainDSL,
        llmProvider: config.llmProvider
      }) : null,
      explainer: domainDSL ? new ConstraintExplainer({
        domainDSL,
        llmProvider: config.llmProvider
      }) : null,
      mcpHandler: createMCPHandler({
        domainDSL: domainDSL || undefined,
        llmProvider: config.llmProvider
      })
    };
  }

  /**
   * Update domain configuration
   */
  setDomainDSL(dsl: DomainDSL): void {
    this.context.domainDSL = dsl;
    this.context.translator = new NLConstraintTranslator({
      domainDSL: dsl,
      llmProvider: this.config.llmProvider
    });
    this.context.explainer = new ConstraintExplainer({
      domainDSL: dsl,
      llmProvider: this.config.llmProvider
    });
    this.context.mcpHandler.setDomainDSL(dsl);
  }

  /**
   * Set domain from metamodel
   */
  setMetamodel(metamodel: Metamodel): void {
    const dsl = generateDomainDSL(metamodel);
    this.setDomainDSL(dsl);
  }

  /**
   * Set LLM provider
   */
  setLLMProvider(provider: LLMProvider): void {
    this.config.llmProvider = provider;
    if (this.context.translator) {
      this.context.translator.updateConfig({ llmProvider: provider });
    }
    if (this.context.explainer) {
      this.context.explainer.updateConfig({ llmProvider: provider });
    }
    this.context.mcpHandler.setLLMProvider(provider);
  }

  /**
   * Handle a request
   */
  async handle(req: RouterRequest): Promise<RouterResponse> {
    const path = req.path.replace(this.basePath, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.cors !== false) {
      headers['Access-Control-Allow-Origin'] = '*';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
    }

    if (req.method === 'OPTIONS') {
      return { status: 204, body: null, headers };
    }

    try {
      switch (path) {
        case '/translate':
          return { ...await this.handleTranslate(req), headers };
        case '/explain':
          return { ...await this.handleExplain(req), headers };
        case '/validate':
          return { ...this.handleValidate(req), headers };
        case '/domain':
          return { ...this.handleGetDomain(req), headers };
        case '/syntax':
          return { ...this.handleGetSyntax(), headers };
        case '/mcp':
          return { ...await this.handleMCP(req), headers };
        case '/health':
          return { 
            status: 200, 
            body: { 
              status: 'ok', 
              domainConfigured: !!this.context.domainDSL,
              llmConfigured: !!this.config.llmProvider
            },
            headers 
          };
        default:
          return { status: 404, body: { error: `Unknown endpoint: ${path}` }, headers };
      }
    } catch (error) {
      return { 
        status: 500, 
        body: { error: (error as Error).message },
        headers 
      };
    }
  }

  /**
   * POST /translate
   * Translate natural language to constraint
   */
  private async handleTranslate(req: RouterRequest): Promise<{ status: number; body: unknown }> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Method not allowed' } };
    }

    if (!this.context.translator) {
      return { status: 503, body: { error: 'Domain not configured' } };
    }

    const body = req.body as { description: string; existingConstraints?: string };
    
    if (!body?.description) {
      return { status: 400, body: { error: 'Missing required field: description' } };
    }

    if (body.existingConstraints) {
      this.context.translator.updateConfig({ existingConstraints: body.existingConstraints });
    }

    if (this.config.llmProvider) {
      const result = await this.context.translator.translate(body.description);
      return { status: result.success ? 200 : 422, body: result };
    } else {
      const result = this.context.translator.generateTemplate(body.description);
      return { 
        status: result.success ? 200 : 422, 
        body: { 
          ...result, 
          note: result.success 
            ? 'Generated using pattern matching (no LLM configured)' 
            : 'Pattern matching failed and no LLM is configured for advanced translation'
        } 
      };
    }
  }

  /**
   * POST /explain
   * Explain constraint in natural language
   */
  private async handleExplain(req: RouterRequest): Promise<{ status: number; body: unknown }> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Method not allowed' } };
    }

    if (!this.context.explainer) {
      return { status: 503, body: { error: 'Domain not configured' } };
    }

    const body = req.body as { constraint: string; verbosity?: 'brief' | 'normal' | 'detailed' };
    
    if (!body?.constraint) {
      return { status: 400, body: { error: 'Missing required field: constraint' } };
    }

    if (body.verbosity) {
      this.context.explainer.updateConfig({ verbosity: body.verbosity });
    }

    const result = await this.context.explainer.explainConstraintBlock(body.constraint);
    return { status: result.success ? 200 : 422, body: result };
  }

  /**
   * POST /validate
   * Validate constraint syntax
   */
  private handleValidate(req: RouterRequest): { status: number; body: unknown } {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Method not allowed' } };
    }

    if (!this.context.translator) {
      return { status: 503, body: { error: 'Domain not configured' } };
    }

    const body = req.body as { constraint: string };
    
    if (!body?.constraint) {
      return { status: 400, body: { error: 'Missing required field: constraint' } };
    }

    const result = this.context.translator.validateConstraint(body.constraint);
    return { status: result.valid ? 200 : 422, body: result };
  }

  /**
   * GET /domain
   * Get domain information
   */
  private handleGetDomain(req: RouterRequest): { status: number; body: unknown } {
    if (req.method !== 'GET') {
      return { status: 405, body: { error: 'Method not allowed' } };
    }

    if (!this.context.domainDSL) {
      return { status: 503, body: { error: 'Domain not configured' } };
    }

    const typeName = req.query?.type;
    
    if (typeName) {
      const typeDef = this.context.domainDSL.typeDefinitions.find(t => t.name === typeName);
      if (!typeDef) {
        return { 
          status: 404, 
          body: { 
            error: `Type '${typeName}' not found`,
            availableTypes: this.context.domainDSL.keywords
          } 
        };
      }
      return { status: 200, body: typeDef };
    }

    return {
      status: 200,
      body: {
        types: this.context.domainDSL.keywords,
        typeDefinitions: this.context.domainDSL.typeDefinitions
      }
    };
  }

  /**
   * GET /syntax
   * Get syntax reference
   */
  private handleGetSyntax(): { status: number; body: unknown } {
    if (this.context.domainDSL) {
      const context = createDomainContext(this.context.domainDSL);
      return {
        status: 200,
        body: {
          syntaxReference: context.syntaxReference,
          examples: context.examples,
          fullContext: generateCompactContext(this.context.domainDSL)
        }
      };
    }

    return {
      status: 200,
      body: {
        syntaxReference: require('../nl/domain-context').generateCompactContext({
          keywords: [],
          typeDefinitions: [],
          validationRules: [],
          leanImports: []
        }),
        note: 'No domain configured - showing generic syntax'
      }
    };
  }

  /**
   * POST /mcp
   * MCP JSON-RPC endpoint
   */
  private async handleMCP(req: RouterRequest): Promise<{ status: number; body: unknown }> {
    if (req.method !== 'POST') {
      return { status: 405, body: { error: 'Method not allowed' } };
    }

    const response = await this.context.mcpHandler.handleRequest(req.body as any);
    return { status: 200, body: response };
  }

  /**
   * Create Express/Connect middleware
   */
  middleware() {
    return async (req: any, res: any, next: any) => {
      if (!req.path.startsWith(this.basePath)) {
        return next();
      }

      const routerReq: RouterRequest = {
        method: req.method,
        path: req.path,
        body: req.body,
        query: req.query,
        headers: req.headers
      };

      const response = await this.handle(routerReq);
      
      if (response.headers) {
        for (const [key, value] of Object.entries(response.headers)) {
          res.set(key, value);
        }
      }
      
      res.status(response.status).json(response.body);
    };
  }

  /**
   * Create WebGME router configuration
   */
  webgmeRouterConfig(): object {
    const self = this;
    return {
      [this.basePath]: {
        async get(req: any, res: any, next: any) {
          const response = await self.handle({
            method: 'GET',
            path: req.path,
            query: req.query,
            headers: req.headers
          });
          res.status(response.status).json(response.body);
        },
        async post(req: any, res: any, next: any) {
          const response = await self.handle({
            method: 'POST',
            path: req.path,
            body: req.body,
            query: req.query,
            headers: req.headers
          });
          res.status(response.status).json(response.body);
        },
        options(req: any, res: any) {
          res.set('Access-Control-Allow-Origin', '*');
          res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.set('Access-Control-Allow-Headers', 'Content-Type');
          res.status(204).end();
        }
      }
    };
  }
}

export default ConstraintRouter;
