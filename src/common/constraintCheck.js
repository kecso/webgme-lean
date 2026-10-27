'use strict';

/**
 * Parses constraint-dialect text and reads the scope stored with it.
 * Whether a model satisfies the constraints is checked by Lean.
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

function parseText(text) {
    return new Parser(tokenize(String(text || ''))).parseDocument();
}

function checkText(text) {
    try {
        parseText(text);
    } catch (err) {
        return {
            ok: false,
            messages: [{severity: 'error', message: err.message || String(err)}]
        };
    }
    return {ok: true, messages: []};
}

var api = {
    DEFAULT_SCOPE: DEFAULT_SCOPE,
    scopeInText: scopeInText,
    ensureHeader: ensureHeader,
    applyScope: applyScope,
    readStored: readStored,
    writeStored: writeStored,
    parseText: parseText,
    checkText: checkText
};

if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
} else if (typeof define === 'function' && define.amd) {
    define([], function () {
        return api;
    });
}
