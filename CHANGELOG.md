# Changelog

## 0.9.4

- Added per-file download feedback to the vertical latest-file list below **Export & Transfer**.
- Clicking a file row now immediately shows a spinner at the right edge while the extension resolves authorization and hands the file to Firefox or ChatGPT native download.
- A successful handoff briefly shows a green check; a failure shows a red error icon and keeps the detailed failure message available on hover.
- Download feedback survives React/UI rerenders because status is keyed by the file identity rather than only the current DOM element.
- Latest-file rows now await the structured direct-download result instead of indirectly clicking the adjacent CQS download icon.
- Native ChatGPT download buttons show a short loading state followed by “handed to ChatGPT” feedback; the extension does not falsely claim that the native transfer itself has completed.
- Added regression coverage for structured direct-download results, native-download feedback, spinner animation, and error-state styling.

## 0.9.3

- Changed the latest-file activity UI below **Export & Transfer** from a horizontal chip row to a vertical file list.
- Each detected file now occupies one full-width row, preserving the existing format accent, compact filename, tooltip, and download behavior.
- Removed horizontal scrolling and horizontal scroll snapping.
- Added a compact maximum height with vertical scrolling after roughly five rows so multiple files do not cover excessive chat content.
- Added regression checks for vertical stacking and horizontal-scroll removal.

## 0.9.2

- Added generated assistant images to the compact latest-content rail below Export & Transfer. ChatGPT estuary images with a `file_...` identity appear as `IMG` cards and can be downloaded through the existing Firefox download path.
- Deduplicates generated images against other attachment identities so the same `file_...` asset is not shown twice.
- Fixed elapsed generation time being reset by same-turn UI/work-state transitions. A new user turn establishes the timestamp; subsequent thinking/tool/file-processing phases reuse it.
- Preserves the timer when a draft route becomes a normal `/c/...` conversation after the first message.
- Detects file organization / file processing status rendered outside the latest assistant turn, so the generation timer remains visible during those ChatGPT work phases.
- Stabilized the fallback timer start when the queue API is temporarily unavailable.

## 0.9.1

- Added ChatGPT-native artifact buttons (for example `Firefox／AMO XPI`, source ZIP, and GitHub-ready ZIP buttons) to the compact latest-file rail below **Export & Transfer**.
- Native artifact buttons no longer need or receive an extra injected direct-download icon; clicking their latest-file chip delegates to the original ChatGPT button.
- Added format-token recognition for native artifact labels that name `XPI`, `ZIP`, `PDF`, `DOCX`, and other formats without exposing a literal filename extension.
- Prevent numeric version suffixes such as `v0.9.0` from being misread as a file extension.
- When **Add to queue** is pressed during ChatGPT dictation, the extension now finishes dictation first, waits for the transcript to settle in the composer, and only then queues the text.
- The same dictation guard is applied to long-press one-time scheduling so the schedule panel opens after the voice transcript is ready.
- Added pure regression coverage for native artifact rail integration, no-extra-button behavior, native-click delegation, and dictation finalization before queueing.

## 0.9.0

- Added a compact latest-file rail directly below the floating **Export & Transfer** control.
- The rail follows only the newest assistant response and shows up to eight detected downloadable files in one horizontally scrollable row.
- File type is the primary visual signal: PDF uses a red outline, Markdown a white/light outline, Word/DOCX blue, spreadsheets green, presentations orange, archives purple, with additional consistent type colors.
- Long filenames are shortened in the rail while the full filename remains available in the native tooltip / accessible label.
- Clicking a recent-file chip reuses the existing v0.8.10 direct-download path instead of opening ChatGPT's file preview.
- When the current response is generating and no current-response file is available yet, the same compact rail becomes an elapsed generation timer (`MM:SS` / `HH:MM:SS`).
- Old files from the previous assistant response are hidden while a new response has started but its assistant turn has not appeared yet.
- Added `getGenerationStatus()` to the queue API so the timer follows the same conservative response lifecycle used by queue safety checks.
- Added pure regression coverage for file-type colors, compact names, elapsed-time formatting, latest-response isolation, and persistence of completed-response file chips.

## 0.8.10

