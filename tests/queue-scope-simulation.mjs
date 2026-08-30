import fs from 'node:fs';
import vm from 'node:vm';

const content = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const start = content.indexOf('  function getConversationId(');
const end = content.indexOf('  async function storageReadKey(', start);
if (start < 0 || end < 0) throw new Error('queue scope helpers not found in content.js');
const helpers = content.slice(start, end);

function makeContext(pathname, tabId) {
  const context = vm.createContext({
    location: { pathname },
    state: { tabId, scopeKey: '' },
    String,
    Number,
    encodeURIComponent,
    STORE_PREFIX: 'cqs_queue_sender_state_v5:',
  });
  vm.runInContext(`${helpers}\nthis.scopeApi = { getConversationId, getScopeKeyForLocation, getScopedStorageKey, isDraftScope, isConversationScope };`, context);
  return context.scopeApi;
}

const existing = makeContext('/c/6a5de47e-7c04-83ee-b5d1-944e8e637b92', 12);
if (existing.getConversationId() !== '6a5de47e-7c04-83ee-b5d1-944e8e637b92') throw new Error('conversation ID extraction failed');
if (existing.getScopeKeyForLocation() !== 'conversation:6a5de47e-7c04-83ee-b5d1-944e8e637b92') throw new Error('conversation scope key failed');
if (existing.getScopedStorageKey(existing.getScopeKeyForLocation()) !== 'cqs_queue_sender_state_v5:conversation%3A6a5de47e-7c04-83ee-b5d1-944e8e637b92') throw new Error('scoped storage key failed');

const customGpt = makeContext('/g/g-abc123/c/conversation-987654321', 13);
if (customGpt.getConversationId() !== 'conversation-987654321') throw new Error('nested custom GPT conversation route failed');

const draftOne = makeContext('/', 21);
const draftTwo = makeContext('/', 22);
if (draftOne.getScopeKeyForLocation() !== 'draft-tab:21') throw new Error('draft tab scope failed');
if (draftTwo.getScopeKeyForLocation() !== 'draft-tab:22') throw new Error('draft tab isolation failed');
if (draftOne.getScopeKeyForLocation() === draftTwo.getScopeKeyForLocation()) throw new Error('two new-chat tabs share a draft scope');
if (!draftOne.isDraftScope('draft-tab:21') || !existing.isConversationScope(existing.getScopeKeyForLocation())) throw new Error('scope type helpers failed');


const readyStart = content.indexOf('  function queueScopeReadyForInput(');
const readyEnd = content.indexOf('  async function ensureQueueScopeReadyForInput(', readyStart);
if (readyStart < 0 || readyEnd < 0) throw new Error('queue scope readiness helper missing');
const readyHelper = content.slice(readyStart, readyEnd);
function scopeReady(pathname, scopeKey, initialized = true, scopeSwitching = false, tabId = 21) {
  const context = vm.createContext({
    location: { pathname },
    state: { initialized, scopeSwitching, scopeKey, tabId },
    String,
    Number,
  });
  vm.runInContext(`${helpers}\n${readyHelper}\nthis.ready = queueScopeReadyForInput();`, context);
  return context.ready;
}
if (!scopeReady('/', 'draft-tab:21')) throw new Error('matching draft scope should be ready');
if (scopeReady('/c/ABCDEFGH12345678', 'draft-tab:21')) throw new Error('route-change race was not blocked');
if (scopeReady('/c/ABCDEFGH12345678', 'conversation:ABCDEFGH12345678', true, true)) throw new Error('scope switching state was not blocked');
if (!content.includes('async enqueueTextAsync(text, options = {})')) throw new Error('async scope-safe enqueue API missing');

const unrelated = makeContext('/share/abcdef123456', 30);
if (unrelated.getConversationId() !== '') throw new Error('non-conversation route was treated as a conversation');

console.log(JSON.stringify({
  ok: true,
  conversationScope: existing.getScopeKeyForLocation(),
  draftScopes: [draftOne.getScopeKeyForLocation(), draftTwo.getScopeKeyForLocation()],
}));
