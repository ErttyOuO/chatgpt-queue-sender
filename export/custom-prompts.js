(() => {
  if (window.__CQS_CUSTOM_PROMPTS__) return;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));
  const locale = globalThis.CQS_I18N?.locale || "zh-TW";

  const STORAGE_KEY = "cqs_saved_prompts_v1";
  const MAX_PROMPTS = 30;
  const MAX_TITLE_LENGTH = 80;
  const MAX_TEXT_LENGTH = 20000;
  const extensionApi = globalThis.browser || globalThis.chrome;

  const state = {
    prompts: [],
    loaded: false,
    localWriteCount: 0,
    persistChain: Promise.resolve(),
    deferredStorageValue: null,
    loadPromise: null,
    host: null,
  };

  function uiApi() {
    return window.__CQS_CONVERSATION_EXPORT__ || null;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\r\n?/g, "\n").trim();
  }

  function normalizeTitle(value, text = "") {
    const explicit = String(value || "").replace(/\s+/g, " ").trim();
    if (explicit) return explicit.slice(0, MAX_TITLE_LENGTH);
    const firstLine = normalizeText(text).split("\n").find((line) => line.trim()) || tr("未命名提示語", "Untitled prompt");
    return firstLine.replace(/^#+\s*/, "").replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH);
  }

  function normalizePrompt(raw, index = 0) {
    if (!raw || typeof raw !== "object") return null;
    const text = normalizeText(raw.text);
    if (!text) return null;
    const now = Date.now();
    return {
      id: String(raw.id || `prompt-${now.toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`),
      title: normalizeTitle(raw.title, text),
      text: text.slice(0, MAX_TEXT_LENGTH),
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || now,
    };
  }

  function clonePrompts() {
    return state.prompts.map((prompt) => ({ ...prompt }));
  }

  async function loadPrompts() {
    if (state.loaded) return clonePrompts();
    if (state.loadPromise) return state.loadPromise;
    state.loadPromise = (async () => {
      if (!extensionApi?.storage?.local) {
        state.loaded = true;
        renderMenu();
        return clonePrompts();
      }
      try {
        const result = await extensionApi.storage.local.get(STORAGE_KEY);
        const raw = Array.isArray(result?.[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
        state.prompts = raw.map(normalizePrompt).filter(Boolean).slice(0, MAX_PROMPTS);
      } catch (error) {
        console.warn("[CQS Saved Prompts] Failed to load prompts", error);
        state.prompts = [];
      }
      state.loaded = true;
      renderMenu();
      return clonePrompts();
    })();
    try {
      return await state.loadPromise;
    } finally {
      state.loadPromise = null;
    }
  }

  function applyStoredPrompts(rawValue) {
    const raw = Array.isArray(rawValue) ? rawValue : [];
    state.prompts = raw.map(normalizePrompt).filter(Boolean).slice(0, MAX_PROMPTS);
    state.loaded = true;
    renderMenu();
  }

  async function persistPrompts() {
    if (!extensionApi?.storage?.local) return;
    const snapshot = clonePrompts();
    state.localWriteCount += 1;
    const operation = Promise.resolve(state.persistChain)
      .catch(() => undefined)
      .then(() => extensionApi.storage.local.set({ [STORAGE_KEY]: snapshot }));
    state.persistChain = operation.catch(() => undefined);
    try {
      await operation;
    } finally {
      state.localWriteCount = Math.max(0, state.localWriteCount - 1);
      if (state.localWriteCount === 0 && state.deferredStorageValue !== null) {
        const deferred = state.deferredStorageValue;
        state.deferredStorageValue = null;
        applyStoredPrompts(deferred);
      }
    }
  }

  function generateId() {
    return `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async function savePrompt(input) {
    if (!state.loaded) await loadPrompts();
    const text = normalizeText(input?.text);
    if (!text) throw new Error(tr("提示語內容不能是空白。", "Prompt content cannot be empty."));
    if (text.length > MAX_TEXT_LENGTH) throw new Error(tr("提示語最多 {count} 個字元。", "A prompt can contain at most {count} characters.", { count: MAX_TEXT_LENGTH.toLocaleString(locale) }));

    const now = Date.now();
    const id = String(input?.id || "");
    const existingIndex = id ? state.prompts.findIndex((item) => item.id === id) : -1;
    if (existingIndex >= 0) {
      const previous = state.prompts[existingIndex];
      state.prompts[existingIndex] = {
        ...previous,
        title: normalizeTitle(input?.title, text),
        text,
        updatedAt: now,
      };
    } else {
      if (state.prompts.length >= MAX_PROMPTS) throw new Error(tr("最多可儲存 {count} 則自訂提示語。", "You can save up to {count} prompts.", { count: MAX_PROMPTS }));
      state.prompts.push({
        id: generateId(),
        title: normalizeTitle(input?.title, text),
        text,
        createdAt: now,
        updatedAt: now,
      });
    }
    await persistPrompts();
    renderMenu();
    return existingIndex >= 0 ? state.prompts[existingIndex] : state.prompts.at(-1);
  }

  async function removePrompt(id) {
    if (!state.loaded) await loadPrompts();
    const before = state.prompts.length;
    state.prompts = state.prompts.filter((prompt) => prompt.id !== id);
    if (state.prompts.length === before) return false;
    await persistPrompts();
    renderMenu();
    return true;
  }

  async function movePrompt(id, direction) {
    if (!state.loaded) await loadPrompts();
    const index = state.prompts.findIndex((prompt) => prompt.id === id);
    if (index < 0) return false;
    const target = direction < 0 ? index - 1 : index + 1;
    if (target < 0 || target >= state.prompts.length) return false;
    [state.prompts[index], state.prompts[target]] = [state.prompts[target], state.prompts[index]];
    await persistPrompts();
    renderMenu();
    return true;
  }

  function getComposerDraft() {
    const selectors = [
      "#prompt-textarea[contenteditable='true']",
      "div[contenteditable='true'][data-virtualkeyboard]",
      "textarea[data-testid*='prompt']",
      "form textarea",
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const text = normalizeText("value" in element ? element.value : element.innerText || element.textContent);
      if (text) return text;
    }
    return "";
  }

  async function copyText(text) {
    const value = String(text || "");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.documentElement.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = Boolean(document.execCommand?.("copy"));
    } catch (_) {}
    textarea.remove();
    return copied;
  }

  function showToast(message) {
    uiApi()?.showToast(message);
  }

  function closeExportMenu() {
    uiApi()?.setMenuOpen?.(false);
  }

  async function copyPrompt(prompt) {
    const copied = await copyText(prompt.text);
    showToast(copied ? tr("已複製「{title}」。", "Copied “{title}”.", { title: prompt.title }) : tr("Firefox 未允許寫入剪貼簿，請稍後再試。", "Firefox did not allow clipboard access. Try again later."));
    return copied;
  }

  async function sendPrompt(prompt) {
    const queueApi = window.__CQS_QUEUE_API__;
    const enqueue = queueApi?.enqueueTextAsync || queueApi?.enqueueText;
    if (!enqueue) {
      showToast(tr("訊息佇列尚未就緒，請重新整理頁面後再試。", "The message queue is not ready. Refresh the page and try again."));
      return { ok: false };
    }
    const result = await enqueue.call(queueApi, prompt.text, { kind: "saved-prompt", promptId: prompt.id });
    if (!result?.ok) {
      showToast(result?.message || tr("無法發送自訂提示語。", "The saved prompt could not be sent."));
      return result || { ok: false };
    }
    closeExportMenu();
    showToast(result.queuedAhead > 0
      ? tr("「{title}」已加入目前聊天室佇列，前面還有 {count} 則。", "“{title}” was added to this conversation's queue with {count} item(s) ahead.", { title: prompt.title, count: result.queuedAhead })
      : tr("「{title}」已送往目前聊天室。", "“{title}” was sent to the current conversation.", { title: prompt.title }));
    return result;
  }

  function createButton(text, className, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    if (title) button.title = title;
    return button;
  }

  function renderMenu(host = state.host) {
    const resolvedHost = host || document.querySelector("[data-cqs-custom-prompt-host]");
    if (!resolvedHost) return false;
    state.host = resolvedHost;
    resolvedHost.textContent = "";
    resolvedHost.className = "cqs-custom-prompts-section";

    const top = document.createElement("div");
    top.className = "cqs-custom-prompts-head";
    const heading = document.createElement("div");
    heading.className = "cqs-custom-prompts-heading";
    const title = document.createElement("strong");
    title.textContent = tr("自訂提示語", "Saved prompts");
    const count = document.createElement("span");
    count.textContent = String(state.prompts.length);
    count.setAttribute("aria-label", tr("{count} 則已儲存提示語", "{count} saved prompts", { count: state.prompts.length }));
    heading.append(title, count);

    const addButton = createButton(tr("＋ 新增", "+ Add"), "cqs-custom-prompts-add", tr("新增自訂提示語", "Add a saved prompt"));
    addButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditor();
    });
    top.append(heading, addButton);
    resolvedHost.append(top);

    const list = document.createElement("div");
    list.className = "cqs-custom-prompts-list";
    list.setAttribute("role", "list");

    if (!state.loaded) {
      const loading = document.createElement("p");
      loading.className = "cqs-custom-prompts-empty";
      loading.textContent = tr("正在載入提示語……", "Loading saved prompts…");
      list.append(loading);
    } else if (!state.prompts.length) {
      const empty = document.createElement("p");
      empty.className = "cqs-custom-prompts-empty";
      empty.textContent = tr("尚未儲存提示語。新增後，滑鼠移到項目即可複製或發送。", "No prompts have been saved. Add one, then hover over it to copy or send.");
      list.append(empty);
    } else {
      for (const prompt of state.prompts) {
        const row = document.createElement("div");
        row.className = "cqs-custom-prompt-row";
        row.tabIndex = 0;
        row.dataset.cqsPromptId = prompt.id;
        row.setAttribute("role", "listitem");
        row.title = prompt.text;

        const copy = document.createElement("div");
        copy.className = "cqs-custom-prompt-copy";
        const promptTitle = document.createElement("strong");
        promptTitle.textContent = prompt.title;
        const preview = document.createElement("small");
        preview.textContent = prompt.text.replace(/\s+/g, " ");
        copy.append(promptTitle, preview);

        const actions = document.createElement("div");
        actions.className = "cqs-custom-prompt-actions";
        const copyButton = createButton(tr("複製", "Copy"), "cqs-custom-prompt-copy-button", tr("複製「{title}」", "Copy “{title}”", { title: prompt.title }));
        const sendButton = createButton(tr("發送", "Send"), "cqs-custom-prompt-send-button", tr("直接發送「{title}」", "Send “{title}” directly", { title: prompt.title }));
        copyButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await copyPrompt(prompt);
        });
        sendButton.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          sendButton.disabled = true;
          try {
            await sendPrompt(prompt);
          } finally {
            if (sendButton.isConnected) sendButton.disabled = false;
          }
        });
        actions.append(copyButton, sendButton);
        row.append(copy, actions);
        list.append(row);
      }
    }
    resolvedHost.append(list);

    if (state.prompts.length) {
      const manageButton = createButton(tr("管理提示語（{count}）", "Manage prompts ({count})", { count: state.prompts.length }), "cqs-custom-prompts-manage", tr("編輯、刪除或調整提示語順序", "Edit, delete, or reorder saved prompts"));
      manageButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openManager();
      });
      resolvedHost.append(manageButton);
    }
    return true;
  }

  function openEditor(existing = null) {
    const ui = uiApi();
    if (!ui) return;
    const wrapper = ui.createElement("div", { className: "cqs-custom-prompt-form" });

    const titleLabel = ui.createElement("label", { text: tr("名稱", "Name") });
    titleLabel.htmlFor = "cqs-custom-prompt-title";
    const titleInput = ui.createElement("input", {
      id: "cqs-custom-prompt-title",
      type: "text",
      attrs: { maxlength: String(MAX_TITLE_LENGTH), placeholder: tr("例如：產生對話交接摘要", "Example: Create a conversation handoff summary") },
    });

    const textLabel = ui.createElement("label", { text: tr("提示語內容", "Prompt content") });
    textLabel.htmlFor = "cqs-custom-prompt-text";
    const textarea = ui.createElement("textarea", {
      id: "cqs-custom-prompt-text",
      attrs: { maxlength: String(MAX_TEXT_LENGTH), spellcheck: "false", placeholder: tr("輸入要重複使用的完整提示語……", "Enter the complete prompt you want to reuse…") },
    });
    const currentDraft = getComposerDraft();
    titleInput.value = existing?.title || "";
    textarea.value = existing?.text || currentDraft;

    const hint = ui.createElement("p", {
      className: "cqs-custom-prompt-form-hint",
      text: currentDraft && !existing
        ? tr("已帶入目前 ChatGPT 輸入框中的文字。名稱留白時會自動使用提示語第一行。", "The current ChatGPT composer text was inserted. Leave the name blank to use the first line automatically.")
        : tr("名稱留白時會自動使用提示語第一行。提示語只儲存在 Firefox 本機。", "Leave the name blank to use the first line automatically. Prompts are stored only in local Firefox storage."),
    });
    wrapper.append(titleLabel, titleInput, textLabel, textarea, hint);

    ui.openModal({
      title: existing ? tr("編輯自訂提示語", "Edit saved prompt") : tr("新增自訂提示語", "Add saved prompt"),
      description: tr("儲存後會顯示在「匯出與轉移」選單中。", "After saving, it will appear in the Export & Transfer menu."),
      content: wrapper,
      actions: [
        { label: tr("取消", "Cancel"), onClick: () => ui.closeModal() },
        {
          label: existing ? tr("儲存修改", "Save changes") : tr("儲存提示語", "Save prompt"),
          primary: true,
          onClick: async () => {
            try {
              const saved = await savePrompt({ id: existing?.id, title: titleInput.value, text: textarea.value });
              ui.closeModal();
              showToast(existing ? tr("已更新「{title}」。", "Updated “{title}”.", { title: saved.title }) : tr("已儲存「{title}」。", "Saved “{title}”.", { title: saved.title }));
            } catch (error) {
              showToast(error?.message || tr("無法儲存提示語。", "The prompt could not be saved."));
              textarea.focus();
            }
          },
        },
      ],
      closeable: true,
      className: "cqs-custom-prompt-modal",
    });
  }

  function openManager() {
    const ui = uiApi();
    if (!ui) return;
    const wrapper = ui.createElement("div", { className: "cqs-custom-prompt-manager" });

    if (!state.prompts.length) {
      wrapper.append(ui.createElement("p", { className: "cqs-custom-prompts-empty", text: tr("目前沒有已儲存的提示語。", "There are no saved prompts.") }));
    } else {
      state.prompts.forEach((prompt, index) => {
        const row = ui.createElement("div", { className: "cqs-custom-prompt-manage-row" });
        const copy = ui.createElement("div", { className: "cqs-custom-prompt-manage-copy" });
        copy.append(
          ui.createElement("strong", { text: prompt.title }),
          ui.createElement("small", { text: prompt.text.replace(/\s+/g, " ") }),
        );
        const actions = ui.createElement("div", { className: "cqs-custom-prompt-manage-actions" });
        const up = createButton("↑", "", tr("上移", "Move up"));
        const down = createButton("↓", "", tr("下移", "Move down"));
        const edit = createButton(tr("編輯", "Edit"), "", tr("編輯「{title}」", "Edit “{title}”", { title: prompt.title }));
        const remove = createButton(tr("刪除", "Delete"), "cqs-danger", tr("刪除「{title}」", "Delete “{title}”", { title: prompt.title }));
        up.disabled = index === 0;
        down.disabled = index === state.prompts.length - 1;
        up.addEventListener("click", async () => { await movePrompt(prompt.id, -1); openManager(); });
        down.addEventListener("click", async () => { await movePrompt(prompt.id, 1); openManager(); });
        edit.addEventListener("click", () => openEditor(prompt));
        remove.addEventListener("click", async () => {
          if (!window.confirm(tr("確定刪除「{title}」嗎？", "Delete “{title}”?", { title: prompt.title }))) return;
          await removePrompt(prompt.id);
          if (state.prompts.length) openManager();
          else {
            ui.closeModal();
            showToast(tr("提示語已刪除。", "The saved prompt was deleted."));
          }
        });
        actions.append(up, down, edit, remove);
        row.append(copy, actions);
        wrapper.append(row);
      });
    }

    ui.openModal({
      title: tr("管理自訂提示語", "Manage saved prompts"),
      description: tr("可儲存最多 {count} 則；這些提示語會在所有 ChatGPT 聊天室共用。", "Save up to {count} prompts. They are shared across all ChatGPT conversations.", { count: MAX_PROMPTS }),
      content: wrapper,
      actions: [
        { label: tr("關閉", "Close"), onClick: () => ui.closeModal() },
        { label: tr("新增提示語", "Add prompt"), primary: true, onClick: () => openEditor() },
      ],
      closeable: true,
      className: "cqs-custom-prompt-manager-modal",
    });
  }

  function mount() {
    const host = document.querySelector("[data-cqs-custom-prompt-host]");
    if (!host) return false;
    renderMenu(host);
    return true;
  }

  document.addEventListener("cqs:export-control-ready", mount);
  extensionApi?.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes?.[STORAGE_KEY]) return;
    const raw = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
    if (state.localWriteCount > 0) {
      state.deferredStorageValue = raw;
      return;
    }
    applyStoredPrompts(raw);
  });

  window.__CQS_CUSTOM_PROMPTS__ = Object.freeze({
    storageKey: STORAGE_KEY,
    maxPrompts: MAX_PROMPTS,
    getPrompts: clonePrompts,
    loadPrompts,
    savePrompt,
    removePrompt,
    movePrompt,
    copyPrompt,
    sendPrompt,
    openEditor,
    openManager,
    renderMenu,
    mount,
  });

  mount();
  void loadPrompts();
})();
