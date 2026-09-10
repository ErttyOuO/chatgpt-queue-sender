import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const contentScript = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 15000, step = 50) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = fn();
    if (value) return value;
    await wait(step);
  }
  throw new Error('waitFor timeout');
}

function createDom(storageState = {}, url = 'https://chatgpt.com/c/mock-conversation', options = {}) {
  const html = `<!doctype html><html><body>
    <main id="conversation"></main>
    <div id="composer-wrap">
      <form id="composer-form">
        <button type="button" data-testid="composer-plus-btn" aria-label="Add files and more">+</button>
        <div id="prompt-textarea" contenteditable="true" aria-label="Message"></div>
        <button type="button" data-testid="composer-voice-button" aria-label="Voice mode">Voice</button>
        <button type="button" data-testid="send-button" aria-label="Send message" disabled>Send</button>
      </form>
    </div>
  </body></html>`;
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this._rect) return { ...this._rect, x: this._rect.left, y: this._rect.top, toJSON() {} };
    const top = 700;
    const left = this.dataset?.testid === 'composer-plus-btn' ? 18 : 70;
    return { x: left, y: top, top, left, right: left + 40, bottom: top + 40, width: 40, height: 40, toJSON() {} };
  };
  window.getComputedStyle = (element) => ({
    visibility: 'visible',
    display: element?.hidden ? 'none' : 'block',
    animationName: String(element?.getAttribute?.('class') || '').includes('animate-') ? 'loading-shimmer' : 'none',
  });
  window.HTMLElement.prototype.focus = function () { this._focused = true; };
  window.document.execCommand = () => false;
  window.mockMessages = [];
  window.mockScheduledItems = [];
  let contentRuntimeListener = null;
  window.browser = {
    storage: {
      local: {
        async get(key) { return { [key]: storageState[key] || {} }; },
        async set(obj) { Object.assign(storageState, obj); },
        async remove(key) {
          for (const item of Array.isArray(key) ? key : [key]) delete storageState[item];
        },
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      getURL(path) { return `moz-extension://test/${path}`; },
      onMessage: { addListener(listener) { contentRuntimeListener = listener; } },
      async sendMessage(message) {
        window.mockMessages.push(message);
        if (message.type === 'CQS_GET_TAB_CONTEXT') return { tabId: 101 };
        if (message.type === 'CQS_CLAIM_LEGACY_QUEUE') return { migrated: false };
        if (message.type === 'CQS_QUEUE_LEASE_ACQUIRE') return { ok: true, token: 'test-lease' };
        if (message.type === 'CQS_QUEUE_LEASE_RENEW') return { ok: true };
        if (message.type === 'CQS_QUEUE_LEASE_RELEASE') return { ok: true };
        if (message.type === 'CQS_QUEUE_LEASE_TRANSFER') return { ok: true };
        if (message.type === 'CQS_SCHEDULE_SCOPE_TRANSFER') return { ok: true, changed: true };
        if (message.type === 'CQS_SCHEDULE_LIST') return { ok: true, items: [...window.mockScheduledItems] };
        if (message.type === 'CQS_SCHEDULE_CREATE') {
          const item = {
            id: `schedule-${window.mockScheduledItems.length + 1}`,
            text: message.text,
            scheduledAt: message.scheduledAt,
            scopeKey: message.scopeKey,
            status: 'scheduled',
          };
          window.mockScheduledItems.push(item);
          return { ok: true, item };
        }
        if (message.type === 'CQS_SCHEDULE_CANCEL') {
          window.mockScheduledItems = window.mockScheduledItems.filter((item) => item.id !== message.id);
          return { ok: true };
        }
        return { shown: true };
      },
    },
  };

  const input = window.document.querySelector('#prompt-textarea');
  const send = window.document.querySelector('[data-testid="send-button"]');
  const voice = window.document.querySelector('[data-testid="composer-voice-button"]');
  const conversation = window.document.querySelector('#conversation');
  window.mockEvents = [];
  let seq = 0;

  const updateSend = () => { send.disabled = !(input.textContent || '').trim(); };
  input.addEventListener('input', updateSend);

  const submit = () => {
    const text = (input.textContent || '').trim();
    if (!text || send.disabled || window.document.querySelector('[data-testid="stop-button"]')) return;
    seq += 1;
    const n = seq;
    const user = window.document.createElement('article');
    user.dataset.testid = `conversation-turn-${n * 2 - 1}`;
    const userBody = window.document.createElement('div');
    userBody.dataset.messageAuthorRole = 'user';
    userBody.textContent = text;
    user.appendChild(userBody);
    conversation.appendChild(user);
    window.mockEvents.push({ type: 'user', text, t: Date.now() });

    input.textContent = '';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    send.hidden = true;
    voice.hidden = true;

    const stop = window.document.createElement('button');
    stop.type = 'button';
    stop.dataset.testid = 'stop-button';
    stop.setAttribute('aria-label', 'Stop generating');
    stop.textContent = 'Stop';
    window.document.querySelector('#composer-form').appendChild(stop);

    const assistant = window.document.createElement('article');
    assistant.dataset.testid = `conversation-turn-${n * 2}`;
    const assistantBody = window.document.createElement('div');
    assistantBody.dataset.messageAuthorRole = 'assistant';
    assistantBody.dataset.isStreaming = 'true';
    assistantBody.textContent = 'Working';
    assistant.appendChild(assistantBody);
    conversation.appendChild(assistant);
    window.mockEvents.push({ type: 'assistant-start', n, t: Date.now() });

    if (options.agentWork) {
      const status = window.document.createElement('span');
      status.setAttribute('role', 'status');
      status.setAttribute('class', 'animate-[loading-shimmer_2.5s_linear_infinite]');
      status.textContent = 'Working...';
      assistant.appendChild(status);

      window.setTimeout(() => {
        stop.remove();
        assistantBody.dataset.isStreaming = 'false';
        assistantBody.textContent = 'Preparing files';
        send.hidden = false;
        voice.hidden = false;
        updateSend();
        window.mockEvents.push({ type: 'composer-send-restored', n, t: Date.now() });
      }, 500);

      window.setTimeout(() => {
        status.remove();
        assistantBody.textContent = `Done ${n}`;
        const copy = window.document.createElement('button');
        copy.type = 'button';
        copy.dataset.testid = 'copy-turn-action-button';
        copy.setAttribute('aria-label', 'Copy response');
        assistant.appendChild(copy);
        window.mockEvents.push({ type: 'assistant-end', n, t: Date.now() });
      }, 4200);
    } else {
      window.setTimeout(() => {
        stop.remove();
        assistantBody.dataset.isStreaming = 'false';
        assistantBody.textContent = `Done ${n}`;
        const copy = window.document.createElement('button');
        copy.type = 'button';
        copy.dataset.testid = 'copy-turn-action-button';
        copy.setAttribute('aria-label', 'Copy response');
        assistant.appendChild(copy);
        send.hidden = false;
        voice.hidden = false;
        updateSend();
        window.mockEvents.push({ type: 'assistant-end', n, t: Date.now() });
      }, 700);
    }
  };

  send.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  updateSend();
  window.eval(contentScript);
  return {
    dom,
    window,
    storageState,
    input,
    send,
    voice,
    conversation,
    getContentRuntimeListener() { return contentRuntimeListener; },
  };
}

