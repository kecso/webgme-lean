/*eslint-env node, mocha*/

var assert = require('assert'),
    check = require('../../src/common/constraintCheck');

function node(spec) {
    return {
        id: spec.id,
        name: spec.name,
        metaType: spec.types[0],
        types: spec.types,
        attributes: spec.attributes || {name: spec.name},
        pointers: spec.pointers || {},
        sets: spec.sets || {},
        children: spec.children || [],
        parent: spec.parent || null
    };
}

function counter(extra) {
    var nodes = [
        node({id: '/c', name: 'counter', types: ['StateChart'], children: ['/i', '/e', '/s']}),
        node({id: '/i', name: 'start', types: ['Init', 'State'], parent: '/c'}),
        node({id: '/e', name: 'done', types: ['End', 'State'], parent: '/c'}),
        node({id: '/s', name: 'middle', types: ['State'], parent: '/c'})
    ];
    return nodes.concat(extra || []);
}

var counterText = [
    'constraintset CounterConstraints for StateChart',
    'constraint ExactlyOneInit [error]',
    'count(Init) == 1',
    'constraint ExactlyOneEnd [error]',
    'count(End) == 1'
].join('\n');

describe('constraintCheck', function () {
    it('reads a plain constraint string and the scope written in it', function () {
        var stored = check.readStored(counterText);
        assert.strictEqual(stored.scope, 'StateChart');
        assert.strictEqual(stored.text, counterText);
    });

    it('reads the scope stored beside the text', function () {
        var raw = check.writeStored('constraint A [error]\ntrue', 'State');
        var stored = check.readStored(raw);
        assert.strictEqual(stored.scope, 'State');
        assert.strictEqual(stored.text, 'constraint A [error]\ntrue');
    });

    it('ignores the old fix and user registry', function () {
        var stored = check.readStored('{"fix":"lean","user":""}');
        assert.strictEqual(stored.text, '');
        assert.strictEqual(stored.scope, '');
    });

    it('rewrites the constraint set when the scope changes', function () {
        var next = check.applyScope(counterText, 'Machine');
        assert.ok(next.indexOf('constraintset CounterConstraints for Machine') === 0);
    });

    it('keeps a constraint set line for ROOT when the text is empty', function () {
        assert.strictEqual(
            check.ensureHeader('', ''),
            'constraintset Constraints for ROOT\n'
        );
    });

    it('puts the constraint set line first and keeps its name', function () {
        var next = check.ensureHeader('constraint A [error]\ntrue', 'ROOT');
        assert.strictEqual(next.split('\n')[0], 'constraintset Constraints for ROOT');
        assert.ok(next.indexOf('constraint A [error]') > 0);

        next = check.ensureHeader(counterText, 'ROOT');
        assert.strictEqual(next.split('\n')[0], 'constraintset CounterConstraints for ROOT');
        assert.strictEqual(check.ensureHeader(next, 'ROOT'), next);
    });

    it('accepts one Init and one End', function () {
        var report = check.checkModel({text: counterText, nodes: counter()});
        assert.strictEqual(report.ok, true);
        assert.deepStrictEqual(report.messages, []);
    });

    it('reports a second Init', function () {
        var nodes = counter([
            node({id: '/i2', name: 'other', types: ['Init', 'State'], parent: '/c'})
        ]);
        var report = check.checkModel({text: counterText, nodes: nodes});
        assert.strictEqual(report.ok, false);
        assert.ok(report.messages.some(function (message) {
            return message.message.indexOf('ExactlyOneInit') === 0;
        }));
    });

    it('reports two states with the same name', function () {
        var nodes = counter();
        nodes[2].name = 'start';
        nodes[2].attributes = {name: 'start'};
        var report = check.checkModel({
            text: [
                'constraintset StatechartConstraints for StateChart',
                'constraint UniqueStateNames [error]',
                'forall s1 in State:',
                '  forall s2 in State where s1.name == s2.name:',
                '    s1 == s2'
            ].join('\n'),
            nodes: nodes
        });
        assert.strictEqual(report.ok, false);
        assert.ok(report.messages[0].message.indexOf('s1 = start') !== -1);
        assert.ok(report.messages[0].message.indexOf('s2 = start') !== -1);
    });

    it('follows transitions when checking reachability', function () {
        var nodes = counter([
            node({
                id: '/t',
                name: 'go',
                types: ['Transition'],
                parent: '/c',
                attributes: {name: 'go', event: 'tick'},
                pointers: {src: '/i', dst: '/s'}
            })
        ]);
        nodes[0].children = ['/i', '/e', '/s', '/t'];
        var text = [
            'constraintset StatechartConstraints for StateChart',
            'define reachable(src, dst) = reachableVia(src, dst, Transition, "src", "dst")',
            'constraint AllStatesReachable [error]',
            'forall target in State:',
            '  exists initial in Init:',
            '    reachable(initial, target) or initial == target'
        ].join('\n');
        var open = check.checkModel({text: text, nodes: nodes});
        assert.strictEqual(open.ok, false);

        nodes.push(node({
            id: '/t2',
            name: 'finish',
            types: ['Transition'],
            parent: '/c',
            pointers: {src: '/s', dst: '/e'}
        }));
        nodes[0].children.push('/t2');
        var linked = check.checkModel({text: text, nodes: nodes});
        assert.strictEqual(linked.ok, true, JSON.stringify(linked.messages));
    });

    it('keeps a warning from failing the check', function () {
        var report = check.checkModel({
            text: 'constraint Soft [warning]\ncount(Init) == 0',
            nodes: counter()
        });
        assert.strictEqual(report.ok, true);
        assert.strictEqual(report.messages[0].severity, 'warning');
    });
});
