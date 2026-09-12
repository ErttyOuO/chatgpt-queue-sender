import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../export/recent-files.js', import.meta.url), 'utf8');

class FakeButton {
  constructor(label) {
    this.tagName = 'BUTTON';
    this.textContent = label;
    this.disabled = false;
    this.clicked = 0;
  }
  getAttribute(name) {
    if (name === 'aria-label' || name === 'title') return '';
    return null;
  }
  matches(selector) {
    if (selector.includes("data-cqs-direct-download")) return false;
    return false;
  }
  querySelector() { return null; }
  closest() { return null; }
  click() { this.clicked += 1; }
}

const xpi = new FakeButton('Firefox／AMO XPI v0.9.0');
const sourceZip = new FakeButton('完整原始碼 ZIP v0.9.0');
const githubZip = new FakeButton('GitHub-ready 原始碼 ZIP');
const unrelated = new FakeButton('Copy');

const turn = {
  querySelectorAll(selector) {
    if (selector === 'button') return [xpi, sourceZip, githubZip, unrelated];
    return [];
  },
};

const context = {
  window: {},
  globalThis: null,
  document: { readyState: 'loading', addEventListener() {}, querySelectorAll() { return []; } },
  Element: class Element {},
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  setTimeout,
  clearTimeout,
  setInterval: () => 1,
  clearInterval() {},
  MutationObserver: class { observe() {} disconnect() {} },
  console,
  Date,
  CQS_I18N: { t: (_zh, en, values = {}) => String(en).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`) },
};
context.globalThis = context;
context.window = context;
context.window.__CQS_DIRECT_DOWNLOAD__ = {
  isLikelyFileButton: () => false,
  isAssistantCitation: () => true,
  inspectButtonMetadata(button) {
    return { ambiguous: false, name: button.textContent, hasIdentity: false };
  },
  collectCandidateButtons: () => [],
  ensureDirectDownloadButton() {
    throw new Error('native download buttons must not request an injected direct-download button');
  },
};
context.window.__CQS_CONVERSATION_EXPORT__ = {
  inspectReactFileMetadata(button) {
    if (button === xpi) return { names: ['chatgpt-queue-sender-firefox-v0.9.0-amo.xpi'], fileIds: ['file_native_xpi_12345678'], urls: [], sandboxPaths: [] };
    if (button === sourceZip) return { names: ['chatgpt-queue-sender-firefox-v0.9.0-source.zip'], fileIds: ['file_native_src_12345678'], urls: [], sandboxPaths: [] };
    if (button === githubZip) return { names: ['chatgpt-queue-sender-firefox-v0.9.0-source-github-ready.zip'], fileIds: ['file_native_git_12345678'], urls: [], sandboxPaths: [] };
    return { names: [], fileIds: [], urls: [], sandboxPaths: [] };
  },
};

vm.runInNewContext(source, context, { filename: 'recent-files.js' });
const api = context.window.__CQS_RECENT_FILES__;
assert.ok(api, 'recent-files API missing');

assert.equal(api.labelExtension(xpi.textContent), 'xpi');
assert.equal(api.labelExtension(sourceZip.textContent), 'zip');
assert.equal(api.labelExtension(githubZip.textContent), 'zip');
assert.equal(api.isNativeDownloadButton(xpi), true);
assert.equal(api.isNativeDownloadButton(sourceZip), true);
assert.equal(api.isNativeDownloadButton(githubZip), true);
assert.equal(api.isNativeDownloadButton(unrelated), false);

const native = api.collectNativeDownloadButtons(turn);
assert.equal(native.length, 3, 'native artifact buttons should be grouped into the latest-file rail');
assert.equal(native[0], xpi);
assert.equal(native[1], sourceZip);
assert.equal(native[2], githubZip);

const xpiEntry = api.immediateEntry(xpi);
const zipEntry = api.immediateEntry(sourceZip);
assert.equal(xpiEntry.nativeDownload, true);
assert.equal(xpiEntry.extension, 'xpi');
assert.equal(zipEntry.extension, 'zip');

const nativeXpiResult = await api.triggerDownload(xpiEntry);
const nativeZipResult = await api.triggerDownload(zipEntry);
assert.equal(nativeXpiResult?.ok, true, 'native XPI rail click should return success feedback');
assert.equal(nativeXpiResult?.native, true, 'native XPI feedback should be marked as delegated to ChatGPT');
assert.equal(nativeZipResult?.ok, true, 'native ZIP rail click should return success feedback');
assert.equal(xpi.clicked, 1, 'rail chip should delegate to ChatGPT native XPI download');
assert.equal(sourceZip.clicked, 1, 'rail chip should delegate to ChatGPT native ZIP download');

console.log(JSON.stringify({
  ok: true,
  nativeXpiIncluded: true,
  nativeZipIncluded: true,
  nativeGithubZipIncluded: true,
  noExtraDownloadButtonRequired: true,
  railDelegatesToNativeClick: true,
}));