- Fixed Firefox direct-download failure `No permission for cookieStoreId: firefox-default` by no longer passing `cookieStoreId` to `downloads.download()` when the extension does not request the `cookies` permission.
- Expanded the adjacent direct-download action beyond `data-file-citation-*` controls to ChatGPT assistant buttons containing `svg[data-testid="library-file-icon"]`, covering file buttons such as `consulting_v2.pdf`.
- Reuses the existing React metadata inspector to recover file IDs, filenames, signed URLs, sandbox paths, and message IDs from generic ChatGPT file buttons that do not expose citation attributes.
- Added a conservative structured-conversation fallback when a generic file button has no directly exposed file identity. Exact filename matches are preferred; unique version matches and unambiguous single-attachment/message-order matches are used only when safe.
- Generic file buttons with ambiguous multi-file metadata fail closed rather than downloading a potentially wrong attachment.
- Added regression tests for library-file-icon buttons, React metadata recovery, version-labelled download buttons, structured attachment fallback, and the cookieStoreId permission failure.

## 0.8.9

- Added a compact direct-download button immediately beside ChatGPT assistant file-citation links such as generated ZIP, XPI, source, document, and other downloadable files.
- The original ChatGPT filename button is left unchanged and can still open the normal preview; only the new adjacent button bypasses preview and starts a download.
- Reads ChatGPT's `data-file-citation-primary-file-id` metadata, with a single-file citation-group fallback, instead of scraping the displayed filename as the download identity.
- Resolves fresh ChatGPT attachment authorization before download and retries once through the file-ID resolver if a signed URL becomes stale.
- Uses Firefox `downloads.download()` with `saveAs: false` and `conflictAction: "uniquify"`, so the selected file is sent directly to Firefox's download manager without the preview menu flow.
- Direct-download UI is injected only into assistant file citations, reappears after React rerenders, and is excluded from Markdown and ZIP attachment scanning.
- Added download-button loading/success/error states and a local ChatGPT-style toast for direct-download results.
- Added the `downloads` permission; it is used only when the user explicitly clicks the injected direct-download control.
- Added pure Node regression coverage for assistant-only injection, exact file-ID extraction, adjacent placement, safe filenames, stale signed-URL refresh, and non-ChatGPT sender rejection.

## 0.8.8

- Unified scheduled-send management with the existing right-bottom queue manager.
- The long-press scheduling panel now only chooses message/time; after scheduling it closes and opens the normal queue manager.
- Scheduled items use the same queue card layout with a `Scheduled` badge and target send time.
- Scheduled cards support Copy and Cancel schedule actions while remaining isolated from normal queue ordering/auto-run behavior.
- The floating queue badge and preview bar now include scheduled-message counts, and a schedule-only conversation still exposes the same manager entry point.
- Schedule storage changes and conversation-scope switches refresh the unified manager automatically.
- The queue manager's Clear action explicitly clears only the regular queue when scheduled items exist, avoiding accidental schedule cancellation.

## 0.8.7

- Added one-time scheduled sends. Long-press the Add to queue button to open a compact date/time scheduling panel.
- Scheduled messages are stored locally and triggered by Firefox `browser.alarms` using an absolute `when` timestamp; no recurring `periodInMinutes` schedule is used.
- Scheduled sends are bound to the current ChatGPT conversation (or draft tab before a conversation ID exists) and migrate from draft scope to the real conversation scope when ChatGPT creates the conversation.
- Background alarms can trigger a bound ChatGPT tab even when that tab is inactive or the Firefox window is minimized.
- Added independent schedule notifications for trigger, success, and failure.
- Scheduled sends fail closed when the target tab/conversation is unavailable, ChatGPT is already busy, another queue runner owns the conversation, or the composer contains a manual draft.
- Future schedules are restored from local storage when the MV3 background restarts. Tasks missed by more than two minutes are not sent late.
- Added cancellation and per-conversation scheduled-item listing in the long-press panel.
- Added the required `alarms` and `notifications` permissions. Ordinary response-completion notifications remain user-configurable in the popup.
- Added `tests/schedule-background-simulation.mjs` for one-shot alarms, background-tab dispatch, success/failure notifications, cancellation, draft-scope migration, and wrong-conversation blocking.

