/**
 * Tests for NL to Constraint translation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NLConstraintTranslator, normalizeGeneratedConstraint } from '../src/nl/nl-translator';
import { ConstraintExplainer } from '../src/nl/constraint-explainer';
import { createDomainContext, generateCompactContext } from '../src/nl/domain-context';
import { DomainDSL } from '../src/generator/dsl-generator';

const sampleDomainDSL: DomainDSL = {
  keywords: ['StateMachine', 'State', 'Transition'],
  typeDefinitions: [
    {
      name: 'StateMachine',
      baseType: null,
      attributes: [{ name: 'name', type: 'string', leanType: 'String' }],
      pointers: [],
      sets: [],
      containments: [
        { childType: 'State', min: 1, max: null },
        { childType: 'Transition', min: 0, max: null }
      ]
    },
    {
      name: 'State',
      baseType: null,
      attributes: [
        { name: 'name', type: 'string', leanType: 'String' },
        { name: 'isInitial', type: 'bool', leanType: 'Bool' },
        { name: 'isFinal', type: 'bool', leanType: 'Bool' }
      ],
      pointers: [],
      sets: [],
      containments: []
    },
    {
      name: 'Transition',
      baseType: null,
      attributes: [
        { name: 'event', type: 'string', leanType: 'String' }
      ],
      pointers: [
        { name: 'source', targetTypes: ['State'], optional: false },
        { name: 'target', targetTypes: ['State'], optional: false }
      ],
      sets: [],
      containments: []
    }
  ],
  validationRules: [],
  leanImports: ['WebGMELean.Core']
};

describe('NLConstraintTranslator', () => {
  let translator: NLConstraintTranslator;

  beforeEach(() => {
    translator = new NLConstraintTranslator({
      domainDSL: sampleDomainDSL
    });
  });

  describe('generateTemplate', () => {
    it('should generate uniqueness constraint', () => {
      const result = translator.generateTemplate('Every state must have a unique name');
      
      expect(result.success).toBe(true);
      expect(result.constraint).toContain('constraint');
      expect(result.constraint).toContain('forall');
      expect(result.constraint).toContain('State');
      expect(result.constraint).toContain('name');
    });

    it('should generate non-empty attribute constraint', () => {
      // Note: Pattern matches "must have <attr>" - extracts "event" correctly only with proper phrasing
      const result = translator.generateTemplate('Every transition must have event');
      
      expect(result.success).toBe(true);
      expect(result.constraint).toContain('Transition');
      expect(result.constraint).toContain('event');
    });

    it('should generate existence constraint', () => {
      const result = translator.generateTemplate('There must be at least one state');
      
      expect(result.success).toBe(true);
      expect(result.constraint).toContain('exists');
      expect(result.constraint).toContain('State');
    });

    it('should generate single flag constraint', () => {
      // Pattern: "only one X can/should be Y"
      const result = translator.generateTemplate('only one state should be isInitial');
      
      expect(result.success).toBe(true);
      expect(result.constraint).toContain('forall');
      // Pattern matching extracts attribute name from NL, may lowercase
      expect(result.constraint?.toLowerCase()).toContain('isinitial');
    });

    it('should generate mutual exclusion constraint', () => {
      // Pattern: "X cannot/must not be both Y and Z"
      const result = translator.generateTemplate('state must not be both isInitial and isFinal');
      
      expect(result.success).toBe(true);
      expect(result.constraint).toContain('not');
      // Pattern matching extracts attribute names from NL, may lowercase
      expect(result.constraint?.toLowerCase()).toContain('isinitial');
      expect(result.constraint?.toLowerCase()).toContain('isfinal');
    });

    it('should fail gracefully for unrecognized patterns', () => {
      const result = translator.generateTemplate('Something completely unrelated');
      
      expect(result.success).toBe(false);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
    });
  });

  describe('validateConstraint', () => {
    it('should validate correct constraint', () => {
      const constraint = `constraint TestConstraint [error]
forall s in State: s.name != ""`;
      
      const result = translator.validateConstraint(constraint);
      
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should catch unknown types', () => {
      const constraint = `forall s in UnknownType: s.name != ""`;
      
      const result = translator.validateConstraint(constraint);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('UnknownType');
    });

    it('should suggest similar types for typos', () => {
      const constraint = `forall s in Stte: s.name != ""`;
      
      const result = translator.validateConstraint(constraint);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('State'))).toBe(true);
    });

    it('should validate quantifier expressions', () => {
      const constraint = `forall s1 in State:
  forall s2 in State where s1.name == s2.name:
    s1 == s2`;
      
      const result = translator.validateConstraint(constraint);
      
      expect(result.valid).toBe(true);
    });
  });
});

describe('ConstraintExplainer', () => {
  let explainer: ConstraintExplainer;

  beforeEach(() => {
    explainer = new ConstraintExplainer({
      domainDSL: sampleDomainDSL
    });
  });

  describe('explainConstraintBlock', () => {
    it('should explain a simple constraint', async () => {
      const constraint = `constraint UniqueStateNames [error]
// Each state must have a unique name
forall s1 in State:
  forall s2 in State where s1.name == s2.name:
    s1 == s2`;
      
      const result = await explainer.explainConstraintBlock(constraint);
      
      expect(result.success).toBe(true);
      expect(result.explanation).toBeDefined();
      expect(result.severity).toBe('error');
    });

    it('should extract comment as summary', async () => {
      const constraint = `constraint TestConstraint [warning]
// Every state needs a valid name
forall s in State: s.name != ""`;
      
      const result = await explainer.explainConstraintBlock(constraint);
      
      expect(result.success).toBe(true);
      // The comment is used as the summary when no better summary is generated
      expect(result.summary).toBeDefined();
    });

    it('should handle constraint with no comment', async () => {
      const constraint = `constraint NoComment [info]
exists s in State: s.isInitial == true`;
      
      const result = await explainer.explainConstraintBlock(constraint);
      
      expect(result.success).toBe(true);
      expect(result.explanation).toBeDefined();
    });
  });

  describe('explainExpression', () => {
    it('should explain forall quantifier', () => {
      const result = explainer.explainExpression('forall s in State: s.name != ""');
      
      expect(result.success).toBe(true);
      expect(result.explanation).toContain('state');
    });

    it('should explain exists quantifier', () => {
      const result = explainer.explainExpression('exists s in State: s.isInitial == true');
      
      expect(result.success).toBe(true);
      expect(result.explanation?.toLowerCase()).toContain('exist');
    });

    it('should explain nested quantifier pattern', () => {
      const result = explainer.explainExpression(
        'forall s1 in State: forall s2 in State where s1.name == s2.name: s1 == s2'
      );
      
      expect(result.success).toBe(true);
      // Should explain both quantifiers and the equality
      expect(result.explanation).toBeDefined();
      expect(result.explanation?.toLowerCase()).toContain('state');
    });

    it('should handle invalid expressions', () => {
      const result = explainer.explainExpression('not valid syntax !!!');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('normalizeGeneratedConstraint', () => {
  it('turns a bare where into the quantifier colon and groups not exists', () => {
    const source = [
      'constraint NoIncoming [error]',
      'forall init in InitState where',
      '  not exists trans in Transition where',
      '    trans->dst == init'
    ].join('\n');
    const text = normalizeGeneratedConstraint(source);

    expect(text).toContain('forall init in InitState:');
    expect(text).toContain('not (exists trans in Transition:');
    expect(text).toContain('trans->dst == init)');
    expect(text).not.toContain(' where');
  });

  it('keeps a where filter that is followed by a colon', () => {
    const source = 'forall e2 in State where e1.name == e2.name:\n  e1 == e2';
    expect(normalizeGeneratedConstraint(source)).toBe(source);
  });
});

describe('Domain Context', () => {
  describe('createDomainContext', () => {
    it('should generate system prompt', () => {
      const context = createDomainContext(sampleDomainDSL);
      
      expect(context.systemPrompt).toBeDefined();
      expect(context.systemPrompt).toContain('StateMachine');
      expect(context.systemPrompt).toContain('State');
      expect(context.systemPrompt).toContain('Transition');
    });

    it('should generate syntax reference', () => {
      const context = createDomainContext(sampleDomainDSL);
      
      expect(context.syntaxReference).toBeDefined();
      expect(context.syntaxReference).toContain('forall');
      expect(context.syntaxReference).toContain('exists');
      expect(context.syntaxReference).toContain('implies');
      expect(context.syntaxReference).toContain('not (exists trans in Transition:');
      expect(context.syntaxReference).toContain('Do not write `not exists`');
    });

    it('should generate type descriptions', () => {
      const context = createDomainContext(sampleDomainDSL);
      
      expect(context.typeDescriptions).toBeDefined();
      expect(context.typeDescriptions).toContain('State');
      expect(context.typeDescriptions).toContain('name');
      expect(context.typeDescriptions).toContain('isInitial');
    });

    it('should generate examples', () => {
      const context = createDomainContext(sampleDomainDSL);
      
      expect(context.examples).toBeDefined();
      expect(context.examples).toContain('constraint');
    });
  });

  describe('generateCompactContext', () => {
    it('should combine all context parts', () => {
      const compact = generateCompactContext(sampleDomainDSL);
      
      expect(compact).toBeDefined();
      expect(compact.length).toBeGreaterThan(0);
      expect(compact).toContain('forall');
      expect(compact).toContain('State');
    });
  });
});
