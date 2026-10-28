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
      expect(leanCode).toContain('_containment : List _NodeId');
      expect(leanCode).toContain('_parent : Option _NodeId');
      expect(leanCode).not.toContain('inductive _RootChild');
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
      expect(leanCode).toContain('structure StateChart');
      expect(leanCode).not.toContain('inductive _StateChartChild');
      expect(leanCode).not.toContain('structure Root');
      expect(leanCode).not.toContain('ROOT');
    });

    it('should generate a structure per concept', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('structure FCO where');
      expect(leanCode).toContain('structure Root extends FCO deriving Repr');
      expect(leanCode).toContain('structure Element extends FCO where');
      expect(leanCode).toContain('_containment : List _NodeId');
      expect(leanCode).not.toContain('inductive _RootChild');
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
            containments: [{ childType: 'Element', min: 1, max: 2 }],
            childMin: 1,
            childMax: 4
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
              {
                name: 'refs',
                memberTypes: ['Element'],
                min: 1,
                max: 3,
                members: [{ memberType: 'Element', min: 1, max: null }]
              }
            ],
            containments: []
          }
        ]
      });
      const leanCode = generateLeanTypes(dsl);

      expect(dsl.mainType).toBe('StateChart');
      expect(leanCode).toContain('def _StateChart_child_type (m : StateChart) (resolve : _NodeId → Option _Type) : Bool :=');
      expect(leanCode).toContain('def _StateChart_Element_child_cardinality (m : StateChart) (resolve : _NodeId → Option _Type) : Bool :=');
      expect(leanCode).toContain('countOfType m._containment .cElement resolve');
      expect(leanCode).toContain('def _StateChart_child_cardinality (m : StateChart) : Bool :=');
      expect(leanCode).toContain('m._containment.length');
      expect(leanCode).toContain('def _Element_refs_member_cardinality (m : Element) : Bool :=');
      expect(leanCode).toContain('(m.refs).length');
      expect(leanCode).toContain('def _Element_refs_Element_member_cardinality (m : Element) (resolve : _NodeId → Option _Type) : Bool :=');
      expect(leanCode).not.toContain('_atLeast_');
      expect(leanCode).not.toContain('_atMost_');
      expect(leanCode).toContain('target : _NodeId');
      expect(leanCode).not.toContain('structure Root');
      expect(leanCode).not.toContain('-- user defined');
      expect(leanCode).not.toContain('end Bounds');
    });

    it('should expose containment as the children lookup', () => {
      const dsl = generateDomainDSL(sampleMetamodel);
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('_containment : List _NodeId');
      expect(leanCode).toContain('def parentOf (n : FCO) : Option _NodeId :=');
      expect(leanCode).toContain('def allowed (parent child : _Type) : Bool :=');
      expect(leanCode).not.toContain('inductive _RootChild');
    });

    it('should treat a mixin as an instance relationship', () => {
      const dsl = generateDomainDSL({
        name: 'Mix',
        rootType: 'Box',
        nodes: [
          {
            name: 'Colored',
            isAbstract: false,
            baseType: null,
            attributes: [],
            pointers: [],
            sets: [],
            containments: [{ childType: 'Swatch', min: 1, max: null }]
          },
          {
            name: 'Swatch',
            isAbstract: false,
            baseType: null,
            attributes: [],
            pointers: [],
            sets: [],
            containments: []
          },
          {
            name: 'Box',
            isAbstract: false,
            baseType: null,
            mixins: ['Colored'],
            attributes: [],
            pointers: [],
            sets: [],
            containments: []
          }
        ]
      });
      const leanCode = generateLeanTypes(dsl);

      expect(leanCode).toContain('| .cBox, .cColored => true');
      expect(leanCode).toContain('structure Box extends FCO deriving Repr');
      expect(leanCode).not.toContain('structure Box extends Colored');
      expect(leanCode).toContain('def _Box_Swatch_child_cardinality');
      expect(leanCode).toContain('.cBox => isA child .cSwatch');
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
