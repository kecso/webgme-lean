import { describe, it, expect } from 'vitest';
import { generateDomainDSL, generateLeanTypes, generateDSLDocumentation } from '../src/generator/dsl-generator';
import { Metamodel } from '../src/common/types';

describe('DSL Generator', () => {
  const sampleMetamodel: Metamodel = {
    name: 'TestDomain',
    rootType: 'Root',
    nodes: [
      {
        name: 'Root',
        isAbstract: false,
        baseType: null,
        attributes: [
          { name: 'name', type: 'string' }
        ],
        pointers: [],
        sets: [],
        containments: [
          { childType: 'Element', min: 0, max: null }
        ]
      },
      {
        name: 'Element',
        isAbstract: false,
        baseType: null,
        attributes: [
          { name: 'name', type: 'string' },
          { name: 'value', type: 'integer' },
          { name: 'active', type: 'boolean' }
        ],
        pointers: [
          { name: 'target', targetTypes: ['Element'], min: 0, max: 1 }
        ],
        sets: [
          { name: 'refs', memberTypes: ['Element'], min: 0, max: null }
        ],
        containments: []
      }
    ]
  };

  describe('generateDomainDSL', () => {
    it('should extract keywords from type names', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      expect(dsl.keywords).toContain('Root');
      expect(dsl.keywords).toContain('Element');
    });

    it('should generate type definitions', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      expect(dsl.typeDefinitions.length).toBe(2);
      
      const elementType = dsl.typeDefinitions.find(t => t.name === 'Element');
      expect(elementType).toBeDefined();
      expect(elementType!.attributes.length).toBe(3);
      expect(elementType!.pointers.length).toBe(1);
      expect(elementType!.sets.length).toBe(1);
    });

    it('should map attribute types correctly', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const elementType = dsl.typeDefinitions.find(t => t.name === 'Element')!;
      
      const nameAttr = elementType.attributes.find(a => a.name === 'name');
      expect(nameAttr!.type).toBe('string');
      expect(nameAttr!.leanType).toBe('String');

      const valueAttr = elementType.attributes.find(a => a.name === 'value');
      expect(valueAttr!.type).toBe('int');
      expect(valueAttr!.leanType).toBe('Int');

      const activeAttr = elementType.attributes.find(a => a.name === 'active');
      expect(activeAttr!.type).toBe('bool');
      expect(activeAttr!.leanType).toBe('Bool');
    });

    it('should generate validation rules for required pointers', () => {
      const metamodelWithRequired: Metamodel = {
        ...sampleMetamodel,
        nodes: [
          ...sampleMetamodel.nodes,
          {
            name: 'Link',
            isAbstract: false,
            baseType: null,
            attributes: [],
            pointers: [
              { name: 'source', targetTypes: ['Element'], min: 1, max: 1 },
              { name: 'target', targetTypes: ['Element'], min: 1, max: 1 }
            ],
            sets: [],
            containments: []
          }
        ]
      };

      const dsl = generateDomainDSL(metamodelWithRequired);
      const requiredRules = dsl.validationRules.filter(r => 
        r.description.includes('must be set')
      );
      expect(requiredRules.length).toBeGreaterThan(0);
    });
  });

  describe('generateLeanTypes', () => {
    it('should generate valid Lean code', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('import WebGMELean');
      expect(leanCode).toContain('namespace Domain');
      expect(leanCode).toContain('end Domain');
    });

    it('should generate type predicates', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('def isRoot');
      expect(leanCode).toContain('def isElement');
    });

    it('should generate getter functions', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('def getRoots');
      expect(leanCode).toContain('def getElements');
    });

    it('should generate attribute accessors', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('Element_name');
      expect(leanCode).toContain('Element_value');
      expect(leanCode).toContain('Element_active');
    });
  });

  describe('generateDSLDocumentation', () => {
    it('should generate markdown documentation', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const docs = generateDSLDocumentation(dsl);

      expect(docs).toContain('# Domain-Specific Constraint Language');
      expect(docs).toContain('## Types');
      expect(docs).toContain('### Root');
      expect(docs).toContain('### Element');
    });

    it('should document attributes', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const docs = generateDSLDocumentation(dsl);

      expect(docs).toContain('**Attributes:**');
      expect(docs).toContain('`name`: string');
      expect(docs).toContain('`value`: int');
    });

    it('should document pointers', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const docs = generateDSLDocumentation(dsl);

      expect(docs).toContain('**Pointers:**');
      expect(docs).toContain('`target`');
    });

    it('should include syntax reference', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const docs = generateDSLDocumentation(dsl);

      expect(docs).toContain('## Constraint Syntax');
      expect(docs).toContain('### Quantifiers');
      expect(docs).toContain('forall');
      expect(docs).toContain('exists');
    });
  });
});
