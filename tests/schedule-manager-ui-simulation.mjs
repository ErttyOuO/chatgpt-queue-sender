import fs from 'node:fs';

const source = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

must(source.includes('cqs-item-card cqs-item-scheduled'), 'scheduled cards are not rendered in the normal manager list');
must(source.includes('data.cqsScheduledText = "1"') || source.includes('dataset.cqsScheduledText = "1"'), 'scheduled message text is not rendered in the manager card');
must(source.includes('copy-scheduled-item'), 'scheduled copy action missing');
must(source.includes('cancel-scheduled-item'), 'scheduled cancel action missing');
must(source.includes('state.managerOpen = true;') && source.includes('closeSchedulePanel();'), 'successful scheduling does not transition into the normal manager');
must(!source.includes('data-cqs-schedule-list'), 'schedule panel still contains its own scheduled list');
must(source.includes('一般佇列與單次定時發送都在這裡管理'), 'unified manager subtitle missing');
must(source.includes('佇列 {queue} · 定時 {scheduled}'), 'preview bar does not combine regular/scheduled counts');
must(source.includes('清空一般佇列'), 'clear action is ambiguous when scheduled items exist');
must(source.includes('clearBtn.disabled = !hasQueue'), 'clear action should be disabled when only scheduled items remain');
must(source.includes('void refreshScheduledItems();'), 'scheduled state is not refreshed for the unified manager');

console.log(JSON.stringify({
  ok: true,
  unifiedManager: true,
  schedulePanelSetupOnly: true,
  scheduledCopyCancel: true,
  combinedCounts: true,
  clearRegularQueueOnly: true,
}));
