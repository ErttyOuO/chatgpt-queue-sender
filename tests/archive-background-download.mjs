import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'background.js'), 'utf8');

function event() {
  const listeners = [];
  return {
    addListener(fn) { listeners.push(fn); },
    dispatch(...args) { return listeners.map((fn) => fn(...args)); },
    listeners,
  };
}

const runtimeOnConnect = event();
const runtimeOnMessage = event();
const notificationClicked = event();
const permissionsAdded = event();
let fetchCount = 0;
const fetchCalls = [];

const payload = new TextEncoder().encode('background-stream-ok');
const context = {
  console,
  URL,
  URLSearchParams,
  Blob,
  Response,
  ReadableStream,
  Uint8Array,
  ArrayBuffer,
  DOMException,
  AbortController,
  setTimeout,
  clearTimeout,
  CQS_I18N: { isEnglish: true, locale: 'en-US', t: (zh, en) => en },
  fetch: async (url, options = {}) => {
    fetchCount += 1;
    const value = String(url);
    fetchCalls.push({ url: value, method: options.method || 'GET', headers: { ...(options.headers || {}) } });
    if (value === 'https://files.oaiusercontent.com/file/expired.zip?sig=old') {
      return new Response('expired', { status: 403, headers: { 'content-type': 'text/plain' } });
    }
    if (value.includes('/backend-api/files/download/file-expired-url')) {
      return new Response(JSON.stringify({
        status: 'success',
        file_name: 'refreshed.zip',
        download_url: 'https://files.oaiusercontent.com/file/refreshed.zip?sig=new',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (value.includes('/backend-api/files/download/file-api-relative')) {
      return new Response(JSON.stringify({
        status: 'success',
        file_name: 'relative-result.zip',
        download_url: '/backend-api/files/content/relative-result.zip',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (value.includes('/backend-api/files/download/file-api-test')) {
      return new Response(JSON.stringify({
        status: 'success',
        file_name: 'resolved-v0.6.3-source.zip',
        download_url: 'https://files.oaiusercontent.com/file/resolved-v061.zip?sig=test',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (value.includes('/backend-api/files/download/file-user-upload')) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
    if (value.includes('/backend-api/conversation/conversation-test/interpreter/download')) {
      const decoded = decodeURIComponent(value);
      if (decoded.includes('wrong-generated-v0.8.5-source.zip')) {
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      }
      if (decoded.includes('chatgpt-queue-sender-firefox-v0.8.5-source.zip')) {
        return new Response(JSON.stringify({
          status: 'success',
          file_name: 'chatgpt-queue-sender-firefox-v0.8.5-source.zip',
          download_url: 'https://files.oaiusercontent.com/file/generated-source.zip?sig=fresh',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    if (value.includes('/backend-api/files/file-user-upload/uploaded')) {
      return new Response(JSON.stringify({
        status: 'success',
        file_name: 'user-upload.md',
        download_url: 'https://files.oaiusercontent.com/file/user-upload.md?sig=test',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(payload, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-length': String(payload.byteLength),
        'content-disposition': 'attachment; filename="result-v2.zip"',
      },
    });
  },
};
context.globalThis = context;
context.browser = {
  runtime: {
    onConnect: runtimeOnConnect,
    onMessage: runtimeOnMessage,
    getURL: (value) => `moz-extension://test/${value}`,
  },
  storage: { local: { get: async () => ({}) } },
  permissions: {
    contains: async () => false,
    onAdded: permissionsAdded,
  },
  notifications: {
    create: async () => 'id',
    clear: async () => true,
    onClicked: notificationClicked,
  },
  tabs: { get: async () => ({}), update: async () => ({}) },
  windows: { update: async () => ({}) },
};

vm.runInNewContext(source, context, { filename: 'background.js' });
assert.equal(runtimeOnConnect.listeners.length, 1, 'archive port listener missing');

function makePort(name = 'cqs-archive-download') {
  const onMessage = event();
  const onDisconnect = event();
  const outputs = [];
  const port = {
    name,
    onMessage,
    onDisconnect,
    postMessage(message) {
      outputs.push(message);
      if (message.type === 'meta') queueMicrotask(() => onMessage.dispatch({ type: 'continue' }));
    },
  };
  return { port, outputs };
}

const good = makePort();
runtimeOnConnect.dispatch(good.port);
good.port.onMessage.dispatch({ type: 'start', url: 'https://files.oaiusercontent.com/file/result-v2.zip' });

const deadline = Date.now() + 3000;
while (!good.outputs.some((message) => message.type === 'done')) {
  if (Date.now() > deadline) throw new Error('background download timed out');
  await new Promise((resolve) => setTimeout(resolve, 10));
}

const meta = good.outputs.find((message) => message.type === 'meta');
assert.equal(meta.contentDisposition, 'attachment; filename="result-v2.zip"');
const chunks = good.outputs.filter((message) => message.type === 'chunk').map((message) => new Uint8Array(message.buffer));
const received = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
let offset = 0;
for (const chunk of chunks) {
  received.set(chunk, offset);
  offset += chunk.length;
}
assert.equal(new TextDecoder().decode(received), 'background-stream-ok');
assert.equal(fetchCount, 1);


const resolved = makePort();
runtimeOnConnect.dispatch(resolved.port);
resolved.port.onMessage.dispatch({
  type: 'start',
  fileId: 'file-api-test',
  conversationId: 'conversation-test',
  accessToken: 'temporary-token',
  origin: 'https://chatgpt.com',
  filename: 'fallback.zip',
});
const resolvedDeadline = Date.now() + 3000;
while (!resolved.outputs.some((message) => message.type === 'done')) {
  if (Date.now() > resolvedDeadline) throw new Error('file ID background download timed out');
  await new Promise((resolve) => setTimeout(resolve, 10));
}
const resolvedMeta = resolved.outputs.find((message) => message.type === 'meta');
assert.equal(resolvedMeta.fileName, 'resolved-v0.6.3-source.zip');
assert.match(resolvedMeta.finalUrl, /files\.oaiusercontent\.com/);
assert.equal(fetchCount, 3, 'file ID flow should resolve metadata and download bytes');
assert.equal(fetchCalls[1].headers.authorization, 'Bearer temporary-token', 'metadata request must use the temporary token');
assert.equal(fetchCalls[1].headers['Oai-Language'], 'en-US', 'English Firefox must send the English Oai-Language header');
assert.ok(!fetchCalls[2].headers.authorization, 'signed CDN download must not receive the ChatGPT bearer token');

const relative = makePort();
runtimeOnConnect.dispatch(relative.port);
relative.port.onMessage.dispatch({
  type: 'start',
  fileId: 'file-api-relative',
  conversationId: 'conversation-test',
  accessToken: 'temporary-token',
  origin: 'https://chatgpt.com',
  filename: 'relative-fallback.zip',
});
const relativeDeadline = Date.now() + 3000;
while (!relative.outputs.some((message) => message.type === 'done')) {
  if (Date.now() > relativeDeadline) throw new Error('relative URL download timed out');
  await new Promise((resolve) => setTimeout(resolve, 10));
}
const relativeMeta = relative.outputs.find((message) => message.type === 'meta');
assert.equal(relativeMeta.finalUrl, 'https://chatgpt.com/backend-api/files/content/relative-result.zip');
assert.equal(fetchCalls[4].headers.authorization, 'Bearer temporary-token', 'same-origin resolved download may use the temporary token');
assert.equal(fetchCount, 5, 'relative file ID flow should resolve metadata and download bytes');

const userUpload = makePort();
runtimeOnConnect.dispatch(userUpload.port);
userUpload.port.onMessage.dispatch({
  type: 'start',
  fileId: 'file-user-upload',
  conversationId: 'conversation-test',
  role: 'user',
  accessToken: 'temporary-token',
  origin: 'https://chatgpt.com',
  filename: 'fallback.md',
});
const userDeadline = Date.now() + 3000;
while (!userUpload.outputs.some((message) => message.type === 'done')) {
  if (Date.now() > userDeadline) throw new Error('user upload download timed out');
  await new Promise((resolve) => setTimeout(resolve, 10));
}
assert.match(fetchCalls[5].url, /\/backend-api\/files\/download\/file-user-upload/, 'generic metadata endpoint should be tried first');
assert.equal(fetchCalls[6].method, 'POST', 'user uploads should fall back to the uploaded endpoint');
assert.match(fetchCalls[6].url, /\/backend-api\/files\/file-user-upload\/uploaded/);
assert.equal(fetchCount, 8, 'user upload flow should retry the role-specific endpoint and download bytes');

const expired = makePort();
runtimeOnConnect.dispatch(expired.port);
expired.port.onMessage.dispatch({
  type: 'start',
  url: 'https://files.oaiusercontent.com/file/expired.zip?sig=old',
  fileId: 'file-expired-url',
  conversationId: 'conversation-test',
  accessToken: 'temporary-token',
  origin: 'https://chatgpt.com',
  filename: 'expired.zip',
});
const expiredDeadline = Date.now() + 3000;
while (!expired.outputs.some((message) => message.type === 'done')) {
  if (Date.now() > expiredDeadline) throw new Error('expired URL fallback timed out');
  await new Promise((resolve) => setTimeout(resolve, 10));
}
const expiredMeta = expired.outputs.find((message) => message.type === 'meta');
assert.equal(expiredMeta.fileName, 'refreshed.zip');
assert.equal(expiredMeta.finalUrl, 'https://files.oaiusercontent.com/file/refreshed.zip?sig=new');
assert.equal(fetchCount, 11, 'expired URL should retry metadata and then download refreshed bytes');

const sandboxOnly = makePort();
runtimeOnConnect.dispatch(sandboxOnly.port);
sandboxOnly.port.onMessage.dispatch({
  type: 'start',
  conversationId: 'conversation-test',
  messageId: 'assistant-message-test',
  sandboxPath: 'sandbox:/mnt/data/wrong-generated-v0.8.5-source.zip',
  sandboxPaths: [
    'sandbox:/mnt/data/wrong-generated-v0.8.5-source.zip',
    'sandbox:/mnt/data/chatgpt-queue-sender-firefox-v0.8.5-source.zip',
  ],
  accessToken: 'temporary-token',
  origin: 'https://chatgpt.com',
  filename: 'guessed-source.zip',
});
const sandboxDeadline = Date.now() + 3000;
while (!sandboxOnly.outputs.some((message) => ['done', 'error'].includes(message.type))) {
  if (Date.now() > sandboxDeadline) throw new Error('sandbox-only background download timed out');
  await new Promise((resolve) => setTimeout(resolve, 10));
}
assert.equal(sandboxOnly.outputs.find((message) => message.type === 'error')?.message, undefined);
const sandboxMeta = sandboxOnly.outputs.find((message) => message.type === 'meta');
assert.equal(sandboxMeta.fileName, 'chatgpt-queue-sender-firefox-v0.8.5-source.zip');
assert.equal(sandboxMeta.finalUrl, 'https://files.oaiusercontent.com/file/generated-source.zip?sig=fresh');
assert.ok(fetchCalls.some((call) => decodeURIComponent(call.url).includes('wrong-generated-v0.8.5-source.zip')), 'first inferred sandbox path should be attempted');
assert.ok(fetchCalls.some((call) => decodeURIComponent(call.url).includes('chatgpt-queue-sender-firefox-v0.8.5-source.zip')), 'later inferred sandbox path should be used as a fallback');
assert.equal(fetchCount, 14, 'sandbox-only flow should try two interpreter paths and then download bytes');

const blocked = makePort();
runtimeOnConnect.dispatch(blocked.port);
blocked.port.onMessage.dispatch({ type: 'start', url: 'https://example.com/file.zip' });
await new Promise((resolve) => setTimeout(resolve, 10));
assert.match(blocked.outputs.find((message) => message.type === 'error')?.message || '', /Download connection failed/);
assert.equal(fetchCount, 14, 'blocked URL must not be fetched');

console.log(JSON.stringify({ ok: true, bytes: received.length, fileIdResolved: true, sandboxOnlyResolved: true, blocked: true }));
