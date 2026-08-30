import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fullSource = fs.readFileSync(path.join(root, 'export', 'conversation-export.js'), 'utf8');
const bodyStart = fullSource.indexOf('  const FILE_EXTENSIONS');
const bodyEnd = fullSource.indexOf('  function snapshotTurns');
assert.ok(bodyStart > 0 && bodyEnd > bodyStart, 'could not isolate attachment detector source');

const detectorSource = `(() => {
  const tr = (zh, en) => en || zh;
  ${fullSource.slice(bodyStart, bodyEnd)}
  window.__TEST_EXPORT__ = { inspectReactFileMetadata, inferGeneratedSandboxCandidates, detectAttachments };
})();`;

class FakeElement {
  constructor(tagName, options = {}) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.innerText = options.innerText || '';
    this.textContent = options.textContent ?? this.innerText;
    this.attributes = new Map(Object.entries(options.attributes || {}));
    this.children = [];
    this.parentElement = null;
    this.turn = null;
    this.headings = [];
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      child.turn = this.turn || (this.attributes.has('data-message-id') ? this : null);
      this.children.push(child);
    }
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  getClientRects() { return [{}]; }
  getBoundingClientRect() { return { width: 100, height: 30, left: 0, top: 0 }; }

  querySelector(selector) {
    if (selector.includes('[download]')) return null;
    if (selector.includes('[data-message-id]')) return null;
    return null;
  }

  querySelectorAll(selector) {
    if (selector.includes('h1, h2, h3, strong')) return this.headings;
    if (selector.includes('a, button')) return this.children;
    if (selector.includes('a[href]') || selector.includes('[data-href]')) return [];
    return [];
  }

  closest(selector) {
    if (selector.includes('pre, code')) return null;
    if (selector.includes("[data-testid*='file']") || selector.includes("[data-testid*='download']")) {
      return this.attributes.get('data-testid')?.includes('download') ? this : null;
    }
    if (selector.includes("[data-testid^='conversation-turn-']") || selector.includes('[data-message-id]') || selector.includes('article') || selector.includes('[data-turn]')) {
      return this.turn || (this.attributes.has('data-message-id') ? this : null);
    }
    if (selector.includes('a[href]') || selector.includes('[data-href]')) return null;
    return null;
  }

  matches(selector) {
    return selector.includes('button') && this.tagName === 'BUTTON';
  }
}

function extractFileId(value) {
  const text = String(value || '').trim();
  const direct = text.match(/^(?:file|asset)[-_][A-Za-z0-9_-]{8,}$/i);
  if (direct) return direct[0];
  const embedded = text.match(/(?:file|asset)[-_][A-Za-z0-9_-]{8,}/i);
  return embedded?.[0] || '';
}

const context = {
  console,
  URL,
  encodeURIComponent,
  decodeURIComponent,
  Element: FakeElement,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  location: { href: 'https://chatgpt.com/c/react-test', origin: 'https://chatgpt.com' },
  document: { createElement: (tag) => new FakeElement(tag) },
  window: null,
};
context.window = context;
context.window.__CQS_CONVERSATION_API__ = { extractFileId };
vm.createContext(context);
vm.runInContext(detectorSource, context, { filename: 'conversation-export-detector.js' });

const api = context.window.__TEST_EXPORT__;
const messageId = '12345678-1234-1234-1234-1234567890ab';
const turn = new FakeElement('article', {
  innerText: 'ChatGPT Queue Sender Firefox v0.8.5\nFirefox XPI\n完整原始碼 ZIP',
  attributes: { 'data-turn': '42' },
});
turn.turn = turn;
turn.headings = [new FakeElement('h3', { textContent: 'ChatGPT Queue Sender Firefox v0.8.5' })];

const xpi = new FakeElement('button', {
  innerText: 'Firefox XPI',
  attributes: { 'data-testid': 'download-artifact-button' },
});
xpi.__reactProps$test = {
  artifact: {
    file_name: 'chatgpt-queue-sender-firefox-v0.8.5-amo.xpi',
    sandbox_path: '/mnt/data/chatgpt-queue-sender-firefox-v0.8.5-amo.xpi',
    messageId,
  },
};

const source = new FakeElement('button', {
  innerText: '完整原始碼 ZIP',
  attributes: { 'data-testid': 'download-artifact-button' },
});
source.__reactProps$test = {
  payload: JSON.stringify({
    asset_id: 'asset_00000000REACTSOURCE1234567890',
    sandbox_path: 'sandbox%3A%2Fmnt%2Fdata%2Fchatgpt-queue-sender-firefox-v0.8.5-source.zip',
    filename: 'chatgpt-queue-sender-firefox-v0.8.5-source.zip',
  }),
  message_id: messageId,
};

const ordinaryButton = new FakeElement('button', { innerText: 'Send' });
ordinaryButton.__reactProps$test = {
  unrelated: {
    file_name: 'must-not-be-collected.zip',
    sandbox_path: '/mnt/data/must-not-be-collected.zip',
  },
};

turn.append(xpi, source, ordinaryButton);
const attachments = api.detectAttachments(turn, 'assistant');
assert.equal(attachments.length, 2, 'two React-only download buttons should produce two attachments without scanning ordinary controls');
assert.equal(attachments.some((item) => item.name === 'must-not-be-collected.zip'), false);

const xpiAttachment = attachments.find((item) => item.name.endsWith('-amo.xpi'));
assert.ok(xpiAttachment, 'React XPI filename was not detected');
assert.equal(xpiAttachment.url, '');
assert.equal(xpiAttachment.messageId, messageId);
assert.equal(xpiAttachment.sandboxPath, 'sandbox:/mnt/data/chatgpt-queue-sender-firefox-v0.8.5-amo.xpi');
assert.equal(xpiAttachment.downloadable, true);

const sourceAttachment = attachments.find((item) => item.name.endsWith('-source.zip'));
assert.ok(sourceAttachment, 'React source ZIP filename was not detected');
assert.equal(sourceAttachment.fileId, 'asset_00000000REACTSOURCE1234567890');
assert.equal(sourceAttachment.messageId, messageId);
assert.ok(sourceAttachment.sandboxPaths.includes('sandbox:/mnt/data/chatgpt-queue-sender-firefox-v0.8.5-source.zip'));
assert.equal(sourceAttachment.downloadable, true);

const inferredTurn = new FakeElement('article', {
  innerText: 'ChatGPT Queue Sender Firefox v0.8.5\n完整原始碼 ZIP',
  attributes: { 'data-message-id': messageId },
});
inferredTurn.turn = inferredTurn;
inferredTurn.headings = [new FakeElement('h3', { textContent: 'ChatGPT Queue Sender Firefox v0.8.5' })];
const inferredButton = new FakeElement('button', {
  innerText: '完整原始碼 ZIP',
  attributes: { 'data-testid': 'download-artifact-button' },
});
inferredTurn.append(inferredButton);
const inferred = api.detectAttachments(inferredTurn, 'assistant');
assert.equal(inferred.length, 1, 'one React button with fallback names must remain one physical attachment');
assert.ok(inferred[0].sandboxPaths.length >= 2, 'fallback sandbox paths should be retained for resolver retries');
assert.equal(inferred[0].sandboxPaths.some((value) => value.includes('%')), false, 'inferred sandbox paths must remain raw before URLSearchParams encoding');
assert.equal(inferred[0].sourceKind, 'react-sandbox-button');

console.log(JSON.stringify({
  ok: true,
  reactOnlyFiles: attachments.map((item) => item.name),
  inferredCandidateCount: inferred.length,
  fallbackPaths: inferred[0].sandboxPaths.length,
}));
