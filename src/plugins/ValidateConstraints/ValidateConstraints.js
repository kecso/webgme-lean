/*globals define*/
/*eslint-env node, browser*/

/**
 * Checks that the constraint text parses and that the concepts, attributes,
 * pointers, and sets it names are in the META. It does not check a model.
 */

define([
    'plugin/PluginBase',
    'text!./metadata.json',
    'webgme-lean/constraintCheck',
    'webgme-lean/metaLanguage'
], function (
    PluginBase,
    pluginMetadata,
    constraintCheck,
    metaLanguage
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

    function isRootScopeName(text, diagnostic) {
        var match = String(text || '').match(/^[ \t]*constraintset\s+[A-Za-z_]\w*\s+for\s+ROOT\b/);
        if (!match || !diagnostic || !diagnostic.range || !diagnostic.range.start) {
            return false;
        }
        return diagnostic.range.start.line === 0 &&
            diagnostic.message.indexOf('Unknown concept \'ROOT\'') === 0;
    }

    ValidateConstraints.prototype.main = function (callback) {
        var self = this;
        var config = self.getCurrentConfig();
        var stored = constraintCheck.readStored(self.core.getRegistry(self.rootNode, 'constraints'));
        var scope = config.scope || stored.scope || constraintCheck.DEFAULT_SCOPE;
        var text = constraintCheck.ensureHeader(config.text || stored.text, scope);
        var syntax = constraintCheck.checkText(text);
        var messages = syntax.ok ? [] : syntax.messages.slice();
        var language;
        var diagnostics;

        try {
            language = metaLanguage.buildLanguage(self.core, self.rootNode);
            diagnostics = metaLanguage.createLanguageServer(language).validate(text);
        } catch (err) {
            callback(err, self.result);
            return;
        }

        diagnostics.forEach(function (item) {
            if (scope === constraintCheck.DEFAULT_SCOPE && isRootScopeName(text, item)) {
                return;
            }
            messages.push({
                severity: item.severity || 'error',
                message: item.message
            });
        });

        if (!messages.length) {
            self.createMessage(self.rootNode, 'The constraints are well formed.', 'info');
        } else {
            messages.forEach(function (message) {
                self.createMessage(self.rootNode, message.message, message.severity || 'error');
            });
        }
        self.result.setSuccess(true);
        callback(null, self.result);
    };

    return ValidateConstraints;
});
