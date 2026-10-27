'use strict';

/**
 * Evaluates constraint-dialect text against one model instance.
 *
 * The instance is the list of nodes passed in (the scope concept and its
 * descendants). A type name matches a node when that name is the node's meta
 * type or one of its bases, so Init counts as State.
 */

var KEYWORDS = {
    constraintset: true,
    constraint: true,
    for: true,
    define: true,
    forall: true,
    exists: true,
    in: true,
    where: true,
    and: true,
    or: true,
    not: true,
    implies: true,
    true: true,
    false: true,
    null: true
};

var TWO = {
    '->': true,
    '==': true,
    '!=': true,
    '<=': true,
    '>=': true,
    '&&': true,
    '||': true,
    '=>': true
};

var DEFAULT_SCOPE = 'ROOT';
var DEFAULT_SET_NAME = 'Constraints';
var HEADER_NAMED = /constraintset\s+([A-Za-z_]\w*)\s+for\s+[A-Za-z_]\w*/;
var HEADER_AT_START = /^[ \t]*constraintset\s+[A-Za-z_]\w*\s+for\s+[A-Za-z_]\w*[ \t]*\r?\n?/;
var HEADER_ANYWHERE = /[ \t]*constraintset\s+[A-Za-z_]\w*\s+for\s+[A-Za-z_]\w*[ \t]*\r?\n?/;

function scopeInText(text) {
    var match = String(text || '').match(/^\s*constraintset\s+[A-Za-z_]\w*\s+for\s+([A-Za-z_]\w*)/m);
    return match ? match[1] : '';
}

function ensureHeader(text, scope) {
    var source = String(text || '').replace(/^\uFEFF/, '');
    var found = source.match(HEADER_NAMED);
    var useScope = scope || scopeInText(source) || DEFAULT_SCOPE;
    var name = found ? found[1] : DEFAULT_SET_NAME;
    var line = 'constraintset ' + name + ' for ' + useScope;
    var body = source;

    if (HEADER_AT_START.test(source)) {
        body = source.replace(HEADER_AT_START, '');
    } else if (HEADER_ANYWHERE.test(source)) {
        body = source.replace(HEADER_ANYWHERE, '');
    }
    if (body === '') {
        return line + '\n';
    }
    if (body.charAt(0) === '\n' || body.charAt(0) === '\r') {
        return line + body;
    }
    return line + '\n' + body;
}

function applyScope(text, scope) {
    return ensureHeader(text, scope || scopeInText(text) || DEFAULT_SCOPE);
}

function readStored(raw) {
    if (typeof raw !== 'string' || raw === '') {
        return {text: '', scope: ''};
    }
    var trimmed = raw.trim();
    if (trimmed.charAt(0) === '{') {
        try {
            var parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') {
                if (typeof parsed.text === 'string' || typeof parsed.scope === 'string') {
                    var text = typeof parsed.text === 'string' ? parsed.text : '';
                    var scope = typeof parsed.scope === 'string' && parsed.scope
                        ? parsed.scope
                        : scopeInText(text);
                    return {text: text, scope: scope};
                }
                if (Object.prototype.hasOwnProperty.call(parsed, 'fix') ||
                        Object.prototype.hasOwnProperty.call(parsed, 'user')) {
                    return {text: '', scope: ''};
                }
            }
        } catch (err) {
            return {text: raw, scope: scopeInText(raw)};
        }
    }
    return {text: raw, scope: scopeInText(raw)};
}

function writeStored(text, scope) {
    return JSON.stringify({
        text: text || '',
        scope: scope || ''
    });
}

function fail(at, message) {
    var error = new Error(message);
    error.at = at;
    return error;
}

