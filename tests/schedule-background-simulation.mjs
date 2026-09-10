import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
const storageData = { local: {}, session: {} };

function makeEvent() {
  let listener = null;
  return {
    api: { addListener(fn) { listener = fn; } },
    fire(...args) { return listener?.(...args); },
    get listener() { return listener; },
  };
}

function makeStorageArea(area) {
  const data = storageData[area];
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

function boot({ contentResult = { ok: true, submittedAt: Date.now() }, tabUrl = 'https://chatgpt.com/c/schedule-chat-12345678' } = {}) {
  const runtimeMessage = makeEvent();
  const alarmEvent = makeEvent();
  const notificationClick = makeEvent();
  const tabRemoved = makeEvent();
  const permissionsAdded = makeEvent();
  const alarms = new Map();
  const notifications = [];
  const sentMessages = [];
  const tabs = new Map([[77, { id: 77, windowId: 4, active: false, url: tabUrl, title: 'Scheduled chat' }]]);

  const browser = {
    runtime: {
      getURL(path) { return `moz-extension://schedule-test/${path}`; },
      onMessage: runtimeMessage.api,
      onConnect: { addListener() {} },
    },
    storage: {
      local: makeStorageArea('local'),
      session: makeStorageArea('session'),
    },
    permissions: {
      async contains() { return true; },
      onAdded: permissionsAdded.api,
    },
    notifications: {
      async create(id, options) { notifications.push({ id, options }); return id; },
      async clear() { return true; },
      onClicked: notificationClick.api,
    },
    alarms: {
      async create(name, info) { alarms.set(name, { name, scheduledTime: info.when }); },
      async clear(name) { return alarms.delete(name); },
      async getAll() { return [...alarms.values()]; },
      onAlarm: alarmEvent.api,
    },
    tabs: {
      async get(id) {
        const tab = tabs.get(id);
        if (!tab) throw new Error('tab not found');
        return { ...tab };
      },
      async query() { return [...tabs.values()].map((tab) => ({ ...tab })); },
      async sendMessage(id, message) {
        sentMessages.push({ id, message });
        if (!tabs.has(id)) throw new Error('no receiver');
        return typeof contentResult === 'function' ? contentResult(id, message) : contentResult;
      },
      async update(id, details) {
        const tab = tabs.get(id);
        if (tab) Object.assign(tab, details);
      },
      onRemoved: tabRemoved.api,
    },
    windows: { async update() {} },
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
    URL,
    Set,
    Math,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    AbortController,
    fetch: async () => { throw new Error('not used'); },
  });
  globalObject.globalThis = globalObject;
  vm.runInContext(code, context);
  return { runtimeMessage, alarmEvent, notifications, alarms, sentMessages, tabs };
}

function scheduledItems() {
  return storageData.local.cqs_scheduled_messages_v1?.items || [];
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 15));
}

storageData.local = {};
storageData.session = {};
let env = boot();
await flush();
if (typeof env.runtimeMessage.listener !== 'function') throw new Error('runtime listener missing');
if (typeof env.alarmEvent.listener !== 'function') throw new Error('alarm listener missing');

const scheduledAt = Date.now() + 60_000;
const created = await env.runtimeMessage.fire({
  type: 'CQS_SCHEDULE_CREATE',
  text: '晚上七點自動送出這一則',
  scheduledAt,
  scopeKey: 'conversation:schedule-chat-12345678',
  timeZone: 'Asia/Taipei',
}, { tab: { id: 77, url: 'https://chatgpt.com/c/schedule-chat-12345678', title: 'Scheduled chat' } });
if (!created?.ok || !created.item?.id) throw new Error('schedule creation failed');
if (scheduledItems().length !== 1) throw new Error('scheduled item was not persisted');
const alarmName = `cqs-schedule:${created.item.id}`;
if (env.alarms.get(alarmName)?.scheduledTime !== scheduledAt) throw new Error('one-shot absolute alarm was not created');

const listed = await env.runtimeMessage.fire({ type: 'CQS_SCHEDULE_LIST', scopeKey: 'conversation:schedule-chat-12345678' }, { tab: { id: 77 } });
if (listed?.items?.length !== 1 || listed.items[0].text !== '晚上七點自動送出這一則') throw new Error('schedule list mismatch');

