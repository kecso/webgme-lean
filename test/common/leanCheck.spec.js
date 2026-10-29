/*eslint-env node, mocha*/

var assert = require('assert'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    spawn = require('child_process').spawn,
    leanCheck = require('../../src/common/leanCheck');

var domain = [
    'namespace Demo',
    '',
    'structure _NodeId where',
    '  path : String',
    '  deriving DecidableEq, Repr',
    '',
    'class _Contained (parent child : Type) where',
    '  children : parent → List child',
    '',
    'inductive _Type where',
    '  | cFCO',
    '  | cBox',
    '  | cItem',
    '  deriving DecidableEq, Repr',
    '',
    'structure FCO where',
    '  _id : _NodeId',
    '  _type : _Type',
    '  name : String',
    '  _containment : List _NodeId',
    '  _parent : Option _NodeId',
    '  deriving Repr',
    '',
    'instance : BEq FCO where',
    '  beq a b := a._id == b._id',
    '',
    'structure Item extends FCO deriving Repr',
    '',
    'instance : BEq Item where',
    '  beq a b := a._id == b._id',
    '',
    'instance : Coe Item FCO where',
    '  coe := Item.toFCO',
    '',
    'structure Box extends FCO deriving Repr',
    '',
    'instance : BEq Box where',
    '  beq a b := a._id == b._id',
    '',
    'instance : Coe Box FCO where',
    '  coe := Box.toFCO',
    '',
    'def isA (child parent : _Type) : Bool :=',
    '  match child, parent with',
    '  | .cItem, .cItem => true',
    '  | .cItem, .cFCO => true',
    '  | .cBox, .cBox => true',
    '  | .cBox, .cFCO => true',
    '  | .cFCO, .cFCO => true',
    '  | _, _ => false',
    '',
    'def allowed (parent child : _Type) : Bool :=',
    '  match parent with',
    '  | .cBox => isA child .cItem',
    '  | _ => false',
    '',
    'def countOfType (ids : List _NodeId) (want : _Type) (resolve : _NodeId → Option _Type) : Nat :=',
    '  ids.foldl (fun acc id =>',
    '    match resolve id with',
    '    | some t => if isA t want then acc + 1 else acc',
    '    | none => acc) 0',
    '',
    'def childrenAllowed (n : FCO) (resolve : _NodeId → Option _Type) : Bool :=',
    '  n._containment.all fun id =>',
    '    match resolve id with',
    '    | some t => allowed n._type t',
    '    | none => false',
    '',
    'def parentOf (n : FCO) : Option _NodeId :=',
    '  n._parent',
    '',
    'def _Box_child_type (m : Box) (resolve : _NodeId → Option _Type) : Bool :=',
    '  childrenAllowed m.toFCO resolve',
    '',
    'def _Box_Item_child_cardinality (m : Box) (resolve : _NodeId → Option _Type) : Bool :=',
    '  countOfType m._containment .cItem resolve ≥ 1',
    ''
].join('\n');

var types = {
    FCO: {name: 'FCO', baseType: null, attributes: [], pointers: [], sets: [], containments: []},
    Item: {name: 'Item', baseType: 'FCO', attributes: [], pointers: [], sets: [], containments: []},
    Box: {
        name: 'Box',
        baseType: 'FCO',
        attributes: [],
        pointers: [],
        sets: [],
        containments: [{childType: 'Item', min: 1, max: null}]
    }
};

function box(count) {
    var nodes = [{
        id: '/box',
        name: 'box',
        metaType: 'Box',
        children: [],
        attributes: {name: 'box'},
        pointers: {},
        sets: {}
    }];
    var i;
    for (i = 0; i < count; i += 1) {
        nodes[0].children.push('/item' + i);
        nodes.push({
            id: '/item' + i,
            name: 'item' + i,
            metaType: 'Item',
            children: [],
            attributes: {name: 'item' + i},
            pointers: {},
            sets: {}
        });
    }
    return nodes;
}

var text = [
    'constraintset DemoConstraints for Box',
    'constraint ExactlyOne [error]',
    'count(Item) == 1'
].join('\n');

function programFor(count) {
    return leanCheck.buildProgram({
        domainSource: domain,
        scopeType: 'Box',
        rootId: '/box',
        nodes: box(count),
        text: text,
        types: types
    });
}

function runLean(source) {
    var leanDir = path.join(__dirname, '../../lean');
    var filePath = path.join(os.tmpdir(), 'webgme-lean-spec-' + process.pid + '.lean');
    fs.writeFileSync(filePath, source);
    return new Promise(function (resolve) {
        var proc = spawn('lake', ['env', 'lean', filePath], {cwd: leanDir});
        var stdout = '';
        var stderr = '';
        proc.stdout.on('data', function (chunk) { stdout += chunk; });
        proc.stderr.on('data', function (chunk) { stderr += chunk; });
        proc.on('error', function (err) { resolve({code: 127, output: err.message}); });
        proc.on('close', function (code) {
            fs.unlinkSync(filePath);
            resolve({code: code, output: stderr || stdout});
        });
    });
}

describe('leanCheck', function () {
    this.timeout(120000);

    it('builds a proof for one contained item', function () {
        var program = programFor(1);
        assert.strictEqual(program.ok, true, program.error);
        assert.ok(program.source.indexOf('def checkedModel : Box :=') !== -1);
        assert.ok(program.source.indexOf('_parent := some ⟨"/box"⟩') !== -1);
        assert.ok(program.source.indexOf('_containment := [⟨"/item0"⟩]') !== -1);
        assert.ok(program.source.indexOf('theorem ExactlyOne_holds') !== -1);
        assert.ok(program.source.indexOf('theorem _Box_Item_child_cardinality_holds') !== -1);
        assert.ok(program.source.indexOf('theorem _Box_child_type_holds') !== -1);
        assert.ok(program.source.trim().endsWith('end Demo'));
        assert.ok(/def ExactlyOne \(checked : Box\)(?: \[\_Contained Box Item\])? : Bool :=/
            .test(program.domainModule));
        assert.ok(program.domainModule.indexOf('[_Contained Box Item]') !== -1);
        assert.ok(program.domainModule.indexOf('theorem ExactlyOne_holds') === -1);
        assert.ok(program.domainModule.trim().endsWith('end Demo'));
        assert.ok(program.modelModule.indexOf('import Generated.Domain') === 0);
        assert.ok(program.modelModule.indexOf('def checkedModel : Box :=') !== -1);
        assert.ok(program.modelModule.indexOf('theorem ExactlyOne_holds') !== -1);
        assert.ok(program.modelModule.indexOf('def ExactlyOne (checked : Box)') === -1);
    });

    it('keeps an outer quantifier variable visible inside a nested one', function () {
        var program = leanCheck.buildProgram({
            domainSource: domain,
            scopeType: 'Box',
            rootId: '/box',
            nodes: box(2),
            text: [
                'constraintset DemoConstraints for Box',
                'constraint AtLeastTwo [error]',
                'exists e1 in Item:',
                '  exists e2 in Item:',
                '    e1 != e2'
            ].join('\n'),
            types: types
        });
        assert.strictEqual(program.ok, true, program.error);
        assert.ok(program.source.indexOf('fun e1 =>') !== -1);
        assert.ok(program.source.indexOf('fun e2 =>') !== -1);
        assert.ok(program.source.indexOf('e1 != e2') !== -1);
    });

    it('rejects a definition, which Lean does not encode yet', function () {
        var program = leanCheck.buildProgram({
            domainSource: domain,
            scopeType: 'Box',
            rootId: '/box',
            nodes: box(1),
            text: 'define answer() = 1\nconstraint A [error]\ntrue',
            types: types
        });
        assert.strictEqual(program.ok, false);
        assert.match(program.error, /define/);
    });

    it('accepts the file in Lean when the constraint holds', function () {
        var program = programFor(1);
        if (!fs.existsSync(path.join(__dirname, '../../lean/lean-toolchain'))) {
            this.skip();
        }
        return runLean(program.source).then(function (result) {
            assert.strictEqual(result.code, 0, result.output);
        });
    });

    it('accepts nested existential variables in Lean', function () {
        var program = leanCheck.buildProgram({
            domainSource: domain,
            scopeType: 'Box',
            rootId: '/box',
            nodes: box(2),
            text: [
                'constraintset DemoConstraints for Box',
                'constraint AtLeastTwo [error]',
                'exists e1 in Item:',
                '  exists e2 in Item:',
                '    e1 != e2'
            ].join('\n'),
            types: types
        });
        assert.strictEqual(program.ok, true, program.error);
        if (!fs.existsSync(path.join(__dirname, '../../lean/lean-toolchain'))) {
            this.skip();
        }
        return runLean(program.source).then(function (result) {
            assert.strictEqual(result.code, 0, result.output);
        });
    });

    it('names the constraint that a Lean error points at', function () {
        var program = programFor(2);
        var line = program.source.split('\n').findIndex(function (entry) {
            return entry.indexOf('theorem ExactlyOne_holds') === 0;
        }) + 1;
        var diagnosis = leanCheck.diagnoseRun({
            source: program.source,
            log: '/tmp/fail.lean:' + line + ':61: error: type mismatch\n  rfl\n',
            text: text,
            nodes: box(2),
            rootId: '/box',
            ok: false
        });
        assert.strictEqual(diagnosis.failures.length, 1);
        assert.strictEqual(diagnosis.failures[0].name, 'ExactlyOne');
        assert.match(diagnosis.failures[0].detail, /ExactlyOne does not hold/);
        assert.match(diagnosis.failures[0].detail, /count\(Item\) == 1/);
    });

    it('names a failed containment rule and lists a proved constraint', function () {
        var source = [
            'theorem ExactlyOne_holds : ExactlyOne checkedModel = true := rfl',
            'theorem _Box_Item_child_cardinality_holds : _Box_Item_child_cardinality checkedModel resolve = true := rfl'
        ].join('\n');
        var failed = leanCheck.diagnoseRun({
            source: source,
            log: 'model.lean:2:0: error: type mismatch',
            text: text,
            nodes: box(1),
            rootId: '/box',
            ok: false
        });
        var passed = leanCheck.diagnoseRun({
            source: source,
            log: '',
            text: text,
            nodes: box(1),
            rootId: '/box',
            ok: true
        });
        assert.match(failed.failures[0].detail, /box does not have the required number of Item children/);
        assert.deepStrictEqual(failed.proved, ['ExactlyOne']);
        assert.deepStrictEqual(passed.proved, ['ExactlyOne']);
        assert.strictEqual(passed.metaChecked, 1);
    });

    it('rejects the file in Lean when the constraint fails', function () {
        var program = programFor(2);
        assert.strictEqual(program.ok, true, program.error);
        if (!fs.existsSync(path.join(__dirname, '../../lean/lean-toolchain'))) {
            this.skip();
        }
        return runLean(program.source).then(function (result) {
            assert.notStrictEqual(result.code, 0);
            assert.match(result.output, /ExactlyOne_holds|rfl/);
        });
    });

    it('reuses a compiled Domain.olean when only the instance changes', function () {
        var leanDir = path.join(__dirname, '../../lean');
        var generatedDir = path.join(leanDir, 'Generated');
        var domainPath = path.join(generatedDir, 'Domain.lean');
        var checkPath = path.join(generatedDir, 'Check.lean');
        var pass = programFor(1);
        var fail = programFor(2);
        if (!fs.existsSync(path.join(leanDir, 'lean-toolchain'))) {
            this.skip();
        }
        assert.strictEqual(pass.ok, true, pass.error);
        assert.strictEqual(fail.ok, true, fail.error);
        assert.strictEqual(pass.domainModule, fail.domainModule);
        fs.mkdirSync(generatedDir, {recursive: true});
        fs.writeFileSync(domainPath, pass.domainModule);
        return runCommand(['lake', 'build', 'Generated.Domain'], leanDir).then(function (build) {
            var olean = path.join(leanDir, '.lake/build/lib/Generated/Domain.olean');
            var firstMtime;
            assert.strictEqual(build.code, 0, build.output);
            assert.ok(fs.existsSync(olean), 'Domain.olean should exist after the first build');
            firstMtime = fs.statSync(olean).mtimeMs;
            fs.writeFileSync(checkPath, pass.modelModule);
            return runCommand(['lake', 'env', 'lean', checkPath], leanDir).then(function (first) {
                assert.strictEqual(first.code, 0, first.output);
                return runCommand(['lake', 'build', 'Generated.Domain'], leanDir).then(function (rebuild) {
                    assert.strictEqual(rebuild.code, 0, rebuild.output);
                    assert.strictEqual(fs.statSync(olean).mtimeMs, firstMtime,
                        'Domain.olean should not be rewritten when Domain.lean is unchanged');
                    fs.writeFileSync(checkPath, fail.modelModule);
                    return runCommand(['lake', 'env', 'lean', checkPath], leanDir).then(function (second) {
                        assert.notStrictEqual(second.code, 0);
                        assert.match(second.output, /ExactlyOne_holds|rfl/);
                    });
                });
            });
        });
    });
});

function runCommand(args, cwd) {
    return new Promise(function (resolve) {
        var proc = spawn(args[0], args.slice(1), {cwd: cwd});
        var stdout = '';
        var stderr = '';
        proc.stdout.on('data', function (chunk) { stdout += chunk; });
        proc.stderr.on('data', function (chunk) { stderr += chunk; });
        proc.on('error', function (err) { resolve({code: 127, output: err.message}); });
        proc.on('close', function (code) {
            resolve({code: code, output: stderr || stdout});
        });
    });
}
