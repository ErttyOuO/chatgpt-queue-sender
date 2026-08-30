# Firefox Add-ons Store Listing / AMO 商店上架文字

## Add-on name

ChatGPT Queue Sender

## English short summary

Queue prompts, get completion alerts, export the current chat to Markdown or a ZIP with selected attachments, and create a handoff summary.

## 中文短摘要

將提示詞加入佇列、接收完成提醒，並將目前聊天室匯出成 Markdown 或包含附件的 ZIP，也可產生交接摘要。

## English full description

ChatGPT Queue Sender is a lightweight Firefox extension that adds a local prompt queue, reusable saved prompts, optional completion alerts, Markdown and ZIP conversation export, and chat handoff tools to the ChatGPT web interface. The full interface follows the Firefox UI language: Simplified and Traditional Chinese Firefox use the Chinese interface; every other Firefox language defaults to English.

Prepare multiple prompts in advance and let the extension submit them one by one through the normal ChatGPT composer. It verifies that a prompt was submitted, waits for the response to finish, and continues only after the composer returns to a stable idle state.

Completion alerts also work with messages you send manually, not only queued prompts. You can choose a gentle sound, a Firefox or operating-system notification, or both.

The desktop conversation tools add a compact “Export & Transfer” menu to the upper-left of the current chat. You can download the displayed branch as Markdown, create a ZIP containing the Markdown and selected conversation attachments, or preview a structured handoff prompt for continuing in a new chat.

Main features:

- Add multiple prompts to a local queue
- Automatically continue after each response finishes
- Compact progress bar and bottom-right queue manager
- Edit, delete, reorder, and copy queued prompts
- Support up to 10 pending prompts
- Completion detection for both manual and queued messages
- Optional completion sound
- Optional Firefox or operating-system notification
- Click a notification to return to the source ChatGPT tab
- Export the current visible conversation branch to Markdown
- Create a conversation-title ZIP containing Markdown, selected attachments, and an export report
- Separate user uploads and ChatGPT-provided files into folders
- Detect likely filename versions and select the latest version by default
- Review, restore, or deselect files before the ZIP is created
- Preserve roles, message order, headings, lists, code blocks, tables, and links
- Record visible attachment filenames, file types, source roles, and visible links
- Preview and edit a structured conversation handoff prompt
- Queue the handoff prompt after existing tasks
- Copy the completed handoff answer as Markdown
- No OpenAI API key
- No developer-controlled server, analytics, or telemetry
- Local browser storage only
- Chinese UI on Simplified and Traditional Chinese Firefox; English UI on every other Firefox language
- No data collection

Markdown and ZIP generation run locally in the browser. ZIP export downloads only the attachment files selected by the user from the current ChatGPT conversation. General external links are excluded. Some attachment URLs may require the current ChatGPT login or may expire; failures are recorded in the ZIP report.

The extension only assists with the normal ChatGPT website. It does not bypass sign-in, subscriptions, model access, message limits, rate limits, or other platform restrictions. Because ChatGPT can change its web interface, future updates may be required.

## 中文詳細介紹

ChatGPT Queue Sender 是一個 Firefox 擴充功能，會在 ChatGPT 網頁版加入本機訊息佇列、自訂提示語、可選的回覆完成提醒、Markdown／ZIP 對話匯出，以及對話轉移工具。Firefox 為簡體或繁體中文介面時顯示中文；其他 Firefox 語言一律顯示英文。

你可以先加入多則提示詞，擴充功能會確認目前訊息已成功送出，等待 ChatGPT 回覆完成並恢復穩定可送出狀態後，再自動處理下一則。

完成提醒不只適用於佇列；一般手動送出的訊息也能在回覆完成後播放提示音或顯示 Firefox／作業系統通知。

桌面版聊天室左上角會出現小巧的「匯出與轉移」選單。除了 Markdown、完整附件 ZIP 與對話交接摘要，現在也能儲存常用提示語；滑鼠移到已儲存項目時，可直接複製或送入目前聊天室的佇列。

主要功能：

- 將多則提示詞加入本機佇列
- 儲存、編輯、排序與刪除常用自訂提示語
- 滑鼠移到提示語時顯示複製或發送操作
- 回覆完成後自動接續下一則
- 輸入框上方顯示小巧進度列
- 右下角卡片式管理抽屜
- 支援編輯、刪除、排序與複製
- 最多 10 則待送訊息
- 手動訊息與佇列訊息都能偵測回覆完成
- 可選的柔和提示音
- 可選的 Firefox／作業系統通知
- 點擊通知返回來源 ChatGPT 分頁
- 匯出目前顯示的對話分支為 Markdown
- 建立以聊天室名稱命名、包含 Markdown、附件與匯出報告的 ZIP
- 將使用者上傳與 ChatGPT 提供的檔案分資料夾保存
- 依 V1/V2、2.0/2.1、最終版、修改版等檔名資訊預設只選最新版本
- 建立 ZIP 前可檢查、恢復或取消選取檔案
- 保留角色、順序、標題、清單、程式碼、表格與連結
- 記錄可見附件的檔名、類型、來源角色與連結
- 預覽與修改標準對話交接指令
- 交接指令會排在現有佇列工作之後
- 交接摘要完成後可直接複製為 Markdown
- 不需要 OpenAI API Key
- 不連接開發者控制的伺服器
- 不使用分析或遙測
- 佇列、自訂提示語與設定只保存在本機瀏覽器
- 不收集個人資料

Markdown 與 ZIP 都在瀏覽器本機建立。ZIP 會結合頁面附件卡片與目前聊天室的檔案識別資料，下載使用者在確認清單中選取的實際附件，不會下載一般外部網站連結。附件網址可能需要目前的 ChatGPT 登入狀態，也可能因有效期限失效；失敗項目會寫入 ZIP 內的匯出報告。

這個擴充功能只協助操作正常的 ChatGPT 網頁版，不會繞過登入、訂閱方案、模型權限、訊息額度、速率限制或其他平台限制。ChatGPT 網頁介面更新後，部分功能可能需要同步調整。

## Permission explanations

### `storage`

Stores queued messages, reusable saved prompts, queue state, handoff-task metadata, and reminder preferences locally so the extension can continue safely after a page refresh.

### Optional `notifications`

Requested only when the user enables Firefox system notifications. Used to display a local completion notification and return to the originating ChatGPT tab when clicked.

### ChatGPT page access

`https://chatgpt.com/*` and `https://chat.openai.com/*` allow the content scripts to add the queue and export UI, read the current visible conversation only when the user requests an export, detect response completion, and submit user-provided messages through the existing ChatGPT composer.

### OpenAI attachment-host access

The additional `chatgpt.com`, `openai.com`, and `oaiusercontent.com` subdomain patterns allow the background script to retrieve only the attachment URLs selected by the user for a ZIP archive. A code-level allowlist rejects other websites. These bytes are streamed back to the current tab and packaged locally; they are not sent to the developer.

## Privacy summary

This extension does not collect, transmit, sell, or share personal data. Queue content, saved custom prompts, operational state, handoff metadata, and reminder settings are stored locally with Firefox WebExtension storage.

Markdown and ZIP files are created locally after an explicit user action. Selected attachment bytes are retrieved from the file links presented by the current ChatGPT conversation and are not uploaded to the developer or a developer-controlled server.

The extension does not use developer-controlled remote servers, analytics, telemetry, tracking tools, advertising SDKs, remote code, or an OpenAI API key.
