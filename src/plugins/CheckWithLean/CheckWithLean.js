/*globals define*/
/*eslint-env node, browser*/

/**
 * Generates a Lean file for one model instance and runs it with the
 * toolchain in the lean/ directory.
 */

define([
    'plugin/PluginBase',
    'text!./metadata.json',
    'webgme-lean/constraintCheck',
    'webgme-lean/metaLanguage',
    'webgme-lean/leanFix',
    'webgme-lean/leanCheck',
    'fs',
    'path',
    'os',
    'child_process'
], function (
    PluginBase,
    pluginMetadata,
    constraintCheck,
    metaLanguage,
    leanFix,
    leanCheck,
    fs,
    path,
    os,
    childProcess
) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

    function CheckWithLean() {
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
    }

    CheckWithLean.metadata = pluginMetadata;

    CheckWithLean.prototype = Object.create(PluginBase.prototype);
    CheckWithLean.prototype.constructor = CheckWithLean;

    function typeNamesOf(core, node) {
        var names = [];
        var current = core.getMetaType(node);
        while (current) {
            var name = core.getAttribute(current, 'name');
            if (!name || name === 'FCO') {
                if (name === 'FCO') {
                    names.push(name);
                }
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
            name: core.getAttribute(node, 'name') || '',
            metaType: types[0] || '',
            types: types,
            attributes: attributes,
            pointers: pointers,
            sets: sets,
            children: core.getChildrenPaths(node) || []
        };
    }

    function indexTypes(definitions) {
        var types = {};
        (definitions || []).forEach(function (type) {
            types[type.name] = type;
        });
        return types;
    }

    function projectName(plugin) {
        var id = plugin.projectId || plugin.projectName || 'Domain';
        return String(id).split('+').pop() || 'Domain';
    }

    function runLean(filePath, cwd) {
        return new Promise(function (resolve) {
            var proc;
            var stdout = '';
            var stderr = '';
            var timer;
            try {
                proc = childProcess.spawn('lake', ['env', 'lean', filePath], {cwd: cwd});
            } catch (err) {
                resolve({code: 127, stdout: '', stderr: err.message || String(err)});
                return;
            }
            timer = setTimeout(function () {
                proc.kill('SIGKILL');
            }, 120000);
            proc.stdout.on('data', function (chunk) {
                stdout += chunk.toString();
            });
            proc.stderr.on('data', function (chunk) {
                stderr += chunk.toString();
            });
            proc.on('error', function (err) {
                clearTimeout(timer);
                resolve({code: 127, stdout: stdout, stderr: err.message || String(err)});
            });
            proc.on('close', function (code) {
                clearTimeout(timer);
                resolve({code: code, stdout: stdout, stderr: stderr});
            });
        });
    }

    function leanLines(output) {
        return String(output || '').split(/\r?\n/).map(function (line) {
            return line.trim();
        }).filter(Boolean);
    }

    function leanLog(info) {
        var lines = [
            'exit: ' + (info.code === undefined || info.code === null ? 'not run' : info.code)
        ];
        if (info.command) {
            lines.push('command: ' + info.command);
        }
        if (info.cwd) {
            lines.push('cwd: ' + info.cwd);
        }
        if (info.note) {
            lines.push(info.note);
        }
        lines.push('');
        lines.push('--- stdout ---');
        lines.push(info.stdout || '');
        lines.push('--- stderr ---');
        lines.push(info.stderr || '');
        return lines.join('\n');
    }

    function saveRunRecord(plugin, files) {
        var artifact = plugin.blobClient.createArtifact('lean-check');
        return artifact.addFiles(files).then(function () {
            return artifact.save();
        }).then(function (hash) {
            plugin.result.addArtifact(hash);
            plugin.logger.info('Saved Lean run record ' + hash);
            return hash;
        });
    }

    CheckWithLean.prototype.main = function (callback) {
        var self = this;
        var config = self.getCurrentConfig();
        var stored = constraintCheck.readStored(self.core.getRegistry(self.rootNode, 'constraints'));
        var scope = config.scope || stored.scope || constraintCheck.DEFAULT_SCOPE;
        var text = constraintCheck.ensureHeader(config.text || stored.text, scope);
        var leanDir = path.join(process.cwd(), 'lean');

        if (!self.activeNode) {
            callback(new Error('Choose a model to check with Lean.'), self.result);
            return;
        }

        self.core.loadSubTree(self.activeNode, function (err, subtree) {
            var metaIds = {};
            var described = [];
            var modelType;
            var language;
            var dsl;
            var program;
            var filePath;
            var rootPath;
            var rootRecord;

            if (err) {
                callback(err, self.result);
                return;
            }
            subtree.forEach(function (node) {
                if (self.core.isMetaNode(node)) {
                    metaIds[self.core.getPath(node)] = true;
                }
            });
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
            });
            rootPath = self.core.getPath(self.activeNode);
            rootRecord = null;
            described.forEach(function (record) {
                if (record.id === rootPath) {
                    rootRecord = record;
                }
            });
            modelType = rootRecord && rootRecord.metaType;
            if (!modelType || modelType === 'FCO') {
                callback(new Error('Choose an instance of a concept Lean can check.'), self.result);
                return;
            }
            if (scope !== constraintCheck.DEFAULT_SCOPE && modelType !== scope) {
                callback(new Error('Choose a direct instance of ' + scope + '.'), self.result);
                return;
            }
            if (!fs.existsSync(path.join(leanDir, 'lean-toolchain'))) {
                callback(new Error('The Lean toolchain is not in the lean directory. Run lake update there.'), self.result);
                return;
            }

            try {
                language = metaLanguage.buildLanguage(self.core, self.rootNode);
                dsl = leanFix.generateDomainDSL({
                    name: projectName(self),
                    rootType: modelType,
                    nodes: leanCheck.metamodelNodes(language)
                });
                program = leanCheck.buildProgram({
                    domainSource: leanFix.generateLeanTypes(dsl),
                    scopeType: modelType,
                    rootId: rootPath,
                    nodes: described,
                    text: text,
                    types: indexTypes(dsl.typeDefinitions)
                });
            } catch (buildErr) {
                callback(buildErr, self.result);
                return;
            }
            function runFiles() {
                var files = {
                    'constraints.txt': text,
                    'model.json': JSON.stringify(described, null, 2)
                };
                if (program && program.source) {
                    files['model.lean'] = program.source;
                }
                return files;
            }

            function publish(logText, report) {
                var files = runFiles();
                files['lean.log'] = logText;
                saveRunRecord(self, files).then(function () {
                    report();
                    self.result.setSuccess(true);
                    callback(null, self.result);
                }).catch(function (saveErr) {
                    self.logger.error('Could not save the Lean run record:', saveErr);
                    self.createMessage(
                        self.activeNode,
                        'The run record could not be saved: ' + (saveErr.message || saveErr),
                        'warning'
                    );
                    report();
                    self.result.setSuccess(true);
                    callback(null, self.result);
                });
            }

            if (!program.ok) {
                publish(leanLog({note: program.error}), function () {
                    self.createMessage(self.activeNode, program.error, 'error');
                });
                return;
            }

            filePath = path.join(os.tmpdir(), 'webgme-lean-' + process.pid + '-' + Date.now() + '.lean');
            fs.writeFileSync(filePath, program.source);
            runLean(filePath, leanDir).then(function (lean) {
                var output = leanLines((lean.stderr || '') + '\n' + (lean.stdout || ''));
                var command = 'lake env lean ' + filePath;
                try {
                    fs.unlinkSync(filePath);
                } catch (unlinkErr) {
                    self.logger.warn(unlinkErr);
                }
                publish(leanLog({
                    code: lean.code,
                    command: command,
                    cwd: leanDir,
                    note: 'The checked source is model.lean in this run record.',
                    stdout: lean.stdout,
                    stderr: lean.stderr
                }), function () {
                    if (lean.code === 0) {
                        self.createMessage(
                            self.activeNode,
                            program.proved
                                ? 'Lean accepted the model.'
                                : 'Lean accepted the model. There were no constraints to prove.',
                            'info'
                        );
                    } else if (lean.code === 127) {
                        self.createMessage(self.activeNode, output[0] || 'Lean is not available. Install elan, then run lake update in the lean directory.', 'error');
                    } else {
                        if (!output.length) {
                            output.push('Lean rejected the model.');
                        }
                        output.forEach(function (line) {
                            self.createMessage(self.activeNode, line, 'error');
                        });
                    }
                    self.logger.info('Lean exited ' + lean.code);
                });
            }).catch(function (runErr) {
                callback(runErr, self.result);
            });
        });
    };

    return CheckWithLean;
});
