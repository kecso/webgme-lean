/*globals define*/
/*eslint-env node, browser*/

/**
 * Checks a model instance against constraints. Count-shaped constraints and
 * constraints outside an edit's footprint are settled from a prior snapshot
 * without Lean. Remaining constraints are proved with Lake modules under
 * lean/Generated/, reusing Domain.olean when the domain text is unchanged.
 */

define([
    'plugin/PluginBase',
    'text!./metadata.json',
    'webgme-lean/constraintCheck',
    'webgme-lean/metaLanguage',
    'webgme-lean/leanFix',
    'webgme-lean/leanCheck',
    'webgme-lean/incrementalCheck',
    'crypto',
    'fs',
    'path',
    'child_process'
], function (
    PluginBase,
    pluginMetadata,
    constraintCheck,
    metaLanguage,
    leanFix,
    leanCheck,
    incrementalCheck,
    crypto,
    fs,
    path,
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
        var seen = {};
        var queue = [];
        var meta = core.getMetaType(node);
        if (meta) {
            queue.push(meta);
        }
        while (queue.length) {
            var current = queue.shift();
            var path = current && core.getPath(current);
            var name;
            if (!current || seen[path]) {
                continue;
            }
            seen[path] = true;
            name = core.getAttribute(current, 'name');
            if (name) {
                names.push(name);
            }
            if (core.getBase(current)) {
                queue.push(core.getBase(current));
            }
            var mixins = core.getMixinNodes(current) || {};
            Object.keys(mixins).forEach(function (mixinPath) {
                if (mixins[mixinPath]) {
                    queue.push(mixins[mixinPath]);
                }
            });
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

    function runCommand(args, cwd, timeoutMs) {
        return new Promise(function (resolve) {
            var proc;
            var stdout = '';
            var stderr = '';
            var timer;
            try {
                proc = childProcess.spawn(args[0], args.slice(1), {cwd: cwd});
            } catch (err) {
                resolve({code: 127, stdout: '', stderr: err.message || String(err), args: args});
                return;
            }
            timer = setTimeout(function () {
                proc.kill('SIGKILL');
            }, timeoutMs || 120000);
            proc.stdout.on('data', function (chunk) {
                stdout += chunk.toString();
            });
            proc.stderr.on('data', function (chunk) {
                stderr += chunk.toString();
            });
            proc.on('error', function (err) {
                clearTimeout(timer);
                resolve({code: 127, stdout: stdout, stderr: err.message || String(err), args: args});
            });
            proc.on('close', function (code) {
                clearTimeout(timer);
                resolve({code: code, stdout: stdout, stderr: stderr, args: args});
            });
        });
    }

    function sha256(text) {
        return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
    }

    function writeIfChanged(filePath, contents) {
        var next = String(contents || '');
        var previous = null;
        try {
            previous = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            previous = null;
        }
        if (previous === next) {
            return false;
        }
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, next);
        return true;
    }

    function cachePath(leanDir, project, rootId) {
        var safeProject = String(project || 'project').replace(/[^A-Za-z0-9_-]+/g, '_');
        var safeRoot = String(rootId || 'root').replace(/[^A-Za-z0-9_-]+/g, '_');
        return path.join(leanDir, 'Generated', 'cache-' + safeProject + '-' + safeRoot + '.json');
    }

    function loadSnapshot(filePath) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            return null;
        }
    }

    function saveSnapshot(filePath, snapshot) {
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    }

    function resultsFromActions(actions) {
        var results = {};
        (actions || []).forEach(function (action) {
            if (typeof action.passed === 'boolean') {
                results[action.name] = {
                    passed: action.passed,
                    action: action.action,
                    kind: action.kind,
                    detail: action.detail || ''
                };
            }
        });
        return results;
    }

    function reportPlan(plugin, node, plan, leanUsed) {
        var reused = (plan.actions || []).filter(function (item) {
            return item.action === 'reuse';
        }).length;
        var counted = (plan.actions || []).filter(function (item) {
            return item.action === 'count';
        }).length;
        var rechecked = (plan.needsLean || []).length;
        var failed = (plan.actions || []).filter(function (item) {
            return item.passed === false;
        });
        if (failed.length) {
            failed.forEach(function (item) {
                plugin.createMessage(node, item.detail || (item.name + ' failed.'), 'error');
            });
        } else if (!leanUsed) {
            plugin.createMessage(
                node,
                'All checks settled incrementally' +
                    (reused || counted
                        ? ' (' + reused + ' reused, ' + counted + ' updated from counts).'
                        : '.'),
                'info'
            );
        }
        if (leanUsed && (reused || counted)) {
            plugin.createMessage(
                node,
                'Incremental plan: ' + reused + ' reused, ' + counted +
                    ' updated from counts, ' + rechecked + ' sent to Lean.',
                'info'
            );
        }
        (plan.actions || []).forEach(function (item) {
            if (item.action === 'reuse' || item.action === 'count') {
                plugin.logger.info(item.name + ': ' + item.action +
                    (typeof item.passed === 'boolean' ? (item.passed ? ' passed' : ' failed') : ''));
            }
        });
    }

    /**
     * Compile Domain.lean when needed, then check the model module against it.
     * Lake reuses Generated/Domain.olean when the domain text is unchanged.
     */
    function runLeanModules(program, leanDir) {
        var generatedDir = path.join(leanDir, 'Generated');
        var domainPath = path.join(generatedDir, 'Domain.lean');
        var checkPath = path.join(generatedDir, 'Check.lean');
        var hashPath = path.join(generatedDir, 'Domain.hash');
        var domainHash = sha256(program.domainModule);
        var domainChanged = writeIfChanged(domainPath, program.domainModule);
        var storedHash = null;
        try {
            storedHash = fs.readFileSync(hashPath, 'utf8').trim();
        } catch (err) {
            storedHash = null;
        }
        if (domainChanged || storedHash !== domainHash) {
            domainChanged = true;
        }
        writeIfChanged(checkPath, program.modelModule);

        function checkModel(domainBuild) {
            return runCommand(['lake', 'env', 'lean', checkPath], leanDir).then(function (lean) {
                return {
                    code: lean.code,
                    stdout: ((domainBuild && domainBuild.stdout) || '') + (lean.stdout || ''),
                    stderr: ((domainBuild && domainBuild.stderr) || '') + (lean.stderr || ''),
                    command: 'lake build Generated.Domain && lake env lean ' + checkPath,
                    domainRebuilt: !!(domainBuild && domainBuild.rebuilt),
                    checkPath: checkPath,
                    domainPath: domainPath
                };
            });
        }

        if (!domainChanged) {
            return checkModel(null);
        }
        return runCommand(['lake', 'build', 'Generated.Domain'], leanDir).then(function (build) {
            if (build.code !== 0) {
                return {
                    code: build.code,
                    stdout: build.stdout,
                    stderr: build.stderr,
                    command: 'lake build Generated.Domain',
                    domainRebuilt: true,
                    checkPath: checkPath,
                    domainPath: domainPath
                };
            }
            fs.writeFileSync(hashPath, domainHash + '\n');
            build.rebuilt = true;
            return checkModel(build);
        });
    }

    function leanLines(output) {
        return String(output || '').split(/\r?\n/).map(function (line) {
            return line.trim();
        }).filter(Boolean);
    }

    function llmSettings(gmeConfig) {
        var component = gmeConfig && gmeConfig.rest && gmeConfig.rest.components &&
            gmeConfig.rest.components.leanllm;
        var llm = (component && component.options && component.options.llm) || {};
        var baseUrl = String(process.env.LLM_BASE_URL || llm.baseUrl || '').trim();
        var model = String(process.env.LLM_MODEL || llm.model || '').trim();
        var apiKey = String(process.env.LLM_API_KEY || llm.apiKey || '').trim();
        return {
            configured: baseUrl !== '' && model !== '',
            baseUrl: baseUrl,
            model: model,
            apiKey: apiKey
        };
    }

    function modelSketch(nodes, rootId) {
        var byId = {};
        var lines = [];
        (nodes || []).forEach(function (node) {
            byId[node.id] = node;
        });
        (nodes || []).slice(0, 40).forEach(function (node) {
            var children = (node.children || []).map(function (id) {
                var child = byId[id];
                return child && child.name ? child.name : id;
            });
            lines.push((node.id === rootId ? 'model ' : '') +
                (node.name || node.metaType || node.id) + ' : ' + (node.metaType || '') +
                (children.length ? ' children ' + children.join(', ') : ''));
        });
        if ((nodes || []).length > 40) {
            lines.push('... ' + ((nodes || []).length - 40) + ' more nodes');
        }
        return lines.join('\n');
    }

    function resultText(diagnosis) {
        if (!diagnosis.ok) {
            return (diagnosis.failures || []).map(function (failure) {
                return failure.detail;
            }).join('\n');
        }
        return 'All checks passed.';
    }

    function summarizeResult(settings, diagnosis, text, nodes, rootId) {
        var headers;
        var controller;
        var timer;
        var prompt;
        if (!settings || !settings.configured) {
            return Promise.resolve('');
        }
        prompt = [
            'Model:',
            modelSketch(nodes, rootId),
            '',
            'Constraints:',
            text || '',
            '',
            diagnosis.ok ? 'Result: every checked constraint holds.' : 'Result: the check failed.',
            resultText(diagnosis)
        ];
        if (diagnosis.unchecked && diagnosis.unchecked.length) {
            prompt.push('Not checked, because the first failure stopped the run: ' + diagnosis.unchecked.join(', '));
        }
        headers = {'Content-Type': 'application/json'};
        if (settings.apiKey) {
            headers.Authorization = 'Bearer ' + settings.apiKey;
        }
        controller = new AbortController();
        timer = setTimeout(function () { controller.abort(); }, 45000);
        return Promise.resolve().then(function () {
            return fetch(settings.baseUrl.replace(/\/$/, '') + '/chat/completions', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: settings.model,
                temperature: 0,
                messages: [
                    {
                        role: 'system',
                        content: 'You explain a model check to the person who built the model. ' +
                            'Use plain sentences. Name the constraints that failed and say why. ' +
                            'Report only the failures in the result. Do not invent extra problems. ' +
                            'Do not mention Lean, theorems, or source code. At most four sentences.'
                    },
                    {role: 'user', content: prompt.join('\n')}
                ]
            }),
            signal: controller.signal
            });
        }).then(function (response) {
            return response.text().then(function (body) {
                var json;
                var content;
                if (!response.ok) {
                    throw new Error('The summary request failed (' + response.status + ').');
                }
                json = JSON.parse(body);
                content = json.choices && json.choices[0] && json.choices[0].message &&
                    json.choices[0].message.content;
                if (!content) {
                    throw new Error('The summary response was empty.');
                }
                return String(content).trim();
            });
        }).catch(function () {
            return null;
        }).finally(function () {
            clearTimeout(timer);
        });
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
            } catch (buildErr) {
                callback(buildErr, self.result);
                return;
            }

            var typeIndex = indexTypes(dsl.typeDefinitions);
            var constraintsHash = sha256(text);
            var snapshotFile = cachePath(leanDir, projectName(self), rootPath);
            var previous = loadSnapshot(snapshotFile);
            if (previous && previous.constraintsHash !== constraintsHash) {
                previous = null;
            }
            var plan = incrementalCheck.planCheck({
                text: text,
                types: typeIndex,
                scopeType: modelType,
                nodes: described,
                previousNodes: previous && previous.nodes,
                previousResults: previous && previous.results,
                previousCounts: previous && previous.counts
            });
            var metaFocus = null;
            var buildOptions = {
                domainSource: leanFix.generateLeanTypes(dsl),
                scopeType: modelType,
                rootId: rootPath,
                nodes: described,
                text: text,
                types: typeIndex
            };
            if (plan.ok && plan.diff && !plan.diff.empty) {
                metaFocus = plan.diff.added.concat(plan.diff.changed.map(function (entry) {
                    return entry.after;
                }));
                if (rootRecord) {
                    metaFocus.push(rootRecord);
                }
            }
            if (plan.ok) {
                buildOptions.onlyProve = plan.needsLean;
                buildOptions.metaNodes = plan.needsLean.length ? (metaFocus || described) : [];
            }

            try {
                program = leanCheck.buildProgram(buildOptions);
            } catch (programErr) {
                callback(programErr, self.result);
                return;
            }

            function runFiles(extra) {
                var files = {
                    'constraints.txt': text,
                    'model.json': JSON.stringify(described, null, 2),
                    'incremental-plan.json': JSON.stringify(plan, null, 2)
                };
                if (program && program.domainModule) {
                    files['Domain.lean'] = program.domainModule;
                }
                if (program && program.modelModule) {
                    files['Check.lean'] = program.modelModule;
                }
                if (program && program.source) {
                    files['model.lean'] = program.source;
                }
                Object.keys(extra || {}).forEach(function (key) {
                    files[key] = extra[key];
                });
                return files;
            }

            function publish(logText, extraFiles, report) {
                var files = runFiles(extraFiles);
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

            function persistMerged(actions) {
                saveSnapshot(snapshotFile, incrementalCheck.snapshotFrom({
                    rootId: rootPath,
                    constraintsHash: constraintsHash,
                    nodes: described,
                    counts: plan.counts,
                    results: resultsFromActions(actions)
                }));
            }

            if (!program.ok) {
                publish(leanLog({note: program.error}), null, function () {
                    self.createMessage(self.activeNode, program.error, 'error');
                });
                return;
            }

            if (plan.ok && plan.needsLean.length === 0) {
                persistMerged(plan.actions);
                publish(leanLog({
                    code: 0,
                    command: '(incremental; Lean not required)',
                    cwd: leanDir,
                    note: 'All constraints were settled from counts or the prior snapshot.',
                    stdout: '',
                    stderr: ''
                }), null, function () {
                    reportPlan(self, self.activeNode, plan, false);
                });
                return;
            }

            runLeanModules(program, leanDir).then(function (lean) {
                var output = (lean.stderr || '') + '\n' + (lean.stdout || '');
                var diagnosis;
                var leanResults = [];
                var merged;
                diagnosis = leanCheck.diagnoseRun({
                    source: program.modelModule,
                    log: output,
                    text: text,
                    nodes: described,
                    rootId: rootPath,
                    ok: lean.code === 0
                });
                (diagnosis.proved || []).forEach(function (name) {
                    leanResults.push({name: name, passed: true, detail: name + ' holds.'});
                });
                (diagnosis.failures || []).forEach(function (failure) {
                    if (failure.kind === 'constraint' && failure.name) {
                        leanResults.push({
                            name: failure.name,
                            passed: false,
                            detail: failure.detail
                        });
                    }
                });
                merged = incrementalCheck.mergeResults(plan, leanResults);
                if (lean.code === 0) {
                    (plan.needsLean || []).forEach(function (name) {
                        var found = leanResults.some(function (item) {
                            return item.name === name;
                        });
                        if (!found) {
                            leanResults.push({name: name, passed: true});
                        }
                    });
                    merged = incrementalCheck.mergeResults(plan, leanResults);
                    persistMerged(merged);
                }
                function reportMessages(summary) {
                    if (lean.code === 127) {
                        self.createMessage(
                            self.activeNode,
                            leanLines(output)[0] || 'Lean is not available. Install elan, then run lake update in the lean directory.',
                            'error'
                        );
                        return;
                    }
                    reportPlan(self, self.activeNode, {actions: merged, needsLean: plan.needsLean}, true);
                    if (summary) {
                        self.createMessage(self.activeNode, summary, lean.code === 0 ? 'info' : 'error');
                    } else if (lean.code === 0) {
                        self.createMessage(self.activeNode, resultText(diagnosis), 'info');
                    } else {
                        (diagnosis.failures || []).forEach(function (failure) {
                            self.createMessage(self.activeNode, failure.detail, 'error');
                        });
                    }
                    self.logger.info('Lean exited ' + lean.code +
                        (lean.domainRebuilt ? ' (domain rebuilt)' : ' (domain reused)'));
                }
                var summaryPromise = lean.code === 0 || lean.code === 127
                    ? Promise.resolve('')
                    : summarizeResult(llmSettings(self.gmeConfig), diagnosis, text, described, rootPath);
                return summaryPromise.then(function (summary) {
                    publish(leanLog({
                        code: lean.code,
                        command: lean.command,
                        cwd: leanDir,
                        note: lean.domainRebuilt
                            ? 'Domain.lean was rebuilt; Check.lean proved the constraints that needed a full check.'
                            : 'Domain.olean was reused; Check.lean proved only the constraints affected by the edit.',
                        stdout: lean.stdout,
                        stderr: lean.stderr
                    }), null, function () {
                        reportMessages(summary);
                    });
                });
            }).catch(function (runErr) {
                callback(runErr, self.result);
            });
        });
    };

    return CheckWithLean;
});
