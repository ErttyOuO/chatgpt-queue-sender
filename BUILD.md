# Build

## Local test

1. Open Firefox.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on`.
4. Select `manifest.json` from this folder.
5. Open or refresh `https://chatgpt.com/`.
6. Test the queue button beside `+`, the toolbar popup, the desktop-only `匯出與轉移` button, and the saved custom prompt actions.

## Automated checks

```bash
npm ci
npm run verify
```

`npm ci` installs the exact versions recorded in `package-lock.json`: `jsdom 26.1.0` and Mozilla `addons-linter 10.8.0`. `npm run verify` runs syntax/static checks, all simulation suites including jsdom, and AMO-compatible linting against a staged runtime-only directory. The source archive must not include `node_modules` or `dist`.

## Create AMO XPI

Run from inside this folder:

```bash
zip -X -r ../chatgpt-queue-sender-firefox-v0.8.6-amo.xpi \
  manifest.json i18n.js background.js content.js content.css \
  _locales export popup icons
```

The XPI archive root must directly contain `manifest.json`; do not zip the parent folder itself. Documentation, tests, `package.json`, `package-lock.json`, and `node_modules` are not required in the AMO package.

## Create source ZIP

Run from the parent folder after deleting `node_modules`:

```bash
zip -X -r chatgpt-queue-sender-firefox-v0.8.6-source.zip \
  chatgpt-queue-sender-firefox-v0.8.6-source
```

## Permission design

Required permission:

```json
"permissions": ["storage"]
```

Optional permission requested from the popup only when enabled:

```json
"optional_permissions": ["notifications"]
```

Markdown and ZIP downloads use local `Blob` objects and temporary links, so v0.8.6 does not require the Firefox `downloads` permission. HTTPS attachments are fetched by `background.js`, because Manifest V3 content scripts cannot rely on host permissions for cross-origin fetches. The background script accepts only ChatGPT/OpenAI/oaiusercontent HTTPS hosts, streams the bytes to the content script, and the built-in ZIP writer packages them locally.

Required host permissions cover the two supported ChatGPT pages plus OpenAI-controlled attachment hosts:

```json
"host_permissions": [
  "https://chatgpt.com/*",
  "https://*.chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://openai.com/*",
  "https://*.openai.com/*",
  "https://oaiusercontent.com/*",
  "https://*.oaiusercontent.com/*"
]
```

AMO data collection declaration remains:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```
