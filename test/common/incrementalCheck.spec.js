/*eslint-env node, mocha*/

var assert = require('assert'),
    incremental = require('../../src/common/incrementalCheck');

var types = {
    FCO: {name: 'FCO', baseType: null},
    StateChart: {name: 'StateChart', baseType: 'FCO'},
    State: {name: 'State', baseType: 'FCO'},
    Init: {name: 'Init', baseType: 'State'},
    End: {name: 'End', baseType: 'State'},
    Transition: {name: 'Transition', baseType: 'FCO'}
};

function chart(nodes) {
    return [{
        id: '/chart',
        name: 'chart',
        metaType: 'StateChart',
        children: nodes.map(function (node) { return node.id; }),
        attributes: {name: 'chart'},
        pointers: {},
        sets: {}
    }].concat(nodes);
}

function init(id) {
    return {
        id: id,
        name: id.split('/').pop(),
        metaType: 'Init',
        children: [],
        attributes: {name: id.split('/').pop()},
        pointers: {},
        sets: {}
    };
}

function state(id, name) {
    return {
        id: id,
        name: name || id.split('/').pop(),
        metaType: 'State',
        children: [],
        attributes: {name: name || id.split('/').pop()},
        pointers: {},
        sets: {}
    };
}

function transition(id, src, dst) {
    return {
        id: id,
        name: id.split('/').pop(),
        metaType: 'Transition',
        children: [],
        attributes: {name: id.split('/').pop(), event: 'go'},
        pointers: {src: src, dst: dst},
        sets: {}
    };
}

var countText = [
    'constraintset CounterConstraints for StateChart',
    'constraint ExactlyOneInit [error]',
    'count(Init) == 1',
    'constraint AtLeastOneState [error]',
    'count(State) >= 1',
    'constraint InitExists [error]',
    'exists i in Init:',
    '  true'
].join('\n');

var mixedText = [
    'constraintset Mixed for StateChart',
    'constraint ExactlyOneInit [error]',
    'count(Init) == 1',
    'constraint TransitionHasSource [error]',
    'forall t in Transition:',
    '  t->src != null'
].join('\n');

describe('incrementalCheck', function () {
    it('classifies count and exists-true as counter constraints', function () {
        var plan = incremental.planCheck({
            text: countText,
            types: types,
            scopeType: 'StateChart',
            nodes: chart([init('/i'), state('/s')])
        });
        assert.strictEqual(plan.ok, true, plan.error);
        assert.deepStrictEqual(plan.needsLean, []);
        assert.strictEqual(plan.actions.length, 3);
        plan.actions.forEach(function (action) {
            assert.strictEqual(action.action, 'count');
            assert.strictEqual(action.passed, true);
        });
        assert.strictEqual(plan.counts.Init, 1);
        assert.strictEqual(plan.counts.State, 2);
    });

    it('updates counters when an Init is added and fails ExactlyOneInit', function () {
        var firstNodes = chart([init('/i'), state('/s')]);
        var first = incremental.planCheck({
            text: countText,
            types: types,
            scopeType: 'StateChart',
            nodes: firstNodes
        });
        var second = incremental.planCheck({
            text: countText,
            types: types,
            scopeType: 'StateChart',
            nodes: chart([init('/i'), init('/i2'), state('/s')]),
            previousNodes: firstNodes,
            previousResults: {
                ExactlyOneInit: {passed: true},
                AtLeastOneState: {passed: true},
                InitExists: {passed: true}
            },
            previousCounts: first.counts
        });
        var exactly = second.actions.filter(function (item) {
            return item.name === 'ExactlyOneInit';
        })[0];
        var atLeast = second.actions.filter(function (item) {
            return item.name === 'AtLeastOneState';
        })[0];
        assert.strictEqual(exactly.action, 'count');
        assert.strictEqual(exactly.passed, false);
        assert.strictEqual(atLeast.action, 'count');
        assert.strictEqual(atLeast.passed, true);
        assert.deepStrictEqual(second.needsLean, []);
        assert.strictEqual(second.counts.Init, 2);
        assert.strictEqual(second.counts.State, 3);
    });

    it('reuses a transition constraint when only a State is added', function () {
        var firstNodes = chart([
            init('/i'),
            state('/s'),
            transition('/t', '/i', '/s')
        ]);
        var first = incremental.planCheck({
            text: mixedText,
            types: types,
            scopeType: 'StateChart',
            nodes: firstNodes
        });
        assert.deepStrictEqual(first.needsLean, ['TransitionHasSource']);
        assert.strictEqual(first.actions[0].action, 'count');
        assert.strictEqual(first.actions[0].passed, true);

        var second = incremental.planCheck({
            text: mixedText,
            types: types,
            scopeType: 'StateChart',
            nodes: chart([
                init('/i'),
                state('/s'),
                state('/s2'),
                transition('/t', '/i', '/s')
            ]),
            previousNodes: firstNodes,
            previousResults: {
                ExactlyOneInit: {passed: true},
                TransitionHasSource: {passed: true}
            },
            previousCounts: first.counts
        });
        var byName = {};
        second.actions.forEach(function (item) {
            byName[item.name] = item;
        });
        assert.strictEqual(byName.ExactlyOneInit.action, 'count');
        assert.strictEqual(byName.ExactlyOneInit.passed, true);
        assert.strictEqual(byName.TransitionHasSource.action, 'reuse');
        assert.strictEqual(byName.TransitionHasSource.passed, true);
        assert.deepStrictEqual(second.needsLean, []);
    });

    it('rechecks a transition constraint when a Transition is added', function () {
        var firstNodes = chart([init('/i'), state('/s')]);
        var first = incremental.planCheck({
            text: mixedText,
            types: types,
            scopeType: 'StateChart',
            nodes: firstNodes
        });
        var second = incremental.planCheck({
            text: mixedText,
            types: types,
            scopeType: 'StateChart',
            nodes: chart([
                init('/i'),
                state('/s'),
                transition('/t', '/i', '/s')
            ]),
            previousNodes: firstNodes,
            previousResults: {
                ExactlyOneInit: {passed: true},
                TransitionHasSource: {passed: true}
            },
            previousCounts: first.counts
        });
        var transitionAction = second.actions.filter(function (item) {
            return item.name === 'TransitionHasSource';
        })[0];
        assert.strictEqual(transitionAction.action, 'recheck');
        assert.deepStrictEqual(second.needsLean, ['TransitionHasSource']);
    });

    it('diffs added and removed nodes', function () {
        var diff = incremental.diffModels(
            chart([init('/i'), state('/s')]),
            chart([init('/i'), state('/s2')])
        );
        assert.strictEqual(diff.added.length, 1);
        assert.strictEqual(diff.added[0].id, '/s2');
        assert.strictEqual(diff.removed.length, 1);
        assert.strictEqual(diff.removed[0].id, '/s');
        assert.ok(diff.touchedTypes.indexOf('State') !== -1);
    });
});
