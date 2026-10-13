const STORAGE_KEYS = ["haUrl", "haToken", "entityId"];
const DEFAULTS = { entityId: "input_boolean.google_meet" };
const MEET_HOST = "meet.google.com";
const MEET_CODE_RE = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:\/|$)/i;

let debounceTimer = null;

function isMeetingTab(tab) {
  if (!tab || !tab.url) return false;
  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return false;
  }
  if (url.hostname !== MEET_HOST) return false;
  return MEET_CODE_RE.test(url.pathname);
}

async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS);
  return { ...DEFAULTS, ...stored };
}

function setBadge(inMeeting) {
  chrome.action.setBadgeText({ text: inMeeting ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: inMeeting ? "#188038" : "#5f6368" });
  chrome.action.setTitle({
    title: inMeeting ? "On a meeting" : "Not on a meeting",
  });
}

async function callService(serviceUrl, token, entityId, inMeeting) {
  const service = inMeeting ? "turn_on" : "turn_off";
  try {
    const res = await fetch(`${serviceUrl}/${service}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entity_id: entityId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text}`.trim() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function recompute() {
  const tabs = await chrome.tabs.query({});
  const inMeeting = tabs.some(isMeetingTab);
  setBadge(inMeeting);

  const s = await getSettings();
  const target = inMeeting ? "on" : "off";

  if (!s.haUrl || !s.haToken || !s.entityId) {
    return { state: target, inMeeting, ok: false, error: "Missing configuration" };
  }

  const base = s.haUrl.trim().replace(/\/+$/, "");
  const entityId = s.entityId.trim();
  const domain = entityId.split(".")[0];
  const serviceUrl = `${base}/api/services/${domain}`;
  const token = s.haToken.trim();

  const { lastPush } = await chrome.storage.local.get("lastPush");
  if (
    lastPush &&
    lastPush.state === target &&
    lastPush.serviceUrl === serviceUrl &&
    lastPush.entityId === entityId
  ) {
    return { state: target, inMeeting, ok: true, changed: false };
  }

  const result = await callService(serviceUrl, token, entityId, inMeeting);
  if (result.ok) {
    await chrome.storage.local.set({
      lastPush: { state: target, serviceUrl, entityId },
    });
  } else {
    console.warn("[GMeet->HA] update failed:", result.error);
  }
  return {
    state: target,
    inMeeting,
    ok: result.ok,
    changed: result.ok,
    error: result.error,
  };
}

function scheduleRecompute() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    recompute().catch((e) => console.warn("[GMeet->HA]", e));
  }, 500);
}

async function testConnection(haUrl, haToken) {
  if (!haUrl || !haToken) return { ok: false, error: "URL and token are required" };
  const base = haUrl.trim().replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/`, {
      headers: { Authorization: `Bearer ${haToken.trim()}` },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

chrome.tabs.onUpdated.addListener((_id, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") scheduleRecompute();
});
chrome.tabs.onCreated.addListener(scheduleRecompute);
chrome.tabs.onRemoved.addListener(scheduleRecompute);
chrome.tabs.onActivated.addListener(scheduleRecompute);
chrome.windows.onFocusChanged.addListener(scheduleRecompute);
chrome.runtime.onStartup.addListener(scheduleRecompute);
chrome.runtime.onInstalled.addListener(scheduleRecompute);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "recheck") {
    recompute()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg && msg.type === "test") {
    testConnection(msg.haUrl, msg.haToken)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
