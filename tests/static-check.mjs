import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = {
  'i18n.js': fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'),
  'content.js': fs.readFileSync(path.join(root, 'content.js'), 'utf8'),
  'background.js': fs.readFileSync(path.join(root, 'background.js'), 'utf8'),
  'popup.js': fs.readFileSync(path.join(root, 'popup', 'popup.js'), 'utf8'),
  'markdown-converter.js': fs.readFileSync(path.join(root, 'export', 'markdown-converter.js'), 'utf8'),
  'zip-writer.js': fs.readFileSync(path.join(root, 'export', 'zip-writer.js'), 'utf8'),
  'conversation-export.js': fs.readFileSync(path.join(root, 'export', 'conversation-export.js'), 'utf8'),
  'conversation-api.js': fs.readFileSync(path.join(root, 'export', 'conversation-api.js'), 'utf8'),
  'archive-export.js': fs.readFileSync(path.join(root, 'export', 'archive-export.js'), 'utf8'),
  'handoff-prompt.js': fs.readFileSync(path.join(root, 'export', 'handoff-prompt.js'), 'utf8'),
  'custom-prompts.js': fs.readFileSync(path.join(root, 'export', 'custom-prompts.js'), 'utf8'),
};

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(manifest.manifest_version === 3, 'manifest_version must be 3');
assert(manifest.version === '0.8.6', 'manifest version must be 0.8.6');
assert(manifest.default_locale === 'en', 'default locale must be English for non-Chinese Firefox locales');
assert(manifest.name === '__MSG_extensionName__', 'manifest name must use locale messages');
assert(manifest.description === '__MSG_extensionDescription__', 'manifest description must use locale messages');
assert(manifest.action?.default_title === '__MSG_extensionActionTitle__', 'toolbar title must use locale messages');
assert(manifest.permissions?.length === 1 && manifest.permissions[0] === 'storage', 'storage must remain the only required permission');
assert(manifest.optional_permissions?.includes('notifications'), 'notifications must be an optional permission');
assert(manifest.action?.default_popup === 'popup/popup.html', 'toolbar popup is missing');
assert(JSON.stringify(manifest.background?.scripts) === JSON.stringify(['i18n.js', 'background.js']), 'localized background script order is incorrect');
assert(manifest.icons?.['128'] === 'icons/icon-128.png', 'extension icon mapping is missing');
assert(manifest.browser_specific_settings?.gecko?.strict_min_version === '140.0', 'desktop strict_min_version must be 140.0');
assert(manifest.browser_specific_settings?.gecko_android?.strict_min_version === '142.0', 'Android strict_min_version must be 142.0');
assert(
  JSON.stringify(manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required) === JSON.stringify(['none']),
  'data_collection_permissions.required must be ["none"]',
);

for (const host of [
  'https://chatgpt.com/*', 'https://*.chatgpt.com/*', 'https://chat.openai.com/*',
  'https://openai.com/*', 'https://*.openai.com/*', 'https://oaiusercontent.com/*', 'https://*.oaiusercontent.com/*',
]) {
  assert(manifest.host_permissions?.includes(host), `missing host permission: ${host}`);
}

for (const file of [
  'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-64.png', 'icons/icon-96.png', 'icons/icon-128.png',
  'i18n.js', '_locales/en/messages.json', '_locales/zh_TW/messages.json', '_locales/zh_CN/messages.json',
  'popup/popup.html', 'popup/popup.css', 'popup/popup.js', 'background.js',
  'export/markdown-converter.js', 'export/zip-writer.js', 'export/conversation-export.js', 'export/conversation-api.js', 'export/archive-export.js',
  'export/handoff-prompt.js', 'export/custom-prompts.js', 'export/export-ui.css',
]) {
  assert(fs.existsSync(path.join(root, file)), `missing packaged file: ${file}`);
}

const contentEntry = manifest.content_scripts?.[0];
const expectedOrder = [
  'i18n.js',
  'export/markdown-converter.js',
  'export/zip-writer.js',
  'export/conversation-export.js',
  'export/conversation-api.js',
  'export/archive-export.js',
  'export/handoff-prompt.js',
  'export/custom-prompts.js',
  'content.js',
];
assert(JSON.stringify(contentEntry?.js) === JSON.stringify(expectedOrder), 'content script load order is incorrect');
assert(contentEntry?.css?.includes('export/export-ui.css'), 'export UI CSS is missing');

for (const [name, js] of Object.entries(files)) {
  for (const forbidden of ['XMLHttpRequest', 'WebSocket', 'sendBeacon(', 'eval(', 'new Function(']) {
    assert(!js.includes(forbidden), `${name}: forbidden or unexpected API found: ${forbidden}`);
  }
  if (!['archive-export.js', 'background.js', 'conversation-api.js'].includes(name)) assert(!js.includes('fetch('), `${name}: unexpected fetch API found`);
}


