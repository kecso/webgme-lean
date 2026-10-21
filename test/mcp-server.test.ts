/**
 * Tests for MCP Server
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConstraintMCPServer } from '../src/mcp/constraint-mcp-server';
import { createMCPHandler } from '../src/mcp/mcp-handler';
import { DomainDSL } from '../src/generator/dsl-generator';
import { Metamodel } from '../src/common/types';

const sampleMetamodel: Metamodel = {
  name: 'TestDomain',
  rootType: 'Root',
  nodes: [
    {
      name: 'Root',
      isAbstract: false,
      baseType: null,
      attributes: [{ name: 'name', type: 'string' }],
      pointers: [],
      sets: [],
      containments: [{ childType: 'Element', min: 0, max: null }]
    },
    {
      name: 'Element',
      isAbstract: false,
      baseType: null,
      attributes: [
        { name: 'name', type: 'string' },
        { name: 'value', type: 'integer' }
      ],
      pointers: [{ name: 'next', targetTypes: ['Element'], min: 0, max: 1 }],
      sets: [],
      containments: []
    }
  ]
};

describe('ConstraintMCPServer', () => {
  let server: ConstraintMCPServer;

  beforeEach(() => {
    server = new ConstraintMCPServer({
      metamodel: sampleMetamodel
    });
  });

  describe('getServerInfo', () => {
    it('should return server name and version', () => {
      const info = server.getServerInfo();
      
      expect(info.name).toBe('webgme-lean-constraints');
      expect(info.version).toBeDefined();
    });

    it('should use custom name if provided', () => {
      const customServer = new ConstraintMCPServer({
        metamodel: sampleMetamodel,
        serverName: 'my-custom-server',
        version: '2.0.0'
      });
      
      const info = customServer.getServerInfo();
      expect(info.name).toBe('my-custom-server');
      expect(info.version).toBe('2.0.0');
    });
  });

  describe('listTools', () => {
    it('should return available tools', () => {
      const tools = server.listTools();
      
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some(t => t.name === 'translate_constraint')).toBe(true);
      expect(tools.some(t => t.name === 'explain_constraint')).toBe(true);
      expect(tools.some(t => t.name === 'validate_constraint')).toBe(true);
      expect(tools.some(t => t.name === 'get_domain_info')).toBe(true);
      expect(tools.some(t => t.name === 'get_constraint_syntax')).toBe(true);
      expect(tools.some(t => t.name === 'generate_constraint_template')).toBe(true);
    });

    it('should have valid input schemas', () => {
      const tools = server.listTools();
      
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });
  });

  describe('callTool', () => {
    it('should validate constraint', async () => {
      const result = await server.callTool({
        name: 'validate_constraint',
        arguments: {
          constraint: 'forall e in Element: e.name != ""'
        }
      });
      
      expect(result.content).toBeDefined();
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.valid).toBe(true);
    });

    it('should catch validation errors', async () => {
      const result = await server.callTool({
        name: 'validate_constraint',
        arguments: {
          constraint: 'forall e in UnknownType: e.name != ""'
        }
      });
      
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.valid).toBe(false);
      expect(parsed.errors.length).toBeGreaterThan(0);
    });

    it('should generate constraint template', async () => {
      const result = await server.callTool({
        name: 'generate_constraint_template',
        arguments: {
          description: 'Every element must have a unique name'
        }
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.constraint).toContain('Element');
      expect(parsed.constraint).toContain('name');
    });

    it('should get domain info', async () => {
      const result = await server.callTool({
        name: 'get_domain_info',
        arguments: {}
      });
      
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Element');
      expect(result.content[0].text).toContain('Root');
    });

    it('should get specific type info', async () => {
      const result = await server.callTool({
        name: 'get_domain_info',
        arguments: { typeName: 'Element' }
      });
      
      expect(result.isError).toBeFalsy();
      
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe('Element');
      expect(parsed.attributes).toBeDefined();
      expect(parsed.pointers).toBeDefined();
    });

    it('should return error for unknown type', async () => {
      const result = await server.callTool({
        name: 'get_domain_info',
        arguments: { typeName: 'UnknownType' }
      });
      
      expect(result.isError).toBe(true);
    });

    it('should get constraint syntax', async () => {
      const result = await server.callTool({
        name: 'get_constraint_syntax',
        arguments: {}
      });
      
      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('forall');
      expect(result.content[0].text).toContain('exists');
    });

    it('should handle unknown tool', async () => {
      const result = await server.callTool({
        name: 'unknown_tool',
        arguments: {}
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unknown tool');
    });
  });
});

describe('createMCPHandler', () => {
  let handler: ReturnType<typeof createMCPHandler>;

  beforeEach(() => {
    handler = createMCPHandler({
      metamodel: sampleMetamodel
    });
  });

  describe('handleRequest', () => {
    it('should handle initialize request', async () => {
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize'
      });
      
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
      expect((response.result as any).serverInfo).toBeDefined();
      expect((response.result as any).capabilities).toBeDefined();
    });

    it('should handle tools/list request', async () => {
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      });
      
      expect(response.result).toBeDefined();
      expect((response.result as any).tools).toBeDefined();
      expect((response.result as any).tools.length).toBeGreaterThan(0);
    });

    it('should handle tools/call request', async () => {
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'validate_constraint',
          arguments: {
            constraint: 'forall e in Element: e.name != ""'
          }
        }
      });
      
      expect(response.result).toBeDefined();
      const content = (response.result as any).content;
      expect(content).toBeDefined();
      expect(content[0].type).toBe('text');
    });

    it('should handle shutdown request', async () => {
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'shutdown'
      });
      
      expect(response.result).toBe(null);
    });

    it('should return error for unknown method', async () => {
      const response = await handler.handleRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'unknown/method'
      });
      
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601);
    });
  });

  describe('httpHandler', () => {
    it('should handle HTTP requests', async () => {
      const httpHandler = handler.httpHandler();
      
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      });
      
      const responseStr = await httpHandler(request);
      const response = JSON.parse(responseStr);
      
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
    });
  });
});