function tokenize(text) {
    var tokens = [];
    var i = 0;
    var n = text.length;

    while (i < n) {
        var c = text.charAt(i);
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
            i += 1;
            continue;
        }
        if (c === '/' && text.charAt(i + 1) === '/') {
            while (i < n && text.charAt(i) !== '\n') {
                i += 1;
            }
            continue;
        }
        if (c === '"') {
            var j = i + 1;
            var str = '';
            while (j < n && text.charAt(j) !== '"') {
                if (text.charAt(j) === '\\' && j + 1 < n) {
                    j += 1;
                    str += text.charAt(j);
                } else {
                    str += text.charAt(j);
                }
                j += 1;
            }
            if (j >= n) {
                throw fail(i, 'A string is missing its closing quote.');
            }
            tokens.push({k: 'str', v: str, at: i});
            i = j + 1;
            continue;
        }
        if (/[0-9]/.test(c)) {
            j = i + 1;
            while (j < n && /[0-9.]/.test(text.charAt(j))) {
                j += 1;
            }
            tokens.push({k: 'num', v: Number(text.slice(i, j)), at: i});
            i = j;
            continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            j = i + 1;
            while (j < n && /[A-Za-z0-9_]/.test(text.charAt(j))) {
                j += 1;
            }
            var word = text.slice(i, j);
            tokens.push({k: KEYWORDS[word] ? word : 'ident', v: word, at: i});
            i = j;
            continue;
        }
        var two = text.slice(i, i + 2);
        if (TWO[two]) {
            tokens.push({k: two, v: two, at: i});
            i += 2;
            continue;
        }
        if ('()[],.:!=<>'.indexOf(c) !== -1) {
            tokens.push({k: c, v: c, at: i});
            i += 1;
            continue;
        }
        throw fail(i, 'Unexpected character "' + c + '".');
    }
    tokens.push({k: 'eof', v: '', at: n});
    return tokens;
}

function Parser(tokens) {
    this.tokens = tokens;
    this.pos = 0;
}

Parser.prototype.peek = function () {
    return this.tokens[this.pos];
};

Parser.prototype.at = function (kind) {
    return this.peek().k === kind;
};

Parser.prototype.next = function () {
    return this.tokens[this.pos++];
};

Parser.prototype.expect = function (kind) {
    if (!this.at(kind)) {
        var found = this.peek();
        throw fail(found.at, 'Expected ' + kind + ' but found "' + (found.v || found.k) + '".');
    }
    return this.next();
};

Parser.prototype.parseDocument = function () {
    var defines = [];
    var constraints = [];
    var scope = '';
    while (!this.at('eof')) {
        if (this.at('constraintset')) {
            this.next();
            this.expect('ident');
            this.expect('for');
            scope = this.expect('ident').v;
        } else if (this.at('define')) {
            defines.push(this.parseDefine());
        } else if (this.at('constraint')) {
            constraints.push(this.parseConstraint());
        } else {
            var found = this.peek();
            throw fail(found.at, 'Expected a constraint, definition, or constraint set, found "' +
                (found.v || found.k) + '".');
        }
    }
    return {scope: scope, defines: defines, constraints: constraints};
};

Parser.prototype.parseDefine = function () {
    this.expect('define');
    var name = this.expect('ident').v;
    var params = [];
    this.expect('(');
    if (!this.at(')')) {
        params.push(this.expect('ident').v);
        while (this.at(',')) {
            this.next();
            params.push(this.expect('ident').v);
        }
    }
    this.expect(')');
    this.expect('=');
    return {name: name, params: params, body: this.parseExpr()};
};

Parser.prototype.parseConstraint = function () {
    this.expect('constraint');
    var name = this.expect('ident').v;
    var severity = 'error';
    if (this.at('[')) {
        this.next();
        severity = this.expect('ident').v;
        this.expect(']');
        if (severity !== 'error' && severity !== 'warning' && severity !== 'info') {
            severity = 'error';
        }
    }
    return {name: name, severity: severity, body: this.parseExpr()};
};

Parser.prototype.parseExpr = function () {
    if (this.at('forall') || this.at('exists')) {
        return this.parseQuantifier();
    }
    return this.parseImplies();
};

Parser.prototype.parseQuantifier = function () {
    var quantifier = this.next().k;
    var variable = this.expect('ident').v;
    this.expect('in');
    var domain = this.expect('ident').v;
    var condition = null;
    if (this.at('where')) {
        this.next();
        condition = this.parseImplies();
    }
    this.expect(':');
    return {
        k: 'quant',
        q: quantifier,
        variable: variable,
        domain: domain,
        condition: condition,
        body: this.parseExpr()
    };
};

Parser.prototype.parseImplies = function () {
    var left = this.parseOr();
    if (this.at('implies') || this.at('=>')) {
        this.next();
        return {k: 'bin', op: 'implies', left: left, right: this.parseImplies()};
    }
    return left;
};

Parser.prototype.parseOr = function () {
    var left = this.parseAnd();
    while (this.at('or') || this.at('||')) {
        this.next();
        left = {k: 'bin', op: 'or', left: left, right: this.parseAnd()};
    }
    return left;
};

