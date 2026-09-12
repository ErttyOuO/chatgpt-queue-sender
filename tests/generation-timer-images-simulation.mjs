import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const contentSource = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const recentSource = fs.readFileSync(new URL('../export/recent-files.js', import.meta.url), 'utf8');

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}`);
  return source.slice(start, end);
}

// 1) Generation cycle timestamp survives a monitor reset when a draft route becomes a conversation.
const monitorState = {
  responseMonitor: {
    initialized: true,
    path: '/',
    lastUserCount: 1,
    lastAssistantCount: 0,
    lastAssistantSignature: '',
    pendingUser: true,
    pendingUserAt: 10_000,
    active: true,
    activitySeen: true,
    assistantSeen: false,
    stableIdleTicks: 0,
    cycleStartedAt: 12_345,
    lastAssistantChangeAt: 13_000,
    lastCompletedAt: 0,
  },
};
const resetContext = {
  state: monitorState,
  location: { pathname: '/c/new-conversation' },
  getConversationCounts: () => ({ user: 1, assistant: 0 }),
  getLastAssistantSignature: () => '',
  hasBusyEvidence: () => true,
  Date,
};
vm.createContext(resetContext);
vm.runInContext(`${between(contentSource, '  function resetResponseMonitor', '  function responseMonitorTick')}
this.__reset = resetResponseMonitor;`, resetContext);
resetContext.__reset({ keepBusy: true, preserveCycle: true });
assert.equal(monitorState.responseMonitor.cycleStartedAt, 12_345, 'preserved generation cycle must not reset its elapsed start time');

// Source guards: a new user turn owns the new timestamp; transient busy work may only fill an empty timestamp.
assert.ok(contentSource.includes('monitor.cycleStartedAt = now;\n      monitor.lastCompletedAt = 0;'), 'new user turn must establish a fresh generation start time');
assert.ok(contentSource.includes('if (!monitor.cycleStartedAt) monitor.cycleStartedAt = now;'), 're-entering busy state must not overwrite an existing cycle start');
assert.ok(!contentSource.includes('monitor.cycleStartedAt = 0;\n          monitor.lastAssistantChangeAt = 0;'), 'completion must not erase the current turn start time before a possible same-turn file-processing phase');

// 2) A top-level file organization status outside the assistant turn is recognized as active work.
class StatusElement {
  constructor(text) { this.innerText = text; this.textContent = text; }
  getAttribute(name) { return name === 'class' ? 'animate-pulse' : ''; }
  matches(selector) { return selector.includes("[role='status']"); }
}
const fileStatus = new StatusElement('正在整理檔案…');
const workContext = {
  console,
  window: { getComputedStyle: () => ({ animationName: 'pulse' }) },
  document: { querySelectorAll: () => [fileStatus] },
  normalizeText: (value) => String(value || '').replace(/\s+/g, ' ').trim(),
  getLatestAssistantTurn: () => null,
  byBottomMostVisible: () => null,
  isCqsUi: () => false,
  isVisible: () => true,
};
vm.createContext(workContext);
vm.runInContext(`${between(contentSource, '  function isLikelyActiveWorkText', '  function getIdleVoiceButton')}
this.__fileWork = isLikelyFileWorkText; this.__active = getActiveWorkIndicator;`, workContext);
assert.equal(workContext.__fileWork('正在整理檔案…'), true, 'Chinese file-organization status should be recognized');
assert.equal(workContext.__fileWork('Organizing files…'), true, 'English file-organization status should be recognized');
assert.equal(workContext.__active(), fileStatus, 'global file-organization status must keep generation active even outside the latest assistant turn');

// 3) Generated assistant images enter the latest-asset rail and download through the existing Firefox background path.
class FakeElement {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = { ...attrs };
    this.parentElement = null;
    this.children = [];
    this.currentSrc = attrs.src || '';
    this.naturalWidth = Number(attrs.width || 0);
    this.naturalHeight = Number(attrs.height || 0);
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  getClientRects() { return [{}]; }
  closest(selector) {
    if (selector.includes('#cqs-export-control') || selector.includes('#cqs-export-modal')) return null;
    if (selector.includes('[data-message-author-role]')) {
      let node = this;
      while (node) {
        if (node.attrs?.['data-message-author-role']) return node;
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
    }
    return null;
  }
  querySelector(selector) {
    if (selector === "[data-message-author-role='assistant']") return this.children.find((child) => child.attrs?.['data-message-author-role'] === 'assistant') || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === 'img[src]') return this.children.filter((child) => child.tagName === 'IMG');
    return [];
  }
  append(child) { child.parentElement = this; this.children.push(child); }
}

const turn = new FakeElement('article');
const assistantRole = new FakeElement('div', { 'data-message-author-role': 'assistant' });
turn.append(assistantRole);
const image = new FakeElement('img', {
  alt: '已產生圖像：深色背景上的極簡應用程式底座圖示',
  width: '1254',
  height: '1254',
  src: 'https://chatgpt.com/backend-api/estuary/content?id=file_00000000dc9881f5b0426474e89bc06c&ts=496981&p=fs&sig=test&v=0',
});
image.parentElement = assistantRole;
// The image is visually inside the same assistant turn; expose it via the turn query.
turn.children.push(image);

const statusEvents = [];
let downloadMessage = null;
const document = {
  readyState: 'loading',
  querySelectorAll(selector) {
    if (selector === "[data-message-author-role='assistant']") return [assistantRole];
    return [];
  },
  addEventListener() {},
  dispatchEvent(event) { statusEvents.push(event); return true; },
};
class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
const recentContext = {
  window: {},
  globalThis: null,
  document,
  Element: FakeElement,
  CustomEvent: FakeCustomEvent,
  location: { href: 'https://chatgpt.com/c/image-test', origin: 'https://chatgpt.com' },
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  setTimeout,
  clearTimeout,
  setInterval: () => 1,
  clearInterval() {},
  MutationObserver: class { observe() {} disconnect() {} },
  console,
  Date,
  URL,
  browser: { runtime: { async sendMessage(message) { downloadMessage = message; return { ok: true, filename: 'generated.png' }; } } },
  CQS_I18N: { t: (zh, en, values = {}) => String(en || zh).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`) },
};
recentContext.globalThis = recentContext;
recentContext.window = recentContext;
recentContext.window.__CQS_QUEUE_API__ = { getGenerationStatus: () => ({ active: true, startedAt: 10_000, assistantSeen: true }) };
recentContext.window.__CQS_DIRECT_DOWNLOAD__ = { collectCandidateButtons: () => [], isAssistantCitation: () => true };
recentContext.window.__CQS_CONVERSATION_API__ = {
  getConversationId: () => 'image-test',
  getDownloadContext: async () => ({ conversationId: 'image-test', accessToken: 'token', accountId: 'account' }),
};

