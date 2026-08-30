import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
const storageData = {
  local: {
    cqs_notification_settings_v1: { enabled: true, desktop: true, sound: false, onlyWhenHidden: false },
  },
  session: {},
};

function makeStorageArea(areaName) {
  const data = storageData[areaName];
  return {
    async get(key) {
      if (key == null) return { ...data };
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.map((item) => [item, data[item]]));
    },
    async set(value) { Object.assign(data, value); },
    async remove(key) {
      for (const item of Array.isArray(key) ? key : [key]) delete data[item];
    },
  };
}

function bootBackground() {
  let messageListener = null;
  let clickListener = null;
  let tabRemovedListener = null;
  const created = [];
  const tabUpdates = [];
  const windowUpdates = [];

  const browser = {
    runtime: {
      getURL(path) { return `moz-extension://test/${path}`; },
      onMessage: { addListener(listener) { messageListener = listener; } },
    },
    storage: {
      local: makeStorageArea('local'),
      session: makeStorageArea('session'),
    },
    permissions: {
      async contains(details) { return details.permissions.includes('notifications'); },
      onAdded: { addListener() {} },
    },
    notifications: {
      async create(id, options) { created.push({ id, options }); return id; },
      async clear() { return true; },
      onClicked: { addListener(listener) { clickListener = listener; } },
    },
    tabs: {
      async get(id) { return { id, windowId: 9 }; },
      async update(id, details) { tabUpdates.push({ id, details }); },
      onRemoved: { addListener(listener) { tabRemovedListener = listener; } },
    },
    windows: {
      async update(id, details) { windowUpdates.push({ id, details }); },
    },
  };

  const globalObject = { browser };
  const context = vm.createContext({
    browser,
    globalThis: globalObject,
    console,
    Date,
    Number,
    String,
    Promise,
    Object,
    RegExp,
    setTimeout,
    clearTimeout,
  });
  globalObject.globalThis = globalObject;
  vm.runInContext(code, context);

  if (typeof messageListener !== 'function') throw new Error('runtime message listener missing');
  if (typeof clickListener !== 'function') throw new Error('notification click listener missing');
  return {
    messageListener,
    clickListener,
    tabRemovedListener,
    created,
    tabUpdates,
    windowUpdates,
  };
}

let background = bootBackground();
storageData.local.cqs_queue_sender_state_v4 = {
  pausedReason: '',
  queue: [{ id: 'legacy-1', text: '舊版佇列', status: 'pending', submission: null }],
};
const scopedStorageKey = 'cqs_queue_sender_state_v5:conversation%3Alegacy-chat';
const migration = await background.messageListener({
  type: 'CQS_CLAIM_LEGACY_QUEUE',
  scopeKey: 'conversation:legacy-chat',
  storageKey: scopedStorageKey,
}, { tab: { id: 17 } });
if (!migration?.migrated) throw new Error('legacy queue was not migrated');
if (storageData.local.cqs_queue_sender_state_v4) throw new Error('legacy global queue key was not removed');
if (storageData.local[scopedStorageKey]?.queue?.[0]?.text !== '舊版佇列') throw new Error('migrated queue payload mismatch');

const contextResult = await background.messageListener({ type: 'CQS_GET_TAB_CONTEXT' }, { tab: { id: 17 } });
if (contextResult?.tabId !== 17) throw new Error('tab context did not return sender tab id');

const leaseA = await background.messageListener({ type: 'CQS_QUEUE_LEASE_ACQUIRE', scopeKey: 'conversation:A' }, { tab: { id: 17 } });
if (!leaseA?.ok || !leaseA.token) throw new Error('first tab could not acquire queue lease');
if (!storageData.session.cqs_queue_sender_session_leases_v1?.leases?.['conversation:A']) {
  throw new Error('queue lease was not persisted to storage.session');
}

// Simulate an MV3 background event-page restart while the browser session remains alive.
background = bootBackground();
const leaseBlockedAfterRestart = await background.messageListener(
  { type: 'CQS_QUEUE_LEASE_ACQUIRE', scopeKey: 'conversation:A' },
  { tab: { id: 18 } },
);
if (leaseBlockedAfterRestart?.ok !== false || leaseBlockedAfterRestart?.reason !== 'owned-by-another-tab') {
  throw new Error('persistent queue lease did not survive background restart');
}
const renewed = await background.messageListener(
  { type: 'CQS_QUEUE_LEASE_RENEW', scopeKey: 'conversation:A', token: leaseA.token },
  { tab: { id: 17 } },
);
if (!renewed?.ok) throw new Error('queue lease could not be renewed after background restart');

const transferred = await background.messageListener({
  type: 'CQS_QUEUE_LEASE_TRANSFER',
  fromScopeKey: 'conversation:A',
  toScopeKey: 'conversation:B',
  token: leaseA.token,
}, { tab: { id: 17 } });
if (!transferred?.ok) throw new Error('queue lease could not transfer after draft route change');
await background.messageListener({ type: 'CQS_QUEUE_LEASE_RELEASE', scopeKey: 'conversation:B', token: leaseA.token }, { tab: { id: 17 } });
const leaseAfterRelease = await background.messageListener({ type: 'CQS_QUEUE_LEASE_ACQUIRE', scopeKey: 'conversation:B' }, { tab: { id: 18 } });
if (!leaseAfterRelease?.ok) throw new Error('queue lease was not released');

// Closing the owner tab must clear its stored leases as well.
background.tabRemovedListener?.(18);
await new Promise((resolve) => setTimeout(resolve, 0));
const leaseAfterTabClose = await background.messageListener({ type: 'CQS_QUEUE_LEASE_ACQUIRE', scopeKey: 'conversation:B' }, { tab: { id: 19 } });
if (!leaseAfterTabClose?.ok) throw new Error('stored queue lease was not cleared after tab removal');

const result = await background.messageListener(
  { type: 'CQS_RESPONSE_COMPLETE', title: 'ChatGPT 回覆完成', message: '測試回覆內容' },
  { tab: { id: 17 } },
);
if (!result?.shown || background.created.length !== 1) throw new Error('completion notification was not created');
if (background.created[0].options.iconUrl !== 'moz-extension://test/icons/icon-128.png') throw new Error('notification icon mismatch');
if (!background.created[0].options.message.includes('測試回覆內容')) throw new Error('notification message mismatch');

await background.clickListener(background.created[0].id);
if (background.tabUpdates[0]?.id !== 17 || background.tabUpdates[0]?.details?.active !== true) throw new Error('notification click did not activate the source tab');
if (background.windowUpdates[0]?.id !== 9 || background.windowUpdates[0]?.details?.focused !== true) throw new Error('notification click did not focus the source window');

console.log(JSON.stringify({
  ok: true,
  created: background.created.length,
  focusedTab: 17,
  queueLeaseIsolation: true,
  persistentLeaseRestart: true,
}));
