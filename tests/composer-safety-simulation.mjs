import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}`);
  return source.slice(start, end);
}

function makeRect(top, left, width = 36, height = 36) {
  return { top, left, right: left + width, bottom: top + height, width, height };
}

class FakeButton {
  constructor({ label = '', testid = '', rect, parent = {}, preview = false } = {}) {
    this.dataset = { testid };
    this.parentElement = parent;
    this.textContent = label;
    this.rect = rect || makeRect(704, 18);
    this.preview = preview;
  }
  getAttribute(name) {
    if (name === 'aria-label') return this.textContent;
    if (name === 'title') return '';
    if (name === 'data-testid') return this.dataset.testid || '';
    return '';
  }
  getBoundingClientRect() { return this.rect; }
  closest(selector) {
    if (this.preview && /attachment-preview|file-preview|image-preview|attachment-chip/.test(selector)) return { preview: true };
    return null;
  }
}

const composerParent = {};
const plus = new FakeButton({ label: 'Add files and more', testid: 'composer-plus-btn', rect: makeRect(704, 18), parent: composerParent });
const removeImage = new FakeButton({ label: 'Remove image', testid: 'attachment-image-remove', rect: makeRect(630, 42), parent: {}, preview: true });
const genericAdd = new FakeButton({ label: 'Add files', testid: '', rect: makeRect(704, 20), parent: composerParent });
const input = { getBoundingClientRect: () => ({ top: 680, left: 70, right: 470, bottom: 740, width: 400, height: 60 }) };
const root = {
  getBoundingClientRect: () => ({ top: 620, left: 10, right: 500, bottom: 750, width: 490, height: 130 }),
  querySelectorAll(selector) {
    if (selector === 'button') return [removeImage, plus, genericAdd];
    return [];
  },
};

const placementContext = {
  console,
  normalizeText: (value) => String(value || '').replace(/\s+/g, ' ').trim(),
  getComposerRoot: () => root,
  getComposerInput: () => input,
  isVisible: () => true,
  byBottomMostVisible(selectors) {
    return selectors.some((selector) => selector.includes("composer-plus-btn")) ? plus : null;
  },
};
vm.createContext(placementContext);
vm.runInContext(`${sliceBetween('  function isAttachmentPreviewControl', '  function getComposerText')}\nthis.__anchor = getQueueAnchorButton; this.__isPreview = isAttachmentPreviewControl;`, placementContext);
assert.equal(placementContext.__isPreview(removeImage), true, 'uploaded image Remove control must be excluded');
assert.equal(placementContext.__isPreview(plus), false, 'composer plus control must never be treated as an attachment preview');
assert.equal(placementContext.__anchor(), plus, 'queue button must anchor to the stable composer-plus-btn even when image controls exist');

const status = {
  innerText: 'Working...',
  textContent: 'Working...',
  getAttribute(name) {
    if (name === 'class') return 'animate-[loading-shimmer_2.5s_linear_infinite]';
    if (name === 'aria-label') return '';
    return '';
  },
  matches(selector) { return selector.includes("[role='status']"); },
};
const turn = {
  querySelectorAll(selector) {
    if (selector.includes("[role='status']") || selector.includes("[class*='shimmer']")) return [status];
    return [];
  },
};
const busyContext = {
  console,
  window: { getComputedStyle: () => ({ animationName: 'loading-shimmer' }) },
  normalizeText: (value) => String(value || '').replace(/\s+/g, ' ').trim(),
  getLatestAssistantTurn: () => turn,
  byBottomMostVisible: () => null,
  isCqsUi: () => false,
  isVisible: () => true,
};
vm.createContext(busyContext);
vm.runInContext(`${sliceBetween('  function isLikelyActiveWorkText', '  function getIdleVoiceButton')}\nthis.__active = getActiveWorkIndicator; this.__workText = isLikelyActiveWorkText;`, busyContext);
assert.equal(busyContext.__workText('Working...'), true, 'English shimmer work text should be recognized');
assert.equal(busyContext.__workText('正在執行程式'), true, 'Chinese active work text should be recognized');
assert.equal(busyContext.__workText('Worked for 2 minutes'), false, 'completed past-tense status should not stay busy');
assert.equal(busyContext.__active(), status, 'animated Working status must keep the queue in busy state even if Send is visible');

const busyEvidenceSource = sliceBetween('  function hasBusyEvidence', '  function hasStrongIdleComposerControl');
const evidenceContext = {
  getNativeStopButton: () => null,
  getStreamingIndicator: () => null,
  getActiveWorkIndicator: () => status,
};
vm.createContext(evidenceContext);
vm.runInContext(`${busyEvidenceSource}\nthis.__busy = hasBusyEvidence;`, evidenceContext);
assert.equal(evidenceContext.__busy(), true, 'active work indicator must count as busy evidence without a Stop button');

assert.ok(source.includes("button[data-testid='copy-turn-action-button']"), 'strong assistant completion control is missing');
assert.ok(source.includes('now - lastAssistantChangeAt >= 12000'), 'conservative 12-second no-copy stability fallback is missing');
assert.ok(source.includes('assistantSignatureBefore: getLastAssistantSignature()'), 'pre-submit assistant signature snapshot is missing');
assert.ok(source.includes('getLatestConversationRole'), 'latest conversation role guard is missing');
assert.ok(source.includes('const conversationSettled = latestRole !== "user" && assistantSettled;'), 'pre-send active conversation guard is missing');

console.log(JSON.stringify({
  ok: true,
  busyWithoutStopDetected: true,
  stableComposerPlusAnchor: true,
  imagePreviewExcluded: true,
  completionGuard: 'copy-action-or-12s-stability',
}));
