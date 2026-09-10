(() => {
  if (window.__CQS_CHATGPT_QUEUE_SENDER_LOADED__) return;
  window.__CQS_CHATGPT_QUEUE_SENDER_LOADED__ = true;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));

  const MAX_QUEUE = 10;
  const SCHEDULE_LONG_PRESS_MS = 700;
  const SCHEDULE_MIN_LEAD_MS = 5000;
  const LEGACY_STORE_KEY = "cqs_queue_sender_state_v4";
  const STORE_PREFIX = "cqs_queue_sender_state_v5:";
  const NOTIFICATION_SETTINGS_KEY = "cqs_notification_settings_v1";
  const SCHEDULE_STORAGE_KEY = "cqs_scheduled_messages_v1";
  const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
    enabled: false,
    desktop: true,
    sound: true,
    onlyWhenHidden: true,
  });
  const SPLIT_RE = /\n\s*---+\s*\n/g;
  const firefoxApi = globalThis.browser || null;
  const chromeApi = globalThis.chrome || null;

  const state = {
    queue: [],
    running: false,
    abort: false,
    lastError: "",
    managerOpen: false,
    managerDirty: true,
    toastTimer: null,
    lastUndo: null,
    runTotal: 0,
    runDone: 0,
    autoRunArmed: false,
    pausedReason: "",
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
    audioContext: null,
    lastCompletionNoticeKey: "",
    lastCompletionNoticeAt: 0,
    initialized: false,
    tabId: -1,
    scopeKey: "",
    scopePath: location.pathname,
    scopeSwitching: false,
    runPromise: null,
    activeRunScope: "",
    leaseToken: "",
    leaseRenewTimer: null,
    leaseRenewMisses: 0,
    pendingPersist: Promise.resolve(),
    scheduledSendActive: false,
    schedulePanelOpen: false,
    scheduleLongPressTimer: null,
    scheduleLongPressTriggered: false,
    scheduleDraftSource: "",
    scheduleItems: [],
    responseMonitor: {
      initialized: false,
      path: location.pathname,
      lastUserCount: 0,
      lastAssistantCount: 0,
      lastAssistantSignature: "",
      pendingUser: false,
      pendingUserAt: 0,
      active: false,
      activitySeen: false,
      assistantSeen: false,
      stableIdleTicks: 0,
      cycleStartedAt: 0,
      lastAssistantChangeAt: 0,
    },
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function uid() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getConversationId(pathname = location.pathname) {
    const match = String(pathname || "").match(/(?:^|\/)c\/([A-Za-z0-9_-]{8,})(?:\/|$)/);
    return match?.[1] || "";
  }

  function getScopeKeyForLocation() {
    const conversationId = getConversationId();
    if (conversationId) return `conversation:${conversationId}`;
    const tabPart = Number.isInteger(state.tabId) && state.tabId >= 0 ? state.tabId : "unknown";
    return `draft-tab:${tabPart}`;
  }

  function getScopedStorageKey(scopeKey = state.scopeKey) {
    return `${STORE_PREFIX}${encodeURIComponent(String(scopeKey || "unbound"))}`;
  }

  function isDraftScope(scopeKey) {
    return String(scopeKey || "").startsWith("draft-tab:");
  }

  function isConversationScope(scopeKey) {
    return String(scopeKey || "").startsWith("conversation:");
  }

  async function storageReadKey(key) {
    try {
      if (firefoxApi?.storage?.local) {
        const result = await firefoxApi.storage.local.get(key);
        return result?.[key] || {};
      }
    } catch (_) {}

    try {
      if (chromeApi?.storage?.local) {
        return await new Promise((resolve) => {
          chromeApi.storage.local.get(key, (result) => resolve(result?.[key] || {}));
        });
      }
    } catch (_) {}

    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch (_) {
      return {};
    }
  }

  async function storageWriteKey(key, value) {
    try {
      if (firefoxApi?.storage?.local) {
        await firefoxApi.storage.local.set({ [key]: value });
        return;
      }
    } catch (_) {}

    try {
      if (chromeApi?.storage?.local) {
        await new Promise((resolve) => chromeApi.storage.local.set({ [key]: value }, resolve));
        return;
      }
    } catch (_) {}

    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  async function storageRemoveKey(key) {
    try {
      if (firefoxApi?.storage?.local?.remove) {
        await firefoxApi.storage.local.remove(key);
        return;
      }
    } catch (_) {}

    try {
      if (chromeApi?.storage?.local?.remove) {
        await new Promise((resolve) => chromeApi.storage.local.remove(key, resolve));
        return;
      }
    } catch (_) {}

    try { localStorage.removeItem(key); } catch (_) {}
  }

  async function storageGet(scopeKey = state.scopeKey) {
    return storageReadKey(getScopedStorageKey(scopeKey));
  }

  async function notificationSettingsGet() {
    try {
      if (firefoxApi?.storage?.local) {
        const result = await firefoxApi.storage.local.get(NOTIFICATION_SETTINGS_KEY);
        return {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...(result?.[NOTIFICATION_SETTINGS_KEY] || {}),
        };
      }
    } catch (_) {}

    try {
      if (chromeApi?.storage?.local) {
        const result = await new Promise((resolve) => {
          chromeApi.storage.local.get(NOTIFICATION_SETTINGS_KEY, resolve);
        });
        return {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...(result?.[NOTIFICATION_SETTINGS_KEY] || {}),
        };
      }
    } catch (_) {}

    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  function sendExtensionMessage(message) {
    try {
      if (firefoxApi?.runtime?.sendMessage) {
        return Promise.resolve(firefoxApi.runtime.sendMessage(message)).catch(() => undefined);
      }
    } catch (_) {}

    try {
      if (chromeApi?.runtime?.sendMessage) {
        return new Promise((resolve) => {
          chromeApi.runtime.sendMessage(message, (response) => resolve(response));
        });
      }
    } catch (_) {}

    return Promise.resolve(undefined);
  }

  function getExtensionUrl(path) {
    try {
      if (firefoxApi?.runtime?.getURL) return firefoxApi.runtime.getURL(path);
      if (chromeApi?.runtime?.getURL) return chromeApi.runtime.getURL(path);
    } catch (_) {}
    return "";
  }

  async function initializeTabContext() {
    const response = await sendExtensionMessage({ type: "CQS_GET_TAB_CONTEXT" });
    const tabId = Number(response?.tabId);
    state.tabId = Number.isInteger(tabId) ? tabId : -1;
  }

  async function claimLegacyQueueForCurrentScope() {
    const storageKey = getScopedStorageKey(state.scopeKey);
    const response = await sendExtensionMessage({
      type: "CQS_CLAIM_LEGACY_QUEUE",
      scopeKey: state.scopeKey,
      storageKey,
      legacyStorageKey: LEGACY_STORE_KEY,
    });
    return Boolean(response?.migrated);
  }

  function stopLeaseRenewal() {
    if (state.leaseRenewTimer) clearInterval(state.leaseRenewTimer);
    state.leaseRenewTimer = null;
  }

  async function acquireQueueLease(scopeKey) {
    const hasRuntimeMessaging = Boolean(firefoxApi?.runtime?.sendMessage || chromeApi?.runtime?.sendMessage);
    const response = await sendExtensionMessage({
      type: "CQS_QUEUE_LEASE_ACQUIRE",
      scopeKey,
    });
    if (!hasRuntimeMessaging) {
      state.leaseToken = `local-${uid()}`;
      state.leaseRenewMisses = 0;
      stopLeaseRenewal();
      return { ok: true };
    }
    if (!response) {
      return { ok: false, reason: "background-unavailable", retryAfterMs: 3000 };
    }
    if (response.ok !== false) {
      state.leaseToken = String(response.token || `lease-${uid()}`);
      state.leaseRenewMisses = 0;
      stopLeaseRenewal();
      state.leaseRenewTimer = setInterval(() => {
        if (!state.leaseToken || !state.activeRunScope) return;
        sendExtensionMessage({
          type: "CQS_QUEUE_LEASE_RENEW",
          scopeKey: state.activeRunScope,
          token: state.leaseToken,
        }).then((renewed) => {
          if (!renewed || renewed.ok === false) {
            state.leaseRenewMisses += 1;
            if (state.leaseRenewMisses >= 2) state.abort = true;
          } else {
            state.leaseRenewMisses = 0;
          }
        });
      }, 4000);
      return { ok: true };
    }
    return {
      ok: false,
      reason: String(response.reason || "owned-by-another-tab"),
      retryAfterMs: Math.max(1000, Number(response.retryAfterMs) || 3000),
    };
  }

  async function releaseQueueLease(scopeKey = state.activeRunScope) {
    stopLeaseRenewal();
    const token = state.leaseToken;
    state.leaseToken = "";
    state.leaseRenewMisses = 0;
    if (!scopeKey || !token) return;
    await sendExtensionMessage({
      type: "CQS_QUEUE_LEASE_RELEASE",
      scopeKey,
      token,
    });
  }

  async function transferQueueLease(fromScopeKey, toScopeKey) {
    if (!state.leaseToken) return;
    const response = await sendExtensionMessage({
      type: "CQS_QUEUE_LEASE_TRANSFER",
      fromScopeKey,
      toScopeKey,
      token: state.leaseToken,
    });
    if (!response || response.ok === false) state.abort = true;
  }

  function serializeQueueState(value, scopeKey = state.scopeKey) {
    const normalizedScopeKey = String(scopeKey || "");
    return {
      schemaVersion: 5,
      scopeKey: normalizedScopeKey,
      conversationId: normalizedScopeKey.startsWith("conversation:") ? normalizedScopeKey.slice("conversation:".length) : "",
      savedPath: String(location.pathname || ""),
      pausedReason: value.pausedReason === "stopped" || value.pausedReason === "error" ? value.pausedReason : "",
      queue: value.queue.map(({ id, text, status, submission, kind, promptId }) => ({
        id,
        text,
        kind: kind === "handoff" || kind === "saved-prompt" ? kind : "",
        promptId: kind === "saved-prompt" ? String(promptId || "") : "",
        status: status || "pending",
        submission: submission && typeof submission === "object"
          ? {
              userCountBefore: Number(submission.userCountBefore) || 0,
              assistantCountBefore: Number(submission.assistantCountBefore) || 0,
              submittedAt: Number(submission.submittedAt) || 0,
              path: String(submission.path || ""),
            }
          : null,
      })),
    };
  }

  function storageSet(value, scopeKey = state.scopeKey) {
    const key = getScopedStorageKey(scopeKey);
    const safeValue = serializeQueueState(value, scopeKey);
    state.pendingPersist = Promise.resolve(state.pendingPersist)
      .catch(() => undefined)
      .then(() => storageWriteKey(key, safeValue));
    return state.pendingPersist;
  }

  function applySavedQueueState(saved = {}) {
    state.pausedReason = saved.pausedReason === "stopped" || saved.pausedReason === "error" ? saved.pausedReason : "";
    state.queue = Array.isArray(saved.queue)
      ? saved.queue
          .slice(0, MAX_QUEUE)
          .map((item) => ({
            id: item.id || uid(),
            text: String(item.text || ""),
            kind: item.kind === "handoff" || item.kind === "saved-prompt" ? item.kind : "",
            promptId: item.kind === "saved-prompt" ? String(item.promptId || "") : "",
            status: item.status === "awaiting-response" && item.submission ? "awaiting-response" : "pending",
            submission: item.status === "awaiting-response" && item.submission ? item.submission : null,
          }))
          .filter((item) => item.text.trim())
      : [];
  }

  async function migrateDraftScopeToConversation(oldScopeKey, newScopeKey) {
    await Promise.resolve(state.pendingPersist).catch(() => undefined);
    state.scopeKey = newScopeKey;
    state.scopePath = location.pathname;
    await storageWriteKey(getScopedStorageKey(newScopeKey), serializeQueueState(state, newScopeKey));
    await storageRemoveKey(getScopedStorageKey(oldScopeKey));
    await transferQueueLease(oldScopeKey, newScopeKey);
    if (state.activeRunScope === oldScopeKey) state.activeRunScope = newScopeKey;
    resetResponseMonitor({ keepBusy: true });
    markManagerDirty();
    renderUi();
    void refreshScheduledItems();
  }

  async function switchQueueScopeIfNeeded() {
    if (!state.initialized || state.scopeSwitching) return;
    const nextScopeKey = getScopeKeyForLocation();
    if (!nextScopeKey || nextScopeKey === state.scopeKey) {
      state.scopePath = location.pathname;
      return;
    }

    state.scopeSwitching = true;
    const previousScopeKey = state.scopeKey;
    const previousQueueCount = state.queue.length;
    try {
      const draftRouteBecameConversation = isDraftScope(previousScopeKey)
        && isConversationScope(nextScopeKey);
      if (draftRouteBecameConversation) {
        await sendExtensionMessage({
          type: "CQS_SCHEDULE_SCOPE_TRANSFER",
          fromScopeKey: previousScopeKey,
          toScopeKey: nextScopeKey,
        });
      }

      const draftBecameConversation = draftRouteBecameConversation
        && (state.running || state.queue.length > 0);

      if (draftBecameConversation) {
        await migrateDraftScopeToConversation(previousScopeKey, nextScopeKey);
        return;
      }

      if (state.running) {
        state.abort = true;
        try {
          await Promise.race([
            Promise.resolve(state.runPromise),
            wait(6000),
          ]);
        } catch (_) {}
      }

      await releaseQueueLease(previousScopeKey);
      await Promise.resolve(state.pendingPersist).catch(() => undefined);

      state.scopeKey = nextScopeKey;
      state.scopePath = location.pathname;
      state.autoRunArmed = false;
      state.abort = false;
      state.running = false;
      state.activeRunScope = "";
      state.runTotal = 0;
      state.runDone = 0;
      state.lastUndo = null;
      state.lastError = "";

      const saved = await storageGet(nextScopeKey);
      applySavedQueueState(saved);
      resetResponseMonitor({ keepBusy: true });
      markManagerDirty();
      renderUi();
      void refreshScheduledItems();

      if (previousQueueCount > 0) {
        showToast(tr("原佇列已保留在原本的 ChatGPT 聊天室，不會在目前聊天室送出。", "The original queue was kept in its ChatGPT conversation and will not send in the current conversation."), { duration: 5200 });
      }
      if (state.queue.length && !state.pausedReason) setTimeout(requestAutoRun, 650);
    } finally {
      state.scopeSwitching = false;
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function isDisabled(button) {
    return !button || button.disabled || button.getAttribute("aria-disabled") === "true" || button.dataset.cqsQueueButton === "1";
  }

  function isCqsUi(el) {
    return Boolean(el?.closest?.("#cqs-preview-bar, #cqs-manager, #cqs-toast, #cqs-floating-button, #cqs-schedule-panel"));
  }

  function getRunTotal() {
    if (!state.running) return state.queue.length;
    return Math.max(state.runTotal || 0, state.runDone + state.queue.length, 1);
  }

  function getRunCurrentIndex() {
    const total = getRunTotal();
    return Math.min(state.runDone + 1, total);
  }

  function byBottomMostVisible(selectors, root = document) {
    for (const selector of selectors) {
      let candidates = [];
      try {
        candidates = [...root.querySelectorAll(selector)];
      } catch (_) {}
      const match = candidates
        .filter((el) => !isCqsUi(el) && isVisible(el))
        .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
      if (match) return match;
    }
    return null;
  }

  function getComposerInput() {
    return byBottomMostVisible([
      "#prompt-textarea",
      "textarea[data-id='root']",
      "textarea[placeholder*='Message']",
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='訊息']",
      "textarea[placeholder*='詢問']",
      "div[contenteditable='true'][id='prompt-textarea']",
      "div[contenteditable='true'][aria-label*='Message']",
      "div[contenteditable='true'][aria-label*='Ask']",
      "div[contenteditable='true'][aria-label*='訊息']",
      "div[contenteditable='true'][aria-label*='詢問']",
      "[contenteditable='true']",
    ]);
  }

  function getSendButton(readyOnly = true) {
    const input = getComposerInput();
    const root = input?.closest("form") || document;
    const selectors = [
      "button[data-testid='send-button']",
      "button[data-testid='composer-send-button']",
      "button[data-testid='composer-submit-button']",
      "button[aria-label='Send prompt']",
      "button[aria-label='Send message']",
      "button[aria-label*='Send']",
      "button[aria-label*='Submit']",
      "button[aria-label*='送出']",
      "button[aria-label*='提交']",
      "button[aria-label*='傳送']",
    ];
    const buttons = [];
    for (const selector of selectors) {
      try {
        buttons.push(...root.querySelectorAll(selector));
      } catch (_) {}
    }
    const unique = [...new Set(buttons)]
      .filter((btn) => btn.dataset.cqsQueueButton !== "1" && isVisible(btn))
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    if (!readyOnly) return unique[0] || null;
    return unique.find((btn) => !isDisabled(btn)) || null;
  }

  function getNativeStopButton() {
    const selectors = [
      "button[data-testid='stop-button']",
      "button[data-testid='composer-stop-button']",
      "button[data-testid*='stop-generating']",
      "button[aria-label='Stop generating']",
      "button[aria-label*='Stop generating']",
      "button[aria-label*='Stop response']",
      "button[aria-label*='停止產生']",
      "button[aria-label*='停止生成']",
      "button[aria-label*='停止回覆']",
      "button[aria-label*='中止回覆']",
    ];

    const candidates = [];
    for (const selector of selectors) {
      try {
        candidates.push(...document.querySelectorAll(selector));
      } catch (_) {}
    }

    return [...new Set(candidates)]
      .filter((button) => {
        if (isCqsUi(button) || button.dataset.cqsQueueButton === "1" || !isVisible(button) || button.disabled) return false;
        const testid = button?.dataset?.testid || "";
        const label = [
          button?.getAttribute?.("aria-label") || "",
          button?.getAttribute?.("title") || "",
          button?.textContent || "",
          testid,
        ].join(" ").toLowerCase();
        const explicitStop = /(stop-button|composer-stop-button|stop-generating)/i.test(testid);
        const looksStop = /(stop generating|stop response|停止產生|停止生成|停止回覆|中止回覆)/i.test(label);
        const looksVoiceOrAudio = /(voice|dictate|mic|microphone|audio|語音|麥克風|錄音|音訊)/i.test(label);
        return explicitStop || (looksStop && !looksVoiceOrAudio);
      })
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  }

  function getStreamingIndicator() {
    return byBottomMostVisible([
      "[data-message-author-role='assistant'][data-is-streaming='true']",
      "[data-is-streaming='true'][data-message-author-role='assistant']",
      "[data-testid^='conversation-turn-'] [data-is-streaming='true']",
      ".result-streaming",
      "[data-message-author-role='assistant'][aria-busy='true']",
    ]);
  }

  function getLatestAssistantTurn() {
    let nodes = [];
    try {
      nodes = [...document.querySelectorAll("[data-message-author-role='assistant']")]
        .filter((node) => !isCqsUi(node) && isVisible(node));
    } catch (_) {}
    const body = nodes
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    return body?.closest?.("[data-testid^='conversation-turn-'], article, [data-turn]") || body || null;
  }

  function getAssistantCompletionControl() {
    const turn = getLatestAssistantTurn();
    if (!turn) return null;
    return byBottomMostVisible([
      "button[data-testid='copy-turn-action-button']",
      "button[data-testid^='copy-turn-action-button']",
      "button[aria-label*='Copy response']",
      "button[aria-label*='複製回覆']",
      "button[aria-label*='复制回复']",
    ], turn);
  }

  function isLikelyActiveWorkText(value) {
    const text = normalizeText(value);
    if (!text || text.length > 180) return false;
    const english = /(?:^|\b)(?:working|thinking|reasoning|searching|browsing|reading|writing|editing|creating|updating|applying|patching|saving|downloading|uploading|inspecting|analy[sz]ing|reviewing|checking|running|executing|compiling|building|testing|installing|fetching|generating|processing|calling|using|waiting)(?:\b|\.{2,}|…)/i;
    const chinese = /(?:正在(?:工作|思考|推理|搜尋|搜索|瀏覽|浏览|讀取|读取|撰寫|撰写|編輯|编辑|分析|檢查|检查|執行|执行|編譯|编译|建置|构建|測試|测试|安裝|安装|取得|获取|產生|生成|處理|处理|呼叫|调用|等待)|(?:工作|思考|推理|搜尋|搜索|瀏覽|浏览|讀取|读取|撰寫|撰写|編輯|编辑|分析|檢查|检查|執行|执行|編譯|编译|建置|构建|測試|测试|安裝|安装|產生|生成|處理|处理|等待)中)/;
    return english.test(text) || chinese.test(text);
  }

  function getActiveWorkIndicator() {
    const turn = getLatestAssistantTurn();
    if (!turn) return null;

    const explicit = byBottomMostVisible([
      "[aria-busy='true']",
      "[data-state='loading']",
      "[data-state='pending']",
      "[data-status='running']",
      "[data-status='pending']",
      "[data-testid*='thinking'][data-state='open']",
      "[data-testid*='reasoning'][data-state='open']",
      "[data-testid*='loading']",
      "[data-testid*='progress']",
      "progress:not([value])",
      "[role='progressbar']:not([aria-valuenow='100'])",
      "button[aria-label*='Stop task']",
      "button[aria-label*='Stop tool']",
      "button[aria-label*='Cancel task']",
      "button[aria-label*='Cancel tool']",
      "button[aria-label*='停止工作']",
      "button[aria-label*='停止工具']",
      "button[aria-label*='取消工作']",
      "button[aria-label*='停止任务']",
      "button[aria-label*='取消任务']",
    ], turn);
    if (explicit) return explicit;

    let candidates = [];
    try {
      candidates = [...turn.querySelectorAll([
        "[role='status']",
        "[aria-live='polite']",
        "[aria-live='assertive']",
        "[data-testid*='status']",
        "[data-testid*='thinking']",
        "[data-testid*='reasoning']",
        "[class*='shimmer']",
        "[class*='animate-']",
        "[class*='animate_']",
        "[class*='pulse']",
        "[class*='loading']",
        "[class*='thinking']",
      ].join(","))];
    } catch (_) {}

    return candidates.find((element) => {
      if (isCqsUi(element) || !isVisible(element)) return false;
      const text = element.innerText || element.textContent || element.getAttribute?.("aria-label") || "";
      const className = String(element.getAttribute?.("class") || "");
      let animated = /(?:shimmer|animate-|animate_|pulse|loading|thinking)/i.test(className);
      try {
        const style = window.getComputedStyle(element);
        animated = animated || (style.animationName && style.animationName !== "none");
      } catch (_) {}
      const statusSemantic = Boolean(element.matches?.("[role='status'], [aria-live], [data-testid*='status'], [data-testid*='thinking'], [data-testid*='reasoning']"));
      if (animated && statusSemantic && normalizeText(text)) return true;
      return animated && isLikelyActiveWorkText(text);
    }) || null;
  }

  function getIdleVoiceButton() {
    const root = getComposerRoot() || document;
    return byBottomMostVisible([
      "button[data-testid*='voice']",
      "button[data-testid*='speech']",
      "button[data-testid*='dictat']",
      "button[aria-label*='Voice']",
      "button[aria-label*='voice']",
      "button[aria-label*='Dictat']",
      "button[aria-label*='Microphone']",
      "button[aria-label*='語音']",
      "button[aria-label*='麥克風']",
      "button[aria-label*='錄音']",
      "button[aria-label*='音訊']",
    ], root);
  }

  function hasBusyEvidence() {
    return Boolean(getNativeStopButton() || getStreamingIndicator() || getActiveWorkIndicator());
  }

  function hasStrongIdleComposerControl() {
    return Boolean(getSendButton(false) || getIdleVoiceButton());
  }

  function isComposerReadyForQueue() {
    const input = getComposerInput();
    if (!input || !isVisible(input) || input.disabled || input.readOnly) return false;
    if (hasBusyEvidence()) return false;
    return hasStrongIdleComposerControl();
  }

  function getLatestConversationRole() {
    let nodes = [];
    try {
      nodes = [...document.querySelectorAll("[data-message-author-role='user'], [data-message-author-role='assistant']")]
        .filter((node) => !isCqsUi(node) && isVisible(node));
    } catch (_) {}
    const last = nodes[nodes.length - 1];
    const role = String(last?.getAttribute?.("data-message-author-role") || last?.dataset?.messageAuthorRole || "").toLowerCase();
    return role === "user" || role === "assistant" ? role : "";
  }

  function getConversationCounts() {
    const uniqueTurns = (selector) => {
      const nodes = [...document.querySelectorAll(selector)].filter((node) => !isCqsUi(node));
      const turns = new Set(nodes.map((node) => node.closest("[data-testid^='conversation-turn-'], article, [data-turn]") || node));
      return turns.size;
    };
    return {
      user: uniqueTurns("[data-message-author-role='user']"),
      assistant: uniqueTurns("[data-message-author-role='assistant']"),
    };
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getLastAssistantText(max = 220) {
    let nodes = [];
    try {
      nodes = [...document.querySelectorAll("[data-message-author-role='assistant']")]
        .filter((node) => !isCqsUi(node));
    } catch (_) {}
    const last = nodes[nodes.length - 1];
    const clean = normalizeText(last?.innerText || last?.textContent || "");
    if (!clean) return "";
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  }

  function getLastAssistantSignature() {
    const preview = getLastAssistantText(260);
    return preview ? `${getConversationCounts().assistant}:${preview}` : "";
  }

  function isPageForeground() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  async function ensureAudioContext() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      state.audioContext ||= new AudioContextCtor();
      if (state.audioContext.state === "suspended") await state.audioContext.resume();
      return state.audioContext;
    } catch (_) {
      return null;
    }
  }

  async function playCompletionChime() {
    const context = await ensureAudioContext();
    if (!context) return false;
    try {
      const now = context.currentTime;
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.085, now + 0.015);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);
      master.connect(context.destination);

      for (const [frequency, offset, duration] of [[659.25, 0, 0.30], [880, 0.18, 0.42]]) {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        oscillator.connect(master);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + duration);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function prepareCompletionAudio() {
    if (!state.notificationSettings.enabled || !state.notificationSettings.sound) return;
    ensureAudioContext();
  }

  async function notifyResponseCompleted() {
    const now = Date.now();
    const completionKey = `${location.pathname}|${getLastAssistantSignature() || getConversationCounts().assistant}`;
    if (completionKey === state.lastCompletionNoticeKey && now - state.lastCompletionNoticeAt < 15000) return;
    state.lastCompletionNoticeKey = completionKey;
    state.lastCompletionNoticeAt = now;

    const settings = state.notificationSettings;
    if (!settings.enabled) return;
    if (settings.onlyWhenHidden && isPageForeground()) return;

    if (settings.sound) playCompletionChime();

    if (settings.desktop) {
      const conversationTitle = normalizeText(document.title).replace(/\s*[-–—|]\s*ChatGPT\s*$/i, "");
      const preview = getLastAssistantText(220);
      sendExtensionMessage({
        type: "CQS_RESPONSE_COMPLETE",
        title: conversationTitle && !/^chatgpt$/i.test(conversationTitle)
          ? tr("ChatGPT 回覆完成｜{title}", "ChatGPT response complete | {title}", { title: conversationTitle.slice(0, 48) })
          : tr("ChatGPT 回覆完成", "ChatGPT response complete"),
        message: preview || tr("ChatGPT 已完成這次回覆。", "ChatGPT has finished this response."),
      });
    }
  }

  function resetResponseMonitor({ keepBusy = false } = {}) {
    const monitor = state.responseMonitor;
    const counts = getConversationCounts();
    monitor.initialized = true;
    monitor.path = location.pathname;
    monitor.lastUserCount = counts.user;
    monitor.lastAssistantCount = counts.assistant;
    monitor.lastAssistantSignature = getLastAssistantSignature();
    monitor.pendingUser = false;
    monitor.pendingUserAt = 0;
    monitor.active = keepBusy && hasBusyEvidence();
    monitor.activitySeen = monitor.active;
    monitor.assistantSeen = false;
    monitor.stableIdleTicks = 0;
    monitor.cycleStartedAt = monitor.active ? Date.now() : 0;
    monitor.lastAssistantChangeAt = monitor.active ? Date.now() : 0;
  }

  function responseMonitorTick() {
    const monitor = state.responseMonitor;
    if (!monitor.initialized || monitor.path !== location.pathname) {
      resetResponseMonitor({ keepBusy: true });
      return;
    }

    const counts = getConversationCounts();
    const signature = getLastAssistantSignature();
    const busy = hasBusyEvidence();
    const userIncreased = counts.user > monitor.lastUserCount;
    const assistantIncreased = counts.assistant > monitor.lastAssistantCount;
    const assistantChanged = Boolean(signature && signature !== monitor.lastAssistantSignature);
    const now = Date.now();

    if (userIncreased) {
      monitor.pendingUser = true;
      monitor.pendingUserAt = now;
      monitor.stableIdleTicks = 0;
    }

    if (busy) {
      if (!monitor.active) {
        monitor.active = true;
        monitor.cycleStartedAt = now;
      }
      monitor.activitySeen = true;
      monitor.stableIdleTicks = 0;
    }

    if ((assistantIncreased || assistantChanged) && (monitor.active || monitor.pendingUser)) {
      monitor.active = true;
      monitor.assistantSeen = true;
      monitor.lastAssistantChangeAt = now;
      monitor.stableIdleTicks = 0;
      if (!monitor.cycleStartedAt) monitor.cycleStartedAt = now;
    }

    if (monitor.pendingUser && !monitor.active && now - monitor.pendingUserAt > 10 * 60 * 1000) {
      monitor.pendingUser = false;
      monitor.pendingUserAt = 0;
    }

    if (monitor.active && !busy) {
      const completionControl = getAssistantCompletionControl();
      const stableFallback = monitor.assistantSeen
        && monitor.lastAssistantChangeAt > 0
        && now - monitor.lastAssistantChangeAt >= 12000;
      if ((monitor.activitySeen || monitor.assistantSeen) && monitor.assistantSeen && isComposerReadyForQueue() && (completionControl || stableFallback)) {
        monitor.stableIdleTicks += 1;
        if (monitor.stableIdleTicks >= 3) {
          monitor.active = false;
          monitor.pendingUser = false;
          monitor.pendingUserAt = 0;
          monitor.activitySeen = false;
          monitor.assistantSeen = false;
          monitor.stableIdleTicks = 0;
          monitor.cycleStartedAt = 0;
          monitor.lastAssistantChangeAt = 0;
          notifyResponseCompleted();
        }
      } else {
        monitor.stableIdleTicks = 0;
      }
    }

    monitor.lastUserCount = counts.user;
    monitor.lastAssistantCount = counts.assistant;
    monitor.lastAssistantSignature = signature;
  }

  function getComposerRoot() {
    const input = getComposerInput();
    const send = getSendButton(false);
    return input?.closest("form") || send?.closest("form") || input?.closest("[data-testid]") || send?.parentElement || null;
  }

  function isAttachmentPreviewControl(button) {
    if (!button) return false;
    const testid = String(button.dataset?.testid || button.getAttribute?.("data-testid") || "");
    if (/composer-plus/i.test(testid)) return false;

    const label = normalizeText([
      button.getAttribute?.("aria-label") || "",
      button.getAttribute?.("title") || "",
      button.textContent || "",
      testid,
    ].join(" ")).toLowerCase();

    if (/(remove|delete|close|dismiss|preview|crop|replace|edit image|open image|移除|刪除|删除|關閉|关闭|預覽|预览|裁切|替換|替换|編輯圖片|编辑图片)/i.test(label)) return true;

    try {
      return Boolean(button.closest([
        "[data-testid*='attachment-preview']",
        "[data-testid*='file-preview']",
        "[data-testid*='image-preview']",
        "[data-testid*='attachment-chip']",
        "[class*='attachment-preview']",
        "[class*='file-preview']",
        "[class*='image-preview']",
      ].join(",")));
    } catch (_) {
      return false;
    }
  }

  function getQueueAnchorButton() {
    const root = getComposerRoot();
    const input = getComposerInput();
    if (!root || !input) return null;

    const stableAnchor = byBottomMostVisible([
      "button[data-testid='composer-plus-btn']",
      "button[data-testid='composer-plus-button']",
      "button[aria-label='Add files and more']",
      "button[aria-label*='Add files']",
      "button[aria-label*='新增檔案']",
      "button[aria-label*='添加文件']",
    ], root);
    if (stableAnchor?.parentElement && !isAttachmentPreviewControl(stableAnchor)) return stableAnchor;

    const inputRect = input.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const buttons = [...root.querySelectorAll("button")]
      .filter((button) => button.dataset.cqsQueueButton !== "1" && isVisible(button) && !isAttachmentPreviewControl(button))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const label = normalizeText([
          button.getAttribute("aria-label") || "",
          button.getAttribute("title") || "",
          button.textContent || "",
          button.dataset?.testid || "",
        ].join(" ")).toLowerCase();
        return { button, rect, label };
      })
      .filter(({ rect }) => rect.bottom >= rootRect.top && rect.top <= rootRect.bottom);

    const looksLikeAddControl = ({ label }) => (
      /composer-plus/i.test(label)
      || /^\s*\+\s*$/.test(label)
      || /(?:^|\s)(?:add|attach|upload|plus|新增|加入|附加|上傳|添加|上传)(?:\s|$)/i.test(label)
    );

    const sameComposerRow = ({ rect }) => (
      rect.left <= inputRect.left + 112
      && rect.top >= inputRect.top - 16
      && rect.bottom >= inputRect.bottom - 72
    );

    const leftTool = buttons
      .filter(looksLikeAddControl)
      .filter(sameComposerRow)
      .sort((a, b) => b.rect.left - a.rect.left)[0]?.button;
    if (leftTool?.parentElement) return leftTool;

    return buttons
      .filter(sameComposerRow)
      .sort((a, b) => b.rect.left - a.rect.left)[0]?.button || null;
  }

  function getComposerText() {
    const input = getComposerInput();
    if (!input) return "";
    if ("value" in input) return input.value || "";
    return input.innerText || input.textContent || "";
  }

  function setComposerText(text) {
    const input = getComposerInput();
    if (!input) throw new Error(tr("找不到 ChatGPT 輸入框。請先點一下對話輸入框，或重新整理頁面後再試。", "The ChatGPT composer could not be found. Click the message box or refresh the page and try again."));

    input.focus();

    if ("value" in input) {
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(input, text);
      else input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return input;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);

    if (typeof document.execCommand === "function") {
      document.execCommand("delete", false);
      if (text) document.execCommand("insertText", false, text);
    } else {
      input.textContent = text;
    }

    if (!text) {
      input.textContent = "";
      input.innerHTML = "";
    } else if ((input.innerText || input.textContent || "").trim() !== text.trim()) {
      input.textContent = text;
    }

    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: text ? "insertText" : "deleteContentBackward",
      data: text,
    }));
    return input;
  }

  function clearComposerText() {
    try {
      setComposerText("");
    } catch (_) {}
  }

  function splitMessages(raw) {
    return String(raw || "")
      .split(SPLIT_RE)
      .map((msg) => msg.trim())
      .filter(Boolean);
  }

  function shorten(text, max = 140) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  }

  function setTextIfChanged(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function syncRunTotal() {
    if (state.running) state.runTotal = state.runDone + state.queue.length;
  }

  function markManagerDirty() {
    state.managerDirty = true;
  }

  function formatLocalDateTimeInput(epochMs) {
    const date = new Date(epochMs);
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function defaultScheduledEpoch() {
    const date = new Date(Date.now() + 5 * 60 * 1000);
    date.setSeconds(0, 0);
    if (date.getTime() < Date.now() + SCHEDULE_MIN_LEAD_MS) date.setMinutes(date.getMinutes() + 1);
    return date.getTime();
  }

  function getScheduleTimeZoneLabel() {
    let zone = "";
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
    const offsetMinutes = -new Date().getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const hours = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes = Math.abs(offsetMinutes) % 60;
    const offset = `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    return zone ? `${zone} · ${offset}` : offset;
  }

  function formatScheduledDisplay(epochMs) {
    try {
      return new Intl.DateTimeFormat(globalThis.CQS_I18N?.isEnglish ? "en-US" : "zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(epochMs));
    } catch (_) {
      return new Date(epochMs).toLocaleString();
    }
  }

  function scheduleReasonMessage(reason) {
    const key = String(reason || "");
    const messages = {
      "time-too-soon": tr("排定時間必須至少晚於現在幾秒鐘。", "The scheduled time must be at least a few seconds in the future."),
      "time-too-far": tr("目前最多可排定一年內的時間。", "Scheduled sends are currently limited to one year ahead."),
      "scope-mismatch": tr("聊天室已切換，請重新開啟定時設定。", "The conversation changed. Reopen the schedule panel."),
      "alarms-unavailable": tr("Firefox 定時排程 API 目前無法使用。", "Firefox's scheduling API is currently unavailable."),
      "alarm-create-failed": tr("Firefox 無法建立這次定時排程。", "Firefox could not create this scheduled send."),
      "already-firing": tr("這則定時訊息已開始發送，無法再取消。", "This scheduled message has already started sending and can no longer be canceled."),
      "not-found": tr("找不到這則定時訊息，可能已經送出或取消。", "This scheduled message no longer exists. It may already have been sent or canceled."),
    };
    return messages[key] || tr("定時發送設定失敗。", "Could not save the scheduled send.");
  }

  function ensureSchedulePanel() {
    let panel = document.getElementById("cqs-schedule-panel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "cqs-schedule-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", tr("定時發送", "Scheduled send"));
    panel.innerHTML = `
      <div class="cqs-schedule-head">
        <div>
          <strong>${tr("定時發送", "Scheduled send")}</strong>
          <span>${tr("單次", "One-time")}</span>
        </div>
        <button type="button" class="cqs-schedule-close" data-cqs-schedule-action="close" aria-label="${tr("關閉", "Close")}">×</button>
      </div>
      <div class="cqs-schedule-hint">${tr("長按「加入佇列」可開啟。時間使用 Firefox／系統時鐘，通常由作業系統透過網路自動校時；不連接第三方時間伺服器。", "Long-press Add to queue to open this panel. Timing uses the Firefox/system clock, which is normally network-synchronized by your operating system; no third-party time server is contacted.")}</div>
      <label class="cqs-schedule-field">
        <span>${tr("要發送的內容", "Message to send")}</span>
        <textarea rows="3" data-cqs-schedule-text></textarea>
      </label>
      <label class="cqs-schedule-field">
        <span>${tr("發送時間", "Send at")}</span>
        <input type="datetime-local" step="60" data-cqs-schedule-time>
      </label>
      <div class="cqs-schedule-zone" data-cqs-schedule-zone></div>
      <div class="cqs-schedule-actions">
        <button type="button" data-cqs-schedule-action="close">${tr("取消", "Cancel")}</button>
        <button type="button" class="cqs-schedule-primary" data-cqs-schedule-action="create">${tr("設定定時發送", "Schedule send")}</button>
      </div>
      <div class="cqs-schedule-manager-hint">${tr("設定完成後會顯示在原本的佇列管理抽屜中，和一般佇列內容放在同一個位置。", "After scheduling, the message appears in the normal queue manager alongside regular queued messages.")}</div>
    `;
    document.body.appendChild(panel);

    panel.addEventListener("click", async (event) => {
      const button = event.target?.closest?.("[data-cqs-schedule-action]");
      if (!button) return;
      const action = button.dataset.cqsScheduleAction;
      if (action === "close") {
        closeSchedulePanel();
        return;
      }
      if (action === "create") {
        await createScheduledSendFromPanel();
        return;
      }
    });

    return panel;
  }

  function positionSchedulePanel() {
    const panel = document.getElementById("cqs-schedule-panel");
    const button = document.getElementById("cqs-floating-button");
    if (!panel || panel.hidden || !button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(420, Math.max(300, window.innerWidth - 24));
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
    const bottom = Math.max(12, window.innerHeight - rect.top + 10);
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.bottom = `${bottom}px`;
  }

  function closeSchedulePanel() {
    const panel = document.getElementById("cqs-schedule-panel");
    if (panel) panel.hidden = true;
    state.schedulePanelOpen = false;
  }

  async function refreshScheduledItems(options = {}) {
    const response = await sendExtensionMessage({
      type: "CQS_SCHEDULE_LIST",
      scopeKey: state.scopeKey,
    });
    state.scheduleItems = Array.isArray(response?.items) ? response.items : [];
    state.scheduleItems.sort((a, b) => Number(a?.scheduledAt || 0) - Number(b?.scheduledAt || 0));
    markManagerDirty();
    if (options.render !== false) renderUi();
    return state.scheduleItems;
  }

  async function openSchedulePanel() {
    if (!state.initialized) return;
    if (!(await ensureQueueScopeReadyForInput())) {
      showToast(tr("聊天室正在切換，請稍候再設定定時發送。", "The conversation is switching. Wait a moment before scheduling."));
      return;
    }
    const panel = ensureSchedulePanel();
    const text = getComposerText().trim();
    state.scheduleDraftSource = text;
    const textarea = panel.querySelector("[data-cqs-schedule-text]");
    const timeInput = panel.querySelector("[data-cqs-schedule-time]");
    const zone = panel.querySelector("[data-cqs-schedule-zone]");
    if (textarea) textarea.value = text;
    const minimum = formatLocalDateTimeInput(Date.now() + 60 * 1000);
    if (timeInput) {
      timeInput.min = minimum;
      if (!timeInput.value || new Date(timeInput.value).getTime() < Date.now() + SCHEDULE_MIN_LEAD_MS) {
        timeInput.value = formatLocalDateTimeInput(defaultScheduledEpoch());
      }
    }
    if (zone) zone.textContent = tr("時區：{zone}", "Time zone: {zone}", { zone: getScheduleTimeZoneLabel() });
    panel.hidden = false;
    state.schedulePanelOpen = true;
    positionSchedulePanel();
    await refreshScheduledItems();
    positionSchedulePanel();
    setTimeout(() => timeInput?.focus?.(), 0);
  }

  async function createScheduledSendFromPanel() {
    const panel = ensureSchedulePanel();
    const textarea = panel.querySelector("[data-cqs-schedule-text]");
    const timeInput = panel.querySelector("[data-cqs-schedule-time]");
    const createButton = panel.querySelector("[data-cqs-schedule-action='create']");
    const text = String(textarea?.value || "").trim();
    const scheduledAt = new Date(String(timeInput?.value || "")).getTime();
    if (!text) {
      showToast(tr("定時訊息沒有內容。", "The scheduled message is empty."));
      textarea?.focus?.();
      return;
    }
    if (!Number.isFinite(scheduledAt) || scheduledAt < Date.now() + SCHEDULE_MIN_LEAD_MS) {
      showToast(tr("請選擇晚於目前時間的發送時間。", "Choose a send time in the future."));
      timeInput?.focus?.();
      return;
    }

    if (createButton) createButton.disabled = true;
    const response = await sendExtensionMessage({
      type: "CQS_SCHEDULE_CREATE",
      text,
      scheduledAt,
      scopeKey: state.scopeKey,
      conversationId: getConversationId(),
      url: location.href,
      timeZone: (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) { return ""; }
      })(),
    });
    if (createButton) createButton.disabled = false;

    if (!response?.ok) {
      showToast(scheduleReasonMessage(response?.reason), { duration: 5200 });
      return;
    }

    if (state.scheduleDraftSource) clearComposerIfMatches(state.scheduleDraftSource);
    state.scheduleDraftSource = "";
    if (textarea) textarea.value = "";
    if (timeInput) timeInput.value = formatLocalDateTimeInput(defaultScheduledEpoch());
    showToast(tr("已設定 {time} 單次發送。即使切到其他分頁或最小化視窗，Firefox 仍會由背景排程觸發。", "One-time send scheduled for {time}. Firefox will trigger it in the background even if you switch tabs or minimize the window.", {
      time: formatScheduledDisplay(scheduledAt),
    }), { duration: 6200 });
    await refreshScheduledItems({ render: false });
    closeSchedulePanel();
    state.managerOpen = true;
    markManagerDirty();
    renderUi();
  }

  function clearScheduleLongPressTimer() {
    if (state.scheduleLongPressTimer) clearTimeout(state.scheduleLongPressTimer);
    state.scheduleLongPressTimer = null;
  }

  function onQueueButtonPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearScheduleLongPressTimer();
    state.scheduleLongPressTriggered = false;
    state.scheduleLongPressTimer = setTimeout(() => {
      state.scheduleLongPressTimer = null;
      state.scheduleLongPressTriggered = true;
      void openSchedulePanel();
    }, SCHEDULE_LONG_PRESS_MS);
  }

  function onQueueButtonPointerEnd() {
    clearScheduleLongPressTimer();
  }

  function onQueueButtonClick(event) {
    if (state.scheduleLongPressTriggered) {
      state.scheduleLongPressTriggered = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    addCurrentComposerToQueue();
  }

  function ensureQueueButton() {
    const anchor = getQueueAnchorButton();
    const send = getSendButton(false);
    let btn = document.getElementById("cqs-floating-button");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "cqs-floating-button";
      btn.type = "button";
      btn.dataset.cqsQueueButton = "1";
      btn.title = tr("短按加入佇列；長按開啟單次定時發送。多則佇列訊息可用單獨一行 --- 分隔。", "Click to add to queue; long-press for a one-time scheduled send. Separate queued messages with --- on its own line.");
      btn.innerHTML = `
        <span class="cqs-btn-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 6h9"></path>
            <path d="M8 12h9"></path>
            <path d="M8 18h5"></path>
            <path d="M4 6h.01"></path>
            <path d="M4 12h.01"></path>
            <path d="M4 18h.01"></path>
            <path d="M18 17v4"></path>
            <path d="M16 19h4"></path>
          </svg>
        </span>
        <span class="cqs-btn-label">${tr("加入佇列", "Add to queue")}</span>
        <span class="cqs-btn-badge" aria-hidden="true" hidden></span>
      `;
      btn.addEventListener("pointerdown", onQueueButtonPointerDown);
      btn.addEventListener("pointerup", onQueueButtonPointerEnd);
      btn.addEventListener("pointercancel", onQueueButtonPointerEnd);
      btn.addEventListener("pointerleave", onQueueButtonPointerEnd);
      btn.addEventListener("click", onQueueButtonClick);
      btn.addEventListener("contextmenu", (event) => {
        event.preventDefault();
      });
    }

    if (anchor?.parentElement) {
      const next = anchor.nextSibling;
      if (btn.parentElement !== anchor.parentElement || btn.previousSibling !== anchor) {
        anchor.parentElement.insertBefore(btn, next);
      }
      btn.dataset.cqsPlacement = "left-tools";
    } else if (send?.parentElement) {
      if (btn.parentElement !== send.parentElement || btn.nextSibling !== send) {
        send.parentElement.insertBefore(btn, send);
      }
      btn.dataset.cqsPlacement = "send-fallback";
    } else {
      return;
    }

    updateFloatingButton();
  }

  function updateFloatingButton() {
    const floating = document.getElementById("cqs-floating-button");
    if (!floating) return;
    const queueCount = state.queue.length;
    const scheduledCount = state.scheduleItems.length;
    const count = queueCount + scheduledCount;
    const badge = floating.querySelector(".cqs-btn-badge");
    if (badge) {
      setTextIfChanged(badge, String(count));
      badge.hidden = count === 0;
    }
    floating.classList.toggle("cqs-has-queue", count > 0);
    if (scheduledCount > 0) {
      floating.setAttribute("aria-label", tr(
        "加入佇列，目前一般佇列 {queue} 則、定時 {scheduled} 則",
        "Add to queue, {queue} regular and {scheduled} scheduled",
        { queue: queueCount, scheduled: scheduledCount },
      ));
    } else {
      floating.setAttribute("aria-label", queueCount
        ? tr("加入佇列，目前 {count} 則", "Add to queue, {count} queued", { count: queueCount })
        : tr("加入佇列", "Add to queue"));
    }
  }

  function ensurePreviewBar() {
    let bar = document.getElementById("cqs-preview-bar");
    if (bar) return bar;

    bar = document.createElement("section");
    bar.id = "cqs-preview-bar";
    bar.innerHTML = `
      <div class="cqs-preview-main" data-cqs-action="open-manager" title="${tr("點擊管理完整佇列", "Click to manage the full queue")}">
        <span class="cqs-count" data-cqs-count>${tr("佇列 0", "Queue 0")}</span>
        <span class="cqs-preview-text" data-cqs-preview-text>${tr("目前沒有佇列訊息", "The queue is empty")}</span>
      </div>
      <div class="cqs-preview-actions" aria-label="${tr("佇列操作", "Queue actions")}">
        <button type="button" data-cqs-action="stop" aria-label="${tr("停止佇列發送", "Stop queue sending")}" hidden>${tr("停止", "Stop")}</button>
        <button type="button" data-cqs-action="open-manager">${tr("管理", "Manage")}</button>
      </div>
    `;
    bar.addEventListener("click", onCqsClick);
    return bar;
  }

  function placePreviewBar() {
    const root = getComposerRoot();
    const bar = ensurePreviewBar();
    if (!root?.parentElement) return;

    if (bar.parentElement !== root.parentElement || bar.nextSibling !== root) {
      root.parentElement.insertBefore(bar, root);
    }
  }

  function positionManager() {
    const manager = document.getElementById("cqs-manager");
    const root = getComposerRoot();
    if (!manager || !root) return;
    const rect = root.getBoundingClientRect();
    const bottom = Math.max(12, Math.min(window.innerHeight - 96, window.innerHeight - rect.top + 12));
    manager.style.bottom = `${Math.round(bottom)}px`;
  }

  function ensureManager() {
    let manager = document.getElementById("cqs-manager");
    if (manager) return manager;

    manager = document.createElement("div");
    manager.id = "cqs-manager";
    manager.innerHTML = `
      <div class="cqs-manager-card" role="dialog" aria-modal="false" aria-label="${tr("佇列內容管理", "Queue manager")}">
        <div class="cqs-manager-head">
          <div>
            <div class="cqs-manager-title-row">
              <div class="cqs-manager-title">${tr("佇列內容", "Queue contents")}</div>
              <div class="cqs-manager-badge" data-cqs-manager-count>0/10</div>
            </div>
            <div class="cqs-manager-subtitle">${tr("一般佇列與單次定時發送都在這裡管理；定時項目會等到指定時間才送出。", "Manage regular queued messages and one-time scheduled sends here. Scheduled items wait until their specified time.")}</div>
          </div>
          <button type="button" class="cqs-manager-close" data-cqs-action="close-manager" aria-label="${tr("關閉", "Close")}">×</button>
        </div>
        <div class="cqs-manager-list" data-cqs-list></div>
        <div class="cqs-manager-actions">
          <button type="button" data-cqs-action="add-current">${tr("加入目前輸入並送出", "Queue current input")}</button>
          <button type="button" data-cqs-action="continue" hidden>${tr("繼續", "Continue")}</button>
          <button type="button" data-cqs-action="stop" hidden>${tr("停止", "Stop")}</button>
          <button type="button" data-cqs-action="clear">${tr("清空", "Clear")}</button>
        </div>
      </div>
    `;
    const managerIconUrl = getExtensionUrl("icons/icon-32.png");
    const managerTitleRow = manager.querySelector(".cqs-manager-title-row");
    if (managerIconUrl && managerTitleRow) {
      const managerIcon = document.createElement("img");
      managerIcon.className = "cqs-manager-icon";
      managerIcon.src = managerIconUrl;
      managerIcon.alt = "";
      managerTitleRow.prepend(managerIcon);
    }

    manager.addEventListener("click", onCqsClick);
    manager.addEventListener("input", onManagerInput);
    document.documentElement.appendChild(manager);
    return manager;
  }

  function renderManagerList() {
    const manager = ensureManager();
    const list = manager.querySelector("[data-cqs-list]");
    if (!list) return;

    list.textContent = "";

    if (!state.queue.length && !state.scheduleItems.length) {
      const empty = document.createElement("div");
      empty.className = "cqs-empty-note";
      empty.textContent = tr("還沒有佇列或定時訊息。短按加入一般佇列；長按「加入佇列」可設定單次定時發送。", "There are no queued or scheduled messages yet. Click to queue normally, or long-press Add to queue for a one-time scheduled send.");
      list.appendChild(empty);
      return;
    }

    const makeActionButton = (label, action, disabled = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.cqsAction = action;
      button.textContent = label;
      button.disabled = disabled;
      return button;
    };

    state.queue.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "cqs-item-card";
      if (item.kind === "handoff") card.classList.add("cqs-item-handoff");
      card.dataset.cqsItemId = item.id;

      const indexEl = document.createElement("div");
      indexEl.className = "cqs-item-index";
      indexEl.textContent = String(index + 1);

      const body = document.createElement("div");
      body.className = "cqs-item-body";

      const textarea = document.createElement("textarea");
      textarea.className = "cqs-item-textarea";
      textarea.dataset.cqsItemText = "1";
      textarea.value = item.text;
      textarea.placeholder = tr("輸入這一則要發送的訊息", "Enter the message to send");
      textarea.setAttribute("aria-label", tr("第 {index} 則訊息", "Message {index}", { index: index + 1 }));
      textarea.disabled = state.running && index === 0;

      const actions = document.createElement("div");
      actions.className = "cqs-item-actions";
      actions.appendChild(makeActionButton(tr("上移", "Move up"), "move-up", index === 0 || state.running));
      actions.appendChild(makeActionButton(tr("下移", "Move down"), "move-down", index === state.queue.length - 1 || state.running));
      actions.appendChild(makeActionButton(tr("複製", "Copy"), "copy-item"));
      actions.appendChild(makeActionButton(tr("刪除", "Delete"), "delete-item", state.running && index === 0));

      body.appendChild(textarea);
      body.appendChild(actions);
      card.appendChild(indexEl);
      card.appendChild(body);
      list.appendChild(card);
    });

    state.scheduleItems.forEach((item) => {
      const card = document.createElement("article");
      card.className = "cqs-item-card cqs-item-scheduled";
      card.dataset.cqsScheduleId = String(item.id || "");

      const indexEl = document.createElement("div");
      indexEl.className = "cqs-item-index cqs-item-schedule-index";
      indexEl.textContent = "◷";
      indexEl.setAttribute("aria-hidden", "true");

      const body = document.createElement("div");
      body.className = "cqs-item-body";

      const meta = document.createElement("div");
      meta.className = "cqs-item-schedule-meta";
      const badge = document.createElement("span");
      badge.className = "cqs-item-schedule-badge";
      badge.textContent = item.status === "firing" ? tr("發送中", "Sending") : tr("定時", "Scheduled");
      const time = document.createElement("strong");
      time.textContent = formatScheduledDisplay(Number(item.scheduledAt));
      meta.append(badge, time);

      const textarea = document.createElement("textarea");
      textarea.className = "cqs-item-textarea cqs-item-scheduled-text";
      textarea.dataset.cqsScheduledText = "1";
      textarea.value = String(item.text || "");
      textarea.readOnly = true;
      textarea.setAttribute("aria-label", tr("定時訊息，預定 {time}", "Scheduled message for {time}", {
        time: formatScheduledDisplay(Number(item.scheduledAt)),
      }));

      const actions = document.createElement("div");
      actions.className = "cqs-item-actions";
      actions.appendChild(makeActionButton(tr("複製", "Copy"), "copy-scheduled-item"));
      actions.appendChild(makeActionButton(
        item.status === "firing" ? tr("發送中", "Sending") : tr("取消定時", "Cancel schedule"),
        "cancel-scheduled-item",
        item.status === "firing",
      ));

      body.append(meta, textarea, actions);
      card.append(indexEl, body);
      list.appendChild(card);
    });
  }

  function openManager(focusFirst = false) {
    state.managerOpen = true;
    markManagerDirty();
    renderUi();
    void refreshScheduledItems();
    if (focusFirst) {
      setTimeout(() => {
        const first = document.querySelector("#cqs-manager [data-cqs-item-text]");
        first?.focus();
        first?.setSelectionRange(0, 0);
      }, 50);
    }
  }

  function closeManager() {
    state.managerOpen = false;
    renderUi();
  }

  function getQueueStatusText(status) {
    if (status === "waiting") return tr("等待可送出", "Waiting to send");
    if (status === "awaiting-response" || status === "generating") return tr("等待回覆完成", "Waiting for response");
    if (status === "sending") return tr("正在送出", "Sending");
    return tr("正在處理", "Processing");
  }

  function renderUi() {
    const bar = ensurePreviewBar();
    const manager = ensureManager();
    if (state.schedulePanelOpen) positionSchedulePanel();

    const count = bar.querySelector("[data-cqs-count]");
    const preview = bar.querySelector("[data-cqs-preview-text]");
    const stopBtns = document.querySelectorAll("[data-cqs-action='stop']");
    const clearBtn = manager.querySelector("[data-cqs-action='clear']");
    const addCurrentBtn = manager.querySelector("[data-cqs-action='add-current']");
    const continueBtn = manager.querySelector("[data-cqs-action='continue']");
    const managerCount = manager.querySelector("[data-cqs-manager-count]");

    const hasQueue = state.queue.length > 0;
    const hasScheduled = state.scheduleItems.length > 0;
    const hasPending = hasQueue || hasScheduled;
    bar.classList.toggle("cqs-empty", !hasPending);
    bar.classList.toggle("cqs-running", state.running);
    bar.hidden = !hasPending;

    const runTotal = getRunTotal();
    const runCurrent = getRunCurrentIndex();
    setTextIfChanged(count, state.running
      ? `${runCurrent}/${runTotal}`
      : hasQueue && hasScheduled
        ? tr("佇列 {queue} · 定時 {scheduled}", "Queue {queue} · Scheduled {scheduled}", { queue: state.queue.length, scheduled: state.scheduleItems.length })
        : hasScheduled
          ? tr("定時 {count}", "Scheduled {count}", { count: state.scheduleItems.length })
          : tr("佇列 {count}", "Queue {count}", { count: state.queue.length }));

    if (state.running) {
      const statusText = getQueueStatusText(state.queue[0]?.status);
      setTextIfChanged(preview, `${statusText} ${runCurrent}/${runTotal}：${shorten(state.queue[0]?.text || "")}`);
    } else if (hasQueue) {
      if (state.pausedReason === "error") {
        setTextIfChanged(preview, tr("發送暫停，請重試：{preview}", "Sending paused. Retry: {preview}", { preview: shorten(state.queue[0]?.text || "") }));
      } else if (state.pausedReason === "stopped") {
        setTextIfChanged(preview, tr("已停止後續發送：{preview}", "Future sending stopped: {preview}", { preview: shorten(state.queue[0]?.text || "") }));
      } else {
        setTextIfChanged(preview, state.autoRunArmed
          ? tr("等待自動接續：{preview}", "Waiting to continue automatically: {preview}", { preview: shorten(state.queue[0]?.text || "") })
          : tr("已加入，會自動接續：{preview}", "Queued and will continue automatically: {preview}", { preview: shorten(state.queue[0]?.text || "") }));
      }
    } else if (hasScheduled) {
      const nextScheduled = state.scheduleItems[0];
      setTextIfChanged(preview, tr(
        "下一則定時 {time}：{preview}",
        "Next scheduled {time}: {preview}",
        {
          time: formatScheduledDisplay(Number(nextScheduled?.scheduledAt || 0)),
          preview: shorten(nextScheduled?.text || ""),
        },
      ));
    } else {
      setTextIfChanged(preview, state.lastError || tr("目前沒有佇列訊息", "The queue is empty"));
    }

    stopBtns.forEach((btn) => {
      btn.disabled = !state.running;
      btn.hidden = !state.running;
    });

    if (clearBtn) {
      clearBtn.disabled = !hasQueue;
      setTextIfChanged(clearBtn, hasScheduled ? tr("清空一般佇列", "Clear regular queue") : tr("清空", "Clear"));
    }
    if (addCurrentBtn) addCurrentBtn.disabled = state.queue.length >= MAX_QUEUE;
    if (continueBtn) {
      continueBtn.hidden = state.running || !hasQueue || !state.pausedReason;
      continueBtn.disabled = state.running || !hasQueue;
      setTextIfChanged(continueBtn, state.pausedReason === "error" ? tr("重試", "Retry") : tr("繼續", "Continue"));
    }
    if (managerCount) {
      setTextIfChanged(managerCount, state.running
        ? tr(
          "{current}/{total} · 佇列 {count}/{max} · 定時 {scheduled}",
          "{current}/{total} · Queue {count}/{max} · Scheduled {scheduled}",
          { current: getRunCurrentIndex(), total: getRunTotal(), count: state.queue.length, max: MAX_QUEUE, scheduled: state.scheduleItems.length },
        )
        : state.scheduleItems.length
          ? tr("佇列 {count}/{max} · 定時 {scheduled}", "Queue {count}/{max} · Scheduled {scheduled}", { count: state.queue.length, max: MAX_QUEUE, scheduled: state.scheduleItems.length })
          : `${state.queue.length}/${MAX_QUEUE}`);
    }

    manager.hidden = !state.managerOpen;
    if (state.managerOpen && state.managerDirty) {
      renderManagerList();
      state.managerDirty = false;
    }

    updateFloatingButton();
    positionManager();
  }

  function getItemIdFromAction(actionEl) {
    return actionEl.closest("[data-cqs-item-id]")?.dataset.cqsItemId || "";
  }

  function onManagerInput(event) {
    const textarea = event.target.closest("[data-cqs-item-text]");
    if (!textarea) return;
    const id = textarea.closest("[data-cqs-item-id]")?.dataset.cqsItemId;
    const item = state.queue.find((candidate) => candidate.id === id);
    if (!item) return;
    item.text = textarea.value;
    storageSet(state);
    updatePreviewFromState();
  }

  function updatePreviewFromState() {
    const bar = document.getElementById("cqs-preview-bar");
    const preview = bar?.querySelector("[data-cqs-preview-text]");
    if (!preview) return;
    if (state.running) {
      setTextIfChanged(preview, `${getQueueStatusText(state.queue[0]?.status)} ${getRunCurrentIndex()}/${getRunTotal()}：${shorten(state.queue[0]?.text || "")}`);
    } else if (state.queue.length) {
      const prefix = state.pausedReason === "error" ? tr("發送暫停，請重試", "Sending paused. Retry") : state.pausedReason === "stopped" ? tr("已停止後續發送", "Future sending stopped") : tr("下一則", "Next");
      setTextIfChanged(preview, `${prefix}：${shorten(state.queue[0]?.text || "")}`);
    }
  }

  async function onCqsClick(event) {
    const actionEl = event.target.closest("[data-cqs-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.cqsAction;

    if (action === "open-manager") {
      openManager(false);
      return;
    }

    if (action === "close-manager") {
      closeManager();
      return;
    }

    if (action === "add-current") {
      addCurrentComposerToQueue();
      return;
    }

    if (action === "copy-scheduled-item") {
      const id = String(actionEl.closest("[data-cqs-schedule-id]")?.dataset.cqsScheduleId || "");
      const item = state.scheduleItems.find((candidate) => String(candidate.id || "") === id);
      if (!item) return;
      try {
        await navigator.clipboard.writeText(String(item.text || ""));
        showToast(tr("已複製這則定時訊息。", "The scheduled message was copied."));
      } catch (_) {
        showToast(tr("瀏覽器未允許複製，請手動選取文字。", "The browser did not allow copying. Select the text manually."));
      }
      return;
    }

    if (action === "cancel-scheduled-item") {
      const id = String(actionEl.closest("[data-cqs-schedule-id]")?.dataset.cqsScheduleId || "");
      if (!id) return;
      actionEl.disabled = true;
      const response = await sendExtensionMessage({
        type: "CQS_SCHEDULE_CANCEL",
        id,
        scopeKey: state.scopeKey,
      });
      if (!response?.ok) {
        showToast(scheduleReasonMessage(response?.reason));
      } else {
        showToast(tr("已取消這則定時發送。", "Scheduled send canceled."));
      }
      await refreshScheduledItems();
      return;
    }

    if (action === "move-up" || action === "move-down") {
      const id = getItemIdFromAction(actionEl);
      const index = state.queue.findIndex((item) => item.id === id);
      if (index < 0 || state.running) return;
      const targetIndex = action === "move-up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= state.queue.length) return;
      const [item] = state.queue.splice(index, 1);
      state.queue.splice(targetIndex, 0, item);
      storageSet(state);
      markManagerDirty();
      renderUi();
      return;
    }

    if (action === "copy-item") {
      const id = getItemIdFromAction(actionEl);
      const item = state.queue.find((candidate) => candidate.id === id);
      if (!item) return;
      try {
        await navigator.clipboard.writeText(item.text);
        showToast(tr("已複製這一則訊息。", "This message was copied."));
      } catch (_) {
        showToast(tr("瀏覽器未允許複製，請手動選取文字。", "The browser did not allow copying. Select the text manually."));
      }
      return;
    }

    if (action === "delete-item") {
      const id = getItemIdFromAction(actionEl);
      const index = state.queue.findIndex((item) => item.id === id);
      if (index < 0) return;
      if (state.running && index === 0) return;
      state.queue.splice(index, 1);
      syncRunTotal();
      storageSet(state);
      markManagerDirty();
      renderUi();
      showToast(tr("已刪除這一則。", "This message was deleted."));
      return;
    }

    if (action === "continue") {
      state.pausedReason = "";
      state.lastError = "";
      storageSet(state);
      requestAutoRun();
      return;
    }

    if (action === "stop") {
      state.abort = true;
      showToast(tr("已停止後續發送；目前正在生成的回覆不會被中斷。", "Future queue sending was stopped. The response currently being generated will not be interrupted."));
      renderUi();
      return;
    }

    if (action === "undo-add") {
      undoLastAdd();
      return;
    }

    if (action === "clear") {
      if (state.running && !confirm(tr("正在發送中，確定要清空佇列並停止後續發送嗎？", "The queue is running. Clear it and stop future messages?"))) return;
      state.queue = [];
      syncRunTotal();
      state.abort = state.running;
      state.lastError = tr("已清空佇列。", "The queue was cleared.");
      state.lastUndo = null;
      state.autoRunArmed = false;
      state.pausedReason = "";
      storageSet(state);
      markManagerDirty();
      showToast(tr("已清空佇列。", "The queue was cleared."));
      renderUi();
    }
  }

  function requestAutoRun() {
    if (!state.queue.length || state.running || state.scheduledSendActive || state.scopeSwitching) return;
    state.pausedReason = "";
    state.autoRunArmed = true;
    renderUi();
    setTimeout(() => {
      if (state.autoRunArmed && !state.running && state.queue.length && !state.scopeSwitching) {
        const promise = startQueue();
        state.runPromise = promise;
        Promise.resolve(promise).finally(() => {
          if (state.runPromise === promise) state.runPromise = null;
        });
      }
    }, 120);
  }

  function queueScopeReadyForInput() {
    return state.initialized
      && !state.scopeSwitching
      && Boolean(state.scopeKey)
      && getScopeKeyForLocation() === state.scopeKey;
  }

  async function ensureQueueScopeReadyForInput(timeoutMs = 5000) {
    if (queueScopeReadyForInput()) return true;
    await switchQueueScopeIfNeeded();
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (queueScopeReadyForInput()) return true;
      await wait(80);
      await switchQueueScopeIfNeeded();
    }
    return false;
  }

  function addCurrentComposerToQueue() {
    if (!queueScopeReadyForInput()) {
      showToast(tr("聊天室正在切換，請稍候再加入佇列。", "The conversation is switching. Wait a moment before adding to the queue."));
      void switchQueueScopeIfNeeded();
      return;
    }
    const raw = getComposerText().trim();
    const messages = splitMessages(raw);
    if (!messages.length) {
      showToast(tr("輸入框沒有內容，無法加入佇列。", "The composer is empty, so nothing can be queued."));
      return;
    }
    const added = addMessages(messages, raw);
    if (added.length > 0) {
      clearComposerText();
      const suffix = messages.length > added.length ? tr("，其餘超過上限未加入", "; remaining messages exceeded the limit") : "";
      showToast(tr("已加入 {count} 則{suffix}，會自動接續送出。", "Added {count} message(s){suffix}. They will send automatically.", { count: added.length, suffix }), {
        label: tr("復原", "Undo"),
        action: "undo-add",
        duration: 5000,
      });
      requestAutoRun();
    }
  }

  function addMessages(messages, rawTextForUndo = "", options = {}) {
    state.lastError = "";
    const clean = messages.map((text) => String(text || "").trim()).filter(Boolean);
    if (clean.length === 0) {
      state.lastError = tr("沒有可加入的內容。", "There is no content to add.");
      showToast(state.lastError);
      renderUi();
      return [];
    }

    const room = MAX_QUEUE - state.queue.length;
    if (room <= 0) {
      state.lastError = tr("佇列已滿，最多 {max} 則。", "The queue is full. Maximum: {max} messages.", { max: MAX_QUEUE });
      showToast(state.lastError);
      renderUi();
      return [];
    }

    const normalizedKind = options.kind === "handoff" || options.kind === "saved-prompt" ? options.kind : "";
    const accepted = clean.slice(0, room).map((text) => ({
      id: uid(),
      text,
      kind: normalizedKind,
      promptId: normalizedKind === "saved-prompt" ? String(options.promptId || "") : "",
      status: "pending",
    }));
    state.queue.push(...accepted);
    if (!state.running) state.pausedReason = "";
    if (state.running && accepted.length > 0) syncRunTotal();
    state.lastUndo = {
      ids: accepted.map((item) => item.id),
      rawText: rawTextForUndo || accepted.map((item) => item.text).join("\n---\n"),
      createdAt: Date.now(),
    };
    if (clean.length > room) state.lastError = tr("只加入前 {room} 則，最多 {max} 則。", "Only the first {room} messages were added. Maximum: {max}.", { room, max: MAX_QUEUE });
    storageSet(state);
    markManagerDirty();
    renderUi();
    return accepted;
  }

  function undoLastAdd() {
    const undo = state.lastUndo;
    if (!undo?.ids?.length) {
      showToast(tr("沒有可復原的加入動作。", "There is no queue action to undo."));
      return;
    }

    const ids = new Set(undo.ids);
    if (state.running && state.queue[0] && ids.has(state.queue[0].id)) {
      showToast(tr("目前這則已開始處理，無法復原。可先停止後續發送，再管理剩餘佇列。", "This message has already started and cannot be undone. Stop future sending, then manage the remaining queue."), { duration: 4200 });
      return;
    }
    const before = state.queue.length;
    state.queue = state.queue.filter((item) => !ids.has(item.id));
    const removed = before - state.queue.length;
    syncRunTotal();
    state.lastUndo = null;
    if (!state.running && state.queue.length === 0) state.autoRunArmed = false;

    try {
      const currentText = getComposerText().trim();
      if (!currentText) {
        setComposerText(undo.rawText);
        showToast(removed ? tr("已復原，文字已放回輸入框。", "Undone. The text was restored to the composer.") : tr("佇列已無該內容，文字已放回輸入框。", "The item was no longer in the queue, but its text was restored to the composer."));
      } else {
        showToast(removed ? tr("已從佇列移除；輸入框已有文字，未覆蓋。", "Removed from the queue. Existing composer text was not overwritten.") : tr("佇列已無該內容。", "The item is no longer in the queue."));
      }
    } catch (_) {
      showToast(removed ? tr("已從佇列移除。", "Removed from the queue.") : tr("佇列已無該內容。", "The item is no longer in the queue."));
    }

    storageSet(state);
    markManagerDirty();
    renderUi();
  }

  function showToast(message, options = {}) {
    let toast = document.getElementById("cqs-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cqs-toast";
      toast.addEventListener("click", onCqsClick);
      document.documentElement.appendChild(toast);
    }

    toast.textContent = "";
    const messageEl = document.createElement("span");
    messageEl.className = "cqs-toast-message";
    messageEl.textContent = String(message);
    toast.appendChild(messageEl);

    if (options.action) {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.dataset.cqsAction = String(options.action);
      actionButton.textContent = String(options.label || tr("操作", "Action"));
      toast.appendChild(actionButton);
    }

    toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, options.duration || 2400);
  }

  function clearComposerIfMatches(text) {
    if (normalizeText(getComposerText()) === normalizeText(text)) clearComposerText();
  }

  class QueueAbortError extends Error {
    constructor(message = tr("已停止佇列發送。", "Queue sending was stopped.")) {
      super(message);
      this.name = "QueueAbortError";
    }
  }

  function throwIfAborted() {
    if (state.activeRunScope && getScopeKeyForLocation() !== state.activeRunScope) {
      state.abort = true;
      throw new QueueAbortError(tr("聊天室已切換，佇列已留在原聊天室。", "The conversation changed. The queue remains in the original conversation."));
    }
    if (state.abort) throw new QueueAbortError();
  }

  async function waitFor(fn, timeoutMs, errorMessage, stepMs = 250, ignoreAbort = false) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!ignoreAbort) throwIfAborted();
      const result = fn();
      if (result) return result;
      await wait(stepMs);
    }
    throw new Error(errorMessage);
  }

  async function waitUntilReadyBeforeSend(timeoutMs = 30 * 60 * 1000) {
    const start = Date.now();
    let stableTicks = 0;
    let lastSignature = getLastAssistantSignature();
    let lastAssistantChangeAt = Date.now();
    while (Date.now() - start < timeoutMs) {
      throwIfAborted();
      const now = Date.now();
      const signature = getLastAssistantSignature();
      if (signature !== lastSignature) {
        lastSignature = signature;
        lastAssistantChangeAt = now;
        stableTicks = 0;
      }
      const latestRole = getLatestConversationRole();
      const assistantSettled = latestRole !== "assistant"
        || Boolean(getAssistantCompletionControl())
        || now - lastAssistantChangeAt >= 12000;
      const conversationSettled = latestRole !== "user" && assistantSettled;
      if (isComposerReadyForQueue() && conversationSettled) {
        stableTicks += 1;
        if (stableTicks >= 3) return;
      } else {
        stableTicks = 0;
      }
      renderUi();
      await wait(650);
    }
    throw new Error(tr("等待 ChatGPT 可送出狀態逾時。你可以停止佇列後重新整理頁面再試。", "Timed out waiting for ChatGPT to become ready. Stop the queue, refresh the page, and try again."));
  }

  function makeSubmissionSnapshot() {
    const counts = getConversationCounts();
    return {
      userCountBefore: counts.user,
      assistantCountBefore: counts.assistant,
      assistantSignatureBefore: getLastAssistantSignature(),
      submittedAt: Date.now(),
      path: location.pathname,
    };
  }

  function isSubmissionConfirmed(snapshot) {
    const counts = getConversationCounts();
    const currentText = normalizeText(getComposerText());
    const inputCleared = !currentText;
    const userTurnAdded = counts.user > snapshot.userCountBefore;
    return inputCleared || userTurnAdded || hasBusyEvidence();
  }

  function dispatchEnterFallback(input) {
    const options = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    input.dispatchEvent(new KeyboardEvent("keydown", options));
    input.dispatchEvent(new KeyboardEvent("keypress", options));
    input.dispatchEvent(new KeyboardEvent("keyup", options));
  }

  async function waitForSubmissionConfirmed(snapshot, expectedText, input) {
    const firstTryStart = Date.now();
    while (Date.now() - firstTryStart < 5000) {
      if (isSubmissionConfirmed(snapshot)) return;
      await wait(250);
    }

    if (normalizeText(getComposerText()) === normalizeText(expectedText) && !hasBusyEvidence()) {
      dispatchEnterFallback(input);
    }

    const fallbackStart = Date.now();
    while (Date.now() - fallbackStart < 7000) {
      if (isSubmissionConfirmed(snapshot)) return;
      await wait(250);
    }

    throw new Error(tr("訊息沒有成功送出，已保留在佇列中。請確認 ChatGPT 送出按鈕可用後再重試。", "The message was not sent and remains in the queue. Make sure ChatGPT's send button is available, then retry."));
  }

  async function waitForResponseFinished(submission, timeoutMs = 30 * 60 * 1000) {
    const start = Date.now();
    let stableIdleTicks = 0;
    let activitySeen = hasBusyEvidence();
    let assistantProgressSeen = false;
    let lastSignature = getLastAssistantSignature();
    let lastAssistantChangeAt = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (state.activeRunScope && getScopeKeyForLocation() !== state.activeRunScope) state.abort = true;
      if (state.abort) return false;

      const now = Date.now();
      const counts = getConversationCounts();
      const signature = getLastAssistantSignature();
      const signatureChanged = Boolean(signature && signature !== lastSignature);
      const assistantAdded = counts.assistant > (submission?.assistantCountBefore || 0);
      const differsFromBefore = Boolean(signature && signature !== String(submission?.assistantSignatureBefore || ""));
      if (assistantAdded || (signatureChanged && differsFromBefore)) assistantProgressSeen = true;
      if (signatureChanged) {
        activitySeen = true;
        lastSignature = signature;
        lastAssistantChangeAt = now;
        stableIdleTicks = 0;
      }

      if (hasBusyEvidence()) {
        activitySeen = true;
        stableIdleTicks = 0;
      } else {
        const completionControl = getAssistantCompletionControl();
        const stableFallback = assistantProgressSeen && now - lastAssistantChangeAt >= 12000;
        if (activitySeen && assistantProgressSeen && isComposerReadyForQueue() && (completionControl || stableFallback)) {
          stableIdleTicks += 1;
          if (stableIdleTicks >= 3) {
            notifyResponseCompleted();
            return true;
          }
        } else {
          stableIdleTicks = 0;
        }
      }

      renderUi();
      await wait(650);
    }

    throw new Error(tr("等待 ChatGPT 回覆完成逾時。你可以手動停止後再重試。", "Timed out waiting for the ChatGPT response to finish. Stop manually and retry."));
  }

  async function sendScheduledText(payload) {
    const text = String(payload?.text || "").trim();
    const scopeKey = String(payload?.scopeKey || "").trim();
    if (!text || !scopeKey) {
      return { ok: false, message: tr("定時訊息內容或聊天室資訊不完整。", "The scheduled message or conversation information is incomplete.") };
    }

    const initialized = await waitFor(() => state.initialized, 10000, tr("訊息佇列尚未完成載入。", "The queue extension has not finished loading."), 100).catch(() => null);
    if (!initialized) return { ok: false, message: tr("ChatGPT 分頁尚未完成載入。", "The ChatGPT tab has not finished loading.") };

    await switchQueueScopeIfNeeded();
    if (getScopeKeyForLocation() !== scopeKey || state.scopeKey !== scopeKey) {
      return { ok: false, message: tr("目標分頁已切換到其他聊天室，為避免誤送已取消本次發送。", "The target tab switched to another conversation, so the scheduled send was canceled to prevent a mis-send.") };
    }
    if (state.running || state.scheduledSendActive) {
      return { ok: false, message: tr("目標聊天室目前正在執行其他佇列或定時發送。", "The target conversation is already running another queue or scheduled send.") };
    }

    state.scheduledSendActive = true;
    let leaseAcquired = false;
    try {
      await waitFor(() => getComposerInput(), 10000, tr("找不到 ChatGPT 輸入框。", "The ChatGPT composer could not be found."), 200);
      await waitUntilReadyBeforeSend(15000);

      if (state.running || getScopeKeyForLocation() !== scopeKey) {
        return { ok: false, message: tr("聊天室狀態在發送前發生變化，為避免誤送已取消。", "The conversation state changed before sending, so the scheduled send was canceled.") };
      }

      const existingDraft = normalizeText(getComposerText());
      if (existingDraft) {
        return { ok: false, message: tr("輸入框已有未送出的文字，為避免覆蓋，本次定時發送失敗。", "There is already unsent text in the composer. The scheduled send failed to avoid overwriting it.") };
      }

      const lease = await acquireQueueLease(scopeKey);
      if (!lease.ok) {
        return { ok: false, message: tr("同一聊天室正在另一個分頁執行佇列，為避免重複或衝突，本次定時發送失敗。", "The same conversation is running a queue in another tab. The scheduled send failed to avoid duplicates or conflicts.") };
      }
      leaseAcquired = true;

      const input = setComposerText(text);
      await wait(450);
      if (getScopeKeyForLocation() !== scopeKey || state.running) {
        clearComposerIfMatches(text);
        return { ok: false, message: tr("發送前聊天室或佇列狀態已改變，本次定時發送取消。", "The conversation or queue state changed before submission, so the scheduled send was canceled.") };
      }

      const snapshot = makeSubmissionSnapshot();
      const send = await waitFor(
        () => getSendButton(true),
        10000,
        tr("送出按鈕沒有變成可點擊狀態。", "The send button did not become available."),
        250,
      );
      send.click();
      await waitForSubmissionConfirmed(snapshot, text, input);
      return { ok: true, submittedAt: Date.now() };
    } catch (error) {
      clearComposerIfMatches(text);
      return {
        ok: false,
        message: error?.message || tr("定時訊息沒有成功送出。", "The scheduled message was not sent."),
      };
    } finally {
      if (leaseAcquired) await releaseQueueLease(scopeKey);
      state.scheduledSendActive = false;
      if (state.queue.length && !state.pausedReason && !state.running) setTimeout(requestAutoRun, 250);
      renderUi();
    }
  }

  async function sendOne(item) {
    if (item.status === "awaiting-response" && item.submission) {
      item.status = "awaiting-response";
      storageSet(state);
      renderUi();
      const completed = await waitForResponseFinished(item.submission);
      return { submitted: true, completed };
    }

    item.status = "waiting";
    item.submission = null;
    storageSet(state);
    renderUi();

    await waitFor(() => getComposerInput(), 15000, tr("找不到 ChatGPT 輸入框。請確認目前在 ChatGPT 對話頁。", "The ChatGPT composer could not be found. Make sure this is a ChatGPT conversation page."), 250);
    await waitUntilReadyBeforeSend();
    throwIfAborted();

    const existingDraft = normalizeText(getComposerText());
    if (existingDraft) {
      throw new Error(tr("偵測到 ChatGPT 輸入框已有未加入的文字。為避免覆蓋，佇列已暫停；請先將該文字加入佇列或清空輸入框後重試。", "Unqueued text is already in the ChatGPT composer. The queue was paused to avoid overwriting it. Queue or clear that text, then retry."));
    }

    item.status = "sending";
    storageSet(state);
    renderUi();

    const input = setComposerText(item.text);
    await wait(450);
    throwIfAborted();

    const snapshot = makeSubmissionSnapshot();
    const send = await waitFor(() => getSendButton(true), 15000, tr("送出按鈕沒有變成可點擊。請確認帳號沒有達到使用限制，或頁面不是正在產生回覆。", "The send button did not become available. Check account limits and make sure ChatGPT is not still generating a response."), 250);
    send.click();

    await waitForSubmissionConfirmed(snapshot, item.text, input);
    item.status = "awaiting-response";
    item.submission = snapshot;
    storageSet(state);
    renderUi();

    const completed = await waitForResponseFinished(snapshot);
    return { submitted: true, completed };
  }

  function removeQueueItemById(id) {
    const index = state.queue.findIndex((item) => item.id === id);
    if (index >= 0) state.queue.splice(index, 1);
  }

  async function startQueue() {
    if (state.running || state.scheduledSendActive || state.queue.length === 0 || state.scopeSwitching) return;

    const runScope = state.scopeKey;
    if (!runScope || getScopeKeyForLocation() !== runScope) {
      await switchQueueScopeIfNeeded();
      return;
    }

    const lease = await acquireQueueLease(runScope);
    if (!lease.ok) {
      showToast(lease.reason === "background-unavailable"
        ? tr("暫時無法取得多分頁執行鎖，為避免重複發送，佇列會稍後重試。", "The multi-tab queue lock is temporarily unavailable. The queue will retry later to avoid duplicate sending.")
        : tr("此聊天室的佇列正在另一個分頁執行，這個分頁不會重複發送。", "This conversation queue is running in another tab. This tab will not send duplicates."), { duration: 4200 });
      setTimeout(() => {
        if (!state.running && state.queue.length && state.scopeKey === runScope) requestAutoRun();
      }, lease.retryAfterMs);
      return;
    }

    if (state.scopeKey !== runScope || getScopeKeyForLocation() !== runScope) {
      await releaseQueueLease(runScope);
      return;
    }

    await Promise.resolve(state.pendingPersist).catch(() => undefined);
    const latestSaved = await storageGet(runScope);
    if (latestSaved && Array.isArray(latestSaved.queue)) applySavedQueueState(latestSaved);
    if (!state.queue.length) {
      await releaseQueueLease(runScope);
      markManagerDirty();
      renderUi();
      return;
    }

    state.activeRunScope = runScope;
    state.queue = state.queue
      .map((item) => ({
        ...item,
        text: String(item.text || "").trim(),
        status: item.status === "awaiting-response" && item.submission ? "awaiting-response" : "pending",
      }))
      .filter((item) => item.text);

    if (!state.queue.length) {
      showToast(tr("佇列裡沒有有效文字。", "The queue contains no valid text."));
      markManagerDirty();
      const emptyRunScope = state.activeRunScope || runScope;
      storageSet(state, emptyRunScope);
      await releaseQueueLease(emptyRunScope);
      if (state.activeRunScope === emptyRunScope) state.activeRunScope = "";
      renderUi();
      return;
    }

    state.running = true;
    state.autoRunArmed = false;
    state.abort = false;
    state.pausedReason = "";
    state.lastError = "";
    state.runDone = 0;
    state.runTotal = state.queue.length;
    closeManager();
    storageSet(state);
    renderUi();

    let failed = false;
    let stopped = false;

    try {
      while (state.queue.length > 0 && !state.abort) {
        const current = state.queue[0];
        const outcome = await sendOne(current);

        if (outcome.submitted) {
          if (outcome.completed) {
            document.dispatchEvent(new CustomEvent("cqs:queue-item-completed", {
              detail: {
                id: current.id,
                kind: current.kind || "",
                promptId: current.promptId || "",
                text: current.text,
              },
            }));
          }
          removeQueueItemById(current.id);
          state.runDone += 1;
          syncRunTotal();
          storageSet(state);
          markManagerDirty();
          renderUi();
        }

        if (!outcome.completed || state.abort) {
          stopped = true;
          break;
        }
        await wait(450);
      }

      stopped = stopped || state.abort;
      if (!stopped && state.queue.length === 0) {
        state.pausedReason = "";
        state.lastError = tr("佇列已全部送出。", "All queued messages were sent.");
        showToast(state.lastError);
      } else if (stopped) {
        state.pausedReason = state.queue.length ? "stopped" : "";
        state.lastError = tr("已停止後續佇列發送。", "Future queue sending was stopped.");
        showToast(state.lastError);
      }
    } catch (error) {
      if (error instanceof QueueAbortError) {
        stopped = true;
        if (state.queue[0]) {
          clearComposerIfMatches(state.queue[0].text);
          state.queue[0].status = "pending";
          state.queue[0].submission = null;
        }
        state.pausedReason = state.queue.length ? "stopped" : "";
        state.lastError = tr("已停止後續佇列發送。", "Future queue sending was stopped.");
        showToast(state.lastError);
      } else {
        failed = true;
        if (state.queue[0]) {
          if (state.queue[0].status !== "awaiting-response") {
            clearComposerIfMatches(state.queue[0].text);
            state.queue[0].status = "pending";
            state.queue[0].submission = null;
          }
        }
        state.pausedReason = state.queue.length ? "error" : "";
        state.lastError = error?.message || tr("佇列發送失敗。", "Queue sending failed.");
        showToast(state.lastError, state.queue.length ? { duration: 7200, label: tr("重試", "Retry"), action: "continue" } : { duration: 5200 });
        console.error("[CQS] queue failed", error);
      }
    } finally {
      const finalRunScope = state.activeRunScope || runScope;
      const shouldRestartForRace = !failed && !stopped && !state.abort && state.queue.length > 0;
      state.running = false;
      state.autoRunArmed = false;
      state.abort = false;
      state.runTotal = 0;
      state.runDone = 0;
      storageSet(state, finalRunScope);
      await releaseQueueLease(finalRunScope);
      if (state.activeRunScope === finalRunScope) state.activeRunScope = "";
      markManagerDirty();
      renderUi();
      if (shouldRestartForRace && state.scopeKey === finalRunScope) setTimeout(requestAutoRun, 180);
    }
  }

  let scheduled = false;
  function scheduleUiRefresh() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      ensureQueueButton();
      placePreviewBar();
      if (state.schedulePanelOpen) positionSchedulePanel();
      renderUi();
    }, 250);
  }

  function registerContentRuntimeMessages() {
    const runtime = (firefoxApi || chromeApi)?.runtime;
    if (!runtime?.onMessage?.addListener) return;
    runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== "CQS_SCHEDULE_FIRE") return undefined;
      const task = sendScheduledText(message).finally(() => {
        setTimeout(() => { void refreshScheduledItems(); }, 250);
      });
      if (firefoxApi) return task;
      task.then(sendResponse, (error) => sendResponse({
        ok: false,
        message: error?.message || tr("定時發送失敗。", "Scheduled send failed."),
      }));
      return true;
    });
  }

  async function init() {
    await initializeTabContext();
    state.scopeKey = getScopeKeyForLocation();
    state.scopePath = location.pathname;
    await claimLegacyQueueForCurrentScope();

    const [saved, notificationSettings] = await Promise.all([
      storageGet(state.scopeKey),
      notificationSettingsGet(),
    ]);
    state.notificationSettings = notificationSettings;
    applySavedQueueState(saved);
    state.initialized = true;

    scheduleUiRefresh();
    void refreshScheduledItems();
    if (state.queue.length && !state.pausedReason) {
      setTimeout(requestAutoRun, 650);
    }

    resetResponseMonitor({ keepBusy: true });

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== "local") return;

      if (changes?.[SCHEDULE_STORAGE_KEY]) {
        void refreshScheduledItems();
      }

      if (changes?.[NOTIFICATION_SETTINGS_KEY]) {
        state.notificationSettings = {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...(changes[NOTIFICATION_SETTINGS_KEY].newValue || {}),
        };
        if (state.notificationSettings.enabled && state.notificationSettings.sound) prepareCompletionAudio();
      }

      const scopedKey = getScopedStorageKey(state.scopeKey);
      if (changes?.[scopedKey] && !state.running && !state.scopeSwitching) {
        applySavedQueueState(changes[scopedKey].newValue || {});
        markManagerDirty();
        renderUi();
        if (state.queue.length && !state.pausedReason) setTimeout(requestAutoRun, 300);
      }
    };
    try {
      (firefoxApi || chromeApi)?.storage?.onChanged?.addListener(handleStorageChange);
    } catch (_) {}

    document.addEventListener("pointerdown", prepareCompletionAudio, { passive: true });
    document.addEventListener("keydown", prepareCompletionAudio, { passive: true });
    document.addEventListener("cqs:direct-download-status", (event) => {
      const message = String(event?.detail?.message || "").trim();
      if (!message) return;
      showToast(message, { duration: event?.detail?.kind === "error" ? 5200 : 2600 });
    });

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => !isCqsUi(mutation.target))) scheduleUiRefresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(scheduleUiRefresh, 1800);
    setInterval(responseMonitorTick, 650);
    setInterval(() => { void switchQueueScopeIfNeeded(); }, 400);
  }

  function enqueueTextForCurrentScope(text, options = {}) {
    if (!state.initialized) {
      return { ok: false, message: tr("訊息佇列仍在載入，請稍候再試。", "The queue is still loading. Try again in a moment."), queuedAhead: 0 };
    }
    if (!queueScopeReadyForInput()) {
      void switchQueueScopeIfNeeded();
      return { ok: false, message: tr("聊天室正在切換，請稍候再試。", "The conversation is switching. Try again in a moment."), queuedAhead: state.queue.length };
    }
    const queuedAhead = state.queue.length;
    const added = addMessages([text], "", options);
    if (!added.length) {
      return {
        ok: false,
        message: state.lastError || tr("佇列已滿，最多 {max} 則。", "The queue is full. Maximum: {max} messages.", { max: MAX_QUEUE }),
        queuedAhead,
      };
    }
    requestAutoRun();
    return {
      ok: true,
      id: added[0].id,
      queuedAhead,
      queueLength: state.queue.length,
    };
  }

  window.__CQS_QUEUE_API__ = Object.freeze({
    enqueueText: enqueueTextForCurrentScope,
    async enqueueTextAsync(text, options = {}) {
      if (!(await ensureQueueScopeReadyForInput())) {
        return { ok: false, message: tr("聊天室切換尚未完成，請稍後再試。", "The conversation switch is not complete. Try again shortly."), queuedAhead: state.queue.length };
      }
      return enqueueTextForCurrentScope(text, options);
    },
    getStatus() {
      return {
        running: state.running,
        queueLength: state.queue.length,
        maxQueue: MAX_QUEUE,
        pausedReason: state.pausedReason,
        scopeKey: state.scopeKey,
        conversationId: getConversationId(),
      };
    },
  });

  registerContentRuntimeMessages();
  init();
})();
