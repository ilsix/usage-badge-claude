// Org-ID aus der Usage-API-URL. Muss im Popup unter "Organisation-ID"
// eingetragen werden. Ermitteln: DevTools -> Netzwerk -> Fetch/XHR ->
// Usage-Seite neu laden -> URL der Anfrage an
// /api/organizations/<ID>/usage kopieren.
const DEFAULT_REFRESH_SECONDS = 60;
const DEFAULT_TOGGLE_SECONDS = 10;

let orgId = "";

function usageUrl() {
  return `https://claude.ai/api/organizations/${orgId}/usage`;
}

const SESSION_COLOR = "#2e7d32"; // grün
const SESSION_RESET_COLOR = "#f9a825"; // gelb
const WEEK_COLOR = "#1565c0"; // blau
const UNKNOWN_COLOR = "#888888"; // grau

let lastData = null; // letzte erfolgreich abgerufene Nutzlast (überlebt einzelne fehlgeschlagene Polls)

const MAX_CONSECUTIVE_FAILURES = 3;
let consecutiveFailures = 0;
let dataStale = false; // true nach MAX_CONSECUTIVE_FAILURES Fehl-Polls in Folge -> Badge zeigt "?"

let toggleSeconds = DEFAULT_TOGGLE_SECONDS;
let toggleIntervalHandle = null;
let rotationIndex = 0;

let refreshSeconds = DEFAULT_REFRESH_SECONDS;
let refreshIntervalHandle = null;

let showSession = true;
let showSessionReset = true;
let showWeek = true;

// Fasst die Limits aus der API zu "Session" (group === "session") und
// "Woche" (group === "weekly") zusammen. Gibt es mehrere Einträge pro
// Kategorie (z.B. mehrere Weekly-Limits), wird der höchste %-Wert genommen.
function summarize(data) {
  if (!data || !data.limits || !data.limits.length) return null;

  const worst = (arr) =>
    arr.length ? arr.reduce((a, b) => (b.percent > a.percent ? b : a)) : null;

  const sessionLimits = data.limits.filter((l) => l.group === "session");
  const weekLimits = data.limits.filter((l) => l.group === "weekly");

  return {
    session: worst(sessionLimits),
    week: worst(weekLimits)
  };
}

function formatResetTime(iso) {
  if (!iso) return "unbekannt";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return iso;
  }
}

// Stunden bis Reset, eine Nachkommastelle, Komma statt Punkt (de-DE), z.B. "4,8"
function formatHoursUntil(iso) {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  const hours = Math.max(0, diffMs / 3600000);
  return hours.toFixed(1).replace(".", ",");
}

function setTooltip() {
  if (!lastData) return;
  const stamp = new Date(lastData.timestamp).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
  const lines = lastData.limits.map(
    (l) => `${l.kind} (${l.group}): ${l.percent}% verwendet – Reset ${formatResetTime(l.resetsAt)}`
  );
  const activeSteps = [];
  if (showSession) activeSteps.push("Session % (grün)");
  if (showSessionReset) activeSteps.push("Stunden bis Session-Reset (gelb)");
  if (showWeek) activeSteps.push("Woche % (blau)");
  const rotationDesc = activeSteps.length ? activeSteps.join(", ") : "keine Schritte aktiv";
  browser.browserAction.setTitle({
    title: `Claude Usage – Badge wechselt alle ${toggleSeconds}s zwischen: ${rotationDesc}. Daten alle ${refreshSeconds}s aktualisiert (Stand ${stamp})\n${lines.join("\n")}`
  });
}

// Baut die Reihenfolge der Badge-Schritte je nach vorhandenen Daten und den
// per Checkbox im Popup aktivierten Schritten: Session % -> Stunden bis
// Session-Reset -> Woche %
function buildRotation(summary) {
  const steps = [];
  if (showSession && summary.session) {
    steps.push({ type: "session", percent: summary.session.percent });
  }
  if (showSessionReset && summary.session && summary.session.resetsAt) {
    steps.push({ type: "sessionReset", resetsAt: summary.session.resetsAt });
  }
  if (showWeek && summary.week) {
    steps.push({ type: "week", percent: summary.week.percent });
  }
  return steps;
}