async function scenarioSequential() {
  const env = createDom({});
  const { window, input } = env;
  await waitFor(() => window.document.querySelector('#cqs-floating-button'));
  input.textContent = '第一則\n---\n第二則';
  input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  window.document.querySelector('#cqs-floating-button').click();
  await waitFor(() => window.mockEvents.filter((e) => e.type === 'assistant-end').length === 2, 15000);
  const users = window.mockEvents.filter((e) => e.type === 'user');
  const firstEnd = window.mockEvents.find((e) => e.type === 'assistant-end' && e.n === 1)?.t;
  if (users.map((e) => e.text).join('|') !== '第一則|第二則') throw new Error('Sequential messages mismatch');
  if (!(firstEnd && users[1].t >= firstEnd)) throw new Error('Second message sent before first response ended');
  await waitFor(() => window.document.querySelector('#cqs-preview-bar')?.hidden === true, 5000);
  env.dom.window.close();
  return { users: users.map((e) => e.text), firstEnd, secondSent: users[1].t };
}

async function scenarioAddDuringRun() {
  const env = createDom({});
  const { window, input } = env;
  await waitFor(() => window.document.querySelector('#cqs-floating-button'));
  input.textContent = 'A';
  input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  window.document.querySelector('#cqs-floating-button').click();
  await waitFor(() => window.mockEvents.some((e) => e.type === 'assistant-start'));
  input.textContent = 'B';
  input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  window.document.querySelector('#cqs-floating-button').click();
  await waitFor(() => window.document.querySelector('[data-cqs-count]')?.textContent === '1/2', 3000);
  await waitFor(() => window.mockEvents.filter((e) => e.type === 'assistant-end').length === 2, 15000);
  const users = window.mockEvents.filter((e) => e.type === 'user').map((e) => e.text);
  if (users.join('|') !== 'A|B') throw new Error(`Add-during-run mismatch: ${users.join('|')}`);
  env.dom.window.close();
  return { users };
}

