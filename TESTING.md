# Testing Checklist

## Automated checks

```bash
npm ci
npm run verify
```

## Queue scenarios

1. Add two prompts while ChatGPT is idle; verify progress changes from `1/2` to `2/2`.
2. Add prompts while ChatGPT is already responding; verify status remains `等待可送出` until the native stop/streaming state ends.
3. Verify both idle UI variants work: disabled gray send arrow and voice/audio button.
4. Add another prompt while `1/1` is running; verify the denominator becomes `1/2`.
5. Delete or undo a pending prompt while running; verify the denominator decreases.
6. Click Stop before the current prompt is submitted; verify it remains queued and is not sent.
7. Click Stop while ChatGPT is responding; verify the current response continues but later prompts do not send.
8. Refresh while the first message is waiting for a response; verify it is not sent a second time.
9. Simulate a failed send by making the native send control unavailable; verify the prompt remains queued and Retry appears.
10. Confirm the manager does not cover the composer at common desktop widths.
11. Type a manual draft while the queue is waiting; verify the extension pauses instead of overwriting it.

## Completion notification scenarios

12. Open the toolbar popup and enable completion reminders.
13. Send a normal message without using the queue; verify completion is detected.
14. Add two queued prompts; verify each completed response produces at most one reminder.
15. Enable only system notifications; verify no sound plays.
16. Enable only sound; verify no desktop notification appears.
17. Enable both; verify both reminder types work.
18. Enable `離開分頁時才提醒`, keep ChatGPT focused, and verify no reminder appears.
19. Switch to another tab while ChatGPT is responding; verify the reminder appears after completion.
20. Click the system notification; verify Firefox returns to the correct ChatGPT tab.
21. Click `測試提醒` in the popup; verify the enabled reminder methods activate.
22. Deny the optional notification permission; verify the popup keeps sound available and disables only system notification.
23. Reload ChatGPT while a response is already streaming; verify completion is detected once and is not duplicated.
24. Confirm the extension icon appears in Firefox Add-ons, the toolbar popup, notifications, and the queue manager header.

## Markdown export scenarios

25. Confirm `匯出與轉移` appears at the upper-left of the main conversation area on desktop.
26. Export a short text-only conversation and verify user/ChatGPT roles and message order.
27. Export a conversation containing headings, bold text, lists, quotes, code blocks, inline code, tables, and links.
28. Export a conversation containing user-uploaded files; verify filename, type, source role, and visible link are represented.
29. Export a conversation containing a ChatGPT-generated download link.
30. Export a conversation containing images; verify useful alt text or image description is represented without exporting UI avatars.
31. Export a long conversation with more than 50 turns; verify the page scrolls upward, scans downward, and restores the previous position.
32. Confirm only the currently visible branch is exported after editing or regenerating a message.
33. Start export while ChatGPT is still responding; verify the incomplete-response warning appears.
34. Force the loading/scanning time limit; verify the extension warns that completeness cannot be confirmed.
35. Cancel during export; verify scrolling is restored and no file is downloaded.
36. Confirm the `.md` filename uses the conversation title and a timestamp.
37. Open the downloaded Markdown in a text editor and verify UTF-8 Traditional Chinese content.
38. Verify Queue Sender UI, export controls, toasts, and `複製交接摘要` are not included in a later export.

## Conversation handoff scenarios

39. Open `產生對話交接摘要`; verify the standard structured prompt is visible and editable.
40. Cancel the preview; verify nothing is added to the queue.
41. Confirm while idle; verify the handoff prompt is queued and automatically sent.
42. Confirm while another response is generating; verify it waits and sends later.
43. Confirm while other prompts are queued; verify the handoff item is placed last.
44. Fill the queue to 10 messages; verify a clear queue-full error appears.
45. Refresh while the handoff prompt is waiting for its response; verify the `handoff` metadata is preserved.
46. After the handoff response finishes, verify `複製交接摘要` appears beside that answer.
47. Click the copy button and verify only the handoff answer is copied as Markdown.
48. Export the conversation after handoff completion; verify the extension copy button itself is excluded.

## Responsive scope

49. Verify desktop layouts at 1280×720, 1440×900, and 1920×1080.
50. At narrow/mobile widths, verify the v0.8.2 export control is hidden and the existing queue UI remains usable. Android export adaptation is deferred.

## Fast export performance

