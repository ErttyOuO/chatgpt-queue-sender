import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const contentScript = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 15000, step = 50) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value) return value;
    await wait(step);
  }
  throw new Error('waitFor timeout');
}

function createDom(storageState = {}) {
  const html = `<!doctype html><html><body>
    <main id="conversation"></main>
    <div id="composer-wrap">
      <form id="composer-form">
        <div id="prompt-textarea" contenteditable="true" aria-label="Message"></div>
        <button type="button" data-testid="composer-voice-button" aria-label="Voice mode">Voice</button>
        <button type="button" data-testid="send-button" aria-label="Send message" disabled>Send</button>
      </form>
    </div>
  </body></html>`;
  const dom = new JSDOM(html, { url: 'https://chatgpt.com/mock', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const top = this.id === 'composer-form' || this.id === 'prompt-textarea' ? 700 : 100;
    return { x: 10, y: top, top, left: 10, right: 410, bottom: top + 40, width: 400, height: 40, toJSON() {} };
  };
  window.getComputedStyle = () => ({ visibility: 'visible', display: 'block' });
  window.HTMLElement.prototype.focus = function () { this._focused = true; };
  window.document.execCommand = () => false;
  window.mockMessages = [];
  window.browser = {
    storage: {
      local: {
        async get(key) { return { [key]: storageState[key] || {} }; },
        async set(obj) { Object.assign(storageState, obj); },
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      getURL(path) { return `moz-extension://test/${path}`; },
      async sendMessage(message) {
        window.mockMessages.push(message);
        return { shown: true };
      },
    },
  };

  const input = window.document.querySelector('#prompt-textarea');
  const send = window.document.querySelector('[data-testid="send-button"]');
  const voice = window.document.querySelector('[data-testid="composer-voice-button"]');
  const conversation = window.document.querySelector('#conversation');
  window.mockEvents = [];
  let seq = 0;

  const updateSend = () => { send.disabled = !(input.textContent || '').trim(); };
  input.addEventListener('input', updateSend);

  const submit = () => {
    const text = (input.textContent || '').trim();
    if (!text || send.disabled || window.document.querySelector('[data-testid="stop-button"]')) return;
    seq += 1;
    const n = seq;
    const user = window.document.createElement('article');
    user.dataset.testid = `conversation-turn-${n * 2 - 1}`;
    const userBody = window.document.createElement('div');
    userBody.dataset.messageAuthorRole = 'user';
    userBody.textContent = text;
    user.appendChild(userBody);
    conversation.appendChild(user);
    window.mockEvents.push({ type: 'user', text, t: Date.now() });

    input.textContent = '';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    send.hidden = true;
    voice.hidden = true;

    const stop = window.document.createElement('button');
    stop.type = 'button';
    stop.dataset.testid = 'stop-button';
    stop.setAttribute('aria-label', 'Stop generating');
    stop.textContent = 'Stop';
    window.document.querySelector('#composer-form').appendChild(stop);

    const assistant = window.document.createElement('article');
    assistant.dataset.testid = `conversation-turn-${n * 2}`;
    const assistantBody = window.document.createElement('div');
    assistantBody.dataset.messageAuthorRole = 'assistant';
    assistantBody.dataset.isStreaming = 'true';
    assistantBody.textContent = 'Working';
    assistant.appendChild(assistantBody);
    conversation.appendChild(assistant);
    window.mockEvents.push({ type: 'assistant-start', n, t: Date.now() });

    window.setTimeout(() => {
      stop.remove();
      assistantBody.dataset.isStreaming = 'false';
      assistantBody.textContent = `Done ${n}`;
      send.hidden = false;
      voice.hidden = false;
      updateSend();
      window.mockEvents.push({ type: 'assistant-end', n, t: Date.now() });
    }, 700);
  };

  send.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  updateSend();
  window.eval(contentScript);
  return { dom, window, storageState, input, send, voice, conversation };
}

async function scenarioHandoffQueueMetadata() {
  const env = createDom({});
  try {
    const { window } = env;
    await waitFor(() => window.__CQS_QUEUE_API__?.enqueueText);
    await waitFor(() => window.document.querySelector('#cqs-floating-button'));
    let completed = null;
    window.document.addEventListener('cqs:queue-item-completed', (event) => { completed = event.detail; });
    const result = window.__CQS_QUEUE_API__.enqueueText('請產生交接摘要', { kind: 'handoff' });
    if (!result?.ok) throw new Error(`Handoff enqueue failed: ${result?.message || 'unknown'}`);
    await waitFor(() => window.mockEvents.some((event) => event.type === 'assistant-end'), 8000);
    await waitFor(() => completed?.kind === 'handoff', 8000);
    if (completed.text !== '請產生交接摘要') throw new Error('Handoff completion event text mismatch');
    return { kind: completed.kind, text: completed.text };
  } finally {
    env.dom.window.close();
  }
}

const result = await scenarioHandoffQueueMetadata();
console.log(JSON.stringify({ ok: true, result }, null, 2));
