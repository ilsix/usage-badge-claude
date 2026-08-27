// Org-ID für die Usage-API. Wird automatisch über die Organisations-Liste
// der API ermittelt (siehe detectOrgId), solange keine gesetzt ist. Im Popup
// kann sie zusätzlich manuell eingetragen oder neu erkannt werden.
const DEFAULT_REFRESH_SECONDS = 60;
const DEFAULT_TOGGLE_SECONDS = 10;

const ORGANIZATIONS_URL = "https://claude.ai/api/organizations";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Nach einem Fehlschlag wird die Erkennung nicht bei jedem Poll wiederholt,
// sondern mit wachsendem Abstand (60s, 120s, ... max. 15 Minuten). Ein
// geöffnetes Popup löst dagegen sofort einen neuen Versuch aus.
const DETECT_MIN_RETRY_SECONDS = 60;
const DETECT_MAX_RETRY_SECONDS = 900;

let orgId = "";
let orgIdSource = "manual"; // "auto" = automatisch erkannt, "manual" = im Popup eingetragen

function usageUrl() {
  return `https://claude.ai/api/organizations/${orgId}/usage`;
}

// Fehlercode des letzten Fehlschlags, bestimmt den Tooltip-Text:
// "notLoggedIn" | "noOrgs" | "network" | "api"
let lastErrorCode = null;

class UsageError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function errorMessageKey(code) {
  switch (code) {
    case "notLoggedIn":
      return "errNotLoggedIn";
    case "noOrgs":
      return "errNoOrgs";
    case "network":
      return "errNetwork";
    default:
      return "errApi";
  }
}

function setErrorTitle(code) {
  browser.browserAction.setTitle({ title: t("tooltipError", t(errorMessageKey(code))) });
}

let detectionInFlight = null;
let detectionRetrySeconds = DETECT_MIN_RETRY_SECONDS;
let nextDetectionAt = 0;

// Verbindungszustand in storage.local spiegeln, damit das Popup ihn anzeigen
// kann - auch wenn es während des Versuchs gar nicht offen war. "source" sagt,
// woher der Zustand stammt: "detect" = Org-ID-Erkennung, "poll" = Usage-Abruf.
// Ein erfolgreicher Poll überschreibt so auch einen alten Erkennungsfehler.
let lastStatusKey = "";
function setStatus(state, source, code) {
  const key = `${state}|${source}|${code || ""}`;
  if (key === lastStatusKey) return;
  lastStatusKey = key;
  browser.storage.local.set({
    orgDetection: { state, source, code: code || null, at: Date.now() }
  });
}

