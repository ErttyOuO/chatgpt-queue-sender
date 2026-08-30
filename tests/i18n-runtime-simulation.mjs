import fs from 'node:fs';
import vm from 'node:vm';

const i18nCode = fs.readFileSync(new URL('../i18n.js', import.meta.url), 'utf8');
const backgroundCode = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');

async function run(language) {
  let messageListener = null;
  const created = [];
  const storageData = {
    cqs_notification_settings_v1: { enabled: true, desktop: true, sound: false, onlyWhenHidden: false },
  };
  const browser = {
    i18n: { getUILanguage: () => language },
    runtime: {
      getURL: (value) => `moz-extension://test/${value}`,
      onMessage: { addListener(listener) { messageListener = listener; } },
    },
    storage: {
      local: {
        async get(key) {
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(keys.map((item) => [item, storageData[item]]));
        },
        async set(value) { Object.assign(storageData, value); },
        async remove() {},
      },
    },
    permissions: { async contains() { return true; } },
    notifications: {
      async create(id, options) { created.push({ id, options }); return id; },
      async clear() { return true; },
      onClicked: { addListener() {} },
    },
    tabs: { async get() { return { id: 1, windowId: 1 }; }, async update() {} },
    windows: { async update() {} },
  };
  const sandbox = { browser, navigator: { language }, console, Date, Intl, Number, String, Promise, Object, RegExp, Map, URL, AbortController, DOMException, crypto: globalThis.crypto };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(i18nCode, sandbox, { filename: 'i18n.js' });
  vm.runInContext(backgroundCode, sandbox, { filename: 'background.js' });
  if (typeof messageListener !== 'function') throw new Error('Background message listener was not registered');
  await messageListener({ type: 'CQS_RESPONSE_COMPLETE' }, { tab: { id: 1 } });
  await messageListener({ type: 'CQS_TEST_NOTIFICATION' }, { tab: { id: 1 } });
  return created.map(({ options }) => ({ title: options.title, message: options.message }));
}

const english = await run('en-GB');
if (english[0]?.title !== 'ChatGPT response complete') throw new Error(`English completion title mismatch: ${english[0]?.title}`);
if (english[0]?.message !== 'ChatGPT has finished this response.') throw new Error(`English completion message mismatch: ${english[0]?.message}`);
if (!english[1]?.message.startsWith('Test successful.')) throw new Error('English test notification mismatch');

const japanese = await run('ja-JP');
if (japanese[0]?.title !== 'ChatGPT response complete') throw new Error('Non-Chinese Firefox did not use English notification text');
if (!japanese[1]?.message.startsWith('Test successful.')) throw new Error('English fallback test notification mismatch');

const chinese = await run('zh-CN');
if (chinese[0]?.title !== 'ChatGPT 回覆完成') throw new Error('Chinese Firefox did not use Chinese notification text');
if (!chinese[1]?.message.startsWith('測試成功')) throw new Error('Chinese test notification mismatch');

console.log('i18n runtime simulation passed.');
