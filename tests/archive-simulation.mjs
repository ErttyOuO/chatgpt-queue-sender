import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const context = {
  console,
  Blob,
  TextEncoder,
  TextDecoder,
  ArrayBuffer,
  Uint8Array,
  Uint32Array,
  DataView,
  Date,
  Math,
  Number,
  String,
  Object,
  RegExp,
  Map,
  Set,
  URL,
  Response,
  window: null,
  document: { addEventListener() {} },
  location: { href: 'https://chatgpt.com/c/archive-test' },
};
context.window = context;
context.window.__CQS_CONVERSATION_EXPORT__ = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(`${root}/export/zip-writer.js`, 'utf8'), context);
vm.runInContext(fs.readFileSync(`${root}/export/archive-export.js`, 'utf8'), context);

const archiveApi = context.window.__CQS_ARCHIVE_EXPORT__;
const candidates = archiveApi.flattenCandidates([
  {
    attachments: [
      { downloadable: true, name: 'project-v1.zip', role: 'user', url: 'https://chatgpt.com/files/project-v1.zip' },
      { downloadable: true, name: 'project-v2.zip', role: 'user', url: 'https://chatgpt.com/files/project-v2.zip' },
      { downloadable: true, name: 'plugin-v0.5.0-source.zip', role: 'assistant', url: 'https://chatgpt.com/files/source-050.zip' },
      { downloadable: true, name: 'plugin-v0.5.1-source.zip', role: 'assistant', url: 'https://chatgpt.com/files/source-051.zip' },
      { downloadable: true, name: 'plugin-v0.5.1-amo.xpi', role: 'assistant', url: 'https://chatgpt.com/files/amo-051.xpi' },
      { downloadable: true, name: '報告_修改版.docx', role: 'assistant', url: 'https://chatgpt.com/files/report-revised.docx' },
      { downloadable: true, name: '報告_最終版.docx', role: 'assistant', url: 'https://chatgpt.com/files/report-final.docx' },
      { downloadable: true, name: 'generated-v0.8.2-source.zip', role: 'assistant', messageId: 'assistant-latest', sandboxPath: 'sandbox:/mnt/data/generated-v0.8.2-source.zip', sandboxPaths: ['sandbox:/mnt/data/generated-v0.8.2-source.zip'], sourceKind: 'conversation-api-sandbox' },
      { downloadable: false, name: 'external-reference.pdf', role: 'assistant', url: 'https://example.com/reference.pdf', sourceKind: 'external-link' },
    ],
  },
]);

const selected = candidates.filter((item) => item.defaultSelected).map((item) => item.name);
for (const expected of ['project-v2.zip', 'plugin-v0.5.1-source.zip', 'plugin-v0.5.1-amo.xpi', '報告_最終版.docx', 'generated-v0.8.2-source.zip']) {
  if (!selected.includes(expected)) throw new Error(`Latest-version plan missing: ${expected}`);
}
for (const old of ['project-v1.zip', 'plugin-v0.5.0-source.zip', '報告_修改版.docx']) {
  if (selected.includes(old)) throw new Error(`Old version was selected: ${old}`);
}
const unresolvedExternal = candidates.find((item) => item.name === 'external-reference.pdf');
if (unresolvedExternal) throw new Error('Ordinary external references must not appear in archive candidates');



const apiMerged = archiveApi.flattenCandidates([
  { attachments: [
    { downloadable: false, name: 'chatgpt-queue-sender-firefox-v0.6.1-amo.xpi', role: 'assistant', url: '' },
    { downloadable: false, name: 'chatgpt-queue-sender-firefox-v0.6.1-source.zip', role: 'assistant', url: '' },
  ] },
], [
  { downloadable: true, name: 'chatgpt-queue-sender-firefox-v0.6.1-amo.xpi', role: 'assistant', fileId: 'file-amo061abc', conversationId: 'conv-1', sourceKind: 'conversation-api' },
  { downloadable: true, name: 'chatgpt-queue-sender-firefox-v0.6.1-source.zip', role: 'assistant', fileId: 'file-src061abc', conversationId: 'conv-1', sourceKind: 'conversation-api' },
]);
const apiSelected = apiMerged.filter((item) => item.selected).map((item) => item.name);
for (const expected of ['chatgpt-queue-sender-firefox-v0.6.1-amo.xpi', 'chatgpt-queue-sender-firefox-v0.6.1-source.zip']) {
  if (!apiSelected.includes(expected)) throw new Error(`Structured API attachment missing: ${expected}`);
}
if (apiMerged.filter((item) => item.name.includes('v0.6.1')).some((item) => item.unresolved && item.selected)) {
  throw new Error('Unresolved duplicate must not be selected over file ID source');
}


