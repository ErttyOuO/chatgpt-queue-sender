# Validation Report — v0.8.9

## Scope

v0.8.9 was developed directly from the completed v0.8.8 source tree. The new feature is a one-click Firefox download action beside ChatGPT assistant file-citation buttons, based on the current DOM shape that exposes `data-file-citation-primary-file-id`.

## User-visible behavior

- The original ChatGPT filename button is unchanged and still opens the native preview.
- A new compact download icon is injected immediately beside supported assistant file citations.
- Clicking the injected icon does not click or navigate through the ChatGPT preview control.
- The selected file is resolved through the existing ChatGPT attachment authorization logic and handed to Firefox's native download manager.
- The button shows loading, success, and error states, and the existing local toast UI reports the result.
- New citations inserted later by React are detected automatically.
- If React removes only the injected sibling, it can be restored on the next matching mutation/scan.
- Multi-file citation groups fail closed rather than silently downloading only the primary file.
- User-side upload citations do not receive this assistant direct-download action.

## Download safety and authorization

- File identity comes from `data-file-citation-primary-file-id` (or a single unambiguous file ID in citation-group metadata), not from filename text.
- Page-side `resolveAttachment()` is used first so authorization is refreshed in the current ChatGPT page/session.
- The background validates that the request came from a ChatGPT tab.
- Download URLs are still constrained by the existing ChatGPT/OpenAI/oaiusercontent allowlist.
- Firefox downloads use `conflictAction: "uniquify"` so an existing same-name file is not overwritten.
- Filenames are sanitized before being passed to Firefox.
- Same-origin ChatGPT download URLs retain the temporary authorization/account headers returned by the resolver; signed CDN URLs never receive the ChatGPT bearer token.
- Firefox container/private-tab context is forwarded when available.
- If an already-resolved signed URL is rejected immediately by the download API, the file ID is resolved once more before failure is returned.

## Export compatibility

The injected direct-download control is explicitly excluded from:

- Markdown conversion
- visible attachment scanning used by conversation export / ZIP planning

This prevents the new button from changing conversation text or becoming a duplicate archive attachment candidate.

## Permission change

v0.8.9 adds required Firefox API permission:

```json
"downloads"
```

It is used only after an explicit click on the direct-download action to start the selected ChatGPT file in Firefox's native download manager. No new host permissions, remote services, analytics, telemetry, or data collection are introduced.

## Tests actually executed and passed

### `npm run check`

Passed after the final runtime changes. This includes:

- syntax checks for all existing runtime modules plus `export/direct-download.js`
- Manifest v0.8.9 and content-script load-order checks
- required `downloads` permission check
- direct-download integration static guards
- locale/i18n checks

### `npm run test:pure`

Passed after the feature was integrated. Existing regressions continued to pass for:

- background behavior / persistent queue leases
- ZIP archive planning
- background attachment downloading
- structured attachments
- React attachment metadata
- conversation/draft scope isolation
- saved prompts and storage race protection
- runtime i18n
- v0.8.6 busy-state / composer safety
- v0.8.7/v0.8.8 scheduled-send engine and unified manager

New direct-download simulations passed:

```json
{
  "assistantOnlyInjection": true,
  "exactFileIdFromCitation": true,
  "adjacentButton": true,
  "pageResolutionBeforeDownload": true,
  "statusFeedback": true,
  "reactRerenderRestore": true,
  "multiFileGroupFailClosed": true
}
```

Background direct-download simulations passed:

```json
{
  "firefoxDownloadManager": true,
  "noPreviewNavigation": true,
  "safeFilename": true,
  "invalidSenderBlocked": true,
  "staleSignedUrlRefresh": true,
  "sameOriginAuthorization": true,
  "firefoxContainerContext": true
}
```

### `npm run prepare:lint`

Passed and staged the runtime extension, including the new direct-download module.

## Tests attempted but not completed in this environment

`npm ci` was attempted for 90 seconds but did not complete. A partial `node_modules` tree was created and then the install process was terminated. The partial install did not contain a usable jsdom package entry point or Mozilla addons-linter executable.

The following commands were then explicitly attempted and failed because the incomplete jsdom installation could not be imported:

- `npm run test:dom`
- `npm run test:export`
- `npm run test:handoff`

Mozilla `addons-linter` was not available, so `npm run lint:amo` and complete `npm run verify` are **not claimed as passed**.

## Still requires real Firefox / ChatGPT verification

1. Load the v0.8.9 XPI in Firefox.
2. Open a current ChatGPT assistant reply containing a file citation matching the provided DOM structure.
3. Confirm the download icon appears immediately to the right of the filename and does not change the original filename click behavior.
4. Click the new icon and confirm the file begins downloading without opening the preview page / three-dot menu.
5. Test ZIP, XPI, Markdown, document, and another generated file type if available.
6. Test a duplicate filename and confirm Firefox creates a unique filename.
7. Generate a new file after the page is already open and confirm the icon appears after the React update.
8. Confirm Markdown and complete-ZIP export do not include the injected UI as extra text/attachments.
9. Run Mozilla addons-linter in a fully installed development environment before AMO submission.

## Risk assessment

The implementation intentionally reuses the already-hardened ChatGPT attachment resolver rather than inventing a second download-resolution path. The main remaining compatibility risk is future ChatGPT DOM changes to file-citation attributes or assistant-turn structure. The original ChatGPT file control is never replaced, so a DOM compatibility failure should remove only the convenience button rather than break the native preview/download workflow.
