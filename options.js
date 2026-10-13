const FIELDS = ["haUrl", "haToken", "entityId"];
const DEFAULTS = { entityId: "input_boolean.google_meet" };

const $ = (id) => document.getElementById(id);

function collect() {
  const values = {};
  for (const f of FIELDS) values[f] = $(f).value.trim();
  return values;
}

function setStatus(message, kind) {
  const el = $("status");
  el.textContent = message;
  el.className = "status " + (kind || "");
}

async function requestHostPermission(rawUrl) {
  let pattern;
  try {
    pattern = `${new URL(rawUrl).origin}/*`;
  } catch {
    throw new Error("Please enter a valid Home Assistant URL.");
  }
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    throw new Error(`Permission to access ${pattern} was denied.`);
  }
}

async function load() {
  const stored = await chrome.storage.local.get(FIELDS);
  for (const f of FIELDS) {
    $(f).value = stored[f] != null ? stored[f] : DEFAULTS[f] || "";
  }
}

async function save() {
  const values = collect();

  if (!values.haUrl || !values.haToken || !values.entityId) {
    setStatus("URL, token and entity ID are required.", "err");
    return;
  }
  if (!values.entityId.startsWith("input_boolean.")) {
    setStatus('The entity ID should look like "input_boolean.google_meet".', "err");
    return;
  }

  try {
    await requestHostPermission(values.haUrl);
  } catch (e) {
    setStatus(e.message, "err");
    return;
  }

  await chrome.storage.local.set(values);

  const res = await chrome.runtime.sendMessage({ type: "recheck" });
  if (res && res.ok) {
    setStatus(`Saved. input_boolean is now "${res.state}".`, "ok");
  } else {
    setStatus(
      `Saved, but the Home Assistant call failed: ${(res && res.error) || "unknown error"}`,
      "err"
    );
  }
}

async function test() {
  const values = collect();
  if (!values.haUrl || !values.haToken) {
    setStatus("URL and token are required.", "err");
    return;
  }

  try {
    await requestHostPermission(values.haUrl);
  } catch (e) {
    setStatus(e.message, "err");
    return;
  }

  setStatus("Testing connection...", "");
  const res = await chrome.runtime.sendMessage({
    type: "test",
    haUrl: values.haUrl,
    haToken: values.haToken,
  });
  if (res && res.ok) {
    setStatus("Connection to Home Assistant OK.", "ok");
  } else {
    setStatus(`Connection failed: ${(res && res.error) || "unknown error"}`, "err");
  }
}

$("save").addEventListener("click", save);
$("test").addEventListener("click", test);
load();
