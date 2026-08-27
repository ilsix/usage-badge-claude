const DEFAULT_TOGGLE_SECONDS = 10;
const MIN_TOGGLE_SECONDS = 2;
const MAX_TOGGLE_SECONDS = 3600;

const DEFAULT_REFRESH_SECONDS = 60;
const MIN_REFRESH_SECONDS = 10;
const MAX_REFRESH_SECONDS = 3600;

const limitsEl = document.getElementById("limits");
const updatedEl = document.getElementById("updated");
const refreshBtn = document.getElementById("refresh");
const intervalInput = document.getElementById("interval");
const refreshInput = document.getElementById("refreshSeconds");
const orgIdInput = document.getElementById("orgId");
const toggleOrgIdBtn = document.getElementById("toggleOrgId");
const detectOrgIdBtn = document.getElementById("detectOrgId");
const orgStatus = document.getElementById("orgStatus");
const orgPickerRow = document.getElementById("orgPickerRow");
const orgPicker = document.getElementById("orgPicker");
const showSessionInput = document.getElementById("showSession");
const showSessionResetInput = document.getElementById("showSessionReset");
const showWeekInput = document.getElementById("showWeek");
const languageInput = document.getElementById("language");
const status = document.getElementById("status");
const versionEl = document.getElementById("version");

function localizePage() {
  document.documentElement.lang = localeTag();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
}

// Letzter vom Hintergrundskript gemeldeter Verbindungszustand und die zuletzt
// erkannten Organisationen - gemerkt, damit nach einem Sprachwechsel neu
// gerendert werden kann.
let detectionState = null;
let detectedOrgs = [];

// Ein "erkannt"-Hinweis ist nur direkt nach der Erkennung interessant, danach
// sagt er nichts mehr aus.
const DETECTED_HINT_MAX_AGE_MS = 60000;

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

function renderDetection(state) {
  if (state !== undefined) detectionState = state || null;
  const current = detectionState;

  orgStatus.classList.remove("error");
  if (!current) {
    orgStatus.textContent = "";
  } else if (current.state === "error") {
    orgStatus.textContent = t(errorMessageKey(current.code));
    orgStatus.classList.add("error");
  } else if (current.state === "pending" && current.source === "detect") {
    orgStatus.textContent = t("detecting");
  } else if (
    current.state === "ok" &&
    current.source === "detect" &&
    Date.now() - current.at < DETECTED_HINT_MAX_AGE_MS
  ) {
    orgStatus.textContent = t("orgDetected");
  } else {
    orgStatus.textContent = "";
  }

  renderOrgPicker();
}

// Auswahlliste nur zeigen, wenn das Konto mehrere Organisationen hat -
// bei genau einer gibt es nichts zu wählen.
function renderOrgPicker() {
  if (detectedOrgs.length < 2) {
    orgPickerRow.hidden = true;
    return;
  }

  orgPickerRow.hidden = false;
  orgPicker.innerHTML = "";
  for (const org of detectedOrgs) {
    const option = document.createElement("option");
    option.value = org.uuid;
    option.textContent = org.name || org.uuid;
    orgPicker.appendChild(option);
  }
  orgPicker.value = orgIdInput.value.trim();
}

function requestDetection() {
  detectOrgIdBtn.disabled = true;
  renderDetection({ state: "pending", source: "detect", at: Date.now() });
  browser.runtime
    .sendMessage({ type: "detect-org-id" })
    .catch(() => null)
    .then(() => {
      detectOrgIdBtn.disabled = false;
      loadLimits();
    });
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

function renderLimits(data) {
  if (!data || !data.limits || !data.limits.length) {
    limitsEl.textContent = t("noData");
    updatedEl.textContent = "";
    return;
  }

  limitsEl.innerHTML = "";
  for (const l of data.limits) {
    const card = document.createElement("div");
    card.className = "limit-card";

    const top = document.createElement("div");
    top.className = "limit-top";
    const nameEl = document.createElement("span");
    nameEl.className = "limit-name";
    nameEl.textContent = `${l.kind} (${l.group})`;
    const percentEl = document.createElement("span");
    percentEl.className = "limit-percent";
    percentEl.textContent = `${l.percent}%`;
    top.appendChild(nameEl);
    top.appendChild(percentEl);

    const track = document.createElement("div");
    track.className = "limit-bar-track";
    const fill = document.createElement("div");
    fill.className = "limit-bar-fill";
    fill.style.width = `${Math.min(100, Math.max(0, l.percent))}%`;
    track.appendChild(fill);

    const reset = document.createElement("div");
    reset.className = "limit-reset";
    reset.textContent = t("limitReset", formatResetTime(l.resetsAt));

    card.appendChild(top);
    card.appendChild(track);
    card.appendChild(reset);
    limitsEl.appendChild(card);
  }

  const stamp = new Date(data.timestamp).toLocaleTimeString(localeTag(), {
    hour: "2-digit",
    minute: "2-digit"
  });
  updatedEl.textContent = t("updatedAt", stamp);
}

function loadLimits() {
  browser.storage.local.get("lastUsageData").then((res) => {
    renderLimits(res.lastUsageData);
  });
}

refreshBtn.addEventListener("click", () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = t("refreshing");
  browser.runtime.sendMessage({ type: "manual-refresh" }).finally(() => {
    setTimeout(() => {
      loadLimits();
      refreshBtn.disabled = false;
      refreshBtn.textContent = t("refreshNow");
    }, 500);
  });
});

