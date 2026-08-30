# AMO Upload Notes

## Package

- File: `chatgpt-queue-sender-firefox-v0.8.6-amo.xpi`
- Version: `0.8.6`
- Manifest: MV3
- Minimum Firefox desktop version: `140.0`
- Minimum Firefox Android version: `142.0`
- Required permission: `storage`
- Optional permission: `notifications`
- Host permissions are limited to ChatGPT/OpenAI pages and OpenAI-controlled attachment hosts.

## v0.8.6 feature overview

This maintenance release hardens queue completion detection for long-running ChatGPT coding/tool work. The queue no longer treats the restored Send button as sufficient evidence that a response has finished. Visible assistant-side loading/pending/running states, progress controls, task/tool Stop or Cancel controls, and animated Working/Thinking/Running-style statuses keep the queue blocked. A completed assistant copy-action is used as a strong completion signal; when that control is unavailable, a conservative 12-second stable-response fallback is required.

Queue-button placement now prefers ChatGPT's stable `composer-plus-btn` attachment control and explicitly excludes image/file preview Remove, Delete, Close, Preview, Crop, Replace, and similar controls. This prevents the injected queue button from moving onto uploaded image previews after React composer rerenders.

No new extension permission, host permission, remote service, data collection, or telemetry is introduced.

## Previous v0.8.5 feature overview

This maintenance release hardens the complete conversation ZIP Beta flow for ChatGPT-generated files rendered as React buttons without ordinary links. Sandbox-only files can now be resolved by the background downloader using the conversation ID, assistant message ID, and sandbox path even when no file ID exists. Multiple inferred sandbox paths are retried in order, and one physical React button remains one archive candidate.

Attachment discovery now merges matching file/asset IDs with sandbox paths, recognizes JSON and URL-encoded React metadata, and follows nested hidden tool/system attachment nodes connected to the active branch. A filename-regex escaping bug that could treat action labels such as `Firefox XPI` as filenames has also been corrected.

No new extension permission, host permission, remote service, data collection, or telemetry is introduced.

## Previous v0.8.4 feature overview

This maintenance release adds a compact `Beta` badge beside the complete conversation ZIP archive option in the injected `Export & Transfer` menu. The badge includes localized hover/accessibility text explaining that some attachments may remain unavailable when ChatGPT permissions or signed download links have expired.

No archive logic, permission, storage, host access, network behavior, or data-collection behavior changed in this release.

## Previous v0.8.3 feature overview

The previous maintenance release fixed missing ChatGPT-generated files whose visible controls are React buttons rather than ordinary links. The exporter retains sandbox-only generated outputs, resolves them through the conversation interpreter endpoint, checks Firefox-accessible React metadata, and inspects nearby hidden tool/system attachment nodes associated with the active branch.

## Previous v0.8.2 feature overview

This maintenance release moves the same-conversation multi-tab execution lease from an in-memory `Map` to Firefox `storage.session`. The lease therefore survives Manifest V3 background-script suspension and restart for the duration of the browser session. Acquire, renew, transfer, release, expiry cleanup, and tab-close cleanup are serialized to avoid overlapping writes.

Simplified and Traditional Chinese Firefox send `Oai-Language: zh-TW`; every other Firefox UI sends `en-US` for ChatGPT attachment metadata requests.

The source package now pins `jsdom` and Mozilla `addons-linter` directly, stages only runtime extension files before linting, uses public npm registry URLs in the lockfile, and exposes one `npm run verify` command. No extension permission, host-access, data-collection, or user-facing feature behavior changed.

## Previous v0.8.2 localization overview

v0.8.2 uses Chinese for Simplified and Traditional Chinese Firefox locales. Every other Firefox UI language defaults to English throughout the manifest, popup, injected controls, queue, notifications, saved prompts, exports, reports, and handoff prompt.

## Previous v0.7.1 maintenance overview

This maintenance release fixes three queue-integrity issues found during the v0.7.0 audit. Saved-prompt storage writes are now serialized so rapid add/edit/reorder/delete actions cannot complete out of order and overwrite newer data. Saved prompts and handoff prompts use a scope-safe asynchronous enqueue path that waits for ChatGPT SPA navigation to finish before assigning the prompt to a conversation. Direct queue additions are blocked whenever the current URL and loaded queue scope do not match.

The queue now preserves `saved-prompt` and `promptId` metadata across storage and refresh. Multi-tab execution locking fails closed when the background process is temporarily unavailable, and repeated lease-renewal failures stop the runner instead of allowing duplicate sends. Firefox storage change listeners are registered only once even when both `browser` and `chrome` compatibility globals exist.

The v0.7.0 reusable custom prompt library remains available inside the existing conversation toolbar menu. Users can create up to 30 named prompts, edit or reorder them, and reveal Copy or Send actions by hovering or focusing a saved item. No new permissions are introduced.

## Privacy and security notes

- All export and ZIP processing remains local and user initiated.
- The temporary ChatGPT access token is held only in memory and is never stored or written into the archive/report.
- Authorization headers are used only for same-origin ChatGPT requests.
- Signed CDN downloads never receive the ChatGPT bearer token.
- Non-ChatGPT/OpenAI/oaiusercontent download hosts are rejected before fetch.
- No remote code, analytics, telemetry, advertising SDK, WebSocket, `XMLHttpRequest`, or `sendBeacon` is used.
- No OpenAI API key is required.
- `storage` remains the only required API permission; `notifications` remains optional.
- The extension does not bypass authentication, subscription, model access, rate limits, or service restrictions.
