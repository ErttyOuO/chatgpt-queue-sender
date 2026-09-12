import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const start = source.indexOf('  async function finishDictationBeforeQueue');
const end = source.indexOf('\n  function hasBusyEvidence', start);
assert.ok(start >= 0 && end > start, 'could not isolate dictation finalization source');
const fnSource = source.slice(start, end);

let now = 0;
let active = true;
let transcribing = false;
let composerText = '';
let commitClicks = 0;
const toasts = [];

class FakeDate extends Date {
  static now() { return now; }
}

const commit = {
  disabled: false,
  getAttribute() { return null; },
  click() {
    commitClicks += 1;
    active = false;
    transcribing = true;
  },
};

const context = {
  console,
  Date: FakeDate,
  state: { dictationFinalizing: false },
  tr: (_zh, en) => en,
  normalizeText: (value) => String(value || '').replace(/\s+/g, ' ').trim(),
  getActiveDictationControl: () => (active ? { active: true } : null),
  getDictationCommitButton: () => commit,
  getTranscriptionIndicator: () => (transcribing ? { transcribing: true } : null),
  isDisabled: (button) => Boolean(button?.disabled),
  getComposerText: () => composerText,
  showToast: (message) => toasts.push(String(message || '')),
  wait: async (ms) => {
    now += Number(ms || 0);
    if (now >= 480 && !composerText) composerText = 'transcribed speech';
    if (now >= 720) transcribing = false;
  },
};
vm.createContext(context);
vm.runInContext(`${fnSource}\nthis.__finish = finishDictationBeforeQueue;`, context, { filename: 'dictation-finalization.js' });

const result = await context.__finish(5000);
assert.equal(result.ok, true, 'dictation should finish before queueing');
assert.equal(result.active, true);
assert.equal(commitClicks, 1, 'Submit/finish dictation should be clicked exactly once');
assert.equal(composerText, 'transcribed speech', 'transcript must land in the composer before queue continuation');
assert.equal(context.state.dictationFinalizing, false, 'finalizing lock should be released');
assert.ok(toasts.some((value) => /waiting for the transcript/i.test(value)), 'dictation wait feedback is missing');

active = false;
transcribing = false;
composerText = 'already typed';
commitClicks = 0;
const idleResult = await context.__finish(5000);
assert.equal(idleResult.ok, true);
assert.equal(idleResult.active, false);
assert.equal(commitClicks, 0, 'idle composer must not click dictation controls');

assert.ok(source.includes("button[aria-label='Submit dictation']"), 'current ChatGPT Submit dictation selector is missing');
assert.ok(source.includes("button[aria-label*='Cancel dictation']"), 'dictation active-state selector is missing');
assert.ok(source.includes('const dictation = await finishDictationBeforeQueue();'), 'queue action must await dictation finalization');
assert.ok(source.includes('await openSchedulePanel();'), 'scheduled-send long press should open only after dictation handling');

console.log(JSON.stringify({
  ok: true,
  submitDictationBeforeQueue: true,
  waitsForTranscript: true,
  idleComposerUnaffected: true,
  longPressUsesSameGuard: true,
}));
