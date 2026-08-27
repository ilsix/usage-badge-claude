// Simple runtime translation layer, shared by popup.js and background.js.
// Independent of the standard WebExtension `_locales`/browser.i18n system
// (which only affects the manifest name/description shown in about:addons
// and cannot be switched at runtime) so the popup can offer a language
// dropdown that overrides the browser's default language on demand.

const LOCALES = {
  en: {
    loading: "Loading…",
    noData: "No data – not logged in?",
    refreshNow: "Refresh now",
    refreshing: "Refreshing…",
    languageLabel: "Language:",
    languageAuto: "Automatic (browser)",
    toggleIntervalLabel: "Badge rotation interval (Session ⇄ Reset ⇄ Week), in seconds:",
    seconds: "seconds",
    activeBadgeStepsLabel: "Active badge steps:",
    stepSession: "Session %",
    stepSessionReset: "Reset countdown (hours)",
    stepWeek: "Week %",
    refreshIntervalLabel: "Data refresh interval:",
    orgIdLabel: "Organization ID (detected automatically):",
    orgIdPlaceholder: "e.g. 5c4c1190-994b-...",
    show: "Show",
    hide: "Hide",
    detectOrgId: "Detect again",
    detecting: "Detecting…",
    orgDetected: "Organization ID detected automatically.",
    orgPickerLabel: "Detected organizations:",
    orgIdHint: "Detected automatically as long as you are logged in to claude.ai. Enter it by hand only if detection fails.",
    hintText: "Green = Session, Yellow = Reset countdown, Blue = Week. Changes apply instantly.",
    disclaimer: "Unofficial add-on. Not affiliated with, endorsed by, or sponsored by Anthropic or Claude.",
    unknown: "unknown",
    updatedAt: "Updated: {0}",
    limitReset: "Reset {0}",
    savedToggleInterval: "Rotation interval saved: {0}s",
    savedRefreshInterval: "Refresh interval saved: {0}s",
    savedOrgId: "Organization ID saved",
    clearedOrgId: "Organization ID cleared",
    saved: "Saved",
    tooltipStepSession: "Session % (green)",
    tooltipStepSessionReset: "hours until session reset (yellow)",
    tooltipStepWeek: "Week % (blue)",
    tooltipNoSteps: "no steps active",
    tooltipTitle: "Claude Usage – badge rotates every {0}s between: {1}. Data refreshed every {2}s (as of {3})",
    tooltipLine: "{0} ({1}): {2}% used – Reset {3}",
    tooltipError: "Claude Usage: {0}",
    errNotLoggedIn: "Not logged in to claude.ai – open claude.ai, log in, then try again.",
    errNoOrgs: "No Claude organization found for this account.",
    errNetwork: "claude.ai is not reachable (network error).",
    errApi: "Unexpected response from claude.ai (the API may have changed)."
  },
  de: {
    loading: "Lade…",
    noData: "Keine Daten – nicht eingeloggt?",
    refreshNow: "Jetzt aktualisieren",
    refreshing: "Aktualisiere…",
    languageLabel: "Sprache:",
    languageAuto: "Automatisch (Browser)",
    toggleIntervalLabel: "Wechsel-Intervall Badge (Session ⇄ Reset ⇄ Woche), in Sekunden:",
    seconds: "Sekunden",
    activeBadgeStepsLabel: "Aktive Badge-Schritte:",
    stepSession: "Session %",
    stepSessionReset: "Reset-Countdown (Stunden)",
    stepWeek: "Woche %",
    refreshIntervalLabel: "Aktualisierungs-Intervall der Daten:",
    orgIdLabel: "Organisation-ID (automatisch erkannt):",
    orgIdPlaceholder: "z.B. 5c4c1190-994b-...",
    show: "Anzeigen",
    hide: "Verstecken",
    detectOrgId: "Erneut erkennen",
    detecting: "Erkenne…",
    orgDetected: "Organisation-ID automatisch erkannt.",
    orgPickerLabel: "Erkannte Organisationen:",
    orgIdHint: "Wird automatisch erkannt, solange du bei claude.ai eingeloggt bist. Nur bei fehlgeschlagener Erkennung von Hand eintragen.",
    hintText: "Grün = Session, Gelb = Reset-Countdown, Blau = Woche. Änderungen werden sofort übernommen.",
    disclaimer: "Inoffizielles Add-on. Nicht verbunden mit, unterstützt von oder gesponsert von Anthropic oder Claude.",
    unknown: "unbekannt",
    updatedAt: "Stand: {0}",
    limitReset: "Reset {0}",
    savedToggleInterval: "Wechsel-Intervall gespeichert: {0}s",
    savedRefreshInterval: "Aktualisierungs-Intervall gespeichert: {0}s",
    savedOrgId: "Organisation-ID gespeichert",
    clearedOrgId: "Organisation-ID geleert",
    saved: "Gespeichert",
    tooltipStepSession: "Session % (grün)",
    tooltipStepSessionReset: "Stunden bis Session-Reset (gelb)",
    tooltipStepWeek: "Woche % (blau)",
    tooltipNoSteps: "keine Schritte aktiv",
    tooltipTitle: "Claude Usage – Badge wechselt alle {0}s zwischen: {1}. Daten alle {2}s aktualisiert (Stand {3})",
    tooltipLine: "{0} ({1}): {2}% verwendet – Reset {3}",
    tooltipError: "Claude Usage: {0}",
    errNotLoggedIn: "Nicht bei claude.ai eingeloggt – claude.ai öffnen, einloggen und erneut versuchen.",
    errNoOrgs: "Keine Claude-Organisation für dieses Konto gefunden.",
    errNetwork: "claude.ai ist nicht erreichbar (Netzwerkfehler).",
    errApi: "Unerwartete Antwort von claude.ai (die API hat sich vermutlich geändert)."
  }
};

const LOCALE_TAGS = { en: "en-US", de: "de-DE" };

let languagePreference = "auto"; // "auto" | "en" | "de", mirrors the stored "language" setting
let resolvedLocale = detectBrowserLocale();

function detectBrowserLocale() {
  return browser.i18n.getUILanguage().toLowerCase().startsWith("de") ? "de" : "en";
}

function setLanguagePreference(pref) {
  languagePreference = pref === "en" || pref === "de" ? pref : "auto";
  resolvedLocale = languagePreference === "auto" ? detectBrowserLocale() : languagePreference;
}

// BCP-47 tag for Intl/toLocaleString: matches the resolved UI language so
// manual overrides also affect date/number formatting (e.g. decimal comma).
function localeTag() {
  return languagePreference === "auto" ? browser.i18n.getUILanguage() : LOCALE_TAGS[resolvedLocale];
}

function t(key, ...args) {
  const template = (LOCALES[resolvedLocale] && LOCALES[resolvedLocale][key]) || LOCALES.en[key] || key;
  return template.replace(/\{(\d+)\}/g, (match, i) => (args[i] !== undefined ? args[i] : match));
}
