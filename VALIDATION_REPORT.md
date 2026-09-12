# Validation Report — v0.9.4

## Scope

v0.9.4 was developed directly from the v0.9.3 source package. The change is focused on download feedback in the compact vertical latest-file list below **Export & Transfer**; the existing queue, scheduling, direct-download, generated-image, ZIP Beta, dictation, and bilingual behavior were kept intact.

## User-reported issue

Clicking a file row could spend several seconds resolving ChatGPT attachment authorization before Firefox actually accepted the download. The latest-file row itself provided no persistent visual feedback, so a slow successful request looked identical to a failed or ignored click.

## v0.9.4 changes

- Every latest-file row now reserves a status icon at the right edge.
- Clicking a row immediately changes that icon to a spinner and preserves the loading state while the attachment is resolved.
- The spinner remains visible for at least a short perceptible interval even when a native ChatGPT download button reacts immediately.
- Successful direct downloads briefly show a green check after Firefox accepts the download request.
- Failed resolution / download startup shows a red error icon; its tooltip preserves the detailed returned error text.
- Download state is keyed by file identity (file ID, generated-image URL identity, or filename), so a React/UI rerender does not erase an in-progress state.
- The recent-file UI now awaits a structured result from the existing direct-download module instead of indirectly clicking the injected adjacent CQS icon.
- `requestDirectDownload()` now returns structured `{ ok, filename, downloadId/strategy/message }` data while preserving the existing adjacent-button behavior.
- ChatGPT-native artifact rows still delegate to the original ChatGPT button. Their green check means the click was successfully delegated to ChatGPT, not that the browser has completed the native transfer.
- No new permission, host permission, remote service, telemetry, or data collection was added.

## Why downloads can still succeed or fail intermittently

The extension now makes the failure reason visible, but several external states can still affect a specific ChatGPT attachment:

- A signed attachment URL can expire before Firefox starts it. The direct-download path already retries once through the available file ID when possible.
- A newly generated artifact may be visible in the UI before all server-side attachment metadata / authorization is ready.
- Older files can have revoked or expired authorization and may return HTTP 403/404 from ChatGPT/OpenAI storage.
- Generic ChatGPT buttons may expose incomplete or ambiguous metadata; ambiguous matches intentionally fail closed rather than download the wrong file.
- Firefox can reject a download request independently of ChatGPT resolution.
- ChatGPT-native XPI/ZIP buttons are delegated to ChatGPT itself, so the extension can confirm the click handoff but cannot reliably prove the native transfer completed.

## Tests actually executed and passed

### `npm run check`

Passed after the v0.9.4 changes, including JavaScript syntax checks, manifest/static policy checks, locale checks, and new assertions for per-file loading/error feedback.

### `npm run test:pure`

Passed in full. This includes:

- background simulation
- archive selection simulation
- archive background download simulation
- structured attachment simulation
- React attachment simulation
- conversation/draft scope simulation
- custom prompt and persistence-race simulations
- i18n simulations
- queue/composer safety simulation
- one-time schedule background/content/manager simulations
- direct-download simulations
- recent-file simulations
- dictation queue simulation
- generation timer / generated-image simulation

The updated direct-download tests confirm that `requestDirectDownload()` returns a structured success result for the recent-file UI. The updated native-artifact test confirms that rail clicks return delegated success feedback while still using the original ChatGPT button. The latest-file CSS regression confirms loading spinner and error-state styling are present.

### `npm run prepare:lint`

Executed successfully before packaging to create the runtime-only staging directory.

## Dependency / jsdom / addons-linter status

`npm ci` was attempted again in this environment. It did not complete within the available execution window and had to be terminated; a partially created `node_modules` directory was removed before packaging.

Therefore the following are **not claimed as passed** in this environment:

- jsdom DOM suite
- jsdom export integration
- jsdom handoff integration
- Mozilla `addons-linter`
- complete `npm run verify`

## Real Firefox checks still recommended

1. Click a file row whose authorization takes several seconds and confirm the right-side spinner remains visible until the request returns.
2. Confirm successful direct download shows a green check after Firefox accepts it.
3. Force an expired / unavailable attachment and confirm the red error icon appears and its tooltip contains the resolver/download error.
4. Click a ChatGPT-native XPI/ZIP artifact and confirm the short spinner changes to delegated-success feedback without a duplicate adjacent icon.
5. Confirm React rerenders do not clear a currently loading row.