async function scenarioStopBeforeSend() {
  const env = createDom({});
  const { window, input } = env;
  await waitFor(() => window.document.querySelector('#cqs-floating-button'));
  const nativeStop = window.document.createElement('button');
  nativeStop.type = 'button';
  nativeStop.dataset.testid = 'stop-button';
  nativeStop.setAttribute('aria-label', 'Stop generating');
  nativeStop.textContent = 'Stop';
  window.document.querySelector('#composer-form').appendChild(nativeStop);

  input.textContent = '不應送出';
  input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  window.document.querySelector('#cqs-floating-button').click();
  await waitFor(() => !window.document.querySelector('#cqs-preview-bar [data-cqs-action="stop"]')?.hidden, 3000);
  window.document.querySelector('#cqs-preview-bar [data-cqs-action="stop"]').click();
  nativeStop.remove();
  await wait(1500);
  if (window.mockEvents.some((e) => e.type === 'user')) throw new Error('Stopped pending message was still sent');
  await waitFor(() => window.document.querySelector('#cqs-manager [data-cqs-action="continue"]') !== null);
  window.document.querySelector('#cqs-preview-bar [data-cqs-action="open-manager"]').click();
  await waitFor(() => window.document.querySelector('#cqs-manager [data-cqs-action="continue"]')?.hidden === false);
  env.dom.window.close();
  return { sent: false };
}


async function scenarioManualDraftProtection() {
  const env = createDom({});
  const { window, input, storageState } = env;
  const originalConsoleError = window.console.error;
  window.console.error = () => {};
  try {
    await waitFor(() => window.document.querySelector('#cqs-floating-button'));
    const nativeStop = window.document.createElement('button');
    nativeStop.type = 'button';
    nativeStop.dataset.testid = 'stop-button';
    nativeStop.setAttribute('aria-label', 'Stop generating');
    nativeStop.textContent = 'Stop';
    window.document.querySelector('#composer-form').appendChild(nativeStop);

    input.textContent = '佇列訊息';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    window.document.querySelector('#cqs-floating-button').click();
    await waitFor(() => !window.document.querySelector('#cqs-preview-bar [data-cqs-action="stop"]')?.hidden, 3000);

    input.textContent = '我的手動草稿';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    nativeStop.remove();

    await waitFor(() => storageState['cqs_queue_sender_state_v5:conversation%3Amock-conversation']?.pausedReason === 'error', 8000);
    if (input.textContent !== '我的手動草稿') throw new Error('Manual draft was overwritten');
    if (window.mockEvents.some((e) => e.type === 'user')) throw new Error('Queued message sent despite manual draft protection');
    return { draftPreserved: true };
  } finally {
    window.console.error = originalConsoleError;
    env.dom.window.close();
  }
}

