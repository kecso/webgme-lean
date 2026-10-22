/*globals define*/
/*eslint-env node, browser*/

/**
 * A plugin that inherits from PluginBase.
 * Reads the META of the project commit it is executed on and generates
 * a constraint language server from those meta nodes.
 */

define([
    'plugin/PluginConfig',
    'text!./metadata.json',
    'plugin/PluginBase',
    'webgme-lean/metaLanguage'
], function (
    PluginConfig,
    pluginMetadata,
    PluginBase,
    metaLanguage) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

    /**
     * Initializes a new instance of GenerateConstraintLanguage.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin GenerateConstraintLanguage.
     * @constructor
     */
    function GenerateConstraintLanguage() {
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
    }

    /**
     * Metadata associated with the plugin. Contains id, name, version, description, icon, configStructure etc.
     * This is also available at the instance at this.pluginMetadata.
     * @type {object}
     */
    GenerateConstraintLanguage.metadata = pluginMetadata;

    GenerateConstraintLanguage.prototype = Object.create(PluginBase.prototype);
    GenerateConstraintLanguage.prototype.constructor = GenerateConstraintLanguage;

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(Error|null, plugin.PluginResult)} callback - the result callback
     */
    GenerateConstraintLanguage.prototype.main = function (callback) {
        var self = this;
        var language;
        var names;

        try {
            language = metaLanguage.buildLanguage(self.core, self.rootNode);
            self.languageServer = metaLanguage.createLanguageServer(language);
        } catch (err) {
            self.logger.error(err.stack || err.message || err);
            callback(err, self.result);
            return;
        }

        names = Object.keys(language.byName).sort();
        self.logger.info('Constraint language concepts: ' + names.join(', '));
        self.createMessage(
            self.rootNode,
            'Generated constraint language for ' + names.length + ' concept(s): ' + names.join(', '),
            'info'
        );

        self.addFile('constraint-language.json', JSON.stringify(language, null, 2))
            .then(function () {
                self.result.setSuccess(true);
                callback(null, self.result);
            })
            .catch(function (err) {
                self.logger.error(err.stack || err.message || err);
                callback(err, self.result);
            });
    };

    return GenerateConstraintLanguage;
});