## 0.8.6

- Prevent queue auto-send while the latest assistant turn still shows active tool/work indicators, even when ChatGPT has already restored the normal Send button.
- Prefer the completed assistant copy-action control as a strong response-completion signal; otherwise require a conservative 12-second stable fallback before continuing.
- Track assistant-response signature changes so tool/progress DOM activity resets the idle countdown instead of being mistaken for completion.
- Before writing a queued prompt into the composer, block while the newest visible conversation role is still an unanswered user turn or an unsettled assistant turn.
- Anchor the queue button to ChatGPT’s stable `composer-plus-btn` control before using geometry/text fallbacks.
- Exclude attachment/image preview controls such as Remove/Delete/Preview buttons from queue-button placement candidates.
- Added DOM regression scenarios for Send-button-restored-during-tool-work and image-upload attachment-preview placement.

## 0.8.5

- Allow sandbox-only generated files to be resolved by the background downloader using conversation ID, assistant message ID, and sandbox path without requiring a file ID.
- Forward and retry all inferred sandbox path candidates instead of using only the first candidate.
- Merge matching file/asset IDs and sandbox paths into one attachment while retaining both resolution strategies.
- Traverse nested hidden tool/system descendants connected to the active branch without scanning alternate visible branches.
- Detect React metadata stored as JSON strings, URL-encoded sandbox paths, bare `/mnt/data/...` paths, file IDs, and asset IDs.
- Fixed the filename regular-expression escaping bug that could misclassify button labels such as `Firefox XPI` as filenames.
- Keep one archive candidate per React download button while preserving alternate sandbox paths as resolver fallbacks.
- Added pure Node regression coverage for React buttons without `href`, sandbox-only background resolution, multi-path fallback, named ID/path merging, and nested hidden nodes.

## 0.8.4

- Added a compact `Beta` badge beside the complete conversation ZIP archive option in the `Export & Transfer` menu.
- Added localized hover text explaining that some attachments may remain unavailable when ChatGPT permissions or download links have expired.
- Added styling and regression checks for the archive Beta indicator without changing archive behavior or permissions.

## 0.8.3

- Detect generated files represented only by `sandbox:/mnt/data/...` without a file ID.
- Resolve sandbox-only outputs through the conversation interpreter endpoint using the assistant message ID.
- Inspect Firefox-accessible React button metadata for file IDs, filenames, sandbox paths, and download URLs.
- Infer bounded sandbox filename candidates for generated XPI/source ZIP buttons that expose only action labels.
- Include nearby hidden tool/system attachment nodes associated with the active branch.
- Prevent sandbox filenames from being incorrectly paired with echoed upload IDs found only in message metadata.
- Treat sandbox interpreter sources as selectable archive candidates and show them in the review list.
- Added structured attachment, sandbox-only, hidden-tool-node, and generated-button regression coverage.

## 0.8.2

- Added staged progress bars with percentage, elapsed time, and estimated remaining time for conversation scanning, attachment authorization, downloads, and ZIP packaging.
- Improved top-of-conversation detection so delayed image height changes no longer trigger a false incomplete-scan warning.
- Cross-checks visible message count against the structured active branch before showing an incomplete-content confirmation.
- Added a completion toast and optional Firefox notification when the attachment review list is ready.
- Changed language fallback: Simplified and Traditional Chinese Firefox use Chinese; all other Firefox languages default to English.
- Added `zh_CN` manifest locale and changed the manifest default locale to English.
- Updated stale in-product version labels to v0.8.2.

## 0.8.1

- Queue execution leases now use `storage.session`, so they survive Firefox MV3 background-script restarts during the same browser session.
- Lease acquire, renew, transfer, release, expiry cleanup, and tab-close cleanup are serialized and persisted.
- Simplified and Traditional Chinese Firefox send `Oai-Language: zh-TW`; every other Firefox UI language sends `en-US`.
- Replaced the `web-ext` development dependency with Mozilla `addons-linter` directly, avoiding the unrelated `zip-dir` packaging dependency.
- Added a reproducible lint staging script, pinned dependencies, Node/npm engine requirements, public npm lock URLs, and a single `npm run verify` command.
- Added regression tests for background restart lease persistence and localized archive request headers.

