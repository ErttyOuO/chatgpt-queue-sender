import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../export/custom-prompts.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.id = '';
    this.value = '';
    this.disabled = false;
    this.tabIndex = -1;
    this.title = '';
    this._text = '';
  }
  set textContent(value) {
    this._text = String(value ?? '');
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((child) => child.textContent || '').join('');
  }
  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      node.parentElement = this;
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  async dispatch(type) {
    const event = { preventDefault() {}, stopPropagation() {}, target: this, currentTarget: this };
    for (const listener of this.listeners[type] || []) await listener(event);
  }
  querySelector(selector) {
    if (selector === '[data-cqs-custom-prompt-host]' && this.attributes['data-cqs-custom-prompt-host']) return this;
    for (const child of this.children) {
      if (selector.startsWith('.') && String(child.className).split(/\s+/).includes(selector.slice(1))) return child;
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }
  select() {}
  setSelectionRange() {}
  focus() {}
}

const host = new FakeElement('div');
host.setAttribute('data-cqs-custom-prompt-host', '1');
const documentElement = new FakeElement('html');
documentElement.append(host);
const documentListeners = {};
const document = {
  documentElement,
  createElement(tag) { return new FakeElement(tag); },
  querySelector(selector) {
    if (selector === '[data-cqs-custom-prompt-host]') return host;
    return null;
  },
  addEventListener(type, listener) { (documentListeners[type] ||= []).push(listener); },
  execCommand(command) { return command === 'copy'; },
};

const stored = {};
const writes = [];
const queueCalls = [];
const toasts = [];
let menuClosed = false;
const browser = {
  storage: {
    local: {
      async get(key) { return { [key]: stored[key] }; },
      async set(object) { Object.assign(stored, object); },
    },
    onChanged: { addListener() {} },
  },
};
const navigator = { clipboard: { async writeText(text) { writes.push(text); } } };
const window = {
  confirm() { return true; },
  __CQS_CONVERSATION_EXPORT__: {
    showToast(message) { toasts.push(message); },
    setMenuOpen(open) { if (open === false) menuClosed = true; },
    createElement(tag, options = {}) {
      const element = document.createElement(tag);
      if (options.className) element.className = options.className;
      if (options.id) element.id = options.id;
      if (options.text !== undefined) element.textContent = options.text;
      if (options.type) element.type = options.type;
      if (options.attrs) for (const [key, value] of Object.entries(options.attrs)) element.setAttribute(key, value);
      return element;
    },
    openModal() {},
    closeModal() {},
  },
  __CQS_QUEUE_API__: {
    enqueueText(text, options) {
      queueCalls.push({ text, options });
      return { ok: true, queuedAhead: 0, queueLength: 1 };
    },
  },
};

const context = vm.createContext({
  window,
  document,
  navigator,
  browser,
  chrome: undefined,
  globalThis: null,
  console,
  Date,
  Math,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Promise,
  setTimeout,
  clearTimeout,
});
context.globalThis = context;
vm.runInContext(script, context, { filename: 'custom-prompts.js' });
await new Promise((resolve) => setTimeout(resolve, 0));

const api = window.__CQS_CUSTOM_PROMPTS__;
if (!api) throw new Error('custom prompt API missing');
if (api.storageKey !== 'cqs_saved_prompts_v1') throw new Error('unexpected storage key');

const first = await api.savePrompt({ title: '摘要報告', text: '請將目前內容整理成摘要。' });
const second = await api.savePrompt({ title: '', text: '請檢查以下程式碼\n並提出修正。' });
if (api.getPrompts().length !== 2) throw new Error('saved prompt count mismatch');
if (second.title !== '請檢查以下程式碼') throw new Error('automatic title generation failed');
if (!Array.isArray(stored.cqs_saved_prompts_v1) || stored.cqs_saved_prompts_v1.length !== 2) throw new Error('storage persistence failed');

api.renderMenu(host);
const rendered = host.textContent;
if (!rendered.includes('自訂提示語') || !rendered.includes('摘要報告') || !rendered.includes('複製') || !rendered.includes('發送')) {
  throw new Error('saved prompt menu did not render expected controls');
}

await api.copyPrompt(first);
if (writes[0] !== first.text) throw new Error('copy action did not write prompt text');
const sendResult = await api.sendPrompt(first);
if (!sendResult?.ok || queueCalls.length !== 1) throw new Error('send action did not use queue API');
if (queueCalls[0].options.kind !== 'saved-prompt' || queueCalls[0].options.promptId !== first.id) throw new Error('send metadata mismatch');
if (!menuClosed) throw new Error('menu was not closed after send');

await api.movePrompt(second.id, -1);
if (api.getPrompts()[0].id !== second.id) throw new Error('prompt reordering failed');
await api.removePrompt(first.id);
if (api.getPrompts().length !== 1) throw new Error('prompt deletion failed');

console.log(JSON.stringify({
  ok: true,
  saved: api.getPrompts().map(({ title }) => title),
  queueCalls,
  copied: writes.length,
  toastCount: toasts.length,
}, null, 2));
