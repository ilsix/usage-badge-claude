# Usage Badge for Claude.ai (Firefox Extension)

Shows your remaining Claude.ai usage as a badge number on the toolbar icon.

**Unofficial add-on. Not affiliated with, endorsed by, or sponsored by Anthropic or Claude.**

## How it works

By default every 60 seconds (via `setInterval` in the persistent background
script, configurable) the extension calls Claude's internal API directly:

```
GET https://claude.ai/api/organizations/<ORG_ID>/usage
```

The org ID is set in the popup under "Organisation-ID" (no default,
must be entered), stored via `browser.storage.local`. The fetch runs in the
background script with `credentials: "include"` — thanks to the host
permission `https://claude.ai/*` in the manifest, your existing claude.ai
cookies are sent automatically. **No** tab is opened, no content script is
needed.

The response contains a `limits` array with entries like
`{"kind":"session","group":"session","percent":23,"resets_at":"..."}` and
`{"kind":"weekly_all","group":"weekly","percent":19,"resets_at":"..."}`.
Parsing is based on the `group` field (`session`/`weekly`), not on text —
that's more stable than DOM scraping.

- **Badge text**: cycles (default: every 10s) through up to three values:
  - **Green** = % remaining on the current session limit (`group:
    "session"`, 5h window)
  - **Yellow** = hours remaining until the session limit resets, one
    decimal place with a comma (e.g. `4,8`), computed live from
    `resets_at` — so it keeps counting down between data refreshes too
  - **Blue** = % remaining on the weekly limit (worst value among all
    entries with `group: "weekly"`, e.g. "weekly_all")
  - If a category has no data (e.g. no weekly limit), only the available
    steps are cycled through.
  - Each of the three steps can be toggled on/off individually via
    checkbox in the popup ("Aktive Badge-Schritte"). If all three are off,
    the badge shows `?`.
- **Clicking the icon** opens a popup in a Claude-style dark theme (dark
  background, cards with rounded bars, terracotta accent color `#da7756`)
  with:
  - A breakdown of every limit as bars (%, reset time) and the timestamp
    of the last update
  - A "Jetzt aktualisieren" button for an immediate manual refresh
  - Settings that apply instantly (via `browser.storage.onChanged`),
    without reloading the extension:
    - Badge rotation interval (seconds, session ⇄ week, default 10s)
    - Three "Aktive Badge-Schritte" checkboxes (session %, reset
      countdown, week %), all on by default
    - Data/API refresh interval (seconds, default 60s, min. 10s)
    - Organization ID (text, no default — must be entered)
- **Tooltip** (hover over the icon, no click needed): breakdown of every
  limit including reset time and timestamp of the last update.

Note: Firefox reliably shows only about 4 characters in the badge per
MDN; the toolbar button itself is always a fixed square and can't be made
wider. Showing both values side by side (e.g. "84/81") would get cut off —
that's why the extension cycles through values instead of combining them.

Requirement: you must be logged in to claude.ai in the same Firefox
profile, since the fetch relies on your existing cookies.

## Installation (temporary, for testing)

1. Open Firefox, go to `about:debugging#/runtime/this-firefox`.
2. Click "Load Temporary Add-on…".
3. Select the `manifest.json` file from this folder.
4. The icon appears in the toolbar; the first number shows up shortly
   after.

Temporary add-ons disappear on every Firefox restart and need to be
reloaded. For permanent use, the extension needs to be signed (see below)
or installed via `xpinstall.signatures.required=false` (Firefox
Developer/Nightly) as a self-signed `.xpi`.

## Permanent installation (signed, self-distributed)

The extension is signed for self-distribution ("unlisted" channel on
addons.mozilla.org) via `web-ext sign`. A GitHub Actions workflow
(`.github/workflows/sign-release-xpi.yml`) does this automatically on every
push to `main` that changes the extension source, and publishes the signed
`.xpi` to a GitHub Release. The asset's filename and URL never change, so it
always points to the latest signed build:

```
https://github.com/ilsix/usage-badge-claude/releases/download/stable/usage-badge-claude-ai.xpi
```

The resulting signed `.xpi` can be installed permanently on regular release
Firefox, and can also be force-installed via Firefox Enterprise Policies
(`policies.json` / `programs.firefox.policies.ExtensionSettings` on
NixOS/Home-Manager) using that stable URL directly as `install_url`, e.g.:

```nix
programs.firefox.policies.ExtensionSettings = {
  "claude-usage@ilsix.email" = {
    installation_mode = "force_installed";
    install_url = "https://github.com/ilsix/usage-badge-claude/releases/download/stable/usage-badge-claude-ai.xpi";
  };
};
```

## Known limitations

- The endpoint is a **private, undocumented API** of Anthropic — it can
  change at any time without notice. If it breaks, the badge shows `?`
  and the tooltip shows an error hint; the parsing logic lives in
  `background.js` (function `pollUsage`).
- The **org ID is editable in the popup** (field "Organisation-ID"), with
  no default. Without an ID entered, the badge shows `?`. To find it:
  DevTools → Network → Fetch/XHR → open/reload the Usage settings page →
  copy the URL of the `/api/organizations/<ID>/usage` request, paste it
  into the popup.
- Both intervals run via `setInterval` in the persistent background
  script (`"persistent": true` in `manifest.json`). As long as Firefox is
  running, the timers keep running; no `browser.alarms` permission is
  needed.
- A very short refresh interval means correspondingly frequent requests
  to the private API — 60s is a reasonable default, the popup enforces a
  minimum of 10s.
- This extension talks only to `claude.ai` using your own logged-in
  session (cookies). No third-party servers, no analytics, no tracking.
  All settings and cached usage data stay on your device via the
  browser's local storage.
