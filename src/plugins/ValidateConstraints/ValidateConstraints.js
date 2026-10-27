/*globals define*/
/*eslint-env node, browser*/

/**
 * Checks the constraint dialect against one model.
 * ROOT checks the project root and every node under it.
 * Any other scope checks one direct instance of that concept.
 */

define([
    'plugin/PluginBase',
    'text!./metadata.json',
    'webgme-lean/constraintCheck'
], function (
    PluginBase,
    pluginMetadata,
    constraintCheck
) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

    function ValidateConstraints() {
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
    }

    ValidateConstraints.metadata = pluginMetadata;

    ValidateConstraints.prototype = Object.create(PluginBase.prototype);
    ValidateConstraints.prototype.constructor = ValidateConstraints;

    function typeNamesOf(core, node) {
        var names = [];
        var current = core.getMetaType(node);
        while (current) {
            var name = core.getAttribute(current, 'name');
            if (!name || name === 'FCO') {
                break;
            }
            names.push(name);
            current = core.getBase(current);
        }
        return names;
    }

    function describeNode(core, node) {
        var types = typeNamesOf(core, node);
        var attributes = {};
        var pointers = {};
        var sets = {};

        core.getAttributeNames(node).forEach(function (name) {
            attributes[name] = core.getAttribute(node, name);
        });
        core.getPointerNames(node).forEach(function (name) {
            if (name === 'base') {
                return;
            }
            pointers[name] = core.getPointerPath(node, name);
        });
        core.getSetNames(node).forEach(function (name) {
            sets[name] = core.getMemberPaths(node, name) || [];
        });

        return {
            id: core.getPath(node),
            name: core.getAttribute(node, 'name') || core.getPath(node) || 'ROOT',
            metaType: types[0] || '',
            types: types,
            attributes: attributes,
            pointers: pointers,
            sets: sets,
            children: core.getChildrenPaths(node) || [],
            parent: core.getParent(node) ? core.getPath(core.getParent(node)) : null
        };
    }

    ValidateConstraints.prototype.main = function (callback) {
        var self = this;
        var config = self.getCurrentConfig();
        var stored = constraintCheck.readStored(self.core.getRegistry(self.rootNode, 'constraints'));
        var scope = config.scope || stored.scope || 'ROOT';
        var text = config.text || stored.text;
        var wholeProject = scope === 'ROOT';
        var meta;
        var actual;

        if (wholeProject && !self.activeNode) {
            self.activeNode = self.rootNode;
        }
        if (!self.activeNode) {
            callback(new Error('Choose a model to validate.'), self.result);
            return;
        }
        if (wholeProject) {
            if (self.core.getPath(self.activeNode) !== '') {
                callback(new Error('ROOT checks the whole project.'), self.result);
                return;
            }
        } else {
            meta = self.core.getMetaType(self.activeNode);
            actual = meta ? self.core.getAttribute(meta, 'name') : '';
            if (self.core.isMetaNode(self.activeNode) || actual !== scope) {
                callback(new Error('Choose a direct instance of ' + scope + '.'), self.result);
                return;
            }
        }

        self.core.loadSubTree(self.activeNode, function (err, subtree) {
            var described;
            var typeNames;
            var metaNodes;
            var byPath;
            var report;
            var metaIds;

            if (err) {
                callback(err, self.result);
                return;
            }

            metaIds = {};
            subtree.forEach(function (node) {
                if (self.core.isMetaNode(node)) {
                    metaIds[self.core.getPath(node)] = true;
                }
            });
            described = [];
            byPath = {};
            subtree.forEach(function (node) {
                var record;
                if (metaIds[self.core.getPath(node)]) {
                    return;
                }
                record = describeNode(self.core, node);
                record.children = record.children.filter(function (id) {
                    return !metaIds[id];
                });
                described.push(record);
                byPath[record.id] = node;
            });
            typeNames = [];
            metaNodes = self.core.getAllMetaNodes(self.rootNode) || {};
            Object.keys(metaNodes).forEach(function (path) {
                var name = self.core.getAttribute(metaNodes[path], 'name');
                if (name && name !== 'FCO' && name !== 'META') {
                    typeNames.push(name);
                }
            });

            try {
                report = constraintCheck.checkModel({
                    text: text,
                    nodes: described,
                    typeNames: typeNames
                });
            } catch (checkErr) {
                callback(checkErr, self.result);
                return;
            }

            if (!report.messages.length) {
                self.createMessage(self.activeNode, 'The model is fine.', 'info');
            } else {
                report.messages.forEach(function (message) {
                    self.createMessage(
                        byPath[message.nodeId] || self.activeNode,
                        message.message,
                        message.severity
                    );
                });
            }
            self.result.setSuccess(true);
            callback(null, self.result);
        });
    };

    return ValidateConstraints;
});
