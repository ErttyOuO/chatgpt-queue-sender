(() => {
  if (window.__CQS_MARKDOWN__) return;

  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));

  const SKIP_SELECTOR = [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "#cqs-export-control",
    "#cqs-export-menu",
    "#cqs-export-modal",
    "#cqs-preview-bar",
    "#cqs-manager",
    "#cqs-toast",
    "#cqs-floating-button",
    ".cqs-copy-handoff-button",
  ].join(",");

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ");
  }

  function normalizeMarkdown(value) {
    return cleanText(value)
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+$/gm, "")
      .trim();
  }

  function escapeInline(value) {
    return cleanText(value).replace(/([\\`*_{}\[\]()#+.!|>~-])/g, "\\$1");
  }

  function safeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || /^(javascript|data):/i.test(raw)) return "";
    try {
      return new URL(raw, location.href).href;
    } catch (_) {
      return raw;
    }
  }

  function textChildren(node, context) {
    return [...node.childNodes].map((child) => convertNode(child, context)).join("");
  }

  function directChildrenByTag(element, tagName) {
    return [...element.children].filter((child) => child.tagName === tagName);
  }

  function convertList(element, ordered, context) {
    const items = directChildrenByTag(element, "LI");
    const depth = context.listDepth || 0;
    return items.map((item, index) => {
      const nested = [...item.children].filter((child) => child.tagName === "UL" || child.tagName === "OL");
      const clone = item.cloneNode(true);
      [...clone.children]
        .filter((child) => child.tagName === "UL" || child.tagName === "OL")
        .forEach((child) => child.remove());
      const body = normalizeMarkdown(textChildren(clone, { ...context, listDepth: depth + 1 })) || " ";
      const marker = ordered ? `${index + 1}.` : "-";
      const indent = "  ".repeat(depth);
      const bodyLines = body.split("\n");
      let output = `${indent}${marker} ${bodyLines[0]}`;
      for (const line of bodyLines.slice(1)) output += `\n${indent}  ${line}`;
      for (const child of nested) {
        const nestedMarkdown = convertList(child, child.tagName === "OL", { ...context, listDepth: depth + 1 });
        if (nestedMarkdown) output += `\n${nestedMarkdown}`;
      }
      return output;
    }).join("\n") + "\n\n";
  }

  function convertTable(table, context) {
    const rows = [...table.querySelectorAll("tr")];
    if (!rows.length) return "";
    const matrix = rows.map((row) => [...row.querySelectorAll(":scope > th, :scope > td")]
      .map((cell) => normalizeMarkdown(textChildren(cell, context)).replace(/\n+/g, "<br>").replace(/\|/g, "\\|")));
    const width = Math.max(...matrix.map((row) => row.length), 1);
    const normalized = matrix.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
    const header = normalized[0];
    const body = normalized.slice(1);
    return [
      `| ${header.join(" | ")} |`,
      `| ${Array(width).fill("---").join(" | ")} |`,
      ...body.map((row) => `| ${row.join(" | ")} |`),
      "",
    ].join("\n") + "\n";
  }

  function convertNode(node, context = {}) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return cleanText(node.nodeValue || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node;
    if (element.matches?.(SKIP_SELECTOR) || element.closest?.("[aria-hidden='true']")) return "";

    const tag = element.tagName;
    if (tag === "BR") return "\n";
    if (tag === "HR") return "\n---\n\n";

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const body = normalizeMarkdown(textChildren(element, context));
      return body ? `${"#".repeat(level)} ${body}\n\n` : "";
    }

    if (tag === "PRE") {
      const code = element.querySelector("code") || element;
      const languageClass = [...(code.classList || [])].find((name) => /language-|lang-/.test(name)) || "";
      const language = languageClass.replace(/^.*?(?:language-|lang-)/, "").replace(/[^a-z0-9_+-]/gi, "");
      const value = String(code.textContent || "").replace(/^\n+|\n+$/g, "");
      return `\n\`\`\`${language}\n${value}\n\`\`\`\n\n`;
    }

    if (tag === "CODE") {
      const value = String(element.textContent || "").replace(/`/g, "\\`");
      return `\`${value}\``;
    }

    if (tag === "STRONG" || tag === "B") {
      const body = normalizeMarkdown(textChildren(element, context));
      return body ? `**${body}**` : "";
    }

    if (tag === "EM" || tag === "I") {
      const body = normalizeMarkdown(textChildren(element, context));
      return body ? `*${body}*` : "";
    }

    if (tag === "DEL" || tag === "S" || tag === "STRIKE") {
      const body = normalizeMarkdown(textChildren(element, context));
      return body ? `~~${body}~~` : "";
    }

    if (tag === "A") {
      const body = normalizeMarkdown(textChildren(element, context)) || String(element.getAttribute("aria-label") || "").trim();
      const href = safeUrl(element.getAttribute("href"));
      if (!body) return "";
      return href ? `[${body.replace(/\]/g, "\\]")}](${href})` : body;
    }

    if (tag === "IMG") {
      const alt = String(element.getAttribute("alt") || tr("圖片", "Image")).trim() || tr("圖片", "Image");
      const src = safeUrl(element.getAttribute("src"));
      return src ? `![${alt.replace(/\]/g, "\\]")}](${src})` : tr("[圖片：{alt}]", "[Image: {alt}]", { alt });
    }

    if (tag === "BLOCKQUOTE") {
      const body = normalizeMarkdown(textChildren(element, context));
      return body ? `${body.split("\n").map((line) => `> ${line}`).join("\n")}\n\n` : "";
    }

    if (tag === "UL" || tag === "OL") return convertList(element, tag === "OL", context);
    if (tag === "TABLE") return convertTable(element, context);

    if (tag === "DETAILS") {
      const summary = element.querySelector(":scope > summary");
      const summaryText = summary ? normalizeMarkdown(textChildren(summary, context)) : tr("詳細內容", "Details");
      const clone = element.cloneNode(true);
      clone.querySelector(":scope > summary")?.remove();
      const body = normalizeMarkdown(textChildren(clone, context));
      return `**${summaryText}**\n\n${body}\n\n`;
    }

    if (tag === "BUTTON") {
      const body = normalizeMarkdown(textChildren(element, context)) || String(element.getAttribute("aria-label") || "").trim();
      return body;
    }

    const body = textChildren(element, context);
    if (["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "FIGURE", "FIGCAPTION"].includes(tag)) {
      const normalized = normalizeMarkdown(body);
      return normalized ? `${normalized}\n\n` : "";
    }

    return body;
  }

  function elementToMarkdown(element) {
    if (!element) return "";
    return normalizeMarkdown(convertNode(element, {}));
  }

  window.__CQS_MARKDOWN__ = Object.freeze({
    elementToMarkdown,
    normalizeMarkdown,
    escapeInline,
    safeUrl,
  });
})();