Parser.prototype.parseAnd = function () {
    var left = this.parseNot();
    while (this.at('and') || this.at('&&')) {
        this.next();
        left = {k: 'bin', op: 'and', left: left, right: this.parseNot()};
    }
    return left;
};

Parser.prototype.parseNot = function () {
    if (this.at('not') || this.at('!')) {
        this.next();
        return {k: 'not', expr: this.parseNot()};
    }
    return this.parseComparison();
};

Parser.prototype.parseComparison = function () {
    var left = this.parsePrimary();
    var ops = {'==': true, '!=': true, '<': true, '>': true, '<=': true, '>=': true, in: true};
    while (ops[this.peek().k]) {
        var op = this.next().k;
        left = {k: 'bin', op: op, left: left, right: this.parsePrimary()};
    }
    return left;
};

Parser.prototype.parsePrimary = function () {
    if (this.at('true') || this.at('false')) {
        return {k: 'bool', v: this.next().k === 'true'};
    }
    if (this.at('null')) {
        this.next();
        return {k: 'null'};
    }
    if (this.at('num')) {
        return {k: 'num', v: this.next().v};
    }
    if (this.at('str')) {
        return {k: 'str', v: this.next().v};
    }
    if (this.at('(')) {
        this.next();
        var inner = this.parseExpr();
        this.expect(')');
        return this.parsePostfix(inner);
    }
    if (this.at('ident')) {
        var name = this.next().v;
        if (this.at('(')) {
            return this.parsePostfix(this.parseCall(name));
        }
        return this.parsePostfix({k: 'name', name: name});
    }
    var found = this.peek();
    throw fail(found.at, 'Expected an expression but found "' + (found.v || found.k) + '".');
};

Parser.prototype.parseCall = function (name) {
    var args = [];
    this.expect('(');
    if (!this.at(')')) {
        args.push(this.parseExpr());
        while (this.at(',')) {
            this.next();
            args.push(this.parseExpr());
        }
    }
    this.expect(')');
    return {k: 'call', name: name, args: args};
};

Parser.prototype.parsePostfix = function (expr) {
    while (this.at('.') || this.at('->') || this.at('[')) {
        if (this.at('.')) {
            this.next();
            expr = {k: 'attr', expr: expr, name: this.expect('ident').v};
        } else if (this.at('->')) {
            this.next();
            expr = {k: 'ptr', expr: expr, name: this.expect('ident').v};
        } else {
            this.next();
            var index;
            if (this.at('ident') && this.tokens[this.pos + 1] && this.tokens[this.pos + 1].k === ']') {
                index = {k: 'str', v: this.next().v};
            } else {
                index = this.parseExpr();
            }
            this.expect(']');
            expr = {k: 'set', expr: expr, index: index};
        }
    }
    return expr;
};

function bool(value) {
    return {t: 'bool', v: value === true};
}

function isTrue(value) {
    return value && value.t === 'bool' && value.v === true;
}

function isBool(value) {
    return value && value.t === 'bool';
}

function nodeLabel(node) {
    if (!node) {
        return '?';
    }
    return node.name || node.id;
}

function nodesOfType(name, ctx) {
    return ctx.nodes.filter(function (node) {
        return (node.types || [node.metaType]).indexOf(name) !== -1;
    });
}

function asNode(value, ctx, what) {
    if (!value || value.t !== 'node' || !ctx.byId[value.id]) {
        throw new Error(what + ' must be a node in the model.');
    }
    return ctx.byId[value.id];
}

function asNodes(value, what) {
    if (!value || value.t !== 'nodes') {
        throw new Error(what + ' expects a collection.');
    }
    return value.ids;
}

function childrenOf(id, ctx) {
    var node = ctx.byId[id];
    var ids = (node && node.children || []).filter(function (childId) {
        return !!ctx.byId[childId];
    });
    return {t: 'nodes', ids: ids};
}

function lookupName(name, env, ctx) {
    if (name in env) {
        return env[name];
    }
    if (ctx.fns[name]) {
        return {t: 'fn', def: ctx.fns[name]};
    }
    if (ctx.typeNames[name]) {
        return {
            t: 'nodes',
            ids: nodesOfType(name, ctx).map(function (node) { return node.id; })
        };
    }
    throw new Error('Unknown name "' + name + '".');
}

