(() => {
  if (globalThis.CQS_I18N) return;

  const extensionApi = globalThis.browser || globalThis.chrome;
  let uiLanguage = "";
  try { uiLanguage = String(extensionApi?.i18n?.getUILanguage?.() || ""); } catch (_) {}
  if (!uiLanguage) {
    try { uiLanguage = String(globalThis.navigator?.language || ""); } catch (_) {}
  }

  // Product rule: Simplified and Traditional Chinese Firefox UIs use the existing
  // Chinese interface. Every other Firefox UI language uses English.
  const isChinese = /^zh(?:[-_]|$)/i.test(uiLanguage);
  const isEnglish = !isChinese;
  const locale = isChinese ? "zh-TW" : "en-US";

  function interpolate(template, values = {}) {
    return String(template ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
      const value = values?.[key];
      return value === undefined || value === null ? match : String(value);
    });
  }

  function t(zhTW, en, values) {
    return interpolate(isEnglish ? en : zhTW, values);
  }

  function number(value) {
    try { return new Intl.NumberFormat(locale).format(Number(value)); }
    catch (_) { return String(value); }
  }

  function date(value, options = {}) {
    try { return new Intl.DateTimeFormat(locale, options).format(value); }
    catch (_) { return value instanceof Date ? value.toISOString() : String(value); }
  }

  function localizeDocument(root = globalThis.document) {
    if (!root?.querySelectorAll) return;
    try { root.documentElement?.setAttribute?.("lang", isChinese ? "zh-Hant" : "en"); } catch (_) {}
    for (const element of root.querySelectorAll("[data-cqs-zh][data-cqs-en]")) {
      element.textContent = t(element.getAttribute("data-cqs-zh"), element.getAttribute("data-cqs-en"));
    }
    for (const element of root.querySelectorAll("[data-cqs-title-zh][data-cqs-title-en]")) {
      element.setAttribute("title", t(element.getAttribute("data-cqs-title-zh"), element.getAttribute("data-cqs-title-en")));
    }
    for (const element of root.querySelectorAll("[data-cqs-aria-zh][data-cqs-aria-en]")) {
      element.setAttribute("aria-label", t(element.getAttribute("data-cqs-aria-zh"), element.getAttribute("data-cqs-aria-en")));
    }
  }

  globalThis.CQS_I18N = Object.freeze({
    uiLanguage,
    isChinese,
    isEnglish,
    locale,
    t,
    number,
    date,
    localizeDocument,
  });
})();