function renderBadge() {
  if (dataStale) {
    browser.browserAction.setBadgeText({ text: "?" });
    browser.browserAction.setBadgeBackgroundColor({ color: UNKNOWN_COLOR });
    return;
  }

  const summary = summarize(lastData);
  const rotation = summary ? buildRotation(summary) : [];

  if (!rotation.length) {
    browser.browserAction.setBadgeText({ text: "?" });
    browser.browserAction.setBadgeBackgroundColor({ color: UNKNOWN_COLOR });
    return;
  }

  const step = rotation[rotationIndex % rotation.length];

  if (step.type === "sessionReset") {
    const hoursText = formatHoursUntil(step.resetsAt);
    browser.browserAction.setBadgeText({ text: hoursText === null ? "?" : hoursText });
    browser.browserAction.setBadgeBackgroundColor({ color: SESSION_RESET_COLOR });
  } else {
    const remaining = Math.max(0, 100 - step.percent);
    browser.browserAction.setBadgeText({ text: String(remaining) });
    browser.browserAction.setBadgeBackgroundColor({
      color: step.type === "session" ? SESSION_COLOR : WEEK_COLOR
    });
  }

  setTooltip();
}

function startToggle() {
  if (toggleIntervalHandle) clearInterval(toggleIntervalHandle);
  const ms = Math.max(1, toggleSeconds) * 1000;
  toggleIntervalHandle = setInterval(() => {
    rotationIndex++;
    renderBadge();
  }, ms);
}

function startRefreshLoop() {
  if (refreshIntervalHandle) clearInterval(refreshIntervalHandle);
  const ms = Math.max(1, refreshSeconds) * 1000;
  refreshIntervalHandle = setInterval(() => pollUsage(), ms);
}

function updateBadge(data) {
  lastData = data;
  browser.storage.local.set({ lastUsageData: data });
  renderBadge();
}

async function pollUsage() {
  if (!orgId) {
    browser.browserAction.setBadgeText({ text: "?" });
    browser.browserAction.setBadgeBackgroundColor({ color: UNKNOWN_COLOR });
    browser.browserAction.setTitle({
      title: "Claude Usage: keine Organisation-ID gesetzt (im Popup unter Einstellungen eintragen)"
    });
    return;
  }

  try {
    const res = await fetch(usageUrl(), { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const limits = (json.limits || [])
      .filter((l) => l && typeof l.percent === "number" && l.group)
      .map((l) => ({ group: l.group, kind: l.kind, percent: l.percent, resetsAt: l.resets_at }));

    consecutiveFailures = 0;
    dataStale = false;
    updateBadge({ limits, timestamp: Date.now() });
  } catch (e) {
    console.error("Claude Usage: Poll fehlgeschlagen", e);
    consecutiveFailures++;
    browser.browserAction.setTitle({
      title: "Claude Usage: Aktualisierung fehlgeschlagen (nicht eingeloggt oder API-Antwort geändert)"
    });
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      dataStale = true;
      renderBadge();
    }
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.toggleSeconds) {
    const value = Number(changes.toggleSeconds.newValue);
    toggleSeconds = value > 0 ? value : DEFAULT_TOGGLE_SECONDS;
    startToggle();
    setTooltip();
  }

  if (changes.refreshSeconds) {
    const value = Number(changes.refreshSeconds.newValue);
    refreshSeconds = value > 0 ? value : DEFAULT_REFRESH_SECONDS;
    startRefreshLoop();
    pollUsage();
  }

  if (changes.orgId) {
    orgId = (changes.orgId.newValue || "").trim();
    pollUsage();
  }

  if (changes.showSession) {
    showSession = changes.showSession.newValue !== false;
    rotationIndex = 0;
    renderBadge();
  }

  if (changes.showSessionReset) {
    showSessionReset = changes.showSessionReset.newValue !== false;
    rotationIndex = 0;
    renderBadge();
  }

  if (changes.showWeek) {
    showWeek = changes.showWeek.newValue !== false;
    rotationIndex = 0;
    renderBadge();
  }
});

// Manuelles Refresh über den Button im Popup
browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "manual-refresh") return pollUsage();
});

browser.runtime.onStartup.addListener(() => pollUsage());
browser.runtime.onInstalled.addListener(() => pollUsage());

// Beim Start: gespeicherte Intervalle/Org-ID/Checkboxen + letzten bekannten Stand laden
browser.storage.local
  .get([
    "lastUsageData",
    "toggleSeconds",
    "refreshSeconds",
    "orgId",
    "showSession",
    "showSessionReset",
    "showWeek"
  ])
  .then((res) => {
    if (res.toggleSeconds > 0) toggleSeconds = res.toggleSeconds;
    if (res.refreshSeconds > 0) refreshSeconds = res.refreshSeconds;
    if (typeof res.orgId === "string" && res.orgId.trim()) orgId = res.orgId.trim();
    if (typeof res.showSession === "boolean") showSession = res.showSession;
    if (typeof res.showSessionReset === "boolean") showSessionReset = res.showSessionReset;
    if (typeof res.showWeek === "boolean") showWeek = res.showWeek;
    if (res.lastUsageData) lastData = res.lastUsageData;
    startToggle();
    renderBadge();
    startRefreshLoop();
  });