browser.storage.local
  .get([
    "toggleSeconds",
    "refreshSeconds",
    "orgId",
    "orgDetection",
    "detectedOrgs",
    "showSession",
    "showSessionReset",
    "showWeek",
    "language"
  ])
  .then((res) => {
    intervalInput.value = res.toggleSeconds > 0 ? res.toggleSeconds : DEFAULT_TOGGLE_SECONDS;
    refreshInput.value = res.refreshSeconds > 0 ? res.refreshSeconds : DEFAULT_REFRESH_SECONDS;
    orgIdInput.value = typeof res.orgId === "string" ? res.orgId.trim() : "";
    showSessionInput.checked = res.showSession !== false;
    showSessionResetInput.checked = res.showSessionReset !== false;
    showWeekInput.checked = res.showWeek !== false;
    languageInput.value = res.language === "en" || res.language === "de" ? res.language : "auto";
    setLanguagePreference(languageInput.value);
    localizePage();
    detectedOrgs = Array.isArray(res.detectedOrgs) ? res.detectedOrgs : [];
    renderDetection(res.orgDetection);
    loadLimits();

    // Ohne ID sofort einen Versuch starten: der Nutzer ist gerade da und hat
    // sich womöglich eben erst eingeloggt, also den Backoff im Hintergrund
    // überspringen.
    if (!orgIdInput.value) requestDetection();
  });

// Erkennung und Poll laufen im Hintergrund weiter, während das Popup offen
// ist - Feld und Status entsprechend nachziehen.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.orgId) {
    const value = (changes.orgId.newValue || "").trim();
    if (value !== orgIdInput.value.trim()) orgIdInput.value = value;
  }

  if (changes.detectedOrgs) {
    detectedOrgs = Array.isArray(changes.detectedOrgs.newValue) ? changes.detectedOrgs.newValue : [];
    renderDetection();
  }

  if (changes.orgDetection) renderDetection(changes.orgDetection.newValue);

  if (changes.lastUsageData) renderLimits(changes.lastUsageData.newValue);
});

let statusTimeout = null;
function showStatus(text) {
  status.textContent = text;
  clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => (status.textContent = ""), 1500);
}

let toggleSaveTimeout = null;
intervalInput.addEventListener("input", () => {
  const raw = Number(intervalInput.value);
  const value = Math.min(MAX_TOGGLE_SECONDS, Math.max(MIN_TOGGLE_SECONDS, raw || DEFAULT_TOGGLE_SECONDS));

  clearTimeout(toggleSaveTimeout);
  toggleSaveTimeout = setTimeout(() => {
    browser.storage.local.set({ toggleSeconds: value }).then(() => {
      showStatus(t("savedToggleInterval", value));
    });
  }, 300);
});

let refreshSaveTimeout = null;
refreshInput.addEventListener("input", () => {
  const raw = Number(refreshInput.value);
  const value = Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, raw || DEFAULT_REFRESH_SECONDS));

  clearTimeout(refreshSaveTimeout);
  refreshSaveTimeout = setTimeout(() => {
    browser.storage.local.set({ refreshSeconds: value }).then(() => {
      showStatus(t("savedRefreshInterval", value));
    });
  }, 300);
});

toggleOrgIdBtn.addEventListener("click", () => {
  const isHidden = orgIdInput.type === "password";
  orgIdInput.type = isHidden ? "text" : "password";
  toggleOrgIdBtn.textContent = t(isHidden ? "hide" : "show");
});

let orgIdSaveTimeout = null;
orgIdInput.addEventListener("input", () => {
  const value = orgIdInput.value.trim();

  clearTimeout(orgIdSaveTimeout);
  orgIdSaveTimeout = setTimeout(() => {
    // Von Hand eingetragene IDs überschreibt die Erkennung nicht mehr.
    browser.storage.local.set({ orgId: value, orgIdSource: "manual" }).then(() => {
      showStatus(t(value ? "savedOrgId" : "clearedOrgId"));
    });
  }, 500);
});

detectOrgIdBtn.addEventListener("click", requestDetection);

orgPicker.addEventListener("change", () => {
  const value = orgPicker.value;
  orgIdInput.value = value;
  browser.storage.local.set({ orgId: value, orgIdSource: "manual" }).then(() => {
    showStatus(t("savedOrgId"));
  });
});

showSessionInput.addEventListener("change", () => {
  browser.storage.local.set({ showSession: showSessionInput.checked }).then(() => {
    showStatus(t("saved"));
  });
});

showSessionResetInput.addEventListener("change", () => {
  browser.storage.local.set({ showSessionReset: showSessionResetInput.checked }).then(() => {
    showStatus(t("saved"));
  });
});

showWeekInput.addEventListener("change", () => {
  browser.storage.local.set({ showWeek: showWeekInput.checked }).then(() => {
    showStatus(t("saved"));
  });
});

languageInput.addEventListener("change", () => {
  const value = languageInput.value;
  browser.storage.local.set({ language: value }).then(() => {
    setLanguagePreference(value);
    localizePage();
    toggleOrgIdBtn.textContent = t(orgIdInput.type === "password" ? "show" : "hide");
    renderDetection();
    loadLimits();
    showStatus(t("saved"));
  });
});

versionEl.textContent = `v${browser.runtime.getManifest().version}`;
