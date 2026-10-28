/*globals define*/
/**
 * Builds the generated Lean text from the open project's META.
 * The main type is the scope of the constraints. The WebGME project root
 * is where the text is stored, and it is not a concept in the program.
 */
define([
    'webgme-lean/leanFix'
], function (leanFix) {
    'use strict';

    function bound(value) {
        if (value === undefined || value === null || value === -1) {
            return null;
        }
        return value;
    }

    function finiteMin(value) {
        if (value === undefined || value === null || value === -1) {
            return 0;
        }
        return value;
    }

    function finiteMax(value) {
        if (value === undefined || value === null || value === -1) {
            return null;
        }
        return value;
    }

    function attributeType(meta) {
        var type = meta && meta.type;
        if (type === 'integer' || type === 'float' || type === 'boolean' || type === 'asset' || type === 'string') {
            return type;
        }
        return 'string';
    }

    function targetNames(client, meta) {
        var names = [];
        var items = meta && meta.items || [];
        items.forEach(function (item) {
            var target = item && item.id ? client.getNode(item.id) : null;
            var name = target && target.getAttribute('name');
            if (name) {
                names.push(name);
            }
        });
        return names;
    }

    function ownChildPaths(client, path) {
        var own = client.getOwnValidChildrenTypes(path) || [];
        return own.map(function (item) {
            return typeof item === 'string' ? item : item && item.id;
        }).filter(function (childPath) {
            return !!childPath;
        });
    }

    function conceptFromNode(client, path, node, metaPaths) {
        var baseId = node.getBaseId();
        var baseName = null;
        var attributes = [];
        var pointers = [];
        var pointerNames = {};
        var sets = [];
        var containments = [];
        var childrenMeta;
        var childItems;
        var mixins = [];

        if (baseId && metaPaths[baseId]) {
            baseName = metaPaths[baseId].getAttribute('name') || null;
        }

        (node.getOwnValidAttributeNames() || []).forEach(function (name) {
            attributes.push({
                name: name,
                type: attributeType(node.getAttributeMeta(name))
            });
        });

        (node.getOwnValidPointerNames() || []).forEach(function (name) {
            var meta;
            if (name === 'base') {
                return;
            }
            meta = client.getPointerMeta(path, name) || {};
            pointerNames[name] = true;
            pointers.push({
                name: name,
                targetTypes: targetNames(client, meta),
                min: finiteMin(meta.min),
                max: finiteMax(meta.max === undefined ? 1 : meta.max)
            });
        });

        (node.getOwnValidSetNames() || []).forEach(function (name) {
            var meta;
            if (pointerNames[name]) {
                return;
            }
            meta = client.getPointerMeta(path, name) || {};
            sets.push({
                name: name,
                memberTypes: targetNames(client, meta),
                min: finiteMin(meta.min),
                max: finiteMax(meta.max),
                members: (meta.items || []).map(function (item) {
                    var target = item && item.id ? client.getNode(item.id) : null;
                    var memberType = target && target.getAttribute('name');
                    if (!memberType) {
                        return null;
                    }
                    return {
                        memberType: memberType,
                        min: finiteMin(item.min),
                        max: finiteMax(item.max)
                    };
                }).filter(Boolean)
            });
        });

        childrenMeta = client.getChildrenMeta(path) || {items: []};
        childItems = {};
        (childrenMeta.items || []).forEach(function (item) {
            childItems[item.id] = item;
        });
        (node.getMixinPaths() || []).forEach(function (mixinPath) {
            var mixin = client.getNode(mixinPath);
            var mixinName = mixin && mixin.getAttribute('name');
            if (mixinName) {
                mixins.push(mixinName);
            }
        });

        ownChildPaths(client, path).forEach(function (childPath) {
            var child = client.getNode(childPath);
            var childName = child && child.getAttribute('name');
            var item = childItems[childPath] || {};
            if (!childName) {
                return;
            }
            containments.push({
                childType: childName,
                min: finiteMin(item.min),
                max: finiteMax(item.max)
            });
        });

        return {
            name: node.getAttribute('name'),
            isAbstract: node.isAbstract() === true,
            baseType: baseName,
            mixins: mixins,
            childMin: bound(childrenMeta.min),
            childMax: bound(childrenMeta.max),
            attributes: attributes,
            pointers: pointers,
            sets: sets,
            containments: containments
        };
    }

    function mainTypeOf(client, nodes) {
        var root = client.getNode('');
        var metaId = root && root.getMetaTypeId && root.getMetaTypeId();
        var meta = metaId ? client.getNode(metaId) : null;
        var metaName = meta && meta.getAttribute('name');
        var contained = {};
        var owners;

        if (metaName && metaName !== 'FCO' && nodes.some(function (node) { return node.name === metaName; })) {
            return metaName;
        }
        nodes.forEach(function (node) {
            node.containments.forEach(function (child) {
                contained[child.childType] = true;
            });
        });
        owners = nodes.filter(function (node) {
            return node.name !== 'FCO' && node.containments.length > 0 && !contained[node.name];
        });
        if (owners.length > 0) {
            return owners[0].name;
        }
        return 'FCO';
    }

    function projectName(client) {
        var projectId = client.getActiveProjectId ? client.getActiveProjectId() : '';
        var name = String(projectId || 'Domain').split('+').pop();
        return name || 'Domain';
    }

    function collectConcepts(client) {
        var metaNodes = client.getAllMetaNodes(true) || {};
        var nodes = [];

        Object.keys(metaNodes).forEach(function (path) {
            var node = metaNodes[path];
            var name;
            if (!node || path === '') {
                return;
            }
            name = node.getAttribute('name');
            if (!name || name === 'META') {
                return;
            }
            nodes.push(conceptFromNode(client, path, node, metaNodes));
        });

        return {
            name: projectName(client),
            rootType: nodes.length ? mainTypeOf(client, nodes) : '',
            types: nodes
        };
    }

    function generateFix(client) {
        var collected = collectConcepts(client);
        if (collected.types.length === 0) {
            return '';
        }
        return leanFix.generateLeanTypes(leanFix.generateDomainDSL({
            name: collected.name,
            rootType: collected.rootType,
            nodes: collected.types
        }));
    }

    function vocabulary(client) {
        var collected = collectConcepts(client);
        return {
            rootType: collected.rootType,
            types: collected.types
        };
    }

    return {
        generateFix: generateFix,
        vocabulary: vocabulary
    };
});
