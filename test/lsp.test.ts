import { describe, it, expect, beforeEach } from 'vitest';
import { ConstraintLanguageServer } from '../src/lsp/constraint-language-server';
import { generateDomainDSL } from '../src/generator/dsl-generator';
import { Metamodel } from '../src/common/types';

describe('Constraint Language Server', () => {
  let server: ConstraintLanguageServer;

  const sampleMetamodel: Metamodel = {
    name: 'TestDomain',
    rootType: 'Root',
    nodes: [
      {
        name: 'State',
        isAbstract: false,
        baseType: null,
        attributes: [
          { name: 'name', type: 'string' },
          { name: 'isInitial', type: 'boolean' },
          { name: 'isFinal', type: 'boolean' }
        ],
        pointers: [
          { name: 'target', targetTypes: ['State'], min: 0, max: 1 }
        ],
        sets: [],
        containments: []
      },
      {
        name: 'Transition',
        isAbstract: false,
        baseType: null,
        attributes: [
          { name: 'event', type: 'string' }
        ],
        pointers: [
          { name: 'source', targetTypes: ['State'], min: 1, max: 1 },
          { name: 'target', targetTypes: ['State'], min: 1, max: 1 }
        ],
        sets: [],
        containments: []
      }
    ]
  };

  beforeEach(() => {
    const dsl = generateDomainDSL(sampleMetamodel);
    server = new ConstraintLanguageServer({ domainDSL: dsl });
  });

  describe('validate', () => {
    it('should validate correct constraintset syntax', () => {
      const text = `constraintset TestConstraints for State\n\nconstraint Test [error]\ntrue`;
      const diagnostics = server.validate(text);
      expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    });

    it('should report error for invalid constraintset syntax', () => {
      const text = `constraintset BadSyntax\n`;
      const diagnostics = server.validate(text);
      expect(diagnostics.some(d => d.message.includes('Invalid constraintset syntax'))).toBe(true);
    });

    it('should report error for unknown type in constraintset', () => {
      const text = `constraintset TestConstraints for UnknownType\n`;
      const diagnostics = server.validate(text);
      expect(diagnostics.some(d => d.message.includes('Unknown type'))).toBe(true);
    });

    it('should report error for invalid severity', () => {
      const text = `constraintset TestConstraints for State\n\nconstraint Test [invalid]\ntrue`;
      const diagnostics = server.validate(text);
      expect(diagnostics.some(d => d.message.includes('Invalid severity'))).toBe(true);
    });

    it('should validate valid constraint expressions', () => {
      const text = `constraintset TestConstraints for State

constraint AllStatesHaveName [error]
forall s in State: s.name != ""`;
      const diagnostics = server.validate(text);
      expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    });
  });

  describe('getCompletions', () => {
    it('should provide keyword completions', () => {
      const completions = server.getCompletions('for', { line: 0, character: 3 });
      expect(completions.some(c => c.label === 'forall')).toBe(true);
    });

    it('should provide type completions after "in"', () => {
      const completions = server.getCompletions('forall x in ', { line: 0, character: 12 });
      expect(completions.some(c => c.label === 'State')).toBe(true);
      expect(completions.some(c => c.label === 'Transition')).toBe(true);
    });

    it('should provide property completions after dot', () => {
      const completions = server.getCompletions('x.', { line: 0, character: 2 });
      expect(completions.some(c => c.label === 'name')).toBe(true);
      expect(completions.some(c => c.label === 'isInitial')).toBe(true);
      expect(completions.some(c => c.label === 'children')).toBe(true);
      expect(completions.some(c => c.label === 'parent')).toBe(true);
    });

    it('should provide function completions', () => {
      const completions = server.getCompletions('cou', { line: 0, character: 3 });
      expect(completions.some(c => c.label === 'count')).toBe(true);
    });

    it('should provide constraintset/constraint at start of line', () => {
      const completions = server.getCompletions('', { line: 0, character: 0 });
      expect(completions.some(c => c.label === 'constraintset')).toBe(true);
      expect(completions.some(c => c.label === 'constraint')).toBe(true);
    });
  });

  describe('getHover', () => {
    it('should provide hover for keywords', () => {
      const hover = server.getHover('forall x in State: true', { line: 0, character: 2 });
      expect(hover).not.toBeNull();
      expect(hover!.contents).toContain('forall');
      expect(hover!.contents).toContain('Universal quantifier');
    });

    it('should provide hover for domain types', () => {
      const hover = server.getHover('forall x in State: true', { line: 0, character: 14 });
      expect(hover).not.toBeNull();
      expect(hover!.contents).toContain('State');
      expect(hover!.contents).toContain('Attributes');
    });

    it('should provide hover for functions', () => {
      const hover = server.getHover('count(x)', { line: 0, character: 2 });
      expect(hover).not.toBeNull();
      expect(hover!.contents).toContain('count');
      expect(hover!.contents).toContain('Count elements');
    });

    it('should provide hover for attributes', () => {
      const hover = server.getHover('x.isInitial', { line: 0, character: 5 });
      expect(hover).not.toBeNull();
      expect(hover!.contents).toContain('isInitial');
    });

    it('should return null for unknown words', () => {
      const hover = server.getHover('unknownIdentifier', { line: 0, character: 5 });
      expect(hover).toBeNull();
    });
  });

  describe('format', () => {
    it('should format constraintset with proper indentation', () => {
      const input = `constraintset Test for State
constraint One [error]
// Comment
forall x in State: true`;
      
      const formatted = server.format(input);
      
      expect(formatted).toContain('constraintset Test for State');
      expect(formatted).toContain('constraint One [error]');
    });

    it('should preserve comments', () => {
      const input = `// Header comment
constraintset Test for State

constraint One [error]
// Constraint comment
true`;
      
      const formatted = server.format(input);
      expect(formatted).toContain('// Header comment');
      expect(formatted).toContain('// Constraint comment');
    });
  });

  describe('updateDomainDSL', () => {
    it('should update completions after DSL change', () => {
      const newMetamodel: Metamodel = {
        name: 'NewDomain',
        rootType: 'Root',
        nodes: [
          {
            name: 'NewType',
            isAbstract: false,
            baseType: null,
            attributes: [{ name: 'newAttr', type: 'string' }],
            pointers: [],
            sets: [],
            containments: []
          }
        ]
      };

      const newDSL = generateDomainDSL(newMetamodel);
      server.updateDomainDSL(newDSL);

      const completions = server.getCompletions('forall x in ', { line: 0, character: 12 });
      expect(completions.some(c => c.label === 'NewType')).toBe(true);
      expect(completions.some(c => c.label === 'State')).toBe(false);
    });
  });
});
