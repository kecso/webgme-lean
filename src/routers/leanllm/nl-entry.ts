/**
 * Server entry for constraint explanation and natural-language translation.
 * The router bundles this file and calls an OpenAI-compatible chat endpoint itself.
 */

import { ConstraintExplainer } from '../../nl/constraint-explainer';
import { NLConstraintTranslator, LLMProvider } from '../../nl/nl-translator';
import { DomainDSL, TypeDefinition } from '../../generator/dsl-generator';

export interface VocabType {
  name: string;
  baseType?: string | null;
  attributes?: { name: string; type?: string }[];
  pointers?: { name: string; targetTypes?: string[]; min?: number }[];
  sets?: { name: string; memberTypes?: string[] }[];
  containments?: { childType: string; min?: number; max?: number | null }[];
}

function attrType(type?: string): 'string' | 'int' | 'float' | 'bool' {
  if (type === 'integer' || type === 'int') return 'int';
  if (type === 'float') return 'float';
  if (type === 'boolean' || type === 'bool') return 'bool';
  return 'string';
}

export function vocabularyToDSL(rootType: string | undefined, types: VocabType[] | undefined): DomainDSL {
  const list = (types || []).filter(function (type) { return type && type.name; });
  const typeDefinitions: TypeDefinition[] = list.map(function (type) {
    return {
      name: type.name,
      baseType: type.baseType || null,
      attributes: (type.attributes || []).map(function (attr) {
        return { name: attr.name, type: attrType(attr.type), leanType: 'String' };
      }),
      pointers: (type.pointers || []).map(function (pointer) {
        return {
          name: pointer.name,
          targetTypes: pointer.targetTypes || [],
          optional: pointer.min === 0
        };
      }),
      sets: (type.sets || []).map(function (set) {
        return {
          name: set.name,
          memberTypes: set.memberTypes || [],
          min: 0,
          max: null
        };
      }),
      containments: (type.containments || []).map(function (child) {
        return {
          childType: child.childType,
          min: child.min || 0,
          max: child.max === undefined ? null : child.max
        };
      })
    };
  });

  return {
    mainType: rootType,
    keywords: typeDefinitions.map(function (type) { return type.name; }),
    typeDefinitions: typeDefinitions,
    validationRules: [],
    leanImports: []
  };
}

const bareDSL: DomainDSL = {
  keywords: [],
  typeDefinitions: [],
  validationRules: [],
  leanImports: []
};

export function explainText(constraint: string) {
  const explainer = new ConstraintExplainer({
    domainDSL: bareDSL,
    includeExamples: false,
    verbosity: 'brief'
  });
  const trimmed = String(constraint || '').trim();
  if (/^constraint\s+/m.test(trimmed)) {
    return explainer.explainConstraintBlock(trimmed);
  }
  return explainer.explainExpression(trimmed);
}

export function translateText(input: {
  description: string;
  existing?: string;
  rootType?: string;
  types?: VocabType[];
  complete: (prompt: string, systemPrompt?: string) => Promise<string>;
}) {
  const provider: LLMProvider = { complete: input.complete };
  const translator = new NLConstraintTranslator({
    domainDSL: vocabularyToDSL(input.rootType, input.types),
    llmProvider: provider,
    existingConstraints: input.existing || '',
    rootType: input.rootType
  });
  return translator.translate(input.description);
}
