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
    orgIdLabel: "Organization ID (from the usage API URL):",
    orgIdPlaceholder: "e.g. 5c4c1190-994b-...",
    show: "Show",
    hide: "Hide",
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
    noOrgIdTitle: "Claude Usage: no organization ID set (enter it in the popup under settings)",
    pollFailedTitle: "Claude Usage: refresh failed (not logged in, or the API response changed)"
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
    orgIdLabel: "Organisation-ID (aus der Usage-API-URL):",
    orgIdPlaceholder: "z.B. 5c4c1190-994b-...",
    show: "Anzeigen",
    hide: "Verstecken",
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
    noOrgIdTitle: "Claude Usage: keine Organisation-ID gesetzt (im Popup unter Einstellungen eintragen)",
    pollFailedTitle: "Claude Usage: Aktualisierung fehlgeschlagen (nicht eingeloggt oder API-Antwort geändert)"
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
