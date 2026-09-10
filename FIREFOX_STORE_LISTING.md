# Firefox Add-ons Store Listing / AMO 商店上架文字

## Add-on name

ChatGPT Queue Sender

## English short summary

Queue prompts, schedule a one-time send, directly download ChatGPT-provided files, get completion alerts, export chats, and create a handoff summary.

## 中文短摘要

將提示詞加入佇列、設定單次定時發送、直接下載 ChatGPT 提供的檔案、接收完成提醒，並匯出 Markdown／ZIP 或產生交接摘要。

## English full description

ChatGPT Queue Sender is a lightweight Firefox extension that adds a local prompt queue, one-time scheduled sending, reusable saved prompts, configurable completion alerts, Markdown and ZIP conversation export, and chat handoff tools to the ChatGPT web interface. The full interface follows the Firefox UI language: Simplified and Traditional Chinese Firefox use the Chinese interface; every other Firefox language defaults to English.

Prepare multiple prompts in advance and let the extension submit them one by one through the normal ChatGPT composer. It verifies that a prompt was submitted, waits for the response to finish, and continues only after the composer returns to a stable idle state.

Long-press the existing Add to queue button to open the one-time Scheduled send panel. Choose a local date and time and Firefox will register an absolute background alarm. When the time arrives, the extension can submit to the bound ChatGPT conversation even when that tab is inactive or the Firefox window is minimized. Each task runs once only; there is no recurring schedule.

Scheduled sends fail closed rather than risk a mis-send: they do not overwrite a manual draft, interrupt an active response, compete with another queue runner, or send into a different conversation. Firefox/OS notifications report when the scheduled task triggers and whether submission succeeds or fails.

A compact direct-download icon is also added beside downloadable file citations in assistant replies. The original filename still opens the normal ChatGPT preview, while the new adjacent action sends that selected file directly to Firefox's download manager.

Completion alerts also work with messages you send manually, not only queued prompts. You can choose a gentle sound, a Firefox or operating-system notification, or both.

The desktop conversation tools add a compact “Export & Transfer” menu to the upper-left of the current chat. You can download the displayed branch as Markdown, create a ZIP containing the Markdown and selected conversation attachments, or preview a structured handoff prompt for continuing in a new chat.

Main features:

- Add multiple prompts to a local queue
- Long-press Add to queue for a one-time scheduled send
- Background absolute-time alarm; no recurring schedule
- Scheduled-send trigger, success, and failure notifications
- Directly download ChatGPT-provided file citations without opening the preview menu
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

ChatGPT Queue Sender 是一個 Firefox 擴充功能，會在 ChatGPT 網頁版加入本機訊息佇列、單次定時發送、自訂提示語、可調整的回覆完成提醒、Markdown／ZIP 對話匯出，以及對話轉移工具。Firefox 為簡體或繁體中文介面時顯示中文；其他 Firefox 語言一律顯示英文。

你可以先加入多則提示詞，擴充功能會確認目前訊息已成功送出，等待 ChatGPT 回覆完成並恢復穩定可送出狀態後，再自動處理下一則。

長按既有的「加入佇列」按鈕即可開啟單次「定時發送」面板。選擇本機日期與時間後，Firefox 會建立絕對時間背景 alarm；時間到時，即使該 ChatGPT 分頁不是目前作用中的分頁或 Firefox 視窗已最小化，仍可向綁定聊天室嘗試送出。每筆排程只執行一次，不會循環。

定時發送採取防誤送策略：不覆蓋手動草稿、不打斷正在進行的回覆、不與另一個佇列執行器搶送，也不會在聊天室已切換時送到錯誤對話。Firefox／作業系統通知會回報排程已觸發，以及送出成功或失敗。

ChatGPT 回覆中的可下載檔案引用旁也會出現一顆小型直接下載按鈕。原本的檔名仍可開啟 ChatGPT 預覽；新增的按鈕則會把該檔案直接交給 Firefox 下載管理器，不必再從預覽右上角的三點選單點擊下載。

完成提醒不只適用於佇列；一般手動送出的訊息也能在回覆完成後播放提示音或顯示 Firefox／作業系統通知。

桌面版聊天室左上角會出現小巧的「匯出與轉移」選單。除了 Markdown、完整附件 ZIP 與對話交接摘要，現在也能儲存常用提示語；滑鼠移到已儲存項目時，可直接複製或送入目前聊天室的佇列。

主要功能：

- 將多則提示詞加入本機佇列
- 長按「加入佇列」設定單次定時發送
- Firefox 背景絕對時間 alarm，不做循環排程
- 定時發送觸發、成功與失敗通知
- 直接下載 ChatGPT 提供的檔案引用，不必先進入預覽與三點選單
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

Stores queued messages, one-time scheduled messages and their target/time metadata, reusable saved prompts, queue state, handoff-task metadata, and reminder preferences locally so the extension can continue safely after a page refresh or MV3 background restart.

### `alarms`

Required for one-time scheduled sends. The extension registers an absolute `when` timestamp with Firefox so the background can wake near the requested time. No recurring `periodInMinutes` alarm is used.

### `notifications`

Required so scheduled sends can always report trigger, success, or failure through local Firefox/operating-system notifications. Ordinary response-completion notifications remain controlled by the user's popup setting.

### `downloads`

Required for the v0.8.9 direct-download action beside ChatGPT-provided file citations. It is used only after an explicit user click to start the selected file in Firefox's native download manager with a safe filename and unique-name conflict handling. The extension does not inspect or modify unrelated download history.

### ChatGPT page access

`https://chatgpt.com/*` and `https://chat.openai.com/*` allow the content scripts to add the queue and export UI, read the current visible conversation only when the user requests an export, detect response completion, and submit user-provided messages through the existing ChatGPT composer.

### OpenAI attachment-host access

The additional `chatgpt.com`, `openai.com`, and `oaiusercontent.com` subdomain patterns allow the background script to resolve only attachment URLs explicitly selected by the user, either for a confirmed ZIP archive or by clicking the direct-download button beside a ChatGPT file citation. A code-level allowlist rejects other websites. ZIP bytes are streamed back to the current tab and packaged locally; direct downloads are handed to Firefox's native download manager. Nothing is sent to the developer.

## Privacy summary

This extension does not collect, transmit, sell, or share personal data. Queue content, scheduled-message text/time/target metadata, saved custom prompts, operational state, handoff metadata, and reminder settings are stored locally with Firefox WebExtension storage.

Markdown and ZIP files are created locally after an explicit user action. Selected attachment bytes are retrieved from the file links presented by the current ChatGPT conversation and are not uploaded to the developer or a developer-controlled server.

The extension does not use developer-controlled remote servers, analytics, telemetry, tracking tools, advertising SDKs, remote code, or an OpenAI API key.