const i18nJs = files['i18n.js'];
assert(i18nJs.includes('getUILanguage'), 'Firefox UI language detection is missing');
assert(i18nJs.includes('const isChinese = /^zh'), 'Chinese-only locale rule is missing');
assert(i18nJs.includes('const isEnglish = !isChinese'), 'English fallback for non-Chinese Firefox locales is missing');
const enMessages = JSON.parse(fs.readFileSync(path.join(root, '_locales', 'en', 'messages.json'), 'utf8'));
const zhMessages = JSON.parse(fs.readFileSync(path.join(root, '_locales', 'zh_TW', 'messages.json'), 'utf8'));
assert(enMessages.extensionName?.message === 'ChatGPT Queue Sender', 'English extension name is missing');
assert(zhMessages.extensionName?.message === 'ChatGPT 訊息佇列助手', 'Traditional Chinese extension name is missing');

const contentJs = files['content.js'];
const exportJs = files['conversation-export.js'];
const apiJs = files['conversation-api.js'];
const archiveJs = files['archive-export.js'];
const zipJs = files['zip-writer.js'];
const handoffJs = files['handoff-prompt.js'];
const customPromptsJs = files['custom-prompts.js'];
const backgroundJs = files['background.js'];
const popupJs = files['popup.js'];
const exportCss = fs.readFileSync(path.join(root, 'export', 'export-ui.css'), 'utf8');

assert(!contentJs.includes('data-cqs-action="start"'), 'permanent Start action must not exist');
assert(contentJs.includes('waitForSubmissionConfirmed'), 'submission confirmation logic is missing');
assert(contentJs.includes('waitForResponseFinished'), 'queue response completion logic is missing');
assert(contentJs.includes('getActiveWorkIndicator'), 'active tool/work busy-state detection is missing');
assert(contentJs.includes("button[data-testid='copy-turn-action-button']"), 'strong assistant completion action detection is missing');
assert(contentJs.includes('assistantSignatureBefore: getLastAssistantSignature()'), 'assistant pre-submit signature guard is missing');
assert(contentJs.includes('now - lastAssistantChangeAt >= 12000'), 'conservative completion fallback is missing');
assert(contentJs.includes("button[data-testid='composer-plus-btn']"), 'stable composer plus-button anchor is missing');
assert(contentJs.includes('isAttachmentPreviewControl'), 'attachment preview exclusion for queue button placement is missing');
assert(contentJs.includes('getLatestConversationRole'), 'latest conversation role pre-send guard is missing');
assert(contentJs.includes('conversationSettled'), 'pre-send conversation-settled guard is missing');
assert(contentJs.includes('responseMonitorTick'), 'all-response completion monitor is missing');
assert(contentJs.includes('CQS_RESPONSE_COMPLETE'), 'completion message dispatch is missing');
assert(contentJs.includes('playCompletionChime'), 'completion sound is missing');
assert(contentJs.includes('awaiting-response'), 'reload-safe submitted status is missing');
assert(contentJs.includes('pausedReason'), 'pause persistence logic is missing');
assert(contentJs.includes('mutation.target'), 'MutationObserver filtering is missing');
assert(contentJs.includes('__CQS_QUEUE_API__'), 'handoff queue API is missing');
assert(contentJs.includes('cqs:queue-item-completed'), 'handoff completion event is missing');
assert(contentJs.includes('cqs_queue_sender_state_v5:'), 'conversation-scoped queue storage is missing');
assert(contentJs.includes('getScopeKeyForLocation'), 'conversation route binding is missing');
assert(contentJs.includes('switchQueueScopeIfNeeded'), 'SPA route switching guard is missing');
assert(contentJs.includes('CQS_QUEUE_LEASE_ACQUIRE'), 'content-side queue lease acquisition is missing');
assert(backgroundJs.includes('CQS_QUEUE_LEASE_ACQUIRE'), 'background queue lease manager is missing');
assert(backgroundJs.includes('senderTabId'), 'sender tab identity handling is missing');
assert(backgroundJs.includes('storage?.session'), 'persistent session-backed queue leases are missing');
assert(backgroundJs.includes('cqs_queue_sender_session_leases_v1'), 'persistent lease storage key is missing');
assert(!backgroundJs.includes('const queueLeases = new Map()'), 'queue leases must not remain memory-only');
assert(backgroundJs.includes('globalThis.CQS_I18N?.isEnglish ? "en-US" : "zh-TW"'), 'localized Oai-Language header is missing');
assert(apiJs.includes('globalThis.CQS_I18N?.isChinese ? "zh-TW" : "en-US"'), 'page attachment Oai-Language rule is missing');
assert(exportJs.includes('collectConversation'), 'full conversation collection logic is missing');
assert(exportJs.includes('hasContiguousExplicitTurnOrder'), 'fast top/bottom export path is missing');
assert(exportJs.includes('metrics.client * 1.45'), 'bounded large-step fallback scan is missing');
assert(exportJs.includes('forceConversationTop'), 'robust top-of-conversation positioning is missing');
assert(exportJs.includes('buildMarkdown'), 'Markdown export builder is missing');
assert(exportJs.includes('download-archive'), 'ZIP archive menu action is missing');
assert(exportJs.includes('downloadable'), 'attachment download classification is missing');
assert(apiJs.includes('/backend-api/conversation/'), 'structured conversation fetch is missing');
assert(apiJs.includes('/backend-api/files/download/'), 'file ID metadata resolution is missing');
assert(apiJs.includes('asset_pointer'), 'structured attachment pointer detection is missing');
assert(apiJs.includes('file|asset)[-_]'), 'underscore-style file IDs are not supported');
assert(apiJs.includes('file-uploads-capability-work'), 'false-positive file slug guard is missing');

