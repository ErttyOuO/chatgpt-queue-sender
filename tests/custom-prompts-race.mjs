import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../export/custom-prompts.js', import.meta.url), 'utf8');
const stored = {};
let writeCount = 0;
const browser = {
  storage: {
    local: {
      async get(key) { return { [key]: stored[key] }; },
      async set(object) {
        writeCount += 1;
        const delay = writeCount === 1 ? 70 : 5;
        await new Promise((resolve) => setTimeout(resolve, delay));
        Object.assign(stored, structuredClone(object));
      },
    },
    onChanged: { addListener() {} },
  },
};
const document = {
  querySelector() { return null; },
  addEventListener() {},
  createElement() {
    return {
      style: {},
      setAttribute() {},
      addEventListener() {},
      append() {},
      remove() {},
      select() {},
      setSelectionRange() {},
    };
  },
  documentElement: { appendChild() {} },
};
const window = {};
const context = vm.createContext({
  window,
  document,
  browser,
  chrome: undefined,
  navigator: {},
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
  structuredClone,
});
context.globalThis = context;
vm.runInContext(script, context, { filename: 'custom-prompts.js' });

const api = window.__CQS_CUSTOM_PROMPTS__;
await Promise.all([
  api.savePrompt({ title: 'A', text: 'Prompt A' }),
  api.savePrompt({ title: 'B', text: 'Prompt B' }),
]);

const persisted = stored.cqs_saved_prompts_v1;
if (!Array.isArray(persisted) || persisted.length !== 2) {
  throw new Error(`concurrent prompt writes lost data: ${JSON.stringify(persisted)}`);
}
if (persisted.map((item) => item.title).join(',') !== 'A,B') {
  throw new Error(`concurrent prompt write order mismatch: ${JSON.stringify(persisted)}`);
}
console.log(JSON.stringify({ ok: true, persisted: persisted.map(({ title }) => title) }));
