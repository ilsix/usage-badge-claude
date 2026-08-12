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
const showSessionInput = document.getElementById("showSession");
const showSessionResetInput = document.getElementById("showSessionReset");
const showWeekInput = document.getElementById("showWeek");
const status = document.getElementById("status");
const versionEl = document.getElementById("version");

function localizePage() {
  document.documentElement.lang = browser.i18n.getUILanguage();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = browser.i18n.getMessage(el.getAttribute("data-i18n"));
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const msg = browser.i18n.getMessage(el.getAttribute("data-i18n-placeholder"));
    if (msg) el.placeholder = msg;
  });
}

function formatResetTime(iso) {
  if (!iso) return browser.i18n.getMessage("unknown");
  try {
    return new Date(iso).toLocaleString(browser.i18n.getUILanguage(), {
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
    limitsEl.textContent = browser.i18n.getMessage("noData");
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
    reset.textContent = browser.i18n.getMessage("limitReset", [formatResetTime(l.resetsAt)]);

    card.appendChild(top);
    card.appendChild(track);
    card.appendChild(reset);
    limitsEl.appendChild(card);
  }

  const stamp = new Date(data.timestamp).toLocaleTimeString(browser.i18n.getUILanguage(), {
    hour: "2-digit",
    minute: "2-digit"
  });
  updatedEl.textContent = browser.i18n.getMessage("updatedAt", [stamp]);
}

function loadLimits() {
  browser.storage.local.get("lastUsageData").then((res) => {
    renderLimits(res.lastUsageData);
  });
}

refreshBtn.addEventListener("click", () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = browser.i18n.getMessage("refreshing");
  browser.runtime.sendMessage({ type: "manual-refresh" }).finally(() => {
    setTimeout(() => {
      loadLimits();
      refreshBtn.disabled = false;
      refreshBtn.textContent = browser.i18n.getMessage("refreshNow");
    }, 500);
  });
});

browser.storage.local
  .get(["toggleSeconds", "refreshSeconds", "orgId", "showSession", "showSessionReset", "showWeek"])
  .then((res) => {
    intervalInput.value = res.toggleSeconds > 0 ? res.toggleSeconds : DEFAULT_TOGGLE_SECONDS;
    refreshInput.value = res.refreshSeconds > 0 ? res.refreshSeconds : DEFAULT_REFRESH_SECONDS;
    orgIdInput.value = typeof res.orgId === "string" ? res.orgId.trim() : "";
    showSessionInput.checked = res.showSession !== false;
    showSessionResetInput.checked = res.showSessionReset !== false;
    showWeekInput.checked = res.showWeek !== false;
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
      showStatus(browser.i18n.getMessage("savedToggleInterval", [String(value)]));
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
      showStatus(browser.i18n.getMessage("savedRefreshInterval", [String(value)]));
    });
  }, 300);
});

toggleOrgIdBtn.addEventListener("click", () => {
  const isHidden = orgIdInput.type === "password";
  orgIdInput.type = isHidden ? "text" : "password";
  toggleOrgIdBtn.textContent = browser.i18n.getMessage(isHidden ? "hide" : "show");
});

let orgIdSaveTimeout = null;
orgIdInput.addEventListener("input", () => {
  const value = orgIdInput.value.trim();

  clearTimeout(orgIdSaveTimeout);
  orgIdSaveTimeout = setTimeout(() => {
    browser.storage.local.set({ orgId: value }).then(() => {
      showStatus(browser.i18n.getMessage(value ? "savedOrgId" : "clearedOrgId"));
    });
  }, 500);
});

showSessionInput.addEventListener("change", () => {
  browser.storage.local.set({ showSession: showSessionInput.checked }).then(() => {
    showStatus(browser.i18n.getMessage("saved"));
  });
});

showSessionResetInput.addEventListener("change", () => {
  browser.storage.local.set({ showSessionReset: showSessionResetInput.checked }).then(() => {
    showStatus(browser.i18n.getMessage("saved"));
  });
});

showWeekInput.addEventListener("change", () => {
  browser.storage.local.set({ showWeek: showWeekInput.checked }).then(() => {
    showStatus(browser.i18n.getMessage("saved"));
  });
});

versionEl.textContent = `v${browser.runtime.getManifest().version}`;

localizePage();
loadLimits();