51. Export a conversation with only 5–15 turns but several very long assistant answers. Verify it uses large top/bottom jumps and completes in a few seconds rather than scrolling for one or two minutes.
52. Export a virtualized or unusually structured long conversation. Verify the bounded fallback scan moves more than one viewport per step and still restores the original position.
## Complete ZIP archive scenarios

53. Open `匯出與轉移` and verify all three actions appear: Markdown, complete ZIP archive, and handoff summary.
54. Create an archive from a conversation with no attachments; verify the ZIP contains the conversation Markdown and `匯出報告.txt`.
55. Include user uploads and ChatGPT-generated files; verify they are placed under `使用者上傳/` and `ChatGPT提供/`.
56. Include `project-v1.zip`, `project-v2.zip`, and `project-v2.1.zip`; verify only `project-v2.1.zip` is selected by default.
57. Include `plugin-v0.5.1-source.zip` and `plugin-v0.5.1-amo.xpi`; verify both remain selected as different purposes/file types.
58. Include `報告.docx`, `報告_修改版.docx`, and `報告_最終版.docx`; verify the final version is selected by default.
59. Restore an automatically excluded old version, create the ZIP, and verify both selected versions are included.
60. Uncheck a default latest file; verify it appears under manually deselected files in `匯出報告.txt`.
61. Include a GitHub `.md` link and an external PDF citation; verify they remain links in Markdown but are not offered as ZIP attachments.
62. Include a visible ChatGPT image or generated image file; verify it is detected as an attachment rather than an avatar or citation favicon.
63. Make one attachment return HTTP 404; verify the remaining files are archived and the failure is recorded.
64. Make an attachment URL return HTML instead of the expected file; verify it is treated as a failed login/page response.
65. Test a single file above 100 MB; verify an extra confirmation appears before it is included.
66. Test a selected total above 500 MB; verify an extra archive-size warning appears.
67. Cancel during attachment download; verify the active request is aborted and no ZIP is downloaded.
68. Verify the ZIP filename is exactly the sanitized conversation title plus `.zip`, without an added timestamp.
69. Extract the ZIP with Firefox/Windows/macOS archive tools and verify Traditional Chinese filenames are preserved.
70. Verify `npm run test:archive` selects the expected latest versions and produces a ZIP with valid local, central-directory, and end records.
71. Verify `npm run test:download` streams an allowed OpenAI attachment through the background port and rejects a non-OpenAI host before fetching.
72. In Firefox Add-ons permissions, confirm the added OpenAI attachment-host access is visible and that ZIP export still does not require the `downloads` permission.



## v0.6.2 structured attachment regression

53. In a chat containing user-uploaded ZIP/XPI files and assistant-generated downloads, open the ZIP archive preview. Verify both source types appear even when the visible buttons have no direct `href`.
54. Verify a visible filename clue is replaced by the matching structured file-ID record rather than duplicated.
55. Verify `file_asset_pointer` and conversation UUID strings do not appear as files.
56. Complete the archive and confirm the selected XPI/ZIP files exist under `使用者上傳/` or `ChatGPT提供/`.
57. If structured conversation data cannot be read, verify the preview/report shows unresolved attachment clues rather than reporting zero files without explanation.
58. Verify ordinary external references remain excluded.


## v0.6.3 live attachment download regression

73. Re-test a conversation containing an uploaded XPI, source ZIP, Markdown file, images, audio, and a previously exported ZIP.
74. Verify the preview contains each physical `file_...` ID only once, even if the same ID appears in both user and assistant structured data.
75. Verify every file first tries `/backend-api/files/download/{fileId}`; an uploaded user file then falls back to `/backend-api/files/{fileId}/uploaded` and the remaining conversation/file endpoints.
76. Verify an assistant sandbox file with `message_id` and `sandbox_path` tries the interpreter download endpoint first.
77. Simulate HTTP 403 in the isolated content-script request and verify the page-origin retry resolves a signed download URL.
78. Verify a pre-resolved `oaiusercontent.com` URL is downloaded directly and the bearer token is not forwarded to the CDN. Leave the preview open until that URL expires and verify HTTP 401/403/404 triggers a fresh file-ID resolution.
79. Verify ZIP/XPI/MD failures, if any remain, show the attempted endpoint strategies in `匯出報告.txt` rather than only a generic HTTP 403.
80. Verify the completed ZIP contains no duplicate copies of the same file ID under both source folders.
81. Verify a file shown as `file_....bin` receives the original Content-Disposition filename when available; otherwise its extension is repaired from Content-Type (for example PNG, ZIP, XPI, MD, or M4A).

