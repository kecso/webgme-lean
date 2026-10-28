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

    function fcoView(expr, env, types, scopeType) {
        var value = translateExpr(expr, env, types, scopeType);
        var typeName = null;
        var bound;
        if (expr && expr.k === 'name') {
            bound = boundVar(env, expr.name);
            if (bound && bound.typeName) {
                typeName = bound.typeName;
            }
        }
        if (typeName === 'FCO') {
            return value;
        }
        return '(' + value + '.toFCO)';
    }

    function effectiveContainments(types, typeName) {
        var seen = {};
        var rules = [];
        var queue = typeName ? [typeName] : [];
        var guard = {};
        while (queue.length) {
            var currentName = queue.shift();
            var current;
            if (!currentName || guard[currentName]) {
                continue;
            }
            guard[currentName] = true;
            current = types[currentName];
            if (!current) {
                continue;
            }
            (current.containments || []).forEach(function (rule) {
                if (!rule.childType || seen[rule.childType]) {
                    return;
                }
                seen[rule.childType] = true;
                rules.push(rule);
            });
            if (current.baseType) {
                queue.push(current.baseType);
            }
            (current.mixins || []).forEach(function (mixinName) {
                queue.push(mixinName);
            });
        }
        return rules;
    }

    function containedNames(types, scopeType) {
        var names = {};
        effectiveContainments(types, scopeType).forEach(function (child) {
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
            if (expr.name === 'parent') {
                return '(parentOf ' + fcoView(expr.expr, env, types, scopeType) + ')';
            }
            if (expr.name === 'children') {
                return '(' + fcoView(expr.expr, env, types, scopeType) + ')._containment';
            }
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

    function nodeTerm(node, rootId) {
        return node.id === rootId ? 'checkedModel' : defName(node.id);
    }

    function emitNode(node, nodesById, types, rootId, parentOf) {
        var name = nodeTerm(node, rootId);
        var parentId = parentOf[node.id];
        var childIds = node.children || [];
        var lines = ['def ' + name + ' : ' + leanIdent(node.metaType) + ' := {'];
        lines.push('  _id := ⟨' + leanString(node.id === '' ? '/' : node.id) + '⟩');
        lines.push('  _type := .' + ctorIdent(node.metaType));
        lines.push('  name := ' + leanString(node.name || ''));
        lines.push('  _parent := ' + (parentId
            ? 'some ⟨' + leanString(parentId === '' ? '/' : parentId) + '⟩'
            : 'none'));
        lines.push('  _containment := [' + childIds.map(function (childId) {
            return '⟨' + leanString(childId === '' ? '/' : childId) + '⟩';
        }).join(', ') + ']');
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

    function metaTheorems(domainSource, nodes, rootId) {
        var lines = [];
        var rules = [];
        var re = /^def (_[A-Za-z0-9_«»]+) \([A-Za-z0-9_]+ : ([A-Za-z0-9_«»]+)\)(.*)$/gm;
        var match;
        while ((match = re.exec(domainSource))) {
            rules.push({
                name: match[1],
                typeName: match[2],
                needsResolve: match[3].indexOf('resolve') !== -1
            });
        }
        nodes.forEach(function (node) {
            var term = nodeTerm(node, rootId);
            var typeName = leanIdent(node.metaType);
            rules.forEach(function (rule) {
                var theorem;
                var args;
                if (rule.typeName !== typeName) {
                    return;
                }
                theorem = rule.name + (term === 'checkedModel' ? '_holds' : '_' + term + '_holds');
                args = rule.needsResolve ? term + ' resolve' : term;
                lines.push('theorem ' + theorem + ' : ' + rule.name + ' ' + args + ' = true := rfl');
            });
        });
        return lines;
    }

    function emitResolve(nodes, rootId) {
        var clauses = nodes.map(function (node) {
            return 'if id == ' + nodeTerm(node, rootId) + '._id then some .' + ctorIdent(node.metaType);
        });
        var body = clauses.length ? clauses.join('\n    else ') + '\n    else none' : 'none';
        return 'def resolve : _NodeId → Option _Type\n  | id =>\n    ' + body;
    }

    function emitContained(scopeType, types, nodes, rootId) {
        var chunks = [];
        effectiveContainments(types, scopeType).forEach(function (rule) {
            var target = leanIdent(rule.childType);
            var reader = 'as' + target;
            var clauses = [];
            nodes.forEach(function (node) {
                var value;
                if (!isSubtype(types, node.metaType, rule.childType)) {
                    return;
                }
                value = nodeTerm(node, rootId);
                if (node.metaType !== rule.childType) {
                    value = '(' + value + ' : ' + target + ')';
                }
                clauses.push('if id == ' + nodeTerm(node, rootId) + '._id then some ' + value);
            });
            chunks.push('def ' + reader + ' : _NodeId → Option ' + target);
            chunks.push('  | id =>');
            chunks.push('    ' + (clauses.length ? clauses.join('\n    else ') + '\n    else none' : 'none'));
            chunks.push('');
            chunks.push('instance : _Contained ' + leanIdent(scopeType) + ' ' + target + ' where');
            chunks.push('  children parent := parent._containment.filterMap ' + reader);
            chunks.push('');
        });
        return chunks.join('\n');
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
            var parentOf = {};
            nodes.forEach(function (node) {
                nodesById[node.id] = node;
                (node.children || []).forEach(function (childId) {
                    parentOf[childId] = node.id;
                });
            });
            orderNodes(nodes).forEach(function (node) {
                body.push(emitNode(node, nodesById, types, rootId, parentOf));
                body.push('');
            });
            body.push(emitResolve(nodes, rootId));
            body.push('');
            body.push(emitContained(scopeType, types, nodes, rootId));
            env = {model: 'checked', vars: {}};
            (parsed.constraints || []).forEach(function (constraint) {
                var expr = translateExpr(constraint.body, env, types, scopeType);
                body.push('def ' + leanIdent(constraint.name) + ' (checked : ' + leanIdent(scopeType) + ') : Bool :=');
                body.push('  ' + expr);
                body.push('theorem ' + leanIdent(constraint.name) + '_holds : ' +
                    leanIdent(constraint.name) + ' checkedModel = true := rfl');
                body.push('');
            });
            metaTheorems(domainSource, nodes, rootId).forEach(function (line) {
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
            if (!concept.name || concept.name === 'META') {
                return;
            }
            nodes.push({
                name: concept.name,
                isAbstract: concept.isAbstract === true,
                baseType: base ? base.name : null,
                mixins: (concept.mixins || []).map(function (mixin) {
                    return mixin.name;
                }).filter(Boolean),
                childMin: concept.children ? concept.children.min : null,
                childMax: concept.children ? concept.children.max : null,
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
                        max: set.max === undefined ? null : set.max,
                        members: (set.targets || []).filter(function (target) {
                            return !!target.name;
                        }).map(function (target) {
                            return {
                                memberType: target.name,
                                min: target.min || 0,
                                max: target.max === undefined ? null : target.max
                            };
                        })
                    };
                }),
                containments: ((concept.children && concept.children.targets) || []).filter(function (target) {
                    return !!target.name;
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

    function constraintSections(text) {
        var sections = [];
        var current = null;
        String(text || '').split(/\r?\n/).forEach(function (line) {
            var match = /^\s*constraint\s+([A-Za-z_]\w*)/.exec(line);
            if (match) {
                current = {name: match[1], lines: []};
                sections.push(current);
                return;
            }
            if (!current || !line.trim() || /^\s*\/\//.test(line) || /^\s*constraintset\b/.test(line)) {
                return;
            }
            if (/^\s*(constraint|define)\b/.test(line)) {
                current = null;
                return;
            }
            current.lines.push(line.trim());
        });
        return sections;
    }

    function declarations(source) {
        var items = [];
        String(source || '').split(/\r?\n/).forEach(function (line, index) {
            var match = /^(theorem|def)\s+([A-Za-z0-9_«»]+)/.exec(line);
            if (match) {
                items.push({kind: match[1], name: match[2], line: index + 1});
            }
        });
        return items;
    }

    function leanErrors(logText) {
        var errors = [];
        var current = null;
        String(logText || '').split(/\r?\n/).forEach(function (line) {
            var match = /^.*:(\d+):\d+:\s*error:\s*(.*)$/.exec(line);
            if (match) {
                current = {line: Number(match[1]), message: match[2], lines: [match[2]]};
                errors.push(current);
                return;
            }
            if (current && line.trim()) {
                current.lines.push(line);
            }
        });
        return errors;
    }

    function splitOwner(rest, concepts) {
        var best = '';
        (concepts || []).forEach(function (name) {
            var ident = leanIdent(name);
            if ((rest === ident || rest.indexOf(ident + '_') === 0) && ident.length > best.length) {
                best = ident;
            }
        });
        if (!best) {
            return {owner: rest, tail: ''};
        }
        return {owner: best, tail: rest.slice(best.length).replace(/^_/, '')};
    }

    function metaDetail(rule, nodeLabel, concepts) {
        var tail;
        var split;
        var parts;
        if (/_child_type$/.test(rule)) {
            return nodeLabel + ' has a child whose type is not allowed.';
        }
        if (/_child_cardinality$/.test(rule)) {
            tail = rule.replace(/^_/, '').replace(/_child_cardinality$/, '');
            split = splitOwner(tail, concepts);
            if (split.tail) {
                return nodeLabel + ' does not have the required number of ' + split.tail + ' children.';
            }
            return nodeLabel + ' does not have the required number of children.';
        }
        if (/_member_cardinality$/.test(rule)) {
            tail = rule.replace(/^_/, '').replace(/_member_cardinality$/, '');
            split = splitOwner(tail, concepts);
            parts = split.tail ? split.tail.split('_') : [];
            if (parts.length >= 2) {
                return nodeLabel + ' does not have the required number of ' +
                    parts.slice(1).join(' ') + ' members in ' + parts[0] + '.';
            }
            if (parts.length === 1) {
                return nodeLabel + ' does not have the required number of members in ' + parts[0] + '.';
            }
            return nodeLabel + ' does not have the required number of set members.';
        }
        return rule + ' does not hold for ' + nodeLabel + '.';
    }

    function diagnoseRun(options) {
        var source = options && options.source || '';
        var text = options && options.text || '';
        var nodes = options && options.nodes || [];
        var rootId = options && options.rootId;
        var passed = !!(options && options.ok);
        var decls = declarations(source);
        var sections = constraintSections(text);
        var byName = {};
        var concepts = {};
        var failures = [];
        var seen = {};
        var firstErrorLine = null;
        nodes.forEach(function (node) {
            byName[nodeTerm(node, rootId)] = node;
            if (node.metaType) {
                concepts[node.metaType] = true;
            }
        });
        concepts.FCO = true;
        function nodeLabel(term) {
            var node = byName[term];
            if (node && node.name) {
                return node.name;
            }
            if (term === 'checkedModel') {
                return 'the model';
            }
            return term;
        }
        function describeTheorem(theorem) {
            var stem = theorem.endsWith('_holds') ? theorem.slice(0, -'_holds'.length) : theorem;
            var section = null;
            var rule = stem;
            var term = 'checkedModel';
            var bestLen = 0;
            sections.forEach(function (item) {
                if (leanIdent(item.name) === stem) {
                    section = item;
                }
            });
            if (section) {
                return {
                    kind: 'constraint',
                    name: section.name,
                    body: section.lines.join(' '),
                    detail: section.name + ' does not hold.' +
                        (section.lines.length ? ' ' + section.lines.join(' ') : '')
                };
            }
            Object.keys(byName).forEach(function (candidate) {
                if (candidate !== 'checkedModel' && stem.endsWith('_' + candidate) &&
                        candidate.length > bestLen) {
                    bestLen = candidate.length;
                    rule = stem.slice(0, -(candidate.length + 1));
                    term = candidate;
                }
            });
            if (rule.charAt(0) === '_') {
                return {
                    kind: 'meta',
                    name: rule,
                    body: '',
                    detail: metaDetail(rule, nodeLabel(term), Object.keys(concepts))
                };
            }
            return null;
        }
        if (!passed) {
            leanErrors(options && options.log).forEach(function (error) {
                var nearest = null;
                var described;
                decls.forEach(function (decl) {
                    if (decl.line <= error.line) {
                        nearest = decl;
                    }
                });
                if (firstErrorLine === null || error.line < firstErrorLine) {
                    firstErrorLine = error.line;
                }
                if (!nearest || seen[nearest.name]) {
                    return;
                }
                seen[nearest.name] = true;
                described = nearest.kind === 'theorem' ? describeTheorem(nearest.name) : null;
                if (!described) {
                    failures.push({
                        kind: 'program',
                        name: nearest.name,
                        body: '',
                        detail: 'The generated check failed. ' + error.lines.slice(0, 4).join(' ')
                    });
                    return;
                }
                failures.push(described);
            });
            if (!failures.length) {
                failures.push({
                    kind: 'program',
                    name: '',
                    body: '',
                    detail: 'The check failed before a constraint could be named.'
                });
            }
        }
        return {
            ok: passed,
            failures: failures,
            proved: sections.filter(function (section) {
                var theorem = leanIdent(section.name) + '_holds';
                var decl = null;
                decls.forEach(function (item) {
                    if (item.kind === 'theorem' && item.name === theorem) {
                        decl = item;
                    }
                });
                if (!decl) {
                    return false;
                }
                if (passed) {
                    return true;
                }
                return firstErrorLine !== null && decl.line < firstErrorLine && !seen[theorem];
            }).map(function (section) { return section.name; }),
            metaChecked: decls.filter(function (decl) {
                return decl.kind === 'theorem' && decl.name.charAt(0) === '_';
            }).length,
            unchecked: sections.filter(function (section) {
                var theorem = leanIdent(section.name) + '_holds';
                var decl = null;
                decls.forEach(function (item) {
                    if (item.kind === 'theorem' && item.name === theorem) {
                        decl = item;
                    }
                });
                return decl && !passed && firstErrorLine !== null && decl.line > firstErrorLine;
            }).map(function (section) { return section.name; })
        };
    }

    return {
        buildProgram: buildProgram,
        metamodelNodes: metamodelNodes,
        diagnoseRun: diagnoseRun
    };
}));
