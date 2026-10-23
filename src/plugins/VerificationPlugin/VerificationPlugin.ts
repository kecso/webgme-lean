/**
 * VerificationPlugin - WebGME plugin for Lean-based formal verification
 * 
 * This plugin:
 * 1. Extracts the metamodel from the WebGME project
 * 2. Generates domain-specific constraint language
 * 3. Translates user-defined constraints to Lean
 * 4. Runs Lean verification
 * 5. Reports results back to WebGME
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  Metamodel,
  MetaNode,
  MetaAttribute,
  MetaPointer,
  MetaSet,
  MetaContainment,
  ModelData,
  NodeData,
  Constraint,
  ConstraintSet,
  VerificationResult,
  VerificationReport
} from '../../common/types';
import { generateDomainDSL, generateLeanTypes, DomainDSL } from '../../generator/dsl-generator';
import { translateConstraintSet, generateModelVerification } from '../../translator/lean-translator';
import { parseConstraint } from '../../dsl/parser';

export interface PluginConfig {
  constraintsPath: string;
  leanPath: string;
  outputPath: string;
  timeout: number;
}

export interface WebGMENode {
  getId(): string;
  getGuid(): string;
  getAttribute(name: string): unknown;
  getPointer(name: string): string | null;
  getSetNames(): string[];
  getMemberIds(setName: string): string[];
  getChildrenIds(): string[];
  getParentId(): string | null;
  getMetaTypeId(): string | null;
}

export interface WebGMECore {
  loadRoot(rootHash: string): Promise<WebGMENode>;
  loadByPath(root: WebGMENode, path: string): Promise<WebGMENode>;
  getPath(node: WebGMENode): string;
  getAttribute(node: WebGMENode, name: string): unknown;
  getAttributeNames(node: WebGMENode): string[];
  getPointerPath(node: WebGMENode, name: string): string | null;
  getPointerNames(node: WebGMENode): string[];
  getSetNames(node: WebGMENode): string[];
  getMemberPaths(node: WebGMENode, setName: string): string[];
  getChildrenPaths(node: WebGMENode): string[];
  getParent(node: WebGMENode): WebGMENode | null;
  getMetaType(node: WebGMENode): WebGMENode | null;
  getAllMetaNodes(node: WebGMENode): Record<string, WebGMENode>;
  isMetaNode(node: WebGMENode): boolean;
  getOwnValidChildrenTypes(node: WebGMENode): WebGMENode[];
  getValidPointerNames(node: WebGMENode): string[];
  getValidSetNames(node: WebGMENode): string[];
  getOwnAttributeNames(node: WebGMENode): string[];
  getAttributeMeta(node: WebGMENode, name: string): { type: string; enum?: string[] } | null;
  getPointerMeta(node: WebGMENode, name: string): { min: number; max: number } | null;
  getChildrenMeta(node: WebGMENode): { min: number; max: number; items: WebGMENode[] } | null;
  getSetMeta(node: WebGMENode, name: string): { min: number; max: number } | null;
}

export class VerificationPlugin {
  private config: PluginConfig;
  private core: WebGMECore | null = null;
  private rootNode: WebGMENode | null = null;

  constructor(config: Partial<PluginConfig> = {}) {
    this.config = {
      constraintsPath: config.constraintsPath || './constraints',
      leanPath: config.leanPath || 'lean',
      outputPath: config.outputPath || './generated',
      timeout: config.timeout || 60000
    };
  }

  /**
   * Initialize the plugin with WebGME context
   */
  async initialize(core: WebGMECore, rootNode: WebGMENode): Promise<void> {
    this.core = core;
    this.rootNode = rootNode;
  }

  /**
   * Extract metamodel from WebGME
   */
  async extractMetamodel(): Promise<Metamodel> {
    if (!this.core || !this.rootNode) {
      throw new Error('Plugin not initialized');
    }

    const metaNodes = this.core.getAllMetaNodes(this.rootNode);
    const nodes: MetaNode[] = [];

    for (const [path, metaNode] of Object.entries(metaNodes)) {
      const node = await this.extractMetaNode(metaNode);
      nodes.push(node);
    }

    const rootMeta = this.core.getMetaType(this.rootNode);
    const rootType = rootMeta ? this.getNodeName(rootMeta) : 'Root';

    return {
      name: this.getNodeName(this.rootNode),
      rootType,
      nodes
    };
  }

  private async extractMetaNode(metaNode: WebGMENode): Promise<MetaNode> {
    if (!this.core) throw new Error('Core not initialized');

    const name = this.getNodeName(metaNode);
    const parent = this.core.getParent(metaNode);
    const baseType = parent && this.core.isMetaNode(parent) 
      ? this.getNodeName(parent) 
      : null;

    const attributes: MetaAttribute[] = [];
    for (const attrName of this.core.getOwnAttributeNames(metaNode)) {
      const meta = this.core.getAttributeMeta(metaNode, attrName);
      if (meta) {
        attributes.push({
          name: attrName,
          type: this.mapAttributeType(meta.type),
          enumValues: meta.enum
        });
      }
    }

    const pointers: MetaPointer[] = [];
    for (const ptrName of this.core.getValidPointerNames(metaNode)) {
      const meta = this.core.getPointerMeta(metaNode, ptrName);
      pointers.push({
        name: ptrName,
        targetTypes: [],
        min: meta?.min ?? 0,
        max: meta?.max ?? null
      });
    }

    const sets: MetaSet[] = [];
    for (const setName of this.core.getValidSetNames(metaNode)) {
      const meta = this.core.getSetMeta(metaNode, setName);
      sets.push({
        name: setName,
        memberTypes: [],
        min: meta?.min ?? 0,
        max: meta?.max ?? null
      });
    }

    const containments: MetaContainment[] = [];
    const childrenMeta = this.core.getChildrenMeta(metaNode);
    if (childrenMeta) {
      for (const childType of childrenMeta.items) {
        containments.push({
          childType: this.getNodeName(childType),
          min: childrenMeta.min,
          max: childrenMeta.max
        });
      }
    }

    return {
      name,
      isAbstract: false,
      baseType,
      attributes,
      pointers,
      sets,
      containments
    };
  }

  private getNodeName(node: WebGMENode): string {
    const name = this.core?.getAttribute(node, 'name');
    return typeof name === 'string' ? name : 'Unknown';
  }

  private mapAttributeType(type: string): MetaAttribute['type'] {
    switch (type.toLowerCase()) {
      case 'string': return 'string';
      case 'integer': return 'integer';
      case 'float': return 'float';
      case 'boolean': return 'boolean';
      case 'asset': return 'asset';
      default: return 'string';
    }
  }

  /**
   * Extract model data from WebGME
   */
  async extractModel(): Promise<ModelData> {
    if (!this.core || !this.rootNode) {
      throw new Error('Plugin not initialized');
    }

    const nodes: NodeData[] = [];
    await this.collectNodes(this.rootNode, nodes);

    return {
      nodes,
      root: this.core.getPath(this.rootNode)
    };
  }

  private async collectNodes(node: WebGMENode, nodes: NodeData[]): Promise<void> {
    if (!this.core) return;

    const metaType = this.core.getMetaType(node);
    const nodeData: NodeData = {
      id: this.core.getPath(node),
      metaType: metaType ? this.getNodeName(metaType) : 'Unknown',
      name: this.getNodeName(node),
      attributes: {},
      pointers: {},
      sets: {},
      children: this.core.getChildrenPaths(node),
      parent: this.core.getParent(node) ? this.core.getPath(this.core.getParent(node)!) : null
    };

    for (const attrName of this.core.getAttributeNames(node)) {
      nodeData.attributes[attrName] = this.core.getAttribute(node, attrName);
    }

    for (const ptrName of this.core.getPointerNames(node)) {
      nodeData.pointers[ptrName] = this.core.getPointerPath(node, ptrName);
    }

    for (const setName of this.core.getSetNames(node)) {
      nodeData.sets[setName] = this.core.getMemberPaths(node, setName);
    }

    nodes.push(nodeData);

    for (const childPath of nodeData.children) {
      const childNode = await this.core.loadByPath(this.rootNode!, childPath);
      await this.collectNodes(childNode, nodes);
    }
  }

  /**
   * Load constraints from a file
   */
  loadConstraints(filePath: string): ConstraintSet[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.parseConstraintFile(content);
  }

  private parseConstraintFile(content: string): ConstraintSet[] {
    const constraintSets: ConstraintSet[] = [];
    const lines = content.split('\n');
    
    let currentSet: ConstraintSet | null = null;
    let currentConstraint: Partial<Constraint> | null = null;
    let constraintBody = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('constraintset ')) {
        if (currentSet) {
          constraintSets.push(currentSet);
        }
        const match = trimmed.match(/constraintset\s+(\w+)\s+for\s+(\w+)/);
        if (match) {
          currentSet = {
            name: match[1],
            targetType: match[2],
            constraints: []
          };
        }
      } else if (trimmed.startsWith('constraint ') && currentSet) {
        if (currentConstraint && constraintBody) {
          currentConstraint.expression = parseConstraint(constraintBody.trim());
          currentSet.constraints.push(currentConstraint as Constraint);
        }
        
        const match = trimmed.match(/constraint\s+(\w+)(?:\s*\[(\w+)\])?/);
        if (match) {
          currentConstraint = {
            name: match[1],
            severity: (match[2] as Constraint['severity']) || 'error'
          };
          constraintBody = '';
        }
      } else if (trimmed.startsWith('//') && currentConstraint && !currentConstraint.description) {
        currentConstraint.description = trimmed.slice(2).trim();
      } else if (currentConstraint && trimmed) {
        constraintBody += ' ' + trimmed;
      }
    }

    if (currentConstraint && constraintBody && currentSet) {
      currentConstraint.expression = parseConstraint(constraintBody.trim());
      currentSet.constraints.push(currentConstraint as Constraint);
    }
    
    if (currentSet) {
      constraintSets.push(currentSet);
    }

    return constraintSets;
  }

  /**
   * Generate all Lean files for verification
   */
  async generateLeanFiles(
    metamodel: Metamodel,
    constraintSets: ConstraintSet[],
    modelData: ModelData
  ): Promise<string[]> {
    const generatedFiles: string[] = [];
    const outputDir = this.config.outputPath;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const domainDSL = generateDomainDSL(metamodel);

    const domainTypesPath = path.join(outputDir, 'Domain.lean');
    fs.writeFileSync(domainTypesPath, generateLeanTypes(domainDSL));
    generatedFiles.push(domainTypesPath);

    for (const cs of constraintSets) {
      const constraintPath = path.join(outputDir, `${cs.name}.lean`);
      fs.writeFileSync(constraintPath, translateConstraintSet(cs, domainDSL));
      generatedFiles.push(constraintPath);
    }

    const modelJson = JSON.stringify(modelData);
    const verifyPath = path.join(outputDir, 'Verify.lean');
    const constraintModules = constraintSets.map(cs => cs.name);
    fs.writeFileSync(verifyPath, generateModelVerification(modelJson, constraintModules[0] || 'Constraints'));
    generatedFiles.push(verifyPath);

    return generatedFiles;
  }

  /**
   * Run Lean verification
   */
  async runVerification(leanFiles: string[]): Promise<VerificationReport> {
    const results: VerificationResult[] = [];
    
    for (const file of leanFiles) {
      if (file.endsWith('Verify.lean')) {
        const result = await this.runLean(file);
        results.push(...this.parseLeanOutput(result));
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed && r.message !== 'warning').length;
    const warnings = results.filter(r => r.message === 'warning').length;

    return {
      modelName: 'Model',
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        passed,
        failed,
        warnings
      }
    };
  }

  private runLean(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.leanPath, [filePath], {
        timeout: this.config.timeout
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          resolve(stderr || stdout);
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  private parseLeanOutput(output: string): VerificationResult[] {
    const results: VerificationResult[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('#eval')) {
        const match = line.match(/\[(.+)\]/);
        if (match) {
          const pairs = match[1].split(',').map(p => p.trim());
          for (const pair of pairs) {
            const pairMatch = pair.match(/\("([^"]+)",\s*(true|false)\)/);
            if (pairMatch) {
              results.push({
                constraintName: pairMatch[1],
                passed: pairMatch[2] === 'true',
                leanOutput: line
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Main verification entry point
   */
  async verify(constraintFile: string): Promise<VerificationReport> {
    const metamodel = await this.extractMetamodel();
    const constraintSets = this.loadConstraints(constraintFile);
    const modelData = await this.extractModel();
    const leanFiles = await this.generateLeanFiles(metamodel, constraintSets, modelData);
    return this.runVerification(leanFiles);
  }
}

export default VerificationPlugin;
