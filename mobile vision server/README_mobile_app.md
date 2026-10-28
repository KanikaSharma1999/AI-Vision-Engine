# Amalgamation Inspector — Mobile (Expo / Android)

A mobile companion app for the Gemini-powered Amalgamation Inspector. Point your
phone's camera (or pick from your gallery) at a part, describe the product, and get a
**conforming / defective / uncertain** verdict with finding, assessment, location,
defect percentage, confidence score, and reasoning — the same Gemini-backed inspection
engine as the web app, wrapped in an installable Android app.

This app is a **client only**. All Gemini calls, prompt construction, and the API key
stay on your existing Flask backend (`server.py` + `inspector.py` + `gemini_client.py`).
The mobile app just talks to that backend over HTTP — it never calls Gemini directly.

> **Status:** planning/spec stage. This README describes the target architecture and
> the current backend API contract it will integrate against. It will be updated with
> a real "File overview" once the Expo project is scaffolded.

## Why a separate mobile app instead of reusing the web UI

The existing `templates/index.html` / `static/app.js` are browser-based (DOM, HTML
forms) and can't run inside a native app shell as-is. Rather than wrap the web page in
a WebView, this is a from-scratch Expo (React Native) client that talks to the same
`/api/inspect` endpoint — giving proper native camera access and an installable APK,
at the cost of the UI being a rewrite rather than a reuse.

## How it works

```
Phone (installed app or Expo Go)
        |  Settings screen: paste current backend URL (ngrok), saved locally
        v
ngrok public HTTPS URL  ---->  Flask server (server.py) on your laptop
                                        |
                                        v
                                Gemini API (key stays server-side, never on the phone)
```

Because the backend isn't permanently hosted, the app has a **Settings screen** to
paste in the current tunnel URL rather than a hardcoded address — see "Backend
connectivity" below.

## Requirements

- **Node.js 18+** and npm (for the Expo project itself — the mobile app is
  JavaScript/React Native; your inspection backend stays Python, unchanged)
- **Expo Go** app installed on your Android phone, for fast local testing without a
  full native build
- The existing Python backend (`server.py` and friends) running and reachable — see
  the backend's own README for its requirements (Python 3.10+, Gemini API key, etc.)
- **ngrok** (or equivalent tunnel) to expose the local backend to the internet — see
  the backend README's networking notes

## Backend connectivity 

The Flask backend runs on your laptop and is only reachable while it's running, and
only at whatever public URL your tunnel currently has (ngrok's free tier issues a new
URL every restart). Because of this, the app does **not** hardcode a server address:

STEPS:

1. Run `pip install -r requirements.txt` in terminal
2. Start the backend: `python server.py` (on your laptop)
3. Start the tunnel: `ngrok http 5000` in another terminal
4. Copy the printed `https://...ngrok-free.app` URL
5. Open and Run expo application files in another VS CODE window
4. Open the app's **Settings** screen, paste the URL, save 

The URL is stored on-device (via AsyncStorage) and reused on every subsequent launch
until you change it — no rebuild needed when the tunnel URL changes.

## Two inspection modes

Mirrors the backend exactly:

- **With reference images** — attach up to 5 known-good example photos; the
  inspection image is judged against them directly.
- **Prompt-only** — no reference images; the model judges using just the product
  name (and optional extra notes) plus its own general knowledge of what a normal
  example of that product looks like.

Toggle is a simple Yes/No on "Add reference image?", matching the current web UI.

## Using the app

1. **Enter the product** being inspected, e.g. `washing machine`. The full inspection
   prompt is built server-side from this (see `PRODUCT_TASK_TEMPLATE` in `server.py`)
   — the app only needs to collect the short product name, not a full task
   description.
2. *(Optional, if enabled)* add **extra notes** to append to the inspection prompt.
3. **Choose a mode**: with reference images, or prompt-only.
4. *(With-reference mode only)* **add reference images** — up to 5, from the gallery.
5. **Add the inspection image** — either take a photo with the camera or choose one
   from the gallery.
6. Tap **Run Inspection**.
7. Review the **result card**: verdict badge (Conforming / Defective / Uncertain /
   Error), finding, assessment, location, defect percentage, confidence score, and
   reasoning, plus timing details.

## Current backend API contract (`POST /api/inspect`)

The app must send `multipart/form-data` with these fields:

