import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../export/export-ui.css', import.meta.url), 'utf8');

const blockMatch = css.match(/#cqs-export-control \.cqs-recent-file-strip\s*\{([\s\S]*?)\}/);
assert.ok(blockMatch, 'latest-file list CSS block is missing');
const block = blockMatch[1];

assert.match(block, /flex-direction:\s*column\s*;/, 'multiple files must stack vertically');
assert.match(block, /align-items:\s*stretch\s*;/, 'vertical rows should stretch to one shared width');
assert.match(block, /overflow-x:\s*hidden\s*;/, 'horizontal scrolling must be disabled');
assert.match(block, /overflow-y:\s*auto\s*;/, 'long file lists should scroll vertically');
assert.match(block, /max-height:\s*184px\s*;/, 'vertical list height guard is missing');
assert.doesNotMatch(block, /scroll-snap-type:\s*x/i, 'old horizontal scroll snapping must be removed');
assert.doesNotMatch(block, /overscroll-behavior-x/i, 'old horizontal overscroll behavior must be removed');

const chipMatch = css.match(/#cqs-export-control \.cqs-recent-file-chip\s*\{([\s\S]*?)\}/);
assert.ok(chipMatch, 'latest-file row CSS block is missing');
assert.match(chipMatch[1], /width:\s*100%\s*;/, 'each file must occupy one vertical row');
assert.match(chipMatch[1], /max-width:\s*none\s*;/, 'vertical rows must not keep the old horizontal chip max width');


assert.match(css, /\.cqs-recent-file-status[\s\S]*?data-cqs-state=\"loading\"/, 'latest-file rows need a visible loading status indicator');
assert.match(css, /@keyframes\s+cqs-recent-download-spin/, 'latest-file loading indicator needs a spinner animation');
assert.match(css, /data-cqs-download-state=\"error\"/, 'latest-file rows need a visible error state');

console.log(JSON.stringify({
  ok: true,
  verticalStack: true,
  horizontalScrollRemoved: true,
  verticalOverflowGuard: true,
  fullWidthRows: true,
}));
