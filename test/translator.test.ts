import { describe, it, expect } from 'vitest';
import { translateConstraintSet, translateExpression } from '../src/translator/lean-translator';
import { parseConstraint } from '../src/dsl/parser';
import { generateDomainDSL } from '../src/generator/dsl-generator';
import { ConstraintSet, Metamodel } from '../src/common/types';

describe('Lean Translator', () => {
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
          { name: 'isInitial', type: 'boolean' }
        ],
        pointers: [],
        sets: [],
        containments: []
      }
    ]
  };

  const domainDSL = generateDomainDSL(sampleMetamodel);

  const defaultContext = {
    domainDSL,
    currentScope: new Map<string, string>(),
    indentLevel: 0
  };

  describe('translateExpression', () => {
    it('should translate literals', () => {
      const expr = parseConstraint('42');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('AttrValue.int 42');
    });

    it('should translate boolean literals', () => {
      const trueExpr = parseConstraint('true');
      const trueLean = translateExpression(trueExpr, defaultContext);
      expect(trueLean).toContain('AttrValue.bool true');

      const falseExpr = parseConstraint('false');
      const falseLean = translateExpression(falseExpr, defaultContext);
      expect(falseLean).toContain('AttrValue.bool false');
    });

    it('should translate string literals', () => {
      const expr = parseConstraint('"hello"');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('AttrValue.string "hello"');
    });

    it('should translate equality', () => {
      const expr = parseConstraint('x == y');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('==');
    });

    it('should translate logical and', () => {
      const expr = parseConstraint('x and y');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('&&');
    });

    it('should translate logical or', () => {
      const expr = parseConstraint('x or y');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('||');
    });

    it('should translate not', () => {
      const expr = parseConstraint('not x');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('!');
    });

    it('should translate forall', () => {
      const expr = parseConstraint('forall s in State: s == s');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('.all');
      expect(lean).toContain('fun');
      expect(lean).toContain('getNodesByType "State"');
    });

    it('should translate exists', () => {
      const expr = parseConstraint('exists s in State: s == s');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('.any');
    });

    it('should translate count', () => {
      const expr = parseConstraint('count(x)');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('.length');
    });

    it('should translate isEmpty', () => {
      const expr = parseConstraint('isEmpty(x)');
      const lean = translateExpression(expr, defaultContext);
      expect(lean).toContain('.isEmpty');
    });
  });

  describe('translateConstraintSet', () => {
    it('should generate complete Lean module', () => {
      const constraintSet: ConstraintSet = {
        name: 'TestConstraints',
        targetType: 'State',
        constraints: [
          {
            name: 'StateHasName',
            description: 'Every state must have a name',
            expression: parseConstraint('forall s in State: s.name != ""'),
            severity: 'error'
          }
        ]
      };

      const leanCode = translateConstraintSet(constraintSet, domainDSL);

      expect(leanCode).toContain('import WebGMELean');
      expect(leanCode).toContain('namespace TestConstraints');
      expect(leanCode).toContain('def StateHasName');
      expect(leanCode).toContain('def verifyAll');
      expect(leanCode).toContain('def allPass');
      expect(leanCode).toContain('end TestConstraints');
    });

    it('should include constraint descriptions as comments', () => {
      const constraintSet: ConstraintSet = {
        name: 'TestConstraints',
        targetType: 'State',
        constraints: [
          {
            name: 'TestConstraint',
            description: 'This is a test constraint',
            expression: parseConstraint('true'),
            severity: 'error'
          }
        ]
      };

      const leanCode = translateConstraintSet(constraintSet, domainDSL);
      expect(leanCode).toContain('/-- This is a test constraint -/');
    });

    it('should generate theorem for error constraints', () => {
      const constraintSet: ConstraintSet = {
        name: 'TestConstraints',
        targetType: 'State',
        constraints: [
          {
            name: 'CriticalConstraint',
            expression: parseConstraint('true'),
            severity: 'error'
          }
        ]
      };

      const leanCode = translateConstraintSet(constraintSet, domainDSL);
      expect(leanCode).toContain('theorem CriticalConstraint_holds');
    });

    it('should generate verifyAll function with all constraints', () => {
      const constraintSet: ConstraintSet = {
        name: 'TestConstraints',
        targetType: 'State',
        constraints: [
          {
            name: 'Constraint1',
            expression: parseConstraint('true'),
            severity: 'error'
          },
          {
            name: 'Constraint2',
            expression: parseConstraint('true'),
            severity: 'warning'
          }
        ]
      };

      const leanCode = translateConstraintSet(constraintSet, domainDSL);
      expect(leanCode).toContain('("Constraint1", Constraint1 m)');
      expect(leanCode).toContain('("Constraint2", Constraint2 m)');
    });
  });
});
