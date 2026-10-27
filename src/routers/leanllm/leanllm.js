'use strict';

/**
 * leanllm router.
 *
 * Explain turns a constraint into a sentence on the server. No model is required.
 * Translate sends a description to an OpenAI-compatible /v1/chat/completions endpoint
 * (vLLM, llama.cpp, or Ollama). Settings live on the component:
 *
 *   config.rest.components.leanllm.options.llm = { backend, baseUrl, model, apiKey }
 *
 * LLM_BACKEND, LLM_BASE_URL, LLM_MODEL, and LLM_API_KEY override those fields when set.
 * That is the same set gmebot's cback router reads, so one environment can drive both later.
 */

const express = require('express');
const nl = require('./nl-bundle');

const router = express.Router();
const DEFAULT_BASE_URL = 'http://127.0.0.1:8000/v1';
const DEFAULT_TIMEOUT_MS = 120000;

function trim(value) {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim();
}

function resolveLlm(gmeConfig) {
    const component = gmeConfig && gmeConfig.rest && gmeConfig.rest.components &&
        gmeConfig.rest.components.leanllm;
    const llm = (component && component.options && component.options.llm) || {};
    const backendRaw = (trim(process.env.LLM_BACKEND) || trim(llm.backend) || 'openai').toLowerCase();
    const backend = backendRaw === 'anthropic' ? 'anthropic' : 'openai';
    const baseUrl = trim(process.env.LLM_BASE_URL) || trim(llm.baseUrl) || DEFAULT_BASE_URL;
    const model = trim(process.env.LLM_MODEL) || trim(llm.model);
    const apiKey = trim(process.env.LLM_API_KEY) || trim(llm.apiKey);
    const configured = backend === 'openai' && baseUrl !== '' && model !== '';
    const timeoutMs = Number(llm.timeoutMs) > 0 ? Number(llm.timeoutMs) : DEFAULT_TIMEOUT_MS;

    return { backend, baseUrl, model, apiKey, configured, timeoutMs };
}

function publicLlm(settings) {
    return {
        backend: settings.backend,
        model: settings.model,
        baseUrl: settings.baseUrl,
        configured: settings.configured
    };
}

const STATUS_TIMEOUT_MS = 2500;

function modelIds(payload) {
    var data = payload && (payload.data || payload.models);
    var ids = [];
    if (!Array.isArray(data)) {
        return null;
    }
    data.forEach(function (item) {
        if (!item) {
            return;
        }
        if (typeof item === 'string') {
            ids.push(item);
        } else if (item.id || item.name) {
            ids.push(item.id || item.name);
        }
    });
    return ids;
}

async function modelStatus(settings) {
    var url;
    var headers;
    var controller;
    var timer;
    var response;
    var text;
    var payload;
    var ids;

    if (settings.backend !== 'openai') {
        return {
            ok: false,
            reason: 'Describe needs an OpenAI-compatible endpoint. Set llm.backend to openai.'
        };
    }
    if (!settings.model) {
        return {
            ok: false,
            reason: 'Set llm.model in the leanllm component config.'
        };
    }
    if (!settings.baseUrl) {
        return {
            ok: false,
            reason: 'Set llm.baseUrl in the leanllm component config.'
        };
    }

    url = settings.baseUrl.replace(/\/$/, '') + '/models';
    headers = {};
    if (settings.apiKey) {
        headers.Authorization = 'Bearer ' + settings.apiKey;
    }
    controller = new AbortController();
    timer = setTimeout(function () { controller.abort(); }, STATUS_TIMEOUT_MS);
    try {
        response = await fetch(url, { method: 'GET', headers: headers, signal: controller.signal });
        text = await response.text();
        if (!response.ok) {
            return {
                ok: false,
                reason: 'The model server returned ' + response.status + '.'
            };
        }
        try {
            payload = JSON.parse(text);
        } catch (err) {
            return {
                ok: false,
                reason: 'The model server did not return a model list.'
            };
        }
        ids = modelIds(payload);
        if (!ids || ids.length === 0) {
            return {
                ok: false,
                reason: 'The model server is up, but it is not serving a model.'
            };
        }
        if (ids.indexOf(settings.model) === -1) {
            return {
                ok: false,
                reason: 'The model server is up, but it is not serving "' + settings.model + '".'
            };
        }
        return { ok: true, reason: '' };
    } catch (err) {
        if (err && err.name === 'AbortError') {
            return { ok: false, reason: 'The model server did not respond.' };
        }
        return {
            ok: false,
            reason: 'The model server at ' + settings.baseUrl + ' is not reachable.'
        };
    } finally {
        clearTimeout(timer);
    }
}

