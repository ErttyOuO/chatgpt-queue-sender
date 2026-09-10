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
    if (selector.includes('data-file-citation-primary-file-id') && this.getAttribute('data-file-citation-primary-file-id')) return true;
    if (selector.includes('data-file-citation-group-identity') && this.getAttribute('data-file-citation-group-identity')) return true;
    if (selector.includes("data-cqs-direct-download='1'") && this.dataset.cqsDirectDownload === '1') return true;
    return false;
  }
  closest(selector) {
    if (selector === '[data-message-author-role]') {
      let node = this;
      while (node) {
        if (node.getAttribute?.('data-message-author-role')) return node;
        node = node.parentElement;
      }
      return null;
    }
    if (selector.includes("[data-testid^='conversation-turn-']") || selector.includes('article') || selector.includes('[data-turn]')) {
      let node = this;
      while (node) {
        if (node.tagName === 'ARTICLE') return node;
        node = node.parentElement;
      }
      return null;
    }
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children || []) {
        if (child.matches?.(selector)) out.push(child);
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

const assistant = new FakeElement('div', { 'data-message-author-role': 'assistant' });
const citation = new FakeElement('button', {
  'data-file-citation-primary-file-id': 'file_00000000713c8230bbd31a0d24c988d6',
  title: 'IAFM_Linux_RAG_啟動修復_20260910.zip',
  'aria-label': 'IAFM_Linux_RAG_啟動修復_20260910.zip',
});
citation.textContent = 'IAFM_Linux_RAG_啟動修復_20260910.zip';
assistant.appendChild(citation);

const user = new FakeElement('div', { 'data-message-author-role': 'user' });
const userCitation = new FakeElement('button', {
  'data-file-citation-primary-file-id': 'file_00000000USERUPLOAD123456789012',
  title: 'user.zip',
});
user.appendChild(userCitation);

const grouped = new FakeElement('button', {
  'data-file-citation-primary-file-id': 'file_00000000PRIMARYGROUP123456789',
  'data-file-citation-group-size': '2',
  'data-file-citation-group-identity': '[["unknown","my_files","file_00000000PRIMARYGROUP123456789"],["unknown","my_files","file_00000000SECONDGROUP1234567890"]]',
  title: 'multiple files',
});
assistant.appendChild(grouped);

const sentMessages = [];
const statusEvents = [];
const created = [];

const document = {
  readyState: 'complete',
  documentElement: new FakeElement('html'),
  querySelectorAll(selector) {
    const all = [citation, userCitation, grouped];
    return all.filter((node) => node.matches(selector));
  },
  createElement(tag) { const el = new FakeElement(tag); created.push(el); return el; },
  addEventListener() {},
  dispatchEvent(event) { statusEvents.push(event); return true; },
};

class FakeMutationObserver {
  constructor(fn) { this.fn = fn; }
  observe() {}
  disconnect() {}
}

const browser = {
  runtime: {
    async sendMessage(message) {
      sentMessages.push(message);
      return { ok: true, downloadId: 42, filename: 'IAFM_Linux_RAG_啟動修復_20260910.zip' };
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
  CQS_I18N: { t: (zh, en, values = {}) => String(en).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`) },
  location: { origin: 'https://chatgpt.com' },
};
context.globalThis = context;
context.window = context;
context.window.__CQS_CONVERSATION_API__ = {
  extractFileId(value) {
    return String(value || '').match(/(?:file|asset)[-_][A-Za-z0-9_-]{8,}/i)?.[0] || '';
  },
  getConversationId() { return 'conversation-12345678'; },
  async getDownloadContext() {
    return { conversationId: 'conversation-12345678', accessToken: 'temporary-token', accountId: 'account-123' };
  },
  async resolveAttachment(ref) {
    assert.equal(ref.fileId, 'file_00000000713c8230bbd31a0d24c988d6');
    return {
      ...ref,
      resolvedFileName: 'IAFM_Linux_RAG_啟動修復_20260910.zip',
      resolvedDownloadUrl: 'https://files.oaiusercontent.com/file/direct.zip?sig=fresh',
    };
  },
};

vm.runInNewContext(source, context, { filename: 'direct-download.js' });
const api = context.window.__CQS_DIRECT_DOWNLOAD__;
assert.ok(api, 'direct download API missing');
assert.equal(api.citationFileId(citation), 'file_00000000713c8230bbd31a0d24c988d6');
assert.equal(api.citationFilename(citation), 'IAFM_Linux_RAG_啟動修復_20260910.zip');
assert.equal(api.isAssistantCitation(citation), true, 'assistant file citation should be supported');
assert.equal(api.isAssistantCitation(userCitation), false, 'user-upload citation must not receive direct download UI');
assert.equal(api.citationFileId(grouped), '', 'multi-file citation groups must not silently download only the primary file');
assert.equal(grouped.nextElementSibling, null, 'multi-file citation group unexpectedly received a single-file download action');

const injectedButton = citation.nextElementSibling;
assert.ok(injectedButton, 'direct download button was not injected beside the assistant file citation');
assert.equal(injectedButton.dataset.cqsDirectDownload, '1');
assert.equal(userCitation.nextElementSibling, null, 'user citation unexpectedly received a direct download button');
assert.match(injectedButton.getAttribute('aria-label'), /Download IAFM_Linux_RAG/);

await injectedButton.fire('click');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(sentMessages.length, 1, 'direct download background request was not sent');
assert.equal(sentMessages[0].type, 'CQS_DIRECT_DOWNLOAD');
assert.equal(sentMessages[0].fileId, 'file_00000000713c8230bbd31a0d24c988d6');
assert.equal(sentMessages[0].conversationId, 'conversation-12345678');
assert.equal(sentMessages[0].url, 'https://files.oaiusercontent.com/file/direct.zip?sig=fresh');
assert.equal(sentMessages[0].accessToken, 'temporary-token');
assert.equal(sentMessages[0].accountId, 'account-123');
assert.ok(statusEvents.some((event) => event.type === 'cqs:direct-download-status' && /Download started/.test(event.detail?.message || '')), 'success status event missing');

citation.nextElementSibling = null;
const restoredButton = api.ensureDirectDownloadButton(citation);
assert.ok(restoredButton && restoredButton !== injectedButton, 'direct download action was not restored after a React-style sibling removal');

console.log(JSON.stringify({
  ok: true,
  assistantOnlyInjection: true,
  exactFileIdFromCitation: true,
  adjacentButton: true,
  pageResolutionBeforeDownload: true,
  statusFeedback: true,
  reactRerenderRestore: true,
  multiFileGroupFailClosed: true,
}));
