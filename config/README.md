# WebGME Configuration Settings

On `npm start`, the webgme app loads `config.default.js`, which overrides the configuration defaults.

If `NODE_ENV` is set, it loads `config/config.ENV.js` where `ENV` is the value of `NODE_ENV`. For example,

```
NODE_ENV=debug npm start
```

loads `config/config.debug.js` when that file exists, and `config/config.default.js` otherwise.

`config/config.webgme.js` is generated from `webgme-setup.json` by webgme-cli. Paths for plugins belong there. Other settings belong in `config.default.js`.
