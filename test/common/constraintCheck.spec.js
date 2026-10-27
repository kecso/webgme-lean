/*eslint-env node, mocha*/

var assert = require('assert'),
    check = require('../../src/common/constraintCheck');

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

    it('parses a constraint set', function () {
        var report = check.checkText(counterText);
        assert.strictEqual(report.ok, true);
        assert.deepStrictEqual(report.messages, []);
    });

    it('reports a constraint that does not parse', function () {
        var report = check.checkText('constraint Broken [error]\nforall');
        assert.strictEqual(report.ok, false);
        assert.strictEqual(report.messages[0].severity, 'error');
        assert.ok(report.messages[0].message);
    });
});
