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
    'inductive _BoxChild where',
    '  | cItem : Item → _BoxChild',
    '  deriving Repr',
    '',
    'structure Box extends FCO where',
    '  _containment : List _BoxChild',
    '  deriving Repr',
    '',
    'instance : BEq Box where',
    '  beq a b := a._id == b._id',
    '',
    'instance : Coe Box FCO where',
    '  coe := Box.toFCO',
    '',
    'instance : _Contained Box Item where',
    '  children parent := parent._containment.filterMap fun',
    '    | .cItem node => some node',
    '',
    'def Box_atLeast_1_Item (m : Box) : Bool :=',
    '  (_Contained.children (child := Item) m).length ≥ 1',
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
        assert.ok(program.source.indexOf('theorem ExactlyOne_holds') !== -1);
        assert.ok(program.source.indexOf('theorem Box_atLeast_1_Item_holds') !== -1);
        assert.ok(program.source.trim().endsWith('end Demo'));
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
});