## v0.6.4 conversation binding and multi-tab isolation

82. In conversation A, add two prompts and leave the queue running. Open conversation B in a new Firefox tab; verify B shows an empty queue and sends nothing from A.
83. While A is waiting for a response, navigate the same tab to conversation B; verify A's remaining queue is preserved and B does not receive the next prompt.
84. Return to conversation A; verify its preserved queue reappears and can continue from the correct submitted/pending state.
85. Open the same conversation A in two tabs while it has pending prompts; verify only one tab sends and the second tab reports that another tab is executing the queue.
86. Close the owner tab; after the lease expires or is released, verify the second tab can continue the remaining queue without duplicating an already submitted message.
87. Start a queue from a brand-new `/` chat. After the first prompt creates a `/c/{conversationId}` route, verify the remaining prompts stay attached to that newly created conversation.
88. Upgrade from v0.6.3 with a saved global queue; verify it migrates once to the active ChatGPT conversation and the legacy global key is removed.

## v0.7.0 saved custom prompts

1. Open `匯出與轉移` and confirm a `自訂提示語` section appears below the export actions.
2. Click `新增`, save a named prompt, close and reopen the menu, and verify the prompt persists.
3. Put text in the ChatGPT composer before clicking `新增`; verify the editor prefills that draft without clearing the composer.
4. Hover a saved prompt and verify only then the `複製` and `發送` buttons appear. Repeat using keyboard Tab focus.
5. Click `複製` and paste into a text editor; the full prompt text must be preserved.
6. Click `發送` in an idle conversation and verify it is routed through the current conversation queue.
7. While ChatGPT is generating, click `發送`; verify the saved prompt waits and sends only after the current response finishes.
8. Keep a queue running in conversation A, switch to conversation B, and send a saved prompt; it must enter B's queue and must not merge with A.
9. Open the same conversation in two tabs and send a saved prompt; the existing execution lease must prevent duplicate sending.
10. Use `管理提示語` to edit, delete, move up, and move down; reopen the menu and verify order and content persist.
11. Open another ChatGPT tab and confirm saved prompt changes synchronize through `storage.local`.
12. Verify the 31st prompt is rejected with a clear local limit message.
## v0.7.1 regression checks

51. Rapidly create two saved prompts without waiting between clicks; both must remain after reopening the menu and after a page refresh.
52. Rapidly reorder and edit prompts; the final order and latest text must remain in `storage.local`.
53. In one tab, navigate from conversation A to conversation B and immediately click Send on a saved prompt; it must wait for B to finish loading and must never appear in A's queue.
54. Trigger a handoff prompt during the same SPA route transition; it must use the new conversation scope.
55. Temporarily make background messaging unavailable; no queue item may be sent until the execution lease can be acquired again.
56. Refresh after queueing a saved prompt and verify its `saved-prompt` kind and `promptId` remain in the scoped queue record.



## v0.8.2 Firefox-language localization

57. Set Firefox display language to English, restart Firefox, and verify the toolbar name and popup are English.
58. In English Firefox, verify the queue button, status bar, stop/retry messages, and bottom-right manager drawer are English.
59. In English Firefox, trigger both a completion notification and the popup test notification; titles and messages must be English.
60. In English Firefox, open `Export & Transfer`; verify Markdown, ZIP archive, handoff, and saved-prompt controls are English.
61. Create an English-mode ZIP and confirm it contains `User Uploads/`, `Provided by ChatGPT/`, and `export-report.txt`.
62. Confirm the English export report uses English headings, statuses, failure reasons, and file-source labels.
63. Open the handoff dialog in English Firefox and verify the default prompt starts with `Based on all visible messages...` and uses `# Conversation Handoff Summary`.
64. Switch Firefox to Japanese, German, or another non-Chinese interface language; after restart, verify the extension uses English.
65. Confirm ChatGPT messages, attachment filenames, and saved custom prompt text remain unchanged in both languages.
66. Run `npm run test:i18n` and `npm run test:i18n-runtime`.

## v0.8.2 reproducible verification

Use Node.js 20 or later and npm 10 or later:

```bash
npm ci
npm run verify
```

`npm run verify` runs syntax/static checks, queue/background/archive simulations, the jsdom UI suites, and Mozilla `addons-linter` against a staged directory containing runtime extension files only. The same commands are included in `.github/workflows/validate.yml`.