async function scenarioRefreshAvoidsDuplicate() {
  const storageState = {
    'cqs_queue_sender_state_v5:conversation%3Amock-conversation': {
      pausedReason: '',
      queue: [
        {
          id: 'refresh-first',
          text: '重新整理前第一則',
          status: 'awaiting-response',
          submission: {
            userCountBefore: 0,
            assistantCountBefore: 0,
            submittedAt: Date.now() - 2000,
            path: '/c/mock-conversation',
          },
        },
        {
          id: 'refresh-second',
          text: '重新整理後第二則',
          status: 'pending',
          submission: null,
        },
      ],
    },
  };
  const env = createDom(storageState);
  try {
    const priorUser = env.window.document.createElement('article');
    priorUser.dataset.testid = 'conversation-turn-existing-user';
    const priorUserBody = env.window.document.createElement('div');
    priorUserBody.dataset.messageAuthorRole = 'user';
    priorUserBody.textContent = '重新整理前第一則';
    priorUser.appendChild(priorUserBody);
    env.conversation.appendChild(priorUser);

    const priorAssistant = env.window.document.createElement('article');
    priorAssistant.dataset.testid = 'conversation-turn-existing-assistant';
    const priorAssistantBody = env.window.document.createElement('div');
    priorAssistantBody.dataset.messageAuthorRole = 'assistant';
    priorAssistantBody.dataset.isStreaming = 'false';
    priorAssistantBody.textContent = '先前回覆已完成';
    priorAssistant.appendChild(priorAssistantBody);
    env.conversation.appendChild(priorAssistant);

    await waitFor(() => env.window.document.querySelector('#cqs-floating-button'));
    await waitFor(() => env.window.mockEvents.some((e) => e.type === 'user'), 12000);
    const sent = env.window.mockEvents.filter((e) => e.type === 'user').map((e) => e.text);
    if (sent.join('|') !== '重新整理後第二則') throw new Error(`Refresh duplicated or skipped messages: ${sent.join('|')}`);
    await waitFor(() => env.window.mockEvents.some((e) => e.type === 'assistant-end'), 5000);
    await waitFor(() => storageState['cqs_queue_sender_state_v5:conversation%3Amock-conversation']?.queue?.length === 0, 8000);
    return { sentAfterRefresh: sent };
  } finally {
    env.dom.window.close();
  }
}



async function scenarioConversationIsolation() {
  const storageState = {};
  const first = createDom(storageState, 'https://chatgpt.com/c/conversation-alpha-123');
  try {
    const { window, input } = first;
    await waitFor(() => window.document.querySelector('#cqs-floating-button'));
    const nativeStop = window.document.createElement('button');
    nativeStop.type = 'button';
    nativeStop.dataset.testid = 'stop-button';
    nativeStop.setAttribute('aria-label', 'Stop generating');
    nativeStop.textContent = 'Stop';
    window.document.querySelector('#composer-form').appendChild(nativeStop);
    input.textContent = '只屬於 A 聊天室';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    window.document.querySelector('#cqs-floating-button').click();
    const alphaKey = 'cqs_queue_sender_state_v5:conversation%3Aconversation-alpha-123';
    await waitFor(() => storageState[alphaKey]?.queue?.length === 1, 4000);

    const second = createDom(storageState, 'https://chatgpt.com/c/conversation-beta-456');
    try {
      await waitFor(() => second.window.document.querySelector('#cqs-floating-button'));
      await wait(1800);
      if (second.window.mockEvents.some((event) => event.type === 'user')) {
        throw new Error('Queue from conversation A was sent in conversation B');
      }
      const status = second.window.__CQS_QUEUE_API__?.getStatus?.();
      if (status?.queueLength !== 0) throw new Error(`Conversation B loaded A queue: ${status?.queueLength}`);
      return { isolated: true };
    } finally {
      second.dom.window.close();
    }
  } finally {
    first.dom.window.close();
  }
}