const crossRoleDedup = archiveApi.flattenCandidates([], [
  { downloadable: true, name: 'shared-upload.md', role: 'user', fileId: 'file_00000000SHARED1234567890', conversationId: 'conv-1', sourceKind: 'conversation-api', appearanceIndex: 1 },
  { downloadable: true, name: 'shared-upload.md', role: 'assistant', fileId: 'file_00000000SHARED1234567890', conversationId: 'conv-1', sourceKind: 'conversation-api', appearanceIndex: 2 },
]);
if (crossRoleDedup.length !== 1) throw new Error('Same physical file ID must be archived only once across roles');
if (crossRoleDedup[0].role !== 'user') throw new Error('The first chronological source role should be preserved');

if (archiveApi.improveDownloadedFilename('file_00000000.bin', 'image/png', 'fallback.bin') !== 'file_00000000.png') {
  throw new Error('MIME type should repair a generic .bin image extension');
}
if (archiveApi.improveDownloadedFilename('', 'application/x-xpinstall', 'extension') !== 'extension.xpi') {
  throw new Error('MIME type should append an XPI extension when missing');
}

const edgeCandidates = archiveApi.flattenCandidates([{ attachments: [
  { downloadable: true, name: 'spec (V1).pdf', role: 'assistant', url: 'https://chatgpt.com/files/spec-v1.pdf' },
  { downloadable: true, name: 'spec (V2.1).pdf', role: 'assistant', url: 'https://chatgpt.com/files/spec-v21.pdf' },
  { downloadable: true, name: '設計稿_第2版.pptx', role: 'assistant', url: 'https://chatgpt.com/files/design-2.pptx' },
  { downloadable: true, name: '設計稿_第3版.pptx', role: 'assistant', url: 'https://chatgpt.com/files/design-3.pptx' },
  { downloadable: true, name: '表格(1).xlsx', role: 'user', url: 'https://chatgpt.com/files/table-1.xlsx' },
  { downloadable: true, name: '表格(2).xlsx', role: 'user', url: 'https://chatgpt.com/files/table-2.xlsx' },
] }]);
const edgeSelected = edgeCandidates.filter((item) => item.defaultSelected).map((item) => item.name);
for (const expected of ['spec (V2.1).pdf', '設計稿_第3版.pptx', '表格(2).xlsx']) {
  if (!edgeSelected.includes(expected)) throw new Error(`Edge version plan missing: ${expected}`);
}

const zipBlob = await context.window.__CQS_ZIP__.buildZip([
  { name: '聊天室.md', data: '# 對話' },
  { name: '使用者上傳/project-v2.zip', data: new Uint8Array([1, 2, 3]) },
  { name: 'ChatGPT提供/plugin-v0.5.1-source.zip', data: new Uint8Array([4, 5, 6]) },
  { name: '匯出報告.txt', data: 'ok' },
]);
const bytes = new Uint8Array(await zipBlob.arrayBuffer());
if (new DataView(bytes.buffer).getUint32(0, true) !== 0x04034b50) throw new Error('ZIP local header is invalid');
const decoded = new TextDecoder().decode(bytes);
for (const expected of ['聊天室.md', 'project-v2.zip', 'plugin-v0.5.1-source.zip', '匯出報告.txt']) {
  if (!decoded.includes(expected)) throw new Error(`ZIP output missing entry: ${expected}`);
}

console.log(JSON.stringify({
  ok: true,
  selected,
  excluded: candidates.filter((item) => !item.defaultSelected).map((item) => item.name),
  edgeSelected,
  apiSelected,
  crossRoleDedup: crossRoleDedup.map((item) => ({ role: item.role, name: item.name, fileId: item.fileId })),
  zipSize: zipBlob.size,
}, null, 2));
