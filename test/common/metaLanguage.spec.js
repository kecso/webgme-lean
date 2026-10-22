/*eslint-env node, mocha*/

var assert = require('assert'),
    metaLanguage = require('../../src/common/metaLanguage');

function sampleLanguage() {
    return {
        root: {path: '', name: 'ROOT'},
        concepts: {
            '/1': {
                path: '/1',
                guid: 'fco-guid',
                name: 'FCO',
                isAbstract: false,
                base: null,
                mixins: [],
                attributes: {name: {type: 'string', own: true}},
                pointers: {},
                sets: {},
                children: null
            },
            '/e': {
                path: '/e',
                guid: 'element-guid',
                name: 'Element',
                isAbstract: true,
                base: '/1',
                mixins: [],
                attributes: {
                    name: {type: 'string', own: false},
                    kind: {type: 'string', own: true}
                },
                pointers: {},
                sets: {},
                children: null
            },
            '/s': {
                path: '/s',
                guid: 'state-guid',
                name: 'State',
                isAbstract: false,
                base: '/e',
                mixins: [{path: '/n', name: 'Named', guid: 'named-guid'}],
                attributes: {
                    name: {type: 'string', own: false},
                    kind: {type: 'string', own: false},
                    label: {type: 'string', own: false},
                    isInitial: {type: 'boolean', own: true}
                },
                pointers: {},
                sets: {},
                children: null
            },
            '/t': {
                path: '/t',
                guid: 'transition-guid',
                name: 'Transition',
                isAbstract: false,
                base: '/1',
                mixins: [],
                attributes: {name: {type: 'string', own: false}},
                pointers: {
                    source: {
                        own: true,
                        min: 1,
                        max: 1,
                        targets: [{path: '/s', name: 'State', guid: 'state-guid', min: null, max: null}]
                    }
                },
                sets: {
                    labels: {
                        own: true,
                        min: 0,
                        max: null,
                        targets: [{path: '/s', name: 'State', guid: 'state-guid', min: null, max: null}]
                    }
                },
                children: null
            }
        },
        byName: {
            FCO: ['/1'],
            Element: ['/e'],
            State: ['/s'],
            Transition: ['/t']
        },
        byGuid: {
            'fco-guid': '/1',
            'element-guid': '/e',
            'state-guid': '/s',
            'transition-guid': '/t'
        }
    };
}

describe('constraint language server', function () {
    var server;

    beforeEach(function () {
        server = metaLanguage.createLanguageServer(sampleLanguage());
    });

    it('completes concept names after in', function () {
        var text = 'forall s in St';
        var items = server.getCompletions(text, {line: 0, character: text.length});
        var labels = items.map(function (item) { return item.label; });

        assert.ok(labels.indexOf('State') !== -1);
        assert.ok(labels.indexOf('Transition') === -1);
    });

    it('completes members of the quantified concept', function () {
        var text = 'forall s in State: s.is';
        var items = server.getCompletions(text, {line: 0, character: text.length});
        var labels = items.map(function (item) { return item.label; });

        assert.ok(labels.indexOf('isInitial') !== -1);
        assert.ok(labels.indexOf('source') === -1);
    });

    it('accepts inherited and mixin attributes and rejects unknown members', function () {
        var ok = server.validate('forall s in State: s.kind == "a" and s.label != "" and s.isInitial == true');
        var bad = server.validate('forall s in State: s.missing == null');
        var unknown = server.validate('forall s in NotAType: true');

        assert.deepStrictEqual(ok, []);
        assert.match(bad[0].message, /missing/);
        assert.match(bad[0].message, /attribute/);
        assert.match(unknown[0].message, /NotAType/);
    });

    it('keeps attributes, pointers, and sets in separate syntax', function () {
        var dotOnPointer = server.validate('forall t in Transition: t.source != null');
        var arrowOnAttribute = server.validate('forall t in Transition: t->name != null');
        var bracketsOnPointer = server.validate('forall t in Transition: t[source] != null');
        var pointerOk = server.validate('forall t in Transition: t->source != null');
        var setOk = server.validate('forall t in Transition: t[labels] != null');
        var arrowItems = server.getCompletions('forall t in Transition: t->', {
            line: 0,
            character: 'forall t in Transition: t->'.length
        }).map(function (item) { return item.label; });
        var bracketItems = server.getCompletions('forall t in Transition: t[', {
            line: 0,
            character: 'forall t in Transition: t['.length
        }).map(function (item) { return item.label; });
        var dotItems = server.getCompletions('forall t in Transition: t.', {
            line: 0,
            character: 'forall t in Transition: t.'.length
        }).map(function (item) { return item.label; });
        var hover = server.getHover('forall t in Transition: t->source', {
            line: 0,
            character: 'forall t in Transition: t->source'.indexOf('source') + 1
        });

        assert.match(dotOnPointer[0].message, /pointer/);
        assert.match(dotOnPointer[0].message, /->/);
        assert.match(arrowOnAttribute[0].message, /attribute/);
        assert.match(bracketsOnPointer[0].message, /pointer/);
        assert.deepStrictEqual(pointerOk, []);
        assert.deepStrictEqual(setOk, []);
        assert.ok(arrowItems.indexOf('source') !== -1);
        assert.ok(arrowItems.indexOf('name') === -1);
        assert.ok(bracketItems.indexOf('labels') !== -1);
        assert.ok(bracketItems.indexOf('source') === -1);
        assert.ok(dotItems.indexOf('name') !== -1);
        assert.ok(dotItems.indexOf('source') === -1);
        assert.match(hover.contents, /pointer/);
    });

    it('describes a concept on hover, including its base', function () {
        var text = 'forall s in State: true';
        var hover = server.getHover(text, {line: 0, character: text.indexOf('State') + 1});

        assert.match(hover.contents, /base: Element/);
        assert.match(hover.contents, /isInitial/);
        assert.match(hover.contents, /Named/);
    });
});
