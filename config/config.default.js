'use strict';

var path = require('path'),
    config = require('./config.webgme'),
    validateConfig = require('webgme/config/validator');

config.plugin.allowServerExecution = true;
// The plugin is not registered on any seed's validPlugins list. Show it for every project.
config.plugin.displayAll = true;

config.requirejsPaths = config.requirejsPaths || {};
config.requirejsPaths['webgme-lean'] = './src/common';

// Add Monaco Editor paths for RequireJS
config.requirejsPaths['vs'] = './node_modules/monaco-editor/min/vs';

// OpenAI-compatible chat completions. vLLM defaults to port 8000, llama.cpp to 8080,
// Ollama to 11434. The path is /v1, and /chat/completions is added by the router.
// LLM_BACKEND, LLM_BASE_URL, LLM_MODEL, and LLM_API_KEY override these when set.
config.rest.components.leanllm.options = {
    llm: {
        backend: 'openai',
        baseUrl: 'http://127.0.0.1:8000/v1',
        model: '',
        apiKey: ''
    }
};

// The project database lives in the server process. A plugin worker opens the
// project through that server, so it sees the same data.
config.storage.database.type = 'memory';
config.authentication.enable = false;
config.authentication.gmeAuth.path = path.join(
    path.dirname(require.resolve('webgme-engine/package.json')),
    'src/server/middleware/auth/memorygmeauth.js'
);

validateConfig(config);
module.exports = config;
