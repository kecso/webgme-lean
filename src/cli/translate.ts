#!/usr/bin/env ts-node
/**
 * CLI tool to translate constraints to Lean
 */

import * as fs from 'fs';
import * as path from 'path';
import { Metamodel, ConstraintSet, Constraint } from '../common/types';
import { generateDomainDSL, DomainDSL } from '../generator/dsl-generator';
import { translateConstraintSet } from '../translator/lean-translator';
import { parseConstraint } from '../dsl/parser';

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
        currentConstraint.expression = parseConstraint(constraintBody.trim());
        currentSet.constraints.push(currentConstraint as Constraint);
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
    } else if (currentConstraint && trimmed && !trimmed.startsWith('//')) {
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

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: translate <constraints.wgl> <metamodel.json> [output-dir]');
    process.exit(1);
  }

  const constraintsPath = args[0];
  const metamodelPath = args[1];
  const outputDir = args[2] || './generated';

  if (!fs.existsSync(constraintsPath)) {
    console.error(`Error: Constraints file not found: ${constraintsPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(metamodelPath)) {
    console.error(`Error: Metamodel file not found: ${metamodelPath}`);
    process.exit(1);
  }

  const constraintsContent = fs.readFileSync(constraintsPath, 'utf-8');
  const metamodel: Metamodel = JSON.parse(fs.readFileSync(metamodelPath, 'utf-8'));

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Parsing constraints...');
  const constraintSets = parseConstraintFile(constraintsContent);

  console.log('Generating domain DSL...');
  const domainDSL = generateDomainDSL(metamodel);

  console.log('Translating to Lean...');
  for (const cs of constraintSets) {
    const leanCode = translateConstraintSet(cs, domainDSL);
    const outputPath = path.join(outputDir, `${cs.name}.lean`);
    fs.writeFileSync(outputPath, leanCode);
    console.log(`Generated: ${outputPath} (${cs.constraints.length} constraints)`);
  }

  console.log('\nTranslation complete!');
}

main();
