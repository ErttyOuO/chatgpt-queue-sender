(() => {
  const api = globalThis.browser || globalThis.chrome;
  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));
  if (!api?.runtime) return;

  const SETTINGS_KEY = "cqs_notification_settings_v1";
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: false,
    desktop: true,
    sound: true,
    onlyWhenHidden: true,
  });
  const ARCHIVE_DEVICE_ID = (() => {
    try { return globalThis.crypto?.randomUUID?.() || `cqs-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
    catch (_) { return `cqs-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  })();

  const LEGACY_QUEUE_KEY = "cqs_queue_sender_state_v4";
  const QUEUE_MIGRATION_KEY = "cqs_queue_sender_state_v5_migration";
  const QUEUE_LEASE_TTL_MS = 14000;
  const QUEUE_LEASE_STORAGE_KEY = "cqs_queue_sender_session_leases_v1";
  const queueLeaseStorage = api.storage?.session || api.storage?.local;
  let leaseMutationChain = Promise.resolve();
  let legacyMigrationChain = Promise.resolve();

  function makeToken() {
    try { return globalThis.crypto?.randomUUID?.() || `lease-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
    catch (_) { return `lease-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  }

  function senderTabId(sender) {
    return Number.isInteger(sender?.tab?.id) ? sender.tab.id : -1;
  }

  function withQueueLeaseMutation(operation) {
    const run = leaseMutationChain
      .catch(() => undefined)
      .then(operation);
    leaseMutationChain = run.then(() => undefined, () => undefined);
    return run;
  }

  function normalizeStoredLeases(value, now = Date.now()) {
    const leases = {};
    let changed = false;
    const source = value && typeof value === "object" && value.leases && typeof value.leases === "object"
      ? value.leases
      : {};
    for (const [scopeKey, lease] of Object.entries(source)) {
      const tabId = Number(lease?.tabId);
      const token = String(lease?.token || "");
      const expiresAt = Number(lease?.expiresAt || 0);
      if (!scopeKey || !Number.isInteger(tabId) || tabId < 0 || !token || expiresAt <= now) {
        changed = true;
        continue;
      }
      leases[scopeKey] = { tabId, token, expiresAt };
    }
    if (Object.keys(leases).length !== Object.keys(source).length) changed = true;
    return { leases, changed };
  }

  async function readQueueLeaseState(now = Date.now()) {
    if (!queueLeaseStorage?.get) return { leases: {}, changed: false };
    const result = await queueLeaseStorage.get(QUEUE_LEASE_STORAGE_KEY);
    return normalizeStoredLeases(result?.[QUEUE_LEASE_STORAGE_KEY], now);
  }

  async function writeQueueLeaseState(leases) {
    if (!queueLeaseStorage?.set) throw new Error("queue-lease-storage-unavailable");
    await queueLeaseStorage.set({
      [QUEUE_LEASE_STORAGE_KEY]: {
        version: 1,
        updatedAt: Date.now(),
        leases,
      },
    });
  }

  function acquireQueueLease(message, sender) {
    return withQueueLeaseMutation(async () => {
      const scopeKey = String(message?.scopeKey || "").trim();
      const tabId = senderTabId(sender);
      if (!scopeKey || tabId < 0) return { ok: false, reason: "invalid-context", retryAfterMs: 3000 };
      const now = Date.now();
      const { leases } = await readQueueLeaseState(now);
      const existing = leases[scopeKey];
      if (existing && existing.tabId !== tabId) {
        return {
          ok: false,
          reason: "owned-by-another-tab",
          retryAfterMs: Math.max(1000, existing.expiresAt - now),
        };
      }
      const token = existing?.token || makeToken();
      const expiresAt = now + QUEUE_LEASE_TTL_MS;
      leases[scopeKey] = { tabId, token, expiresAt };
      await writeQueueLeaseState(leases);
      return { ok: true, token, expiresAt };
    });
  }

  function renewQueueLease(message, sender) {
    return withQueueLeaseMutation(async () => {
      const scopeKey = String(message?.scopeKey || "").trim();
      const token = String(message?.token || "");
      const tabId = senderTabId(sender);
      const now = Date.now();
      const { leases } = await readQueueLeaseState(now);
      const existing = leases[scopeKey];
      if (!existing || existing.tabId !== tabId || existing.token !== token) {
        return { ok: false, reason: "lease-lost" };
      }
      const expiresAt = now + QUEUE_LEASE_TTL_MS;
      leases[scopeKey] = { ...existing, expiresAt };
      await writeQueueLeaseState(leases);
      return { ok: true, expiresAt };
    });
  }

  function releaseQueueLease(message, sender) {
    return withQueueLeaseMutation(async () => {
      const scopeKey = String(message?.scopeKey || "").trim();
      const token = String(message?.token || "");
      const tabId = senderTabId(sender);
      const { leases, changed } = await readQueueLeaseState();
      const existing = leases[scopeKey];
      if (existing && existing.tabId === tabId && existing.token === token) {
        delete leases[scopeKey];
        await writeQueueLeaseState(leases);
      } else if (changed) {
        await writeQueueLeaseState(leases);
      }
      return { ok: true };
    });
  }

  function transferQueueLease(message, sender) {
    return withQueueLeaseMutation(async () => {
      const fromScopeKey = String(message?.fromScopeKey || "").trim();
      const toScopeKey = String(message?.toScopeKey || "").trim();
      const token = String(message?.token || "");
      const tabId = senderTabId(sender);
      if (!fromScopeKey || !toScopeKey || tabId < 0) return { ok: false, reason: "invalid-context" };
      const now = Date.now();
      const { leases } = await readQueueLeaseState(now);
      const existing = leases[fromScopeKey];
      const target = leases[toScopeKey];
      if (!existing || existing.tabId !== tabId || existing.token !== token) return { ok: false, reason: "lease-lost" };
      if (target && target.tabId !== tabId) return { ok: false, reason: "target-owned" };
      const expiresAt = now + QUEUE_LEASE_TTL_MS;
      delete leases[fromScopeKey];
      leases[toScopeKey] = { tabId, token, expiresAt };
      await writeQueueLeaseState(leases);
      return { ok: true, expiresAt };
    });
  }

  function releaseQueueLeasesForTab(tabId) {
    return withQueueLeaseMutation(async () => {
      if (!Number.isInteger(tabId) || tabId < 0) return;
      const { leases, changed } = await readQueueLeaseState();
      let removed = false;
      for (const [scopeKey, lease] of Object.entries(leases)) {
        if (lease?.tabId === tabId) {
          delete leases[scopeKey];
          removed = true;
        }
      }
      if (removed || changed) await writeQueueLeaseState(leases);
    });
  }

  function claimLegacyQueue(message, sender) {
    const storageKey = String(message?.storageKey || "").trim();
    const scopeKey = String(message?.scopeKey || "").trim();
    if (!storageKey || !scopeKey || senderTabId(sender) < 0) return Promise.resolve({ migrated: false });

    legacyMigrationChain = legacyMigrationChain
      .catch(() => undefined)
      .then(async () => {
        const result = await api.storage.local.get([LEGACY_QUEUE_KEY, QUEUE_MIGRATION_KEY, storageKey]);
        const legacy = result?.[LEGACY_QUEUE_KEY];
        const migrated = result?.[QUEUE_MIGRATION_KEY];
        const target = result?.[storageKey];
        if (target?.queue?.length || migrated || !legacy?.queue?.length) return { migrated: false };
        await api.storage.local.set({
          [storageKey]: {
            ...legacy,
            schemaVersion: 5,
            scopeKey,
            migratedFrom: LEGACY_QUEUE_KEY,
          },
          [QUEUE_MIGRATION_KEY]: {
            migratedAt: Date.now(),
            scopeKey,
            storageKey,
          },
        });
        await api.storage.local.remove(LEGACY_QUEUE_KEY);
        return { migrated: true };
      });
    return legacyMigrationChain;
  }

  async function storageGet(key) {
    try {
      const result = await api.storage.local.get(key);
      return result?.[key];
    } catch (_) {
      return undefined;
    }
  }

  async function getSettings() {
    const saved = await storageGet(SETTINGS_KEY);
    return {
      ...DEFAULT_SETTINGS,
      ...(saved && typeof saved === "object" ? saved : {}),
    };
  }

  async function hasNotificationsPermission() {
    try {
      return await api.permissions.contains({ permissions: ["notifications"] });
    } catch (_) {
      return false;
    }
  }

  function notificationId(tabId) {
    const safeTabId = Number.isInteger(tabId) ? tabId : -1;
    return `cqs-response-${safeTabId}-${Date.now()}`;
  }

  async function createCompletionNotification(payload = {}, sender = null) {
    const settings = await getSettings();
    if (!settings.enabled || !settings.desktop) return { shown: false, reason: "disabled" };
    if (!(await hasNotificationsPermission())) return { shown: false, reason: "permission" };

    const tabId = Number.isInteger(payload.tabId) ? payload.tabId : sender?.tab?.id;
    const title = String(payload.title || tr("ChatGPT 回覆完成", "ChatGPT response complete")).slice(0, 80);
    const message = String(payload.message || tr("ChatGPT 已完成這次回覆。", "ChatGPT has finished this response.")).replace(/\s+/g, " ").trim().slice(0, 240);
    const id = notificationId(tabId);

    if (!api.notifications?.create) return { shown: false, reason: "unavailable" };
    try {
      await api.notifications.create(id, {
        type: "basic",
        iconUrl: api.runtime.getURL("icons/icon-128.png"),
        title,
        message: message || tr("ChatGPT 已完成這次回覆。", "ChatGPT has finished this response."),
      });
      return { shown: true, id };
    } catch (error) {
      console.error("[CQS] notification failed", error);
      return { shown: false, reason: "error" };
    }
  }

  async function createTestNotification() {
    if (!(await hasNotificationsPermission())) return { shown: false, reason: "permission" };
    if (!api.notifications?.create) return { shown: false, reason: "unavailable" };
    try {
      const id = notificationId(-1);
      await api.notifications.create(id, {
        type: "basic",
        iconUrl: api.runtime.getURL("icons/icon-128.png"),
        title: "ChatGPT Queue Sender",
        message: tr("測試成功：之後 ChatGPT 回覆完成時會顯示提醒。", "Test successful. Future completed ChatGPT responses will show an alert."),
      });
      return { shown: true, id };
    } catch (error) {
      console.error("[CQS] test notification failed", error);
      return { shown: false, reason: "error" };
    }
  }


  function isAllowedArchiveUrl(value) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:") return false;
      const host = url.hostname.toLowerCase();
      return host === "chatgpt.com"
        || host.endsWith(".chatgpt.com")
        || host === "openai.com"
        || host.endsWith(".openai.com")
        || host === "oaiusercontent.com"
        || host.endsWith(".oaiusercontent.com");
    } catch (_) {
      return false;
    }
  }

  function archiveAuthHeaders(accessToken, accountId = "", accept = "*/*") {
    const headers = {
      accept,
      "Oai-Device-Id": ARCHIVE_DEVICE_ID,
      "Oai-Language": globalThis.CQS_I18N?.isEnglish ? "en-US" : "zh-TW",
    };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    if (accountId) headers["chatgpt-account-id"] = accountId;
    return headers;
  }

  function resolvedDownloadHeaders(downloadUrl, origin, accessToken, accountId) {
    try {
      if (new URL(downloadUrl).origin === new URL(origin).origin) {
        return archiveAuthHeaders(accessToken, accountId);
      }
    } catch (_) {}
    // Never forward the ChatGPT bearer token to a signed CDN URL.
    return { accept: "*/*" };
  }

  function metadataCandidates(message) {
    const rawFileId = String(message?.fileId || "").trim();
    const fileId = rawFileId ? encodeURIComponent(rawFileId) : "";
    const conversationId = encodeURIComponent(String(message?.conversationId || "").trim());
    const messageId = String(message?.messageId || "").trim();
    const sandboxPaths = [message?.sandboxPath, ...(Array.isArray(message?.sandboxPaths) ? message.sandboxPaths : [])]
      .map((value) => String(value || "").trim())
      .filter((value, index, array) => value && array.indexOf(value) === index);
    const role = message?.role === "user" ? "user" : "assistant";
    const origin = String(message?.origin || "https://chatgpt.com").replace(/\/$/, "");
    const candidates = [];
    const add = (label, url, options = {}) => candidates.push({ label, url, options });

    if (messageId && conversationId) {
      sandboxPaths.forEach((sandboxPath, index) => {
        const params = new URLSearchParams({ message_id: messageId, sandbox_path: sandboxPath });
        add(index ? `interpreter-${index + 1}` : "interpreter", `${origin}/backend-api/conversation/${conversationId}/interpreter/download?${params}`);
      });
    }

    if (fileId) add("files-download", `${origin}/backend-api/files/download/${fileId}`);
    if (fileId && role === "user") {
      add("uploaded", `${origin}/backend-api/files/${fileId}/uploaded`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });
    }
    if (fileId && conversationId) {
      add("conversation-attachment", `${origin}/backend-api/conversation/${conversationId}/attachment/${fileId}/download`);
    }
    if (fileId) add("file-download", `${origin}/backend-api/files/${fileId}/download`);
    if (fileId && role !== "user") {
      add("uploaded", `${origin}/backend-api/files/${fileId}/uploaded`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });
    }
    if (fileId && conversationId) {
      add("legacy-download", `${origin}/backend-api/files/download/${fileId}?conversation_id=${conversationId}&inline=false`);
    }
    return candidates;
  }

  function parseMetadataDownloadUrl(info, origin) {
    const raw = String(info?.download_url || info?.downloadUrl || info?.url || "").trim();
    try { return raw ? new URL(raw, origin).href : ""; } catch (_) { return ""; }
  }

  async function tryMetadataCandidate(candidate, context, signal) {
    const response = await fetch(candidate.url, {
      method: candidate.options?.method || "GET",
      body: candidate.options?.body,
      credentials: "include",
      redirect: "follow",
      cache: "no-store",
      headers: {
        ...archiveAuthHeaders(context.accessToken, context.accountId, "application/json"),
        ...(candidate.options?.headers || {}),
      },
      signal,
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    let info;
    try { info = await response.json(); } catch (_) { throw new Error(tr("下載資訊不是 JSON", "Download metadata is not valid JSON")); }
    const downloadUrl = parseMetadataDownloadUrl(info, context.origin);
    if (!downloadUrl || !isAllowedArchiveUrl(downloadUrl)) throw new Error(tr("沒有有效下載網址", "No valid download URL was found"));
    return {
      url: downloadUrl,
      fileName: String(info?.file_name || info?.filename || info?.name || context.filename || ""),
      headers: resolvedDownloadHeaders(downloadUrl, context.origin, context.accessToken, context.accountId),
      strategy: candidate.label,
    };
  }

  async function resolveArchiveFileRequest(message, signal) {
    const directUrl = String(message?.url || "").trim();
    const fileId = String(message?.fileId || "").trim();
    const conversationId = String(message?.conversationId || "").trim();
    const messageId = String(message?.messageId || "").trim();
    const sandboxPaths = [message?.sandboxPath, ...(Array.isArray(message?.sandboxPaths) ? message.sandboxPaths : [])]
      .map((value) => String(value || "").trim())
      .filter((value, index, array) => value && array.indexOf(value) === index);
    const accessToken = String(message?.accessToken || "").trim();
    const accountId = String(message?.accountId || "").trim();
    const origin = String(message?.origin || "https://chatgpt.com").replace(/\/$/, "");
    const context = {
      origin,
      accessToken,
      accountId,
      filename: String(message?.filename || ""),
    };

    // When the content script already resolved a signed URL from the ChatGPT page, use it
    // directly. Re-resolving the same file from the extension background was the source of
    // repeated HTTP 403 failures for ZIP, XPI, Markdown, and uploaded files.
    if (directUrl) {
      if (!isAllowedArchiveUrl(directUrl)) throw new Error(tr("這個連結不是允許封存的 ChatGPT／OpenAI 附件網址", "This URL is not an allowed ChatGPT/OpenAI attachment URL"));
      return {
        url: directUrl,
        fileName: context.filename,
        headers: resolvedDownloadHeaders(directUrl, origin, accessToken, accountId),
        strategy: "pre-resolved-url",
      };
    }

    const hasInterpreterSource = Boolean(conversationId && messageId && sandboxPaths.length);
    if (!fileId && !hasInterpreterSource) {
      throw new Error(tr("缺少附件網址、檔案識別碼或可解析的 sandbox 資訊", "Missing attachment URL, file identifier, or resolvable sandbox metadata"));
    }
    if (!conversationId) throw new Error(tr("缺少聊天室 ID，無法解析檔案下載網址", "Missing conversation ID; the file download URL cannot be resolved"));
    if (!isAllowedArchiveUrl(`${origin}/`)) throw new Error(tr("聊天室來源網域不在允許清單", "The conversation origin is not on the allowed list"));

    const failures = [];
    for (const candidate of metadataCandidates(message)) {
      try {
        return await tryMetadataCandidate(candidate, context, signal);
      } catch (error) {
        failures.push(`${candidate.label}:${error?.status || error?.message || "error"}`);
      }
    }
    throw new Error(tr("所有下載端點皆失敗（{failures}）", "All download endpoints failed ({failures})", { failures: failures.join("; ") }));
  }

  function registerArchiveDownloadPort() {
    if (!api.runtime.onConnect?.addListener) return;
    api.runtime.onConnect.addListener((port) => {
      if (port?.name !== "cqs-archive-download") return;

      let controller = null;
      let continueResolver = null;
      let started = false;
      let disconnected = false;

      const post = (message) => {
        if (disconnected) return false;
        try {
          port.postMessage(message);
          return true;
        } catch (_) {
          return false;
        }
      };

      const waitForContinue = () => new Promise((resolve) => {
        continueResolver = resolve;
      });

      const finishWait = (allowed) => {
        const resolve = continueResolver;
        continueResolver = null;
        resolve?.(Boolean(allowed));
      };

      const abort = () => {
        try { controller?.abort(); } catch (_) {}
        finishWait(false);
      };

      async function fetchResolvedFile(resolved, signal) {
        return fetch(resolved.url, {
          method: "GET",
          credentials: "include",
          redirect: "follow",
          cache: "no-store",
          headers: resolved.headers,
          signal,
        });
      }

      async function streamDownload(message) {
        controller = new AbortController();
        let response;
        let resolved;
        const attempts = [];
        try {
          resolved = await resolveArchiveFileRequest(message, controller.signal);
          attempts.push(resolved.strategy || "initial");
          response = await fetchResolvedFile(resolved, controller.signal);

          // Signed attachment URLs can expire while the user reviews the archive plan.
          // When a pre-resolved URL returns an authorization/not-found response, discard it
          // and resolve the file ID again using the current ChatGPT session before failing.
          if (
            !response.ok
            && String(message?.url || "").trim()
            && String(message?.fileId || "").trim()
            && [401, 403, 404].includes(Number(response.status))
          ) {
            attempts.push(`pre-resolved-http-${response.status}`);
            try { response.body?.cancel?.(); } catch (_) {}
            resolved = await resolveArchiveFileRequest({ ...message, url: "" }, controller.signal);
            attempts.push(resolved.strategy || "file-id-fallback");
            response = await fetchResolvedFile(resolved, controller.signal);
          }
        } catch (error) {
          if (error?.name === "AbortError") post({ type: "cancelled" });
          else post({
            type: "error",
            message: tr("下載連線失敗：{error}{attempts}", "Download connection failed: {error}{attempts}", { error: error?.message || tr("未知錯誤", "Unknown error"), attempts: attempts.length ? ` (${attempts.join(" → ")})` : "" }),
          });
          return;
        }

        if (!response.ok) {
          post({
            type: "error",
            message: tr("伺服器回傳 HTTP {status}{attempts}", "Server returned HTTP {status}{attempts}", { status: response.status, attempts: attempts.length ? ` (${attempts.join(" → ")})` : "" }),
          });
          return;
        }

        const headers = {
          contentType: String(response.headers?.get?.("content-type") || ""),
          contentLength: String(response.headers?.get?.("content-length") || ""),
          contentDisposition: String(response.headers?.get?.("content-disposition") || ""),
          finalUrl: String(response.url || resolved?.url || message?.url || ""),
          fileName: String(resolved?.fileName || message?.filename || ""),
        };
        if (!post({ type: "meta", ...headers })) return;

        const allowed = await waitForContinue();
        if (!allowed || disconnected) {
          abort();
          post({ type: "cancelled" });
          return;
        }

        let loaded = 0;
        try {
          if (response.body?.getReader) {
            const reader = response.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (disconnected) throw new DOMException("Cancelled", "AbortError");
                const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
                const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                loaded += bytes.byteLength;
                if (!post({ type: "chunk", buffer, loaded })) throw new DOMException("Disconnected", "AbortError");
              }
            } finally {
              try { await reader.cancel(); } catch (_) {}
              reader.releaseLock?.();
            }
          } else {
            const buffer = await response.arrayBuffer();
            loaded = buffer.byteLength;
            if (!post({ type: "chunk", buffer, loaded })) return;
          }
          post({ type: "done", loaded });
        } catch (error) {
          if (error?.name === "AbortError" || disconnected) post({ type: "cancelled" });
          else post({ type: "error", message: tr("讀取檔案內容失敗：{error}", "Failed to read file content: {error}", { error: error?.message || tr("未知錯誤", "Unknown error") }) });
        } finally {
          controller = null;
        }
      }

      port.onMessage.addListener((message) => {
        if (!message || typeof message !== "object") return;
        if (message.type === "start" && !started) {
          started = true;
          void streamDownload(message);
          return;
        }
        if (message.type === "continue") finishWait(true);
        if (message.type === "cancel") abort();
      });

      port.onDisconnect.addListener(() => {
        disconnected = true;
        abort();
      });
    });
  }

  api.runtime.onMessage.addListener((message, sender) => {
    if (!message || typeof message !== "object") return undefined;
    if (message.type === "CQS_GET_TAB_CONTEXT") {
      return Promise.resolve({ tabId: senderTabId(sender) });
    }
    if (message.type === "CQS_CLAIM_LEGACY_QUEUE") {
      return claimLegacyQueue(message, sender);
    }
    if (message.type === "CQS_QUEUE_LEASE_ACQUIRE") {
      return acquireQueueLease(message, sender);
    }
    if (message.type === "CQS_QUEUE_LEASE_RENEW") {
      return renewQueueLease(message, sender);
    }
    if (message.type === "CQS_QUEUE_LEASE_RELEASE") {
      return releaseQueueLease(message, sender);
    }
    if (message.type === "CQS_QUEUE_LEASE_TRANSFER") {
      return transferQueueLease(message, sender);
    }
    if (message.type === "CQS_RESPONSE_COMPLETE") {
      return createCompletionNotification(message, sender);
    }
    if (message.type === "CQS_TEST_NOTIFICATION") {
      return createTestNotification();
    }
    return undefined;
  });

  let clickListenerRegistered = false;
  function registerNotificationClickListener() {
    if (clickListenerRegistered || !api.notifications?.onClicked?.addListener) return;
    api.notifications.onClicked.addListener(async (id) => {
      const match = /^cqs-response-(-?\d+)-/.exec(String(id));
      const tabId = match ? Number(match[1]) : -1;
      try {
        if (tabId >= 0) {
          const tab = await api.tabs.get(tabId);
          await api.tabs.update(tabId, { active: true });
          if (Number.isInteger(tab.windowId)) {
            await api.windows.update(tab.windowId, { focused: true });
          }
        }
      } catch (_) {}
      try {
        await api.notifications.clear(id);
      } catch (_) {}
    });
    clickListenerRegistered = true;
  }

  try {
    api.tabs?.onRemoved?.addListener((tabId) => {
      releaseQueueLeasesForTab(tabId).catch(() => undefined);
    });
  } catch (_) {}

  // Prune expired leases whenever the non-persistent MV3 background script starts.
  withQueueLeaseMutation(async () => {
    const { leases, changed } = await readQueueLeaseState();
    if (changed) await writeQueueLeaseState(leases);
  }).catch(() => undefined);

  registerNotificationClickListener();
  registerArchiveDownloadPort();
  api.permissions?.onAdded?.addListener(registerNotificationClickListener);
})();
