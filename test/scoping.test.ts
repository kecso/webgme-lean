import { describe, it, expect } from 'vitest';
import {
  getDescendants,
  getChildren,
  findModelRoots,
  createScopedModel,
  getNodesOfType,
  verifyAllModelInstances,
  getModelInstanceName
} from '../src/common/scoping';
import { ModelData, NodeData } from '../src/common/types';

describe('Constraint Scoping', () => {
  const projectWithMultipleModels: ModelData = {
    root: '/project',
    nodes: [
      {
        id: '/project',
        metaType: 'Project',
        name: 'MyProject',
        attributes: {},
        pointers: {},
        sets: {},
        children: ['/project/sm1', '/project/sm2', '/project/meta'],
        parent: null
      },
      {
        id: '/project/meta',
        metaType: 'MetaFolder',
        name: 'META',
        attributes: {},
        pointers: {},
        sets: {},
        children: [],
        parent: '/project'
      },
      // First StateMachine: TrafficLight
      {
        id: '/project/sm1',
        metaType: 'StateMachine',
        name: 'TrafficLight',
        attributes: {},
        pointers: { initialState: '/project/sm1/red' },
        sets: {},
        children: ['/project/sm1/red', '/project/sm1/yellow', '/project/sm1/green'],
        parent: '/project'
      },
      {
        id: '/project/sm1/red',
        metaType: 'State',
        name: 'Red',
        attributes: { isInitial: true, isFinal: false },
        pointers: {},
        sets: {},
        children: [],
        parent: '/project/sm1'
      },
      {
        id: '/project/sm1/yellow',
        metaType: 'State',
        name: 'Yellow',
        attributes: { isInitial: false, isFinal: false },
        pointers: {},
        sets: {},
        children: [],
        parent: '/project/sm1'
      },
      {
        id: '/project/sm1/green',
        metaType: 'State',
        name: 'Green',
        attributes: { isInitial: false, isFinal: false },
        pointers: {},
        sets: {},
        children: [],
        parent: '/project/sm1'
      },
      // Second StateMachine: Elevator
      {
        id: '/project/sm2',
        metaType: 'StateMachine',
        name: 'Elevator',
        attributes: {},
        pointers: { initialState: '/project/sm2/idle' },
        sets: {},
        children: ['/project/sm2/idle', '/project/sm2/up', '/project/sm2/down'],
        parent: '/project'
      },
      {
        id: '/project/sm2/idle',
        metaType: 'State',
        name: 'Idle',
        attributes: { isInitial: true, isFinal: false },
        pointers: {},
        sets: {},
        children: [],
        parent: '/project/sm2'
      },
      {
        id: '/project/sm2/up',
        metaType: 'State',
        name: 'MovingUp',
        attributes: { isInitial: false, isFinal: false },
        pointers: {},
        sets: {},
        children: [],
        parent: '/project/sm2'
      },
      {
        id: '/project/sm2/down',
        metaType: 'State',
        name: 'MovingDown',
        attributes: { isInitial: false, isFinal: false },
        pointers: {},
        sets: {},
        children: [],
        parent: '/project/sm2'
      }
    ]
  };

  describe('findModelRoots', () => {
    it('should find all instances of a model root type', () => {
      const roots = findModelRoots(projectWithMultipleModels, 'StateMachine');
      expect(roots.length).toBe(2);
      expect(roots.map(r => r.name)).toContain('TrafficLight');
      expect(roots.map(r => r.name)).toContain('Elevator');
    });

    it('should return empty for non-existent types', () => {
      const roots = findModelRoots(projectWithMultipleModels, 'NonExistent');
      expect(roots.length).toBe(0);
    });
  });

  describe('getDescendants', () => {
    it('should get all descendants including the root', () => {
      const descendants = getDescendants(projectWithMultipleModels, '/project/sm1');
      expect(descendants.length).toBe(4); // StateMachine + 3 States
      expect(descendants.map(d => d.name)).toContain('TrafficLight');
      expect(descendants.map(d => d.name)).toContain('Red');
      expect(descendants.map(d => d.name)).toContain('Yellow');
      expect(descendants.map(d => d.name)).toContain('Green');
    });

    it('should not include nodes from other model instances', () => {
      const descendants = getDescendants(projectWithMultipleModels, '/project/sm1');
      expect(descendants.map(d => d.name)).not.toContain('Idle');
      expect(descendants.map(d => d.name)).not.toContain('Elevator');
    });
  });

  describe('getChildren', () => {
    it('should get only direct children', () => {
      const children = getChildren(projectWithMultipleModels, '/project/sm1');
      expect(children.length).toBe(3);
      expect(children.every(c => c.metaType === 'State')).toBe(true);
    });
  });

  describe('createScopedModel', () => {
    it('should create a scoped view with descendants mode', () => {
      const scoped = createScopedModel(
        projectWithMultipleModels,
        '/project/sm1',
        'StateMachine',
        'descendants'
      );
      
      expect(scoped.context.modelRootId).toBe('/project/sm1');
      expect(scoped.context.scopeMode).toBe('descendants');
      expect(scoped.nodes.length).toBe(4);
    });

    it('should create a scoped view with children mode', () => {
      const scoped = createScopedModel(
        projectWithMultipleModels,
        '/project/sm1',
        'StateMachine',
        'children'
      );
      
      expect(scoped.nodes.length).toBe(4); // root + 3 children
    });

    it('should create a global view with global mode', () => {
      const scoped = createScopedModel(
        projectWithMultipleModels,
        '/project/sm1',
        'StateMachine',
        'global'
      );
      
      expect(scoped.nodes.length).toBe(projectWithMultipleModels.nodes.length);
    });
  });

  describe('getNodesOfType', () => {
    it('should get nodes of type within scope', () => {
      const scoped = createScopedModel(
        projectWithMultipleModels,
        '/project/sm1',
        'StateMachine'
      );
      
      const states = getNodesOfType(scoped, 'State');
      expect(states.length).toBe(3);
      expect(states.map(s => s.name)).toEqual(['Red', 'Yellow', 'Green']);
    });

    it('should not return nodes outside scope', () => {
      const scoped = createScopedModel(
        projectWithMultipleModels,
        '/project/sm1',
        'StateMachine'
      );
      
      const states = getNodesOfType(scoped, 'State');
      expect(states.map(s => s.name)).not.toContain('Idle');
    });
  });

  describe('verifyAllModelInstances', () => {
    it('should verify each model instance separately', async () => {
      const results = await verifyAllModelInstances(
        projectWithMultipleModels,
        'StateMachine',
        async (scoped) => {
          const states = getNodesOfType(scoped, 'State');
          return {
            modelName: getModelInstanceName(projectWithMultipleModels, scoped.context.modelRootId),
            stateCount: states.length
          };
        }
      );

      expect(results.size).toBe(2);
      
      const trafficLightResult = results.get('/project/sm1');
      expect(trafficLightResult?.modelName).toBe('TrafficLight');
      expect(trafficLightResult?.stateCount).toBe(3);
      
      const elevatorResult = results.get('/project/sm2');
      expect(elevatorResult?.modelName).toBe('Elevator');
      expect(elevatorResult?.stateCount).toBe(3);
    });
  });

  describe('getModelInstanceName', () => {
    it('should return the node name', () => {
      const name = getModelInstanceName(projectWithMultipleModels, '/project/sm1');
      expect(name).toBe('TrafficLight');
    });

    it('should return id for unknown nodes', () => {
      const name = getModelInstanceName(projectWithMultipleModels, '/unknown');
      expect(name).toBe('/unknown');
    });
  });

  describe('Real-world scoping scenario', () => {
    it('should correctly scope "unique names" constraint per model', () => {
      // This simulates what happens when we check "all states have unique names"
      // Each model is checked independently
      
      const models = findModelRoots(projectWithMultipleModels, 'StateMachine');
      
      for (const model of models) {
        const scoped = createScopedModel(
          projectWithMultipleModels,
          model.id,
          'StateMachine'
        );
        
        const states = getNodesOfType(scoped, 'State');
        const names = states.map(s => s.name);
        const uniqueNames = new Set(names);
        
        // Each model should have unique names within itself
        expect(names.length).toBe(uniqueNames.size);
      }
    });

    it('should allow same state names in different models', () => {
      // Add a state named "Red" to Elevator - this should be fine
      // because scoping means we check uniqueness per-model
      const modelWithDuplicateNames: ModelData = {
        ...projectWithMultipleModels,
        nodes: [
          ...projectWithMultipleModels.nodes,
          {
            id: '/project/sm2/red',
            metaType: 'State',
            name: 'Red', // Same name as in TrafficLight!
            attributes: { isInitial: false, isFinal: false },
            pointers: {},
            sets: {},
            children: [],
            parent: '/project/sm2'
          }
        ]
      };

      // Update Elevator's children
      const elevatorNode = modelWithDuplicateNames.nodes.find(n => n.id === '/project/sm2')!;
      elevatorNode.children = [...elevatorNode.children, '/project/sm2/red'];

      // Global check would fail (two nodes named "Red")
      const allStates = modelWithDuplicateNames.nodes.filter(n => n.metaType === 'State');
      const allNames = allStates.map(s => s.name);
      expect(allNames.filter(n => n === 'Red').length).toBe(2); // Two Reds globally

      // But scoped check passes for each model
      const trafficLightScoped = createScopedModel(
        modelWithDuplicateNames,
        '/project/sm1',
        'StateMachine'
      );
      const trafficLightStates = getNodesOfType(trafficLightScoped, 'State');
      const trafficLightNames = trafficLightStates.map(s => s.name);
      expect(new Set(trafficLightNames).size).toBe(trafficLightNames.length); // All unique

      const elevatorScoped = createScopedModel(
        modelWithDuplicateNames,
        '/project/sm2',
        'StateMachine'
      );
      const elevatorStates = getNodesOfType(elevatorScoped, 'State');
      const elevatorNames = elevatorStates.map(s => s.name);
      expect(new Set(elevatorNames).size).toBe(elevatorNames.length); // All unique
    });
  });
});
