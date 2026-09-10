(() => {
  if (window.__CQS_DIRECT_DOWNLOAD__) return;

  const extensionApi = globalThis.browser || globalThis.chrome;
  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));
  const CITATION_SELECTOR = "button[data-file-citation-primary-file-id], button[data-file-citation-group-identity]";
  let observer = null;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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
    const fileId = citationFileId(nativeButton);
    const requestedName = citationFilename(nativeButton, fileId);
    if (!fileId) {
      setButtonState(directButton, "error", requestedName, tr("找不到這個檔案的識別碼。", "This file does not expose a downloadable file identifier."));
      dispatchStatus(tr("找不到這個檔案的識別碼，無法直接下載。", "The file identifier could not be found, so direct download is unavailable."), "error");
      setTimeout(() => setButtonState(directButton, "idle", requestedName), 2400);
      return;
    }

    const conversationApi = window.__CQS_CONVERSATION_API__;
    if (!conversationApi?.resolveAttachment || !extensionApi?.runtime?.sendMessage) {
      setButtonState(directButton, "error", requestedName);
      dispatchStatus(tr("直接下載元件尚未準備完成，請重新整理頁面後再試。", "Direct download is not ready. Refresh the page and try again."), "error");
      setTimeout(() => setButtonState(directButton, "idle", requestedName), 2400);
      return;
    }

    setButtonState(directButton, "loading", requestedName);
    try {
      const context = await conversationApi.getDownloadContext?.() || {
        conversationId: conversationApi.getConversationId?.() || "",
        accessToken: "",
        accountId: "",
      };
      const ref = {
        fileId,
        name: requestedName,
        role: "assistant",
        conversationId: context.conversationId || conversationApi.getConversationId?.() || "",
        sourceKind: "file-citation-direct-download",
      };
      const resolved = await conversationApi.resolveAttachment(ref, context);
      const response = await extensionApi.runtime.sendMessage({
        type: "CQS_DIRECT_DOWNLOAD",
        url: resolved?.resolvedDownloadUrl || "",
        filename: resolved?.resolvedFileName || resolved?.name || requestedName,
        fileId,
        conversationId: ref.conversationId,
        messageId: resolved?.messageId || "",
        sandboxPath: resolved?.sandboxPath || "",
        sandboxPaths: Array.isArray(resolved?.sandboxPaths) ? [...resolved.sandboxPaths] : [],
        role: "assistant",
        accessToken: context.accessToken || "",
        accountId: context.accountId || "",
        origin: location.origin,
      });
      if (!response?.ok) throw new Error(response?.message || tr("Firefox 沒有開始下載。", "Firefox did not start the download."));

      const finalName = response.filename || resolved?.resolvedFileName || requestedName;
      setButtonState(directButton, "success", finalName);
      dispatchStatus(tr("已開始下載：{name}", "Download started: {name}", { name: finalName }), "success");
      setTimeout(() => setButtonState(directButton, "idle", finalName), 1800);
    } catch (error) {
      const message = error?.message || tr("下載失敗。", "Download failed.");
      setButtonState(directButton, "error", requestedName, message);
      dispatchStatus(tr("直接下載失敗：{error}", "Direct download failed: {error}", { error: message }), "error");
      setTimeout(() => setButtonState(directButton, "idle", requestedName), 3200);
    }
  }

  function ensureDirectDownloadButton(nativeButton) {
    if (!nativeButton || !isAssistantCitation(nativeButton)) return null;
    const fileId = citationFileId(nativeButton);
    if (!fileId) return null;

    const adjacent = nativeButton.nextElementSibling;
    if (adjacent?.matches?.("button[data-cqs-direct-download='1']")) return adjacent;

    const filename = citationFilename(nativeButton, fileId);
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

  function scanNode(root) {
    if (!root) return 0;
    let count = 0;
    if (root.matches?.(CITATION_SELECTOR) && ensureDirectDownloadButton(root)) count += 1;
    if (root.querySelectorAll) {
      for (const button of root.querySelectorAll(CITATION_SELECTOR)) {
        if (ensureDirectDownloadButton(button)) count += 1;
      }
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
      attributeFilter: ["data-file-citation-primary-file-id", "data-message-author-role"],
    });
  }

  window.__CQS_DIRECT_DOWNLOAD__ = Object.freeze({
    citationFileId,
    citationFilename,
    isAssistantCitation,
    ensureDirectDownloadButton,
    scanNode,
    stop() { observer?.disconnect?.(); observer = null; },
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
