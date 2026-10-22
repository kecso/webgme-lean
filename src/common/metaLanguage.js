'use strict';

/**
 * Builds a constraint language server from a WebGME project's META.
 *
 * Concepts are keyed by node path. `guid` is stored beside the path so a
 * later rename of the meta node can be applied to existing constraints
 * without treating the name as the identity.
 */

var KEYWORDS = [
    {label: 'forall', detail: 'Universal quantifier', documentation: 'forall <var> in <Type> [where <cond>]: <body>'},
    {label: 'exists', detail: 'Existential quantifier', documentation: 'exists <var> in <Type> [where <cond>]: <body>'},
    {label: 'in', detail: 'Membership', documentation: 'Used with forall/exists to iterate over a type'},
    {label: 'where', detail: 'Filter', documentation: 'Optional filter on a quantifier'},
    {label: 'implies', detail: 'Implication', documentation: 'A implies B'},
    {label: 'and', detail: 'Conjunction', documentation: 'Both sides must hold'},
    {label: 'or', detail: 'Disjunction', documentation: 'Either side must hold'},
    {label: 'not', detail: 'Negation', documentation: 'Negates the following condition'},
    {label: 'true', detail: 'Boolean literal', documentation: 'Boolean true'},
    {label: 'false', detail: 'Boolean literal', documentation: 'Boolean false'},
    {label: 'null', detail: 'Null literal', documentation: 'Absence of a value'},
    {label: 'constraintset', detail: 'Constraint set', documentation: 'constraintset <Name> for <Type>'},
    {label: 'constraint', detail: 'Constraint', documentation: 'constraint <Name> [error|warning|info]'}
];

var FUNCTIONS = [
    {label: 'count', detail: 'Count elements', documentation: 'count(collection)'},
    {label: 'isEmpty', detail: 'Empty check', documentation: 'isEmpty(collection)'},
    {label: 'all', detail: 'Universal check', documentation: 'all(collection, predicate)'},
    {label: 'any', detail: 'Existential check', documentation: 'any(collection, predicate)'},
    {label: 'unique', detail: 'Uniqueness', documentation: 'unique(collection, attribute)'}
];

var NAVIGATION = ['children', 'parent', 'siblings'];

function cardinality(value) {
    if (value === undefined || value === null || value === -1) {
        return null;
    }
    return value;
}

function copyMeta(value) {
    if (!value || typeof value !== 'object') {
        return {};
    }
    return JSON.parse(JSON.stringify(value));
}

function conceptRef(core, metaNodes, targetPath, rule) {
    var target = metaNodes[targetPath];
    return {
        path: targetPath,
        name: target ? core.getAttribute(target, 'name') : null,
        guid: target ? core.getGuid(target) : null,
        min: cardinality(rule && rule.min),
        max: cardinality(rule && rule.max)
    };
}

function targetsFromRule(core, metaNodes, rule) {
    if (!rule) {
        return [];
    }
    return Object.keys(rule)
        .filter(function (key) {
            return key.charAt(0) === '/';
        })
        .map(function (targetPath) {
            return conceptRef(core, metaNodes, targetPath, rule[targetPath]);
        });
}

function relationDef(core, metaNodes, node, name, ownNames) {
    var rule = core.getPointerMeta(node, name) || {};
    return {
        own: !!ownNames[name],
        min: cardinality(rule.min),
        max: cardinality(rule.max),
        targets: targetsFromRule(core, metaNodes, rule)
    };
}

/**
 * @param {object} core - WebGME core of the loaded commit
 * @param {object} node - any node in that commit; META is taken from its root
 * @return {object} language definition the language server is built from
 */