// Fire while the target tab is in the background (active:false). It must still send.
env.alarmEvent.fire({ name: alarmName, scheduledTime: scheduledAt });
await flush();
if (env.sentMessages.length !== 1 || env.sentMessages[0].id !== 77) throw new Error('background tab did not receive scheduled send');
if (env.sentMessages[0].message.type !== 'CQS_SCHEDULE_FIRE') throw new Error('wrong content message type');
if (scheduledItems().length !== 0) throw new Error('one-shot schedule was not removed after success');
if (!env.notifications.some((n) => n.id.startsWith('cqs-schedule-start-77-'))) throw new Error('trigger notification missing');
if (!env.notifications.some((n) => n.id.startsWith('cqs-schedule-success-77-'))) throw new Error('success notification missing');

// Cancellation clears both storage and the alarm.
const cancelAt = Date.now() + 120_000;
const cancelCreated = await env.runtimeMessage.fire({
  type: 'CQS_SCHEDULE_CREATE',
  text: '這一則要取消',
  scheduledAt: cancelAt,
  scopeKey: 'conversation:schedule-chat-12345678',
}, { tab: { id: 77, url: 'https://chatgpt.com/c/schedule-chat-12345678' } });
const cancelAlarm = `cqs-schedule:${cancelCreated.item.id}`;
const canceled = await env.runtimeMessage.fire({ type: 'CQS_SCHEDULE_CANCEL', id: cancelCreated.item.id, scopeKey: 'conversation:schedule-chat-12345678' }, { tab: { id: 77 } });
if (!canceled?.ok || env.alarms.has(cancelAlarm) || scheduledItems().some((item) => item.id === cancelCreated.item.id)) throw new Error('schedule cancellation failed');

// Draft schedule must migrate to the real conversation scope when the tab gains a conversation ID.
const draftCreated = await env.runtimeMessage.fire({
  type: 'CQS_SCHEDULE_CREATE',
  text: 'draft migration',
  scheduledAt: Date.now() + 180_000,
  scopeKey: 'draft-tab:77',
}, { tab: { id: 77, url: 'https://chatgpt.com/' } });
if (!draftCreated?.ok) throw new Error('draft schedule creation failed');
const transferred = await env.runtimeMessage.fire({
  type: 'CQS_SCHEDULE_SCOPE_TRANSFER',
  fromScopeKey: 'draft-tab:77',
  toScopeKey: 'conversation:new-chat-87654321',
}, { tab: { id: 77, url: 'https://chatgpt.com/c/new-chat-87654321' } });
if (!transferred?.ok || !transferred.changed) throw new Error('scheduled draft scope did not migrate');
const migrated = scheduledItems().find((item) => item.id === draftCreated.item.id);
if (migrated?.scopeKey !== 'conversation:new-chat-87654321' || migrated?.conversationId !== 'new-chat-87654321') throw new Error('migrated schedule payload mismatch');
await env.runtimeMessage.fire({ type: 'CQS_SCHEDULE_CANCEL', id: draftCreated.item.id, scopeKey: 'conversation:new-chat-87654321' }, { tab: { id: 77 } });

// If the target conversation is no longer open, a one-shot task fails and notifies instead of sending elsewhere.
env = boot({ tabUrl: 'https://chatgpt.com/c/different-chat-99999999' });
await flush();
const failedCreated = await env.runtimeMessage.fire({
  type: 'CQS_SCHEDULE_CREATE',
  text: '不可以送錯聊天室',
  scheduledAt: Date.now() + 60_000,
  scopeKey: 'conversation:target-chat-11223344',
}, { tab: { id: 77, url: 'https://chatgpt.com/c/target-chat-11223344' } });
const failedAlarm = `cqs-schedule:${failedCreated.item.id}`;
env.alarmEvent.fire({ name: failedAlarm, scheduledTime: failedCreated.item.scheduledAt });
await flush();
if (env.sentMessages.length !== 0) throw new Error('schedule was sent to the wrong conversation');
if (!env.notifications.some((n) => n.id.startsWith('cqs-schedule-failed-77-'))) throw new Error('failure notification missing');
if (scheduledItems().some((item) => item.id === failedCreated.item.id)) throw new Error('failed one-shot schedule was not removed');

console.log(JSON.stringify({
  ok: true,
  absoluteOneShotAlarm: true,
  backgroundTabSend: true,
  successAndFailureNotifications: true,
  cancellation: true,
  draftScopeMigration: true,
  wrongConversationBlocked: true,
}));
