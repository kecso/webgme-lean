/**
 * MCP Handler for various transports
 * 
 * Provides handler implementations for:
 * - stdio transport (for CLI/terminal-based MCP clients)
 * - HTTP transport (for web-based integrations)
 * - Express middleware (for WebGME router integration)
 */

import { ConstraintMCPServer, MCPTool, MCPToolCall, MCPToolResult } from './constraint-mcp-server';
import { DomainDSL } from '../generator/dsl-generator';
import { Metamodel } from '../common/types';
import { LLMProvider } from '../nl/nl-translator';

export interface MCPHandlerConfig {
  domainDSL?: DomainDSL;
  metamodel?: Metamodel;
  llmProvider?: LLMProvider;
  serverName?: string;
  version?: string;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Create an MCP message handler
 */
export function createMCPHandler(config: MCPHandlerConfig = {}) {
  const server = new ConstraintMCPServer(config);
  
  return {
    server,
    
    /**
     * Handle an MCP JSON-RPC request
     */
    async handleRequest(request: MCPRequest): Promise<MCPResponse> {
      try {
        switch (request.method) {
          case 'initialize':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                protocolVersion: '2024-11-05',
                serverInfo: server.getServerInfo(),
                capabilities: {
                  tools: {}
                }
              }
            };

          case 'tools/list':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                tools: server.listTools()
              }
            };

          case 'tools/call':
            const params = request.params as { name: string; arguments: Record<string, unknown> };
            const result = await server.callTool({
              name: params.name,
              arguments: params.arguments || {}
            });
            return {
              jsonrpc: '2.0',
              id: request.id,
              result
            };

          case 'shutdown':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: null
            };

          default:
            return {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: `Method not found: ${request.method}`
              }
            };
        }
      } catch (error) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32603,
            message: (error as Error).message
          }
        };
      }
    },

    /**
     * Update server configuration
     */
    setDomainDSL(dsl: DomainDSL): void {
      server.setDomainDSL(dsl);
    },

    setMetamodel(metamodel: Metamodel): void {
      server.setMetamodel(metamodel);
    },

    setLLMProvider(provider: LLMProvider): void {
      server.setLLMProvider(provider);
    },

    /**
     * Create Express middleware for WebGME router integration
     */
    expressMiddleware() {
      return async (req: any, res: any, next: any) => {
        if (req.method !== 'POST') {
          return next();
        }

        try {
          const request = req.body as MCPRequest;
          
          if (!request.jsonrpc || request.jsonrpc !== '2.0') {
            return res.status(400).json({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32600,
                message: 'Invalid Request: not a valid JSON-RPC 2.0 request'
              }
            });
          }

          const response = await this.handleRequest(request);
          res.json(response);
        } catch (error) {
          res.status(500).json({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32603,
              message: (error as Error).message
            }
          });
        }
      };
    },

    /**
     * Create a simple HTTP handler
     */
    httpHandler() {
      return async (body: string): Promise<string> => {
        const request = JSON.parse(body) as MCPRequest;
        const response = await this.handleRequest(request);
        return JSON.stringify(response);
      };
    }
  };
}

/**
 * Create a stdio-based MCP server (for CLI usage)
 */
export function createStdioServer(config: MCPHandlerConfig = {}): void {
  const handler = createMCPHandler(config);
  
  let buffer = '';
  
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk: string) => {
    buffer += chunk;
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const request = JSON.parse(line) as MCPRequest;
        const response = await handler.handleRequest(request);
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (error) {
        const errorResponse: MCPResponse = {
          jsonrpc: '2.0',
          id: 0,
          error: {
            code: -32700,
            message: `Parse error: ${(error as Error).message}`
          }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

export default createMCPHandler;
