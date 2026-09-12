(() => {
  if (window.__CQS_CONVERSATION_EXPORT__) return;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));
  const locale = globalThis.CQS_I18N?.locale || "zh-TW";
  const EXPORT_CANCELLED_ZH = "使用者取消匯出。";
  const EXPORT_CANCELLED_EN = "Export cancelled by the user.";
  const exportCancelled = () => tr(EXPORT_CANCELLED_ZH, EXPORT_CANCELLED_EN);
  const isExportCancelled = (error) => [EXPORT_CANCELLED_ZH, EXPORT_CANCELLED_EN].includes(String(error?.message || error || ""));

  const state = {
    menuOpen: false,
    exporting: false,
    cancelRequested: false,
    refreshScheduled: false,
  };

  const FILE_EXTENSIONS = [
    "pdf", "doc", "docx", "odt", "rtf", "tex", "bib", "epub", "mobi",
    "xls", "xlsx", "ods", "csv", "tsv", "parquet", "feather",
    "ppt", "pptx", "odp", "mpp", "xer",
    "txt", "md", "log", "ini", "cfg", "conf", "env",
    "json", "jsonl", "xml", "yaml", "yml", "toml", "sql", "db", "sqlite", "sqlite3",
    "zip", "xpi", "crx", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "iso",
    "js", "mjs", "cjs", "ts", "jsx", "tsx", "vue", "svelte", "html", "htm", "css", "scss", "sass", "less",
    "py", "ipynb", "java", "class", "jar", "cs", "cpp", "cc", "c", "h", "hpp", "go", "rs", "rb", "php",
    "swift", "kt", "kts", "scala", "sh", "bash", "zsh", "ps1", "bat", "cmd", "wasm",
    "exe", "msi", "dll", "apk", "ipa", "deb", "rpm", "appimage",
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tif", "tiff", "heic", "ico",
    "psd", "ai", "indd", "aep", "prproj", "mogrt", "prtextstyle", "aegraphic",
    "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus",
    "mp4", "mov", "webm", "avi", "mkv", "mxf", "wmv",
    "srt", "vtt", "ass", "ssa", "lrc",
    "glb", "gltf", "fbx", "obj", "blend", "stl", "dwg", "dxf", "ifc",
    "otio", "fcpxml", "ttf", "otf", "woff", "woff2", "pem", "cer", "crt", "key",
    "pkl", "pickle", "npy", "npz",
  ];
  const FILE_RE = new RegExp(
    String.raw`([^\n\r\t<>:"|?*]{1,160}\.(?:${FILE_EXTENSIONS.join("|")}))(?=$|[\s)\]}>,'";，。；])`,
    "gi",
  );
  const GENERIC_FILE_RE = /([^\n\r\t<>:"|?*]{1,160}\.[A-Za-z][A-Za-z0-9]{0,15})(?=$|[\s),;，。；])/g;

  function createElement(tag, options = {}) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.id) element.id = options.id;
    if (options.text !== undefined) element.textContent = options.text;
    if (options.type) element.type = options.type;
    if (options.title) element.title = options.title;
    if (options.attrs) {
      for (const [name, value] of Object.entries(options.attrs)) {
        if (value !== undefined && value !== null) element.setAttribute(name, String(value));
      }
    }
    return element;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function isRendered(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function getVisibleMain() {
    const candidates = [...document.querySelectorAll("main")].filter(isRendered);
    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.width * br.height - ar.width * ar.height;
    })[0] || document.body;
  }

  function ensureControl() {
    let control = document.getElementById("cqs-export-control");
    if (control) return control;

    control = createElement("div", { id: "cqs-export-control" });
    const button = createElement("button", {
      className: "cqs-export-trigger",
      type: "button",
      title: tr("匯出目前對話或產生對話交接摘要", "Export this conversation or create a handoff summary"),
      attrs: { "aria-haspopup": "menu", "aria-expanded": "false" },
    });
    button.dataset.cqsExportAction = "toggle-menu";

    const icon = createElement("span", { className: "cqs-export-trigger-icon", attrs: { "aria-hidden": "true" } });
    icon.textContent = "⇩";
    const label = createElement("span", { className: "cqs-export-trigger-label", text: tr("匯出與轉移", "Export & Transfer") });
    const caret = createElement("span", { className: "cqs-export-trigger-caret", text: "▾", attrs: { "aria-hidden": "true" } });
    button.append(icon, label, caret);

    const menu = createElement("div", {
      id: "cqs-export-menu",
      attrs: { role: "menu", "aria-label": tr("匯出與轉移", "Export & Transfer") },
    });
    menu.hidden = true;

    const downloadButton = createElement("button", { type: "button", attrs: { role: "menuitem" } });
    downloadButton.dataset.cqsExportAction = "download-markdown";
    const downloadIcon = createElement("span", { className: "cqs-export-menu-icon", text: "↓", attrs: { "aria-hidden": "true" } });
    const downloadCopy = createElement("span", { className: "cqs-export-menu-copy" });
    downloadCopy.append(
      createElement("strong", { text: tr("下載完整對話 Markdown", "Download full conversation Markdown") }),
      createElement("small", { text: tr("整理目前分支、附件名稱與可見連結", "Export the current branch with attachment names and visible links") }),
    );
    downloadButton.append(downloadIcon, downloadCopy);

    const archiveButton = createElement("button", { type: "button", attrs: { role: "menuitem" } });
    archiveButton.dataset.cqsExportAction = "download-archive";
    const archiveIcon = createElement("span", { className: "cqs-export-menu-icon", text: "▣", attrs: { "aria-hidden": "true" } });
    const archiveCopy = createElement("span", { className: "cqs-export-menu-copy" });
    const archiveTitleRow = createElement("span", { className: "cqs-export-menu-title-row" });
    archiveTitleRow.append(
      createElement("strong", { text: tr("下載完整對話封存 ZIP", "Download complete conversation archive ZIP") }),
      createElement("span", {
        className: "cqs-export-beta-badge",
        text: "Beta",
        attrs: {
          title: tr("測試功能：部分附件可能因 ChatGPT 權限或連結失效而無法封存", "Beta feature: some attachments may not be archived if ChatGPT access or download links have expired"),
          "aria-label": tr("Beta 測試功能", "Beta feature"),
        },
      }),
    );
    archiveCopy.append(
      archiveTitleRow,
      createElement("small", { text: tr("包含 Markdown、最新版本附件與匯出報告", "Includes Markdown, latest attachment versions, and an export report") }),
    );
    archiveButton.append(archiveIcon, archiveCopy);

    const handoffButton = createElement("button", { type: "button", attrs: { role: "menuitem" } });
    handoffButton.dataset.cqsExportAction = "open-handoff";
    const handoffIcon = createElement("span", { className: "cqs-export-menu-icon", text: "✦", attrs: { "aria-hidden": "true" } });
    const handoffCopy = createElement("span", { className: "cqs-export-menu-copy" });
    handoffCopy.append(
      createElement("strong", { text: tr("產生對話交接摘要", "Create conversation handoff summary") }),
      createElement("small", { text: tr("先預覽指令，再加入佇列自動送出", "Preview the instruction, then queue it for automatic sending") }),
    );
    handoffButton.append(handoffIcon, handoffCopy);

    const customPromptHost = createElement("div", {
      className: "cqs-custom-prompts-section",
      attrs: { "data-cqs-custom-prompt-host": "1" },
    });

    menu.append(downloadButton, archiveButton, handoffButton, customPromptHost);
    control.append(button, menu);
    control.addEventListener("click", handleControlClick);
    document.documentElement.appendChild(control);
    positionControl();
    document.dispatchEvent(new CustomEvent("cqs:export-control-ready"));
    return control;
  }

  function positionControl() {
    const control = document.getElementById("cqs-export-control");
    if (!control) return;
    const main = getVisibleMain();
    const rect = main.getBoundingClientRect();
    const left = Math.max(10, Math.min(window.innerWidth - 190, rect.left + 12));
    const top = Math.max(58, Math.min(94, rect.top + 10));
    control.style.left = `${Math.round(left)}px`;
    control.style.top = `${Math.round(top)}px`;
  }

  function setMenuOpen(open) {
    state.menuOpen = Boolean(open);
    const control = ensureControl();
    const menu = control.querySelector("#cqs-export-menu");
    const trigger = control.querySelector(".cqs-export-trigger");
    if (menu) menu.hidden = !state.menuOpen;
    trigger?.setAttribute("aria-expanded", state.menuOpen ? "true" : "false");
  }

  function ensureModal() {
    let modal = document.getElementById("cqs-export-modal");
    if (modal) return modal;
    modal = createElement("div", { id: "cqs-export-modal" });
    modal.hidden = true;
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-cqs-export-close]")) closeModal();
    });
    document.documentElement.appendChild(modal);
    return modal;
  }

  function openModal({ title, description = "", content, actions = [], closeable = true, className = "" }) {
    const modal = ensureModal();
    modal.textContent = "";
    modal.className = className;

    const card = createElement("section", {
      className: "cqs-export-modal-card",
      attrs: { role: "dialog", "aria-modal": "true", "aria-label": title },
    });
    const head = createElement("header", { className: "cqs-export-modal-head" });
    const headCopy = createElement("div");
    headCopy.append(createElement("h2", { text: title }));
    if (description) headCopy.append(createElement("p", { text: description }));
    head.append(headCopy);
    if (closeable) {
      const close = createElement("button", { type: "button", text: "×", title: tr("關閉", "Close"), attrs: { "data-cqs-export-close": "1", "aria-label": tr("關閉", "Close") } });
      close.className = "cqs-export-modal-close";
      head.append(close);
    }
    card.append(head);

    const body = createElement("div", { className: "cqs-export-modal-body" });
    if (content) body.append(content);
    card.append(body);

    if (actions.length) {
      const footer = createElement("footer", { className: "cqs-export-modal-actions" });
      for (const action of actions) {
        const button = createElement("button", { type: "button", text: action.label });
        if (action.primary) button.classList.add("cqs-primary");
        if (action.danger) button.classList.add("cqs-danger");
        if (action.disabled) button.disabled = true;
        button.addEventListener("click", action.onClick);
        footer.append(button);
      }
      card.append(footer);
    }

    modal.append(card);
    modal.hidden = false;
    setTimeout(() => card.querySelector("button, textarea, input")?.focus(), 20);
    return { modal, card, body };
  }

  function closeModal() {
    const modal = document.getElementById("cqs-export-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.textContent = "";
    modal.className = "";
  }

  function showExportToast(message) {
    let toast = document.getElementById("cqs-export-toast");
    if (!toast) {
      toast = createElement("div", { id: "cqs-export-toast", attrs: { role: "status", "aria-live": "polite" } });
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showExportToast.timer);
    showExportToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 4200);
  }

  function handleControlClick(event) {
    const actionElement = event.target.closest("[data-cqs-export-action]");
    if (!actionElement) return;
    const action = actionElement.dataset.cqsExportAction;
    if (action === "toggle-menu") {
      setMenuOpen(!state.menuOpen);
      return;
    }
    setMenuOpen(false);
    if (action === "download-markdown") beginMarkdownExport();
    if (action === "download-archive") document.dispatchEvent(new CustomEvent("cqs:open-archive-export"));
    if (action === "open-handoff") document.dispatchEvent(new CustomEvent("cqs:open-handoff"));
  }

  function getTurnCandidates() {
    const roleNodes = [...document.querySelectorAll("[data-message-author-role='user'], [data-message-author-role='assistant']")];
    const records = [];
    const seen = new Set();
    for (const roleNode of roleNodes) {
      if (!isRendered(roleNode)) continue;
      const role = roleNode.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") continue;
      const turn = roleNode.closest("[data-testid^='conversation-turn-'], [data-message-id], article, [data-turn]") || roleNode;
      if (seen.has(turn)) continue;
      seen.add(turn);
      records.push({ role, roleNode, turn });
    }
    return records;
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function getTurnKey(record, index) {
    const testId = record.turn.getAttribute?.("data-testid") || "";
    const messageId = record.turn.getAttribute?.("data-message-id")
      || record.roleNode.getAttribute?.("data-message-id")
      || record.turn.id
      || "";
    if (messageId || testId) return `${record.role}|${messageId || testId}`;
    const text = normalizeText(record.roleNode.innerText || record.roleNode.textContent || "");
    return `${record.role}|${hashText(text)}|${index}`;
  }

  function getOrderHint(record, fallback) {
    const testId = String(record.turn.getAttribute?.("data-testid") || "");
    const testIdMatch = testId.match(/^conversation-turn-(\d+)$/i);
    if (testIdMatch) return Number(testIdMatch[1]);
    const dataTurn = String(record.turn.getAttribute?.("data-turn") || "");
    if (/^\d+$/.test(dataTurn)) return Number(dataTurn);
    return fallback;
  }

  function getContentRoot(record) {
    if (record.role === "assistant") {
      return record.roleNode.querySelector(".markdown, [class*='prose'], [data-message-content]") || record.roleNode;
    }
    return record.roleNode.querySelector("[data-message-content], .whitespace-pre-wrap") || record.roleNode;
  }

  function extensionToType(filename) {
    const extension = String(filename || "").split(".").pop()?.toLowerCase() || "";
    const labels = {
      pdf: tr("PDF 文件", "PDF document"), doc: tr("Word 文件", "Word document"), docx: tr("Word 文件", "Word document"), xls: tr("Excel 試算表", "Excel spreadsheet"), xlsx: tr("Excel 試算表", "Excel spreadsheet"),
      csv: tr("CSV 資料", "CSV data"), ppt: tr("PowerPoint 簡報", "PowerPoint presentation"), pptx: tr("PowerPoint 簡報", "PowerPoint presentation"), txt: tr("文字檔", "Text file"), md: tr("Markdown 文件", "Markdown document"),
      json: tr("JSON 資料", "JSON data"), xml: tr("XML 資料", "XML data"), yaml: tr("YAML 資料", "YAML data"), yml: tr("YAML 資料", "YAML data"), sql: tr("SQL 資料", "SQL data"),
      zip: tr("ZIP 壓縮檔", "ZIP archive"), xpi: tr("Firefox 擴充套件", "Firefox extension"), crx: tr("Chrome 擴充套件", "Chrome extension"), rar: tr("RAR 壓縮檔", "RAR archive"), "7z": tr("7-Zip 壓縮檔", "7-Zip archive"),
      png: tr("PNG 圖片", "PNG image"), jpg: tr("JPG 圖片", "JPG image"), jpeg: tr("JPEG 圖片", "JPEG image"), gif: tr("GIF 圖片", "GIF image"), webp: tr("WebP 圖片", "WebP image"), svg: tr("SVG 圖片", "SVG image"),
      psd: tr("Photoshop 文件", "Photoshop document"), ai: tr("Illustrator 文件", "Illustrator document"), aep: tr("After Effects 專案", "After Effects project"), prproj: tr("Premiere Pro 專案", "Premiere Pro project"),
      mogrt: tr("Motion Graphics 範本", "Motion Graphics template"), prtextstyle: tr("Premiere Pro 文字樣式", "Premiere Pro text style"), otio: tr("OpenTimelineIO 檔案", "OpenTimelineIO file"), fcpxml: "Final Cut Pro XML",
      mp3: tr("MP3 音訊", "MP3 audio"), wav: tr("WAV 音訊", "WAV audio"), m4a: tr("M4A 音訊", "M4A audio"), flac: tr("FLAC 音訊", "FLAC audio"), mp4: tr("MP4 影片", "MP4 video"), mov: tr("MOV 影片", "MOV video"), webm: tr("WebM 影片", "WebM video"),
      srt: tr("SRT 字幕", "SRT subtitles"), vtt: tr("WebVTT 字幕", "WebVTT subtitles"), ass: tr("ASS 字幕", "ASS subtitles"),
    };
    return labels[extension] || (extension ? tr("{extension} 檔案", "{extension} file", { extension: extension.toUpperCase() }) : tr("檔案", "File"));
  }

  function isChatFileUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    if (/^(blob:|data:|sandbox:)/i.test(raw)) return true;
    try {
      const url = new URL(raw, location.href);
      const host = url.hostname.toLowerCase();
      if (host === "oaiusercontent.com" || host.endsWith(".oaiusercontent.com")) return true;
      const isOpenAiHost = url.origin === location.origin
        || host === "chatgpt.com"
        || host.endsWith(".chatgpt.com")
        || host === "openai.com"
        || host.endsWith(".openai.com");
      if (!isOpenAiHost) return false;
      return /(?:^|\/)(?:backend-api\/)?(?:files?|uploads?|downloads?)(?:\/|$)/i.test(url.pathname)
        || /(?:^|[-_/])file[-_/][A-Za-z0-9]/i.test(url.pathname)
        || url.searchParams.has("filename")
        || url.searchParams.has("download");
    } catch (_) {
      return false;
    }
  }

  function getElementUrls(element) {
    const values = [];
    const add = (value) => {
      const text = String(value || "").trim();
      if (text && !values.includes(text) && !/^javascript:/i.test(text)) values.push(text);
    };
    const attributes = ["href", "data-href", "data-url", "data-download-url", "data-file-url", "data-asset-url", "formaction"];
    attributes.forEach((name) => add(element.getAttribute?.(name)));
    if (element.tagName !== "A") {
      element.querySelectorAll?.("a[href], [data-href], [data-url], [data-download-url], [data-file-url]").forEach((child) => {
        attributes.forEach((name) => add(child.getAttribute?.(name)));
      });
    }
    const ancestor = element.closest?.("a[href], [data-href], [data-url], [data-download-url], [data-file-url]");
    if (ancestor && ancestor !== element) attributes.forEach((name) => add(ancestor.getAttribute?.(name)));
    return values;
  }

  function getElementFileId(element, urls = []) {
    const api = window.__CQS_CONVERSATION_API__;
    const attributes = ["data-file-id", "data-file_id", "data-asset-id", "data-asset_pointer", "data-asset-pointer", "data-id"];
    for (const name of attributes) {
      const raw = element.getAttribute?.(name);
      const id = api?.extractFileId?.(raw) || (/^(?:file|asset)[-_]/i.test(String(raw || "")) ? String(raw) : "");
      if (id) return id;
    }
    for (const url of urls) {
      const id = api?.extractFileId?.(url);
      if (id) return id;
    }
    return "";
  }


  function getTurnMessageId(element) {
    const turn = element?.closest?.("[data-message-id], [data-testid^='conversation-turn-'], article, [data-turn]");
    return String(
      turn?.getAttribute?.("data-message-id")
      || turn?.querySelector?.("[data-message-id]")?.getAttribute?.("data-message-id")
      || "",
    );
  }

  function inspectReactFileMetadata(element) {
    const result = { names: [], urls: [], fileIds: [], sandboxPaths: [], messageIds: [] };
    const seenStrings = new Set();
    const visited = new WeakSet();
    let inspectedObjects = 0;
    const maxObjects = 360;
    const api = window.__CQS_CONVERSATION_API__;

    const addUnique = (list, value) => {
      const text = String(value || "").trim();
      if (text && !list.includes(text)) list.push(text);
    };

    function inspectString(value) {
      const text = String(value || "").trim();
      if (!text || text.length > 5000 || seenStrings.has(text)) return;
      seenStrings.add(text);
      const fileId = api?.extractFileId?.(text);
      if (fileId) addUnique(result.fileIds, fileId);
      const embeddedFileIds = text.match(/(?:file|asset)[-_][A-Za-z0-9_-]{8,}/gi) || [];
      embeddedFileIds.forEach((token) => {
        const parsed = api?.extractFileId?.(token);
        if (parsed) addUnique(result.fileIds, parsed);
      });
      let decodedText = text;
      try { decodedText = decodeURIComponent(text); } catch (_) {}
      const sandboxMatches = [
        ...(text.match(/sandbox:\/mnt\/data\/[^\s)\]}>'"]+/gi) || []),
        ...(decodedText.match(/sandbox:\/mnt\/data\/[^\s)\]}>'"]+/gi) || []),
        ...[...decodedText.matchAll(/(?:^|[\s"'])(\/mnt\/data\/[^\s)\]}>'"]+)/gi)].map((match) => `sandbox:${match[1]}`),
      ];
      sandboxMatches.forEach((path) => {
        addUnique(result.sandboxPaths, path);
        try {
          const name = decodeURIComponent(path.replace(/^sandbox:\/mnt\/data\//i, ""));
          extractFilenames(name, true).forEach((item) => addUnique(result.names, item));
        } catch (_) {}
      });
      if (isChatFileUrl(text)) addUnique(result.urls, text);
      let parsedJson = false;
      if (/^[\[{]/.test(text) && /[\]}]$/.test(text)) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object") {
            parsedJson = true;
            visit(parsed, 1);
          }
        } catch (_) {}
      }
      if (!parsedJson) extractFilenames(decodedText, true).forEach((name) => addUnique(result.names, name));
    }

    function visit(value, depth = 0) {
      if (depth > 7 || value == null || inspectedObjects >= maxObjects) return;
      if (typeof value === "string") {
        inspectString(value);
        return;
      }
      if (typeof value !== "object" || typeof value === "function") return;
      let object = value;
      try { object = value.wrappedJSObject || value; } catch (_) {}
      if (!object || typeof object !== "object") return;
      if (visited.has(object)) return;
      visited.add(object);
      inspectedObjects += 1;
      try {
        if (object instanceof Element || object === window || object === document) return;
      } catch (_) {}

      let keys = [];
      try { keys = Object.getOwnPropertyNames(object); } catch (_) { return; }
      for (const key of keys.slice(0, 100)) {
        if (["_owner", "alternate", "stateNode"].includes(key)) continue;
        let child;
        try { child = object[key]; } catch (_) { continue; }
        if (typeof child === "string" && /^(?:message_?id|messageId)$/i.test(key)
          && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(child.trim())) {
          addUnique(result.messageIds, child.trim());
        }
        if (typeof child === "string") inspectString(child);
        else if (child && typeof child === "object") visit(child, depth + 1);
      }
    }

    const hasFileMetadata = () => Boolean(
      result.names.length
      || result.urls.length
      || result.fileIds.length
      || result.sandboxPaths.length
    );

    let current = element;
    for (let ancestorDepth = 0; current && ancestorDepth < 5; ancestorDepth += 1, current = current.parentElement) {
      let raw = current;
      try { raw = current.wrappedJSObject || current; } catch (_) {}
      let ownKeys = [];
      try { ownKeys = Object.getOwnPropertyNames(raw); } catch (_) {}
      for (const key of ownKeys) {
        if (key.startsWith("__reactProps$") || key.startsWith("__reactEventHandlers$")) {
          try { visit(raw[key], 0); } catch (_) {}
          if (hasFileMetadata()) return result;
        }
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
          let fiber;
          try { fiber = raw[key]; } catch (_) { fiber = null; }
          const fiberSeen = new Set();
          for (let level = 0; fiber && level < 8 && !fiberSeen.has(fiber); level += 1) {
            fiberSeen.add(fiber);
            try { visit(fiber.memoizedProps, 0); } catch (_) {}
            try { visit(fiber.pendingProps, 0); } catch (_) {}
            try { visit(fiber.memoizedState, 0); } catch (_) {}
            if (hasFileMetadata()) return result;
            try { fiber = fiber.return; } catch (_) { fiber = null; }
          }
        }
      }
    }
    return result;
  }

  function slugifyGeneratedTitle(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/\bv?(?:ersion\s*)?\d+(?:\.\d+){1,4}\b/gi, " ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90);
  }

  function inferGeneratedSandboxCandidates(element, labelText) {
    const text = normalizeText(labelText);
    const isXpi = /(?:xpi|firefox[^\n]{0,24}(?:amo|add-?on)|amo[^\n]{0,24}firefox)/i.test(text);
    const isSourceZip = /(?:完整原始碼|原始碼[^\n]{0,20}zip|source(?:\s+code)?[^\n]{0,20}zip)/i.test(text);
    if (!isXpi && !isSourceZip) return { names: [], sandboxPaths: [] };

    const turn = element.closest?.("[data-testid^='conversation-turn-'], [data-message-id], article, [data-turn]") || element.parentElement;
    const rawTurnText = String(turn?.innerText || turn?.textContent || "").replace(/\u00a0/g, " ");
    const turnText = normalizeText(rawTurnText);
    const versionMatch = turnText.match(/\bv?(\d+\.\d+(?:\.\d+){0,3})\b/i);
    if (!versionMatch) return { names: [], sandboxPaths: [] };
    const version = versionMatch[1];
    const visibleNames = extractFilenames(rawTurnText, true).filter((name) => {
      if (!name.includes(version)) return false;
      if (isXpi) return /\.xpi$/i.test(name);
      return /\.zip$/i.test(name) && /(?:source|原始碼)/i.test(name);
    });
    if (visibleNames.length) {
      const names = [...new Set(visibleNames)];
      return {
        names,
        sandboxPaths: names.map((name) => `sandbox:/mnt/data/${name}`),
      };
    }
    const heading = [...(turn?.querySelectorAll?.("h1, h2, h3, strong") || [])]
      .map((node) => normalizeText(node.textContent || ""))
      .find((value) => value.includes(version))
      || rawTurnText.split(/\r?\n/).map(normalizeText).find((value) => value.includes(version))
      || "";
    let slug = slugifyGeneratedTitle(heading);
    if (!slug) slug = "chatgpt-output";
    const isFirefoxProject = /firefox|擴充功能|extension|amo/i.test(turnText);
    const bases = [slug];
    if (isFirefoxProject && !slug.endsWith("-firefox")) bases.unshift(`${slug}-firefox`);
    // Preserve the established filename family for this extension when the visible title
    // is "ChatGPT Queue Sender" but the actual artifact prefix includes "-firefox".
    if (/chatgpt-queue-sender/.test(slug)) bases.unshift("chatgpt-queue-sender-firefox");

    const names = [];
    for (const base of [...new Set(bases)]) {
      if (isXpi) names.push(`${base}-v${version}-amo.xpi`, `${base}-v${version}.xpi`);
      if (isSourceZip) names.push(`${base}-v${version}-source.zip`, `${base}-v${version}.zip`);
    }
    const uniqueNames = [...new Set(names)];
    return {
      names: uniqueNames,
      sandboxPaths: uniqueNames.map((name) => `sandbox:/mnt/data/${name}`),
    };
  }

  function hasAttachmentContext(element) {
    return Boolean(element.closest?.(
      "[data-testid*='file'], [data-testid*='attachment'], [data-testid*='download'], [data-testid*='artifact'], "
      + "[data-file-id], [data-asset-id], [data-download-url], [class*='attachment'], [class*='file-pill'], [class*='file-card'], [class*='download']",
    ));
  }

  function extractFilenames(text, allowGeneric = false) {
    const found = [];
    const seen = new Set();
    const source = String(text || "");
    const collect = (regex) => {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(source))) {
        let name = normalizeText(match[1]);
        try { name = decodeURIComponent(name); } catch (_) {}
        name = name
          .replace(/^sandbox:\/mnt\/data\//i, "")
          .replace(/^\/mnt\/data\//i, "")
          .replace(/^.*[\\/]/, "")
          .trim();
        const key = name.toLowerCase();
        if (name && name.includes(".") && !seen.has(key)) {
          seen.add(key);
          found.push(name);
        }
      }
      regex.lastIndex = 0;
    };
    collect(FILE_RE);
    if (allowGeneric) collect(GENERIC_FILE_RE);
    return found;
  }

  function parseSizeHint(text) {
    const match = String(text || "").match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB)(?:\s|$)/i);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = match[2].toUpperCase();
    const factors = { B: 1, KB: 1000, MB: 1000 ** 2, GB: 1000 ** 3, TB: 1000 ** 4, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3 };
    return Number.isFinite(value) ? Math.round(value * (factors[unit] || 1)) : null;
  }

  function filenameFromUrl(href) {
    try {
      const url = new URL(href, location.href);
      const dispositionName = url.searchParams.get("filename") || url.searchParams.get("name") || "";
      const last = dispositionName || decodeURIComponent(url.pathname.split("/").pop() || "");
      return extractFilenames(last, true)[0] || "";
    } catch (_) {
      return "";
    }
  }

  function detectAttachments(turn, role) {
    const attachments = new Map();
    const candidates = [...turn.querySelectorAll("a, button, [role='button'], [data-testid*='file'], [data-testid*='attachment'], [data-testid*='artifact'], [data-file-id], [data-asset-id], [data-download-url], img")];

    function addAttachment(name, url = "", kind = "", metadata = {}) {
      const cleanName = normalizeText(name).replace(/^下載\s*/i, "").slice(0, 180);
      if (!cleanName || cleanName.length < 3) return;
      if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(cleanName)) return;
      if (/^[0-9a-f-]{20,}$/i.test(cleanName) && !cleanName.includes(".")) return;
      const cleanUrl = String(url || "").trim();
      const key = `${cleanName.toLowerCase()}|${cleanUrl}`;
      const current = attachments.get(key) || {
        name: cleanName,
        type: kind || extensionToType(cleanName),
        role,
        url: "",
        downloadable: false,
        sourceKind: metadata.sourceKind || "visible-link",
        sizeHint: Number.isFinite(metadata.sizeHint) ? metadata.sizeHint : null,
        fileId: String(metadata.fileId || ""),
        messageId: String(metadata.messageId || ""),
        sandboxPath: String(metadata.sandboxPath || ""),
        sandboxPaths: Array.isArray(metadata.sandboxPaths) ? [...metadata.sandboxPaths] : [],
      };
      if (!current.url && cleanUrl && !/^javascript:/i.test(cleanUrl)) {
        try {
          current.url = /^(blob:|data:|sandbox:)/i.test(cleanUrl) ? cleanUrl : new URL(cleanUrl, location.href).href;
        } catch (_) {
          current.url = cleanUrl;
        }
      }
      current.downloadable = Boolean(current.downloadable || metadata.downloadable || metadata.fileId);
      if (!current.fileId && metadata.fileId) current.fileId = String(metadata.fileId);
      if (!current.messageId && metadata.messageId) current.messageId = String(metadata.messageId);
      if (!current.sandboxPath && metadata.sandboxPath) current.sandboxPath = String(metadata.sandboxPath);
      const mergedSandboxPaths = [
        ...(Array.isArray(current.sandboxPaths) ? current.sandboxPaths : []),
        current.sandboxPath,
        ...(Array.isArray(metadata.sandboxPaths) ? metadata.sandboxPaths : []),
        metadata.sandboxPath,
      ].map((value) => String(value || "").trim()).filter((value, index, array) => value && array.indexOf(value) === index);
      if (mergedSandboxPaths.length) current.sandboxPaths = mergedSandboxPaths;
      if (!Number.isFinite(current.sizeHint) && Number.isFinite(metadata.sizeHint)) current.sizeHint = metadata.sizeHint;
      if (metadata.sourceKind && current.sourceKind === "visible-link") current.sourceKind = metadata.sourceKind;
      attachments.set(key, current);
    }

    for (const element of candidates) {
      if (!isRendered(element) || element.matches?.("[data-cqs-direct-download]") || element.closest("pre, code, #cqs-export-control, #cqs-export-modal, [data-cqs-direct-download]")) continue;
      const urls = getElementUrls(element);
      const directFileId = getElementFileId(element, urls);
      const inAttachmentCard = hasAttachmentContext(element);
      const directHref = urls.find((value) => isChatFileUrl(value)) || urls[0] || "";
      const directTrustedUrl = isChatFileUrl(directHref);
      const explicitDownload = element.hasAttribute?.("download") || Boolean(element.querySelector?.("[download]"));
      const text = normalizeText(element.innerText || element.textContent || element.getAttribute("aria-label") || "");
      const isButtonLike = element.matches?.("button, [role='button']");
      const hasFileLabel = /(?:\bdownload\b|下載|附件|檔案|\bxpi\b|\bzip\b|source(?:\s+code)?|原始碼|artifact)/i.test(text);
      const shouldInspectReact = Boolean(
        isButtonLike
        && !directTrustedUrl
        && (inAttachmentCard || explicitDownload || hasFileLabel),
      );
      const reactMetadata = shouldInspectReact
        ? inspectReactFileMetadata(element)
        : { names: [], urls: [], fileIds: [], sandboxPaths: [], messageIds: [] };
      reactMetadata.urls.forEach((value) => {
        if (!urls.includes(value)) urls.push(value);
      });
      const href = urls.find((value) => isChatFileUrl(value)) || urls[0] || "";
      const fileId = directFileId || reactMetadata.fileIds[0] || "";
      const trustedUrl = isChatFileUrl(href);
      const messageId = getTurnMessageId(element) || reactMetadata.messageIds[0] || "";

      if (element.tagName === "IMG") {
        const alt = normalizeText(element.getAttribute("alt"));
        const src = element.getAttribute("src") || "";
        if (!src || /^(user|assistant|avatar|chatgpt|openai)$/i.test(alt)) continue;
        if (!isChatFileUrl(src) && !inAttachmentCard) continue;
        const fromAlt = extractFilenames(alt, true)[0];
        const fromUrl = filenameFromUrl(src);
        const imageName = fromAlt || fromUrl || `${alt && alt.length < 80 ? alt : tr("圖片", "Image")}.png`;
        addAttachment(imageName, src, tr("圖片", "Image"), { downloadable: true, sourceKind: "inline-image", sizeHint: parseSizeHint(element.parentElement?.innerText || "") });
        continue;
      }

      const names = extractFilenames(text, inAttachmentCard || trustedUrl || explicitDownload);
      reactMetadata.names.forEach((name) => {
        if (!names.some((current) => current.toLowerCase() === name.toLowerCase())) names.push(name);
      });
      const urlName = filenameFromUrl(href);
      if (urlName && !names.some((name) => name.toLowerCase() === urlName.toLowerCase())) names.push(urlName);

      let sandboxPaths = [...reactMetadata.sandboxPaths];
      if (!names.length && element.matches?.("button, [role='button']")) {
        const inferred = inferGeneratedSandboxCandidates(element, text);
        // Multiple inferred paths are fallbacks for one physical button, not separate files.
        // Keep one visible candidate and let the resolver try every sandbox path in order.
        if (inferred.names[0]) names.push(inferred.names[0]);
        sandboxPaths = [...sandboxPaths, ...inferred.sandboxPaths];
      }
      sandboxPaths = sandboxPaths.filter((value, index, array) => value && array.indexOf(value) === index);
      const sandboxPath = sandboxPaths[0] || "";
      const downloadable = Boolean(fileId || inAttachmentCard || trustedUrl || explicitDownload || (messageId && sandboxPath));
      const sourceKind = fileId
        ? "dom-file-id"
        : (sandboxPath ? "react-sandbox-button" : (inAttachmentCard ? "attachment-card" : (trustedUrl ? "chatgpt-file" : "external-link")));
      const sizeHint = parseSizeHint(text) || parseSizeHint(element.parentElement?.innerText || "");
      for (const name of names) addAttachment(name, href, "", {
        downloadable,
        sourceKind,
        sizeHint,
        fileId,
        messageId,
        sandboxPath,
        sandboxPaths,
      });
    }
    FILE_RE.lastIndex = 0;
    return [...attachments.values()];
  }

  function snapshotTurns(collection) {
    const converter = window.__CQS_MARKDOWN__;
    if (!converter) throw new Error(tr("Markdown 轉換器尚未載入，請重新整理頁面後再試。", "The Markdown converter is not loaded. Refresh the page and try again."));
    const turns = getTurnCandidates();
    turns.forEach((record, index) => {
      const contentRoot = getContentRoot(record);
      const markdown = converter.elementToMarkdown(contentRoot);
      const attachments = detectAttachments(record.turn, record.role);
      if (!markdown && !attachments.length) return;
      const key = getTurnKey(record, index);
      const existing = collection.get(key);
      const snapshot = {
        key,
        role: record.role,
        markdown,
        attachments,
        orderHint: getOrderHint(record, existing?.orderHint ?? collection.size),
        explicitOrder: (() => {
          const testId = String(record.turn.getAttribute?.("data-testid") || "");
          const match = testId.match(/^conversation-turn-(\d+)$/i);
          if (match) return Number(match[1]);
          const dataTurn = String(record.turn.getAttribute?.("data-turn") || "");
          return /^\d+$/.test(dataTurn) ? Number(dataTurn) : null;
        })(),
        firstSeen: existing?.firstSeen ?? collection.size,
      };
      collection.set(key, snapshot);
    });
    return turns.length;
  }

  function findScrollContainer() {
    const turns = getTurnCandidates();
    let node = turns.at(-1)?.turn || getVisibleMain();
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const scrollable = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 80;
      if (scrollable) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function getScrollMetrics(container) {
    if (container === document.documentElement || container === document.body || container === document.scrollingElement) {
      const scrolling = document.scrollingElement || document.documentElement;
      return { top: scrolling.scrollTop, height: scrolling.scrollHeight, client: window.innerHeight };
    }
    return { top: container.scrollTop, height: container.scrollHeight, client: container.clientHeight };
  }

  function setScrollTop(container, top) {
    if (container === document.documentElement || container === document.body || container === document.scrollingElement) {
      window.scrollTo(0, top);
    } else {
      try { container.scrollTo?.({ top, behavior: "auto" }); } catch (_) {}
      container.scrollTop = top;
    }
  }

  function forceConversationTop(container) {
    setScrollTop(container, 0);
    try { (document.scrollingElement || document.documentElement).scrollTop = 0; } catch (_) {}
    try { getTurnCandidates()[0]?.turn?.scrollIntoView?.({ block: "start", behavior: "auto" }); } catch (_) {}
    setScrollTop(container, 0);
  }

  function earliestExplicitTurnOrder(collection) {
    const indexes = [...collection.values()]
      .map((turn) => turn.explicitOrder)
      .filter((value) => Number.isInteger(value));
    return indexes.length ? Math.min(...indexes) : null;
  }

  async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function hasContiguousExplicitTurnOrder(collection) {
    const indexes = [...collection.values()]
      .map((turn) => turn.explicitOrder)
      .filter((value) => Number.isInteger(value));
    if (indexes.length !== collection.size || indexes.length < 2) return false;
    const unique = [...new Set(indexes)].sort((a, b) => a - b);
    return unique.length === indexes.length && unique[0] <= 1 && unique.at(-1) - unique[0] + 1 === unique.length;
  }

  async function collectConversation(progress) {
    const collection = new Map();
    const container = findScrollContainer();
    const original = getScrollMetrics(container);
    const originalNearBottom = original.top + original.client >= original.height - 80;
    const originalRatio = original.height > original.client ? original.top / (original.height - original.client) : 0;
    const startedAt = Date.now();
    let reachedTop = false;
    let reachedBottom = false;

    try {
      snapshotTurns(collection);
      progress(collection.size, tr("正在快速載入較早的對話……", "Quickly loading earlier messages…"), { phase: "top", progress: 4 });

      // 直接跳到最上方，比逐頁向上捲動快得多。停留短暫時間，讓 ChatGPT
      // 有機會載入更早的訊息；只有訊息數與頁面高度都穩定後才繼續。
      forceConversationTop(container);
      await wait(260);
      let topPositionRounds = 0;
      let countStableRounds = 0;
      let lastCount = -1;
      for (let round = 0; round < 14 && Date.now() - startedAt < 7000; round += 1) {
        if (state.cancelRequested) throw new Error(exportCancelled());
        forceConversationTop(container);
        await wait(130);
        snapshotTurns(collection);
        const metrics = getScrollMetrics(container);
        if (metrics.top <= 6) topPositionRounds += 1;
        else topPositionRounds = 0;
        if (collection.size === lastCount) countStableRounds += 1;
        else countStableRounds = 0;
        lastCount = collection.size;
        const earliestOrder = earliestExplicitTurnOrder(collection);
        progress(collection.size, tr("正在確認最早的對話內容……", "Checking the earliest conversation content…"), {
          phase: "top",
          progress: 8 + ((round + 1) / 14) * 24,
          round: round + 1,
          totalRounds: 14,
        });
        // Page height can keep changing while images finish loading. Reaching the actual
        // top and seeing a stable message count is stronger evidence than stable height.
        if (topPositionRounds >= 2 && (countStableRounds >= 2 || (Number.isInteger(earliestOrder) && earliestOrder <= 1))) {
          reachedTop = true;
          break;
        }
      }

      // 先直接跳到底部。一般 ChatGPT 對話的所有 turn 都仍在 DOM 中，
      // 因此只需在頂部與底部各取一次快照即可完成，不必沿著長回答逐屏掃描。
      let metrics = getScrollMetrics(container);
      let maxTop = Math.max(0, metrics.height - metrics.client);
      const countBeforeBottomJump = collection.size;
      setScrollTop(container, maxTop);
      await wait(140);
      snapshotTurns(collection);
      metrics = getScrollMetrics(container);
      maxTop = Math.max(0, metrics.height - metrics.client);
      if (metrics.top < maxTop - 3) {
        setScrollTop(container, maxTop);
        await wait(100);
        snapshotTurns(collection);
        metrics = getScrollMetrics(container);
        maxTop = Math.max(0, metrics.height - metrics.client);
      }

      const directJumpLooksComplete = hasContiguousExplicitTurnOrder(collection)
        && collection.size >= countBeforeBottomJump
        && metrics.top >= maxTop - 3;

      if (maxTop <= 3 || directJumpLooksComplete) {
        reachedBottom = true;
        progress(collection.size, tr("已快速完成目前分支掃描。", "Current branch scan completed quickly."), { phase: "bottom", progress: 58 });
      } else {
        // 只有在偵測到虛擬捲動或 turn 編號不連續時，才執行備援掃描。
        // 每次至少跨越 1.45 個畫面，並將總檢查點限制在 56 個內。
        progress(collection.size, tr("正在快速掃描目前分支……", "Quickly scanning the current branch…"), { phase: "scan", progress: 36 });
        setScrollTop(container, 0);
        await wait(70);
        snapshotTurns(collection);

        for (let stepIndex = 0; stepIndex < 56 && Date.now() - startedAt < 12000; stepIndex += 1) {
          if (state.cancelRequested) throw new Error(exportCancelled());
          metrics = getScrollMetrics(container);
          maxTop = Math.max(0, metrics.height - metrics.client);
          if (metrics.top >= maxTop - 3) {
            await wait(100);
            snapshotTurns(collection);
            const settled = getScrollMetrics(container);
            const settledMaxTop = Math.max(0, settled.height - settled.client);
            if (settled.top >= settledMaxTop - 3) {
              reachedBottom = true;
              break;
            }
            continue;
          }

          const remaining = maxTop - metrics.top;
          const minimumStride = Math.max(720, metrics.client * 1.45);
          const cappedStride = Math.max(minimumStride, remaining / Math.max(1, 56 - stepIndex));
          setScrollTop(container, Math.min(maxTop, metrics.top + cappedStride));
          await wait(65);
          snapshotTurns(collection);
          progress(collection.size, tr("正在快速掃描目前分支……", "Quickly scanning the current branch…"), { phase: "scan", progress: 36 + ((stepIndex + 1) / 56) * 22, step: stepIndex + 1, totalSteps: 56 });
        }
      }
    } finally {
      const metrics = getScrollMetrics(container);
      const restoreTop = originalNearBottom
        ? Math.max(0, metrics.height - metrics.client)
        : Math.max(0, originalRatio * Math.max(0, metrics.height - metrics.client));
      setScrollTop(container, restoreTop);
    }

    const turns = [...collection.values()].sort((a, b) => {
      if (a.orderHint !== b.orderHint) return a.orderHint - b.orderHint;
      return a.firstSeen - b.firstSeen;
    });
    return { turns, complete: reachedTop && reachedBottom, reachedTop, reachedBottom, elapsedMs: Date.now() - startedAt };
  }

  function getConversationTitle() {
    const title = normalizeText(document.title)
      .replace(/\s*[-–—|]\s*ChatGPT\s*$/i, "")
      .replace(/^ChatGPT\s*[-–—|]\s*/i, "");
    if (title && !/^chatgpt$/i.test(title)) return title;
    return tr("ChatGPT 對話紀錄", "ChatGPT Conversation");
  }

  function formatLocalDate(date) {
    try {
      return new Intl.DateTimeFormat(locale, {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }).format(date);
    } catch (_) {
      return date.toISOString();
    }
  }

  function buildMarkdown(turns, complete) {
    const title = getConversationTitle();
    const lines = [
      `# ${title}`,
      "",
      tr("- 匯出時間：{time}", "- Exported: {time}", { time: formatLocalDate(new Date()) }),
      tr("- 對話網址：{url}", "- Conversation URL: {url}", { url: location.href }),
      tr("- 匯出範圍：目前顯示的對話分支", "- Export scope: currently displayed conversation branch"),
      tr("- 完整性：{status}", "- Completeness: {status}", { status: complete ? tr("已完成自動載入與掃描", "automatic loading and scanning completed") : tr("僅能確認已掃描到的內容，較早或尚未載入的訊息可能缺漏", "only scanned content could be confirmed; earlier or unloaded messages may be missing") }),
      tr("- 訊息數量：{count}", "- Message count: {count}", { count: turns.length }),
      tr("- 匯出工具：ChatGPT Queue Sender v0.9.4", "- Exported by: ChatGPT Queue Sender v0.9.4"),
      "",
      "---",
      "",
    ];
    let hasLinkedAttachment = false;

    turns.forEach((turn, index) => {
      const roleTitle = turn.role === "user" ? tr("使用者", "User") : "ChatGPT";
      lines.push(`## ${index + 1}. ${roleTitle}`, "");
      if (turn.markdown) lines.push(turn.markdown, "");
      if (turn.attachments.length) {
        lines.push(tr("### 附加檔案", "### Attachments"), "");
        for (const attachment of turn.attachments) {
          lines.push(`- \`${attachment.name.replace(/`/g, "\\`")}\``);
          lines.push(tr("  - 類型：{type}", "  - Type: {type}", { type: attachment.type }));
          lines.push(tr("  - 來源：{source}", "  - Source: {source}", { source: attachment.role === "user" ? tr("使用者上傳", "User upload") : tr("ChatGPT 回覆或產生", "ChatGPT response or generated file") }));
          if (attachment.url) {
            hasLinkedAttachment = true;
            lines.push(tr("  - [開啟或下載可見連結]({url})", "  - [Open or download visible link]({url})", { url: attachment.url }));
          }
        }
        lines.push("");
      }
      lines.push("---", "");
    });

    if (hasLinkedAttachment) {
      lines.push(
        tr("> 注意：附件連結可能需要登入 ChatGPT，也可能因權限或有效期限而失效。Markdown 匯出不會自動下載附件實體。", "> Note: Attachment links may require a ChatGPT login and can expire or be restricted. Markdown export does not download attachment files."),
        "",
      );
    }
    lines.push(tr("> 本檔案只包含目前頁面可取得的對話內容，不包含隱藏系統指令、內部推理、帳號資料或其他聊天室。", "> This file contains only conversation content available on the current page. It does not include hidden system instructions, internal reasoning, account data, or other conversations."), "");
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  }

  function safeFilename(value) {
    const clean = normalizeText(value)
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/[. ]+$/g, "")
      .slice(0, 90) || "Conversation";
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    return `ChatGPT_${clean}_${stamp}.md`;
  }

  function downloadMarkdown(markdown) {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = createElement("a");
    anchor.href = url;
    anchor.download = safeFilename(getConversationTitle());
    anchor.hidden = true;
    document.documentElement.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  function isGenerating() {
    const selectors = [
      "button[data-testid='stop-button']",
      "button[data-testid='composer-stop-button']",
      "button[aria-label*='Stop generating']",
      "button[aria-label*='停止生成']",
      "button[aria-label*='停止回覆']",
    ];
    return selectors.some((selector) => [...document.querySelectorAll(selector)].some(isRendered));
  }

  function acquireExportJob() {
    if (state.exporting) return false;
    state.exporting = true;
    state.cancelRequested = false;
    return true;
  }

  function releaseExportJob() {
    state.exporting = false;
    state.cancelRequested = false;
  }

  function requestExportCancel() {
    state.cancelRequested = true;
  }

  async function beginMarkdownExport() {
    if (!acquireExportJob()) {
      showExportToast(tr("正在整理或封存對話，請稍候。", "A conversation export or archive is already in progress. Please wait."));
      return;
    }
    if (isGenerating() && !window.confirm(tr("ChatGPT 目前仍在產生回覆。現在匯出可能包含尚未完成的內容，仍要繼續嗎？", "ChatGPT is still generating a response. The export may include unfinished content. Continue?"))) {
      releaseExportJob();
      return;
    }
    const status = createElement("p", { className: "cqs-export-progress-text", text: tr("正在準備匯出……", "Preparing export…") });
    const count = createElement("strong", { className: "cqs-export-progress-count", text: tr("已找到 0 則訊息", "0 messages found") });
    const note = createElement("p", { className: "cqs-export-progress-note", text: tr("處理期間頁面會自動捲動，完成後會回到原本位置。", "The page may scroll automatically during processing and will return to its original position afterward.") });
    const content = createElement("div", { className: "cqs-export-progress" });
    content.append(count, status, note);

    openModal({
      title: tr("正在整理完整對話", "Preparing full conversation"),
      description: tr("自動載入目前分支較早的內容，再轉換成 Markdown。", "Loads earlier content in the current branch, then converts it to Markdown."),
      content,
      closeable: false,
      actions: [{
        label: tr("取消", "Cancel"),
        danger: true,
        onClick: () => {
          requestExportCancel();
          status.textContent = tr("正在取消並恢復原本位置……", "Cancelling and restoring the original position…");
        },
      }],
      className: "cqs-export-progress-modal",
    });

    try {
      const result = await collectConversation((messageCount, message) => {
        count.textContent = tr("已找到 {count} 則訊息", "{count} messages found", { count: messageCount });
        status.textContent = message;
      });
      if (!result.turns.length) throw new Error(tr("沒有找到可匯出的對話內容。請確認目前位於 ChatGPT 聊天室。", "No conversation content was found to export. Make sure this is a ChatGPT conversation."));
      if (!result.complete) {
        closeModal();
        const proceed = window.confirm(tr("已找到 {count} 則訊息，但無法確認較早內容是否全部載入。要匯出目前已找到的內容嗎？", "{count} messages were found, but earlier content may not be fully loaded. Export the content found so far?", { count: result.turns.length }));
        if (!proceed) return;
      }
      const markdown = buildMarkdown(result.turns, result.complete);
      downloadMarkdown(markdown);
      closeModal();
      showExportToast(tr("Markdown 已下載：{count} 則訊息，耗時 {seconds} 秒。", "Markdown downloaded: {count} messages in {seconds} seconds.", { count: result.turns.length, seconds: (result.elapsedMs / 1000).toFixed(1) }));
      document.dispatchEvent(new CustomEvent("cqs:conversation-exported", { detail: { count: result.turns.length, complete: result.complete } }));
    } catch (error) {
      closeModal();
      if (isExportCancelled(error)) showExportToast(tr("已取消匯出。", "Export cancelled."));
      else {
        console.error("[CQS Export]", error);
        showExportToast(error?.message || tr("匯出失敗，請重新整理頁面後再試。", "Export failed. Refresh the page and try again."));
      }
    } finally {
      releaseExportJob();
    }
  }

  function getLatestAssistantRecord() {
    const records = getTurnCandidates().filter((record) => record.role === "assistant");
    return records.at(-1) || null;
  }

  function addCopyHandoffButton() {
    const record = getLatestAssistantRecord();
    if (!record) return false;
    const turn = record.turn;
    if (turn.querySelector("[data-cqs-copy-handoff]")) return true;
    const button = createElement("button", { type: "button", text: tr("複製交接摘要", "Copy handoff summary") });
    button.className = "cqs-copy-handoff-button";
    button.dataset.cqsCopyHandoff = "1";
    button.addEventListener("click", async () => {
      const converter = window.__CQS_MARKDOWN__;
      const markdown = converter?.elementToMarkdown(getContentRoot(record)) || normalizeText(record.roleNode.innerText || record.roleNode.textContent);
      try {
        await navigator.clipboard.writeText(markdown);
        showExportToast(tr("已複製交接摘要。", "Handoff summary copied."));
      } catch (_) {
        showExportToast(tr("Firefox 未允許寫入剪貼簿，請使用 ChatGPT 原生複製按鈕。", "Firefox did not allow clipboard access. Use ChatGPT's built-in copy button."));
      }
    });
    const target = turn.querySelector("[data-testid*='copy'], .text-token-text-secondary")?.parentElement || record.roleNode;
    target.appendChild(button);
    return true;
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#cqs-export-control") && !event.target.closest("#cqs-export-menu")) setMenuOpen(false);
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMenuOpen(false);
      if (!state.exporting) closeModal();
    }
  });
  window.addEventListener("resize", positionControl, { passive: true });

  const observer = new MutationObserver(() => {
    if (state.refreshScheduled) return;
    state.refreshScheduled = true;
    setTimeout(() => {
      state.refreshScheduled = false;
      ensureControl();
      positionControl();
    }, 300);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.__CQS_CONVERSATION_EXPORT__ = Object.freeze({
    openModal,
    closeModal,
    showToast: showExportToast,
    setMenuOpen,
    createElement,
    addCopyHandoffButton,
    beginMarkdownExport,
    collectConversation,
    buildMarkdown,
    getConversationTitle,
    isGenerating,
    acquireExportJob,
    releaseExportJob,
    requestExportCancel,
    inspectReactFileMetadata,
    inferGeneratedSandboxCandidates,
    detectAttachments,
  });

  ensureControl();
})();
