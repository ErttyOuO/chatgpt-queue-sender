(() => {
  if (window.__CQS_DIRECT_DOWNLOAD__) return;

  const extensionApi = globalThis.browser || globalThis.chrome;
  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));
  const CITATION_SELECTOR = "button[data-file-citation-primary-file-id], button[data-file-citation-group-identity]";
  const LIBRARY_FILE_ICON_SELECTOR = "svg[data-testid='library-file-icon']";
  let observer = null;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function stripDownloadPrefix(value) {
    return normalizeText(value).replace(/^(?:下載|下载|download)\s*[:：-]?\s*/i, "").trim();
  }

  function looksLikeFilename(value) {
    const text = stripDownloadPrefix(value);
    return /\.[A-Za-z0-9][A-Za-z0-9._+-]{0,15}$/i.test(text) && !/[\\/]$/.test(text);
  }

  function isAllowedFileUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    if (/^(?:sandbox:|blob:|data:)/i.test(raw)) return true;
    try {
      const url = new URL(raw, location.href || location.origin);
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

  function citationFileId(button) {
    if (!button) return "";
    const groupSize = Number(button.getAttribute?.("data-file-citation-group-size") || 1);
    if (Number.isFinite(groupSize) && groupSize > 1) return "";
    const direct = normalizeText(button.getAttribute?.("data-file-citation-primary-file-id"));
    const api = window.__CQS_CONVERSATION_API__;
    if (direct) return api?.extractFileId?.(direct) || direct;

    const identity = normalizeText(button.getAttribute?.("data-file-citation-group-identity"));
    if (!identity) return "";
    const matches = identity.match(/(?:file|asset)[-_][A-Za-z0-9_-]{8,}/gi) || [];
    const unique = [...new Set(matches.map((value) => api?.extractFileId?.(value) || value).filter(Boolean))];
    return unique.length === 1 ? unique[0] : "";
  }

  function citationFilename(button, fileId = "") {
    const candidates = [
      button?.getAttribute?.("title"),
      button?.getAttribute?.("aria-label"),
      button?.textContent,
    ].map(normalizeText).filter(Boolean);
    const name = candidates.find((value) => value && value !== fileId) || fileId || tr("ChatGPT 檔案", "ChatGPT file");
    return name.slice(0, 240);
  }

  function isAssistantCitation(button) {
    if (!button) return false;
    const directRole = button.closest?.("[data-message-author-role]");
    if (directRole) return directRole.getAttribute("data-message-author-role") === "assistant";

    const turn = button.closest?.("[data-testid^='conversation-turn-'], article, [data-turn]");
    if (!turn?.querySelectorAll) return false;
    const roleNodes = [...turn.querySelectorAll("[data-message-author-role]")];
    if (!roleNodes.length) return false;
    return roleNodes.some((node) => node.getAttribute("data-message-author-role") === "assistant")
      && !roleNodes.some((node) => node.getAttribute("data-message-author-role") === "user");
  }

  function hasLibraryFileIcon(button) {
    return Boolean(button?.querySelector?.(LIBRARY_FILE_ICON_SELECTOR));
  }

  function isLikelyFileButton(button) {
    if (!button || String(button.tagName || "").toUpperCase() !== "BUTTON") return false;
    if (button.matches?.("[data-cqs-direct-download]")) return false;
    return Boolean(button.matches?.(CITATION_SELECTOR) || hasLibraryFileIcon(button));
  }

  function getTurnMessageId(button) {
    const turn = button?.closest?.("[data-message-id], [data-testid^='conversation-turn-'], article, [data-turn]");
    return String(
      turn?.getAttribute?.("data-message-id")
      || turn?.querySelector?.("[data-message-id]")?.getAttribute?.("data-message-id")
      || "",
    );
  }

  function inspectButtonMetadata(button) {
    const groupSize = Number(button?.getAttribute?.("data-file-citation-group-size") || 1);
    if (Number.isFinite(groupSize) && groupSize > 1) {
      return { ambiguous: true, names: [], urls: [], fileIds: [], sandboxPaths: [], messageIds: [] };
    }

    const directId = citationFileId(button);
    const exportApi = window.__CQS_CONVERSATION_EXPORT__;
    let react = { names: [], urls: [], fileIds: [], sandboxPaths: [], messageIds: [] };
    try {
      if (exportApi?.inspectReactFileMetadata) react = exportApi.inspectReactFileMetadata(button) || react;
    } catch (_) {}

    const fileIds = uniqueStrings([directId, ...(react.fileIds || [])]);
    const urls = uniqueStrings(react.urls || []).filter(isAllowedFileUrl);
    const sandboxPaths = uniqueStrings(react.sandboxPaths || []);
    const messageIds = uniqueStrings([getTurnMessageId(button), ...(react.messageIds || [])]);
    const names = uniqueStrings(react.names || []);
    const ambiguous = !directId && fileIds.length > 1;
    const fileId = directId || (fileIds.length === 1 ? fileIds[0] : "");
    const visible = stripDownloadPrefix(citationFilename(button, fileId));
    const filename = looksLikeFilename(visible)
      ? visible
      : (names.length === 1 ? names[0] : (visible || names[0] || fileId || tr("ChatGPT 檔案", "ChatGPT file")));

    return {
      ambiguous,
      fileId,
      fileIds,
      url: urls.length === 1 ? urls[0] : "",
      urls,
      name: filename.slice(0, 240),
      names,
      messageId: messageIds[0] || "",
      messageIds,
      sandboxPath: sandboxPaths[0] || "",
      sandboxPaths,
      hasIdentity: Boolean(fileId || urls.length === 1 || (messageIds.length && sandboxPaths.length)),
      sourceKind: directId ? "file-citation-direct-download" : "react-file-button-direct-download",
    };
  }

  function normalizedFilenameKey(value) {
    return stripDownloadPrefix(value).toLowerCase().replace(/[\s_-]+/g, " ").trim();
  }

  function versionToken(value) {
    return normalizeText(value).match(/\bv?(\d+\.\d+(?:\.\d+){0,3})\b/i)?.[1] || "";
  }

  function candidateButtonsInTurn(button) {
    const turn = button?.closest?.("[data-testid^='conversation-turn-'], article, [data-turn]");
    if (!turn?.querySelectorAll) return [];
    const buttons = [...turn.querySelectorAll("button")].filter((item) => isLikelyFileButton(item) && isAssistantCitation(item));
    return buttons;
  }

  function chooseStructuredAttachment(nativeButton, attachments) {
    const assistantFiles = (attachments || []).filter((item) => String(item?.role || "assistant") !== "user");
    if (!assistantFiles.length) return null;

    const visibleLabel = stripDownloadPrefix(citationFilename(nativeButton));
    const visibleKey = normalizedFilenameKey(visibleLabel);
    if (looksLikeFilename(visibleLabel)) {
      const exact = assistantFiles.filter((item) => normalizedFilenameKey(item?.resolvedFileName || item?.name || "") === visibleKey);
      if (exact.length === 1) return exact[0];
    }

    const version = versionToken(visibleLabel);
    if (version) {
      const versionMatches = assistantFiles.filter((item) => versionToken(item?.resolvedFileName || item?.name || "") === version);
      if (versionMatches.length === 1) return versionMatches[0];
    }

    const messageId = getTurnMessageId(nativeButton);
    if (messageId) {
      const sameMessage = assistantFiles
        .filter((item) => String(item?.messageId || "") === messageId)
        .sort((a, b) => Number(a?.appearanceIndex || 0) - Number(b?.appearanceIndex || 0));
      if (sameMessage.length === 1) return sameMessage[0];
      if (sameMessage.length > 1) {
        const buttons = candidateButtonsInTurn(nativeButton);
        const index = buttons.indexOf(nativeButton);
        if (index >= 0 && buttons.length === sameMessage.length && sameMessage[index]) return sameMessage[index];
      }
    }

    return assistantFiles.length === 1 ? assistantFiles[0] : null;
  }

  async function buildDownloadReference(nativeButton, context) {
    const metadata = inspectButtonMetadata(nativeButton);
    if (metadata.ambiguous) return { metadata, ref: null };

    if (metadata.hasIdentity) {
      return {
        metadata,
        ref: {
          fileId: metadata.fileId,
          name: metadata.name,
          role: "assistant",
          conversationId: context.conversationId || window.__CQS_CONVERSATION_API__?.getConversationId?.() || "",
          messageId: metadata.messageId,
          sandboxPath: metadata.sandboxPath,
          sandboxPaths: [...metadata.sandboxPaths],
          resolvedDownloadUrl: metadata.url,
          sourceKind: metadata.sourceKind,
        },
      };
    }

    const conversationApi = window.__CQS_CONVERSATION_API__;
    if (!conversationApi?.collectAttachments) return { metadata, ref: null };
    try {
      const structured = await conversationApi.collectAttachments();
      const match = chooseStructuredAttachment(nativeButton, structured?.attachments || []);
      return { metadata, ref: match ? { ...match, role: "assistant" } : null, structured };
    } catch (_) {
      return { metadata, ref: null };
    }
  }

  function iconMarkup(state = "idle") {
    if (state === "loading") {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25a6.75 6.75 0 1 0 6.37 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    }
    if (state === "success") {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.2 3.1 3.1L15.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (state === "error") {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v7M10 14.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25v8.2m0 0 3.1-3.1m-3.1 3.1-3.1-3.1M4.25 13.5v1.35c0 1.05.85 1.9 1.9 1.9h7.7c1.05 0 1.9-.85 1.9-1.9V13.5" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function dispatchStatus(message, kind = "info") {
    try {
      document.dispatchEvent(new CustomEvent("cqs:direct-download-status", {
        detail: { message: String(message || ""), kind },
      }));
    } catch (_) {}
  }

  function setButtonState(button, state, filename, message = "") {
    if (!button) return;
    button.dataset.cqsState = state;
    button.innerHTML = iconMarkup(state);
    const idleLabel = tr("直接下載 {name}", "Download {name}", { name: filename });
    const labels = {
      loading: tr("正在準備下載 {name}", "Preparing download for {name}", { name: filename }),
      success: tr("已開始下載 {name}", "Download started: {name}", { name: filename }),
      error: message || tr("下載失敗：{name}", "Download failed: {name}", { name: filename }),
    };
    const label = state === "idle" ? idleLabel : labels[state] || idleLabel;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.disabled = state === "loading";
  }

  async function requestDirectDownload(nativeButton, directButton) {
    const conversationApi = window.__CQS_CONVERSATION_API__;
    const initialMetadata = inspectButtonMetadata(nativeButton);
    const requestedName = initialMetadata.name || stripDownloadPrefix(citationFilename(nativeButton));

    if (!conversationApi?.resolveAttachment || !extensionApi?.runtime?.sendMessage) {
      setButtonState(directButton, "error", requestedName);
      dispatchStatus(tr("直接下載元件尚未準備完成，請重新整理頁面後再試。", "Direct download is not ready. Refresh the page and try again."), "error");
      setTimeout(() => setButtonState(directButton, "idle", requestedName), 2400);
      return { ok: false, filename: requestedName, message: tr("直接下載元件尚未準備完成，請重新整理頁面後再試。", "Direct download is not ready. Refresh the page and try again.") };
    }

    setButtonState(directButton, "loading", requestedName);
    try {
      const context = await conversationApi.getDownloadContext?.() || {
        conversationId: conversationApi.getConversationId?.() || "",
        accessToken: "",
        accountId: "",
      };
      const built = await buildDownloadReference(nativeButton, context);
      if (built.metadata?.ambiguous) {
        throw new Error(tr("這個按鈕同時對應多個檔案，為避免下載錯誤檔案，請使用 ChatGPT 原生下載。", "This button maps to multiple files. Use ChatGPT's native download to avoid downloading the wrong file."));
      }
      if (!built.ref) {
        throw new Error(tr("找不到這個檔案的可下載識別資訊。", "No downloadable identity could be found for this file."));
      }

      const ref = {
        ...built.ref,
        role: "assistant",
        conversationId: built.ref.conversationId || context.conversationId || conversationApi.getConversationId?.() || "",
      };
      const alreadyResolved = String(ref.resolvedDownloadUrl || "").trim();
      const resolved = alreadyResolved ? ref : await conversationApi.resolveAttachment(ref, context);
      const finalRequestedName = resolved?.resolvedFileName || resolved?.name || ref.name || requestedName;
      const response = await extensionApi.runtime.sendMessage({
        type: "CQS_DIRECT_DOWNLOAD",
        url: resolved?.resolvedDownloadUrl || ref.resolvedDownloadUrl || "",
        filename: finalRequestedName,
        fileId: resolved?.fileId || ref.fileId || "",
        conversationId: ref.conversationId,
        messageId: resolved?.messageId || ref.messageId || "",
        sandboxPath: resolved?.sandboxPath || ref.sandboxPath || "",
        sandboxPaths: uniqueStrings([
          ...(Array.isArray(resolved?.sandboxPaths) ? resolved.sandboxPaths : []),
          ...(Array.isArray(ref.sandboxPaths) ? ref.sandboxPaths : []),
        ]),
        role: "assistant",
        accessToken: built.structured?.accessToken || context.accessToken || "",
        accountId: built.structured?.accountId || context.accountId || "",
        origin: location.origin,
      });
      if (!response?.ok) throw new Error(response?.message || tr("Firefox 沒有開始下載。", "Firefox did not start the download."));

      const finalName = response.filename || finalRequestedName;
      setButtonState(directButton, "success", finalName);
      dispatchStatus(tr("已開始下載：{name}", "Download started: {name}", { name: finalName }), "success");
      setTimeout(() => setButtonState(directButton, "idle", finalName), 1800);
      return { ok: true, filename: finalName, downloadId: response.downloadId, strategy: response.strategy || "" };
    } catch (error) {
      const message = error?.message || tr("下載失敗。", "Download failed.");
      setButtonState(directButton, "error", requestedName, message);
      dispatchStatus(tr("直接下載失敗：{error}", "Direct download failed: {error}", { error: message }), "error");
      setTimeout(() => setButtonState(directButton, "idle", requestedName), 3200);
      return { ok: false, filename: requestedName, message };
    }
  }

  function ensureDirectDownloadButton(nativeButton) {
    if (!nativeButton || !isLikelyFileButton(nativeButton) || !isAssistantCitation(nativeButton)) return null;
    const metadata = inspectButtonMetadata(nativeButton);
    if (metadata.ambiguous) return null;

    const adjacent = nativeButton.nextElementSibling;
    if (adjacent?.matches?.("button[data-cqs-direct-download='1']")) return adjacent;

    const filename = metadata.name || stripDownloadPrefix(citationFilename(nativeButton, metadata.fileId));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cqs-direct-download-button";
    button.dataset.cqsDirectDownload = "1";
    button.dataset.cqsState = "idle";
    setButtonState(button, "idle", filename);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestDirectDownload(nativeButton, button);
    });
    nativeButton.insertAdjacentElement("afterend", button);
    return button;
  }

  function collectCandidateButtons(root) {
    const candidates = new Set();
    const addButton = (value) => {
      const button = String(value?.tagName || "").toUpperCase() === "BUTTON" ? value : value?.closest?.("button");
      if (button && isLikelyFileButton(button)) candidates.add(button);
    };

    if (!root) return [];
    if (root.matches?.(CITATION_SELECTOR) || root.matches?.(LIBRARY_FILE_ICON_SELECTOR)) addButton(root);
    if (String(root.tagName || "").toUpperCase() === "BUTTON" && isLikelyFileButton(root)) addButton(root);
    if (root.querySelectorAll) {
      for (const button of root.querySelectorAll(CITATION_SELECTOR)) addButton(button);
      for (const icon of root.querySelectorAll(LIBRARY_FILE_ICON_SELECTOR)) addButton(icon);
    }
    return [...candidates];
  }

  function scanNode(root) {
    if (!root) return 0;
    let count = 0;
    for (const button of collectCandidateButtons(root)) {
      if (ensureDirectDownloadButton(button)) count += 1;
    }
    return count;
  }

  function start() {
    scanNode(document);
    if (!document.documentElement || typeof MutationObserver !== "function") return;
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          scanNode(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes || []) {
          if (node?.nodeType === Node.ELEMENT_NODE) scanNode(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-file-citation-primary-file-id", "data-file-citation-group-identity", "data-message-author-role", "aria-label", "title"],
    });
  }

  window.__CQS_DIRECT_DOWNLOAD__ = Object.freeze({
    citationFileId,
    citationFilename,
    isAssistantCitation,
    isLikelyFileButton,
    inspectButtonMetadata,
    chooseStructuredAttachment,
    buildDownloadReference,
    requestDirectDownload,
    ensureDirectDownloadButton,
    collectCandidateButtons,
    scanNode,
    stop() { observer?.disconnect?.(); observer = null; },
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
