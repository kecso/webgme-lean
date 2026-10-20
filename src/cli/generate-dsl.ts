#!/usr/bin/env ts-node
/**
 * CLI tool to generate domain-specific DSL from a metamodel
 */

import * as fs from 'fs';
import * as path from 'path';
import { Metamodel } from '../common/types';
import { generateDomainDSL, generateLeanTypes, generateDSLDocumentation } from '../generator/dsl-generator';

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: generate-dsl <metamodel.json> [output-dir]');
    process.exit(1);
  }

  const metamodelPath = args[0];
  const outputDir = args[1] || './generated';

  if (!fs.existsSync(metamodelPath)) {
    console.error(`Error: Metamodel file not found: ${metamodelPath}`);
    process.exit(1);
  }

  const metamodel: Metamodel = JSON.parse(fs.readFileSync(metamodelPath, 'utf-8'));
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Generating DSL from metamodel: ${metamodel.name}`);

  const dsl = generateDomainDSL(metamodel);
  
  const leanTypesPath = path.join(outputDir, 'Domain.lean');
  fs.writeFileSync(leanTypesPath, generateLeanTypes(dsl));
  console.log(`Generated: ${leanTypesPath}`);

  const docPath = path.join(outputDir, 'DSL.md');
  fs.writeFileSync(docPath, generateDSLDocumentation(dsl));
  console.log(`Generated: ${docPath}`);

  const dslJsonPath = path.join(outputDir, 'dsl.json');
  fs.writeFileSync(dslJsonPath, JSON.stringify(dsl, null, 2));
  console.log(`Generated: ${dslJsonPath}`);

  console.log('\nDSL generation complete!');
  console.log(`Keywords: ${dsl.keywords.join(', ')}`);
  console.log(`Types: ${dsl.typeDefinitions.length}`);
  console.log(`Validation rules: ${dsl.validationRules.length}`);
}

main();
