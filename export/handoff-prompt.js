(() => {
  if (window.__CQS_HANDOFF_PROMPT__) return;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));

  const HANDOFF_PROMPT_ZH = `請根據本聊天室從最開始到目前為止的可見對話，製作一份可以直接貼到新的 ChatGPT 聊天室繼續工作的「對話交接摘要」。

請遵守以下規則：

1. 不要只摘要最後幾則訊息，要整理整個聊天室的工作脈絡。
2. 不要自行補充聊天室中沒有出現的資訊；不確定的內容請標示「待確認」。
3. 保留重要的檔案名稱、版本號、功能名稱、錯誤訊息、測試結果與技術決策。
4. 保留使用者已明確表達的設計偏好、操作習慣、限制，以及不希望出現的內容。
5. 清楚區分「已完成」、「進行中」、「尚未完成」與「待確認」。
6. 若前後內容有矛盾，請列出矛盾點，不要擅自選擇其中一個版本。
7. 有附加檔案時，請記錄可見的檔名、用途、版本與目前處理狀態；不要聲稱已讀取無法取得的內容。
8. 內容必須讓新的 ChatGPT 不需要閱讀舊聊天室，也能理解專案並接續工作。
9. 請使用繁體中文，內容完整但避免重複堆疊相同資訊。
10. 只輸出交接文件本身，不要先解釋你將如何整理。

請使用以下格式：

# 對話交接摘要

## 一、專案與核心目標

## 二、目前已完成內容

## 三、重要功能與工作流程

## 四、關鍵技術決策

## 五、使用者偏好與限制

## 六、重要檔案、版本與資料

## 七、目前已知問題與風險

## 八、尚未完成與下一步

## 九、不可遺漏的注意事項

## 十、新聊天室開場 Prompt

最後一節請提供一段完整、可直接複製到新聊天室使用的 Prompt。這段 Prompt 必須包含專案背景、目前狀態、使用者偏好、需要先讀取的檔案，以及下一步要執行的工作。`;

  const HANDOFF_PROMPT_EN = `Based on all visible messages in this conversation from the beginning through the present, create a Conversation Handoff Summary that can be pasted directly into a new ChatGPT conversation to continue the work.

Follow these rules:

1. Do not summarize only the most recent messages. Preserve the full workflow and project history.
2. Do not invent information that did not appear in the conversation. Mark uncertain items as "To confirm".
3. Preserve important filenames, version numbers, feature names, error messages, test results, and technical decisions.
4. Preserve the user's explicitly stated design preferences, operating habits, constraints, and anything they do not want included.
5. Clearly separate Completed, In progress, Not started, and To confirm items.
6. When earlier and later messages conflict, list the conflict instead of silently choosing one version.
7. When attachments exist, record visible filenames, purpose, version, and current processing status. Do not claim to have read content that was unavailable.
8. The document must let a new ChatGPT conversation understand the project and continue without reading the old conversation.
9. Write in English. Be complete, but avoid repeating the same information.
10. Output only the handoff document. Do not first explain how you will organize it.

Use this structure:

# Conversation Handoff Summary

## 1. Project and Core Goals

## 2. Completed Work

## 3. Important Features and Workflows

## 4. Key Technical Decisions

## 5. User Preferences and Constraints

## 6. Important Files, Versions, and Data

## 7. Known Issues and Risks

## 8. Remaining Work and Next Steps

## 9. Critical Notes Not to Miss

## 10. New Conversation Opening Prompt

In the final section, provide one complete prompt that can be copied directly into a new conversation. It must include the project background, current status, user preferences, files that should be read first, and the next task to perform.`;

  const HANDOFF_PROMPT = globalThis.CQS_I18N?.isEnglish ? HANDOFF_PROMPT_EN : HANDOFF_PROMPT_ZH;

  function openHandoffDialog() {
    const ui = window.__CQS_CONVERSATION_EXPORT__;
    if (!ui) return;

    const wrapper = ui.createElement("div", { className: "cqs-handoff-form" });
    const notice = ui.createElement("div", { className: "cqs-handoff-notice" });
    notice.append(
      ui.createElement("strong", { text: tr("這會在目前聊天室新增一則整理指令", "This will add a summary instruction to the current conversation") }),
      ui.createElement("p", { text: tr("指令會加入訊息佇列。如果 ChatGPT 正在回覆或佇列尚有內容，會等前面的工作完成後再送出。", "The instruction will be added to the queue. If ChatGPT is responding or the queue has pending work, it will send after earlier tasks finish.") }),
    );

    const label = ui.createElement("label", { className: "cqs-handoff-label", text: tr("交接摘要指令", "Handoff summary instruction") });
    label.htmlFor = "cqs-handoff-textarea";
    const textarea = ui.createElement("textarea", {
      id: "cqs-handoff-textarea",
      attrs: { spellcheck: "false", "aria-label": tr("對話交接摘要指令", "Conversation handoff summary instruction") },
    });
    textarea.value = HANDOFF_PROMPT;
    wrapper.append(notice, label, textarea);

    ui.openModal({
      title: tr("產生對話交接摘要", "Create conversation handoff summary"),
      description: tr("確認指令內容後送出，完成時會在回答旁加入「複製交接摘要」。", "Review the instruction before sending. When complete, a Copy handoff summary button will appear beside the response."),
      content: wrapper,
      actions: [
        { label: tr("取消", "Cancel"), onClick: () => ui.closeModal() },
        {
          label: tr("送出整理指令", "Send summary instruction"),
          primary: true,
          onClick: async () => {
            const prompt = String(textarea.value || "").trim();
            if (!prompt) {
              ui.showToast(tr("整理指令不能是空白。", "The summary instruction cannot be empty."));
              textarea.focus();
              return;
            }
            const queueApi = window.__CQS_QUEUE_API__;
            if (!queueApi?.enqueueText) {
              ui.showToast(tr("訊息佇列尚未就緒，請重新整理頁面後再試。", "The message queue is not ready. Refresh the page and try again."));
              return;
            }
            const enqueue = queueApi.enqueueTextAsync || queueApi.enqueueText;
            const result = await enqueue.call(queueApi, prompt, { kind: "handoff" });
            if (!result?.ok) {
              ui.showToast(result?.message || tr("無法加入交接摘要指令。", "The handoff summary instruction could not be queued."));
              return;
            }
            ui.closeModal();
            ui.showToast(result.queuedAhead > 0
              ? tr("交接摘要已排到佇列最後，前面還有 {count} 則。", "The handoff summary was placed at the end of the queue with {count} item(s) ahead.", { count: result.queuedAhead })
              : tr("交接摘要指令已加入，將自動送出。", "The handoff summary instruction was queued and will send automatically."));
          },
        },
      ],
      closeable: true,
      className: "cqs-handoff-modal",
    });
  }

  document.addEventListener("cqs:open-handoff", openHandoffDialog);
  document.addEventListener("cqs:queue-item-completed", (event) => {
    if (event.detail?.kind !== "handoff") return;
    const ui = window.__CQS_CONVERSATION_EXPORT__;
    let attempts = 0;
    const attach = () => {
      attempts += 1;
      if (ui?.addCopyHandoffButton()) {
        ui.showToast(tr("對話交接摘要已完成，可直接複製到新聊天室。", "The conversation handoff summary is complete and can be copied to a new conversation."));
        return;
      }
      if (attempts < 12) setTimeout(attach, 500);
    };
    setTimeout(attach, 250);
  });

  window.__CQS_HANDOFF_PROMPT__ = Object.freeze({ prompt: HANDOFF_PROMPT, open: openHandoffDialog });
})();