## 0.8.0

- Added Firefox UI-language detection with `browser.i18n.getUILanguage()`.
- All non-Chinese Firefox locales now use English throughout the extension.
- Simplified and Traditional Chinese Firefox locales use the existing Chinese interface.
- Localized the manifest name, description, and toolbar title through `_locales/en` and `_locales/zh_TW`.
- Localized the popup, queue controls, progress status, manager drawer, notifications, saved prompts, export menu, dialogs, errors, and retry messages.
- Localized Markdown metadata and ZIP archive planning, progress, download errors, and export reports.
- English ZIP archives now use `User Uploads/`, `Provided by ChatGPT/`, and `export-report.txt`; Traditional Chinese archives retain the existing folder and report names.
- Added a full English Conversation Handoff Summary prompt while retaining the existing Traditional Chinese prompt.
- Added locale-selection, placeholder interpolation, and localized background-notification regression tests.
- No new permissions or data collection were introduced.

## 0.7.1

- Fixed a race where rapid saved-prompt edits could complete storage writes out of order and lose the newest changes.
- Added scope-safe asynchronous enqueueing so saved prompts and handoff prompts wait for ChatGPT SPA navigation to finish before entering a queue.
- Blocked direct queue additions during a conversation-scope transition to prevent prompts being stored in the previous chat.
- Preserved `saved-prompt` and `promptId` metadata across queue persistence and page refreshes.
- Changed multi-tab queue locking to fail closed when the background process is temporarily unavailable, with renewal-loss protection.
- Avoided registering the same Firefox storage listener twice through both `browser` and `chrome` aliases.
- Added concurrent-persistence and route-switch regression tests.

## 0.7.0

- Add a reusable custom prompt library inside the `匯出與轉移` menu.
- Save up to 30 named prompts in local Firefox WebExtension storage and synchronize changes across ChatGPT tabs.
- Show saved prompt actions only on mouse hover or keyboard focus: `複製` and `發送`.
- Route `發送` through the existing conversation-scoped queue API, so prompts stay bound to the currently open ChatGPT conversation and respect the multi-tab execution lease.
- Add prompt creation, editing, deletion, and up/down ordering in a compact management dialog.
- Prefill a new saved prompt from the current ChatGPT composer draft when text is already present.
- Use the Clipboard API from an explicit user click with a local `execCommand` fallback; no new permission is required.
- Add custom prompt persistence, copy, send, reorder, and delete regression tests.

## 0.6.4

- Bind each queue to its originating ChatGPT conversation instead of sharing one global queue across every tab.
- Store conversation queues under independent keys derived from the conversation ID; unsaved new chats use a tab-scoped draft key.
- Stop and preserve the original queue when the user navigates to a different conversation in the same tab.
- Migrate a draft-tab queue to the newly created conversation ID after ChatGPT changes the SPA route following the first send.
- Add a background queue execution lease so two tabs opened to the same conversation cannot send the same queued prompt twice.
- Synchronize scoped queue changes across tabs and release execution leases when a tab closes.
- Add one-time migration for the previous global v0.6.3 queue state.
- Add regression coverage for cross-conversation isolation and same-conversation lease ownership.

## 0.6.3

- Fixed HTTP 403 failures affecting uploaded ZIP, XPI, Markdown, and archive files after they had already been discovered.
- Replaced the single legacy metadata route with a role-aware fallback chain covering interpreter outputs, conversation attachments, generic file downloads, upload-completion downloads, and the legacy endpoint.
- Added a Firefox page-origin retry for same-origin metadata requests rejected from the isolated extension context.
- Prefer signed URLs already resolved in the ChatGPT page instead of resolving the same file ID again in the background script.
- Deduplicate one physical file ID globally across user and assistant messages while preserving the first chronological source role.
- Added sandbox path/message ID forwarding for generated files and improved nested MIME/filename extraction.
- Added the current `/backend-api/files/download/{fileId}` metadata route as the first resolver, followed by role-aware fallbacks.
- Refresh signed URLs immediately before each download and re-resolve expired URLs after HTTP 401/403/404.
- Added request device/language headers used by the ChatGPT web flow while keeping all credentials in memory only.
- Prefer Content-Disposition filenames and repair `.bin`/missing extensions from the downloaded MIME type.
- Added regression tests for page-origin 403 fallback, expired signed URL recovery, user-upload POST resolution, cross-role duplicate removal, and modern attachment endpoints.

