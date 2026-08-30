# Validation Report — v0.8.6

## Scope

This audit used the user-provided `chatgpt-queue-sender-firefox-v0.8.5-source.zip` as the only modification baseline. The release version was advanced to `0.8.6` after the fixes below.

## Confirmed bugs in v0.8.5

### 1. Queue could resume while ChatGPT coding/tool work was still active

`hasBusyEvidence()` only recognized the native Stop button or a small set of streaming attributes. ChatGPT can restore the normal Send button while an assistant-side coding/tool task still displays an animated Working/Thinking/Running-style status. In that state `isComposerReadyForQueue()` could become true and the queue could continue after three idle polls, risking interruption of the still-running task.

### 2. Queue button could move into uploaded image previews

`getQueueAnchorButton()` searched all composer buttons and treated labels containing `image` or `file` as possible attachment/add controls. An uploaded image preview button such as `Remove image` could therefore be selected as the anchor after a React rerender, moving the queue button onto the preview.

## v0.8.6 fixes

- Added assistant-side busy detection for `aria-busy`, loading/pending/running states, progress controls, task/tool Stop or Cancel controls, and animated status/shimmer/pulse elements.
- Added English and Chinese active-work status recognition and a conservative rule that treats animated semantic status elements as busy.
- Added `copy-turn-action-button` / Copy response detection as a strong assistant-completion signal.
- Added assistant signature tracking so changing tool/progress text resets the completion countdown.
- Added a 12-second stable-response fallback only when a strong completion control is unavailable.
- Added a pre-send conversation guard: a latest visible user turn blocks queue sending; an assistant turn must be completed or stably idle before a queued prompt is written into the composer.
- Changed queue-button placement to prefer `button[data-testid="composer-plus-btn"]` and related stable composer-plus selectors.
- Explicitly excludes Remove/Delete/Close/Preview/Crop/Replace image/file preview controls from placement candidates.
- Added regression coverage for busy-without-Stop behavior and image-preview anchoring.
- Updated runtime/export/popup version labels to v0.8.6.

## Tests actually executed and passed

### `npm run check`

Passed:

- JavaScript syntax checks for all runtime modules.
- Manifest/static policy checks.
- Locale key/runtime checks.
- v0.8.6 safety static guards.

### `npm run test:pure`

Passed:

- background simulation
- archive selection simulation
- archive background download simulation
- structured attachment simulation
- React button attachment simulation
- conversation/draft scope simulation
- custom prompt simulation
- custom prompt persistence race simulation
- i18n simulation
- i18n runtime simulation
- `composer-safety-simulation.mjs`

The new safety simulation explicitly passed:

- active animated work is detected even with no Stop button
- the queue anchors to `composer-plus-btn`
- uploaded image preview controls are excluded
- completion requires a copy-action signal or conservative 12-second stability fallback

### `npm run prepare:lint`

Passed and staged 27 runtime extension files with manifest version `0.8.6`.

## Tests attempted but not completed in this environment

`npm ci` was attempted, including a longer retry, but did not complete within the available execution window and produced no conclusive package-resolution error before timeout. The partial `node_modules` directory was removed afterward.

Therefore the following were **not** claimed as passed in this environment:

- `node tests/dom-simulation.mjs` (requires `jsdom`)
- `npm run test:export` (requires `jsdom`)
- `npm run test:handoff` (requires `jsdom`)
- Mozilla `addons-linter`
- full `npm run verify`

The jsdom test source was extended with scenarios named `agentWorkDoesNotInterrupt` and `imageUploadKeepsQueueBesidePlus`, but those scenarios still require an environment where dependencies can be installed.

## Still requires real Firefox / ChatGPT verification

- A real long-running ChatGPT coding/tool task where Send returns before the animated work status disappears.
- Real image and multi-image uploads with current ChatGPT React composer rerenders.
- Firefox notification/audio behavior.
- AMO/addons-linter validation and signing.
- Any future ChatGPT DOM change that removes both current completion controls and recognizable work/status semantics.

## Risk assessment

The two user-reported behaviors were reproducible from the v0.8.5 logic and are addressed in v0.8.6 with multiple independent guards. The queue is intentionally more conservative now: in ambiguous states it may wait longer rather than sending early. No new permissions, host permissions, telemetry, or external services were added.
