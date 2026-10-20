#!/usr/bin/env ts-node
/**
 * CLI tool to verify a model against constraints
 * 
 * This tool runs the full verification pipeline:
 * 1. Load metamodel and generate DSL
 * 2. Parse constraints
 * 3. Load model
 * 4. Generate Lean files
 * 5. Run Lean verification
 * 6. Report results
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { Metamodel, ModelData, ConstraintSet, Constraint, VerificationReport } from '../common/types';
import { generateDomainDSL, generateLeanTypes, DomainDSL } from '../generator/dsl-generator';
import { translateConstraintSet, generateModelVerification } from '../translator/lean-translator';
import { parseConstraint } from '../dsl/parser';

interface VerifyOptions {
  metamodelPath: string;
  constraintsPath: string;
  modelPath: string;
  outputDir: string;
  leanPath: string;
  verbose: boolean;
}

function parseConstraintFile(content: string): ConstraintSet[] {
  const constraintSets: ConstraintSet[] = [];
  const lines = content.split('\n');
  
  let currentSet: ConstraintSet | null = null;
  let currentConstraint: Partial<Constraint> | null = null;
  let constraintBody = '';

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('//') && !currentConstraint) {
      continue;
    }
    
    if (trimmed.startsWith('constraintset ')) {
      if (currentSet && currentConstraint && constraintBody) {
        try {
          currentConstraint.expression = parseConstraint(constraintBody.trim());
          currentSet.constraints.push(currentConstraint as Constraint);
        } catch (e) {
          console.warn(`Warning: Failed to parse constraint ${currentConstraint.name}: ${e}`);
        }
      }
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
        currentConstraint = null;
        constraintBody = '';
      }
    } else if (trimmed.startsWith('constraint ') && currentSet) {
      if (currentConstraint && constraintBody) {
        try {
          currentConstraint.expression = parseConstraint(constraintBody.trim());
          currentSet.constraints.push(currentConstraint as Constraint);
        } catch (e) {
          console.warn(`Warning: Failed to parse constraint ${currentConstraint.name}: ${e}`);
        }
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
    } else if (currentConstraint && trimmed && !trimmed.startsWith('//')) {
      constraintBody += ' ' + trimmed;
    }
  }

  if (currentConstraint && constraintBody && currentSet) {
    try {
      currentConstraint.expression = parseConstraint(constraintBody.trim());
      currentSet.constraints.push(currentConstraint as Constraint);
    } catch (e) {
      console.warn(`Warning: Failed to parse constraint ${currentConstraint.name}: ${e}`);
    }
  }
  
  if (currentSet) {
    constraintSets.push(currentSet);
  }

  return constraintSets;
}

async function runLean(filePath: string, leanPath: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(leanPath, [filePath], { timeout: 60000 });
    
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: stdout + stderr
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: `Error: ${err.message}`
      });
    });
  });
}

async function verify(options: VerifyOptions): Promise<VerificationReport> {
  const { metamodelPath, constraintsPath, modelPath, outputDir, leanPath, verbose } = options;

  if (verbose) console.log('Loading metamodel...');
  const metamodel: Metamodel = JSON.parse(fs.readFileSync(metamodelPath, 'utf-8'));

  if (verbose) console.log('Loading constraints...');
  const constraintsContent = fs.readFileSync(constraintsPath, 'utf-8');
  const constraintSets = parseConstraintFile(constraintsContent);

  if (verbose) console.log('Loading model...');
  const modelData: ModelData = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (verbose) console.log('Generating domain DSL...');
  const domainDSL = generateDomainDSL(metamodel);

  if (verbose) console.log('Generating Lean files...');
  
  const domainPath = path.join(outputDir, 'Domain.lean');
  fs.writeFileSync(domainPath, generateLeanTypes(domainDSL));
  
  for (const cs of constraintSets) {
    const leanCode = translateConstraintSet(cs, domainDSL);
    const outputPath = path.join(outputDir, `${cs.name}.lean`);
    fs.writeFileSync(outputPath, leanCode);
  }

  const modelJson = JSON.stringify(modelData);
  const verifyPath = path.join(outputDir, 'Verify.lean');
  fs.writeFileSync(
    verifyPath, 
    generateModelVerification(modelJson, constraintSets[0]?.name || 'Constraints')
  );

  if (verbose) console.log('Running Lean verification...');
  const result = await runLean(verifyPath, leanPath);

  const report: VerificationReport = {
    modelName: modelData.root,
    timestamp: new Date().toISOString(),
    results: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    }
  };

  for (const cs of constraintSets) {
    for (const constraint of cs.constraints) {
      report.results.push({
        constraintName: constraint.name,
        passed: result.success,
        message: constraint.description,
        leanOutput: result.output
      });
      report.summary.total++;
      if (result.success) {
        report.summary.passed++;
      } else if (constraint.severity === 'warning') {
        report.summary.warnings++;
      } else {
        report.summary.failed++;
      }
    }
  }

  return report;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: verify <metamodel.json> <constraints.wgl> <model.json> [options]');
    console.error('Options:');
    console.error('  --output <dir>    Output directory (default: ./generated)');
    console.error('  --lean <path>     Path to lean executable (default: lean)');
    console.error('  --verbose         Verbose output');
    console.error('  --json            Output report as JSON');
    process.exit(1);
  }

  const options: VerifyOptions = {
    metamodelPath: args[0],
    constraintsPath: args[1],
    modelPath: args[2],
    outputDir: './generated',
    leanPath: 'lean',
    verbose: false
  };

  let jsonOutput = false;

  for (let i = 3; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (args[i] === '--lean' && args[i + 1]) {
      options.leanPath = args[++i];
    } else if (args[i] === '--verbose') {
      options.verbose = true;
    } else if (args[i] === '--json') {
      jsonOutput = true;
    }
  }

  for (const filePath of [options.metamodelPath, options.constraintsPath, options.modelPath]) {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
  }

  verify(options).then((report) => {
    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('\n=== Verification Report ===');
      console.log(`Model: ${report.modelName}`);
      console.log(`Time: ${report.timestamp}`);
      console.log('');
      console.log('Results:');
      for (const result of report.results) {
        const status = result.passed ? '✓' : '✗';
        console.log(`  ${status} ${result.constraintName}: ${result.message || ''}`);
      }
      console.log('');
      console.log('Summary:');
      console.log(`  Total: ${report.summary.total}`);
      console.log(`  Passed: ${report.summary.passed}`);
      console.log(`  Failed: ${report.summary.failed}`);
      console.log(`  Warnings: ${report.summary.warnings}`);
    }
    
    process.exit(report.summary.failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

main();