| Field | Required | Notes |
|---|---|---|
| `product` | yes | Short product name, e.g. `"washing machine"` |
| `extra_notes` | no | Appended to the server-built prompt if present |
| `mode` | yes | `"with_references"` or `"prompt_only"` |
| `reference_images` | only if `mode=with_references` | 0–5 files |
| `test_image` | yes | Exactly 1 file |

Response JSON (`run_record`) shape:

```json
{
  "run_id": "...",
  "timestamp": "...",
  "product": "washing machine",
  "extra_notes": null,
  "task": "Inspect this washing machine for defects...",
  "mode": "with_references",
  "reference_count": 3,
  "reference_filenames": ["good_1.jpg", "good_2.jpg", "good_3.jpg"],
  "inspection_count": 1,
  "results": [
    {
      "filename": "test1.jpg",
      "verdict": "defective",
      "finding": "...",
      "assessment": "...",
      "location": "...",
      "defect_percentage": 35.0,
      "confidence_score": 0.88,
      "reasoning": "...",
      "error": null,
      "timing": {
        "image_load_seconds": 0.02,
        "inference_seconds": 4.19,
        "total_seconds": 4.21
      }
    }
  ],
  "timing_summary": {
    "reference_load_seconds": 0.08,
    "avg_image_load_seconds": 0.02,
    "avg_inference_seconds": 4.19,
    "avg_total_seconds": 4.21,
    "total_inspection_seconds": 4.21,
    "total_run_seconds": 4.3
  }
}
```

**Notes for implementation:**
- `confidence_score` is **0.0–1.0** — multiply by 100 for display as a percentage.
- There is **no `metrics` block** in this version (removed server-side) — the results
  screen should not attempt to render accuracy/precision/recall/F1/ROC-AUC.
- On error, `results[0].verdict` is `"error"` and the other result fields are `null`;
  `results[0].error` holds the message to display.
- Non-2xx HTTP responses return `{"error": "..."}` — covers missing product, invalid
  mode, too many reference images, unsupported file type, and a missing/unconfigured
  Gemini API key server-side.

## Planned file overview

*(To be filled in once the Expo project is scaffolded — placeholder structure below.)*

```
amalgamation-inspector-mobile/
├── App.js                    # Navigation entry point
├── screens/
│   ├── MainScreen.js         # Product, mode toggle, image pickers, run button
│   ├── ResultsScreen.js      # Verdict card, timing, reasoning, etc.
│   └── SettingsScreen.js     # Backend URL input, persisted via AsyncStorage
├── components/
│   ├── ImagePickerButton.js  # Camera-or-gallery picker (expo-image-picker)
│   └── VerdictBadge.js       # Conforming/Defective/Uncertain/Error badge
├── lib/
│   ├── api.js                # Builds and sends the multipart POST to /api/inspect
│   └── storage.js            # AsyncStorage helpers for the saved backend URL
├── app.json                  # Expo app config (name, icon, permissions)
├── eas.json                  # EAS Build profile for generating an installable APK
└── package.json
```

## Notes & limitations

- Requires the backend to be running and tunneled (via ngrok or similar) whenever the
  app is used — there is no cloud-hosted, always-on backend in this setup.
- The Gemini API key never leaves the Flask server; the mobile app has no knowledge of
  it and makes no direct calls to Gemini.
- Free-tier ngrok URLs change on every tunnel restart — update the Settings screen
  each time you restart the tunnel.
- No offline mode — every inspection requires the phone to reach the backend over the
  internet (or LAN, if both devices are on the same network and a tunnel isn't used).
- Camera and photo library permissions are requested at runtime; denying them will
  block the corresponding picker option.
- This is a demo/internal-testing app, not configured for Play Store distribution.

## Troubleshooting

| Problem | Likely cause / fix |
|---|---|
| "Network request failed" on submit | Backend not running, tunnel not started, or a stale URL saved in Settings — re-check `ngrok http 5000` is active and re-paste the current URL. |
| Request hangs then times out | Cold Gemini call or a slow connection — this matches the backend's own `GEMINI_TIMEOUT` behavior; not mobile-specific. |
| CORS-looking errors in dev tools / Metro logs | Backend needs `flask-cors` enabled on `/api/*` — see the backend README's mobile-CORS notes. |
| Camera option greyed out or picker fails silently | Camera/gallery permission was denied — check the app's permission settings on the phone. |
| Result screen shows blank fields | Confirm the backend response still matches the schema above — this app assumes no `metrics` block and `confidence_score` in the 0.0–1.0 range. |
