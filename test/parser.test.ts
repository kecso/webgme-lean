import { describe, it, expect } from 'vitest';
import { parseConstraint } from '../src/dsl/parser';

describe('Constraint Parser', () => {
  describe('Simple expressions', () => {
    it('should parse variable reference', () => {
      const result = parseConstraint('x');
      expect(result.type).toBe('variable');
      expect((result as any).name).toBe('x');
    });

    it('should parse boolean literals', () => {
      const trueResult = parseConstraint('true');
      expect(trueResult.type).toBe('literal');
      expect((trueResult as any).value).toBe(true);

      const falseResult = parseConstraint('false');
      expect(falseResult.type).toBe('literal');
      expect((falseResult as any).value).toBe(false);
    });

    it('should parse integer literals', () => {
      const result = parseConstraint('42');
      expect(result.type).toBe('literal');
      expect((result as any).value).toBe(42);
    });

    it('should parse string literals', () => {
      const result = parseConstraint('"hello"');
      expect(result.type).toBe('literal');
      expect((result as any).value).toBe('hello');
    });
  });

  describe('Binary expressions', () => {
    it('should parse equality', () => {
      const result = parseConstraint('x == y');
      expect(result.type).toBe('binary');
      expect((result as any).operator).toBe('equals');
    });

    it('should parse inequality', () => {
      const result = parseConstraint('x != y');
      expect(result.type).toBe('binary');
      expect((result as any).operator).toBe('notEquals');
    });

    it('should parse comparisons', () => {
      const lt = parseConstraint('x < y');
      expect((lt as any).operator).toBe('lessThan');

      const le = parseConstraint('x <= y');
      expect((le as any).operator).toBe('lessOrEqual');

      const gt = parseConstraint('x > y');
      expect((gt as any).operator).toBe('greaterThan');

      const ge = parseConstraint('x >= y');
      expect((ge as any).operator).toBe('greaterOrEqual');
    });

    it('should parse logical and', () => {
      const result = parseConstraint('x and y');
      expect(result.type).toBe('binary');
      expect((result as any).operator).toBe('and');
    });

    it('should parse logical or', () => {
      const result = parseConstraint('x or y');
      expect(result.type).toBe('binary');
      expect((result as any).operator).toBe('or');
    });

    it('should parse implies', () => {
      const result = parseConstraint('x implies y');
      expect(result.type).toBe('binary');
      expect((result as any).operator).toBe('implies');
    });
  });

  describe('Unary expressions', () => {
    it('should parse not', () => {
      const result = parseConstraint('not x');
      expect(result.type).toBe('unary');
      expect((result as any).operator).toBe('not');
    });
  });

  describe('Quantifier expressions', () => {
    it('should keep init as a variable name', () => {
      const result = parseConstraint('forall init in InitState: init == init');
      expect(result.type).toBe('quantifier');
      expect((result as any).variable).toBe('init');
      expect((result as any).domain).toBe('InitState');
    });

    it('should parse forall', () => {
      const result = parseConstraint('forall x in Type: x == x');
      expect(result.type).toBe('quantifier');
      expect((result as any).quantifier).toBe('forall');
      expect((result as any).variable).toBe('x');
      expect((result as any).domain).toBe('Type');
    });

    it('should parse exists', () => {
      const result = parseConstraint('exists x in Type: x == x');
      expect(result.type).toBe('quantifier');
      expect((result as any).quantifier).toBe('exists');
    });

    it('should parse forall with where clause', () => {
      const result = parseConstraint('forall x in Type where x.active == true: x.name != ""');
      expect(result.type).toBe('quantifier');
      expect((result as any).condition).toBeDefined();
    });

    it('should parse pointer access with ->', () => {
      const result = parseConstraint('t->source');
      expect(result.type).toBe('pointer');
      expect((result as any).pointer).toBe('source');
    });

    it('should parse set access with []', () => {
      const result = parseConstraint('node[members]');
      expect(result.type).toBe('set');
      expect((result as any).setName).toBe('members');
    });
  });

  describe('Function calls', () => {
    it('should parse count', () => {
      const result = parseConstraint('count(x)');
      expect(result.type).toBe('call');
      expect((result as any).function).toBe('count');
    });

    it('should parse isEmpty', () => {
      const result = parseConstraint('isEmpty(x)');
      expect(result.type).toBe('call');
      expect((result as any).function).toBe('isEmpty');
    });

    it('should parse negated isEmpty', () => {
      const result = parseConstraint('!isEmpty(x)');
      expect(result.type).toBe('unary');
      expect((result as any).operator).toBe('not');
      expect((result as any).operand.type).toBe('call');
      expect((result as any).operand.function).toBe('isEmpty');
    });

    it('should parse user-defined function call', () => {
      const result = parseConstraint('myFunction(x, y)');
      expect(result.type).toBe('call');
      expect((result as any).function).toBe('myFunction');
      expect((result as any).arguments.length).toBe(2);
    });
  });

  describe('Complex expressions', () => {
    it('should parse nested quantifiers', () => {
      const result = parseConstraint(
        'forall x in A: forall y in B: x == y implies x.id == y.id'
      );
      expect(result.type).toBe('quantifier');
      expect((result as any).body.type).toBe('quantifier');
    });

    it('should handle operator precedence', () => {
      const result = parseConstraint('a and b or c');
      expect(result.type).toBe('binary');
      expect((result as any).operator).toBe('or');
    });

    it('should handle parentheses', () => {
      const result = parseConstraint('a and (b or c)');
      expect(result.type).toBe('binary');
      expect((result as any).operator).toBe('and');
    });
  });
});
