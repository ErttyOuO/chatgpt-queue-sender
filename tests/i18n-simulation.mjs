import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const source = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');

function load(language) {
  const sandbox = {
    browser: { i18n: { getUILanguage: () => language } },
    navigator: { language: 'fallback' },
    Intl,
    Date,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'i18n.js' });
  return sandbox.CQS_I18N;
}

for (const language of ['zh-TW', 'zh-CN', 'zh-HK', 'ZH_tw']) {
  const api = load(language);
  if (api.isEnglish || !api.isChinese || api.locale !== 'zh-TW') throw new Error(`Chinese Firefox was not localized in Chinese: ${language}`);
  if (api.t('繁體中文', 'English') !== '繁體中文') throw new Error(`Chinese translation selection failed: ${language}`);
}

for (const language of ['en', 'en-US', 'en-GB', 'ja', 'de', 'fr', '']) {
  const api = load(language);
  if (!api.isEnglish || api.isChinese || api.locale !== 'en-US') throw new Error(`Non-Chinese Firefox did not default to English: ${language}`);
  if (api.t('中文', 'English') !== 'English') throw new Error(`English default selection failed: ${language}`);
}

const interpolated = load('en-US').t('共 {count} 則', '{count} items', { count: 3 });
if (interpolated !== '3 items') throw new Error('Localized placeholder interpolation failed');

const handoffSource = fs.readFileSync(path.join(root, 'export', 'handoff-prompt.js'), 'utf8');
if (!handoffSource.includes('# Conversation Handoff Summary')) throw new Error('English handoff prompt is missing');
const archiveSource = fs.readFileSync(path.join(root, 'export', 'archive-export.js'), 'utf8');
for (const text of ['User Uploads', 'Provided by ChatGPT', 'export-report.txt', 'Complete Conversation Archive Report']) {
  if (!archiveSource.includes(text)) throw new Error(`English archive localization is missing: ${text}`);
}

console.log('i18n simulation passed.');