## v0.9.4 latest-file download feedback regression

1. Click a directly resolvable PDF/ZIP/DOCX row below **Export & Transfer** and confirm a spinner appears immediately at the right edge.
2. If authorization/resolution takes several seconds, confirm the spinner remains visible for the entire wait and survives latest-file UI rerenders.
3. On successful `CQS_DIRECT_DOWNLOAD`, confirm the spinner becomes a green check briefly.
4. Force a resolver/download failure and confirm the row shows a red error icon; hover it and confirm the detailed error message is preserved.
5. Click a ChatGPT-native XPI/ZIP artifact row. Confirm a short spinner is visible and then changes to delegated/success feedback without adding a duplicate adjacent download icon.
6. Confirm repeated clicks while one row is in the loading state do not start duplicate downloads.
7. Run `npm run test:direct-download` and `npm run test:recent-files`.

## v0.9.3 vertical latest-file list regression

1. Generate a response containing at least three downloadable files. Confirm the file cards below **Export & Transfer** appear one per row from top to bottom, not side by side.
2. Confirm every row uses the same compact width and preserves the file-type accent and truncated filename.
3. Confirm there is no horizontal scrollbar and no horizontal scroll gesture is required.
4. Generate more than five files. Confirm the file area stays compact and scrolls vertically inside itself rather than extending across the chat or growing indefinitely.
5. Confirm the generation timer still occupies the same activity area when the current response has no files.
6. Run `npm run test:recent-files` and confirm `recent-files-layout-simulation.mjs` passes.

## v0.9.2 generated-image and elapsed-timer regression

1. Start a new response and note the elapsed timer. Trigger additional same-turn processing/work UI and confirm the timer does not restart from `00:00`.
2. Start from a draft/new-chat route, send the first message, let ChatGPT navigate to `/c/...`, and confirm the elapsed timer preserves its original start.
3. During a response, expose a top-level `正在整理檔案` / `Organizing files` status outside the assistant message and confirm the timer remains visible.
4. Confirm a generated image using `backend-api/estuary/content?id=file_...` appears as an `IMG` card in the latest-content rail.
5. Click the image card and confirm Firefox begins the image download through the existing `CQS_DIRECT_DOWNLOAD` background path.
6. If the same image file ID is exposed through another attachment source, confirm only one rail card remains.
7. Run `npm run test:generation-media`.

## v0.9.1 native-artifact rail and dictation regression

1. In a latest assistant response containing native generated buttons such as `Firefox／AMO XPI`, `完整原始碼 ZIP`, and `GitHub-ready 原始碼 ZIP`, confirm all appear in the compact latest-file rail.
2. Confirm those native artifact buttons do **not** receive an extra adjacent CQS direct-download icon.
3. Click each corresponding latest-file chip and confirm ChatGPT's original native button is invoked.
4. Confirm labels ending in versions such as `v0.9.0` still classify as XPI/ZIP rather than extension `0`.
5. Start ChatGPT dictation, speak text, then press **Add to queue** before manually stopping dictation.
6. Confirm the extension finishes/submits dictation first, waits until the transcript appears and stabilizes in the composer, then adds that final text to the queue.
7. Confirm an idle non-dictation composer is unaffected.
8. Repeat with a long press and confirm the one-time scheduling panel opens only after dictation handling completes.
9. If transcription never settles, confirm no partial composer text is queued and a local error toast is shown.

## v0.9.0 latest-file rail and generation timer regression

1. Open a conversation whose latest assistant response contains a PDF, Markdown, DOCX, XLSX, PPTX, and ZIP/XPI output. Confirm one compact file row appears directly below **Export & Transfer**.
2. Confirm PDF has a red first-impression outline, Markdown a white/light outline, DOC/DOCX blue, spreadsheets green, presentations orange, and archives purple.
3. Confirm the extension label (for example `PDF`, `MD`, `DOCX`) remains visible even when a filename is long.
4. Confirm long names are visually shortened and the full filename remains available from the chip tooltip / accessible label.
5. With many files, confirm the current UI stacks them vertically and uses an internal vertical scrollbar after the compact height limit.
6. Click a recent-file chip and confirm it uses the direct-download flow rather than opening ChatGPT file preview.
7. Send a new prompt after a previous response that contained downloadable files. While the new response has not produced an assistant turn yet, confirm the old file chips disappear.
8. While the new response is generating and no current-response file exists, confirm the same location shows `生成中 / Generating` and an increasing `MM:SS` timer.
9. When the current assistant response begins but still has no file, confirm the timer continues.
10. When a file appears in the current response, confirm the timer is replaced by the current-response file row.
11. After generation completes, confirm current-response file chips remain visible until a newer response becomes current.
12. For a response that finishes without downloadable files, confirm the timer disappears and the compact host does not leave an empty panel.
13. Run `npm run test:recent-files` and confirm the color mapping, compact filename, timer formatting, previous-response suppression, and post-completion visibility tests pass.