// Holt die Organisationen des eingeloggten Kontos. Ohne gültige Session
// antwortet claude.ai mit 401/403 oder liefert die Login-Seite als HTML
// statt JSON - beides wird als "nicht eingeloggt" gemeldet.
async function fetchOrganizations() {
  let res;
  try {
    res = await fetch(ORGANIZATIONS_URL, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
  } catch (e) {
    throw new UsageError("network", e.message);
  }

  if (res.status === 401 || res.status === 403) throw new UsageError("notLoggedIn", `HTTP ${res.status}`);
  if (!res.ok) throw new UsageError("api", `HTTP ${res.status}`);

  let json;
  try {
    json = await res.json();
  } catch (e) {
    const contentType = res.headers.get("content-type") || "";
    throw new UsageError(contentType.includes("html") ? "notLoggedIn" : "api", "keine JSON-Antwort");
  }

  const orgs = (Array.isArray(json) ? json : [])
    .filter((o) => o && typeof o.uuid === "string" && UUID_PATTERN.test(o.uuid))
    .map((o) => ({
      uuid: o.uuid,
      name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : o.uuid,
      capabilities: Array.isArray(o.capabilities) ? o.capabilities : []
    }));

  if (!orgs.length) throw new UsageError("noOrgs", "leere Organisationsliste");
  return orgs;
}

// Ein Konto kann mehrere Organisationen haben (z.B. zusätzlich eine reine
// API-/Console-Organisation ohne Chat-Limits). Bevorzugt wird die
// Organisation, die Chat kann und ein bezahltes Abo trägt.
function pickOrganization(orgs) {
  const score = (org) => {
    const caps = org.capabilities;
    let value = 0;
    if (caps.includes("chat")) value += 4;
    if (caps.some((c) => c === "claude_pro" || c === "claude_max")) value += 2;
    if (caps.includes("api") && !caps.includes("chat")) value -= 4;
    return value;
  };
  return orgs.reduce((best, org) => (score(org) > score(best) ? org : best));
}

async function runDetection() {
  setStatus("pending", "detect");
  try {
    const orgs = await fetchOrganizations();
    const chosen = pickOrganization(orgs);

    orgId = chosen.uuid;
    orgIdSource = "auto";
    detectionRetrySeconds = DETECT_MIN_RETRY_SECONDS;
    nextDetectionAt = 0;
    lastErrorCode = null;

    await browser.storage.local.set({
      orgId,
      orgIdSource: "auto",
      // Für die Auswahlliste im Popup, falls das Konto mehrere Organisationen hat
      detectedOrgs: orgs.map((o) => ({ uuid: o.uuid, name: o.name }))
    });
    setStatus("ok", "detect");
    return { ok: true, orgId };
  } catch (e) {
    const code = e && e.code ? e.code : "api";
    console.error("Claude Usage: Org-ID-Erkennung fehlgeschlagen", e);

    lastErrorCode = code;
    nextDetectionAt = Date.now() + detectionRetrySeconds * 1000;
    detectionRetrySeconds = Math.min(DETECT_MAX_RETRY_SECONDS, detectionRetrySeconds * 2);

    setStatus("error", "detect", code);
    setErrorTitle(code);
    renderBadge();
    return { ok: false, code };
  }
}

// Erkennung anstoßen; parallele Aufrufe hängen sich an den laufenden Versuch.
function detectOrgId() {
  if (detectionInFlight) return detectionInFlight;
  detectionInFlight = runDetection().finally(() => {
    detectionInFlight = null;
  });
  return detectionInFlight;
}

// Automatischer Versuch im Hintergrund: nur ohne gesetzte ID und nur, wenn
// der Backoff seit dem letzten Fehlschlag abgelaufen ist.
function autoDetectOrgId() {
  if (orgId) return Promise.resolve({ ok: true, orgId });
  if (detectionInFlight) return detectionInFlight;
  if (Date.now() < nextDetectionAt) {
    return Promise.resolve({ ok: false, code: lastErrorCode || "api" });
  }
  return detectOrgId();
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
  if (!iso) return t("unknown");
  try {
    return new Date(iso).toLocaleString(localeTag(), {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return iso;
  }
}

// Stunden bis Reset, eine Nachkommastelle, Dezimaltrennzeichen je nach
// gewählter Sprache (z.B. "4.8" auf Englisch, "4,8" auf Deutsch)
function formatHoursUntil(iso) {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  const hours = Math.max(0, diffMs / 3600000);
  return new Intl.NumberFormat(localeTag(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(hours);
}

function setTooltip() {
  if (!lastData) return;
  const stamp = new Date(lastData.timestamp).toLocaleTimeString(localeTag(), {
    hour: "2-digit",
    minute: "2-digit"
  });
  const lines = lastData.limits.map((l) =>
    t("tooltipLine", l.kind, l.group, l.percent, formatResetTime(l.resetsAt))
  );
  const activeSteps = [];
  if (showSession) activeSteps.push(t("tooltipStepSession"));
  if (showSessionReset) activeSteps.push(t("tooltipStepSessionReset"));
  if (showWeek) activeSteps.push(t("tooltipStepWeek"));
  const rotationDesc = activeSteps.length ? activeSteps.join(", ") : t("tooltipNoSteps");
  const title = t("tooltipTitle", toggleSeconds, rotationDesc, refreshSeconds, stamp);
  browser.browserAction.setTitle({ title: `${title}\n${lines.join("\n")}` });
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
  if (!showSession && !showSessionReset && !showWeek) {
    browser.browserAction.setBadgeText({ text: "" });
    return;
  }

  if (!orgId || dataStale) {
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
    const detection = await autoDetectOrgId();
    if (!detection.ok) {
      renderBadge();
      setErrorTitle(detection.code);
      return;
    }
  }

  try {
    let res;
    try {
      res = await fetch(usageUrl(), { credentials: "include" });
    } catch (e) {
      throw new UsageError("network", e.message);
    }

    if (res.status === 401 || res.status === 403) {
      throw new UsageError("notLoggedIn", `HTTP ${res.status}`);
    }
    // 404 auf eine automatisch erkannte ID heißt meist: Konto gewechselt.
    // ID verwerfen, damit der nächste Poll neu erkennt.
    if (res.status === 404 && orgIdSource === "auto") {
      orgId = "";
      nextDetectionAt = 0;
      await browser.storage.local.remove("orgId");
      throw new UsageError("noOrgs", "HTTP 404");
    }
    if (!res.ok) throw new UsageError("api", `HTTP ${res.status}`);

    const json = await res.json();

    const limits = (json.limits || [])
      .filter((l) => l && typeof l.percent === "number" && l.group)
      .map((l) => ({ group: l.group, kind: l.kind, percent: l.percent, resetsAt: l.resets_at }));

    consecutiveFailures = 0;
    dataStale = false;
    lastErrorCode = null;
    setStatus("ok", "poll");
    updateBadge({ limits, timestamp: Date.now() });
  } catch (e) {
    const code = e && e.code ? e.code : "api";
    console.error("Claude Usage: Poll fehlgeschlagen", e);
    lastErrorCode = code;
    consecutiveFailures++;
    setStatus("error", "poll", code);
    setErrorTitle(code);
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

  // Nur reagieren, wenn die ID wirklich neu ist: die automatische Erkennung
  // schreibt sie selbst und hat dann schon gepollt.
  if (changes.orgId) {
    const next = (changes.orgId.newValue || "").trim();
    if (next !== orgId) {
      orgId = next;
      if (next) {
        lastErrorCode = null;
        detectionRetrySeconds = DETECT_MIN_RETRY_SECONDS;
        nextDetectionAt = 0;
      }
      pollUsage();
    }
  }

  if (changes.orgIdSource) {
    orgIdSource = changes.orgIdSource.newValue === "auto" ? "auto" : "manual";
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

  if (changes.language) {
    setLanguagePreference(changes.language.newValue);
    renderBadge();
    setTooltip();
  }
});

// Manuelles Refresh und Org-ID-Erkennung über das Popup
browser.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "manual-refresh") return pollUsage();
  // Vom Popup ausgelöst: umgeht den Backoff, weil der Nutzer gerade dabei ist
  // (z.B. direkt nachdem er sich bei claude.ai eingeloggt hat).
  if (msg.type === "detect-org-id") return detectOrgId().then((r) => pollUsage().then(() => r));
});

browser.runtime.onStartup.addListener(() => pollUsage());
browser.runtime.onInstalled.addListener(() => pollUsage());

// Beim Start: gespeicherte Intervalle/Org-ID/Checkboxen/Sprache + letzten bekannten Stand laden
browser.storage.local
  .get([
    "lastUsageData",
    "toggleSeconds",
    "refreshSeconds",
    "orgId",
    "orgIdSource",
    "showSession",
    "showSessionReset",
    "showWeek",
    "language"
  ])
  .then((res) => {
    if (res.toggleSeconds > 0) toggleSeconds = res.toggleSeconds;
    if (res.refreshSeconds > 0) refreshSeconds = res.refreshSeconds;
    if (typeof res.orgId === "string" && res.orgId.trim()) orgId = res.orgId.trim();
    orgIdSource = res.orgIdSource === "auto" ? "auto" : "manual";
    if (typeof res.showSession === "boolean") showSession = res.showSession;
    if (typeof res.showSessionReset === "boolean") showSessionReset = res.showSessionReset;
    if (typeof res.showWeek === "boolean") showWeek = res.showWeek;
    setLanguagePreference(res.language);
    if (res.lastUsageData) lastData = res.lastUsageData;
    startToggle();
    renderBadge();
    startRefreshLoop();
    // Ohne gespeicherte ID sofort einmal erkennen, statt bis zum ersten
    // Poll-Intervall zu warten.
    if (!orgId) pollUsage();
  });