function callFunction(def, args, ctx) {
    if (ctx.depth > 32) {
        throw new Error('The definition of ' + def.name + ' is nested too deeply.');
    }
    if (args.length !== def.params.length) {
        throw new Error(def.name + ' expects ' + def.params.length + ' argument(s).');
    }
    var env = {};
    def.params.forEach(function (param, index) {
        env[param] = args[index];
    });
    ctx.depth += 1;
    try {
        return evalExpr(def.body, env, ctx);
    } finally {
        ctx.depth -= 1;
    }
}

function builtin(name, args, ctx) {
    var ids;
    var seen;
    if (name === 'count') {
        return {t: 'num', v: asNodes(args[0], 'count').length};
    }
    if (name === 'isEmpty') {
        return bool(asNodes(args[0], 'isEmpty').length === 0);
    }
    if (name === 'pointingTo') {
        var target = asNode(args[0], ctx, 'pointingTo');
        var pointer = args[2] && args[2].t === 'str' ? args[2].v : '';
        if (!pointer) {
            throw new Error('pointingTo expects a pointer name.');
        }
        ids = asNodes(args[1], 'pointingTo').filter(function (id) {
            var node = ctx.byId[id];
            return node && node.pointers && node.pointers[pointer] === target.id;
        });
        return {t: 'nodes', ids: ids};
    }
    if (name === 'reachableVia') {
        return bool(reachableVia(args, ctx));
    }
    if (name === 'reachableBy') {
        return bool(reachableBy(args, ctx));
    }
    if (name === 'connected') {
        var from = asNode(args[0], ctx, 'connected');
        var to = asNode(args[1], ctx, 'connected');
        var connectedPtr = args[2] && args[2].t === 'str' ? args[2].v : '';
        return bool(!!connectedPtr && from.pointers && from.pointers[connectedPtr] === to.id);
    }
    if (name === 'unique') {
        var attr = args[1] && args[1].t === 'str' ? args[1].v : '';
        if (!attr) {
            throw new Error('unique expects an attribute name.');
        }
        seen = {};
        ids = asNodes(args[0], 'unique');
        for (var i = 0; i < ids.length; i += 1) {
            var data = ctx.byId[ids[i]];
            var raw = data && data.attributes ? data.attributes[attr] : null;
            var key = raw === undefined || raw === null ? 'null' : typeof raw + ':' + String(raw);
            if (seen[key]) {
                return bool(false);
            }
            seen[key] = true;
        }
        return bool(true);
    }
    if (name === 'all' || name === 'any') {
        if (!args[1] || args[1].t !== 'fn') {
            throw new Error(name + ' expects a function.');
        }
        ids = asNodes(args[0], name);
        for (var n = 0; n < ids.length; n += 1) {
            var held = isTrue(callFunction(args[1].def, [{t: 'node', id: ids[n]}], ctx));
            if (name === 'all' && !held) {
                return bool(false);
            }
            if (name === 'any' && held) {
                return bool(true);
            }
        }
        return bool(name === 'all');
    }
    return null;
}

function reachableVia(args, ctx) {
    var source = asNode(args[0], ctx, 'reachableVia');
    var target = asNode(args[1], ctx, 'reachableVia');
    var edges = asNodes(args[2], 'reachableVia');
    var srcPtr = args[3] && args[3].t === 'str' ? args[3].v : '';
    var dstPtr = args[4] && args[4].t === 'str' ? args[4].v : '';
    if (!srcPtr || !dstPtr) {
        throw new Error('reachableVia expects the source and target pointer names.');
    }
    var queue = [source.id];
    var seen = {};
    while (queue.length) {
        var current = queue.shift();
        if (seen[current]) {
            continue;
        }
        seen[current] = true;
        for (var i = 0; i < edges.length; i += 1) {
            var edge = ctx.byId[edges[i]];
            if (!edge || !edge.pointers || edge.pointers[srcPtr] !== current) {
                continue;
            }
            var next = edge.pointers[dstPtr];
            if (next === target.id) {
                return true;
            }
            if (next && !seen[next]) {
                queue.push(next);
            }
        }
    }
    return false;
}

function reachableBy(args, ctx) {
    var source = asNode(args[0], ctx, 'reachableBy');
    var target = asNode(args[1], ctx, 'reachableBy');
    var pointer = args[2] && args[2].t === 'str' ? args[2].v : '';
    if (!pointer) {
        throw new Error('reachableBy expects a pointer name.');
    }
    var seen = {};
    var current = source;
    while (current && !seen[current.id]) {
        seen[current.id] = true;
        var nextId = current.pointers && current.pointers[pointer];
        if (nextId === target.id) {
            return true;
        }
        current = nextId ? ctx.byId[nextId] : null;
    }
    return false;
}