## v0.8.10 generic direct-download regression

1. Verify a normal ChatGPT assistant file button with `svg[data-testid="library-file-icon"]` but no `data-file-citation-*` attributes receives the adjacent direct-download icon.
2. Verify a button labelled `consulting_v2.pdf` can recover its file ID from React metadata and download without opening the preview.
3. Verify a button labelled like `下載 v2.2.12 驗證報告` can use the structured conversation fallback when the visible label is not the real filename.
4. Verify exact filename matching is preferred over heuristic matching.
5. Verify version matching is accepted only when it identifies one unique assistant attachment.
6. Verify ambiguous multi-file metadata does not create or execute a potentially wrong single-file download.
7. Verify `downloads.download()` receives no `cookieStoreId` without the `cookies` permission, including when `sender.tab.cookieStoreId` is `firefox-default` or a container ID.
8. Confirm the existing filename-citation path still works and React rerenders restore the injected icon.
9. Confirm user upload buttons do not receive an assistant direct-download icon.

## v0.8.9 direct file download regression

1. Open a ChatGPT assistant reply containing a generated file citation with `data-file-citation-primary-file-id`.
2. Confirm the original filename button still opens ChatGPT's normal preview.
3. Confirm a compact download icon appears immediately to the right of the filename.
4. Click only the new icon and confirm Firefox begins downloading without first opening the file preview or its three-dot menu.
5. Confirm duplicate filenames use Firefox's unique-name behavior rather than overwriting an existing file.
6. Generate a new file while the conversation is open and confirm the download icon appears after React inserts the new citation.
7. Cause a React rerender around an existing citation and confirm the injected download control can be restored if removed.
8. Confirm user-side upload citations do not receive the assistant direct-download control.
9. Confirm Markdown export contains the original file citation text but not the injected direct-download control label/icon.
10. Confirm ZIP attachment scanning does not create a duplicate candidate from the injected direct-download button.
11. If a previously resolved signed URL has expired, confirm the background retries file-ID metadata resolution once.
12. Run `npm run test:direct-download`, `npm run check`, and `npm run test:pure`.

## v0.8.8 unified queue/schedule manager regression

1. Type a message and long-press the queue button.
2. Confirm the scheduling panel contains only message/time controls and does **not** contain a separate scheduled-message list.
3. Create a one-time schedule. Confirm the scheduling panel closes automatically.
4. Confirm the normal right-bottom queue manager opens automatically.
5. Confirm the scheduled message appears in the same manager list/card area as ordinary queued messages, with a `Scheduled`/`定時` badge and target send time.
6. Add a normal queued message and confirm both normal and scheduled cards remain visible in the same manager.
7. Confirm scheduled cards cannot be moved up/down as ordinary sequential queue entries.
8. Confirm Copy copies the scheduled text and Cancel schedule removes only that scheduled item/alarm.
9. When scheduled items exist, confirm the manager Clear button explicitly clears only the regular queue and does not cancel schedules.
10. With no ordinary queue but at least one scheduled item, confirm the preview bar and queue-button badge still expose the manager and show the scheduled count.

## v0.8.7 one-time scheduled-send regression