function buildLanguage(core, node) {
    var metaNodes = core.getAllMetaNodes(node);
    var root = core.getRoot(node);
    var concepts = {};
    var byName = {};
    var byGuid = {};

    Object.keys(metaNodes).forEach(function (metaPath) {
        var metaNode = metaNodes[metaPath];
        var base = core.getBase(metaNode);
        var ownAttributes = {};
        var ownPointers = {};
        var ownSets = {};
        var attributes = {};
        var pointers = {};
        var sets = {};
        var childrenRule;
        var children = null;
        var concept;

        core.getOwnValidAttributeNames(metaNode).forEach(function (name) {
            ownAttributes[name] = true;
        });
        core.getOwnValidPointerNames(metaNode).forEach(function (name) {
            ownPointers[name] = true;
        });
        core.getOwnValidSetNames(metaNode).forEach(function (name) {
            ownSets[name] = true;
        });

        core.getValidAttributeNames(metaNode).forEach(function (name) {
            var meta = copyMeta(core.getAttributeMeta(metaNode, name));
            meta.own = !!ownAttributes[name];
            attributes[name] = meta;
        });

        core.getValidPointerNames(metaNode).forEach(function (name) {
            if (name === 'base') {
                return;
            }
            pointers[name] = relationDef(core, metaNodes, metaNode, name, ownPointers);
        });

        core.getValidSetNames(metaNode).forEach(function (name) {
            if (pointers[name]) {
                return;
            }
            sets[name] = relationDef(core, metaNodes, metaNode, name, ownSets);
        });

        childrenRule = core.getChildrenMeta(metaNode);
        if (childrenRule) {
            children = {
                min: cardinality(childrenRule.min),
                max: cardinality(childrenRule.max),
                targets: targetsFromRule(core, metaNodes, childrenRule)
            };
        }

        concept = {
            path: metaPath,
            guid: core.getGuid(metaNode),
            name: core.getAttribute(metaNode, 'name'),
            isAbstract: core.isAbstract(metaNode) === true,
            base: base ? core.getPath(base) : null,
            mixins: core.getMixinPaths(metaNode).map(function (mixinPath) {
                var mixinNode = metaNodes[mixinPath];
                return {
                    path: mixinPath,
                    name: mixinNode ? core.getAttribute(mixinNode, 'name') : null,
                    guid: mixinNode ? core.getGuid(mixinNode) : null
                };
            }),
            attributes: attributes,
            pointers: pointers,
            sets: sets,
            children: children
        };

        concepts[metaPath] = concept;
        if (!byName[concept.name]) {
            byName[concept.name] = [];
        }
        byName[concept.name].push(metaPath);
        if (concept.guid) {
            byGuid[concept.guid] = metaPath;
        }
    });

    return {
        root: {
            path: core.getPath(root),
            name: core.getAttribute(root, 'name') || null
        },
        concepts: concepts,
        byName: byName,
        byGuid: byGuid
    };
}

function cardText(min, max) {
    return (min === null || min === undefined ? '*' : String(min)) + '..' +
        (max === null || max === undefined ? '*' : String(max));
}

function targetText(targets) {
    if (!targets || targets.length === 0) {
        return 'any';
    }
    return targets.map(function (target) {
        return (target.name || target.path) + ' [' + cardText(target.min, target.max) + ']';
    }).join(', ');
}

function memberItems(concept, namespace) {
    var items = [];
    if (namespace === 'attribute') {
        Object.keys(concept.attributes).forEach(function (name) {
            var attr = concept.attributes[name];
            items.push({
                label: name,
                kind: 'property',
                detail: concept.name + ' ' + (attr.type || 'attribute') + (attr.own ? '' : ' (inherited)'),
                documentation: 'Attribute of ' + concept.name + '. Access with \'.\'.'
            });
        });
        NAVIGATION.forEach(function (name) {
            items.push({
                label: name,
                kind: 'property',
                detail: concept.name + ' navigation',
                documentation: 'Structural navigation. Access with \'.\'.'
            });
        });
    } else if (namespace === 'pointer') {
        Object.keys(concept.pointers).forEach(function (name) {
            var pointer = concept.pointers[name];
            items.push({
                label: name,
                kind: 'property',
                detail: concept.name + ' pointer to ' + targetText(pointer.targets) +
                    ' [' + cardText(pointer.min, pointer.max) + ']',
                documentation: 'Pointer of ' + concept.name + '. Access with \'->\'.'
            });
        });
    } else {
        Object.keys(concept.sets).forEach(function (name) {
            var set = concept.sets[name];
            items.push({
                label: name,
                kind: 'property',
                detail: concept.name + ' set of ' + targetText(set.targets) +
                    ' [' + cardText(set.min, set.max) + ']',
                documentation: 'Set of ' + concept.name + '. Access with \'[]\'.'
            });
        });
    }
    return items;
}