function sameValue(left, right) {
    if (left.t === 'null' || right.t === 'null') {
        return left.t === 'null' && right.t === 'null';
    }
    if (left.t === 'node' && right.t === 'node') {
        return left.id === right.id;
    }
    if (left.t === right.t && (left.t === 'num' || left.t === 'str' || left.t === 'bool')) {
        return left.v === right.v;
    }
    throw new Error('Those values cannot be compared.');
}

function evalExpr(expr, env, ctx) {
    if (expr.k === 'bool' || expr.k === 'num' || expr.k === 'str' || expr.k === 'null') {
        return expr.k === 'null' ? {t: 'null'} : {t: expr.k, v: expr.v};
    }
    if (expr.k === 'name') {
        return lookupName(expr.name, env, ctx);
    }
    if (expr.k === 'not') {
        var negated = evalExpr(expr.expr, env, ctx);
        if (!isBool(negated)) {
            throw new Error('not expects a condition.');
        }
        return bool(!negated.v);
    }
    if (expr.k === 'attr') {
        var target = evalExpr(expr.expr, env, ctx);
        var record = asNode(target, ctx, 'Attribute access');
        if (expr.name === 'children') {
            return childrenOf(record.id, ctx);
        }
        if (expr.name === 'parent') {
            return record.parent && ctx.byId[record.parent]
                ? {t: 'node', id: record.parent}
                : {t: 'null'};
        }
        if (expr.name === 'siblings') {
            var parent = record.parent && ctx.byId[record.parent];
            var ids = parent ? (parent.children || []).filter(function (id) {
                return id !== record.id && ctx.byId[id];
            }) : [];
            return {t: 'nodes', ids: ids};
        }
        if (!record.attributes || !Object.prototype.hasOwnProperty.call(record.attributes, expr.name)) {
            return {t: 'null'};
        }
        return scalar(record.attributes[expr.name]);
    }
    if (expr.k === 'ptr') {
        var owner = asNode(evalExpr(expr.expr, env, ctx), ctx, 'Pointer access');
        var pointed = owner.pointers && owner.pointers[expr.name];
        return pointed ? {t: 'node', id: pointed} : {t: 'null'};
    }
    if (expr.k === 'set') {
        var host = asNode(evalExpr(expr.expr, env, ctx), ctx, 'Set access');
        var setNameValue = evalExpr(expr.index, env, ctx);
        var setName = setNameValue.t === 'str' ? setNameValue.v : '';
        if (!setName) {
            throw new Error('A set access expects the set name.');
        }
        return {t: 'nodes', ids: (host.sets && host.sets[setName]) || []};
    }
    if (expr.k === 'call') {
        var args = expr.args.map(function (arg) {
            return evalExpr(arg, env, ctx);
        });
        var built = builtin(expr.name, args, ctx);
        if (built) {
            return built;
        }
        var defined = ctx.fns[expr.name];
        if (!defined) {
            throw new Error('Unknown function "' + expr.name + '".');
        }
        return callFunction(defined, args, ctx);
    }
    if (expr.k === 'quant') {
        return evalQuantifier(expr, env, ctx);
    }
    if (expr.k === 'bin') {
        return evalBinary(expr, env, ctx);
    }
    throw new Error('Cannot evaluate this expression.');
}

function scalar(value) {
    if (value === null || value === undefined) {
        return {t: 'null'};
    }
    if (typeof value === 'number') {
        return {t: 'num', v: value};
    }
    if (typeof value === 'boolean') {
        return {t: 'bool', v: value};
    }
    return {t: 'str', v: String(value)};
}

function evalQuantifier(expr, env, ctx) {
    var domain = nodesOfType(expr.domain, ctx);
    var index;
    for (index = 0; index < domain.length; index += 1) {
        var next = Object.create(env);
        next[expr.variable] = {t: 'node', id: domain[index].id};
        if (expr.condition && !isTrue(evalExpr(expr.condition, next, ctx))) {
            continue;
        }
        if (expr.q === 'forall') {
            ctx.bindings.push(expr.variable + ' = ' + nodeLabel(domain[index]));
            var held = evalExpr(expr.body, next, ctx);
            if (!isTrue(held)) {
                ctx.nodeId = ctx.nodeId || domain[index].id;
                return bool(false);
            }
            ctx.bindings.pop();
        } else if (isTrue(evalExpr(expr.body, next, ctx))) {
            return bool(true);
        }
    }
    return bool(expr.q !== 'exists');
}

