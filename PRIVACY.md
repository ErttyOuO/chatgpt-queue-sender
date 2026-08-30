# Privacy Policy / 隱私權政策

Last updated: 2026-07-29

## English

ChatGPT Queue Sender does not collect, sell, or share personal data with the developer, advertisers, analytics providers, or other third parties.

The extension stores queued messages, reusable custom prompts, the minimum queue state required for operation, and completion-notification preferences only in local Firefox WebExtension storage. This includes message order, pause state, submitted state, optional handoff-task metadata, and whether sound or system notifications are enabled. This data remains in the user's browser.

When the user explicitly clicks a conversation export command, the extension reads the currently displayed ChatGPT conversation branch from the page and temporarily scrolls the local page to load and scan available messages.

For Markdown export, the visible content is converted into Markdown and downloaded through a temporary local `Blob` URL.

For complete ZIP archive export, the extension shows a reviewable list of actual attachments and ChatGPT-generated downloadable files detected in the current conversation. Only after the user confirms the list does the extension request the selected file URLs shown by ChatGPT, package the downloaded bytes together with the Markdown conversation and an export report, and create a local ZIP download. General external links and cited websites are not downloaded. Failed or expired file links are recorded in the local report and do not prevent the remaining archive from being created.

The extension does not upload exported conversations or downloaded attachments to the developer or to a developer-controlled server. ZIP creation is performed locally in the browser without a remote compression service or remote code.


Saved custom prompts are created only by the user and remain in local Firefox WebExtension storage. Copying a saved prompt occurs after an explicit click. Sending a saved prompt routes it through the same conversation-scoped local queue used by ordinary queued messages; the prompt is sent only to ChatGPT through the currently open web composer.

The conversation handoff feature inserts a user-reviewed prompt into the normal ChatGPT web composer through the local queue. The prompt is sent to ChatGPT in the same way as a message the user submits manually. The extension does not send the prompt to a separate developer service.

When the user enables Firefox system notifications, the extension may place a short preview of the completed ChatGPT response into a local Firefox or operating-system notification. The extension does not send the response preview to the developer.

The optional `notifications` permission is requested only after the user explicitly enables system notifications in the toolbar popup. Sound-only reminders remain available without this permission.

The extension does not use analytics, telemetry, tracking, advertising SDKs, cloud databases, remote code, or an OpenAI API key.

The extension reads the Firefox UI language locally only to choose English or Traditional Chinese interface text. The language value is not stored, transmitted, or used for profiling.

The content interface runs only on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

The manifest also grants background access to OpenAI-controlled `chatgpt.com`, `openai.com`, and `oaiusercontent.com` subdomains. That access is used only after the user confirms a ZIP export, so the background script can retrieve the selected attachment URLs already presented by the current ChatGPT conversation. A code-level allowlist rejects other websites.

Its purpose is limited to adding local queue and export interfaces, submitting user-provided messages through the existing ChatGPT web composer, retrieving user-selected attachment files already presented by the current ChatGPT conversation, and optionally reminding the user when a response has finished.

## 中文

ChatGPT Queue Sender 不會向開發者、廣告商、分析服務或其他第三方收集、販售或分享個人資料。

擴充功能只會在 Firefox 本機 WebExtension storage 中保存佇列訊息、使用者儲存的自訂提示語、運作所需的最低限度狀態，以及完成提醒設定，包括訊息順序、暫停狀態、是否已送出、交接任務標記，以及是否啟用提示音或系統通知。這些資料只留在使用者的瀏覽器內。

只有在使用者主動點擊對話匯出功能時，擴充功能才會讀取目前頁面顯示的 ChatGPT 對話分支，並暫時捲動本機頁面以載入及收集可取得的訊息。

Markdown 匯出會將可見內容轉換成 Markdown，並透過暫時的本機 `Blob` 網址建立下載。

完整 ZIP 封存會先讀取目前聊天室頁面與同一聊天室的結構化對話資料，找出使用者上傳與 ChatGPT 產生檔案的檔案 ID，再顯示確認清單。只有在使用者確認後，擴充功能才會向 ChatGPT 的檔案下載端點解析並下載所選檔案，將內容與 Markdown 對話及匯出報告在本機打包成 ZIP。一般外部網站與引用來源不會被下載。失效或無法存取的檔案會記錄於本機匯出報告，不會阻止其餘內容建立封存。

擴充功能不會把匯出的對話或下載的附件上傳給開發者或任何開發者控制的伺服器。ZIP 會直接在瀏覽器本機建立，不使用遠端壓縮服務或遠端程式碼。


自訂提示語只會由使用者建立並保存在 Firefox 本機 WebExtension storage。複製提示語需要使用者明確點擊；發送提示語時會使用與一般佇列相同的聊天室綁定機制，只透過目前開啟的 ChatGPT 網頁輸入框送給 ChatGPT。

對話交接功能會先讓使用者預覽指令，再透過本機訊息佇列將指令放入 ChatGPT 原本的網頁輸入框。指令只會像使用者手動送出的訊息一樣傳給 ChatGPT，不會被傳送到開發者的其他服務。

當使用者開啟 Firefox 系統通知時，擴充功能可能會將已完成回覆的短篇預覽放入 Firefox 或作業系統的本機通知中；回覆預覽不會被傳送給開發者。

`notifications` 是選用權限，只有使用者在工具列 popup 中主動開啟系統通知時才會要求。即使不授予此權限，仍可使用提示音提醒。

本擴充功能不使用分析、遙測、追蹤、廣告 SDK、雲端資料庫、遠端程式碼或 OpenAI API Key。

擴充功能只會在本機讀取 Firefox 介面語言，用來選擇英文或繁體中文介面；語言資訊不會被儲存、傳送或用於建立使用者資料。

本擴充功能的內容介面只會在以下頁面執行：

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

Manifest 另授予背景腳本存取 OpenAI 控制的 `chatgpt.com`、`openai.com` 與 `oaiusercontent.com` 子網域。這些權限只會在使用者啟動 ZIP 匯出後，用於讀取目前聊天室資料、解析所選附件的檔案 ID，以及下載使用者確認的附件；程式內的允許清單會拒絕其他網站。

用途僅限於加入本機訊息佇列與匯出介面、透過 ChatGPT 既有網頁輸入框送出使用者提供的訊息、取得目前 ChatGPT 對話中由使用者選定且頁面已提供的附件，以及在使用者開啟功能後提醒回覆已完成。


## 暫時登入資訊

為了存取目前登入帳號可下載的聊天室附件，ZIP 匯出流程可能從 ChatGPT 同源工作階段取得暫時 access token 與帳號 ID。這些值只存在目前分頁與背景下載流程的記憶體中，不會寫入 WebExtension storage、不會加入 ZIP、不會記錄於匯出報告，也不會傳送到 OpenAI 控制網域以外的主機。簽名 CDN 網址下載時不會附帶 ChatGPT Bearer token。