## 0.6.2

- Fixed structured attachment scanning so OpenAI Help Center article slugs such as `file-uploads-faq` are no longer mistaken for file IDs.
- Added support for current `file_...` / `asset_...` identifiers in addition to legacy hyphenated IDs.
- Restricted file-ID extraction to exact opaque tokens, dedicated URL parameters, and path segments instead of arbitrary message text.
- Added regression tests covering the failed v0.6.1 export report and real underscore-style file IDs.

## v0.6.1

- 修正完整對話 ZIP 只包含 Markdown 與匯出報告、未收錄 XPI／ZIP 等附件的問題。
- 新增目前聊天室結構化資料掃描，從 `asset_pointer`、`file_id` 等欄位取得使用者上傳與 ChatGPT 產生檔案的識別碼。
- 新增 `/backend-api/files/download/{fileId}` 解析流程，將檔案 ID 轉成當次登入可用的下載網址。
- DOM 附件卡片與結構化檔案資料會合併去重；相同檔名優先採用具有檔案 ID 的來源。
- 無法解析的附件線索會出現在確認清單及 `匯出報告.txt`，不再靜默略過。
- 修正 `file_asset_pointer` 結構名稱被誤判為檔案 ID。
- 修正無副檔名的 UUID／聊天室識別碼被誤列為附件。
- 支援檔案資訊 API 回傳相對下載網址。
- 避免將 ChatGPT Bearer token 傳送到簽名 CDN 下載網址；權杖僅用於同源的檔案資訊解析。


## v0.6.0

- 新增「下載完整對話封存 ZIP」，並保留原有 Markdown 下載與交接摘要功能。
- ZIP 直接使用聊天室名稱命名，內含同名 Markdown、`使用者上傳/`、`ChatGPT提供/` 與 `匯出報告.txt`。
- 新增實際附件判斷；一般外部網站、引用來源與 GitHub／YouTube 等連結不會加入封存。
- 新增版本系列辨識，支援 V1/V2、2.0/2.1、最終版、最新版、修改版、(1)/(2) 與聊天室出現順序。
- 不同來源、不同副檔名，以及 source／AMO 等不同用途會分開保留。
- 匯出前新增檔案確認清單，可全選、手動勾選或重新套用只選最新版本。
- 單一附件超過 100 MB、封存內容超過 500 MB 時顯示確認警告。
- 個別檔案下載失敗時繼續建立 ZIP，並將原因寫入匯出報告。
- 新增本機 ZIP32 Store writer，不使用外部壓縮服務、遠端程式碼或 `downloads` 權限。
- HTTPS 附件改由背景腳本透過 OpenAI 控制的檔案主機權限下載，再以 runtime port 分段傳回目前分頁；非 OpenAI 網域會在請求前被拒絕。
- 新增版本選擇與 ZIP 結構自動測試。

## v0.5.1

- 大幅加速 Markdown 對話匯出。
- 一般對話改為直接跳到最上方確認較早訊息，再跳到底部完成收集。
- 移除沿著長回答逐小段捲動的固定慢速流程。
- 以訊息數量與捲動高度是否穩定，判斷頂部較早內容是否載入完成。
- 偵測到對話 turn 編號連續時直接完成；只有虛擬捲動或編號缺口才執行備援掃描。
- 備援掃描每次至少移動 1.45 個畫面，最多 56 個檢查點，最長約 12 秒。
- Markdown 下載完成提示新增實際耗時。
- 新增 25,000px 長頁面的快速匯出效能回歸測試，要求一般快速路徑在 3 秒內完成。

## v0.5.0