async function scenarioManualCompletionNotification() {
  const storageState = {
    cqs_notification_settings_v1: {
      enabled: true,
      desktop: true,
      sound: false,
      onlyWhenHidden: false,
    },
  };
  const env = createDom(storageState);
  try {
    const { window, input, send } = env;
    await waitFor(() => window.document.querySelector('#cqs-floating-button'));
    input.textContent = '手動訊息也要通知';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    send.click();
    await waitFor(() => window.mockEvents.some((event) => event.type === 'assistant-end'), 5000);
    await waitFor(() => window.mockMessages.some((message) => message.type === 'CQS_RESPONSE_COMPLETE'), 6000);
    const notification = window.mockMessages.find((message) => message.type === 'CQS_RESPONSE_COMPLETE');
    if (!notification?.message?.includes('Done 1')) throw new Error('Manual response notification preview missing');
    return { notified: true, preview: notification.message };
  } finally {
    env.dom.window.close();
  }
}


async function scenarioAgentWorkDoesNotInterrupt() {
  const env = createDom({}, 'https://chatgpt.com/c/agent-work-test', { agentWork: true });
  try {
    const { window, input } = env;
    await waitFor(() => window.document.querySelector('#cqs-floating-button'));

    input.textContent = '第一則工具工作';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    window.document.querySelector('#cqs-floating-button').click();
    await waitFor(() => window.mockEvents.some((event) => event.type === 'assistant-start'), 5000);

    input.textContent = '第二則不可提早送出';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    window.document.querySelector('#cqs-floating-button').click();

    const sendRestored = await waitFor(
      () => window.mockEvents.find((event) => event.type === 'composer-send-restored' && event.n === 1),
      3000,
    );
    await wait(2500);
    const earlyUsers = window.mockEvents.filter((event) => event.type === 'user');
    if (earlyUsers.length !== 1) {
      throw new Error(`Second message interrupted active tool work after Send returned: ${earlyUsers.map((event) => event.text).join('|')}`);
    }

    const firstEnd = await waitFor(
      () => window.mockEvents.find((event) => event.type === 'assistant-end' && event.n === 1),
      5000,
    );
    const secondUser = await waitFor(
      () => window.mockEvents.filter((event) => event.type === 'user')[1],
      7000,
    );
    if (secondUser.t < firstEnd.t) throw new Error('Second queue message was sent before the active tool state ended');
    return {
      sendRestoredBeforeWorkEnded: sendRestored.t < firstEnd.t,
      secondSentAfterWorkEnded: secondUser.t >= firstEnd.t,
    };
  } finally {
    env.dom.window.close();
  }
}

async function scenarioImageUploadKeepsQueueBesidePlus() {
  const env = createDom({});
  try {
    const { window } = env;
    await waitFor(() => window.document.querySelector('#cqs-floating-button'));
    const form = window.document.querySelector('#composer-form');
    const plus = window.document.querySelector('[data-testid="composer-plus-btn"]');
    const queue = window.document.querySelector('#cqs-floating-button');

    const preview = window.document.createElement('div');
    preview.dataset.testid = 'attachment-preview-image';
    const remove = window.document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove image');
    remove.textContent = 'Image';
    remove._rect = { top: 630, left: 42, right: 78, bottom: 666, width: 36, height: 36 };
    preview.appendChild(remove);
    form.insertBefore(preview, form.firstChild);

    plus._rect = { top: 704, left: 18, right: 54, bottom: 740, width: 36, height: 36 };
    window.document.querySelector('#prompt-textarea')._rect = { top: 680, left: 70, right: 470, bottom: 740, width: 400, height: 60 };
    form._rect = { top: 620, left: 10, right: 500, bottom: 750, width: 490, height: 130 };

    await wait(2300);
    if (queue.previousSibling !== plus || queue.parentElement !== plus.parentElement) {
      throw new Error('Queue button moved into the uploaded image/attachment preview');
    }
    return {
      anchoredToComposerPlus: true,
      placement: queue.dataset.cqsPlacement,
    };
  } finally {
    env.dom.window.close();
  }
}


