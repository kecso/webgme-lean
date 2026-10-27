/**
 * Builds one self-contained Lean file for a model instance and the
 * constraints that apply to it. The file is what the Lean compiler checks.
 */

(function (root, factory) {
    if (typeof module === 'object' && module && module.exports) {
        module.exports = factory(require('./constraintCheck'));
    } else if (typeof define === 'function' && define.amd) {
        define(['webgme-lean/constraintCheck'], factory);
    }
}(this, function (constraintCheck) {
    'use strict';

    var UNSUPPORTED = {
        reachableVia: true,
        reachableBy: true,
        connected: true,
        pointingTo: true,
        parent: true,
        children: true,
        siblings: true,
        unique: true,
        all: true,
        any: true
    };

    function leanIdent(name) {
        var cleaned = String(name || '').replace(/[^A-Za-z0-9_]/g, '_');
        if (!cleaned || /^[0-9]/.test(cleaned)) {
            return 'n_' + (cleaned || 'x');
        }
        return cleaned;
    }

    function ctorIdent(name) {
        return leanIdent('c' + name);
    }

    function leanString(value) {
        return '"' + String(value)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r') + '"';
    }

    function defName(id) {
        if (id === '' || id === null || id === undefined) {
            return 'n_root';
        }
        return leanIdent('n' + String(id).replace(/\//g, '_'));
    }

    function fail(message) {
        return {ok: false, error: message, source: ''};
    }

    function typeChain(types, name) {
        var names = [];
        var current = types[name];
        var guard = 0;
        while (current && guard < 32) {
            names.push(current.name);
            current = current.baseType ? types[current.baseType] : null;
            guard += 1;
        }
        return names;
    }

    function isSubtype(types, child, parent) {
        return typeChain(types, child).indexOf(parent) !== -1;
    }

    function inherited(types, name, key) {
        var items = [];
        typeChain(types, name).slice().reverse().forEach(function (typeName) {
            var type = types[typeName];
            (type && type[key] || []).forEach(function (item) {
                items.push(item);
            });
        });
        return items;
    }

    function containedNames(types, scopeType) {
        var names = {};
        var scope = types[scopeType];
        (scope && scope.containments || []).forEach(function (child) {
            if (child.childType) {
                names[child.childType] = true;
            }
        });
        return names;
    }

    function collection(types, scopeType, typeName, modelName) {
        var contained = containedNames(types, scopeType);
        var parts = [];
        var host = null;
        var chain;
        var index;
        if (contained[typeName]) {
            parts.push('(_Contained.children (child := ' + leanIdent(typeName) + ') ' + modelName + ')');
        }
        Object.keys(contained).forEach(function (childName) {
            if (childName !== typeName && isSubtype(types, childName, typeName)) {
                parts.push('(((_Contained.children (child := ' + leanIdent(childName) + ') ' +
                    modelName + ').map fun n => (n : ' + leanIdent(typeName) + ')))');
            }
        });
        if (!contained[typeName]) {
            chain = typeChain(types, typeName);
            for (index = 1; index < chain.length; index += 1) {
                if (contained[chain[index]]) {
                    host = chain[index];
                    break;
                }
            }
            if (host) {
                parts.push('(((_Contained.children (child := ' + leanIdent(host) + ') ' + modelName +
                    ').filter fun n => n._type == .' + ctorIdent(typeName) + '))');
            }
        }
        if (!parts.length) {
            throw new Error(typeName + ' is not contained in ' + scopeType + '.');
        }
        if (parts.length === 1) {
            return parts[0];
        }
        return '(' + parts.join(' ++ ') + ')';
    }

    function pointerOf(types, ownerType, name) {
        var found = null;
        inherited(types, ownerType, 'pointers').forEach(function (pointer) {
            if (pointer.name === name) {
                found = pointer;
            }
        });
        return found;
    }

    function translateExpr(expr, env, types, scopeType) {
        var left;
        var right;
        var args;
        var owner;
        var pointer;
        var bound;
        if (!expr) {
            throw new Error('The constraint is missing an expression.');
        }
        if (expr.k === 'bool') {
            return expr.v ? 'true' : 'false';
        }
        if (expr.k === 'num') {
            return String(expr.v);
        }
        if (expr.k === 'str') {
            return leanString(expr.v);
        }
        if (expr.k === 'null') {
            return 'none';
        }
        if (expr.k === 'name') {
            bound = boundVar(env, expr.name);
            if (bound) {
                return bound.lean;
            }
            if (types[expr.name]) {
                return collection(types, scopeType, expr.name, env.model);
            }
            throw new Error('Unknown name "' + expr.name + '".');
        }
        if (expr.k === 'not') {
            return '!(' + translateExpr(expr.expr, env, types, scopeType) + ')';
        }
        if (expr.k === 'attr') {
            return '(' + translateExpr(expr.expr, env, types, scopeType) + ').' + leanIdent(expr.name);
        }
        if (expr.k === 'ptr') {
            return '(' + translateExpr(expr.expr, env, types, scopeType) + ').' + leanIdent(expr.name);
        }
        if (expr.k === 'set') {
            if (!expr.index || expr.index.k !== 'str') {
                throw new Error('A set access needs a set name.');
            }
            return '(' + translateExpr(expr.expr, env, types, scopeType) + ').' + leanIdent(expr.index.v);
        }
        if (expr.k === 'call') {
            if (UNSUPPORTED[expr.name] || expr.name === 'parent' || expr.name === 'children' || expr.name === 'siblings') {
                throw new Error('Lean check does not encode "' + expr.name + '" yet.');
            }
            args = expr.args.map(function (arg) {
                return translateExpr(arg, env, types, scopeType);
            });
            if (expr.name === 'count') {
                return '(' + args[0] + ').length';
            }
            if (expr.name === 'isEmpty') {
                return '(' + args[0] + ').isEmpty';
            }
            throw new Error('Unknown function "' + expr.name + '".');
        }
        if (expr.k === 'quant') {
            return translateQuant(expr, env, types, scopeType);
        }
        if (expr.k === 'bin') {
            left = translateExpr(expr.left, env, types, scopeType);
            if (expr.op === 'implies') {
                right = translateExpr(expr.right, env, types, scopeType);
                return '(!(' + left + ') || (' + right + '))';
            }
            if ((expr.op === '==' || expr.op === '!=') &&
                    (expr.left.k === 'null' || expr.right.k === 'null' ||
                        looksOptionalNone(expr, env, types))) {
                return nullCompare(expr, env, types, scopeType);
            }
            right = translateExpr(expr.right, env, types, scopeType);
            if (expr.op === 'and') {
                return '(' + left + ' && ' + right + ')';
            }
            if (expr.op === 'or') {
                return '(' + left + ' || ' + right + ')';
            }
            if (expr.op === '==') {
                return '(' + left + ' == ' + right + ')';
            }
            if (expr.op === '!=') {
                return '(' + left + ' != ' + right + ')';
            }
            if (expr.op === 'in') {
                return '(' + right + ').contains ' + left;
            }
            if (expr.op === '<' || expr.op === '>' || expr.op === '<=' || expr.op === '>=') {
                return '(' + left + ' ' + expr.op + ' ' + right + ')';
            }
            throw new Error('Unknown operator "' + expr.op + '".');
        }
        throw new Error('Cannot translate this expression to Lean.');
    }

    function looksOptionalNone(expr, env, types) {
        return receiverPointer(expr.left, env, types).optional ||
            receiverPointer(expr.right, env, types).optional;
    }

    function boundVar(env, name) {
        var scope = env && env.vars;
        while (scope && scope !== Object.prototype) {
            if (Object.prototype.hasOwnProperty.call(scope, name)) {
                return scope[name];
            }
            scope = Object.getPrototypeOf(scope);
        }
        return null;
    }

    function receiverPointer(expr, env, types) {
        var receiver;
        var bound;
        if (!expr || expr.k !== 'ptr') {
            return {optional: false, found: false};
        }
        receiver = expr.expr;
        bound = receiver && receiver.k === 'name' ? boundVar(env, receiver.name) : null;
        if (!bound) {
            return {optional: false, found: false};
        }
        var pointer = pointerOf(types, bound.typeName, expr.name);
        if (!pointer) {
            return {optional: false, found: false};
        }
        return {optional: pointer.optional === true, found: true, pointer: pointer};
    }

    function nullCompare(expr, env, types, scopeType) {
        var valueExpr = expr.left.k === 'null' ? expr.right : expr.left;
        var pointer = receiverPointer(valueExpr, env, types);
        var value = translateExpr(valueExpr, env, types, scopeType);
        if (pointer.found && !pointer.optional) {
            return expr.op === '!=' ? 'true' : 'false';
        }
        return '(' + value + ' ' + expr.op + ' none)';
    }

    function translateQuant(expr, env, types, scopeType) {
        var leanVar = leanIdent(expr.variable);
        var elementType = expr.domain;
        var contained = containedNames(types, scopeType);
        var chain;
        var index;
        if (!contained[expr.domain]) {
            chain = typeChain(types, expr.domain);
            for (index = 1; index < chain.length; index += 1) {
                if (contained[chain[index]]) {
                    elementType = chain[index];
                    break;
                }
            }
        }
        var next = {
            model: env.model,
            vars: Object.create(env.vars)
        };
        next.vars[expr.variable] = {lean: leanVar, typeName: elementType};
        var list = collection(types, scopeType, expr.domain, env.model);
        var body = translateExpr(expr.body, next, types, scopeType);
        if (expr.condition) {
            var cond = translateExpr(expr.condition, next, types, scopeType);
            if (expr.q === 'forall') {
                body = '(!(' + cond + ') || (' + body + '))';
            } else {
                body = '((' + cond + ') && (' + body + '))';
            }
        }
        var method = expr.q === 'forall' ? 'all' : 'any';
        return '(' + list + ').' + method + ' fun ' + leanVar + ' => ' + body;
    }

    function literal(attribute, value) {
        if (value === undefined || value === null || value === '') {
            if (attribute.leanType === 'Int' || attribute.leanType === 'Float') {
                return '0';
            }
            if (attribute.leanType === 'Bool') {
                return 'false';
            }
            return '""';
        }
        if (attribute.leanType === 'Bool') {
            return value === true || value === 'true' ? 'true' : 'false';
        }
        if (attribute.leanType === 'Int' || attribute.leanType === 'Float') {
            return String(value);
        }
        return leanString(value);
    }

    function pointerTerm(pointer, target, nodesById) {
        if (!target) {
            if (pointer.optional) {
                return 'none';
            }
            throw new Error('Required pointer "' + pointer.name + '" is unset.');
        }
        var node = nodesById[target];
        if (!node) {
            throw new Error('Pointer "' + pointer.name + '" leaves the model.');
        }
        var term = defName(node.id);
        var declared = pointer.targetTypes && pointer.targetTypes[0];
        if (pointer.targetTypes && pointer.targetTypes.length > 1) {
            term = '(.' + ctorIdent(node.metaType) + ' ' + term + ')';
        } else if (declared && node.metaType !== declared) {
            term = '(' + term + ' : ' + leanIdent(declared) + ')';
        }
        if (pointer.optional) {
            term = '(some ' + term + ')';
        }
        return term;
    }

    function containmentTerm(child, scopeType, types) {
        var contained = containedNames(types, scopeType);
        var host = child.metaType;
        var chain;
        var index;
        if (!contained[host]) {
            chain = typeChain(types, child.metaType);
            for (index = 1; index < chain.length; index += 1) {
                if (contained[chain[index]]) {
                    host = chain[index];
                    break;
                }
            }
        }
        if (!contained[host]) {
            throw new Error(child.metaType + ' cannot be stored in ' + scopeType + '.');
        }
        var term = defName(child.id);
        if (child.metaType !== host) {
            term = '(' + term + ' : ' + leanIdent(host) + ')';
        }
        return '.' + ctorIdent(host) + ' ' + term;
    }

    function emitNode(node, nodesById, types, rootId) {
        var name = node.id === rootId ? 'checkedModel' : defName(node.id);
        var lines = ['def ' + name + ' : ' + leanIdent(node.metaType) + ' := {'];
        lines.push('  _id := ⟨' + leanString(node.id === '' ? '/' : node.id) + '⟩');
        lines.push('  _type := .' + ctorIdent(node.metaType));
        lines.push('  name := ' + leanString(node.name || ''));
        inherited(types, node.metaType, 'attributes').forEach(function (attribute) {
            if (attribute.name === 'name') {
                return;
            }
            lines.push('  ' + leanIdent(attribute.name) + ' := ' +
                literal(attribute, node.attributes && node.attributes[attribute.name]));
        });
        inherited(types, node.metaType, 'pointers').forEach(function (pointer) {
            lines.push('  ' + leanIdent(pointer.name) + ' := ' +
                pointerTerm(pointer, node.pointers && node.pointers[pointer.name], nodesById));
        });
        inherited(types, node.metaType, 'sets').forEach(function (set) {
            var members = (node.sets && node.sets[set.name]) || [];
            var terms = members.map(function (memberId) {
                return pointerTerm({
                    name: set.name,
                    optional: false,
                    targetTypes: set.memberTypes || []
                }, memberId, nodesById);
            });
            lines.push('  ' + leanIdent(set.name) + ' := [' + terms.join(', ') + ']');
        });
        if ((types[node.metaType] && types[node.metaType].containments || []).length) {
            var children = (node.children || []).map(function (childId) {
                return nodesById[childId];
            }).filter(Boolean);
            lines.push('  _containment := [' + children.map(function (child) {
                return containmentTerm(child, node.metaType, types);
            }).join(', ') + ']');
        }
        lines.push('}');
        return lines.join('\n');
    }

    function orderNodes(nodes) {
        var byId = {};
        var pending = {};
        nodes.forEach(function (node) {
            byId[node.id] = node;
            pending[node.id] = true;
        });
        var ordered = [];
        var guard = 0;
        function ready(node) {
            var deps = [];
            Object.keys(node.pointers || {}).forEach(function (name) {
                if (node.pointers[name]) {
                    deps.push(node.pointers[name]);
                }
            });
            Object.keys(node.sets || {}).forEach(function (name) {
                (node.sets[name] || []).forEach(function (memberId) {
                    deps.push(memberId);
                });
            });
            (node.children || []).forEach(function (childId) {
                deps.push(childId);
            });
            return deps.every(function (id) {
                return !pending[id];
            });
        }
        while (Object.keys(pending).length && guard < nodes.length + 2) {
            var progressed = false;
            Object.keys(pending).forEach(function (id) {
                if (ready(byId[id])) {
                    ordered.push(byId[id]);
                    delete pending[id];
                    progressed = true;
                }
            });
            if (!progressed) {
                throw new Error('The model has a cycle, so Lean cannot embed it by value.');
            }
            guard += 1;
        }
        return ordered;
    }

    function boundTheorems(domainSource, scopeType) {
        var lines = [];
        var re = /^def ([A-Za-z0-9_]+) \(m : ([A-Za-z0-9_]+)\) : Bool :=/gm;
        var match;
        while ((match = re.exec(domainSource))) {
            if (match[2] === leanIdent(scopeType)) {
                lines.push('theorem ' + match[1] + '_holds : ' + match[1] + ' checkedModel = true := rfl');
            }
        }
        return lines;
    }

    function buildProgram(options) {
        var domainSource = String(options && options.domainSource || '');
        var scopeType = options && options.scopeType || '';
        var text = options && options.text || '';
        var nodes = options && options.nodes || [];
        var types = options && options.types || {};
        var rootId = options && options.rootId;
        var namespace = (domainSource.match(/^namespace\s+(\S+)/m) || [])[1] || 'Domain';
        var parsed;
        var body = [];
        var env;

        if (!scopeType || !types[scopeType]) {
            return fail('Lean has no structure for ' + (scopeType || 'the model') + '.');
        }
        try {
            parsed = constraintCheck.parseText(text);
        } catch (err) {
            return fail(err.message || String(err));
        }
        if (parsed.defines && parsed.defines.length) {
            return fail('Lean check does not encode define yet.');
        }
        try {
            var nodesById = {};
            nodes.forEach(function (node) {
                nodesById[node.id] = node;
            });
            orderNodes(nodes).forEach(function (node) {
                body.push(emitNode(node, nodesById, types, rootId));
                body.push('');
            });
            env = {model: 'checked', vars: {}};
            (parsed.constraints || []).forEach(function (constraint) {
                var expr = translateExpr(constraint.body, env, types, scopeType);
                body.push('def ' + leanIdent(constraint.name) + ' (checked : ' + leanIdent(scopeType) + ') : Bool :=');
                body.push('  ' + expr);
                body.push('theorem ' + leanIdent(constraint.name) + '_holds : ' +
                    leanIdent(constraint.name) + ' checkedModel = true := rfl');
                body.push('');
            });
            boundTheorems(domainSource, scopeType).forEach(function (line) {
                body.push(line);
            });
        } catch (err) {
            return fail(err.message || String(err));
        }

        return {
            ok: true,
            error: '',
            proved: (parsed.constraints || []).length,
            source: domainSource.replace(/\s*$/, '') + '\n\n' + body.join('\n') + '\nend ' + namespace + '\n'
        };
    }

    function metamodelNodes(language) {
        var concepts = language && language.concepts || {};
        var nodes = [];
        Object.keys(concepts).forEach(function (metaPath) {
            var concept = concepts[metaPath];
            var base = concept.base ? concepts[concept.base] : null;
            var baseChildren = {};
            if (!concept.name || concept.name === 'META') {
                return;
            }
            if (base && base.children && base.children.targets) {
                base.children.targets.forEach(function (target) {
                    baseChildren[target.path] = true;
                });
            }
            nodes.push({
                name: concept.name,
                isAbstract: concept.isAbstract === true,
                baseType: base ? base.name : null,
                attributes: Object.keys(concept.attributes || {}).filter(function (name) {
                    return concept.attributes[name] && concept.attributes[name].own;
                }).map(function (name) {
                    return {name: name, type: concept.attributes[name].type || 'string'};
                }),
                pointers: Object.keys(concept.pointers || {}).filter(function (name) {
                    return concept.pointers[name] && concept.pointers[name].own;
                }).map(function (name) {
                    var pointer = concept.pointers[name];
                    return {
                        name: name,
                        targetTypes: (pointer.targets || []).map(function (target) { return target.name; }).filter(Boolean),
                        min: pointer.min || 0,
                        max: pointer.max === undefined ? 1 : pointer.max
                    };
                }),
                sets: Object.keys(concept.sets || {}).filter(function (name) {
                    return concept.sets[name] && concept.sets[name].own;
                }).map(function (name) {
                    var set = concept.sets[name];
                    return {
                        name: name,
                        memberTypes: (set.targets || []).map(function (target) { return target.name; }).filter(Boolean),
                        min: set.min || 0,
                        max: set.max === undefined ? null : set.max
                    };
                }),
                containments: ((concept.children && concept.children.targets) || []).filter(function (target) {
                    return target.name && !baseChildren[target.path];
                }).map(function (target) {
                    return {
                        childType: target.name,
                        min: target.min || 0,
                        max: target.max === undefined ? null : target.max
                    };
                })
            });
        });
        return nodes;
    }

    return {
        buildProgram: buildProgram,
        metamodelNodes: metamodelNodes
    };
}));