function evalBinary(expr, env, ctx) {
    var left = evalExpr(expr.left, env, ctx);
    if (expr.op === 'implies') {
        if (!isBool(left)) {
            throw new Error('implies expects a condition.');
        }
        if (!left.v) {
            return bool(true);
        }
        var implied = evalExpr(expr.right, env, ctx);
        if (!isBool(implied)) {
            throw new Error('implies expects a condition.');
        }
        return implied;
    }
    if (expr.op === 'and' || expr.op === 'or') {
        if (!isBool(left)) {
            throw new Error(expr.op + ' expects a condition.');
        }
        if (expr.op === 'and' && !left.v) {
            return bool(false);
        }
        if (expr.op === 'or' && left.v) {
            return bool(true);
        }
        var right = evalExpr(expr.right, env, ctx);
        if (!isBool(right)) {
            throw new Error(expr.op + ' expects a condition.');
        }
        return right;
    }
    right = evalExpr(expr.right, env, ctx);
    if (expr.op === '==') {
        return bool(sameValue(left, right));
    }
    if (expr.op === '!=') {
        return bool(!sameValue(left, right));
    }
    if (expr.op === 'in') {
        if (left.t !== 'node' || right.t !== 'nodes') {
            throw new Error('in expects a node and a collection.');
        }
        return bool(right.ids.indexOf(left.id) !== -1);
    }
    if (left.t !== 'num' || right.t !== 'num') {
        throw new Error('Only numbers can be ordered.');
    }
    if (expr.op === '<') {
        return bool(left.v < right.v);
    }
    if (expr.op === '>') {
        return bool(left.v > right.v);
    }
    if (expr.op === '<=') {
        return bool(left.v <= right.v);
    }
    if (expr.op === '>=') {
        return bool(left.v >= right.v);
    }
    throw new Error('Unknown operator ' + expr.op + '.');
}

function checkModel(options) {
    var text = options && options.text || '';
    var nodes = options && options.nodes || [];
    var typeNames = {};
    var byId = {};
    var parsed;
    var messages = [];

    (options && options.typeNames || []).forEach(function (name) {
        typeNames[name] = true;
    });
    nodes.forEach(function (node) {
        byId[node.id] = node;
        (node.types || [node.metaType]).forEach(function (name) {
            if (name) {
                typeNames[name] = true;
            }
        });
    });

    try {
        parsed = new Parser(tokenize(text)).parseDocument();
    } catch (err) {
        return {
            ok: false,
            messages: [{severity: 'error', message: err.message || String(err)}]
        };
    }

    if (parsed.constraints.length === 0) {
        return {
            ok: true,
            messages: [{severity: 'info', message: 'There are no constraints to check.'}]
        };
    }

    var fns = {};
    parsed.defines.forEach(function (def) {
        fns[def.name] = def;
    });

    parsed.constraints.forEach(function (constraint) {
        var ctx = {
            nodes: nodes,
            byId: byId,
            typeNames: typeNames,
            fns: fns,
            bindings: [],
            nodeId: null,
            depth: 0
        };
        try {
            var value = evalExpr(constraint.body, Object.create(null), ctx);
            if (!isBool(value)) {
                throw new Error('The constraint must be a condition.');
            }
            if (!value.v) {
                var detail = ctx.bindings.length ? ' (' + ctx.bindings.join(', ') + ')' : '';
                messages.push({
                    severity: constraint.severity,
                    message: constraint.name + ' does not hold' + detail + '.',
                    nodeId: ctx.nodeId
                });
            }
        } catch (err) {
            messages.push({
                severity: 'error',
                message: constraint.name + ': ' + (err.message || String(err)),
                nodeId: ctx.nodeId
            });
        }
    });

    return {
        ok: !messages.some(function (message) { return message.severity === 'error'; }),
        messages: messages
    };
}

var api = {
    DEFAULT_SCOPE: DEFAULT_SCOPE,
    scopeInText: scopeInText,
    ensureHeader: ensureHeader,
    applyScope: applyScope,
    readStored: readStored,
    writeStored: writeStored,
    checkModel: checkModel
};

if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
} else if (typeof define === 'function' && define.amd) {
    define([], function () {
        return api;
    });
}
