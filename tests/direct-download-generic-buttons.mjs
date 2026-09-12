import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../export/direct-download.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName = 'div', attrs = {}) {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map(Object.entries(attrs));
    this.dataset = {};
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.parentElement = null;
    this.nextElementSibling = null;
    this.children = [];
    this.listeners = new Map();
    this.nodeType = 1;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  matches(selector) {
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector.includes('data-file-citation-primary-file-id') && this.getAttribute('data-file-citation-primary-file-id')) return true;
    if (selector.includes('data-file-citation-group-identity') && this.getAttribute('data-file-citation-group-identity')) return true;
    if (selector.includes('data-cqs-direct-download') && this.dataset.cqsDirectDownload === '1') return true;
    if (selector.includes("svg[data-testid='library-file-icon']") && this.tagName === 'SVG' && this.getAttribute('data-testid') === 'library-file-icon') return true;
    return false;
  }
  closest(selector) {
    let node = this;
    if (selector === 'button') {
      while (node) {
        if (node.tagName === 'BUTTON') return node;
        node = node.parentElement;
      }
      return null;
    }
    if (selector === '[data-message-author-role]') {
      while (node) {
        if (node.getAttribute?.('data-message-author-role')) return node;
        node = node.parentElement;
      }
      return null;
    }
    if (selector.includes('[data-message-id]') || selector.includes("[data-testid^='conversation-turn-']") || selector.includes('article') || selector.includes('[data-turn]')) {
      while (node) {
        if (node.tagName === 'ARTICLE' || node.getAttribute?.('data-message-id')) return node;
        node = node.parentElement;
      }
      return null;
    }
    return null;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children || []) {
        const isButtonQuery = selector === 'button' && child.tagName === 'BUTTON';
        if (isButtonQuery || child.matches?.(selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  insertAdjacentElement(position, element) {
    if (position !== 'afterend') throw new Error('unexpected insert position');
    element.parentElement = this.parentElement;
    this.nextElementSibling = element;
    return element;
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  async fire(type) {
    const event = { preventDefault() {}, stopPropagation() {} };
    return this.listeners.get(type)?.(event);
  }
}

function makeFileButton(label, messageId) {
  const turn = new FakeElement('article', { 'data-message-id': messageId });
  const assistant = new FakeElement('div', { 'data-message-author-role': 'assistant' });
  const button = new FakeElement('button', { 'aria-label': label });
  button.textContent = label;
  const span = new FakeElement('span');
  const icon = new FakeElement('svg', {
    'data-testid': 'library-file-icon',
    'data-library-file-icon-kind': 'document',
  });
  span.appendChild(icon);
  button.appendChild(span);
  assistant.appendChild(button);
  turn.appendChild(assistant);
  return { turn, assistant, button, icon };
}

const pdf = makeFileButton('consulting_v2.pdf', '11111111-1111-1111-1111-111111111111');
const report = makeFileButton('下載 v2.2.12 驗證報告', '22222222-2222-2222-2222-222222222222');

const nativeArtifact = new FakeElement('button', { 'aria-label': 'Firefox／AMO XPI v0.9.0' });
nativeArtifact.textContent = 'Firefox／AMO XPI v0.9.0';
report.assistant.appendChild(nativeArtifact);
const documentElement = new FakeElement('html');
documentElement.appendChild(pdf.turn);
documentElement.appendChild(report.turn);

const sentMessages = [];
const statusEvents = [];
const document = {
  readyState: 'complete',
  documentElement,
  querySelectorAll(selector) { return documentElement.querySelectorAll(selector); },
  createElement(tag) { return new FakeElement(tag); },
  addEventListener() {},
  dispatchEvent(event) { statusEvents.push(event); return true; },
};

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

const browser = {
  runtime: {
    async sendMessage(message) {
      sentMessages.push(message);
      return { ok: true, downloadId: sentMessages.length, filename: message.filename };
    },
  },
};

const context = {
  window: {},
  globalThis: null,
  document,
  browser,
  chrome: null,
  MutationObserver: FakeMutationObserver,
  Node: { ELEMENT_NODE: 1 },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  setTimeout(fn) { fn(); return 1; },
  clearTimeout() {},
  console,
  URL,
  location: { origin: 'https://chatgpt.com', href: 'https://chatgpt.com/c/generic-download-test' },
  CQS_I18N: { t: (zh, en, values = {}) => String(en).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`) },
};
context.globalThis = context;
context.window = context;

context.window.__CQS_CONVERSATION_EXPORT__ = {
  inspectReactFileMetadata(button) {
    if (button === pdf.button) {
      return {
        names: ['consulting_v2.pdf'],
        urls: [],
        fileIds: ['file_00000000CONSULTINGPDF123456789'],
        sandboxPaths: [],
        messageIds: ['11111111-1111-1111-1111-111111111111'],
      };
    }
    return { names: [], urls: [], fileIds: [], sandboxPaths: [], messageIds: [] };
  },
};

context.window.__CQS_CONVERSATION_API__ = {
  extractFileId(value) {
    return String(value || '').match(/(?:file|asset)[-_][A-Za-z0-9_-]{8,}/i)?.[0] || '';
  },
  getConversationId() { return 'generic-download-test'; },
  async getDownloadContext() {
    return { conversationId: 'generic-download-test', accessToken: 'token', accountId: 'account' };
  },
  async resolveAttachment(ref) {
    if (ref.fileId === 'file_00000000CONSULTINGPDF123456789') {
      return { ...ref, resolvedFileName: 'consulting_v2.pdf', resolvedDownloadUrl: 'https://files.oaiusercontent.com/consulting_v2.pdf?sig=fresh' };
    }
    return ref;
  },
  async collectAttachments() {
    return {
      ok: true,
      accessToken: 'token',
      accountId: 'account',
      attachments: [
        {
          fileId: 'file_00000000CONSULTINGPDF123456789',
          role: 'assistant',
          name: 'consulting_v2.pdf',
          resolvedFileName: 'consulting_v2.pdf',
          resolvedDownloadUrl: 'https://files.oaiusercontent.com/consulting_v2.pdf?sig=fresh',
          messageId: '11111111-1111-1111-1111-111111111111',
          appearanceIndex: 0,
        },
        {
          fileId: 'file_00000000VALIDATIONREPORT2212',
          role: 'assistant',
          name: 'project-v2.2.12-validation-report.md',
          resolvedFileName: 'project-v2.2.12-validation-report.md',
          resolvedDownloadUrl: 'https://files.oaiusercontent.com/project-v2.2.12-validation-report.md?sig=fresh',
          messageId: 'hidden-tool-message-id',
          appearanceIndex: 1,
        },
      ],
    };
  },
};

vm.runInNewContext(source, context, { filename: 'direct-download.js' });
const api = context.window.__CQS_DIRECT_DOWNLOAD__;
assert.ok(api, 'direct-download API missing');

assert.equal(api.isLikelyFileButton(pdf.button), true, 'library-file-icon PDF button should be recognized without citation attributes');
assert.equal(api.isLikelyFileButton(report.button), true, 'library-file-icon report button should be recognized without citation attributes');
assert.equal(api.isLikelyFileButton(nativeArtifact), false, 'ChatGPT native artifact button must not receive an extra direct-download button');
assert.equal(api.ensureDirectDownloadButton(nativeArtifact), null, 'native artifact download should remain ChatGPT-native');
assert.equal(api.inspectButtonMetadata(pdf.button).fileId, 'file_00000000CONSULTINGPDF123456789', 'React metadata file ID was not recovered');
assert.equal(api.inspectButtonMetadata(pdf.button).name, 'consulting_v2.pdf');

const pdfDirect = pdf.button.nextElementSibling;
const reportDirect = report.button.nextElementSibling;
assert.ok(pdfDirect?.dataset?.cqsDirectDownload === '1', 'PDF generic button did not receive direct-download action');
assert.ok(reportDirect?.dataset?.cqsDirectDownload === '1', 'download-labelled generic button did not receive direct-download action');

await pdfDirect.fire('click');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(sentMessages[0]?.fileId, 'file_00000000CONSULTINGPDF123456789');
assert.equal(sentMessages[0]?.filename, 'consulting_v2.pdf');

await reportDirect.fire('click');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(sentMessages[1]?.fileId, 'file_00000000VALIDATIONREPORT2212', 'version-labelled button did not recover the matching structured attachment');
assert.equal(sentMessages[1]?.filename, 'project-v2.2.12-validation-report.md');
assert.ok(statusEvents.some((event) => /Download started/.test(event.detail?.message || '')), 'download success feedback missing');

console.log(JSON.stringify({
  ok: true,
  libraryFileIconButtonsSupported: true,
  reactMetadataFallback: true,
  exactFilenameStructuredFallback: true,
  versionLabelStructuredFallback: true,
}));
