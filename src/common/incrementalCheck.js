/**
 * Incremental model checking: decide which constraints a model edit can
 * affect, maintain type-count caches, and settle count-shaped constraints
 * without re-running Lean or replaying quantifiers.
 */

(function (root, factory) {
    if (typeof module === 'object' && module && module.exports) {
        module.exports = factory(require('./constraintCheck'));
    } else if (typeof define === 'function' && define.amd) {
        define(['webgme-lean/constraintCheck'], factory);
    }
}(this, function (constraintCheck) {
    'use strict';

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

    function stableStringify(value) {
        if (value === null || typeof value !== 'object') {
            return JSON.stringify(value);
        }
        if (Array.isArray(value)) {
            return '[' + value.map(stableStringify).join(',') + ']';
        }
        return '{' + Object.keys(value).sort().map(function (key) {
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
        }).join(',') + '}';
    }

    function nodeFingerprint(node) {
        return stableStringify({
            id: node.id,
            metaType: node.metaType,
            name: node.name,
            attributes: node.attributes || {},
            pointers: node.pointers || {},
            sets: node.sets || {},
            children: node.children || []
        });
    }

    function indexNodes(nodes) {
        var byId = {};
        (nodes || []).forEach(function (node) {
            byId[node.id] = node;
        });
        return byId;
    }

    function countByType(nodes, types) {
        var counts = {};
        Object.keys(types || {}).forEach(function (typeName) {
            counts[typeName] = 0;
        });
        (nodes || []).forEach(function (node) {
            typeChain(types, node.metaType).forEach(function (typeName) {
                counts[typeName] = (counts[typeName] || 0) + 1;
            });
        });
        return counts;
    }

    function applyCountDelta(counts, types, node, delta) {
        var next = Object.assign({}, counts || {});
        typeChain(types, node.metaType).forEach(function (typeName) {
            next[typeName] = (next[typeName] || 0) + delta;
        });
        return next;
    }

    function diffModels(previousNodes, nextNodes) {
        var prev = indexNodes(previousNodes);
        var next = indexNodes(nextNodes);
        var added = [];
        var removed = [];
        var changed = [];
        var touchedTypes = {};
        var touchedAttributes = {};
        var touchedPointers = {};
        var touchedSets = {};
        var structural = false;

        Object.keys(next).forEach(function (id) {
            var before = prev[id];
            var after = next[id];
            if (!before) {
                added.push(after);
                touchedTypes[after.metaType] = true;
                structural = true;
                return;
            }
            if (nodeFingerprint(before) === nodeFingerprint(after)) {
                return;
            }
            changed.push({before: before, after: after});
            touchedTypes[before.metaType] = true;
            touchedTypes[after.metaType] = true;
            Object.keys(after.attributes || {}).concat(Object.keys(before.attributes || {})).forEach(function (name) {
                if (stableStringify((before.attributes || {})[name]) !==
                        stableStringify((after.attributes || {})[name])) {
                    touchedAttributes[name] = true;
                }
            });
            Object.keys(after.pointers || {}).concat(Object.keys(before.pointers || {})).forEach(function (name) {
                if ((before.pointers || {})[name] !== (after.pointers || {})[name]) {
                    touchedPointers[name] = true;
                    structural = true;
                }
            });
            Object.keys(after.sets || {}).concat(Object.keys(before.sets || {})).forEach(function (name) {
                if (stableStringify((before.sets || {})[name]) !==
                        stableStringify((after.sets || {})[name])) {
                    touchedSets[name] = true;
                    structural = true;
                }
            });
            if (stableStringify(before.children || []) !== stableStringify(after.children || [])) {
                structural = true;
            }
            if (before.metaType !== after.metaType || before.name !== after.name) {
                structural = true;
            }
        });
        Object.keys(prev).forEach(function (id) {
            if (!next[id]) {
                removed.push(prev[id]);
                touchedTypes[prev[id].metaType] = true;
                structural = true;
            }
        });

        return {
            added: added,
            removed: removed,
            changed: changed,
            touchedTypes: Object.keys(touchedTypes),
            touchedAttributes: Object.keys(touchedAttributes),
            touchedPointers: Object.keys(touchedPointers),
            touchedSets: Object.keys(touchedSets),
            structural: structural,
            empty: added.length === 0 && removed.length === 0 && changed.length === 0
        };
    }

    function walk(expr, visit) {
        if (!expr || typeof expr !== 'object') {
            return;
        }
        visit(expr);
        Object.keys(expr).forEach(function (key) {
            var value = expr[key];
            if (Array.isArray(value)) {
                value.forEach(function (item) {
                    walk(item, visit);
                });
            } else if (value && typeof value === 'object') {
                walk(value, visit);
            }
        });
    }

    function compareOp(op) {
        return op === '==' || op === '!=' || op === '<' || op === '>' ||
            op === '<=' || op === '>=';
    }

    function countCall(expr) {
        if (expr && expr.k === 'call' && expr.name === 'count' &&
                expr.args && expr.args.length === 1 && expr.args[0].k === 'name') {
            return expr.args[0].name;
        }
        return null;
    }

    /**
     * Recognize count(T) ⊕ n and exists x in T: true as counter constraints.
     */
    function analyzeCountShape(body) {
        var typeName;
        var right;
        var left;
        if (!body) {
            return null;
        }
        if (body.k === 'quant' && body.q === 'exists' && !body.condition &&
                body.body && body.body.k === 'bool' && body.body.v === true) {
            return {
                kind: 'count',
                comparisons: [{type: body.domain, op: '>=', value: 1}]
            };
        }
        if (body.k === 'bin' && compareOp(body.op)) {
            typeName = countCall(body.left);
            if (typeName && body.right && body.right.k === 'num') {
                return {
                    kind: 'count',
                    comparisons: [{type: typeName, op: body.op, value: body.right.v}]
                };
            }
            typeName = countCall(body.right);
            if (typeName && body.left && body.left.k === 'num') {
                return {
                    kind: 'count',
                    comparisons: [{type: typeName, op: flipOp(body.op), value: body.left.v}]
                };
            }
            left = countCall(body.left);
            right = countCall(body.right);
            if (left && right) {
                return {
                    kind: 'count',
                    comparisons: [{type: left, op: body.op, other: right}]
                };
            }
        }
        if (body.k === 'bin' && (body.op === 'and' || body.op === 'or')) {
            left = analyzeCountShape(body.left);
            right = analyzeCountShape(body.right);
            if (left && right && left.kind === 'count' && right.kind === 'count') {
                return {
                    kind: 'count',
                    join: body.op,
                    comparisons: left.comparisons.concat(right.comparisons)
                };
            }
        }
        return null;
    }

    function flipOp(op) {
        if (op === '<') {
            return '>';
        }
        if (op === '>') {
            return '<';
        }
        if (op === '<=') {
            return '>=';
        }
        if (op === '>=') {
            return '<=';
        }
        return op;
    }

    function evalCompare(left, op, right) {
        if (op === '==') {
            return left === right;
        }
        if (op === '!=') {
            return left !== right;
        }
        if (op === '<') {
            return left < right;
        }
        if (op === '>') {
            return left > right;
        }
        if (op === '<=') {
            return left <= right;
        }
        if (op === '>=') {
            return left >= right;
        }
        return false;
    }

    function evalCountShape(shape, counts) {
        var parts = (shape.comparisons || []).map(function (item) {
            var left = counts[item.type] || 0;
            var right = item.other ? (counts[item.other] || 0) : item.value;
            return evalCompare(left, item.op, right);
        });
        if (!parts.length) {
            return false;
        }
        if (shape.join === 'or') {
            return parts.some(Boolean);
        }
        return parts.every(Boolean);
    }

    function analyzeConstraint(constraint, types, scopeType) {
        var typesUsed = {};
        var attributes = {};
        var pointers = {};
        var sets = {};
        var calls = {};
        var quants = [];
        var countShape = analyzeCountShape(constraint.body);
        var kind = 'global';
        var unsupported = false;

        walk(constraint.body, function (expr) {
            if (expr.k === 'quant') {
                quants.push(expr);
                typesUsed[expr.domain] = true;
            }
            if (expr.k === 'name' && types && types[expr.name]) {
                typesUsed[expr.name] = true;
            }
            if (expr.k === 'attr') {
                attributes[expr.name] = true;
            }
            if (expr.k === 'ptr') {
                pointers[expr.name] = true;
            }
            if (expr.k === 'set') {
                if (expr.index && expr.index.k === 'str') {
                    sets[expr.index.v] = true;
                } else {
                    unsupported = true;
                }
            }
            if (expr.k === 'call') {
                calls[expr.name] = true;
                if (expr.name === 'count' && expr.args && expr.args[0] && expr.args[0].k === 'name') {
                    typesUsed[expr.args[0].name] = true;
                }
                if (expr.name !== 'count' && expr.name !== 'isEmpty') {
                    unsupported = true;
                }
            }
        });

        if (countShape) {
            kind = 'count';
            countShape.comparisons.forEach(function (item) {
                typesUsed[item.type] = true;
                if (item.other) {
                    typesUsed[item.other] = true;
                }
            });
        } else if (unsupported || calls.reachable || calls.reachableVia || calls.pointingTo) {
            kind = 'global';
        } else if (quants.length === 1 && quants[0].q === 'forall' && !quants[0].condition) {
            kind = 'local';
        } else if (quants.length === 2 && quants[0].q === 'forall' && quants[1].q === 'forall') {
            kind = 'pairwise';
        } else if (quants.length && quants.every(function (item) {
            return item.q === 'exists';
        })) {
            kind = 'exists';
        } else if (!quants.length) {
            kind = 'local';
        }

        return {
            name: constraint.name,
            severity: constraint.severity || 'error',
            kind: kind,
            types: Object.keys(typesUsed),
            attributes: Object.keys(attributes),
            pointers: Object.keys(pointers),
            sets: Object.keys(sets),
            countShape: countShape,
            scopeType: scopeType || null
        };
    }

    function typeTouched(impact, diff, types) {
        return (impact.types || []).some(function (typeName) {
            return (diff.touchedTypes || []).some(function (touched) {
                return isSubtype(types, touched, typeName) || isSubtype(types, typeName, touched);
            });
        });
    }

    function membersTouched(impact, diff) {
        var attrs = impact.attributes || [];
        var pointers = impact.pointers || [];
        var sets = impact.sets || [];
        if (attrs.some(function (name) {
            return (diff.touchedAttributes || []).indexOf(name) !== -1;
        })) {
            return true;
        }
        if (pointers.some(function (name) {
            return (diff.touchedPointers || []).indexOf(name) !== -1;
        })) {
            return true;
        }
        if (sets.some(function (name) {
            return (diff.touchedSets || []).indexOf(name) !== -1;
        })) {
            return true;
        }
        return false;
    }

    function settleCount(impact, counts) {
        var passed = evalCountShape(impact.countShape, counts);
        return {
            name: impact.name,
            action: 'count',
            kind: 'count',
            passed: passed,
            detail: passed
                ? impact.name + ' still holds after updating type counts.'
                : impact.name + ' fails after updating type counts.',
            counts: counts
        };
    }

    /**
     * Build an incremental plan for a new model relative to a prior snapshot.
     * Count constraints are settled here. Others are marked reuse or recheck.
     */
    function planCheck(options) {
        var text = options && options.text || '';
        var types = options && options.types || {};
        var scopeType = options && options.scopeType || '';
        var previousNodes = options && options.previousNodes || null;
        var nodes = options && options.nodes || [];
        var previousResults = options && options.previousResults || {};
        var previousCounts = options && options.previousCounts || null;
        var parsed;
        var impacts;
        var diff;
        var counts;
        var actions = [];
        var needsLean = [];
        var settled = [];

        try {
            parsed = constraintCheck.parseText(text);
        } catch (err) {
            return {
                ok: false,
                error: err.message || String(err),
                actions: [],
                needsLean: [],
                settled: [],
                counts: {},
                diff: null
            };
        }
        if (parsed.defines && parsed.defines.length) {
            return {
                ok: false,
                error: 'Incremental check does not encode define yet.',
                actions: [],
                needsLean: (parsed.constraints || []).map(function (item) {
                    return item.name;
                }),
                settled: [],
                counts: countByType(nodes, types),
                diff: null
            };
        }

        impacts = (parsed.constraints || []).map(function (constraint) {
            return analyzeConstraint(constraint, types, scopeType);
        });
        counts = countByType(nodes, types);
        diff = previousNodes ? diffModels(previousNodes, nodes) : null;

        if (!diff) {
            impacts.forEach(function (impact) {
                if (impact.kind === 'count' && impact.countShape) {
                    actions.push(settleCount(impact, counts));
                    settled.push(actions[actions.length - 1]);
                } else {
                    actions.push({
                        name: impact.name,
                        action: 'recheck',
                        kind: impact.kind,
                        reason: 'No prior snapshot; full check required.'
                    });
                    needsLean.push(impact.name);
                }
            });
        } else if (diff.empty) {
            impacts.forEach(function (impact) {
                var prior = previousResults[impact.name];
                if (prior && typeof prior.passed === 'boolean') {
                    actions.push({
                        name: impact.name,
                        action: 'reuse',
                        kind: impact.kind,
                        passed: prior.passed,
                        detail: impact.name + ' reused; the model did not change.',
                        reason: 'Model unchanged.'
                    });
                    settled.push(actions[actions.length - 1]);
                } else if (impact.kind === 'count' && impact.countShape) {
                    actions.push(settleCount(impact, counts));
                    settled.push(actions[actions.length - 1]);
                } else {
                    actions.push({
                        name: impact.name,
                        action: 'recheck',
                        kind: impact.kind,
                        reason: 'No cached result for this constraint.'
                    });
                    needsLean.push(impact.name);
                }
            });
        } else {
            if (previousCounts) {
                // O(changes): adjust cached type counts instead of scanning the whole model.
                counts = Object.assign({}, previousCounts);
                diff.removed.forEach(function (node) {
                    counts = applyCountDelta(counts, types, node, -1);
                });
                diff.added.forEach(function (node) {
                    counts = applyCountDelta(counts, types, node, 1);
                });
                diff.changed.forEach(function (entry) {
                    if (entry.before.metaType !== entry.after.metaType) {
                        counts = applyCountDelta(counts, types, entry.before, -1);
                        counts = applyCountDelta(counts, types, entry.after, 1);
                    }
                });
            }

            impacts.forEach(function (impact) {
                var prior = previousResults[impact.name];
                var affected = typeTouched(impact, diff, types) || membersTouched(impact, diff);
                if (impact.kind === 'global') {
                    affected = affected || diff.structural;
                }
                if (!affected) {
                    if (prior && typeof prior.passed === 'boolean') {
                        actions.push({
                            name: impact.name,
                            action: 'reuse',
                            kind: impact.kind,
                            passed: prior.passed,
                            detail: impact.name + ' reused; this edit cannot change it.',
                            reason: 'Edit is outside the constraint footprint.'
                        });
                        settled.push(actions[actions.length - 1]);
                        return;
                    }
                }
                if (impact.kind === 'count' && impact.countShape) {
                    actions.push(settleCount(impact, counts));
                    settled.push(actions[actions.length - 1]);
                    return;
                }
                actions.push({
                    name: impact.name,
                    action: 'recheck',
                    kind: impact.kind,
                    reason: affected
                        ? 'Edit touches types or members this constraint reads.'
                        : 'No cached result for this constraint.'
                });
                needsLean.push(impact.name);
            });
        }

        return {
            ok: true,
            error: '',
            actions: actions,
            needsLean: needsLean,
            settled: settled,
            counts: counts,
            diff: diff,
            impacts: impacts
        };
    }

    function mergeResults(plan, leanResults) {
        var byName = {};
        (leanResults || []).forEach(function (item) {
            byName[item.name] = item;
        });
        return (plan.actions || []).map(function (action) {
            if (action.action === 'recheck' && byName[action.name]) {
                return Object.assign({}, action, byName[action.name], {action: 'recheck'});
            }
            return action;
        });
    }

    function snapshotFrom(options) {
        return {
            rootId: options.rootId,
            constraintsHash: options.constraintsHash,
            nodes: options.nodes,
            counts: options.counts,
            results: options.results
        };
    }

    return {
        analyzeConstraint: analyzeConstraint,
        analyzeCountShape: analyzeCountShape,
        countByType: countByType,
        diffModels: diffModels,
        planCheck: planCheck,
        mergeResults: mergeResults,
        snapshotFrom: snapshotFrom,
        evalCountShape: evalCountShape,
        isSubtype: isSubtype
    };
}));