1. Type a message in the ChatGPT composer and long-press the Add to queue button. Confirm the normal short-click queue action does not fire and a compact Scheduled send panel opens.
2. Confirm the panel contains an editable message field, `datetime-local` input, local time-zone label, single-use wording, Create/Cancel actions, and a list of scheduled items for the current conversation.
3. Schedule a message at least one minute in the future. Confirm the original composer is cleared only when it still contains the same text that was scheduled.
4. Confirm `cqs_scheduled_messages_v1` in `storage.local` contains the text, absolute `scheduledAt`, target scope, target tab, and time-zone label.
5. Confirm Firefox creates exactly one alarm named with the `cqs-schedule:` prefix and an absolute `when` timestamp. Confirm there is no `periodInMinutes`.
6. Switch to another browser tab or minimize the Firefox window while leaving the target ChatGPT conversation open. At the scheduled time, confirm the message is submitted to the bound conversation without activating the tab.
7. Confirm a “scheduled send triggered” notification appears, followed by either a success or failure notification.
8. Leave unsent manual text in the target composer before the scheduled time. Confirm the scheduled task fails and does not overwrite the manual draft.
9. Start a normal queue or leave ChatGPT actively generating when the scheduled time arrives. Confirm the scheduled task fails rather than interrupting the active work.
10. Navigate the target tab to a different ChatGPT conversation before the scheduled time. Confirm the message is not sent to the wrong conversation.
11. Create a scheduled task from a new/draft chat, then send another message manually so ChatGPT creates a real conversation ID. Confirm the scheduled task migrates from `draft-tab:<id>` to `conversation:<id>`.
12. Cancel a scheduled task from the long-press panel. Confirm both the stored item and Firefox alarm are removed.
13. Restart the MV3 background script before a future scheduled time. Confirm future alarms are recreated from local storage without duplicating the task.
14. Simulate a task whose scheduled time was missed by more than two minutes. Confirm it is removed and reported as failed instead of being sent late.
15. Close Firefox completely through the scheduled time. Confirm no send can occur while Firefox is closed. On later startup, verify the two-minute late-send guard is applied.
16. Run `npm run test:schedule`; confirm one-shot alarm creation, background-tab dispatch, trigger/success/failure notifications, cancellation, draft migration, and wrong-conversation blocking all pass.

## v0.8.6 queue busy-state and image-upload regression

1. Start a ChatGPT coding/tool task that shows an animated Working/Thinking/Running-style status. If the native Stop button disappears and Send returns before the tool work is actually finished, confirm the next queued message is **not** sent.
2. While that animated work status is still visible, type a manual draft in the composer and confirm the extension neither overwrites it nor clicks Send.
3. Confirm the queue resumes only after the assistant completion action appears, or after the conservative stable-response fallback when no completion action exists.
4. Confirm changing assistant/tool status text resets the stable-idle countdown.
5. Queue a message while the latest visible conversation turn is still the user's unanswered prompt; confirm it waits rather than sending into the active response cycle.
6. Upload one image and confirm `#cqs-floating-button` remains immediately after `button[data-testid="composer-plus-btn"]`.
7. Upload multiple images/files and remove one preview; confirm Remove/Delete/Close/Preview controls never become the queue-button anchor.
8. Resize the composer and add/remove attachments repeatedly; confirm the MutationObserver can re-place the queue button beside the real plus control after React rerenders.
9. Run `npm run test:safety`; confirm busy-without-Stop detection, stable plus anchoring, and attachment-preview exclusion all pass.
10. Run the jsdom suite with dependencies installed and confirm `agentWorkDoesNotInterrupt` and `imageUploadKeepsQueueBesidePlus` pass.

## v0.8.5 generated-file button regression

1. Open a conversation containing assistant-generated files rendered as `<button>` controls with no `href`; confirm they appear in the archive review list.
2. Confirm raw `sandbox:/mnt/data/name.ext`, bare `/mnt/data/name.ext`, and URL-encoded sandbox paths are selectable without `file_id`.
3. Confirm the sandbox-only item is resolved through `/backend-api/conversation/<id>/interpreter/download` with the assistant message ID.
4. Confirm hidden tool/system file nodes directly associated with the active branch are collected, while ordinary alternate assistant branches are not.
5. Confirm an upload ID echoed in assistant metadata is not incorrectly paired with an unrelated generated sandbox filename.
6. For the Queue Sender release response, confirm the newest AMO XPI and source ZIP appear as v0.8.5 candidates rather than only their button labels.
7. Run `npm run test:react` and confirm two React-only buttons with no `href` are detected as exactly two physical files, while ordinary buttons are ignored.
8. Confirm a sandbox-only item with two inferred paths retries the second path when the first interpreter request fails.
9. Confirm a named file/asset pointer and matching sandbox path merge into one attachment and retain both strategies.
10. Confirm a generated attachment stored two hidden tool/system levels below the active assistant node is included.


## v0.8.4 Beta badge

1. Open `匯出與轉移` / `Export & Transfer`.
2. Confirm the complete conversation ZIP archive option displays a small `Beta` badge immediately beside its title.
3. Confirm the badge does not appear beside Markdown export or handoff summary.
4. Hover the badge and confirm the localized stability notice appears.
