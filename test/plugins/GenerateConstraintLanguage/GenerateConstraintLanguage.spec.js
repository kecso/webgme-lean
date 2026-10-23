/*eslint-env node, mocha*/

describe('GenerateConstraintLanguage', function () {
    var testFixture = require('../../globals'),
        gmeConfig = testFixture.getGmeConfig(),
        expect = testFixture.expect,
        logger = testFixture.logger.fork('GenerateConstraintLanguage'),
        webgme = testFixture.WebGME,
        pluginName = 'GenerateConstraintLanguage',
        projectId = gmeConfig.authentication.guestAccount + '+' + 'Statechart',
        server,
        serverUrl;

    this.timeout(20000);

    before(function (done) {
        server = new webgme.standaloneServer(gmeConfig);
        server.start()
            .then(function () {
                serverUrl = server.getUrl();
                return fetch(serverUrl + '/api/projects/' + gmeConfig.authentication.guestAccount + '/Statechart', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({type: 'file', seedName: 'StateChart'})
                });
            })
            .then(function (response) {
                if (response.status !== 204) {
                    return response.text().then(function (body) {
                        throw new Error('Importing src/seeds/StateChart/StateChart.webgmex failed: ' +
                            response.status + ' ' + body);
                    });
                }
            })
            .nodeify(done);
    });

    after(function (done) {
        if (!server) {
            done();
            return;
        }
        server.stop(done);
    });

    function concept(language, name) {
        var paths = language.byName[name];
        expect(paths, name).to.be.an('array').with.length(1);
        return language.concepts[paths[0]];
    }

    it('builds a language server from the imported statechart project', function (done) {
        fetch(serverUrl + '/api/plugin/' + pluginName + '/run', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                projectId: projectId,
                branchName: 'master',
                activeNode: '/1',
                pluginConfig: {}
            })
        })
            .then(function (response) {
                return response.json().then(function (pluginResult) {
                    if (!response.ok) {
                        throw new Error('Plugin request failed: ' + response.status + ' ' +
                            JSON.stringify(pluginResult));
                    }
                    return pluginResult;
                });
            })
            .then(function (pluginResult) {
                var BlobClient = webgme.requirejs('blob/BlobClient'),
                    blobClient = new BlobClient({
                        server: '127.0.0.1',
                        serverPort: gmeConfig.server.port,
                        httpsecure: false,
                        logger: logger
                    });

                expect(pluginResult.success).to.equal(true);
                expect(pluginResult.messages[0].message).to.include('StateChart');
                expect(pluginResult.artifacts).to.have.length(1);
                return blobClient.getObjectAsJSON(pluginResult.artifacts[0]);
            })
            .then(function (language) {
                var metaLanguage = require('../../../src/common/metaLanguage');
                var server = metaLanguage.createLanguageServer(language);
                var state = concept(language, 'State');
                var init = concept(language, 'Init');
                var end = concept(language, 'End');
                var chart = concept(language, 'StateChart');
                var transition = concept(language, 'Transition');
                var meta = concept(language, 'META');
                var text = 'forall t in Transition: t.ev';
                var labels;

                expect(language.byGuid[state.guid]).to.equal(state.path);
                expect(meta.isAbstract).to.equal(true);
                expect(meta.base).to.equal(concept(language, 'FCO').path);

                expect(state.base).to.equal(concept(language, 'FCO').path);
                expect(state.attributes.name.type).to.equal('string');
                expect(state.attributes.name.own).to.equal(false);
                expect(init.base).to.equal(state.path);
                expect(end.base).to.equal(state.path);

                expect(transition.attributes.event).to.deep.include({type: 'string', own: true});
                expect(transition.attributes.guard).to.deep.include({type: 'string', own: true});
                expect(transition.pointers.src.max).to.equal(1);
                expect(transition.pointers.src.min).to.equal(1);
                expect(transition.pointers.src.targets[0].name).to.equal('State');
                expect(transition.pointers.src.targets[0].path).to.equal(state.path);
                expect(transition.pointers.dst.targets[0].name).to.equal('State');
                expect(transition.sets).to.deep.equal({});

                expect(chart.pointers).to.deep.equal({});
                expect(chart.children.targets.map(function (target) { return target.name; }))
                    .to.have.members(['Init', 'State', 'Transition']);

                expect(server.validate('forall t in Transition: t->src != null and t.event == ""')).to.deep.equal([]);
                expect(server.validate('forall t in Transition: t.src != null')[0].message).to.include('pointer');
                expect(server.validate('forall s in Widget: s.name == ""').length).to.equal(1);
                labels = server.getCompletions('forall t in Transition: t.', {
                    line: 0,
                    character: 'forall t in Transition: t.'.length
                }).map(function (item) { return item.label; });
                expect(labels).to.include('event');
                expect(labels).to.include('guard');
                expect(labels).to.not.include('src');
                labels = server.getCompletions('forall t in Transition: t->', {
                    line: 0,
                    character: 'forall t in Transition: t->'.length
                }).map(function (item) { return item.label; });
                expect(labels).to.include('src');
                expect(labels).to.include('dst');
                expect(labels).to.not.include('event');
                labels = server.getCompletions(text, {line: 0, character: text.length})
                    .map(function (item) { return item.label; });
                expect(labels).to.include('event');
                expect(labels).to.not.include('guard');
                labels = server.getCompletions('forall s in St', {line: 0, character: 'forall s in St'.length})
                    .map(function (item) { return item.label; });
                expect(labels).to.include('State');
                expect(labels).to.include('StateChart');
                expect(labels).to.not.include('Transition');
            })
            .then(function () {
                done();
            })
            .catch(done);
    });
});
