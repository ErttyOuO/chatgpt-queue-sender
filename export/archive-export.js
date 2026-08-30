(() => {
  if (window.__CQS_ARCHIVE_EXPORT__) return;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));
  const locale = globalThis.CQS_I18N?.locale || "zh-TW";
  const ARCHIVE_CANCELLED_ZH = "使用者取消封存。";
  const ARCHIVE_CANCELLED_EN = "Archive cancelled by the user.";
  const EXPORT_CANCELLED_ZH = "使用者取消匯出。";
  const EXPORT_CANCELLED_EN = "Export cancelled by the user.";
  const archiveCancelled = () => tr(ARCHIVE_CANCELLED_ZH, ARCHIVE_CANCELLED_EN);
  const isArchiveCancelled = (error) => [ARCHIVE_CANCELLED_ZH, ARCHIVE_CANCELLED_EN, EXPORT_CANCELLED_ZH, EXPORT_CANCELLED_EN].includes(String(error?.message || error || ""));

  const SINGLE_FILE_WARNING_BYTES = 100 * 1024 * 1024;
  const TOTAL_ARCHIVE_WARNING_BYTES = 500 * 1024 * 1024;
  const ZIP32_MAX_BYTES = 0xffffffff;

  const state = {
    running: false,
    cancelRequested: false,
    activeController: null,
    plannedItems: [],
    markdown: "",
    conversationTitle: "",
    complete: false,
    turnsCount: 0,
    structuredContext: null,
    attachmentScanWarning: "",
    unresolvedItems: [],
  };

  function api() {
    return window.__CQS_CONVERSATION_EXPORT__;
  }

  function createElement(tag, options = {}) {
    return api()?.createElement?.(tag, options) || document.createElement(tag);
  }

  function normalizeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function safePart(value, fallback = tr("檔案", "File")) {
    return normalizeText(value)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 150) || fallback;
  }

  function splitFilename(filename) {
    const clean = safePart(filename, "file");
    const match = /^(.*?)(\.[^.]{1,12})$/.exec(clean);
    return match ? { stem: match[1], extension: match[2].toLowerCase() } : { stem: clean, extension: "" };
  }

  function compareVersionArrays(a = [], b = []) {
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const av = Number(a[i] || 0);
      const bv = Number(b[i] || 0);
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  function parseVersionInfo(filename, appearanceIndex = 0) {
    const { stem, extension } = splitFilename(filename);
    let working = stem.normalize("NFKC");
    const lower = working.toLowerCase();
    let version = [];
    let explicitVersion = false;
    let versionMatch = null;

    const prefixedPatterns = [
      /(?:^|[\s._(-])v(?:er(?:sion)?)?[\s._-]*(\d+(?:[._-]\d+){0,4})(?=$|[\s._()-])/i,
      /(?:^|[\s_-])(\d+\.\d+(?:\.\d+){0,3})(?=$|[\s_()-])/i,
      /(?:^|[\s._(-])第[\s._-]*(\d+(?:[._-]\d+){0,3})[\s._-]*版(?=$|[\s._()-])/i,
    ];
    for (const pattern of prefixedPatterns) {
      const match = pattern.exec(working);
      if (match) {
        versionMatch = match;
        version = match[1].split(/[._-]/).map((part) => Number(part)).filter(Number.isFinite);
        explicitVersion = version.length > 0;
        break;
      }
    }

    if (versionMatch) working = `${working.slice(0, versionMatch.index)} ${working.slice(versionMatch.index + versionMatch[0].length)}`;

    let semanticRank = 0;
    const semanticRules = [
      { pattern: /(最終版?|定稿版?|final(?:ized)?)/ig, rank: 50 },
      { pattern: /(最新版?|最新|latest)/ig, rank: 40 },
      { pattern: /(修正版?|修改版?|更新版?|updated?|revision|rev)/ig, rank: 30 },
      { pattern: /(完成版?|complete)/ig, rank: 20 },
      { pattern: /(草稿版?|draft)/ig, rank: 5 },
    ];
    for (const rule of semanticRules) {
      if (rule.pattern.test(working)) semanticRank = Math.max(semanticRank, rule.rank);
      rule.pattern.lastIndex = 0;
      working = working.replace(rule.pattern, " ");
    }

    let copyIndex = 0;
    const copyMatch = /(?:[\s._-]*\((\d+)\)|[\s._-]+copy[\s._-]*(\d+)|[\s._-]+副本[\s._-]*(\d+)?)$/i.exec(working);
    if (copyMatch) {
      copyIndex = Number(copyMatch[1] || copyMatch[2] || copyMatch[3] || 1);
      working = working.slice(0, copyMatch.index);
    } else if (!explicitVersion) {
      const trailing = /(?:^|[\s._-])(\d+)$/.exec(working);
      if (trailing) {
        copyIndex = Number(trailing[1]);
        working = working.slice(0, trailing.index);
      }
    }

    const groupStem = working
      .toLowerCase()
      .replace(/[\s._-]+/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim() || lower.replace(/[^\p{L}\p{N}]+/gu, " ").trim() || "file";

    return {
      groupStem,
      extension,
      version,
      explicitVersion,
      semanticRank,
      copyIndex,
      appearanceIndex,
    };
  }

  function compareCandidates(a, b) {
    const versionCompare = compareVersionArrays(a.versionInfo.version, b.versionInfo.version);
    if (versionCompare !== 0) return versionCompare;
    if (a.versionInfo.explicitVersion !== b.versionInfo.explicitVersion) return a.versionInfo.explicitVersion ? 1 : -1;
    if (a.versionInfo.semanticRank !== b.versionInfo.semanticRank) return a.versionInfo.semanticRank - b.versionInfo.semanticRank;
    if (a.versionInfo.copyIndex !== b.versionInfo.copyIndex) return a.versionInfo.copyIndex - b.versionInfo.copyIndex;
    return a.appearanceIndex - b.appearanceIndex;
  }

  function flattenCandidates(turns, extraAttachments = []) {
    const candidates = [];
    const exactSeen = new Map();
    let appearanceIndex = 0;

    const sources = [];
    turns.forEach((turn, turnIndex) => {
      for (const attachment of turn.attachments || []) sources.push({ attachment, turnIndex });
    });
    for (const attachment of extraAttachments || []) sources.push({ attachment, turnIndex: Number(attachment?.appearanceIndex || 0) });

    for (const { attachment, turnIndex } of sources) {
      if (!attachment) continue;
      // Ordinary external links (citations, GitHub, papers, websites) are not archive attachments.
      // Keep only ChatGPT attachment-card clues, visible file controls, or structured file records.
      if (attachment.sourceKind === "external-link" && !attachment.fileId) continue;
      const name = safePart(attachment.name, attachment.fileId || `attachment-${appearanceIndex + 1}`);
      const role = attachment.role === "user" ? "user" : "assistant";
      const url = String(attachment.url || attachment.resolvedDownloadUrl || "").trim();
      const fileId = String(attachment.fileId || "").trim();
      const sandboxPaths = [attachment.sandboxPath, ...(Array.isArray(attachment.sandboxPaths) ? attachment.sandboxPaths : [])]
        .map((value) => String(value || "").trim())
        .filter((value, index, array) => value && array.indexOf(value) === index);
      const messageId = String(attachment.messageId || "");
      const hasInterpreterSource = Boolean(messageId && sandboxPaths.length);
      const resolvable = Boolean(fileId || url || hasInterpreterSource) && Boolean(attachment.downloadable !== false || fileId || hasInterpreterSource);
      const sourceRank = fileId ? 4 : (hasInterpreterSource ? 3 : (url ? 2 : 1));
      // A file ID represents one physical attachment. Deduplicate it globally rather than
      // once per role; the same file can be echoed in later assistant metadata and was
      // previously archived twice under both source folders.
      const exactKey = fileId
        ? `file:${fileId.toLowerCase()}`
        : `${role}|name:${name.toLowerCase()}|url:${url}`;
      const item = {
        id: `cqs-archive-${appearanceIndex}`,
        name,
        role,
        url,
        fileId,
        conversationId: String(attachment.conversationId || state.structuredContext?.conversationId || ""),
        messageId,
        sandboxPath: sandboxPaths[0] || "",
        sandboxPaths,
        resolutionStrategy: String(attachment.resolutionStrategy || ""),
        resolutionFailures: Array.isArray(attachment.resolutionFailures) ? [...attachment.resolutionFailures] : [],
        type: attachment.type || tr("檔案", "File"),
        sourceKind: attachment.sourceKind || "attachment",
        sizeHint: Number.isFinite(attachment.sizeHint) ? attachment.sizeHint : null,
        appearanceIndex,
        turnIndex,
        defaultSelected: resolvable,
        selected: resolvable,
        exclusionReason: resolvable ? "" : tr("只有檔名或畫面按鈕，尚未取得可下載識別碼", "Only a filename or page button was found; no downloadable identifier is available"),
        unresolved: !resolvable,
        sourceRank,
        versionInfo: parseVersionInfo(name, appearanceIndex),
      };
      appearanceIndex += 1;

      const previous = exactSeen.get(exactKey);
      if (previous && fileId) {
        // Keep the first chronological role as the source folder, but merge more reliable
        // metadata and a resolved URL from later DOM/API observations.
        if ((!previous.name || previous.name === previous.fileId || /\.bin$/i.test(previous.name)) && item.name) {
          previous.name = item.name;
          previous.versionInfo = parseVersionInfo(previous.name, previous.appearanceIndex);
        }
        if (!previous.url && item.url) previous.url = item.url;
        if (!previous.messageId && item.messageId) previous.messageId = item.messageId;
        if (!previous.sandboxPath && item.sandboxPath) previous.sandboxPath = item.sandboxPath;
        const mergedSandboxPaths = [
          ...(Array.isArray(previous.sandboxPaths) ? previous.sandboxPaths : []),
          previous.sandboxPath,
          ...(Array.isArray(item.sandboxPaths) ? item.sandboxPaths : []),
          item.sandboxPath,
        ].map((value) => String(value || "").trim()).filter((value, index, array) => value && array.indexOf(value) === index);
        if (mergedSandboxPaths.length) previous.sandboxPaths = mergedSandboxPaths;
        if (!Number.isFinite(previous.sizeHint) && Number.isFinite(item.sizeHint)) previous.sizeHint = item.sizeHint;
        if (item.sourceRank > previous.sourceRank) {
          previous.sourceRank = item.sourceRank;
          previous.sourceKind = item.sourceKind;
        }
        if (!previous.resolutionStrategy && item.resolutionStrategy) previous.resolutionStrategy = item.resolutionStrategy;
        if (!previous.resolutionFailures.length && item.resolutionFailures.length) previous.resolutionFailures = item.resolutionFailures;
        previous.defaultSelected = Boolean(previous.fileId || previous.url);
        previous.selected = previous.defaultSelected;
        previous.unresolved = !previous.defaultSelected;
        continue;
      }
      if (previous) {
        if (item.sourceRank > previous.sourceRank) {
          previous.defaultSelected = false;
          previous.selected = false;
          previous.exclusionReason = tr("已由較可靠的聊天室檔案資料取代：{name}", "Replaced by more reliable conversation file data: {name}", { name: item.name });
          previous.unresolved = true;
        } else {
          item.defaultSelected = false;
          item.selected = false;
          item.exclusionReason = tr("聊天室後方再次出現相同檔案", "The same file appeared again later in the conversation");
        }
      }
      exactSeen.set(exactKey, item);
      candidates.push(item);
    }

    // DOM 常只能看見檔名，結構化聊天室資料則可提供 file ID。相同角色與檔名時保留較可靠來源。
    const byName = new Map();
    for (const item of candidates) {
      const key = `${item.role}|${item.name.toLowerCase()}`;
      const current = byName.get(key);
      if (!current || item.sourceRank > current.sourceRank || (item.sourceRank === current.sourceRank && item.appearanceIndex > current.appearanceIndex)) {
        byName.set(key, item);
      }
    }
    for (const item of candidates) {
      const winner = byName.get(`${item.role}|${item.name.toLowerCase()}`);
      if (winner && winner !== item && winner.sourceRank > item.sourceRank) {
        item.defaultSelected = false;
        item.selected = false;
        item.unresolved = true;
        item.exclusionReason = tr("已由可下載的檔案資料取代：{name}", "Replaced by downloadable file data: {name}", { name: winner.name });
      }
    }

    const groups = new Map();
    for (const item of candidates.filter((candidate) => !candidate.unresolved)) {
      const key = `${item.role}|${item.versionInfo.groupStem}|${item.versionInfo.extension}`;
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const winner = [...group].sort(compareCandidates).at(-1);
      for (const item of group) {
        if (item === winner) continue;
        item.defaultSelected = false;
        item.selected = false;
        item.exclusionReason = tr("較舊版本；預設保留 {name}", "Older version; {name} is selected by default", { name: winner.name });
      }
    }
    return candidates;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return tr("大小未知", "Unknown size");
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = -1;
    do {
      value /= 1024;
      index += 1;
    } while (value >= 1024 && index < units.length - 1);
    return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[index]}`;
  }

  function getPlanSummary(items) {
    const selected = items.filter((item) => item.selected);
    const userCount = selected.filter((item) => item.role === "user").length;
    const assistantCount = selected.filter((item) => item.role === "assistant").length;
    const excludedCount = items.filter((item) => !item.selected && item.exclusionReason && !item.unresolved).length;
    const unresolvedCount = items.filter((item) => item.unresolved).length;
    const knownSize = selected.reduce((sum, item) => sum + (Number.isFinite(item.sizeHint) ? item.sizeHint : 0), 0);
    const unknownCount = selected.filter((item) => !Number.isFinite(item.sizeHint)).length;
    return { selected, userCount, assistantCount, excludedCount, unresolvedCount, knownSize, unknownCount };
  }

  function makeSummaryGrid(items) {
    const grid = createElement("div", { className: "cqs-archive-summary-grid" });
    const fields = [
      ["Markdown", tr("1 份", "1 file")],
      [tr("使用者上傳", "User uploads"), tr("0 份", "0 files"), "user"],
      [tr("ChatGPT 提供", "Provided by ChatGPT"), tr("0 份", "0 files"), "assistant"],
      [tr("排除較舊版本", "Older versions excluded"), tr("0 份", "0 files"), "excluded"],
      [tr("無法解析", "Unresolved"), tr("0 份", "0 files"), "unresolved"],
      [tr("預估大小", "Estimated size"), tr("待確認", "Pending"), "size"],
    ];
    for (const [label, value, key] of fields) {
      const cell = createElement("div", { className: "cqs-archive-summary-cell" });
      cell.append(createElement("span", { text: label }), createElement("strong", { text: value }));
      if (key) cell.dataset.cqsArchiveSummary = key;
      grid.append(cell);
    }
    updateSummaryGrid(grid, items);
    return grid;
  }

  function updateSummaryGrid(grid, items) {
    const summary = getPlanSummary(items);
    const set = (key, value) => {
      const target = grid.querySelector(`[data-cqs-archive-summary='${key}'] strong`);
      if (target) target.textContent = value;
    };
    set("user", tr("{count} 份", "{count} files", { count: summary.userCount }));
    set("assistant", tr("{count} 份", "{count} files", { count: summary.assistantCount }));
    set("excluded", tr("{count} 份", "{count} files", { count: summary.excludedCount }));
    set("unresolved", tr("{count} 份", "{count} files", { count: summary.unresolvedCount }));
    const sizeText = summary.unknownCount
      ? tr("{known}{count} 份未知", "{known}{count} unknown", { known: summary.knownSize ? `${formatBytes(summary.knownSize)} + ` : "", count: summary.unknownCount })
      : formatBytes(summary.knownSize);
    set("size", sizeText);
  }

  function makeFileList(items, summaryGrid) {
    const wrapper = createElement("div", { className: "cqs-archive-file-area" });
    const toolbar = createElement("div", { className: "cqs-archive-file-toolbar" });
    toolbar.append(createElement("strong", { text: tr("查看與調整檔案", "Review and adjust files") }));
    const controls = createElement("div");
    const selectAll = createElement("button", { type: "button", text: tr("全選", "Select all") });
    const applyLatest = createElement("button", { type: "button", text: tr("只選最新版本", "Select latest versions only") });
    controls.append(selectAll, applyLatest);
    toolbar.append(controls);

    const list = createElement("div", { className: "cqs-archive-file-list" });
    const sync = () => {
      for (const input of list.querySelectorAll("input[type='checkbox'][data-cqs-archive-id]")) {
        const item = items.find((candidate) => candidate.id === input.dataset.cqsArchiveId);
        if (item) item.selected = input.checked;
      }
      updateSummaryGrid(summaryGrid, items);
    };

    for (const item of items) {
      const row = createElement("label", { className: "cqs-archive-file-row" });
      if (!item.defaultSelected) row.classList.add("cqs-archive-file-row-excluded");
      const checkbox = createElement("input", { type: "checkbox", attrs: { "data-cqs-archive-id": item.id } });
      checkbox.checked = item.selected;
      checkbox.disabled = Boolean(item.unresolved);
      checkbox.addEventListener("change", sync);
      const copy = createElement("span", { className: "cqs-archive-file-copy" });
      copy.append(createElement("strong", { text: item.name }));
      const meta = [item.role === "user" ? tr("使用者上傳", "User upload") : tr("ChatGPT 提供", "Provided by ChatGPT"), item.type];
      if (Number.isFinite(item.sizeHint)) meta.push(formatBytes(item.sizeHint));
      copy.append(createElement("small", { text: meta.join("・") }));
      if (item.exclusionReason) copy.append(createElement("em", { text: item.exclusionReason }));
      if (item.fileId) copy.append(createElement("small", { text: tr("檔案識別碼：{id}", "File ID: {id}", { id: item.fileId }) }));
      else if (item.sandboxPath) copy.append(createElement("small", { text: tr("ChatGPT 產生檔案路徑：{path}", "ChatGPT generated-file path: {path}", { path: item.sandboxPath }) }));
      row.append(checkbox, copy);
      list.append(row);
    }

    if (!items.length) list.append(createElement("p", { className: "cqs-archive-empty", text: tr("目前沒有偵測到可下載的附件；仍可建立只含 Markdown 與匯出報告的 ZIP。", "No downloadable attachments were detected. You can still create a ZIP containing only the Markdown and export report.") }));

    selectAll.addEventListener("click", () => {
      for (const input of list.querySelectorAll("input[type='checkbox']")) if (!input.disabled) input.checked = true;
      sync();
    });
    applyLatest.addEventListener("click", () => {
      for (const input of list.querySelectorAll("input[type='checkbox'][data-cqs-archive-id]")) {
        const item = items.find((candidate) => candidate.id === input.dataset.cqsArchiveId);
        input.checked = Boolean(item?.defaultSelected && !item?.unresolved);
      }
      sync();
    });

    wrapper.append(toolbar, list);
    return wrapper;
  }

  function contentDispositionFilename(value) {
    const text = String(value || "");
    const utf = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(text);
    if (utf) {
      try { return decodeURIComponent(utf[1].trim().replace(/^"|"$/g, "")); } catch (_) {}
    }
    const basic = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(text);
    return safePart((basic?.[1] || basic?.[2] || "").trim(), "");
  }

  function extensionForContentType(value) {
    const mime = String(value || "").split(";", 1)[0].trim().toLowerCase();
    const mapping = {
      "application/zip": ".zip",
      "application/x-zip-compressed": ".zip",
      "application/x-xpinstall": ".xpi",
      "text/markdown": ".md",
      "text/plain": ".txt",
      "application/pdf": ".pdf",
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "audio/mp4": ".m4a",
      "audio/mpeg": ".mp3",
      "audio/wav": ".wav",
      "video/mp4": ".mp4",
      "application/json": ".json",
    };
    return mapping[mime] || "";
  }

  function improveDownloadedFilename(value, contentType, fallback) {
    let name = safePart(value, safePart(fallback, "attachment"));
    const expected = extensionForContentType(contentType);
    if (!expected) return name;
    const current = splitFilename(name).extension;
    if (!current) return `${name}${expected}`;
    if (current === ".bin" || current === ".dat") return `${name.slice(0, -current.length)}${expected}`;
    return name;
  }

  function isHtmlInsteadOfFile(response, item) {
    const type = String(response.headers?.get?.("content-type") || "").toLowerCase();
    const extension = splitFilename(item.name).extension;
    return type.includes("text/html") && ![".html", ".htm"].includes(extension);
  }

  function checkHeaderWarnings(item, contentLength, warningState, cancelDownload) {
    const headerSize = Number(contentLength);
    if (Number.isFinite(headerSize) && headerSize > SINGLE_FILE_WARNING_BYTES && !warningState.singleApproved.has(item.id)) {
      const proceed = window.confirm(tr("「{name}」約 {size}，超過 100 MB。仍要下載並放入 ZIP 嗎？", "“{name}” is approximately {size}, which exceeds 100 MB. Download and include it in the ZIP?", { name: item.name, size: formatBytes(headerSize) }));
      if (!proceed) {
        cancelDownload?.();
        return { skipped: true, reason: tr("使用者略過超過 100 MB 的檔案", "The user skipped a file larger than 100 MB") };
      }
      warningState.singleApproved.add(item.id);
    }
    if (Number.isFinite(headerSize) && warningState.totalBytes + headerSize > TOTAL_ARCHIVE_WARNING_BYTES && !warningState.totalApproved) {
      const proceed = window.confirm(tr("加入「{name}」後，封存內容預估會超過 500 MB。仍要繼續嗎？", "Including “{name}” is expected to make the archive larger than 500 MB. Continue?", { name: item.name }));
      if (!proceed) {
        cancelDownload?.();
        throw new Error(archiveCancelled());
      }
      warningState.totalApproved = true;
    }
    return null;
  }

  function finalizeDownloadedBlob(item, blob, warningState) {
    if (blob.size > SINGLE_FILE_WARNING_BYTES && !warningState.singleApproved.has(item.id)) {
      const proceed = window.confirm(tr("「{name}」實際大小為 {size}，超過 100 MB。仍要放入 ZIP 嗎？", "“{name}” is actually {size}, which exceeds 100 MB. Include it in the ZIP?", { name: item.name, size: formatBytes(blob.size) }));
      if (!proceed) return { skipped: true, reason: tr("使用者略過超過 100 MB 的檔案", "The user skipped a file larger than 100 MB") };
      warningState.singleApproved.add(item.id);
    }
    if (warningState.totalBytes + blob.size > TOTAL_ARCHIVE_WARNING_BYTES && !warningState.totalApproved) {
      const proceed = window.confirm(tr("目前封存內容會超過 500 MB。仍要繼續建立 ZIP 嗎？", "The archive will exceed 500 MB. Continue creating the ZIP?"));
      if (!proceed) throw new Error(archiveCancelled());
      warningState.totalApproved = true;
    }
    warningState.totalBytes += blob.size;
    return null;
  }

  async function fetchLocalFile(item, progress, warningState) {
    const controller = new AbortController();
    state.activeController = controller;
    progress(tr("正在下載：{name}", "Downloading: {name}", { name: item.name }));
    let response;
    try {
      response = await fetch(item.url, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      state.activeController = null;
      if (state.cancelRequested || error?.name === "AbortError") throw new Error(archiveCancelled());
      throw new Error(tr("下載連線失敗：{error}", "Download connection failed: {error}", { error: error?.message || tr("未知錯誤", "Unknown error") }));
    }

    if (!response.ok) {
      state.activeController = null;
      throw new Error(tr("伺服器回傳 HTTP {status}", "Server returned HTTP {status}", { status: response.status }));
    }
    if (isHtmlInsteadOfFile(response, item)) {
      controller.abort();
      state.activeController = null;
      throw new Error(tr("取得的是登入或網頁內容，而不是實際檔案", "The response was a login or web page instead of the actual file"));
    }

    const headerResult = checkHeaderWarnings(item, response.headers?.get?.("content-length"), warningState, () => controller.abort());
    if (headerResult?.skipped) {
      state.activeController = null;
      return headerResult;
    }

    let blob;
    try {
      blob = await response.blob();
    } catch (error) {
      state.activeController = null;
      if (state.cancelRequested || error?.name === "AbortError") throw new Error(archiveCancelled());
      throw new Error(tr("讀取檔案內容失敗：{error}", "Failed to read file content: {error}", { error: error?.message || tr("未知錯誤", "Unknown error") }));
    }
    state.activeController = null;
    if (state.cancelRequested) throw new Error(archiveCancelled());
    const finalResult = finalizeDownloadedBlob(item, blob, warningState);
    if (finalResult?.skipped) return finalResult;

    const headerName = contentDispositionFilename(response.headers?.get?.("content-disposition"));
    const finalName = improveDownloadedFilename(headerName || item.name, response.headers?.get?.("content-type"), item.name);
    return { blob, name: finalName, finalUrl: response.url || item.url };
  }

  function fetchHttpFileThroughBackground(item, progress, warningState) {
    const extensionApi = globalThis.browser || globalThis.chrome;
    if (!extensionApi?.runtime?.connect) return Promise.reject(new Error(tr("Firefox 背景下載通道無法使用", "The Firefox background download channel is unavailable")));

    return new Promise((resolve, reject) => {
      const port = extensionApi.runtime.connect({ name: "cqs-archive-download" });
      const chunks = [];
      let meta = null;
      let settled = false;
      let loaded = 0;

      const disconnect = () => {
        try { port.disconnect(); } catch (_) {}
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        state.activeController = null;
        disconnect();
        callback(value);
      };
      const abort = () => {
        try { port.postMessage({ type: "cancel" }); } catch (_) {}
        disconnect();
      };
      state.activeController = { abort };

      port.onMessage.addListener((message) => {
        if (settled || !message || typeof message !== "object") return;
        if (message.type === "meta") {
          meta = message;
          const extension = splitFilename(item.name).extension;
          if (String(message.contentType || "").toLowerCase().includes("text/html") && ![".html", ".htm"].includes(extension)) {
            abort();
            finish(reject, new Error(tr("取得的是登入或網頁內容，而不是實際檔案", "The response was a login or web page instead of the actual file")));
            return;
          }
          try {
            const warningResult = checkHeaderWarnings(item, message.contentLength, warningState, abort);
            if (warningResult?.skipped) {
              finish(resolve, warningResult);
              return;
            }
          } catch (error) {
            abort();
            finish(reject, error);
            return;
          }
          progress(tr("正在下載：{name}", "Downloading: {name}", { name: item.name }), { phase: "download", loaded: 0, total: Number(message.contentLength || 0) });
          try { port.postMessage({ type: "continue" }); } catch (error) { finish(reject, error); }
          return;
        }
        if (message.type === "chunk") {
          try {
            const bytes = message.buffer instanceof ArrayBuffer
              ? new Uint8Array(message.buffer)
              : new Uint8Array(message.buffer?.data || message.buffer || []);
            chunks.push(bytes);
            loaded = Number(message.loaded || (loaded + bytes.byteLength));
            progress(tr("正在下載：{name}（{size}）", "Downloading: {name} ({size})", { name: item.name, size: formatBytes(loaded) }), { phase: "download", loaded, total: Number(meta?.contentLength || 0) });
          } catch (error) {
            abort();
            finish(reject, new Error(tr("接收檔案內容失敗：{error}", "Failed to receive file content: {error}", { error: error?.message || tr("未知錯誤", "Unknown error") })));
          }
          return;
        }
        if (message.type === "done") {
          try {
            if (state.cancelRequested) throw new Error(archiveCancelled());
            const blob = new Blob(chunks, { type: meta?.contentType || "application/octet-stream" });
            const finalResult = finalizeDownloadedBlob(item, blob, warningState);
            if (finalResult?.skipped) {
              finish(resolve, finalResult);
              return;
            }
            const headerName = contentDispositionFilename(meta?.contentDisposition);
            const resolvedName = improveDownloadedFilename(
              headerName || meta?.fileName || item.name,
              meta?.contentType,
              item.name,
            );
            finish(resolve, { blob, name: resolvedName, finalUrl: meta?.finalUrl || item.url });
          } catch (error) {
            finish(reject, error);
          }
          return;
        }
        if (message.type === "cancelled") {
          finish(reject, new Error(state.cancelRequested ? archiveCancelled() : tr("附件下載已取消", "Attachment download was cancelled")));
          return;
        }
        if (message.type === "error") finish(reject, new Error(message.message || tr("背景下載失敗", "Background download failed")));
      });

      port.onDisconnect.addListener(() => {
        if (!settled) finish(reject, new Error(state.cancelRequested ? archiveCancelled() : tr("背景下載通道已中斷", "The background download channel was interrupted")));
      });

      try {
        port.postMessage({
          type: "start",
          url: item.url,
          filename: item.name,
          fileId: item.fileId,
          conversationId: item.conversationId || state.structuredContext?.conversationId || "",
          messageId: item.messageId || "",
          sandboxPath: item.sandboxPath || "",
          sandboxPaths: Array.isArray(item.sandboxPaths) ? [...item.sandboxPaths] : [],
          role: item.role,
          accessToken: state.structuredContext?.accessToken || "",
          accountId: state.structuredContext?.accountId || "",
          origin: location.origin,
        });
      } catch (error) {
        finish(reject, new Error(tr("無法啟動背景下載：{error}", "Could not start background download: {error}", { error: error?.message || tr("未知錯誤", "Unknown error") })));
      }
    });
  }

  async function refreshStructuredDownload(item, progress) {
    if (!item?.fileId && !item?.sandboxPath && !(Array.isArray(item?.sandboxPaths) && item.sandboxPaths.length)) return item;
    const structuredApi = window.__CQS_CONVERSATION_API__;
    if (!structuredApi?.resolveAttachment) return item;
    progress(tr("正在更新下載權限：{name}", "Refreshing download authorization: {name}", { name: item.name }), { phase: "authorization", loaded: 0, total: Number(item.sizeHint || 0) });
    try {
      const fresh = await structuredApi.resolveAttachment(item, {
        conversationId: item.conversationId || state.structuredContext?.conversationId || "",
        accessToken: state.structuredContext?.accessToken || "",
        accountId: state.structuredContext?.accountId || "",
      });
      if (fresh?.resolvedDownloadUrl) item.url = fresh.resolvedDownloadUrl;
      if (fresh?.sandboxPath && !item.sandboxPath) item.sandboxPath = fresh.sandboxPath;
      if (Array.isArray(fresh?.sandboxPaths) && fresh.sandboxPaths.length) item.sandboxPaths = [...fresh.sandboxPaths];
      if (fresh?.resolvedFileName && (
        !item.name
        || item.name === item.fileId
        || /\.bin$/i.test(item.name)
        || item.sourceKind === "react-sandbox-button"
      )) {
        item.name = safePart(fresh.resolvedFileName, item.name);
      }
      if (fresh?.resolutionStrategy) item.resolutionStrategy = fresh.resolutionStrategy;
      if (Array.isArray(fresh?.resolutionFailures)) item.resolutionFailures = [...fresh.resolutionFailures];
    } catch (error) {
      item.resolutionFailures = [...(item.resolutionFailures || []), `refresh:${error?.message || "error"}`];
    }
    return item;
  }

  async function fetchFile(item, progress, warningState) {
    if (state.cancelRequested) throw new Error(archiveCancelled());

    // Resolve a fresh signed URL immediately before downloading. The preview step can stay
    // open long enough for a previously signed URL to expire, and background-origin metadata
    // requests are more likely to be rejected than a same-origin ChatGPT page request.
    if (item.fileId || item.sandboxPath || (Array.isArray(item.sandboxPaths) && item.sandboxPaths.length)) {
      await refreshStructuredDownload(item, progress);
    }

    const hasInterpreterSource = Boolean(
      item.messageId
      && (item.sandboxPath || (Array.isArray(item.sandboxPaths) && item.sandboxPaths.length)),
    );
    if (/^https:/i.test(item.url) || item.fileId || hasInterpreterSource) {
      return fetchHttpFileThroughBackground(item, progress, warningState);
    }
    if (!item.url) throw new Error(tr("已找到檔名或 sandbox 路徑，但 ChatGPT 沒有回傳可下載網址", "A filename or sandbox path was found, but ChatGPT did not return a downloadable URL"));
    if (/^sandbox:/i.test(item.url)) throw new Error(tr("只取得 sandbox 路徑，且聊天室資料中找不到可解析的檔案識別碼", "Only a sandbox path was found, and no resolvable file identifier exists in the conversation data"));
    if (/^(blob:|data:)/i.test(item.url)) return fetchLocalFile(item, progress, warningState);
    throw new Error(tr("不支援的附件網址類型", "Unsupported attachment URL type"));
  }

  function uniquePath(path, used) {
    const normalized = String(path || "file");
    const lower = normalized.toLowerCase();
    if (!used.has(lower)) {
      used.add(lower);
      return normalized;
    }
    const slash = normalized.lastIndexOf("/");
    const directory = slash >= 0 ? normalized.slice(0, slash + 1) : "";
    const filename = slash >= 0 ? normalized.slice(slash + 1) : normalized;
    const { stem, extension } = splitFilename(filename);
    let index = 2;
    while (true) {
      const candidate = `${directory}${stem} (${index})${extension}`;
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        return candidate;
      }
      index += 1;
    }
  }

  function buildReport({ success, failures, excluded, manualExcluded, unresolved, archiveName, complete, turnsCount }) {
    const lines = [
      tr("ChatGPT Queue Sender 完整對話封存報告", "ChatGPT Queue Sender Complete Conversation Archive Report"),
      "========================================",
      "",
      tr("聊天室：{title}", "Conversation: {title}", { title: state.conversationTitle }),
      tr("封存檔名：{name}", "Archive filename: {name}", { name: archiveName }),
      tr("匯出時間：{time}", "Exported: {time}", { time: new Date().toLocaleString(locale, { hour12: false }) }),
      tr("對話網址：{url}", "Conversation URL: {url}", { url: location.href }),
      tr("訊息數量：{count}", "Message count: {count}", { count: turnsCount }),
      tr("對話掃描完整性：{status}", "Conversation scan completeness: {status}", { status: complete ? tr("已完成自動載入與掃描", "automatic loading and scanning completed") : tr("無法確認所有較早訊息均已載入", "not all earlier messages could be confirmed as loaded") }),
      tr("結構化附件掃描：{status}", "Structured attachment scan: {status}", { status: state.structuredContext?.ok ? tr("成功，找到 {count} 個附件來源", "successful; {count} attachment sources found", { count: state.structuredContext.attachments?.length || 0 }) : tr("未完成{warning}", "not completed{warning}", { warning: state.attachmentScanWarning ? ` (${state.attachmentScanWarning})` : "" }) }),
      "",
      tr("成功下載：{count} 份", "Successfully downloaded: {count}", { count: success.length }),
      tr("下載失敗：{count} 份", "Download failures: {count}", { count: failures.length }),
      tr("自動排除較舊版本：{count} 份", "Older versions automatically excluded: {count}", { count: excluded.length }),
      tr("使用者取消選取：{count} 份", "Deselected by user: {count}", { count: manualExcluded.length }),
      tr("無法解析下載來源：{count} 份", "Unresolved download sources: {count}", { count: unresolved.length }),
      "",
    ];

    const section = (title, items, render) => {
      lines.push(title, "-".repeat(title.length));
      if (!items.length) lines.push(tr("（無）", "(None)"));
      else items.forEach((item, index) => lines.push(`${index + 1}. ${render(item)}`));
      lines.push("");
    };
    section(tr("成功下載的檔案", "Successfully downloaded files"), success, (item) => tr("{name}｜{source}｜{size}｜ZIP 路徑：{path}", "{name} | {source} | {size} | ZIP path: {path}", { name: item.name, source: item.role === "user" ? tr("使用者上傳", "User upload") : tr("ChatGPT 提供", "Provided by ChatGPT"), size: formatBytes(item.size), path: item.path }));
    section(tr("下載失敗或略過的檔案", "Failed or skipped files"), failures, (item) => tr("{name}｜原因：{reason}", "{name} | Reason: {reason}", { name: item.name, reason: item.reason }));
    section(tr("自動判定為較舊版本而排除", "Automatically excluded as older versions"), excluded, (item) => `${item.name} | ${item.exclusionReason}`);
    section(tr("使用者在確認清單中取消選取", "Deselected by the user in the review list"), manualExcluded, (item) => item.name);
    section(tr("無法解析下載來源的檔案線索", "File clues with unresolved download sources"), unresolved, (item) => tr("{name}｜{source}｜{reason}", "{name} | {source} | {reason}", { name: item.name, source: item.role === "user" ? tr("使用者上傳", "User upload") : tr("ChatGPT 提供", "Provided by ChatGPT"), reason: item.exclusionReason || tr("沒有檔案識別碼或實際網址", "No file identifier or direct URL") }));
    lines.push(tr("注意事項", "Notes"), "--------", tr("附件連結可能受登入狀態、權限或有效期限影響。失敗項目不會阻止其餘內容建立 ZIP。", "Attachment links can depend on login state, permissions, or expiration. Failed items do not prevent the remaining ZIP from being created."), "");
    return lines.join("\n");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.documentElement.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function openProgress(title, description) {
    const startedAt = Date.now();
    let percentValue = 0;
    const count = createElement("strong", { className: "cqs-export-progress-count", text: tr("準備中", "Preparing") });
    const status = createElement("p", { className: "cqs-export-progress-text", text: description });
    const track = createElement("div", { className: "cqs-export-progress-track" });
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    const fill = createElement("div", { className: "cqs-export-progress-fill" });
    track.append(fill);
    const meta = createElement("div", { className: "cqs-export-progress-meta" });
    const percent = createElement("span", { className: "cqs-export-progress-percent", text: "0%" });
    const timing = createElement("span", { className: "cqs-export-progress-time", text: tr("已用時 00:00", "Elapsed 00:00") });
    meta.append(percent, timing);
    const note = createElement("p", { className: "cqs-export-progress-note", text: tr("可隨時取消；已下載但尚未封裝的暫存內容會被丟棄。", "You can cancel at any time. Downloaded temporary data that has not been archived will be discarded.") });
    const content = createElement("div", { className: "cqs-export-progress" });
    content.append(count, status, track, meta, note);

    const updateTiming = () => {
      const elapsed = Date.now() - startedAt;
      let text = tr("已用時 {elapsed}", "Elapsed {elapsed}", { elapsed: formatDuration(elapsed) });
      if (percentValue >= 3 && percentValue < 100) {
        const estimatedTotal = elapsed / (percentValue / 100);
        const remaining = Math.max(0, estimatedTotal - elapsed);
        text += tr("・預估剩餘 {remaining}", " · About {remaining} remaining", { remaining: formatDuration(remaining) });
      }
      timing.textContent = text;
    };
    const timer = setInterval(updateTiming, 500);
    updateTiming();

    api().openModal({
      title,
      description,
      content,
      closeable: false,
      actions: [{
        label: tr("取消", "Cancel"),
        danger: true,
        onClick: () => {
          state.cancelRequested = true;
          api().requestExportCancel?.();
          state.activeController?.abort?.();
          status.textContent = tr("正在取消並清理暫存內容……", "Cancelling and cleaning temporary data…");
        },
      }],
      className: "cqs-export-progress-modal",
    });
    return {
      setCount(value) { count.textContent = value; },
      setStatus(value) { status.textContent = value; },
      setNote(value) { note.textContent = value; },
      setProgress(value) {
        percentValue = Math.max(0, Math.min(100, Number(value) || 0));
        fill.style.width = `${percentValue}%`;
        track.setAttribute("aria-valuenow", String(Math.round(percentValue)));
        percent.textContent = `${Math.round(percentValue)}%`;
        updateTiming();
      },
      dispose() { clearInterval(timer); },
    };
  }

  async function createArchive(selectedItems) {
    state.cancelRequested = false;
    const progress = openProgress(tr("正在建立完整對話封存", "Creating complete conversation archive"), tr("依序下載已選檔案，再建立本機 ZIP。", "Downloading selected files in order, then creating a local ZIP."));
    progress.setProgress(1);
    try {
    const entries = [];
    const success = [];
    const failures = [];
    const usedPaths = new Set();
    const warningState = { singleApproved: new Set(), totalApproved: false, totalBytes: 0 };

    for (let index = 0; index < selectedItems.length; index += 1) {
      const item = selectedItems[index];
      if (state.cancelRequested) throw new Error(archiveCancelled());
      progress.setCount(tr("{current}/{total} 下載附件", "{current}/{total} downloading attachments", { current: index + 1, total: selectedItems.length }));
      const itemBase = selectedItems.length ? (index / selectedItems.length) * 76 : 76;
      const itemSpan = selectedItems.length ? 76 / selectedItems.length : 0;
      progress.setProgress(itemBase);
      try {
        const result = await fetchFile(item, (text, detail = {}) => {
          progress.setStatus(text);
          const total = Number(detail.total || 0);
          const loaded = Number(detail.loaded || 0);
          const fraction = total > 0 ? Math.max(0, Math.min(1, loaded / total)) : (detail.phase === "authorization" ? 0.08 : 0.18);
          progress.setProgress(itemBase + itemSpan * fraction);
          if (loaded > 0) {
            progress.setNote(total > 0
              ? tr("本檔案 {loaded} / {total}", "This file: {loaded} / {total}", { loaded: formatBytes(loaded), total: formatBytes(total) })
              : tr("本檔案已下載 {loaded}", "Downloaded {loaded} for this file", { loaded: formatBytes(loaded) }));
          }
        }, warningState);
        if (result?.skipped) {
          failures.push({ ...item, reason: result.reason });
          continue;
        }
        const folder = item.role === "user" ? tr("使用者上傳", "User Uploads") : tr("ChatGPT提供", "Provided by ChatGPT");
        const finalName = safePart(result.name || item.name, item.name);
        const path = uniquePath(`${folder}/${finalName}`, usedPaths);
        entries.push({ name: path, data: result.blob, type: result.blob.type });
        success.push({ ...item, name: finalName, path, size: result.blob.size, finalUrl: result.finalUrl });
        progress.setProgress(itemBase + itemSpan);
      } catch (error) {
        if (isArchiveCancelled(error)) throw error;
        failures.push({ ...item, reason: error?.message || tr("未知下載錯誤", "Unknown download error") });
      }
    }

    const excluded = state.plannedItems.filter((item) => !item.selected && item.exclusionReason && !item.defaultSelected);
    const manualExcluded = state.plannedItems.filter((item) => !item.selected && !item.unresolved && (item.defaultSelected || !item.exclusionReason));
    const unresolved = state.unresolvedItems || [];
    const archiveFilename = `${safePart(state.conversationTitle, tr("ChatGPT 對話紀錄", "ChatGPT Conversation"))}.zip`;
    const markdownFilename = uniquePath(`${safePart(state.conversationTitle, tr("ChatGPT 對話紀錄", "ChatGPT Conversation"))}.md`, usedPaths);
    entries.unshift({ name: markdownFilename, data: state.markdown, type: "text/markdown;charset=utf-8" });
    const report = buildReport({
      success,
      failures,
      excluded,
      manualExcluded,
      unresolved,
      archiveName: archiveFilename,
      complete: state.complete,
      turnsCount: state.turnsCount,
    });
    entries.push({ name: uniquePath(tr("匯出報告.txt", "export-report.txt"), usedPaths), data: report, type: "text/plain;charset=utf-8" });

    const estimatedZipSize = entries.reduce((sum, entry) => sum + (entry.data instanceof Blob ? entry.data.size : new Blob([entry.data]).size), 0);
    if (estimatedZipSize > ZIP32_MAX_BYTES) throw new Error(tr("封存內容超過 4 GB，目前版本尚未支援 ZIP64。", "The archive exceeds 4 GB. ZIP64 is not supported in this version."));

    progress.setCount(tr("正在封裝 {count} 個項目", "Packaging {count} items", { count: entries.length }));
    progress.setProgress(78);
    progress.setStatus(tr("正在計算檔案校驗值並建立 ZIP……", "Calculating file checksums and creating the ZIP…"));
    progress.setNote(tr("ZIP 使用無損封存模式，能減少大型附件的 CPU 負擔。", "The ZIP uses lossless store mode to reduce CPU load for large attachments."));
    const zipBlob = await window.__CQS_ZIP__.buildZip(entries, {
      isCancelled: () => state.cancelRequested,
      onProgress(info) {
        if (info.phase === "checksum") {
          progress.setStatus(tr("正在封裝：{name}", "Packaging: {name}", { name: info.name }));
          const current = Math.min(info.index + 1, info.count);
          progress.setCount(tr("{current}/{total} 建立 ZIP", "{current}/{total} creating ZIP", { current, total: info.count }));
          progress.setProgress(78 + (info.count ? (current / info.count) * 21 : 21));
        }
      },
    });
    if (state.cancelRequested) throw new Error(archiveCancelled());
    progress.setProgress(100);
    progress.setStatus(tr("封存完成，正在交給 Firefox 下載……", "Archive complete. Handing it to Firefox for download…"));
    downloadBlob(zipBlob, archiveFilename);
    api().closeModal();
    api().showToast(tr("完整封存已下載：{success} 份附件，{failed} 份失敗或略過。", "Complete archive downloaded: {success} attachment(s), {failed} failed or skipped.", { success: success.length, failed: failures.length }));
    document.dispatchEvent(new CustomEvent("cqs:conversation-archive-exported", {
      detail: { success: success.length, failed: failures.length, filename: archiveFilename, size: zipBlob.size },
    }));
    } finally {
      progress.dispose();
    }
  }

  function openPreview() {
    const summaryGrid = makeSummaryGrid(state.plannedItems);
    const content = createElement("div", { className: "cqs-archive-preview" });
    const notice = createElement("div", { className: "cqs-archive-notice" });
    const structuredCount = state.structuredContext?.attachments?.length || 0;
    const unresolvedCount = state.unresolvedItems?.length || 0;
    const scanText = state.structuredContext?.ok
      ? tr("已從聊天室結構化資料核對 {count} 個附件來源。{extra}", "Verified {count} attachment sources from structured conversation data. {extra}", { count: structuredCount, extra: unresolvedCount ? tr("另有 {count} 個畫面檔名仍無法解析，會記錄在匯出報告。", "{count} visible filename(s) remain unresolved and will be listed in the export report.", { count: unresolvedCount }) : "" })
      : tr("無法讀取聊天室結構化附件資料。{warning}", "Could not read structured conversation attachment data. {warning}", { warning: state.attachmentScanWarning || tr("將只使用頁面可見連結。", "Only links visible on the page will be used.") });
    notice.append(
      createElement("strong", { text: tr("附件核對與版本判斷已完成", "Attachment verification and version selection are complete") }),
      createElement("p", { text: scanText }),
      createElement("p", { text: tr("檔名中的 V1、V2、2.0、2.1、最終版、修改版與聊天室出現順序會用來選擇最新版本；source、AMO 等不同用途會分開保留。", "V1, V2, 2.0, 2.1, final, revised, and conversation order are used to select the latest version. Different purposes such as source and AMO are kept separately.") }),
    );
    const fileList = makeFileList(state.plannedItems, summaryGrid);
    content.append(summaryGrid, notice, fileList);

    api().openModal({
      title: tr("建立完整對話封存", "Create complete conversation archive"),
      description: tr("ZIP 將命名為「{name}.zip」。", "The ZIP will be named “{name}.zip”.", { name: safePart(state.conversationTitle, tr("ChatGPT 對話紀錄", "ChatGPT Conversation")) }),
      content,
      actions: [
        {
          label: tr("取消", "Cancel"),
          onClick: () => {
            api().closeModal();
            state.running = false;
            state.cancelRequested = false;
            state.structuredContext = null;
            api().releaseExportJob?.();
          },
        },
        {
          label: tr("建立 ZIP", "Create ZIP"),
          primary: true,
          onClick: async () => {
            const selected = state.plannedItems.filter((item) => item.selected);
            const summary = getPlanSummary(state.plannedItems);
            if (summary.knownSize > TOTAL_ARCHIVE_WARNING_BYTES) {
              const proceed = window.confirm(tr("目前可估算的已選檔案至少 {size}，超過 500 MB。仍要開始下載嗎？", "The selected files are estimated at at least {size}, exceeding 500 MB. Start downloading?", { size: formatBytes(summary.knownSize) }));
              if (!proceed) return;
            }
            try {
              await createArchive(selected);
            } catch (error) {
              api().closeModal();
              if (isArchiveCancelled(error)) api().showToast(tr("已取消完整封存。", "Complete archive cancelled."));
              else {
                console.error("[CQS Archive]", error);
                api().showToast(error?.message || tr("完整封存失敗，請重新整理頁面後再試。", "Complete archive failed. Refresh the page and try again."));
              }
            } finally {
              state.activeController = null;
              state.cancelRequested = false;
              state.running = false;
              state.structuredContext = null;
              api().releaseExportJob?.();
            }
          },
        },
      ],
      className: "cqs-archive-preview-modal",
      closeable: false,
    });
  }

  async function beginArchiveExport() {
    if (state.running || !api()?.acquireExportJob?.()) {
      api()?.showToast?.(tr("正在整理或封存對話，請稍候。", "A conversation export or archive is already in progress. Please wait."));
      return;
    }
    state.running = true;
    state.cancelRequested = false;

    if (api().isGenerating?.() && !window.confirm(tr("ChatGPT 目前仍在產生回覆。現在封存可能包含尚未完成的內容，仍要繼續嗎？", "ChatGPT is still generating a response. The archive may include unfinished content. Continue?"))) {
      state.running = false;
      api().releaseExportJob?.();
      return;
    }

    const progress = openProgress(tr("正在掃描完整對話與附件", "Scanning full conversation and attachments"), tr("先載入目前分支，再整理附件與版本關係。", "Loading the current branch, then organizing attachments and version relationships."));
    progress.setProgress(2);
    try {
      const result = await api().collectConversation((messageCount, message, detail = {}) => {
        progress.setCount(tr("已找到 {count} 則訊息", "{count} messages found", { count: messageCount }));
        progress.setStatus(message);
        if (Number.isFinite(Number(detail.progress))) progress.setProgress(detail.progress);
      });
      if (!result.turns.length) throw new Error(tr("沒有找到可封存的對話內容。", "No conversation content was found to archive."));
      progress.setProgress(60);
      state.conversationTitle = api().getConversationTitle();
      state.turnsCount = result.turns.length;

      let structuredContext = { ok: false, attachments: [], warning: tr("結構化附件掃描模組尚未載入。", "The structured attachment scan module is not loaded.") };
      const structuredApi = window.__CQS_CONVERSATION_API__;
      if (structuredApi?.collectAttachments) {
        try {
          structuredContext = await structuredApi.collectAttachments({
            onProgress(message, detail = {}) {
              progress.setStatus(message);
              progress.setCount(tr("已找到 {count} 則訊息", "{count} messages found", { count: result.turns.length }));
              if (Number.isFinite(Number(detail.progress))) progress.setProgress(detail.progress);
            },
          });
        } catch (error) {
          structuredContext = { ok: false, attachments: [], warning: error?.message || tr("結構化附件掃描失敗", "Structured attachment scan failed") };
        }
      }
      state.structuredContext = structuredContext;
      state.attachmentScanWarning = structuredContext.warning || "";
      const structuredCount = Number(structuredContext.messageCount || 0);
      const structuredVerified = structuredContext.ok && structuredCount > 0 && result.turns.length >= structuredCount;
      const complete = Boolean(result.complete || structuredVerified);
      if (!complete) {
        progress.setProgress(88);
        progress.setStatus(tr("無法完全確認最早訊息是否已載入。", "Could not fully confirm that the earliest messages were loaded."));
        const proceed = window.confirm(tr("已找到 {count} 則訊息，但無法確認較早內容是否全部載入。要使用目前已找到的內容建立 ZIP 嗎？", "{count} messages were found, but earlier content may not be fully loaded. Create the ZIP with the content found so far?", { count: result.turns.length }));
        if (!proceed) throw new Error(archiveCancelled());
      }
      state.complete = complete;
      state.markdown = api().buildMarkdown(result.turns, complete);
      progress.setProgress(90);
      progress.setStatus(tr("正在整理附件版本與預設選取項目……", "Organizing attachment versions and default selections…"));
      state.plannedItems = flattenCandidates(result.turns, structuredContext.attachments || []);
      state.unresolvedItems = state.plannedItems.filter((item) => item.unresolved
        && !/^(?:已由(?:可下載的檔案資料|較可靠的聊天室檔案資料)取代|Replaced by (?:downloadable file data|more reliable conversation file data))/.test(item.exclusionReason || ""));
      progress.setProgress(100);
      progress.setStatus(tr("附件清單已準備完成。", "The attachment list is ready."));
      progress.setNote(tr("接下來可以選擇要放入 ZIP 的檔案。", "You can now choose which files to include in the ZIP."));
      progress.dispose();
      api().closeModal();
      openPreview();
      api().showToast(tr("附件清單已準備完成，請選擇要封存的內容。", "The attachment list is ready. Choose what to include in the archive."));
      try {
        const extensionApi = globalThis.browser || globalThis.chrome;
        await extensionApi?.runtime?.sendMessage?.({
          type: "CQS_RESPONSE_COMPLETE",
          title: tr("附件清單已準備完成", "Attachment list ready"),
          message: tr("已完成掃描，接下來可以選擇要放入 ZIP 的檔案。", "Scanning is complete. You can now choose which files to include in the ZIP."),
        });
      } catch (_) {}
    } catch (error) {
      progress.dispose();
      api().closeModal();
      state.running = false;
      state.cancelRequested = false;
      state.structuredContext = null;
      api().releaseExportJob?.();
      if (isArchiveCancelled(error)) api().showToast(tr("已取消完整封存。", "Complete archive cancelled."));
      else {
        console.error("[CQS Archive]", error);
        api().showToast(error?.message || tr("掃描附件失敗，請重新整理頁面後再試。", "Attachment scanning failed. Refresh the page and try again."));
      }
    }
  }

  document.addEventListener("cqs:open-archive-export", beginArchiveExport);

  window.__CQS_ARCHIVE_EXPORT__ = Object.freeze({
    beginArchiveExport,
    flattenCandidates,
    parseVersionInfo,
    compareCandidates,
    formatBytes,
    improveDownloadedFilename,
  });
})();