assert(apiJs.includes('conversation-api-sandbox'), 'sandbox-only generated output detection is missing');
assert(apiJs.includes('sandboxPaths'), 'multiple sandbox path fallback support is missing');
assert(apiJs.includes('BARE_SANDBOX_RE'), 'bare /mnt/data sandbox detection is missing');
assert(apiJs.includes('decodeURIComponent(value)'), 'URL-encoded sandbox path detection is missing');
assert(exportJs.includes('inspectReactFileMetadata'), 'React-backed download button inspection is missing');
assert(exportJs.includes('inferGeneratedSandboxCandidates'), 'generated download button filename inference is missing');
assert(exportJs.includes('shouldInspectReact'), 'React metadata inspection must be limited to likely file controls');
assert(exportJs.includes('hasFileMetadata()) return result'), 'nearest React metadata short-circuit is missing');
assert(exportJs.includes('String.raw`') && exportJs.includes('\\.(?:${FILE_EXTENSIONS.join("|")}))'), 'filename regex must preserve the literal extension dot');
assert(archiveJs.includes('hasInterpreterSource'), 'sandbox interpreter sources are not selectable in archive planning');
assert(backgroundJs.includes('sandboxPaths.forEach'), 'background sandbox fallback retry support is missing');
assert(backgroundJs.includes('hasInterpreterSource'), 'background sandbox-only resolution is missing');

assert(archiveJs.includes('flattenCandidates'), 'archive candidate planning is missing');
assert(archiveJs.includes('cqs-export-progress-track') && archiveJs.includes('setProgress(value)'), 'staged archive progress bar is missing');
assert(archiveJs.includes('附件清單已準備完成') && archiveJs.includes('Attachment list ready'), 'archive-ready notification is missing');
assert(archiveJs.includes('較舊版本'), 'latest-version exclusion logic is missing');
assert(archiveJs.includes('SINGLE_FILE_WARNING_BYTES'), '100 MB file warning is missing');
assert(archiveJs.includes('TOTAL_ARCHIVE_WARNING_BYTES'), '500 MB archive warning is missing');
assert(archiveJs.includes('使用者上傳') && archiveJs.includes('User Uploads'), 'localized user-upload folders are missing');
assert(archiveJs.includes('ChatGPT提供') && archiveJs.includes('Provided by ChatGPT'), 'localized assistant-output folders are missing');
assert(archiveJs.includes('匯出報告.txt') && archiveJs.includes('export-report.txt'), 'localized archive report filenames are missing');
assert(archiveJs.includes('cqs-archive-download'), 'content/background attachment download channel is missing');
assert(backgroundJs.includes('cqs-archive-download'), 'background attachment download channel is missing');
assert(backgroundJs.includes('credentials: "include"'), 'authenticated background attachment download is missing');
assert(backgroundJs.includes('isAllowedArchiveUrl'), 'background attachment host allowlist is missing');
assert(backgroundJs.includes('resolveArchiveFileRequest'), 'file ID download URL resolution is missing');
assert(zipJs.includes('0x04034b50'), 'ZIP local file header is missing');
assert(zipJs.includes('0x02014b50'), 'ZIP central directory header is missing');
assert(zipJs.includes('0x06054b50'), 'ZIP end record is missing');
assert(handoffJs.includes('# 對話交接摘要') && handoffJs.includes('# Conversation Handoff Summary'), 'localized handoff prompt templates are missing');
assert(handoffJs.includes('kind: "handoff"'), 'handoff prompt is not queued with metadata');
assert(exportJs.includes('cqs-export-beta-badge'), 'archive Beta badge is missing');
assert(exportJs.includes('Beta feature'), 'archive Beta badge English accessibility text is missing');
assert(exportCss.includes('.cqs-export-beta-badge'), 'archive Beta badge styling is missing');
assert(exportJs.includes('data-cqs-custom-prompt-host'), 'custom prompt menu host is missing');
assert(exportJs.includes('setMenuOpen,'), 'export menu close API is missing');
assert(customPromptsJs.includes('cqs_saved_prompts_v1'), 'saved prompt storage key is missing');
assert(customPromptsJs.includes('kind: "saved-prompt"'), 'saved prompts are not routed through the queue API');
assert(customPromptsJs.includes('navigator.clipboard'), 'saved prompt copy action is missing');
assert(customPromptsJs.includes('MAX_PROMPTS = 30'), 'saved prompt item limit is missing');
assert(backgroundJs.includes('notifications.create'), 'system notification creation is missing');
assert(backgroundJs.includes('notifications.onClicked.addListener'), 'notification click handling is missing');
assert(popupJs.includes('permissions.request'), 'optional notification permission request is missing');

if (failures.length) {
  console.error('Static checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Static checks passed.');