- 新增聊天室左上角「匯出與轉移」下拉按鈕。
- 新增目前對話分支 Markdown 匯出。
- 匯出前會自動向上載入較早訊息，再由上到下掃描目前分支。
- Markdown 保留角色、順序、標題、清單、程式碼、表格、連結與圖片替代文字。
- 附件以檔名、類型、來源角色與可見連結表示，不自動下載附件實體。
- 無法確認完整載入時會先提示使用者，不會直接宣稱匯出完整。
- 新增標準結構的「對話交接摘要」指令預覽與編輯視窗。
- 交接指令會以 `handoff` metadata 加入既有佇列，支援等待、排序與重新整理恢復。
- 交接摘要回覆完成後，新增「複製交接摘要」按鈕。
- 新增 `export/markdown-converter.js`、`export/conversation-export.js`、`export/handoff-prompt.js` 與獨立 UI 樣式。
- 新增 Markdown 匯出與交接流程的 jsdom 模擬測試。
- 匯出與轉移介面在 v0.5.0 先以 Firefox 桌面版為主要支援範圍。

## v0.4.0

- 新增所有回覆完成偵測，手動送出與佇列送出的訊息皆適用。
- 新增柔和雙音提示音。
- 新增 Firefox／作業系統桌面通知，點擊通知可回到來源分頁。
- 新增工具列 popup，可開關總提醒、系統通知、提示音與「離開分頁時才提醒」。
- 新增測試提醒按鈕。
- `notifications` 改採選用權限，只在使用者主動開啟系統通知時要求。
- 完成提醒加入事件去重，避免佇列等待器與全域監測器重複提醒同一回覆。
- 擴充功能 icon、工具列 icon、popup 與管理抽屜改用新版圖示。
- 新增背景通知模擬測試與 popup／完成偵測煙霧測試。

## v0.3.5

- 新增送出成功確認：只有在輸入框清空、使用者訊息增加或生成狀態出現後，才將訊息視為已提交。
- 送出按鈕未生效時加入一次 Enter fallback；仍失敗則保留訊息並顯示重試。
- 回覆完成改採生成活動與穩定閒置狀態雙重判斷，降低過早送出下一筆的風險。
- 擴大原生停止與串流狀態偵測範圍，同時排除擴充功能自己的停止按鈕及語音控制。
- 修正停止發送時，尚未送出的目前訊息仍被送出的問題。
- 停止或錯誤後加入情境式「繼續／重試」；一般加入佇列仍會自動開始。
- 暫停狀態會保存至本機 storage，重新整理後不會自行恢復已手動停止的佇列。
- 保存 `awaiting-response` 提交狀態，重新整理頁面後不重複送出同一則訊息。
- 修正最後一則結束與新增訊息同時發生時，新增訊息可能留在佇列但不自動啟動的競態。
- 發送中新增、刪除與復原待送訊息時，進度分母同步調整；目前正在處理的訊息不允許復原。
- 偵測到輸入框已有未加入佇列的草稿時會暫停，避免覆蓋使用者文字。
- 修正外掛 UI 自身更新反覆觸發 MutationObserver 所造成的持續重繪。
- 管理抽屜依 ChatGPT 輸入框位置自動向上避讓。
- 發送進度新增脈動動畫，並支援減少動態效果設定。

## v0.3.4

- 加入 Firefox AMO 資料收集聲明：`data_collection_permissions.required = ["none"]`。
- Firefox 最低版本調整為 `140.0`。
- 新增 `PRIVACY.md` 與 `FIREFOX_STORE_LISTING.md`。

## v0.3.3

- 移除一般流程中的開始／播放按鈕。
- 加入佇列後自動接續送出。
- 修正灰色送出箭頭、語音／音訊按鈕與外掛停止按鈕的判斷。
- 發送狀態改為等待可送出、正在送出、等待回覆完成。

## v0.3.2

- 修正發送中進度卡住與外掛停止按鈕誤判問題。
- 發送中加入新訊息時，進度總數即時更新。

## v0.3.1

- 調整佇列按鈕位置與樣式。

## v0.3.0

- 管理視窗改為右下角抽屜。
- 佇列管理改為卡片式列表。
- 加入復原、停止後續發送與進度顯示。
