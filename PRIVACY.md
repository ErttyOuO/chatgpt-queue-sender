# Privacy Policy / 隱私權政策

Last updated: 2026-09-10

## English

ChatGPT Queue Sender does not collect, sell, or share personal data with the developer, advertisers, analytics providers, or other third parties.

The extension stores queued messages, one-time scheduled messages, reusable custom prompts, the minimum queue state required for operation, and completion-notification preferences only in local Firefox WebExtension storage. This includes message order, pause state, submitted state, one-time scheduled text, the selected send time, target conversation/tab binding, optional handoff-task metadata, and whether sound or system notifications are enabled. This data remains in the user's browser.

When the user explicitly clicks a conversation export command, the extension reads the currently displayed ChatGPT conversation branch from the page and temporarily scrolls the local page to load and scan available messages.

For Markdown export, the visible content is converted into Markdown and downloaded through a temporary local `Blob` URL.

For complete ZIP archive export, the extension shows a reviewable list of actual attachments and ChatGPT-generated downloadable files detected in the current conversation. Only after the user confirms the list does the extension request the selected file URLs shown by ChatGPT, package the downloaded bytes together with the Markdown conversation and an export report, and create a local ZIP download. General external links and cited websites are not downloaded. Failed or expired file links are recorded in the local report and do not prevent the remaining archive from being created.

The extension does not upload exported conversations or downloaded attachments to the developer or to a developer-controlled server. ZIP creation is performed locally in the browser without a remote compression service or remote code.


Saved custom prompts are created only by the user and remain in local Firefox WebExtension storage. Copying a saved prompt occurs after an explicit click. Sending a saved prompt routes it through the same conversation-scoped local queue used by ordinary queued messages; the prompt is sent only to ChatGPT through the currently open web composer.

The conversation handoff feature inserts a user-reviewed prompt into the normal ChatGPT web composer through the local queue. The prompt is sent to ChatGPT in the same way as a message the user submits manually. The extension does not send the prompt to a separate developer service.

When the user enables ordinary response-completion alerts, the extension may place a short preview of the completed ChatGPT response into a local Firefox or operating-system notification. The extension does not send the response preview to the developer.

v0.8.7 also supports one-time scheduled sends. A scheduled message, its absolute send time, target conversation/tab binding, and time-zone label are stored only in local Firefox WebExtension storage. The `alarms` API wakes the extension background at the requested time. The extension does not contact a third-party time server; it uses the Firefox/operating-system clock, which is normally network-synchronized by the operating system.

The `notifications` permission is required in v0.8.7 so every scheduled send can report that it was triggered and whether submission succeeded or failed. The toolbar popup still lets the user disable ordinary response-completion notifications independently.

v0.8.9+ adds an explicit direct-download button beside ChatGPT assistant file controls; v0.8.10 also supports generic `library-file-icon` buttons that do not expose citation attributes. When the user clicks that button, the extension reads the file identifier already exposed by the current ChatGPT page, temporarily resolves the current authorized download URL, and passes only that selected file to Firefox's native download manager. The new `downloads` permission is not used to inspect, erase, open, or alter unrelated downloads.


v0.9.2 also reads generated assistant image elements already rendered on the current ChatGPT page and keeps a local elapsed-time timestamp for the current response cycle. These features add no new permission, remote service, telemetry, or developer-controlled data transfer.

v0.9.1 also integrates ChatGPT-native artifact buttons into the local latest-file rail and can finish ChatGPT dictation before queueing text. Both behaviors operate only on the current ChatGPT page and add no new permission, remote service, telemetry, or developer-controlled data transfer.

v0.9.0 also shows a compact latest-file rail and response elapsed timer below Export & Transfer. This UI reads only the currently rendered ChatGPT assistant controls and the extension's existing local response state. It adds no new permission and sends no file names, timer values, or conversation data to the developer.
The extension does not use analytics, telemetry, tracking, advertising SDKs, cloud databases, remote code, or an OpenAI API key.

The extension reads the Firefox UI language locally only to choose English or Traditional Chinese interface text. The language value is not stored, transmitted, or used for profiling.

The content interface runs only on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

The manifest also grants background access to OpenAI-controlled `chatgpt.com`, `openai.com`, and `oaiusercontent.com` subdomains. That access is used only after the user confirms a ZIP export or explicitly clicks a direct-download button, so the background script can resolve and retrieve the selected attachment URL already presented by the current ChatGPT conversation. A code-level allowlist rejects other websites.

Its purpose is limited to adding local queue and export interfaces, submitting user-provided messages through the existing ChatGPT web composer, retrieving user-selected attachment files already presented by the current ChatGPT conversation, and optionally reminding the user when a response has finished.

## 中文

ChatGPT Queue Sender 不會向開發者、廣告商、分析服務或其他第三方收集、販售或分享個人資料。

擴充功能只會在 Firefox 本機 WebExtension storage 中保存佇列訊息、單次定時訊息、使用者儲存的自訂提示語、運作所需的最低限度狀態，以及完成提醒設定，包括訊息順序、暫停狀態、是否已送出、定時訊息文字、排定時間、目標聊天室／分頁綁定、交接任務標記，以及是否啟用提示音或系統通知。這些資料只留在使用者的瀏覽器內。

