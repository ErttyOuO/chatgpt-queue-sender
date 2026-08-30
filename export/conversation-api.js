(() => {
  if (window.__CQS_CONVERSATION_API__) return;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));

  // ChatGPT currently uses both `file-...` and `file_...` style identifiers.
  // Do not search arbitrary prose for a `file-` substring: help-center URLs such as
  // `/file-uploads-faq` are ordinary article slugs, not downloadable file IDs.
  const EXACT_FILE_ID_RE = /^(?:file|asset)[-_][A-Za-z0-9_-]{8,}$/i;
  const POINTER_RE = /^(?:file-service|sediment):\/\/(.+)$/i;
  const FILE_QUERY_KEYS = ["file_id", "fileId", "asset_id", "assetId"];
  const SANDBOX_RE = /sandbox:\/mnt\/data\/([^\s)\]}>"']+)/gi;
  const BARE_SANDBOX_RE = /(?:^|[\s"'(])((?:\/mnt\/data\/)[^\s)\]}>"']+)/gi;
  const FILE_EXT_RE = /\.([A-Za-z0-9]{1,16})$/;
  const REQUEST_DEVICE_ID = (() => {
    try { return window.crypto?.randomUUID?.() || `cqs-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
    catch (_) { return `cqs-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  })();

  function normalizeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function getConversationId() {
    const parts = location.pathname.split("/").filter(Boolean);
    const cIndex = parts.lastIndexOf("c");
    if (cIndex >= 0 && parts[cIndex + 1]) return decodeURIComponent(parts[cIndex + 1]);
    const match = location.pathname.match(/\/c\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function safeFilename(value, fallback = "") {
    const clean = normalizeText(value)
      .replace(/^sandbox:\/mnt\/data\//i, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 180);
    return clean || fallback;
  }

  function looksLikeFilename(value) {
    const text = normalizeText(value);
    return Boolean(text && FILE_EXT_RE.test(text) && !/^https?:/i.test(text));
  }

  function isLikelyFileIdToken(value) {
    const token = String(value || "").trim();
    if (!EXACT_FILE_ID_RE.test(token)) return false;
    const suffix = token.replace(/^(?:file|asset)[-_]/i, "");
    // Real IDs are opaque tokens. Reject readable lowercase hyphenated phrases such as
    // `file-uploads-capability-work`, which previously produced false downloads.
    if (/^[a-z]+(?:-[a-z]+)+$/.test(suffix)) return false;
    return /\d/.test(suffix) || /[A-Z]/.test(suffix) || suffix.length >= 24;
  }

  function extractFileId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    let text = raw;
    try { text = decodeURIComponent(raw); } catch (_) {}

    const pointer = POINTER_RE.exec(text);
    if (pointer) return extractFileId(pointer[1]);
    if (isLikelyFileIdToken(text)) return text;

    // URLs are accepted only when the ID appears in a dedicated file/asset parameter
    // or as an opaque path segment. This avoids matching words inside article slugs.
    try {
      const url = new URL(text, location.origin);
      for (const key of FILE_QUERY_KEYS) {
        const candidate = url.searchParams.get(key);
        if (isLikelyFileIdToken(candidate)) return candidate;
      }
      const segments = url.pathname.split("/").filter(Boolean).map((segment) => {
        try { return decodeURIComponent(segment); } catch (_) { return segment; }
      });
      for (const segment of segments) {
        if (isLikelyFileIdToken(segment)) return segment;
      }
    } catch (_) {}
    return "";
  }

  function mimeToType(mime, contentType = "") {
    const value = String(mime || contentType || "").toLowerCase();
    if (value.includes("image")) return tr("圖片", "Image");
    if (value.includes("canvas")) return tr("Canvas 文件", "Canvas document");
    if (value.includes("pdf")) return tr("PDF 文件", "PDF document");
    if (value.includes("zip")) return tr("ZIP 壓縮檔", "ZIP archive");
    if (value.includes("xpinstall") || value.includes("xpi")) return tr("Firefox 擴充套件", "Firefox extension");
    if (value.includes("spreadsheet") || value.includes("excel")) return tr("試算表", "Spreadsheet");
    if (value.includes("presentation") || value.includes("powerpoint")) return tr("簡報", "Presentation");
    if (value.includes("audio")) return tr("音訊", "Audio");
    if (value.includes("video")) return tr("影片", "Video");
    if (value.includes("text") || value.includes("markdown")) return tr("文字文件", "Text document");
    return tr("檔案", "File");
  }

  function numberFromObject(object, keys) {
    for (const key of keys) {
      const value = Number(object?.[key]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
    const metadata = object?.metadata;
    if (metadata && metadata !== object) {
      for (const key of keys) {
        const value = Number(metadata?.[key]);
        if (Number.isFinite(value) && value >= 0) return value;
      }
    }
    return null;
  }

  function stringFromObject(object, keys) {
    if (!object || typeof object !== "object") return "";
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    const metadata = object.metadata;
    if (metadata && metadata !== object) {
      for (const key of keys) {
        const value = metadata[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
    return "";
  }

  function nameFromObject(object) {
    if (!object || typeof object !== "object") return "";
    const keys = ["file_name", "filename", "original_name", "display_name", "name", "title"];
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && looksLikeFilename(value)) return safeFilename(value);
    }
    const metadata = object.metadata;
    if (metadata && metadata !== object) {
      for (const key of keys) {
        const value = metadata[key];
        if (typeof value === "string" && looksLikeFilename(value)) return safeFilename(value);
      }
    }
    return "";
  }

  function sandboxPathFromObject(object) {
    if (!object || typeof object !== "object") return "";
    const keys = ["sandbox_path", "sandboxPath", "path", "file_path", "filePath"];
    for (const key of keys) {
      const value = String(object[key] || "").trim();
      if (/^sandbox:\/mnt\/data\//i.test(value)) return value;
      if (/^\/mnt\/data\//i.test(value)) return `sandbox:${value}`;
    }
    const metadata = object.metadata;
    if (metadata && metadata !== object) return sandboxPathFromObject(metadata);
    return "";
  }

  function collectSandboxEntries(value, output = []) {
    if (typeof value === "string") {
      const sources = [value];
      try {
        const decoded = decodeURIComponent(value);
        if (decoded !== value) sources.push(decoded);
      } catch (_) {}

      const addPath = (rawPath) => {
        let path = String(rawPath || "").trim().replace(/[.,;，。；]+$/g, "");
        try { path = decodeURIComponent(path); } catch (_) {}
        if (/^\/mnt\/data\//i.test(path)) path = `sandbox:${path}`;
        if (!/^sandbox:\/mnt\/data\//i.test(path)) return;
        const relative = path.replace(/^sandbox:\/mnt\/data\//i, "");
        const basename = relative.split(/[\/]/).filter(Boolean).pop() || "";
        const name = safeFilename(basename);
        if (looksLikeFilename(name) && !output.some((entry) => entry.path === path)) output.push({ name, path });
      };

      for (const source of sources) {
        SANDBOX_RE.lastIndex = 0;
        let match;
        while ((match = SANDBOX_RE.exec(source))) addPath(`sandbox:/mnt/data/${match[1]}`);
        SANDBOX_RE.lastIndex = 0;
        BARE_SANDBOX_RE.lastIndex = 0;
        while ((match = BARE_SANDBOX_RE.exec(source))) addPath(match[1]);
        BARE_SANDBOX_RE.lastIndex = 0;
      }
      return output;
    }
    if (!value || typeof value !== "object") return output;
    if (Array.isArray(value)) {
      value.forEach((item) => collectSandboxEntries(item, output));
      return output;
    }
    Object.values(value).forEach((item) => collectSandboxEntries(item, output));
    return output;
  }

  function activeMessageEntries(conversationData) {
    const mapping = conversationData?.mapping || {};
    let nodeId = conversationData?.current_node || "";
    const ids = [];
    const seen = new Set();
    while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      ids.push(nodeId);
      nodeId = mapping[nodeId]?.parent || "";
    }
    ids.reverse();
    if (!ids.length) {
      return Object.entries(mapping)
        .map(([id, node]) => ({ id, node, message: node?.message }))
        .filter((entry) => entry.message)
        .sort((a, b) => Number(a.message?.create_time || 0) - Number(b.message?.create_time || 0));
    }
    return ids
      .map((id) => ({ id, node: mapping[id], message: mapping[id]?.message }))
      .filter((entry) => entry.message);
  }

  function activeMessages(conversationData) {
    return activeMessageEntries(conversationData).map((entry) => entry.message);
  }

  function scanMessageForFileRefs(message, conversationId, appearanceStart = 0) {
    const role = message?.author?.role === "user" ? "user" : "assistant";
    const refs = [];
    const byId = new Map();
    let appearance = appearanceStart;

    function mergeSandboxPaths(ref, ...values) {
      const merged = [
        ...(Array.isArray(ref?.sandboxPaths) ? ref.sandboxPaths : []),
        ref?.sandboxPath,
        ...values.flatMap((value) => (Array.isArray(value) ? value : [value])),
      ].map((value) => String(value || "").trim())
        .filter((value, index, array) => value && array.indexOf(value) === index);
      if (merged.length) {
        ref.sandboxPaths = merged;
        if (!ref.sandboxPath) ref.sandboxPath = merged[0];
      }
    }

    function addRef(fileId, context = {}, fallback = {}, sourceArea = "content") {
      const cleanId = extractFileId(fileId) || String(fileId || "").trim();
      if (!cleanId || !/^(?:file|asset)[-_]/i.test(cleanId)) return;
      const name = nameFromObject(context) || nameFromObject(fallback) || "";
      const mime = stringFromObject(context, ["mime_type", "mimeType", "media_type"])
        || stringFromObject(fallback, ["mime_type", "mimeType", "media_type"])
        || "";
      const contentType = stringFromObject(context, ["content_type", "contentType", "type"])
        || stringFromObject(fallback, ["content_type", "contentType", "type"])
        || "";
      const sizeHint = numberFromObject(context, ["size_bytes", "file_size", "size", "bytes"])
        ?? numberFromObject(fallback, ["size_bytes", "file_size", "size", "bytes"]);
      const sandboxPath = sandboxPathFromObject(context) || sandboxPathFromObject(fallback) || "";
      const existing = byId.get(cleanId.toLowerCase());
      if (existing) {
        if (!existing.name && name) existing.name = name;
        if (!existing.mimeType && mime) {
          existing.mimeType = String(mime);
          existing.type = mimeToType(mime, contentType);
        }
        if (!Number.isFinite(existing.sizeHint) && Number.isFinite(sizeHint)) existing.sizeHint = sizeHint;
        mergeSandboxPaths(existing, sandboxPath);
        return;
      }
      const ref = {
        fileId: cleanId,
        conversationId,
        name,
        role,
        type: mimeToType(mime, contentType),
        mimeType: String(mime || ""),
        sizeHint,
        sourceKind: "conversation-api",
        downloadable: true,
        appearanceIndex: appearance,
        messageId: String(message?.id || ""),
        sandboxPath,
        sandboxPaths: sandboxPath ? [sandboxPath] : [],
        sourceArea,
      };
      byId.set(cleanId.toLowerCase(), ref);
      refs.push(ref);
      appearance += 1;
    }

    function visit(value, parent = null, depth = 0, sourceArea = "content") {
      if (depth > 12 || value == null) return;
      if (typeof value === "string") {
        const id = extractFileId(value);
        if (id) addRef(id, parent || {}, message || {}, sourceArea);
        return;
      }
      if (typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, parent, depth + 1, sourceArea));
        return;
      }

      const pointerKeys = ["asset_pointer", "file_id", "fileId", "asset_id", "assetId"];
      for (const key of pointerKeys) {
        const id = extractFileId(value[key]);
        if (id) addRef(id, value, parent || message || {}, sourceArea);
      }
      for (const [key, child] of Object.entries(value)) {
        if (pointerKeys.includes(key)) continue;
        visit(child, value, depth + 1, sourceArea);
      }
    }

    visit(message?.content, message, 0, "content");
    visit(message?.metadata, message, 0, "metadata");

    const sandboxEntries = collectSandboxEntries([message?.content, message?.metadata]);
    const unnamed = refs.filter((ref) => !ref.name && ref.sourceArea !== "metadata");
    const usedSandboxPaths = new Set(refs.flatMap((ref) => [
      ref.sandboxPath,
      ...(Array.isArray(ref.sandboxPaths) ? ref.sandboxPaths : []),
    ]).filter(Boolean));
    const compatible = (ref, entry) => {
      const extension = entry.name.match(FILE_EXT_RE)?.[1]?.toLowerCase() || "";
      if (!extension) return false;
      if (ref.mimeType.includes("zip")) return extension === "zip";
      if (ref.mimeType.includes("xpinstall") || ref.mimeType.includes("xpi")) return extension === "xpi";
      if (ref.mimeType.includes("image")) return ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension);
      if (ref.mimeType.includes("markdown")) return extension === "md";
      if (ref.mimeType.includes("json")) return extension === "json";
      return false;
    };
    // When both a file/asset pointer and a sandbox link describe the same named file,
    // keep them as one attachment and retain both download strategies.
    for (const ref of refs.filter((item) => item.name)) {
      const match = sandboxEntries.find((entry) => (
        !usedSandboxPaths.has(entry.path)
        && entry.name.toLowerCase() === ref.name.toLowerCase()
      ));
      if (!match) continue;
      mergeSandboxPaths(ref, match.path);
      usedSandboxPaths.add(match.path);
    }

    for (const ref of unnamed) {
      const match = sandboxEntries.find((entry) => !usedSandboxPaths.has(entry.path) && compatible(ref, entry));
      if (!match) continue;
      ref.name = match.name;
      mergeSandboxPaths(ref, match.path);
      usedSandboxPaths.add(match.path);
    }

    // Recent ChatGPT responses can expose generated files only as sandbox links that
    // render as React buttons. They may not have a file_id/asset_pointer in the visible
    // message object. Keep those path-only outputs so the interpreter download endpoint
    // can resolve them with the assistant message ID.
    for (const entry of sandboxEntries) {
      if (usedSandboxPaths.has(entry.path) || refs.some((ref) => ref.sandboxPath === entry.path)) continue;
      refs.push({
        fileId: "",
        conversationId,
        name: entry.name,
        role,
        type: mimeToType("", entry.name.split(".").pop() || ""),
        mimeType: "",
        sizeHint: null,
        sourceKind: "conversation-api-sandbox",
        downloadable: true,
        appearanceIndex: appearance,
        messageId: String(message?.id || ""),
        sandboxPath: entry.path,
        sandboxPaths: [entry.path],
      });
      appearance += 1;
    }
    return refs;
  }

  function makeHttpError(status, prefix = "HTTP") {
    const error = new Error(`${prefix} ${status}`);
    error.status = Number(status || 0);
    return error;
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: {
        accept: "application/json",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw makeHttpError(response.status);
    return response.json();
  }

  async function fetchJsonFromPage(url, options = {}) {
    const pageWindow = window.wrappedJSObject;
    if (!pageWindow || typeof pageWindow.fetch !== "function" || typeof cloneInto !== "function") {
      throw new Error(tr("頁面原生請求通道不可用", "The page-native request channel is unavailable"));
    }
    const plainOptions = {
      method: options.method || "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      headers: {
        accept: "application/json",
        ...(options.headers || {}),
      },
    };
    if (options.body != null) plainOptions.body = options.body;
    const pageOptions = cloneInto(plainOptions, pageWindow);
    const response = await pageWindow.fetch.call(pageWindow, String(url), pageOptions);
    const text = await response.text();
    if (!response.ok) throw makeHttpError(response.status);
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new Error(tr("檔案下載資訊格式不正確", "The file download metadata format is invalid"));
    }
  }

  async function fetchJsonWithPageFallback(url, options = {}) {
    try {
      return await fetchJson(url, options);
    } catch (error) {
      if (![401, 403].includes(Number(error?.status))) throw error;
      return fetchJsonFromPage(url, options);
    }
  }

  async function getSession() {
    try {
      return await fetchJson(`${location.origin}/api/auth/session`);
    } catch (_) {
      return null;
    }
  }

  function accountIdFromSession(session) {
    const direct = session?.account?.id || session?.account_id || session?.accountId || session?.user?.account_id || session?.user?.accountId;
    return typeof direct === "string" ? direct : "";
  }

  async function fetchConversationData(conversationId, accessToken = "", accountId = "") {
    const headers = {};
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    if (accountId) headers["chatgpt-account-id"] = accountId;
    return fetchJsonWithPageFallback(`${location.origin}/backend-api/conversation/${encodeURIComponent(conversationId)}`, { headers });
  }

  function authHeaders(context) {
    const headers = {
      "Oai-Device-Id": REQUEST_DEVICE_ID,
      "Oai-Language": globalThis.CQS_I18N?.isChinese ? "zh-TW" : "en-US",
    };
    if (context?.accessToken) headers.authorization = `Bearer ${context.accessToken}`;
    if (context?.accountId) headers["chatgpt-account-id"] = context.accountId;
    return headers;
  }

  function fileInfoRequests(ref, context) {
    const base = location.origin;
    const rawFileId = String(ref.fileId || "").trim();
    const fileId = rawFileId ? encodeURIComponent(rawFileId) : "";
    const conversationId = encodeURIComponent(context.conversationId || ref.conversationId || "");
    const requests = [];
    const add = (label, url, options = {}) => requests.push({ label, url, options });

    const sandboxPaths = [ref.sandboxPath, ...(Array.isArray(ref.sandboxPaths) ? ref.sandboxPaths : [])]
      .map((value) => String(value || "").trim())
      .filter((value, index, array) => value && array.indexOf(value) === index);
    if (ref.messageId && conversationId) {
      sandboxPaths.forEach((sandboxPath, index) => {
        const params = new URLSearchParams({ message_id: ref.messageId, sandbox_path: sandboxPath });
        add(index ? `interpreter-${index + 1}` : "interpreter", `${base}/backend-api/conversation/${conversationId}/interpreter/download?${params}`);
      });
    }

    // Current ChatGPT exporters resolve regular uploads and generated files through this
    // same-origin metadata endpoint. Keep it before role-specific fallbacks when an ID exists.
    if (fileId) add("files-download", `${base}/backend-api/files/download/${fileId}`);

    // User uploads are most reliably resolved from the upload-completion endpoint.
    if (fileId && ref.role === "user") {
      add("uploaded", `${base}/backend-api/files/${fileId}/uploaded`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });
    }

    if (fileId && conversationId) {
      add("conversation-attachment", `${base}/backend-api/conversation/${conversationId}/attachment/${fileId}/download`);
    }
    if (fileId) add("file-download", `${base}/backend-api/files/${fileId}/download`);

    if (fileId && ref.role !== "user") {
      add("uploaded", `${base}/backend-api/files/${fileId}/uploaded`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });
    }

    // Legacy fallback kept last for older ChatGPT builds.
    if (fileId && conversationId) {
      add("legacy-download", `${base}/backend-api/files/download/${fileId}?conversation_id=${conversationId}&inline=false`);
    }
    return requests;
  }

  function parseFileInfo(json, ref, strategy) {
    const rawUrl = String(json?.download_url || json?.downloadUrl || json?.url || "").trim();
    let downloadUrl = "";
    try { downloadUrl = rawUrl ? new URL(rawUrl, location.origin).href : ""; } catch (_) {}
    const fileName = safeFilename(json?.file_name || json?.filename || json?.name || "");
    if (!downloadUrl) return null;
    return {
      ...ref,
      name: fileName || ref.name || `${ref.fileId}.bin`,
      resolvedFileName: fileName,
      resolvedDownloadUrl: downloadUrl,
      metadataResolved: true,
      resolutionStrategy: strategy,
    };
  }

  async function resolveFileInfo(ref, context) {
    if (!ref?.fileId && !ref?.sandboxPath && !(Array.isArray(ref?.sandboxPaths) && ref.sandboxPaths.length)) return ref;
    const failures = [];
    for (const request of fileInfoRequests(ref, context)) {
      const options = {
        ...request.options,
        headers: {
          ...authHeaders(context),
          ...(request.options?.headers || {}),
        },
      };
      try {
        const json = await fetchJsonWithPageFallback(request.url, options);
        const parsed = parseFileInfo(json, ref, request.label);
        if (parsed) return parsed;
        failures.push(`${request.label}:no-url`);
      } catch (error) {
        failures.push(`${request.label}:${error?.status || error?.message || "error"}`);
      }
    }
    return {
      ...ref,
      name: ref.name || `${ref.fileId}.bin`,
      metadataResolved: false,
      resolutionFailures: failures,
    };
  }

  async function mapLimit(items, limit, worker) {
    const output = new Array(items.length);
    let index = 0;
    async function run() {
      while (index < items.length) {
        const current = index;
        index += 1;
        output[current] = await worker(items[current], current);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, run));
    return output;
  }

  function mergeAttachment(existing, incoming) {
    if (!existing.fileId && incoming.fileId) existing.fileId = incoming.fileId;
    if (!existing.conversationId && incoming.conversationId) existing.conversationId = incoming.conversationId;
    if (!existing.name && incoming.name) existing.name = incoming.name;
    if (!existing.mimeType && incoming.mimeType) {
      existing.mimeType = incoming.mimeType;
      existing.type = incoming.type;
    }
    if (!Number.isFinite(existing.sizeHint) && Number.isFinite(incoming.sizeHint)) existing.sizeHint = incoming.sizeHint;
    if (!existing.sandboxPath && incoming.sandboxPath) existing.sandboxPath = incoming.sandboxPath;
    const mergedSandboxPaths = [
      ...(Array.isArray(existing.sandboxPaths) ? existing.sandboxPaths : []),
      existing.sandboxPath,
      ...(Array.isArray(incoming.sandboxPaths) ? incoming.sandboxPaths : []),
      incoming.sandboxPath,
    ].map((value) => String(value || "").trim()).filter((value, index, array) => value && array.indexOf(value) === index);
    if (mergedSandboxPaths.length) existing.sandboxPaths = mergedSandboxPaths;
    if (!existing.messageId && incoming.messageId) existing.messageId = incoming.messageId;
    if (incoming.sourceKind === "conversation-api" && existing.sourceKind !== "conversation-api") existing.sourceKind = incoming.sourceKind;
    return existing;
  }

  async function resolveAttachment(ref, context = {}) {
    if (!ref?.fileId && !ref?.sandboxPath && !(Array.isArray(ref?.sandboxPaths) && ref.sandboxPaths.length)) return ref;
    const conversationId = String(context.conversationId || ref.conversationId || getConversationId());
    let accessToken = String(context.accessToken || "");
    let accountId = String(context.accountId || "");
    if (!accessToken && !accountId) {
      const session = await getSession();
      accessToken = String(session?.accessToken || session?.access_token || "");
      accountId = accountIdFromSession(session);
    }
    return resolveFileInfo({ ...ref, conversationId }, { conversationId, accessToken, accountId });
  }

  async function collectAttachments(options = {}) {
    const conversationId = getConversationId();
    if (!conversationId) return { ok: false, conversationId: "", attachments: [], warning: tr("無法從網址取得聊天室 ID。", "The conversation ID could not be read from the URL.") };

    options.onProgress?.(tr("正在讀取聊天室結構化資料……", "Reading structured conversation data…"), { phase: "conversation-data", progress: 62 });
    const session = await getSession();
    const accessToken = String(session?.accessToken || session?.access_token || "");
    const accountId = accountIdFromSession(session);

    let conversationData;
    try {
      conversationData = await fetchConversationData(conversationId, accessToken, accountId);
    } catch (firstError) {
      if (accessToken) {
        try {
          conversationData = await fetchConversationData(conversationId, "", accountId);
        } catch (_) {
          return {
            ok: false,
            conversationId,
            accessToken,
            accountId,
            attachments: [],
            warning: tr("聊天室附件資料讀取失敗：{error}", "Failed to read conversation attachment data: {error}", { error: firstError?.message || tr("未知錯誤", "Unknown error") }),
          };
        }
      } else {
        return {
          ok: false,
          conversationId,
          accessToken: "",
          accountId,
          attachments: [],
          warning: tr("聊天室附件資料讀取失敗：{error}", "Failed to read conversation attachment data: {error}", { error: firstError?.message || tr("未知錯誤", "Unknown error") }),
        };
      }
    }

    const activeEntries = activeMessageEntries(conversationData);
    const messages = activeEntries.map((entry) => entry.message);
    const mapping = conversationData?.mapping || {};
    const activeNodeIds = new Set(activeEntries.map((entry) => String(entry.id || "")).filter(Boolean));
    const activeMessageIds = new Set(messages.map((message) => String(message?.id || "")).filter(Boolean));
    const scanMessages = [...messages];

    // Generated-file records can be stored in one or more hidden tool/system descendants
    // of the visible assistant turn. Walk only hidden descendants and stop before any
    // alternate visible user/assistant branch, so nested tool output is included safely.
    const hiddenQueue = [...activeNodeIds];
    const hiddenVisited = new Set(activeNodeIds);
    while (hiddenQueue.length) {
      const parentId = hiddenQueue.shift();
      const children = Array.isArray(mapping?.[parentId]?.children) ? mapping[parentId].children : [];
      for (const childIdValue of children) {
        const childId = String(childIdValue || "");
        if (!childId || hiddenVisited.has(childId)) continue;
        hiddenVisited.add(childId);
        const message = mapping?.[childId]?.message;
        if (!message) continue;
        const role = String(message?.author?.role || "");
        if (["user", "assistant"].includes(role)) continue;
        if (!activeMessageIds.has(String(message.id || childId))) scanMessages.push(message);
        hiddenQueue.push(childId);
      }
    }

    const deduped = [];
    const byIdentity = new Map();
    let appearance = 0;
    for (const message of scanMessages) {
      const refs = scanMessageForFileRefs(message, conversationId, appearance);
      for (const ref of refs) {
        const identities = [
          ref.fileId ? `file:${ref.fileId.toLowerCase()}` : "",
          ref.sandboxPath ? `sandbox:${String(ref.sandboxPath).toLowerCase()}` : "",
          ...(Array.isArray(ref.sandboxPaths)
            ? ref.sandboxPaths.map((path) => `sandbox:${String(path || "").toLowerCase()}`)
            : []),
        ].filter((value, index, array) => value && !value.endsWith(":") && array.indexOf(value) === index);
        if (!identities.length) continue;
        const existing = identities.map((identity) => byIdentity.get(identity)).find(Boolean);
        const target = existing ? mergeAttachment(existing, ref) : ref;
        if (!existing) deduped.push(target);
        const targetIdentities = [
          target.fileId ? `file:${target.fileId.toLowerCase()}` : "",
          target.sandboxPath ? `sandbox:${String(target.sandboxPath).toLowerCase()}` : "",
          ...(Array.isArray(target.sandboxPaths)
            ? target.sandboxPaths.map((path) => `sandbox:${String(path || "").toLowerCase()}`)
            : []),
        ].filter((value, index, array) => value && !value.endsWith(":") && array.indexOf(value) === index);
        targetIdentities.forEach((identity) => byIdentity.set(identity, target));
      }
      appearance += refs.length;
    }

    options.onProgress?.(tr("已從聊天室資料找到 {count} 個不重複檔案，正在解析下載網址……", "Found {count} unique files in the conversation data. Resolving download URLs…", { count: deduped.length }), { phase: "resolve-files", progress: 68, current: 0, total: deduped.length });
    const context = { conversationId, accessToken, accountId };
    let resolvedCount = 0;
    const resolved = await mapLimit(deduped, 3, async (ref) => {
      const value = await resolveFileInfo(ref, context);
      resolvedCount += 1;
      options.onProgress?.(tr("正在解析附件下載資訊：{current}/{total}", "Resolving attachment download information: {current}/{total}", { current: resolvedCount, total: deduped.length }), {
        phase: "resolve-files",
        progress: deduped.length ? 68 + (resolvedCount / deduped.length) * 18 : 86,
        current: resolvedCount,
        total: deduped.length,
      });
      return value;
    });

    const unresolvedCount = resolved.filter((item) => !item.metadataResolved).length;
    return {
      ok: true,
      conversationId,
      accessToken,
      accountId,
      conversationData,
      messageCount: messages.filter((message) => ["user", "assistant"].includes(String(message?.author?.role || ""))).length,
      attachments: resolved,
      warning: unresolvedCount
        ? tr("有 {count} 份附件尚未預先解析下載網址；建立 ZIP 時會再嘗試多種 ChatGPT 下載端點。", "{count} attachment(s) do not yet have a resolved download URL. Multiple ChatGPT endpoints will be tried while building the ZIP.", { count: unresolvedCount })
        : "",
    };
  }

  window.__CQS_CONVERSATION_API__ = Object.freeze({
    getConversationId,
    extractFileId,
    activeMessages,
    scanMessageForFileRefs,
    collectAttachments,
    resolveAttachment,
    fileInfoRequests,
  });
})();
