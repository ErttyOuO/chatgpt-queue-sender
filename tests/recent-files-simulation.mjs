import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../export/recent-files.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = { ...attrs };
    this.parentElement = null;
    this.children = [];
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  getClientRects() { return [{}]; }
  closest(selector) {
    if (selector.includes('#cqs-export-control') || selector.includes('#cqs-export-modal')) return null;
    if (selector.includes("[data-testid^='conversation-turn-']") || selector.includes('article') || selector.includes('[data-turn]')) {
      let node = this;
      while (node) {
        if (node.tagName === 'ARTICLE') return node;
        node = node.parentElement;
      }
    }
    return null;
  }
  querySelector() { return null; }
  append(child) { child.parentElement = this; this.children.push(child); }
}

const turn = new FakeElement('article');
const assistantRole = new FakeElement('div', { 'data-message-author-role': 'assistant' });
turn.append(assistantRole);
const nativeFileButton = new FakeElement('button');
turn.append(nativeFileButton);
let generation = { active: true, startedAt: 1_000, assistantSeen: false };
let collectCalls = 0;

const document = {
  readyState: 'loading',
  querySelectorAll(selector) {
    if (selector === "[data-message-author-role='assistant']") return [assistantRole];
    return [];
  },
  addEventListener() {},
};

const context = {
  window: {},
  globalThis: null,
  document,
  Element: FakeElement,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  setTimeout,
  clearTimeout,
  setInterval: () => 1,
  clearInterval() {},
  MutationObserver: class { observe() {} disconnect() {} },
  console,
  Date,
  CQS_I18N: { t: (zh, en, values = {}) => String(en).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`) },
};
context.globalThis = context;
context.window = context;
context.window.__CQS_QUEUE_API__ = { getGenerationStatus: () => ({ ...generation }) };
context.window.__CQS_DIRECT_DOWNLOAD__ = {
  collectCandidateButtons(root) {
    collectCalls += 1;
    assert.equal(root, turn);
    return [nativeFileButton];
  },
  isAssistantCitation() { return true; },
};

vm.runInNewContext(source, context, { filename: 'recent-files.js' });
const api = context.window.__CQS_RECENT_FILES__;
assert.ok(api, 'recent-files API missing');

assert.equal(api.fileExtension('consulting_v2.pdf'), 'pdf');
assert.equal(api.fileKind('pdf'), 'pdf');
assert.equal(api.fileAccent('pdf'), '#ff453a', 'PDF should use a red first-impression outline');
assert.equal(api.fileKind('md'), 'markdown');
assert.equal(api.fileAccent('markdown'), '#f2f2f7', 'Markdown should use a white/light first-impression outline');
assert.equal(api.fileKind('docx'), 'word');
assert.equal(api.fileAccent('word'), '#0a84ff', 'DOCX should use a blue first-impression outline');
assert.equal(api.fileKind('xlsx'), 'spreadsheet');
assert.equal(api.fileKind('zip'), 'archive');
assert.equal(api.formatExtension('notes.markdown'), 'MD', 'extension label should stay compact');
assert.equal(api.formatElapsed(0), '00:00');
assert.equal(api.formatElapsed(67_000), '01:07');
assert.equal(api.formatElapsed(3_661_000), '01:01:01');
assert.match(api.shortBaseName('this_is_a_very_very_long_report_filename_for_testing.docx'), /…/, 'long filenames should be compacted');

let collected = api.collectLatestButtons();
assert.equal(collected.buttons.length, 0, 'previous-response files must be hidden before the current assistant turn appears');
assert.equal(collectCalls, 0, 'old assistant files should not be scanned while the new response has not appeared');

generation = { active: true, startedAt: 1_000, assistantSeen: true };
collected = api.collectLatestButtons();
assert.equal(collected.buttons.length, 1, 'current assistant files should be shown during generation once the assistant turn exists');
assert.equal(collected.buttons[0], nativeFileButton);
assert.equal(collectCalls, 1);

generation = { active: false, startedAt: 0, assistantSeen: false };
collected = api.collectLatestButtons();
assert.equal(collected.buttons.length, 1, 'latest assistant files should remain visible after generation completes');

console.log(JSON.stringify({
  ok: true,
  pdfRed: true,
  markdownWhite: true,
  docxBlue: true,
  compactFilename: true,
  generationTimerFormatting: true,
  oldFilesSuppressedDuringNewGeneration: true,
  latestFilesRemainAfterCompletion: true,
}));
