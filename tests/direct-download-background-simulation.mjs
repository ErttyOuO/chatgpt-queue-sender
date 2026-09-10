import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');

function makeEvent() {
  let listener = null;
  return {
    api: { addListener(fn) { listener = fn; } },
    get listener() { return listener; },
  };
}

const runtimeMessage = makeEvent();
const downloadCalls = [];
const fetchCalls = [];
let failFirstDownload = false;

const browser = {
  runtime: {
    getURL(path) { return `moz-extension://direct-test/${path}`; },
    onMessage: runtimeMessage.api,
    onConnect: { addListener() {} },
  },
  storage: {
    local: { async get() { return {}; }, async set() {}, async remove() {} },
    session: { async get() { return {}; }, async set() {}, async remove() {} },
    onChanged: { addListener() {} },
  },
  permissions: { async contains() { return true; }, onAdded: { addListener() {} } },
  notifications: { async create() {}, async clear() {}, onClicked: { addListener() {} } },
  alarms: { async create() {}, async clear() {}, async getAll() { return []; }, onAlarm: { addListener() {} } },
  tabs: { async get() { return {}; }, async query() { return []; }, async update() {}, onRemoved: { addListener() {} } },
  windows: { async update() {} },
  downloads: {
    async download(options) {
      downloadCalls.push({ ...options });
      if (failFirstDownload && downloadCalls.length === 1) throw new Error('stale signed URL');
      return 99 + downloadCalls.length;
    },
  },
};

const context = vm.createContext({
  browser,
  globalThis: { browser, CQS_I18N: { isEnglish: true, t: (zh, en, values = {}) => String(en).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`) } },
  console,
  URL,
  URLSearchParams,
  AbortController,
  Date,
  Math,
  Promise,
  Object,
  RegExp,
  String,
  Number,
  Set,
  Map,
  setTimeout,
  clearTimeout,
  fetch: async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    if (String(url).includes('/backend-api/files/download/file-refresh-test')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            file_name: 'fresh-result.zip',
            download_url: 'https://files.oaiusercontent.com/file/fresh-result.zip?sig=new',
          };
        },
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  },
});
context.globalThis.globalThis = context.globalThis;
vm.runInContext(code, context);
assert.equal(typeof runtimeMessage.listener, 'function', 'background runtime message listener missing');

const sender = { tab: { id: 7, url: 'https://chatgpt.com/c/conversation-12345678' } };
const result = await runtimeMessage.listener({
  type: 'CQS_DIRECT_DOWNLOAD',
  url: 'https://files.oaiusercontent.com/file/direct.zip?sig=fresh',
  filename: '../IAFM_Linux_RAG_啟動修復_20260910.zip',
  fileId: 'file-direct-test',
  conversationId: 'conversation-12345678',
  origin: 'https://chatgpt.com',
}, sender);
assert.equal(result?.ok, true, 'direct download did not start');
assert.equal(downloadCalls.length, 1);
assert.equal(downloadCalls[0].url, 'https://files.oaiusercontent.com/file/direct.zip?sig=fresh');
assert.equal(downloadCalls[0].filename, 'IAFM_Linux_RAG_啟動修復_20260910.zip', 'filename path traversal was not stripped');
assert.equal(downloadCalls[0].saveAs, false);
assert.equal(downloadCalls[0].conflictAction, 'uniquify');

const invalid = await runtimeMessage.listener({
  type: 'CQS_DIRECT_DOWNLOAD',
  url: 'https://files.oaiusercontent.com/file/direct.zip?sig=fresh',
  filename: 'blocked.zip',
}, { tab: { id: 8, url: 'https://example.com/' } });
assert.equal(invalid?.ok, false, 'non-ChatGPT sender should be rejected');
assert.equal(invalid?.reason, 'invalid-sender');

downloadCalls.length = 0;
const sameOrigin = await runtimeMessage.listener({
  type: 'CQS_DIRECT_DOWNLOAD',
  url: 'https://chatgpt.com/backend-api/files/content/private-result.zip',
  filename: 'private-result.zip',
  fileId: 'file-private-result',
  conversationId: 'conversation-12345678',
  accessToken: 'temporary-token',
  accountId: 'account-123',
  origin: 'https://chatgpt.com',
}, { ...sender, tab: { ...sender.tab, cookieStoreId: 'firefox-container-7' } });
assert.equal(sameOrigin?.ok, true, 'same-origin direct download did not start');
assert.ok(downloadCalls[0].headers?.some((header) => header.name === 'authorization' && header.value === 'Bearer temporary-token'), 'same-origin direct download must retain the temporary authorization header');
assert.ok(downloadCalls[0].headers?.some((header) => header.name === 'chatgpt-account-id' && header.value === 'account-123'), 'same-origin direct download must retain the ChatGPT account header');
assert.equal(downloadCalls[0].cookieStoreId, 'firefox-container-7', 'Firefox container cookie store should follow the source tab');

failFirstDownload = true;
downloadCalls.length = 0;
const retry = await runtimeMessage.listener({
  type: 'CQS_DIRECT_DOWNLOAD',
  url: 'https://files.oaiusercontent.com/file/expired.zip?sig=old',
  filename: 'old.zip',
  fileId: 'file-refresh-test',
  conversationId: 'conversation-12345678',
  accessToken: 'temporary-token',
  accountId: 'account-123',
  origin: 'https://chatgpt.com',
}, sender);
assert.equal(retry?.ok, true, 'file ID refresh fallback failed');
assert.equal(downloadCalls.length, 2, 'stale signed URL should be retried exactly once');
assert.equal(downloadCalls[1].url, 'https://files.oaiusercontent.com/file/fresh-result.zip?sig=new');
assert.equal(downloadCalls[1].filename, 'fresh-result.zip');
assert.ok(fetchCalls.some((call) => call.url.includes('/backend-api/files/download/file-refresh-test')), 'fresh metadata endpoint was not requested');
assert.equal(fetchCalls[0].options.headers.authorization, 'Bearer temporary-token', 'metadata refresh must keep ChatGPT authorization');

console.log(JSON.stringify({
  ok: true,
  firefoxDownloadManager: true,
  noPreviewNavigation: true,
  safeFilename: true,
  invalidSenderBlocked: true,
  staleSignedUrlRefresh: true,
  sameOriginAuthorization: true,
  firefoxContainerContext: true,
}));