只有在使用者主動點擊對話匯出功能時，擴充功能才會讀取目前頁面顯示的 ChatGPT 對話分支，並暫時捲動本機頁面以載入及收集可取得的訊息。

Markdown 匯出會將可見內容轉換成 Markdown，並透過暫時的本機 `Blob` 網址建立下載。

完整 ZIP 封存會先讀取目前聊天室頁面與同一聊天室的結構化對話資料，找出使用者上傳與 ChatGPT 產生檔案的檔案 ID，再顯示確認清單。只有在使用者確認後，擴充功能才會向 ChatGPT 的檔案下載端點解析並下載所選檔案，將內容與 Markdown 對話及匯出報告在本機打包成 ZIP。一般外部網站與引用來源不會被下載。失效或無法存取的檔案會記錄於本機匯出報告，不會阻止其餘內容建立封存。

擴充功能不會把匯出的對話或下載的附件上傳給開發者或任何開發者控制的伺服器。ZIP 會直接在瀏覽器本機建立，不使用遠端壓縮服務或遠端程式碼。


自訂提示語只會由使用者建立並保存在 Firefox 本機 WebExtension storage。複製提示語需要使用者明確點擊；發送提示語時會使用與一般佇列相同的聊天室綁定機制，只透過目前開啟的 ChatGPT 網頁輸入框送給 ChatGPT。

對話交接功能會先讓使用者預覽指令，再透過本機訊息佇列將指令放入 ChatGPT 原本的網頁輸入框。指令只會像使用者手動送出的訊息一樣傳給 ChatGPT，不會被傳送到開發者的其他服務。

當使用者開啟一般回覆完成提醒時，擴充功能可能會將已完成回覆的短篇預覽放入 Firefox 或作業系統的本機通知中；回覆預覽不會被傳送給開發者。

v0.8.7 另支援單次定時發送。定時訊息、絕對發送時間、目標聊天室／分頁綁定與時區標籤只會保存在 Firefox 本機 WebExtension storage。`alarms` API 會在指定時間喚醒背景腳本。本擴充功能不會連線到第三方時間伺服器，而是使用 Firefox／作業系統時鐘；現代作業系統通常會自行透過網路校時。

v0.8.7 將 `notifications` 列為必要權限，讓每次定時發送都能回報「已觸發」以及「成功／失敗」結果。工具列 popup 仍可獨立關閉一般回覆完成通知。

v0.8.9 起會在 ChatGPT assistant 回覆中的檔案控制旁加入明確的直接下載按鈕；v0.8.10 也支援沒有 citation attributes 的 `library-file-icon` 按鈕。只有使用者親自點擊該按鈕時，擴充功能才會讀取目前 ChatGPT 頁面已提供的檔案識別碼、暫時解析目前帳號可用的下載網址，再把這一個被選取的檔案交給 Firefox 原生下載管理器。新增的 `downloads` 權限不會用來檢查、刪除、開啟或修改其他無關下載紀錄。


v0.9.2 也會讀取目前 ChatGPT 頁面已顯示的 assistant 生成圖片元素，並在本機保存本輪回覆的計時起點。這些功能不新增權限、遠端服務、遙測或傳送資料給開發者。

v0.9.1 也會把 ChatGPT 原生產物下載按鈕整合進本機最新檔案列，並可在加入佇列前先完成 ChatGPT 聽寫。兩項功能都只操作目前 ChatGPT 頁面，不新增權限、遠端服務、遙測或傳送資料給開發者。

v0.9.0 也會在「匯出與轉移」下方顯示最新檔案列與回覆經過時間。這個 UI 只讀取目前頁面已渲染的 assistant 檔案控制，以及擴充功能既有的本機回覆狀態；不新增權限，也不會把檔名、計時或聊天內容傳送給開發者。
本擴充功能不使用分析、遙測、追蹤、廣告 SDK、雲端資料庫、遠端程式碼或 OpenAI API Key。

擴充功能只會在本機讀取 Firefox 介面語言，用來選擇英文或繁體中文介面；語言資訊不會被儲存、傳送或用於建立使用者資料。

本擴充功能的內容介面只會在以下頁面執行：

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

Manifest 另授予背景腳本存取 OpenAI 控制的 `chatgpt.com`、`openai.com` 與 `oaiusercontent.com` 子網域。這些權限只會在使用者啟動 ZIP 匯出或明確點擊直接下載按鈕後，用於讀取目前聊天室資料、解析被選取附件的檔案 ID 與下載網址，以及下載使用者確認的附件；程式內的允許清單會拒絕其他網站。

用途僅限於加入本機訊息佇列、單次定時發送與匯出介面、透過 ChatGPT 既有網頁輸入框送出使用者提供的訊息、在使用者明確操作後取得目前 ChatGPT 對話中頁面已提供的附件，以及在使用者開啟功能後提醒回覆已完成。


## 暫時登入資訊

為了存取目前登入帳號可下載的聊天室附件，ZIP 匯出流程可能從 ChatGPT 同源工作階段取得暫時 access token 與帳號 ID。這些值只存在目前分頁與背景下載流程的記憶體中，不會寫入 WebExtension storage、不會加入 ZIP、不會記錄於匯出報告，也不會傳送到 OpenAI 控制網域以外的主機。簽名 CDN 網址下載時不會附帶 ChatGPT Bearer token。
