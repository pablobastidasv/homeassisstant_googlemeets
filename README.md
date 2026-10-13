# Google Meet → Home Assistant (Chrome extension)

A tiny Manifest V3 Chrome extension that mirrors "am I in a Google Meet call?" into Home Assistant.

It watches every open tab. Whenever one of them is on a real Google Meet call, it turns a Home Assistant `input_boolean` **on**. When no tab is on a call, it turns it **off**.

Use it to drive automations like "mute the doorbell", "set the lights to meeting mode", "silence notifications", etc.

## What counts as "in a meeting"

A tab counts as being in a meeting only when its URL is a Google Meet **call**, i.e.:

```
https://meet.google.com/abc-defg-hij
```

The meeting-code pattern (`xxx-xxxx-xxx`) is required. The Google Meet landing page (`https://meet.google.com/`) and other non-call pages are ignored, so being on the site is not enough — you have to actually be in a call.

## How it works

- `background.js` is an MV3 service worker. It listens to tab create/update/remove, tab activation, window focus, browser startup and extension install, and recomputes the state (debounced by 500 ms) from `chrome.tabs.query({})`.
- To change the helper it calls the Home Assistant service API:

  ```
  POST {HA_URL}/api/services/input_boolean/turn_on   (or turn_off)
  Authorization: Bearer <long-lived-token>
  Content-Type: application/json

  { "entity_id": "input_boolean.google_meet" }
  ```

- Writes are de-duplicated: the last pushed state is stored in `chrome.storage.local`, so Home Assistant is only called when the state actually changes.
- The toolbar badge shows `ON` / `OFF` at a glance.
- `options.html` / `options.js` / `options.css` provide the settings page where you enter the URL, token and entity ID.

## Requirements

- Chrome (or any Chromium browser: Edge, Brave, …).
- A running Home Assistant instance reachable from the browser.
- A Home Assistant **long-lived access token**.
- A Home Assistant **input_boolean helper** to toggle.

## Setup

### 1. Create the helper in Home Assistant

Settings → Devices & Services → **Helpers** → **Create Helper** → **Toggle**, name it e.g. *Google Meet*. This creates an entity such as:

```
input_boolean.google_meet
```

### 2. Create a long-lived access token

Click your profile (bottom-left) → **Security** tab → **Long-lived access tokens** → **Create token**. Copy it — you won't see it again.

### 3. Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Pin the extension from the puzzle-piece toolbar menu.

### 4. Configure it

1. Click the extension → **Details** → **Extension options** (or right-click the icon → **Options**).
2. Fill in:
   - **Home Assistant URL** — e.g. `http://homeassistant.local:8123`
   - **Long-lived access token** — the token from step 2
   - **Input boolean entity ID** — e.g. `input_boolean.google_meet`
3. Click **Test connection** to confirm it can reach Home Assistant.
4. Click **Save**. Chrome will ask for permission to access your Home Assistant origin — allow it. The current state is pushed immediately.

Join a Google Meet call and the helper should flip to **on**; leave the call and it flips **off**.

## Permissions

| Permission | Why |
| --- | --- |
| `tabs` | Read tab URLs to detect a Google Meet call. |
| `storage` | Remember your settings and the last pushed state. |
| Host access to your Home Assistant URL | Only requested when you save settings (`optional_host_permissions`), never all sites up front. |

## Files

```
manifest.json   Extension manifest (MV3)
background.js   Service worker: detect meetings + call Home Assistant
options.html    Settings page (markup)
options.js      Settings page (logic)
options.css     Settings page (styles)
```

## Troubleshooting

- **Nothing happens after joining a call.** Recheck the URL matches `https://meet.google.com/xxx-xxxx-xxx` and that the entity ID starts with `input_boolean.`. Click **Save** again to force a push.
- **"Permission denied" on save.** You dismissed Chrome's host-permission prompt. Click **Save** again and allow access to your Home Assistant origin.
- **`401` in the status message.** The token is wrong or expired — create a new one.
- **`404`.** The entity ID doesn't exist. Check the helper's exact entity ID in Home Assistant.
- **It reaches Home Assistant but from a non-HTTPS URL.** Mixed-content rules don't apply to extension service workers, so `http://` local URLs work fine.
- **Changed the code?** Reload the extension from `chrome://extensions` (the circular-arrow icon on the card).

## Notes

- The input_boolean persists in Home Assistant, so no heartbeat/re-push is needed across restarts.
- Because it uses `chrome.tabs` and is event-driven, the state is kept current even while Chrome's service worker is asleep — events wake it up.