async function scenarioLongPressScheduledPanel() {
  const env = createDom({}, 'https://chatgpt.com/c/schedule-panel-12345678');
  try {
    const { window, input } = env;
    const button = await waitFor(() => window.document.querySelector('#cqs-floating-button'));
    input.textContent = '晚上七點要自動發送';
    input.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));

    const down = new window.Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    Object.defineProperty(down, 'button', { value: 0 });
    button.dispatchEvent(down);
    await wait(760);

    const panel = window.document.querySelector('#cqs-schedule-panel');
    if (!panel || panel.hidden) throw new Error('long press did not open scheduled-send panel');
    const textarea = panel.querySelector('[data-cqs-schedule-text]');
    const timeInput = panel.querySelector('[data-cqs-schedule-time]');
    if (textarea?.value !== '晚上七點要自動發送') throw new Error('schedule panel did not copy composer text');
    if (timeInput?.type !== 'datetime-local' || !timeInput.value) throw new Error('schedule datetime-local input missing');

    timeInput.value = (() => {
      const d = new Date(Date.now() + 10 * 60 * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    })();
    panel.querySelector('[data-cqs-schedule-action="create"]').click();
    await waitFor(() => window.mockMessages.some((message) => message.type === 'CQS_SCHEDULE_CREATE'), 3000);
    await waitFor(() => window.mockScheduledItems.length === 1, 3000);
    if ((input.textContent || '').trim()) throw new Error('composer text was not cleared after scheduling');
    if (window.mockScheduledItems[0].text !== '晚上七點要自動發送') throw new Error('scheduled text mismatch');
    await waitFor(() => panel.hidden, 3000);
    const manager = await waitFor(() => {
      const node = window.document.querySelector('#cqs-manager');
      return node && !node.hidden ? node : null;
    }, 3000);
    const scheduledCard = await waitFor(() => manager.querySelector('[data-cqs-schedule-id]'), 3000);
    if (!scheduledCard.classList.contains('cqs-item-scheduled')) throw new Error('scheduled message did not use the normal queue card location');
    const scheduledText = scheduledCard.querySelector('[data-cqs-scheduled-text]');
    if (scheduledText?.value !== '晚上七點要自動發送') throw new Error('scheduled message content missing from queue manager');
    if (panel.querySelector('[data-cqs-schedule-list]')) throw new Error('schedule panel still contains a separate scheduled list');
    return { panelOpened: true, scheduled: true, managerUnified: true };
  } finally {
    env.dom.window.close();
  }
}

async function scenarioBackgroundScheduledFire() {
  const env = createDom({}, 'https://chatgpt.com/c/schedule-fire-12345678');
  try {
    const { window } = env;
    await waitFor(() => window.document.querySelector('#cqs-floating-button'));
    const listener = await waitFor(() => env.getContentRuntimeListener());
    const response = await listener({
      type: 'CQS_SCHEDULE_FIRE',
      scheduleId: 'schedule-fire-test',
      text: '背景分頁定時訊息',
      scopeKey: 'conversation:schedule-fire-12345678',
      scheduledAt: Date.now(),
    }, {}, () => {});
    if (!response?.ok) throw new Error(`scheduled fire failed: ${response?.message || 'unknown'}`);
    const user = await waitFor(() => window.mockEvents.find((event) => event.type === 'user' && event.text === '背景分頁定時訊息'), 6000);
    return { submitted: Boolean(user), responseOk: response.ok };
  } finally {
    env.dom.window.close();
  }
}


const results = {};
for (const [name, scenario] of [
  ['sequential', scenarioSequential],
  ['addDuringRun', scenarioAddDuringRun],
  ['stopBeforeSend', scenarioStopBeforeSend],
  ['manualDraftProtection', scenarioManualDraftProtection],
  ['refreshAvoidsDuplicate', scenarioRefreshAvoidsDuplicate],
  ['manualCompletionNotification', scenarioManualCompletionNotification],
  ['conversationIsolation', scenarioConversationIsolation],
  ['agentWorkDoesNotInterrupt', scenarioAgentWorkDoesNotInterrupt],
  ['imageUploadKeepsQueueBesidePlus', scenarioImageUploadKeepsQueueBesidePlus],
  ['longPressScheduledPanel', scenarioLongPressScheduledPanel],
  ['backgroundScheduledFire', scenarioBackgroundScheduledFire],
]) {
  console.log(`[test] start ${name}`);
  results[name] = await scenario();
  console.log(`[test] pass ${name}`);
}
console.log(JSON.stringify({ ok: true, results }, null, 2));
