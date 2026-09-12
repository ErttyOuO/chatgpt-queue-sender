(() => {
  if (window.__CQS_RECENT_FILES__) return;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));
  const extensionApi = globalThis.browser || globalThis.chrome;
  const MAX_VISIBLE_FILES = 8;
  const TURN_SELECTOR = "[data-testid^='conversation-turn-'], article, [data-turn]";
  const state = {
    host: null,
    observer: null,
    refreshScheduled: false,
    resolving: new WeakMap(),
    resolved: new WeakMap(),
    lastRenderKey: "",
    timer: null,
    fallbackGenerationStartedAt: 0,
    downloadStates: new Map(),
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isRendered(element) {
    if (!element || !(element instanceof Element)) return false;
    try {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return element.getClientRects().length > 0;
    } catch (_) {
      return true;
    }
  }

  function cleanFilename(value) {
    return normalizeText(value)
      .replace(/^(?:下載|下载|download)\s*[:：-]?\s*/i, "")
      .replace(/[?#].*$/, "")
      .trim();
  }

  function fileExtension(value) {
    const name = cleanFilename(value).split(/[\\/]/).at(-1) || "";
    const match = name.match(/\.([A-Za-z0-9][A-Za-z0-9+_-]{0,11})$/);
    const extension = match?.[1]?.toLowerCase() || "";
    if (/^\d+$/.test(extension) && extension !== "7z") return "";
    return extension;
  }

  function iconExtension(button) {
    const key = String(button?.querySelector?.("svg[data-testid='library-file-icon']")?.getAttribute?.("data-library-file-icon-key") || "").toLowerCase();
    if (!key) return "";
    const known = {
      pdf: "pdf", zip: "zip", markdown: "md", md: "md", text: "txt",
      word: "docx", doc: "doc", docx: "docx", spreadsheet: "xlsx", xls: "xls", xlsx: "xlsx",
      powerpoint: "pptx", ppt: "ppt", pptx: "pptx", json: "json", csv: "csv",
      image: "img", audio: "audio", video: "video",
    };
    return known[key] || (/^[a-z0-9]{1,8}$/.test(key) ? key : "");
  }

  function labelExtension(value) {
    const direct = fileExtension(value);
    if (direct) return direct;
    const text = normalizeText(value).toLowerCase();
    const tokens = [
      "docx", "xlsx", "pptx", "markdown", "jpeg", "webp", "json", "yaml", "html",
      "pdf", "xpi", "crx", "zip", "rar", "7z", "doc", "xls", "ppt", "csv", "tsv",
      "md", "txt", "png", "jpg", "gif", "svg", "mp4", "mov", "webm", "mp3", "wav",
      "m4a", "py", "js", "ts", "css", "xml", "sql",
    ];
    for (const token of tokens) {
      const pattern = new RegExp(`(?:^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
      if (pattern.test(text)) return token === "markdown" ? "md" : token;
    }
    return "";
  }

  function isNativeDownloadButton(button) {
    if (!button || String(button.tagName || "").toUpperCase() !== "BUTTON") return false;
    if (button.matches?.("[data-cqs-direct-download='1']")) return false;
    const directApi = window.__CQS_DIRECT_DOWNLOAD__;
    if (directApi?.isLikelyFileButton?.(button)) return false;
    if (directApi?.isAssistantCitation?.(button) === false) return false;

    const label = normalizeText(
      button.getAttribute?.("aria-label")
      || button.getAttribute?.("title")
      || button.textContent
      || "",
    );
    if (!label || label.length > 220) return false;

    const ext = labelExtension(label);
    if (!ext) return false;

    let react = null;
    try {
      react = window.__CQS_CONVERSATION_EXPORT__?.inspectReactFileMetadata?.(button) || null;
    } catch (_) {}
    const hasReactFileIdentity = Boolean(
      react
      && (
        (react.fileIds || []).length
        || (react.urls || []).length
        || (react.sandboxPaths || []).length
        || (react.names || []).length
      )
    );
    if (hasReactFileIdentity) return true;

    return Boolean(
      fileExtension(label)
      || /(?:下載|下载|download|原始碼|源码|source|github|amo|firefox|完整|驗證|验证|報告|报告)/i.test(label)
    );
  }

  function collectNativeDownloadButtons(turn) {
    if (!turn?.querySelectorAll) return [];
    let buttons = [];
    try {
      buttons = [...turn.querySelectorAll("button")];
    } catch (_) {}
    return buttons.filter(isNativeDownloadButton);
  }

  function formatExtension(value, fallback = "") {
    const ext = fileExtension(value) || String(fallback || "").toLowerCase();
    if (!ext) return "FILE";
    const aliases = { jpeg: "JPG", markdown: "MD", docm: "DOCM", xlsm: "XLSM", pptm: "PPTM", img: "IMG" };
    return aliases[ext] || ext.toUpperCase().slice(0, 7);
  }

  function fileKind(extension) {
    const ext = String(extension || "").toLowerCase();
    if (ext === "pdf") return "pdf";
    if (["md", "markdown"].includes(ext)) return "markdown";
    if (["doc", "docx", "docm", "odt", "rtf"].includes(ext)) return "word";
    if (["xls", "xlsx", "xlsm", "ods", "csv", "tsv"].includes(ext)) return "spreadsheet";
    if (["ppt", "pptx", "pptm", "odp"].includes(ext)) return "presentation";
    if (["zip", "xpi", "crx", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"].includes(ext)) return "archive";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "heic", "img"].includes(ext)) return "image";
    if (["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "audio"].includes(ext)) return "audio";
    if (["mp4", "mov", "webm", "avi", "mkv", "mxf", "wmv", "video"].includes(ext)) return "video";
    if (["js", "mjs", "cjs", "ts", "jsx", "tsx", "py", "java", "cs", "cpp", "c", "h", "go", "rs", "rb", "php", "html", "css", "json", "yaml", "yml", "xml", "sql"].includes(ext)) return "code";
    if (["txt", "log", "ini", "cfg", "conf"].includes(ext)) return "text";
    return "default";
  }

  function fileAccent(kind) {
    const accents = {
      pdf: "#ff453a",
      markdown: "#f2f2f7",
      word: "#0a84ff",
      spreadsheet: "#30d158",
      presentation: "#ff9f0a",
      archive: "#bf5af2",
      image: "#ff375f",
      audio: "#64d2ff",
      video: "#5e5ce6",
      code: "#ffd60a",
      text: "#8e8e93",
      default: "#8e8e93",
    };
    return accents[kind] || accents.default;
  }

  function shortBaseName(name, max = 18) {
    const clean = cleanFilename(name);
    const ext = fileExtension(clean);
    const base = ext ? clean.slice(0, -(ext.length + 1)) : clean;
    if (!base) return tr("檔案", "File");
    if (base.length <= max) return base;
    const head = Math.max(6, Math.ceil((max - 1) * 0.65));
    const tail = Math.max(3, max - head - 1);
    return `${base.slice(0, head)}…${base.slice(-tail)}`;
  }

  function formatElapsed(ms) {
    const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function getLatestAssistantTurn() {
    let roleNodes = [];
    try {
      roleNodes = [...document.querySelectorAll("[data-message-author-role='assistant']")]
        .filter((node) => !node.closest?.("#cqs-export-control, #cqs-export-modal") && isRendered(node));
    } catch (_) {}
    const roleNode = roleNodes.at(-1) || null;
    return roleNode?.closest?.(TURN_SELECTOR) || roleNode;
  }

  function getGenerationStatus() {
    const status = window.__CQS_QUEUE_API__?.getGenerationStatus?.();
    if (status && typeof status === "object") return status;
    const generating = Boolean(window.__CQS_CONVERSATION_EXPORT__?.isGenerating?.());
    if (generating && !state.fallbackGenerationStartedAt) state.fallbackGenerationStartedAt = Date.now();
    if (!generating) state.fallbackGenerationStartedAt = 0;
    return { active: generating, startedAt: generating ? state.fallbackGenerationStartedAt : 0, assistantSeen: generating };
  }

  function imageFileId(value) {
    const raw = String(value || "");
    try {
      const url = new URL(raw, location.href || location.origin);
      const direct = normalizeText(url.searchParams.get("id"));
      if (/^(?:file|asset)[-_][A-Za-z0-9_-]{8,}$/i.test(direct)) return direct;
    } catch (_) {}
    return raw.match(/(?:file|asset)[-_][A-Za-z0-9_-]{8,}/i)?.[0] || "";
  }

  function isAllowedGeneratedImageUrl(value) {
    try {
      const url = new URL(String(value || ""), location.href || location.origin);
      if (url.protocol !== "https:") return false;
      const host = url.hostname.toLowerCase();
      const allowedHost = host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "oaiusercontent.com" || host.endsWith(".oaiusercontent.com");
      if (!allowedHost) return false;
      return /\/backend-api\/estuary\/content(?:$|\?)/i.test(url.pathname + url.search)
        || Boolean(imageFileId(url.href));
    } catch (_) {
      return false;
    }
  }

  function generatedImageName(image, fileId = "") {
    const alt = normalizeText(image?.getAttribute?.("alt") || image?.alt || "")
      .replace(/^(?:已產生圖像|已生成图像|generated image)\s*[:：-]?\s*/i, "")
      .trim();
    if (alt) return alt.slice(0, 180);
    const suffix = String(fileId || "").replace(/^(?:file|asset)[-_]/i, "").slice(-10);
    return suffix ? tr("生成圖片 {id}", "Generated image {id}", { id: suffix }) : tr("生成圖片", "Generated image");
  }

  function isGeneratedAssistantImage(image, turn = null) {
    if (!image || String(image.tagName || "").toUpperCase() !== "IMG" || !isRendered(image)) return false;
    const src = String(image.currentSrc || image.getAttribute?.("src") || "").trim();
    if (!isAllowedGeneratedImageUrl(src)) return false;
    const owner = turn || image.closest?.(TURN_SELECTOR);
    if (!owner) return false;
    const role = image.closest?.("[data-message-author-role]") || owner.querySelector?.("[data-message-author-role='assistant']");
    if (role?.getAttribute?.("data-message-author-role") && role.getAttribute("data-message-author-role") !== "assistant") return false;
    const alt = normalizeText(image.getAttribute?.("alt") || "");
    const width = Number(image.getAttribute?.("width") || image.naturalWidth || 0);
    const height = Number(image.getAttribute?.("height") || image.naturalHeight || 0);
    return /(?:已產生圖像|已生成图像|generated image)/i.test(alt) || (width >= 128 && height >= 128) || /estuary\/content/i.test(src);
  }

  function collectLatestImages(turn) {
    if (!turn?.querySelectorAll) return [];
    let images = [];
    try { images = [...turn.querySelectorAll("img[src]")]; } catch (_) {}
    return images.filter((image) => isGeneratedAssistantImage(image, turn));
  }

  function imageEntry(image) {
    const url = String(image?.currentSrc || image?.getAttribute?.("src") || "").trim();
    if (!url || !isAllowedGeneratedImageUrl(url)) return null;
    const fileId = imageFileId(url);
    return {
      image,
      name: generatedImageName(image, fileId),
      extension: "img",
      resolvable: true,
      nativeDownload: false,
      imageDownload: true,
      imageUrl: url,
      fileId,
      metadata: { fileId, url, sourceKind: "assistant-generated-image" },
    };
  }

  function entryIdentity(entry) {
    const fileId = normalizeText(entry?.metadata?.fileId || entry?.fileId || "").toLowerCase();
    if (fileId) return `id:${fileId}`;
    const url = normalizeText(entry?.imageUrl || entry?.metadata?.url || "");
    if (url) {
      try {
        const parsed = new URL(url, location.href || location.origin);
        const id = imageFileId(parsed.href);
        if (id) return `id:${id.toLowerCase()}`;
        return `url:${parsed.origin}${parsed.pathname}`;
      } catch (_) {}
    }
    return `name:${normalizeText(entry?.name || "").toLowerCase()}`;
  }

  function downloadStateFor(entry) {
    return state.downloadStates.get(entryIdentity(entry)) || { state: "idle", message: "" };
  }

  function setDownloadState(entry, nextState, message = "") {
    const key = entryIdentity(entry);
    if (nextState === "idle") state.downloadStates.delete(key);
    else state.downloadStates.set(key, { state: nextState, message: normalizeText(message), updatedAt: Date.now() });
    return key;
  }

  function clearDownloadStateLater(entry, expectedState, delayMs) {
    const key = entryIdentity(entry);
    setTimeout(() => {
      const current = state.downloadStates.get(key);
      if (!current || current.state !== expectedState) return;
      state.downloadStates.delete(key);
      scheduleRefresh(0);
    }, Math.max(0, Number(delayMs) || 0));
  }

  function downloadStatusMarkup(status) {
    if (status === "loading") {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.25" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="28 12"/></svg>';
    }
    if (status === "success") {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.2 3.1 3.1L15.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (status === "error") {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v7M10 14.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v7m0 0 2.6-2.6M10 11 7.4 8.4M5 14.5h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function applyChipDownloadState(chip, entry) {
    if (!chip) return;
    const current = downloadStateFor(entry);
    chip.dataset.cqsDownloadState = current.state;
    chip.setAttribute("aria-busy", current.state === "loading" ? "true" : "false");
    let node = chip.querySelector?.(".cqs-recent-file-status");
    if (!node) {
      node = document.createElement("span");
      node.className = "cqs-recent-file-status";
      node.setAttribute("aria-hidden", "true");
      chip.append(node);
    }
    node.dataset.cqsState = current.state;
    node.innerHTML = downloadStatusMarkup(current.state);
    node.title = current.message || "";
  }

  function dedupeEntries(entries) {
    const seen = new Set();
    const output = [];
    for (const entry of entries || []) {
      if (!entry) continue;
      const key = entryIdentity(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(entry);
    }
    return output;
  }

  function immediateEntry(button) {
    const api = window.__CQS_DIRECT_DOWNLOAD__;
    if (!api?.inspectButtonMetadata) return null;
    const metadata = api.inspectButtonMetadata(button) || {};
    if (metadata.ambiguous) return null;
    const name = cleanFilename(metadata.name || button?.getAttribute?.("aria-label") || button?.getAttribute?.("title") || button?.textContent || "");
    const nativeDownload = isNativeDownloadButton(button);
    const extension = fileExtension(name) || iconExtension(button) || labelExtension(name);
    return {
      button,
      name: name || tr("ChatGPT 檔案", "ChatGPT file"),
      extension,
      resolvable: nativeDownload || Boolean(metadata.hasIdentity),
      nativeDownload,
      metadata,
    };
  }

  async function resolveEntry(button) {
    if (!button) return null;
    if (state.resolved.has(button)) return state.resolved.get(button);
    if (state.resolving.has(button)) return state.resolving.get(button);

    const task = (async () => {
      const immediate = immediateEntry(button);
      if (!immediate) return null;
      if (fileExtension(immediate.name) || immediate.nativeDownload) {
        state.resolved.set(button, immediate);
        return immediate;
      }

      const directApi = window.__CQS_DIRECT_DOWNLOAD__;
      const conversationApi = window.__CQS_CONVERSATION_API__;
      if (!directApi?.buildDownloadReference || !conversationApi?.getDownloadContext) {
        state.resolved.set(button, immediate);
        return immediate;
      }

      try {
        const context = await conversationApi.getDownloadContext();
        const built = await directApi.buildDownloadReference(button, context);
        const resolvedName = cleanFilename(
          built?.ref?.resolvedFileName
          || built?.ref?.name
          || built?.metadata?.name
          || immediate.name,
        );
        const value = {
          ...immediate,
          name: resolvedName || immediate.name,
          extension: fileExtension(resolvedName) || immediate.extension,
          resolvable: Boolean(built?.ref),
        };
        state.resolved.set(button, value);
        return value;
      } catch (_) {
        state.resolved.set(button, immediate);
        return immediate;
      }
    })().finally(() => {
      state.resolving.delete(button);
    });
    state.resolving.set(button, task);
    return task;
  }

  function collectLatestButtons() {
    const generation = getGenerationStatus();
    if (generation.active && !generation.assistantSeen) return { generation, buttons: [], images: [] };
    const turn = getLatestAssistantTurn();
    const directApi = window.__CQS_DIRECT_DOWNLOAD__;
    const directButtons = turn && directApi?.collectCandidateButtons
      ? directApi.collectCandidateButtons(turn).filter((button) => directApi.isAssistantCitation?.(button) !== false)
      : [];
    const nativeButtons = turn ? collectNativeDownloadButtons(turn) : [];
    const buttons = [...new Set([...directButtons, ...nativeButtons])];
    const images = turn ? collectLatestImages(turn) : [];
    return { generation, buttons, images };
  }

  function ensureHost() {
    const control = document.getElementById("cqs-export-control");
    if (!control) return null;
    let host = control.querySelector("[data-cqs-recent-files-host='1']");
    if (!host) {
      host = document.createElement("div");
      host.className = "cqs-recent-activity";
      host.dataset.cqsRecentFilesHost = "1";
      host.hidden = true;
      const trigger = control.querySelector(".cqs-export-trigger");
      if (trigger?.nextSibling) control.insertBefore(host, trigger.nextSibling);
      else control.appendChild(host);
    }
    state.host = host;
    return host;
  }

  function renderTimer(host, generation) {
    const startedAt = Number(generation?.startedAt) || Date.now();
    const elapsed = formatElapsed(Date.now() - startedAt);
    host.hidden = false;
    host.dataset.cqsRecentMode = "timer";
    host.innerHTML = "";
    const timer = document.createElement("div");
    timer.className = "cqs-generation-timer";
    timer.title = tr("目前回覆生成時間", "Elapsed time for the current response");
    const dot = document.createElement("span");
    dot.className = "cqs-generation-timer-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "cqs-generation-timer-label";
    label.textContent = tr("生成中", "Generating");
    const time = document.createElement("time");
    time.className = "cqs-generation-timer-time";
    time.textContent = elapsed;
    timer.append(dot, label, time);
    host.append(timer);
  }

  async function triggerDownload(entry) {
    if (!entry) return { ok: false, message: tr("找不到下載項目。", "Download item not found.") };
    if (entry.imageDownload) {
      const conversationApi = window.__CQS_CONVERSATION_API__;
      if (!extensionApi?.runtime?.sendMessage) {
        return { ok: false, message: tr("Firefox 下載元件尚未準備完成。", "Firefox download support is not ready.") };
      }
      try {
        const context = await conversationApi?.getDownloadContext?.() || {
          conversationId: conversationApi?.getConversationId?.() || "",
          accessToken: "",
          accountId: "",
        };
        const safeBase = normalizeText(entry.name || tr("生成圖片", "Generated image"))
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
          .slice(0, 90) || "ChatGPT-image";
        const filename = `${safeBase}.png`;
        const response = await extensionApi.runtime.sendMessage({
          type: "CQS_DIRECT_DOWNLOAD",
          url: entry.imageUrl || "",
          filename,
          fileId: entry.fileId || imageFileId(entry.imageUrl),
          conversationId: context.conversationId || conversationApi?.getConversationId?.() || "",
          messageId: "",
          role: "assistant",
          accessToken: context.accessToken || "",
          accountId: context.accountId || "",
          origin: location.origin,
        });
        const message = response?.ok
          ? tr("已交給 Firefox 下載：{name}", "Handed to Firefox: {name}", { name: response.filename || filename })
          : tr("圖片下載失敗：{error}", "Image download failed: {error}", { error: response?.message || tr("未知錯誤", "Unknown error") });
        document.dispatchEvent(new CustomEvent("cqs:direct-download-status", {
          detail: { message, kind: response?.ok ? "success" : "error" },
        }));
        return { ok: Boolean(response?.ok), filename: response?.filename || filename, message, downloadId: response?.downloadId };
      } catch (error) {
        const message = tr("圖片下載失敗：{error}", "Image download failed: {error}", { error: error?.message || tr("未知錯誤", "Unknown error") });
        document.dispatchEvent(new CustomEvent("cqs:direct-download-status", {
          detail: { message, kind: "error" },
        }));
        return { ok: false, message };
      }
    }
    if (!entry.button) return { ok: false, message: tr("找不到原始檔案按鈕。", "Original file button not found.") };
    if (entry.nativeDownload) {
      if (entry.button.disabled) return { ok: false, message: tr("ChatGPT 原生下載按鈕目前不可用。", "ChatGPT's native download button is currently unavailable.") };
      try {
        entry.button.click();
        const message = tr("已交給 ChatGPT 原生下載：{name}", "Handed to ChatGPT native download: {name}", { name: entry.name });
        try {
          document.dispatchEvent(new CustomEvent("cqs:direct-download-status", {
            detail: { message, kind: "success" },
          }));
        } catch (_) {}
        return {
          ok: true,
          native: true,
          filename: entry.name,
          message,
        };
      } catch (error) {
        return { ok: false, message: error?.message || tr("無法觸發 ChatGPT 原生下載。", "Could not trigger ChatGPT's native download.") };
      }
    }
    const directApi = window.__CQS_DIRECT_DOWNLOAD__;
    if (!directApi?.requestDirectDownload) {
      return { ok: false, message: tr("直接下載元件尚未準備完成。", "Direct download is not ready.") };
    }
    return directApi.requestDirectDownload(entry.button, null);
  }

  function renderFiles(host, entries, totalCount) {
    host.hidden = false;
    host.dataset.cqsRecentMode = "files";
    host.innerHTML = "";

    const strip = document.createElement("div");
    strip.className = "cqs-recent-file-strip";
    strip.setAttribute("role", "list");
    strip.setAttribute("aria-label", tr("最新偵測到的下載檔案", "Latest detected downloadable files"));

    for (const entry of entries.slice(-MAX_VISIBLE_FILES)) {
      const ext = entry.extension || fileExtension(entry.name);
      const label = formatExtension(entry.name, ext);
      const kind = fileKind(ext);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cqs-recent-file-chip";
      chip.dataset.cqsFileKind = kind;
      chip.style.setProperty("--cqs-file-accent", fileAccent(kind));
      chip.title = entry.nativeDownload
        ? tr("使用 ChatGPT 原生下載：{name}", "Use ChatGPT native download: {name}", { name: entry.name })
        : entry.imageDownload
          ? tr("下載生成圖片：{name}", "Download generated image: {name}", { name: entry.name })
          : tr("直接下載 {name}", "Download {name}", { name: entry.name });
      chip.setAttribute("aria-label", chip.title);
      chip.setAttribute("role", "listitem");
      chip.disabled = !entry.nativeDownload && !entry.imageDownload && !entry.resolvable && !window.__CQS_DIRECT_DOWNLOAD__?.buildDownloadReference;

      const extNode = document.createElement("span");
      extNode.className = "cqs-recent-file-ext";
      extNode.textContent = label;
      const nameNode = document.createElement("span");
      nameNode.className = "cqs-recent-file-name";
      nameNode.textContent = shortBaseName(entry.name);
      chip.append(extNode, nameNode);
      applyChipDownloadState(chip, entry);
      chip.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (downloadStateFor(entry).state === "loading") return;

        const startedAt = Date.now();
        setDownloadState(entry, "loading", tr("正在準備下載…", "Preparing download…"));
        applyChipDownloadState(chip, entry);
        try {
          const result = await triggerDownload(entry);
          const minimumSpinnerMs = 520;
          const remaining = minimumSpinnerMs - (Date.now() - startedAt);
          if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
          if (result?.ok) {
            const message = result.message || tr("已交給 Firefox 下載。", "Handed to Firefox download manager.");
            setDownloadState(entry, "success", message);
            applyChipDownloadState(chip, entry);
            clearDownloadStateLater(entry, "success", result.native ? 1800 : 2600);
          } else {
            const message = result?.message || tr("下載失敗。", "Download failed.");
            setDownloadState(entry, "error", message);
            applyChipDownloadState(chip, entry);
            clearDownloadStateLater(entry, "error", 6200);
          }
        } catch (error) {
          const message = error?.message || tr("下載失敗。", "Download failed.");
          setDownloadState(entry, "error", message);
          applyChipDownloadState(chip, entry);
          clearDownloadStateLater(entry, "error", 6200);
        }
      });
      strip.append(chip);
    }

    if (totalCount > MAX_VISIBLE_FILES) {
      const more = document.createElement("span");
      more.className = "cqs-recent-file-more";
      more.textContent = `+${totalCount - MAX_VISIBLE_FILES}`;
      more.title = tr("還有 {count} 個檔案，可在對話中直接下載。", "{count} more files are available in the conversation.", { count: totalCount - MAX_VISIBLE_FILES });
      strip.append(more);
    }
    host.append(strip);
  }

  function hideHost(host) {
    host.hidden = true;
    host.innerHTML = "";
    delete host.dataset.cqsRecentMode;
  }

  async function refresh() {
    const host = ensureHost();
    if (!host) return;
    const { generation, buttons, images = [] } = collectLatestButtons();

    const imageEntries = images.map(imageEntry).filter(Boolean);
    const immediate = dedupeEntries([
      ...buttons.map(immediateEntry).filter(Boolean),
      ...imageEntries,
    ]);
    const hasImmediate = immediate.length > 0;
    if (hasImmediate) {
      renderFiles(host, immediate, immediate.length);
    } else if (generation.active) {
      renderTimer(host, generation);
    } else {
      hideHost(host);
    }

    if (!buttons.length) return;
    const resolvedButtons = (await Promise.all(buttons.map(resolveEntry))).filter(Boolean);
    const still = collectLatestButtons();
    if (still.buttons.length !== buttons.length || still.buttons.some((button, index) => button !== buttons[index])) return;
    if ((still.images || []).length !== images.length || (still.images || []).some((image, index) => image !== images[index])) return;
    const resolved = dedupeEntries([...resolvedButtons, ...imageEntries]);
    renderFiles(host, resolved, resolved.length);
  }

  function scheduleRefresh(delay = 90) {
    if (state.refreshScheduled) return;
    state.refreshScheduled = true;
    setTimeout(() => {
      state.refreshScheduled = false;
      void refresh();
    }, delay);
  }

  function start() {
    ensureHost();
    scheduleRefresh(0);
    if (typeof MutationObserver === "function" && document.documentElement) {
      state.observer = new MutationObserver((mutations) => {
        if (mutations.every((mutation) => mutation.target?.closest?.("#cqs-export-control, #cqs-export-modal"))) return;
        scheduleRefresh(120);
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy", "data-is-streaming", "data-state", "data-status", "aria-label", "title"] });
    }
    state.timer = setInterval(() => {
      const host = ensureHost();
      const generation = getGenerationStatus();
      if (host?.dataset.cqsRecentMode === "timer" && generation.active) renderTimer(host, generation);
      else scheduleRefresh(0);
    }, 1000);
    document.addEventListener("cqs:export-control-ready", () => scheduleRefresh(0));
    document.addEventListener("cqs:direct-download-status", () => scheduleRefresh(80));
  }

  window.__CQS_RECENT_FILES__ = Object.freeze({
    cleanFilename,
    fileExtension,
    labelExtension,
    isNativeDownloadButton,
    collectNativeDownloadButtons,
    formatExtension,
    fileKind,
    fileAccent,
    shortBaseName,
    formatElapsed,
    getLatestAssistantTurn,
    getGenerationStatus,
    imageFileId,
    isAllowedGeneratedImageUrl,
    isGeneratedAssistantImage,
    collectLatestImages,
    imageEntry,
    dedupeEntries,
    collectLatestButtons,
    immediateEntry,
    triggerDownload,
    resolveEntry,
    ensureHost,
    refresh,
    stop() {
      state.observer?.disconnect?.();
      state.observer = null;
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
    },
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