vm.createContext(recentContext);
vm.runInContext(recentSource, recentContext, { filename: 'recent-files.js' });
const recentApi = recentContext.window.__CQS_RECENT_FILES__;
assert.ok(recentApi, 'recent-files API missing');
assert.equal(recentApi.imageFileId(image.currentSrc), 'file_00000000dc9881f5b0426474e89bc06c');
assert.equal(recentApi.isGeneratedAssistantImage(image, turn), true, 'generated estuary image should be recognized');
const images = recentApi.collectLatestImages(turn);
assert.equal(images.length, 1, 'generated assistant image should enter latest assets');
const entry = recentApi.imageEntry(image);
assert.equal(entry.extension, 'img');
assert.equal(entry.imageDownload, true);
assert.equal(recentApi.fileKind(entry.extension), 'image');
await recentApi.triggerDownload(entry);
assert.equal(downloadMessage?.type, 'CQS_DIRECT_DOWNLOAD');
assert.equal(downloadMessage?.fileId, 'file_00000000dc9881f5b0426474e89bc06c');
assert.equal(downloadMessage?.url, image.currentSrc);
assert.ok(statusEvents.some((event) => event.type === 'cqs:direct-download-status' && event.detail?.kind === 'success'), 'image download success status missing');

console.log(JSON.stringify({
  ok: true,
  timerStartPreservedAcrossRouteAndUiRefresh: true,
  fileOrganizationKeepsTimerActive: true,
  generatedAssistantImagesDetected: true,
  generatedImageDirectDownload: true,
}));