function hasMember(concept, namespace, name) {
    if (namespace === 'attribute') {
        return NAVIGATION.indexOf(name) !== -1 || !!concept.attributes[name];
    }
    if (namespace === 'pointer') {
        return !!concept.pointers[name];
    }
    return !!concept.sets[name];
}

function memberDetail(concept, namespace, name) {
    var items = memberItems(concept, namespace);
    var i;
    for (i = 0; i < items.length; i += 1) {
        if (items[i].label === name) {
            return items[i].detail;
        }
    }
    return null;
}

function otherNamespaces(concept, name, namespace) {
    var found = [];
    if (namespace !== 'attribute' && concept.attributes[name]) {
        found.push('attribute');
    }
    if (namespace !== 'pointer' && concept.pointers[name]) {
        found.push('pointer');
    }
    if (namespace !== 'set' && concept.sets[name]) {
        found.push('set');
    }
    return found;
}

function namespacePhrase(kind) {
    if (kind === 'pointer') {
        return 'a pointer';
    }
    if (kind === 'set') {
        return 'a set';
    }
    return 'an attribute';
}

function syntaxHint(kind) {
    if (kind === 'pointer') {
        return '->';
    }
    if (kind === 'set') {
        return '[]';
    }
    return '.';
}

function conceptDocumentation(language, concept) {
    var lines = [concept.name + (concept.isAbstract ? ' (abstract)' : '')];
    if (concept.base && language.concepts[concept.base]) {
        lines.push('base: ' + language.concepts[concept.base].name);
    }
    if (concept.mixins.length > 0) {
        lines.push('mixins: ' + concept.mixins.map(function (mixin) {
            return mixin.name || mixin.path;
        }).join(', '));
    }
    var attrNames = Object.keys(concept.attributes);
    if (attrNames.length > 0) {
        lines.push('attributes: ' + attrNames.join(', '));
    }
    var pointerNames = Object.keys(concept.pointers);
    if (pointerNames.length > 0) {
        lines.push('pointers: ' + pointerNames.map(function (name) {
            return name + ' → ' + targetText(concept.pointers[name].targets);
        }).join('; '));
    }
    var setNames = Object.keys(concept.sets);
    if (setNames.length > 0) {
        lines.push('sets: ' + setNames.map(function (name) {
            return name + ' → ' + targetText(concept.sets[name].targets);
        }).join('; '));
    }
    if (concept.children && concept.children.targets.length > 0) {
        lines.push('children: ' + targetText(concept.children.targets));
    }
    return lines.join('\n');
}

function positionAt(text, index) {
    var line = 0;
    var character = 0;
    var i;
    for (i = 0; i < index && i < text.length; i += 1) {
        if (text.charAt(i) === '\n') {
            line += 1;
            character = 0;
        } else {
            character += 1;
        }
    }
    return {line: line, character: character};
}

function offsetAt(text, position) {
    var lines = text.split('\n');
    var offset = 0;
    var line = Math.min(position.line, lines.length);
    var i;
    for (i = 0; i < line; i += 1) {
        offset += lines[i].length + 1;
    }
    return offset + (position.character || 0);
}

function rangeOf(text, index, length) {
    return {
        start: positionAt(text, index),
        end: positionAt(text, index + length)
    };
}

function bindingsBefore(text, index) {
    var re = /(?:forall|exists)\s+([A-Za-z_]\w*)\s+in\s+([A-Za-z_]\w*)/g;
    var bindings = {};
    var match;
    while ((match = re.exec(text))) {
        if (match.index > index) {
            break;
        }
        bindings[match[1]] = match[2];
    }
    return bindings;
}

