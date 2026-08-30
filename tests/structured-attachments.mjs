import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'export', 'conversation-api.js'), 'utf8');

const conversationId = '6a5ddb2d-89c8-83ee-9f33-5d4200cd6699';
const conversation = {
  id: conversationId,
  current_node: 'a1',
  mapping: {
    root: { parent: null, message: null },
    u1: {
      parent: 'root',
      message: {
        id: 'u1',
        author: { role: 'user' },
        content: {
          content_type: 'multimodal_text',
          parts: [
            { content_type: 'text', text: '請檢查檔案' },
            {
              content_type: 'file_asset_pointer',
              asset_pointer: 'file-service://file_00000000USERUPLOAD1234567890',
              size_bytes: 1234,
              metadata: { name: 'chatgpt-queue-sender-firefox-v0.3.4-source.zip', mime_type: 'application/zip' },
            },
          ],
        },
        metadata: {},
      },
    },
    a1: {
      parent: 'u1',
      children: ['tool1'],
      message: {
        id: 'a1',
        author: { role: 'assistant' },
        content: {
          content_type: 'multimodal_text',
          parts: [
            '[官方說明](https://help.openai.com/en/articles/8555545-file-uploads-faq)',
            '[另一篇說明](https://help.openai.com/en/articles/file-storage-and-library-in-chatgpt)',
            '[下載 XPI](sandbox:/mnt/data/chatgpt-queue-sender-firefox-v0.6.3-amo.xpi)',
            '[下載 source ZIP](sandbox:/mnt/data/chatgpt-queue-sender-firefox-v0.8.2-source.zip)',
            {
              content_type: 'file_asset_pointer',
              asset_pointer: 'sediment://file_00000000ASSISTANTOUTPUT87654321',
              metadata: { mime_type: 'application/x-xpinstall' },
            },
          ],
        },
        metadata: { echoed_upload: 'file-service://file_00000000USERUPLOAD1234567890' },
      },
    },
    tool1: {
      parent: 'a1',
      children: ['system2'],
      message: {
        id: 'tool1',
        author: { role: 'tool' },
        content: {
          content_type: 'multimodal_text',
          parts: [{
            content_type: 'file_asset_pointer',
            asset_pointer: 'sediment://file_00000000HIDDENTOOLFILE12345678',
            metadata: { name: 'hidden-tool-result.json', mime_type: 'application/json' },
          }],
        },
        metadata: {},
      },
    },
    system2: {
      parent: 'tool1',
      children: [],
      message: {
        id: 'system2',
        author: { role: 'system' },
        content: {
          content_type: 'multimodal_text',
          parts: [{
            content_type: 'file_asset_pointer',
            asset_pointer: 'asset_00000000NESTEDSYSTEM12345678',
            metadata: { name: 'nested-system-output.txt', mime_type: 'text/plain' },
          }],
        },
        metadata: {},
      },
    },
  },
};

const requested = [];
const pageRequested = [];
const context = {
  console,
  URL,
  URLSearchParams,
  encodeURIComponent,
  decodeURIComponent,
  window: null,
  cloneInto: (value) => value,
  location: {
    origin: 'https://chatgpt.com',
    pathname: `/g/g-p-project/c/${conversationId}`,
  },
  fetch: async (url) => {
    requested.push(String(url));
    if (String(url).endsWith('/api/auth/session')) {
      return { ok: true, json: async () => ({ accessToken: 'temporary-token' }) };
    }
    if (String(url).includes('/backend-api/files/file_00000000USERUPLOAD1234567890/uploaded')) {
      return { ok: true, json: async () => ({ status: 'success', file_name: 'chatgpt-queue-sender-firefox-v0.3.4-source.zip', download_url: 'https://files.oaiusercontent.com/user.zip' }) };
    }
    if (String(url).includes(`/backend-api/conversation/${conversationId}/interpreter/download`)) {
      return { ok: false, status: 403, json: async () => ({}) };
    }
    if (String(url).includes(`/backend-api/conversation/${conversationId}/attachment/file_00000000ASSISTANTOUTPUT87654321/download`)) {
      return { ok: true, json: async () => ({ status: 'success', file_name: 'chatgpt-queue-sender-firefox-v0.6.3-amo.xpi', download_url: 'https://files.oaiusercontent.com/assistant.xpi' }) };
    }
    if (String(url).includes('/backend-api/files/download/file_00000000HIDDENTOOLFILE12345678')) {
      return { ok: true, json: async () => ({ file_name: 'hidden-tool-result.json', download_url: 'https://files.oaiusercontent.com/hidden.json' }) };
    }
    if (String(url).includes('/backend-api/files/download/asset_00000000NESTEDSYSTEM12345678')) {
      return { ok: true, json: async () => ({ file_name: 'nested-system-output.txt', download_url: 'https://files.oaiusercontent.com/nested.txt' }) };
    }
    if (String(url).includes(`/backend-api/conversation/${conversationId}`)) {
      return { ok: true, json: async () => conversation };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  },
};
context.window = context;
context.window.wrappedJSObject = {
  fetch: async (url) => {
    pageRequested.push(String(url));
    if (String(url).includes(`/backend-api/conversation/${conversationId}/interpreter/download`)) {
      const decoded = decodeURIComponent(String(url));
      const isSource = decoded.includes('chatgpt-queue-sender-firefox-v0.8.2-source.zip');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          status: 'success',
          file_name: isSource ? 'chatgpt-queue-sender-firefox-v0.8.2-source.zip' : 'chatgpt-queue-sender-firefox-v0.6.3-amo.xpi',
          download_url: isSource ? 'https://files.oaiusercontent.com/source.zip' : 'https://files.oaiusercontent.com/assistant.xpi',
        }),
      };
    }
    return { ok: false, status: 404, text: async () => '{}' };
  },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'conversation-api.js' });

