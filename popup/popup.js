(() => {
  const api = globalThis.browser || globalThis.chrome;
  const tr = globalThis.CQS_I18N?.t || ((zhTW, _en, values = {}) => String(zhTW ?? "").replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => values?.[key] ?? match));
  globalThis.CQS_I18N?.localizeDocument?.(document);
  try { document.title = api?.i18n?.getMessage?.("extensionName") || "ChatGPT Queue Sender"; } catch (_) {}
  const SETTINGS_KEY = "cqs_notification_settings_v1";
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: false,
    desktop: true,
    sound: true,
    onlyWhenHidden: true,
  });

  const elements = {
    enabled: document.getElementById("enabled"),
    desktop: document.getElementById("desktop"),
    sound: document.getElementById("sound"),
    onlyWhenHidden: document.getElementById("onlyWhenHidden"),
    subsettings: document.getElementById("subsettings"),
    testButton: document.getElementById("testButton"),
    status: document.getElementById("status"),
  };

  let settings = { ...DEFAULT_SETTINGS };
  let audioContext = null;

  function setStatus(message, kind = "") {
    elements.status.textContent = message;
    elements.status.dataset.kind = kind;
  }

  function render() {
    elements.enabled.checked = settings.enabled;
    elements.desktop.checked = settings.desktop;
    elements.sound.checked = settings.sound;
    elements.onlyWhenHidden.checked = settings.onlyWhenHidden;
    elements.subsettings.setAttribute("aria-disabled", settings.enabled ? "false" : "true");
    for (const input of [elements.desktop, elements.sound, elements.onlyWhenHidden]) {
      input.disabled = !settings.enabled;
    }
    elements.testButton.disabled = !settings.enabled || (!settings.desktop && !settings.sound);
  }

  async function loadSettings() {
    try {
      const result = await api.storage.local.get(SETTINGS_KEY);
      settings = {
        ...DEFAULT_SETTINGS,
        ...(result?.[SETTINGS_KEY] || {}),
      };
    } catch (_) {
      settings = { ...DEFAULT_SETTINGS };
    }
    render();
  }

  async function saveSettings() {
    await api.storage.local.set({ [SETTINGS_KEY]: settings });
    render();
  }

  async function ensureNotificationPermission() {
    try {
      if (await api.permissions.contains({ permissions: ["notifications"] })) return true;
      return await api.permissions.request({ permissions: ["notifications"] });
    } catch (_) {
      return false;
    }
  }

  async function playTestChime() {
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) return false;
    try {
      audioContext ||= new AudioContextCtor();
      if (audioContext.state === "suspended") await audioContext.resume();
      const now = audioContext.currentTime;
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.10, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      gain.connect(audioContext.destination);

      for (const [frequency, offset, duration] of [[659.25, 0, 0.32], [880, 0.18, 0.42]]) {
        const oscillator = audioContext.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        oscillator.connect(gain);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + duration);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  elements.enabled.addEventListener("change", async () => {
    settings.enabled = elements.enabled.checked;
    if (settings.enabled && settings.desktop) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        settings.desktop = false;
        setStatus(tr("未取得通知權限，仍可只使用提示音。", "Notification permission was not granted. You can still use the sound alert."), "error");
      } else {
        setStatus(tr("完成提醒已開啟。", "Completion alerts are enabled."), "ok");
      }
    } else {
      setStatus(settings.enabled ? tr("完成提醒已開啟。", "Completion alerts are enabled.") : tr("完成提醒已關閉。", "Completion alerts are disabled."), settings.enabled ? "ok" : "");
    }
    await saveSettings();
  });

  elements.desktop.addEventListener("change", async () => {
    if (elements.desktop.checked) {
      const granted = await ensureNotificationPermission();
      settings.desktop = granted;
      if (!granted) setStatus(tr("Firefox 未允許系統通知。", "Firefox did not allow system notifications."), "error");
      else setStatus(tr("系統通知已開啟。", "System notifications are enabled."), "ok");
    } else {
      settings.desktop = false;
      setStatus(tr("系統通知已關閉。", "System notifications are disabled."), "");
    }
    await saveSettings();
  });

  elements.sound.addEventListener("change", async () => {
    settings.sound = elements.sound.checked;
    await saveSettings();
    setStatus(settings.sound ? tr("提示音已開啟。", "Notification sound is enabled.") : tr("提示音已關閉。", "Notification sound is disabled."), settings.sound ? "ok" : "");
  });

  elements.onlyWhenHidden.addEventListener("change", async () => {
    settings.onlyWhenHidden = elements.onlyWhenHidden.checked;
    await saveSettings();
    setStatus(settings.onlyWhenHidden ? tr("只會在離開 ChatGPT 分頁時提醒。", "Alerts will appear only when the ChatGPT tab is inactive.") : tr("即使正在觀看分頁也會提醒。", "Alerts will also appear while you are viewing the tab."), "ok");
  });

  elements.testButton.addEventListener("click", async () => {
    elements.testButton.disabled = true;
    let soundOk = false;
    let desktopOk = false;

    if (settings.sound) soundOk = await playTestChime();
    if (settings.desktop) {
      const granted = await ensureNotificationPermission();
      if (granted) {
        try {
          const response = await api.runtime.sendMessage({ type: "CQS_TEST_NOTIFICATION" });
          desktopOk = Boolean(response?.shown);
        } catch (_) {}
      }
    }

    if ((settings.sound && !soundOk) || (settings.desktop && !desktopOk)) {
      setStatus(tr("部分提醒未能顯示，請檢查 Firefox 或系統通知設定。", "Some alerts could not be shown. Check Firefox and system notification settings."), "error");
    } else {
      setStatus(tr("測試提醒已送出。", "Test alerts were sent."), "ok");
    }
    render();
  });

  loadSettings();
})();