function filterByPrefix(items, prefix) {
    if (!prefix) {
        return items;
    }
    var lower = prefix.toLowerCase();
    return items.filter(function (item) {
        return item.label.toLowerCase().indexOf(lower) === 0;
    });
}

/**
 * Language server for one META snapshot. Call again with a new language
 * after the project META changes; this instance does not watch the project.
 */
function createLanguageServer(language) {
    function conceptsNamed(name) {
        var paths = language.byName[name] || [];
        return paths.map(function (metaPath) {
            return language.concepts[metaPath];
        });
    }

    function typeItems() {
        return Object.keys(language.concepts).map(function (metaPath) {
            var concept = language.concepts[metaPath];
            var detail = concept.isAbstract ? 'abstract concept' : 'concept';
            if ((language.byName[concept.name] || []).length > 1) {
                detail += ' ' + concept.path;
            }
            return {
                label: concept.name,
                kind: 'type',
                detail: detail,
                documentation: conceptDocumentation(language, concept)
            };
        });
    }

    function itemsFor(text, offset, receiver, namespace, partial) {
        var typeName = bindingsBefore(text, offset)[receiver] || receiver;
        var items = [];
        conceptsNamed(typeName).forEach(function (concept) {
            items = items.concat(memberItems(concept, namespace));
        });
        return filterByPrefix(items, partial || '');
    }

    function getCompletions(text, position) {
        var offset = offsetAt(text, position || {line: 0, character: 0});
        var prefix = text.slice(0, offset);
        var pointerMatch = prefix.match(/([A-Za-z_]\w*)->([A-Za-z_]\w*)?$/);
        var setMatch = prefix.match(/([A-Za-z_]\w*)\[([A-Za-z_]\w*)?$/);
        var memberMatch = prefix.match(/([A-Za-z_]\w*)\.([A-Za-z_]\w*)?$/);
        var typeMatch;
        var items;

        if (pointerMatch) {
            return itemsFor(text, offset, pointerMatch[1], 'pointer', pointerMatch[2]);
        }
        if (setMatch) {
            return itemsFor(text, offset, setMatch[1], 'set', setMatch[2]);
        }
        if (memberMatch) {
            return itemsFor(text, offset, memberMatch[1], 'attribute', memberMatch[2]);
        }

        typeMatch = prefix.match(/\b(?:in|for)\s+([A-Za-z_]\w*)$/);
        if (typeMatch) {
            return filterByPrefix(typeItems(), typeMatch[1]);
        }

        var wordMatch = prefix.match(/([A-Za-z_]\w*)$/);
        items = KEYWORDS.map(function (keyword) {
            return {label: keyword.label, kind: 'keyword', detail: keyword.detail, documentation: keyword.documentation};
        }).concat(FUNCTIONS.map(function (fn) {
            return {label: fn.label, kind: 'function', detail: fn.detail, documentation: fn.documentation};
        })).concat(typeItems());
        return filterByPrefix(items, wordMatch ? wordMatch[1] : '');
    }

    function getHover(text, position) {
        var offset = offsetAt(text, position || {line: 0, character: 0});
        var head = text.slice(0, offset);
        var tail = text.slice(offset);
        var before = head.match(/[A-Za-z_]\w*$/);
        var after = tail.match(/^[A-Za-z_]\w*/);
        var word = (before ? before[0] : '') + (after ? after[0] : '');
        var wordStart = offset - (before ? before[0].length : 0);
        var concepts;

        if (!word) {
            return null;
        }

        concepts = conceptsNamed(word);
        if (concepts.length > 0) {
            return {
                contents: concepts.map(function (concept) {
                    return conceptDocumentation(language, concept);
                }).join('\n\n'),
                range: rangeOf(text, wordStart, word.length)
            };
        }

        var access = head.slice(0, wordStart).match(/([A-Za-z_]\w*)(->|\.|\[)$/);
        if (access) {
            var namespace = access[2] === '->' ? 'pointer' : (access[2] === '[' ? 'set' : 'attribute');
            var typeName = bindingsBefore(text, wordStart)[access[1]] || access[1];
            var docs = [];
            conceptsNamed(typeName).forEach(function (concept) {
                var detail = memberDetail(concept, namespace, word);
                if (detail) {
                    docs.push(detail);
                }
            });
            if (docs.length > 0) {
                return {
                    contents: docs.join('\n'),
                    range: rangeOf(text, wordStart, word.length)
                };
            }
        }

        return null;
    }

    function unknownType(text, diagnostics, index, name) {
        if (conceptsNamed(name).length > 0) {
            if (conceptsNamed(name).length > 1) {
                diagnostics.push({
                    range: rangeOf(text, index, name.length),
                    message: 'Concept name \'' + name + '\' is defined by more than one META node.',
                    severity: 'warning'
                });
            }
            return;
        }
        diagnostics.push({
            range: rangeOf(text, index, name.length),
            message: 'Unknown concept \'' + name + '\'. META concepts: ' + Object.keys(language.byName).sort().join(', '),
            severity: 'error'
        });
    }

    function checkAccess(text, diagnostics, match, namespace) {
        var receiver = match[1];
        var memberName = match[2];
        var typeName = bindingsBefore(text, match.index)[receiver];
        var concepts;
        var present = false;
        var elsewhere = [];
        if (!typeName) {
            return;
        }
        concepts = conceptsNamed(typeName);
        if (concepts.length === 0) {
            return;
        }
        concepts.forEach(function (concept) {
            if (hasMember(concept, namespace, memberName)) {
                present = true;
                return;
            }
            otherNamespaces(concept, memberName, namespace).forEach(function (kind) {
                if (elsewhere.indexOf(kind) === -1) {
                    elsewhere.push(kind);
                }
            });
        });
        if (present) {
            return;
        }
        diagnostics.push({
            range: rangeOf(text, match.index + match[0].lastIndexOf(memberName), memberName.length),
            message: accessMessage(typeName, memberName, namespace, elsewhere),
            severity: 'error'
        });
    }

    function accessMessage(typeName, memberName, namespace, elsewhere) {
        if (elsewhere.length === 0) {
            return '\'' + memberName + '\' is not ' + namespacePhrase(namespace) + ' of ' + typeName + '.';
        }
        return '\'' + memberName + '\' is ' + elsewhere.map(namespacePhrase).join(' and ') +
            ' of ' + typeName + '. Use \'' + elsewhere.map(syntaxHint).join('\' or \'') + '\'.';
    }

    function validate(text) {
        var diagnostics = [];
        var setRe = /constraintset\s+\w+\s+for\s+([A-Za-z_]\w*)/g;
        var quantRe = /(?:forall|exists)\s+[A-Za-z_]\w*\s+in\s+([A-Za-z_]\w*)/g;
        var attributeRe = /\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g;
        var pointerRe = /\b([A-Za-z_]\w*)->([A-Za-z_]\w*)/g;
        var setAccessRe = /\b([A-Za-z_]\w*)\[([A-Za-z_]\w*)\]/g;
        var match;

        while ((match = setRe.exec(text))) {
            unknownType(text, diagnostics, match.index + match[0].lastIndexOf(match[1]), match[1]);
        }
        while ((match = quantRe.exec(text))) {
            unknownType(text, diagnostics, match.index + match[0].lastIndexOf(match[1]), match[1]);
        }
        while ((match = attributeRe.exec(text))) {
            checkAccess(text, diagnostics, match, 'attribute');
        }
        while ((match = pointerRe.exec(text))) {
            checkAccess(text, diagnostics, match, 'pointer');
        }
        while ((match = setAccessRe.exec(text))) {
            checkAccess(text, diagnostics, match, 'set');
        }
        return diagnostics;
    }

    return {
        language: language,
        getCompletions: getCompletions,
        getHover: getHover,
        validate: validate
    };
}

var api = {
    buildLanguage: buildLanguage,
    createLanguageServer: createLanguageServer
};

if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
} else if (typeof define === 'function' && define.amd) {
    define([], function () {
        return api;
    });
}