const api = context.window.__CQS_CONVERSATION_API__;
assert.equal(api.getConversationId(), conversationId);
for (const falseSlug of [
  'https://help.openai.com/en/articles/8555545-file-uploads-faq',
  'https://help.openai.com/en/articles/file-storage-and-library-in-chatgpt',
  'file-uploads-in-chatgpt-enterprise',
  'file-uploads-and-photos',
  'file-uploads-capability-work',
]) assert.equal(api.extractFileId(falseSlug), '');
assert.equal(api.extractFileId('file_00000000REALFILE1234567890'), 'file_00000000REALFILE1234567890');
assert.equal(api.extractFileId('file-legacyToken-1234567890'), 'file-legacyToken-1234567890');
assert.equal(
  api.extractFileId('https://chatgpt.com/backend-api/files/download/file_00000000REALFILE1234567890?inline=false'),
  'file_00000000REALFILE1234567890',
);

const mergedNamedRefs = api.scanMessageForFileRefs({
  id: 'assistant-named-merge',
  author: { role: 'assistant' },
  content: {
    content_type: 'multimodal_text',
    parts: [
      '[下載](sandbox:/mnt/data/named-generated-v0.8.5-source.zip)',
      {
        content_type: 'file_asset_pointer',
        asset_pointer: 'file_00000000NAMEDMERGE1234567890',
        metadata: { name: 'named-generated-v0.8.5-source.zip', mime_type: 'application/zip' },
      },
    ],
  },
  metadata: {},
}, conversationId);
assert.equal(mergedNamedRefs.length, 1, 'a named file pointer and matching sandbox path must merge into one attachment');
assert.equal(mergedNamedRefs[0].fileId, 'file_00000000NAMEDMERGE1234567890');
assert.deepEqual(Array.from(mergedNamedRefs[0].sandboxPaths), ['sandbox:/mnt/data/named-generated-v0.8.5-source.zip']);

const pathOnlyRefs = api.scanMessageForFileRefs({
  id: 'assistant-path-only',
  author: { role: 'assistant' },
  content: {
    content_type: 'multimodal_text',
    parts: [
      'bare path /mnt/data/bare-path-only.zip',
      'encoded path sandbox%3A%2Fmnt%2Fdata%2Fnested%2Fencoded-path-only.xpi',
    ],
  },
  metadata: {},
}, conversationId);
assert.deepEqual(
  JSON.parse(JSON.stringify(pathOnlyRefs.map((item) => ({ name: item.name, path: item.sandboxPath })))),
  [
    { name: 'bare-path-only.zip', path: 'sandbox:/mnt/data/bare-path-only.zip' },
    { name: 'encoded-path-only.xpi', path: 'sandbox:/mnt/data/nested/encoded-path-only.xpi' },
  ],
  'bare and URL-encoded sandbox-only paths should be collected with basename filenames',
);

const result = await api.collectAttachments();
assert.equal(result.ok, true);
assert.equal(result.attachments.length, 5);

const user = result.attachments.find((item) => item.role === 'user');
assert.equal(user.fileId, 'file_00000000USERUPLOAD1234567890');
assert.equal(user.name, 'chatgpt-queue-sender-firefox-v0.3.4-source.zip');
assert.equal(user.sizeHint, 1234);

const assistant = result.attachments.find((item) => item.role === 'assistant');
assert.equal(assistant.fileId, 'file_00000000ASSISTANTOUTPUT87654321');
assert.equal(assistant.name, 'chatgpt-queue-sender-firefox-v0.6.3-amo.xpi');
assert.ok(requested.some((url) => url.includes(`/backend-api/conversation/${conversationId}/interpreter/download`)));
assert.ok(pageRequested.some((url) => url.includes(`/backend-api/conversation/${conversationId}/interpreter/download`)), '403 metadata requests should retry in the page origin');
assert.ok(requested.some((url) => url.includes('/backend-api/files/file_00000000USERUPLOAD1234567890/uploaded')));
assert.equal(result.attachments.filter((item) => item.fileId === 'file_00000000USERUPLOAD1234567890').length, 1, 'same file ID echoed by another role must be deduplicated');


const sourceOnly = result.attachments.find((item) => item.name === 'chatgpt-queue-sender-firefox-v0.8.2-source.zip');
assert.ok(sourceOnly, 'sandbox-only generated output should be collected');
assert.equal(sourceOnly.fileId, '');
assert.equal(sourceOnly.sandboxPath, 'sandbox:/mnt/data/chatgpt-queue-sender-firefox-v0.8.2-source.zip');
assert.equal(sourceOnly.resolvedDownloadUrl, 'https://files.oaiusercontent.com/source.zip');

const hiddenTool = result.attachments.find((item) => item.fileId === 'file_00000000HIDDENTOOLFILE12345678');
assert.ok(hiddenTool, 'nearby hidden tool-node attachment should be collected');
assert.equal(hiddenTool.name, 'hidden-tool-result.json');

const nestedSystem = result.attachments.find((item) => item.fileId === 'asset_00000000NESTEDSYSTEM12345678');
assert.ok(nestedSystem, 'nested hidden system-node attachment should be collected');
assert.equal(nestedSystem.name, 'nested-system-output.txt');

console.log(JSON.stringify({ ok: true, files: result.attachments.map((item) => ({ role: item.role, name: item.name, fileId: item.fileId })) }, null, 2));
