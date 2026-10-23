import { describe, it, expect } from 'vitest';
import { generateDomainDSL, generateLeanTypes, generateDSLDocumentation } from '../src/generator/dsl-generator';
import { Metamodel } from '../src/common/types';
import statechartMetamodel from '../examples/statechart/metamodel.json';

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

      expect(leanCode).toContain('namespace TestDomain');
      expect(leanCode).toContain('class _Contained');
      expect(leanCode).toContain('-- FCO definitions');
      expect(leanCode).toContain('-- Root definitions');
      expect(leanCode).toContain('-- Element definitions');
      expect(leanCode.indexOf('-- Element definitions')).toBeLessThan(leanCode.indexOf('-- Root definitions'));
      expect(leanCode.indexOf('-- Root definitions')).toBeLessThan(leanCode.indexOf('inductive _RootChild'));
      expect(leanCode.indexOf('inductive _RootChild')).toBeLessThan(leanCode.indexOf('instance : _Contained Root Element'));
      expect(leanCode).not.toContain('/-!');
      expect(leanCode).not.toContain('Not a meta');
      expect(leanCode).not.toContain('-- user defined');
      expect(leanCode).not.toContain('end TestDomain');
      expect(leanCode).not.toContain('_atLeast_');
      expect(leanCode).not.toContain('_atMost_');
      expect(dsl.mainType).toBe('Root');
    });

    it('should use the metamodel main type as the scope', () => {
      const dsl = generateDomainDSL(statechartMetamodel as Metamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(dsl.mainType).toBe('StateChart');
      expect(leanCode).toContain('namespace StatechartDomain');
      expect(leanCode).toContain('-- State definitions');
      expect(leanCode).toContain('-- StateChart definitions');
      expect(leanCode.indexOf('-- StateChart definitions')).toBeLessThan(leanCode.indexOf('inductive _StateChartChild'));
      expect(leanCode.indexOf('inductive _StateChartChild')).toBeLessThan(leanCode.indexOf('structure StateChart'));
      expect(leanCode).toContain('structure StateChart');
      expect(leanCode).not.toContain('structure Root');
      expect(leanCode).not.toContain('ROOT');
    });

    it('should generate a structure per concept', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('structure FCO where');
      expect(leanCode).toContain('structure Root extends FCO where');
      expect(leanCode).toContain('structure Element extends FCO where');
      expect(leanCode).toContain('inductive _RootChild where');
    });

    it('should emit attributes, pointers, and sets as fields', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('name : String');
      expect(leanCode).toContain('value : Int');
      expect(leanCode).toContain('active : Bool');
      expect(leanCode).not.toContain('structure ElementAttr');
      expect(leanCode).not.toContain('structure _ElementPtr');
      expect(leanCode).toContain('target : Option _NodeId');
      expect(leanCode).not.toContain('structure _ElementSets');
      expect(leanCode).toContain('refs : List _NodeId');
      expect(leanCode).toContain('_id : _NodeId');
      expect(leanCode).toContain('_type : _Type');
    });

    it('should encode a base concept with extends', () => {
      const dsl = generateDomainDSL({
        name: 'Inherit',
        rootType: 'State',
        nodes: [
          {
            name: 'State',
            isAbstract: false,
            baseType: null,
            attributes: [{ name: 'name', type: 'string' }],
            pointers: [],
            sets: [],
            containments: []
          },
          {
            name: 'Init',
            isAbstract: false,
            baseType: 'State',
            attributes: [],
            pointers: [],
            sets: [],
            containments: []
          }
        ]
      });
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('structure State extends FCO deriving Repr');
      expect(leanCode).toContain('structure Init extends State deriving Repr');
      expect(leanCode).not.toContain('structure StateAttr');
      expect(leanCode).not.toContain('structure InitAttr');
    });

    it('should coerce a descendant into the pointer target', () => {
      const dsl = generateDomainDSL({
        name: 'StatechartDomain',
        rootType: 'StateChart',
        nodes: [
          {
            name: 'FCO',
            isAbstract: true,
            baseType: null,
            attributes: [{ name: 'name', type: 'string' }],
            pointers: [],
            sets: [],
            containments: []
          },
          {
            name: 'State',
            isAbstract: false,
            baseType: 'FCO',
            attributes: [],
            pointers: [],
            sets: [],
            containments: []
          },
          {
            name: 'Init',
            isAbstract: false,
            baseType: 'State',
            attributes: [],
            pointers: [],
            sets: [],
            containments: []
          },
          {
            name: 'End',
            isAbstract: false,
            baseType: 'State',
            attributes: [],
            pointers: [],
            sets: [],
            containments: []
          },
          {
            name: 'Transition',
            isAbstract: false,
            baseType: 'FCO',
            attributes: [],
            pointers: [
              { name: 'src', targetTypes: ['State'], min: 1, max: 1 }
            ],
            sets: [],
            containments: []
          }
        ]
      });
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('src : State');
      expect(leanCode).toContain('instance : Coe Init State where');
      expect(leanCode).toContain('coe := Init.toState');
      expect(leanCode).toContain('instance : Coe End State where');
      expect(leanCode).toContain('coe := End.toState');
      expect(leanCode).toContain('| cEnd');
      expect(leanCode).toContain('| cInit');
      expect(leanCode).not.toContain('«end»');
      expect(leanCode).not.toContain('StateRef');
    });

    it('should pregenerate containment and set bounds on the main type', () => {
      const dsl = generateDomainDSL({
        name: 'Bounds',
        rootType: 'StateChart',
        nodes: [
          {
            name: 'StateChart',
            isAbstract: false,
            baseType: null,
            attributes: [{ name: 'name', type: 'string' }],
            pointers: [],
            sets: [],
            containments: [{ childType: 'Element', min: 1, max: 2 }]
          },
          {
            name: 'Element',
            isAbstract: false,
            baseType: null,
            attributes: [{ name: 'name', type: 'string' }],
            pointers: [
              { name: 'target', targetTypes: ['Element'], min: 1, max: 1 }
            ],
            sets: [
              { name: 'refs', memberTypes: ['Element'], min: 1, max: 3 }
            ],
            containments: []
          }
        ]
      });
      const leanCode = generateLeanTypes(dsl);

      expect(dsl.mainType).toBe('StateChart');
      expect(leanCode).toContain('def StateChart_atLeast_1_Element (m : StateChart) : Bool :=');
      expect(leanCode).toContain('(_Contained.children (child := Element) m).length ≥ 1');
      expect(leanCode).toContain('def StateChart_atMost_2_Element (m : StateChart) : Bool :=');
      expect(leanCode).toContain('(_Contained.children (child := Element) m).length ≤ 2');
      expect(leanCode).toContain('def StateChart_Element_refs_atLeast_1 (m : StateChart) : Bool :=');
      expect(leanCode).toContain('(_Contained.children (child := Element) m).all fun node =>');
      expect(leanCode).toContain('(node.refs).length ≥ 1');
      expect(leanCode).toContain('def StateChart_Element_refs_atMost_3 (m : StateChart) : Bool :=');
      expect(leanCode).toContain('(node.refs).length ≤ 3');
      expect(leanCode).toContain('target : _NodeId');
      expect(leanCode).not.toContain('(m : Element)');
      expect(leanCode).not.toContain('structure Root');
      expect(leanCode).not.toContain('-- user defined');
      expect(leanCode).not.toContain('end Bounds');
    });

    it('should expose containment as the children lookup', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('instance : _Contained Root Element where');
      expect(leanCode).toContain('children parent := parent._containment.filterMap');
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
