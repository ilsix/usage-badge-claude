# TODO / Roadmap

Ideas for future work on the Usage Badge extension, roughly ordered by
value. Nothing here is committed to a release — it's a backlog to pick
from. Unchecked boxes are open.

## High value — fixes a documented pain point

- [ ] **Automatic org-ID detection.** Today onboarding requires the
      DevTools → Network → copy-the-URL dance described in the README,
      and `orgId` has no default (`background.js`, `popup.js`). Either
      add a `webRequest` listener on
      `https://claude.ai/api/organizations/*/usage` to capture the ID the
      first time the user visits claude.ai, or fetch
      `https://claude.ai/api/organizations` in the background and offer a
      dropdown of orgs. The existing `https://claude.ai/*` host
      permission covers both.
- [ ] **Icon-as-gauge instead of a 4-character badge.** Firefox shows
      only ~4 characters in the badge, which is why values rotate.
      Rendering the icon itself via
      `browser.browserAction.setIcon({ imageData })` from an
      OffscreenCanvas (a ring or fill level for session %) shows one
      value continuously and frees the badge text for a second number.
- [ ] **Threshold notifications.** Add the `notifications` permission
      plus opt-in warnings at e.g. 80 % / 90 % of the session limit, and
      a "session limit has reset" notice. Data is already polled every
      60s; nothing consumes it beyond the badge.
- [ ] **Usage history + burn-rate projection.** `lastUsageData` is
      overwritten on every poll (`updateBadge` in `background.js`).
      Keeping a ring buffer in `storage.local` unlocks a sparkline in the
      popup and, more usefully, "at this rate you run out at 17:40".
- [ ] **Export history** as CSV/JSON once history exists.

## Robustness and longevity

- [ ] **MV3 port / event-driven background.** `manifest.json` is MV2 with
      `"persistent": true`. Persistent background pages are on the way
      out; the two `setInterval` loops become `browser.alarms`. Also
      makes a Chrome/Edge build from the same source realistic.
- [ ] **Backoff and smarter polling.** On failure `pollUsage` keeps
      hitting the private API at the same fixed rate. Add exponential
      backoff on consecutive failures, honor `Retry-After` / HTTP 429,
      and pause while the browser is idle (`idle` permission).
- [ ] **Distinguish error types.** 401, 5xx and a changed JSON shape all
      collapse into one `pollFailedTitle` string. Split "not logged in"
      (with a clickable link to claude.ai) from "API changed" from
      "network down" so breakage is self-diagnosing.
- [ ] **Tests and a lint gate.** There is no test setup. `summarize`,
      `buildRotation`, `formatHoursUntil` and the `t()` placeholder
      substitution are pure and trivially testable. Add `web-ext lint` to
      the dev-build workflow so a broken manifest fails before it reaches
      a release.
- [ ] **Stale-data indicator.** Surface the age of the data instead of
      only flipping to `?` after three consecutive failures — e.g. dim
      the badge colour once data is older than N refresh intervals.

## Feature polish

- [ ] **Per-`kind` badge steps.** Rotation is hardcoded to the `session`
      and `weekly` groups in `buildRotation`, but the popup already
      renders every `kind` the API returns. Let users pick a specific
      limit (e.g. an Opus weekly limit) as a badge step, with friendly
      names instead of raw `kind (group)`.
- [ ] **Weekly reset countdown.** There is a session reset countdown
      step but no weekly equivalent, though `resetsAt` is stored for
      every limit.
- [ ] **Badge presentation options.** Reorder rotation steps, show
      *used* instead of *remaining*, and value-based colouring
      (green → yellow → red as the limit approaches) rather than a fixed
      colour per step type.
- [ ] **Quick actions.** A `commands` keyboard shortcut for manual
      refresh, and a link (or middle-click) to open claude.ai's usage
      settings page.
- [ ] **Light theme and accessibility.** The popup is hardcoded dark; add
      `prefers-color-scheme`, visible focus styles, and ARIA on the
      progress bars.
- [ ] **`storage.sync` and a real options page.** Settings follow the
      Firefox account across machines, and `options_ui` gives room the
      popup does not have.
- [ ] **More languages.** `i18n.js` is a hand-rolled two-locale table.
      Either document the "add a locale" flow for contributors, or make
      the runtime layer load JSON from `_locales` so the popup's language
      override and `browser.i18n` share one source of truth.

## Suggested first three

Automatic org-ID detection (removes the worst onboarding step), the
MV3/alarms port (avoids a forced scramble later), and threshold
notifications (the reason to install a usage monitor at all).
