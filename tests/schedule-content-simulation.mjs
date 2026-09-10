import fs from 'node:fs';
import vm from 'node:vm';

const full = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const start = full.indexOf('  async function sendScheduledText(payload) {');
const end = full.indexOf('  async function sendOne(item) {', start);
if (start < 0 || end <= start) throw new Error('could not isolate sendScheduledText');
const functionSource = full.slice(start, end);

function makeContext(options = {}) {
  const calls = [];
  const state = {
    initialized: true,
    scopeKey: 'conversation:schedule-chat-12345678',
    running: Boolean(options.running),
    scheduledSendActive: false,
    queue: options.queue || [],
    pausedReason: '',
  };
  let composerText = String(options.composerText || '');
  let scope = String(options.scope || state.scopeKey);
  const context = {
    console,
    state,
    tr: (zh, en, values = {}) => String(en || zh).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => values[k] ?? m),
    waitFor: async (fn, _timeout, error) => {
      const value = fn();
      if (value) return value;
      throw new Error(error);
    },
    switchQueueScopeIfNeeded: async () => {},
    getScopeKeyForLocation: () => scope,
    getComposerInput: () => ({ id: 'composer' }),
    waitUntilReadyBeforeSend: async () => {
      calls.push('wait-ready');
      if (options.readyError) throw new Error(options.readyError);
    },
    normalizeText: (value) => String(value || '').replace(/\s+/g, ' ').trim(),
    getComposerText: () => composerText,
    acquireQueueLease: async () => options.leaseOk === false ? { ok: false } : { ok: true },
    setComposerText: (text) => {
      calls.push(['set', text]);
      composerText = text;
      return { id: 'input' };
    },
    wait: async () => {},
    clearComposerIfMatches: (text) => {
      if (composerText.trim() === String(text).trim()) {
        calls.push(['clear', text]);
        composerText = '';
      }
    },
    makeSubmissionSnapshot: () => ({ userCountBefore: 1, assistantCountBefore: 1, submittedAt: Date.now() }),
    getSendButton: () => ({ click() { calls.push('click'); composerText = ''; } }),
    waitForSubmissionConfirmed: async () => { calls.push('confirmed'); },
    releaseQueueLease: async () => { calls.push('release'); },
    requestAutoRun: () => { calls.push('autorun'); },
    renderUi: () => { calls.push('render'); },
    setTimeout: (fn) => { fn(); return 1; },
    Date,
    String,
    Promise,
    Object,
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource}\nthis.__sendScheduledText = sendScheduledText;`, context);
  return { context, calls, state, setScope(value) { scope = value; } };
}

let env = makeContext();
let result = await env.context.__sendScheduledText({
  text: '定時送出內容',
  scopeKey: 'conversation:schedule-chat-12345678',
});
if (!result?.ok) throw new Error(`success path failed: ${result?.message}`);
if (!env.calls.some((call) => Array.isArray(call) && call[0] === 'set' && call[1] === '定時送出內容')) throw new Error('scheduled text was not inserted');
if (!env.calls.includes('click') || !env.calls.includes('confirmed') || !env.calls.includes('release')) throw new Error('scheduled submission sequence incomplete');
if (env.state.scheduledSendActive) throw new Error('scheduledSendActive was not cleared');

// A manual draft must never be overwritten.
env = makeContext({ composerText: '我的手動草稿' });
result = await env.context.__sendScheduledText({ text: '不可覆蓋', scopeKey: 'conversation:schedule-chat-12345678' });
if (result?.ok || !String(result?.message).includes('unsent text')) throw new Error('manual draft guard failed');
if (env.calls.some((call) => Array.isArray(call) && call[0] === 'set')) throw new Error('manual draft was overwritten');

// An active queue must block the scheduled task.
env = makeContext({ running: true });
result = await env.context.__sendScheduledText({ text: '不可插隊', scopeKey: 'conversation:schedule-chat-12345678' });
if (result?.ok || !String(result?.message).includes('already running')) throw new Error('active queue guard failed');

// Wrong conversation must fail before touching the composer.
env = makeContext({ scope: 'conversation:different-chat-99999999' });
result = await env.context.__sendScheduledText({ text: '不可送錯聊天室', scopeKey: 'conversation:schedule-chat-12345678' });
if (result?.ok || !String(result?.message).includes('another conversation')) throw new Error('wrong conversation guard failed');
if (env.calls.some((call) => Array.isArray(call) && call[0] === 'set')) throw new Error('wrong conversation touched the composer');

// Another tab holding the lease must block submission.
env = makeContext({ leaseOk: false });
result = await env.context.__sendScheduledText({ text: '租約衝突', scopeKey: 'conversation:schedule-chat-12345678' });
if (result?.ok || !String(result?.message).includes('another tab')) throw new Error('lease conflict guard failed');
if (env.calls.some((call) => Array.isArray(call) && call[0] === 'set')) throw new Error('lease conflict touched the composer');

console.log(JSON.stringify({
  ok: true,
  submissionConfirmed: true,
  manualDraftProtected: true,
  activeQueueBlocked: true,
  wrongConversationBlocked: true,
  multiTabLeaseBlocked: true,
}));