async function chatComplete(settings, prompt, systemPrompt) {
    const url = settings.baseUrl.replace(/\/$/, '') + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) {
        headers.Authorization = 'Bearer ' + settings.apiKey;
    }
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, settings.timeoutMs);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: settings.model,
                temperature: 0,
                messages: [
                    { role: 'system', content: systemPrompt || 'You translate constraints.' },
                    { role: 'user', content: prompt }
                ]
            }),
            signal: controller.signal
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error('LLM request failed (' + response.status + '): ' + text.slice(0, 300));
        }
        const json = JSON.parse(text);
        const content = json.choices && json.choices[0] && json.choices[0].message &&
            json.choices[0].message.content;
        if (!content) {
            throw new Error('LLM response had no message content');
        }
        return content;
    } catch (err) {
        if (err && err.name === 'AbortError') {
            throw new Error('LLM request timed out after ' + (settings.timeoutMs / 1000) + 's');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function initialize(middlewareOpts) {
    const logger = middlewareOpts.logger.fork('leanllm');
    const ensureAuthenticated = middlewareOpts.ensureAuthenticated;
    const settings = resolveLlm(middlewareOpts.gmeConfig);

    logger.info('leanllm: backend=' + settings.backend +
        ' baseUrl=' + settings.baseUrl +
        ' model=' + (settings.model || '(unset)') +
        ' translate=' + settings.configured);

    router.use(function (_req, res, next) {
        res.setHeader('X-WebGME-Media-Type', 'webgme.v1');
        next();
    });
    if (typeof ensureAuthenticated === 'function') {
        router.use(ensureAuthenticated);
    }

    router.get('/config', function (_req, res) {
        const current = resolveLlm(middlewareOpts.gmeConfig);
        res.json({
            llm: publicLlm(current),
            explain: true,
            translate: current.configured
        });
    });

    router.get('/status', async function (_req, res) {
        try {
            const current = resolveLlm(middlewareOpts.gmeConfig);
            const status = await modelStatus(current);
            res.json(status);
        } catch (err) {
            logger.error('status failed', err);
            res.status(500).json({ ok: false, reason: err.message || 'The model check failed.' });
        }
    });

    router.post('/explain', async function (req, res) {
        const constraint = req.body && req.body.constraint;
        if (!constraint || typeof constraint !== 'string') {
            res.status(400).json({ error: 'Missing constraint text' });
            return;
        }
        try {
            const result = await nl.explainText(constraint);
            res.status(result && result.success ? 200 : 422).json(result);
        } catch (err) {
            logger.error('explain failed', err);
            res.status(500).json({ error: err.message || String(err) });
        }
    });

    router.post('/translate', async function (req, res) {
        const current = resolveLlm(middlewareOpts.gmeConfig);
        const description = req.body && req.body.description;
        if (!description || typeof description !== 'string') {
            res.status(400).json({ error: 'Missing description' });
            return;
        }
        if (!current.configured) {
            res.status(503).json({
                error: 'No model is configured. Set config.rest.components.leanllm.options.llm.model and baseUrl to an OpenAI-compatible /v1 endpoint (vLLM, llama.cpp, or Ollama).'
            });
            return;
        }
        try {
            const result = await nl.translateText({
                description: description,
                existing: typeof req.body.existing === 'string' ? req.body.existing : '',
                rootType: typeof req.body.rootType === 'string' ? req.body.rootType : '',
                types: Array.isArray(req.body.types) ? req.body.types : [],
                complete: function (prompt, systemPrompt) {
                    return chatComplete(current, prompt, systemPrompt);
                }
            });
            res.status(result && result.success ? 200 : 422).json(result);
        } catch (err) {
            logger.error('translate failed', err);
            res.status(500).json({ error: err.message || String(err) });
        }
    });

    router.use(function (err, _req, res, _next) {
        logger.error('leanllm request failed: ' + (err && err.message));
        if (!res.headersSent) {
            res.status(500).json({ error: (err && err.message) || 'leanllm request failed' });
        }
    });
}

function start(callback) {
    callback();
}

function stop(callback) {
    callback();
}

module.exports = {
    initialize: initialize,
    router: router,
    start: start,
    stop: stop,
    resolveLlm: resolveLlm
};
