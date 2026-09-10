# AMO Upload Notes

## Package

- File: `chatgpt-queue-sender-firefox-v0.8.9-amo.xpi`
- Version: `0.8.9`
- Manifest: MV3
- Minimum Firefox desktop version: `140.0`
- Minimum Firefox Android version: `142.0`
- Required permissions: `storage`, `alarms`, `notifications`, `downloads`
- No optional API permission is required for v0.8.9.
- Host permissions are limited to ChatGPT/OpenAI pages and OpenAI-controlled attachment hosts.

## v0.8.9 feature overview

v0.8.9 adds a compact direct-download action beside downloadable file citations in ChatGPT assistant replies. The original ChatGPT file button remains unchanged for previewing; the injected adjacent download icon resolves the file ID and sends the selected file directly to Firefox's download manager, removing the extra preview → three-dot menu → Download steps.

The implementation reads `data-file-citation-primary-file-id`, refreshes ChatGPT attachment authorization before starting the download, retries once when a signed URL becomes stale, sanitizes the proposed filename, uses `conflictAction: "uniquify"`, and rejects direct-download messages not originating from a ChatGPT tab. The injected control is excluded from Markdown and ZIP scanning.

### New `downloads` permission

The `downloads` permission is newly required in v0.8.9. It is used only after an explicit user click on the direct-download icon beside a ChatGPT-provided file citation, and only to start that selected file in Firefox's native download manager. The extension does not inspect, modify, erase, open, or upload the user's unrelated download history.

No new host permissions, remote services, analytics, telemetry, or data collection are introduced.

## Previous v0.8.8 feature overview

This UI maintenance release keeps the v0.8.7 one-time scheduling engine but moves scheduled-message management into the same right-bottom queue manager used for normal queued messages. The long-press scheduling panel only collects message text and target date/time; after creation it closes and opens the normal queue manager. Scheduled cards use the same visual location and card layout, with a Scheduled badge and target time, plus Copy and Cancel schedule actions.

Scheduled items remain behaviorally separate from the ordinary sequential queue: they cannot be reordered into the normal queue and are not sent early by queue auto-run. The manager Clear action clears only the regular queue when scheduled items exist.

No new permissions, host permissions, remote services, analytics, telemetry, or data collection are introduced in v0.8.8.

## v0.8.7 feature overview

This release adds one-time scheduled sending. Users long-press the existing Add to queue button to open a compact scheduling panel, review/edit the message, choose a local date and time, and save a single-use task. Scheduled tasks are not recurring and never use `periodInMinutes`.

The selected absolute time is stored locally and registered with Firefox `browser.alarms`. At the requested time, the background script locates the bound ChatGPT conversation tab and sends a `tabs.sendMessage` request to the existing content script. The target tab does not need to be active, and the Firefox window may be minimized. Firefox itself must still be running and the target ChatGPT page must remain available.

Safety behavior is fail-closed. The task is not sent if the target conversation changed or closed, ChatGPT is still busy, another queue runner owns that conversation, or the composer contains an unsent manual draft. A schedule missed by more than two minutes is removed instead of being sent substantially late.

The background issues local Firefox/OS notifications when the schedule triggers and when submission succeeds or fails. For this reason v0.8.7 adds `alarms` and `notifications` as required API permissions. Ordinary response-completion notifications remain controlled by the user's popup setting.

No third-party time server, developer-controlled server, analytics, telemetry, remote code, data collection, or OpenAI API key is introduced. Timing uses the Firefox/operating-system clock, which is normally network-synchronized by the operating system.

## Previous v0.8.6 feature overview

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
- Required API permissions are `storage`, `alarms`, `notifications`, and `downloads`. `alarms` powers one-time scheduled tasks; `notifications` reports scheduled-send trigger/success/failure; `downloads` starts only the ChatGPT file explicitly selected through the new direct-download button.
- The extension does not bypass authentication, subscription, model access, rate limits, or service restrictions.
