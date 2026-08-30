import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const markdownScript = fs.readFileSync(new URL('../export/markdown-converter.js', import.meta.url), 'utf8');
const exportScript = fs.readFileSync(new URL('../export/conversation-export.js', import.meta.url), 'utf8');
const handoffScript = fs.readFileSync(new URL('../export/handoff-prompt.js', import.meta.url), 'utf8');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 8000, step = 40) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value) return value;
    await wait(step);
  }
  throw new Error('waitFor timeout');
}

const html = `<!doctype html><html><body>
  <main id="main">
    <article data-testid="conversation-turn-1">
      <div data-message-author-role="user">
        <p>請閱讀附件並整理重點。</p>
        <a href="https://chatgpt.com/backend-api/files/project-source.zip">project-source.zip</a>
      </div>
    </article>
    <article data-testid="conversation-turn-2">
      <div data-message-author-role="assistant">
        <div class="markdown prose">
          <h2>整理結果</h2>
          <p>已完成初步分析。</p>
          <pre><code class="language-js">const ready = true;</code></pre>
          <table><tr><th>功能</th><th>狀態</th></tr><tr><td>匯出</td><td>完成</td></tr></table>
        </div>
      </div>
    </article>
    <article data-testid="conversation-turn-3" data-message-id="assistant-v082">
      <div data-message-author-role="assistant">
        <div class="markdown prose">
          <h2>ChatGPT Queue Sender v0.8.2</h2>
          <p>下載新版</p>
          <span data-state="closed"><button id="generated-xpi" class="behavior-btn" type="button">下載 Firefox／AMO 用 XPI</button></span>
          <span data-state="closed"><button id="generated-source" class="behavior-btn" type="button">下載完整原始碼 ZIP</button></span>
          <span data-state="closed"><button id="react-file" class="behavior-btn" type="button">下載測試成果</button></span>
        </div>
      </div>
    </article>
  </main>
</body></html>`;

const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/test-export', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.document.title = 'Queue Sender 開發 - ChatGPT';
window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { x: 200, y: 70, top: 70, left: 200, right: 1000, bottom: 700, width: 800, height: 630, toJSON() {} };
};
window.HTMLElement.prototype.getClientRects = function () {
  return [{ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 }];
};
window.getComputedStyle = () => ({ display: 'block', visibility: 'visible', overflowY: 'visible' });
window.scrollTo = (_x, y) => { window.document.documentElement.scrollTop = y; };
Object.defineProperty(window.document.documentElement, 'scrollHeight', { configurable: true, get: () => 25000 });
Object.defineProperty(window.document.documentElement, 'clientHeight', { configurable: true, get: () => 700 });
Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 700 });
Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => 1200 });
window.confirm = () => true;
window.navigator.clipboard = { async writeText(value) { window.__copied = value; } };

let capturedBlob = null;
let capturedFilename = '';
window.URL.createObjectURL = (blob) => {
  capturedBlob = blob;
  return 'blob:test-export';
};
window.URL.revokeObjectURL = () => {};
const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
window.HTMLAnchorElement.prototype.click = function () {
  if (this.download) capturedFilename = this.download;
};

const enqueued = [];
window.document.querySelector('#react-file')['__reactProps$test'] = {
  entity: {
    file_id: 'file_00000000REACTBUTTON1234567890',
    file_name: 'react-generated-result.json',
    sandbox_path: 'sandbox:/mnt/data/react-generated-result.json',
  },
};

window.__CQS_QUEUE_API__ = {
  enqueueText(text, options) {
    enqueued.push({ text, options });
    return { ok: true, queuedAhead: 0, queueLength: 1 };
  },
};

window.eval(markdownScript);
window.eval(exportScript);
window.eval(handoffScript);

const latestTurn = window.document.querySelector('[data-message-id="assistant-v082"]');
const generatedAttachments = window.__CQS_CONVERSATION_EXPORT__.detectAttachments(latestTurn, 'assistant');
const inferredXpi = generatedAttachments.find((item) => item.name === 'chatgpt-queue-sender-firefox-v0.8.2-amo.xpi');
const inferredSource = generatedAttachments.find((item) => item.name === 'chatgpt-queue-sender-firefox-v0.8.2-source.zip');
const reactFile = generatedAttachments.find((item) => item.fileId === 'file_00000000REACTBUTTON1234567890');
if (!inferredXpi?.sandboxPaths?.length || inferredXpi.messageId !== 'assistant-v082') throw new Error('Generated XPI button was not inferred as a sandbox attachment');
if (!inferredSource?.sandboxPaths?.length || inferredSource.messageId !== 'assistant-v082') throw new Error('Generated source ZIP button was not inferred as a sandbox attachment');
if (!reactFile || reactFile.name !== 'react-generated-result.json') throw new Error('React-backed file metadata was not detected');

await waitFor(() => window.document.querySelector('#cqs-export-control'));
const archiveBetaBadge = window.document.querySelector('[data-cqs-export-action="download-archive"] .cqs-export-beta-badge');
if (!archiveBetaBadge || archiveBetaBadge.textContent.trim() !== 'Beta') throw new Error('Archive Beta badge is missing');
const trigger = window.document.querySelector('.cqs-export-trigger');
trigger.click();
const exportStartedAt = Date.now();
window.document.querySelector('[data-cqs-export-action="download-markdown"]').click();
await waitFor(() => capturedBlob, 10000);
const exportElapsedMs = Date.now() - exportStartedAt;
if (exportElapsedMs > 3000) throw new Error(`Fast export path was too slow: ${exportElapsedMs} ms`);
const markdown = await new Promise((resolve, reject) => {
  const reader = new window.FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Blob read failed'));
  reader.readAsText(capturedBlob);
});
for (const expected of [
  '# Queue Sender 開發',
  '請閱讀附件並整理重點。',
  '## 整理結果',
  '```js',
  '| 功能 | 狀態 |',
  'project-source.zip',
  'https://chatgpt.com/backend-api/files/project-source.zip',
  '完整性：已完成自動載入與掃描',
]) {
  if (!markdown.includes(expected)) throw new Error(`Markdown export missing: ${expected}`);
}
if (!capturedFilename.endsWith('.md')) throw new Error('Markdown filename missing');

trigger.click();
window.document.querySelector('[data-cqs-export-action="open-handoff"]').click();
const textarea = await waitFor(() => window.document.querySelector('#cqs-handoff-textarea'));
if (!textarea.value.includes('# 對話交接摘要')) throw new Error('Handoff prompt preview missing');
const sendButton = [...window.document.querySelectorAll('#cqs-export-modal .cqs-export-modal-actions button')]
  .find((button) => button.textContent === '送出整理指令');
sendButton.click();
if (enqueued.length !== 1 || enqueued[0].options?.kind !== 'handoff') throw new Error('Handoff was not queued with metadata');

window.document.dispatchEvent(new window.CustomEvent('cqs:queue-item-completed', { detail: { kind: 'handoff' } }));
const copyButton = await waitFor(() => window.document.querySelector('[data-cqs-copy-handoff]'));
copyButton.click();
await waitFor(() => window.__copied);
if (!window.__copied.includes('整理結果')) throw new Error('Handoff copy button copied the wrong response');
await wait(120);
const copiedLength = window.__copied?.length || 0;

window.HTMLAnchorElement.prototype.click = originalAnchorClick;
dom.window.close();
console.log(JSON.stringify({
  ok: true,
  filename: capturedFilename,
  markdownLength: markdown.length,
  handoffQueued: enqueued.length,
  copiedLength,
  exportElapsedMs,
}, null, 2));
