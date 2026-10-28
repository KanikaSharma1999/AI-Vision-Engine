# Amalgamation Inspector — Full Project Setup (Backend + Mobile App)

## 1. Overview

Amalgamation Inspector is an AI visual quality-inspection system. A field operator photographs a product on an Android phone; the photo goes to a Python/Flask backend, which asks the Gemini API for a verdict (**conforming / defective / uncertain**) with reasoning. The phone shows the result and can export it as a JSON file.

```
Android phone (Expo Go / APK)
   |  multipart POST /api/inspect   (product, extra_notes, mode, images)
   v
ngrok tunnel  (https://xxxx.ngrok-free.dev)
   v
Flask backend  (ai-vision-servermobile, port 5000)
   v
Gemini API  ->  JSON verdict  ->  back to the phone
```

| Part | Folder | Stack |
|---|---|---|
| Backend | `ai-vision-servermobile` | Python, Flask, Gemini API |
| Mobile app | `ai-vision-expomobile` | Expo SDK 57, Expo Router, React Native, TypeScript |

**Recommended layout** — two sibling folders under one parent:

```
D:\POSSPOLE\
├── ai-vision-servermobile\
└── ai-vision-expomobile\
```

All commands below use this layout. Adjust the drive/path to match your machine.

### Build status

| Phase | Scope | Status |
|---|---|---|
| Backend | Flask + Gemini single-call inspection | Done |
| 1–5 | Mobile setup, Main screen, API integration, product dropdown | Done |
| 6 | **Results screen + Download JSON** | **Done (this version)** |
| 7 | Real Settings screen (currently a modal in `index.tsx`) | Pending |
| 8 | Structured testing | Pending |
| 9 | Installable APK build | Pending |
| 10 | Visual polish | Pending |

---

## 2. Prerequisites

| Software | Why | Check |
|---|---|---|
| Visual Studio Code | Editor | Open the app |
| Python 3.10+ | Backend | `python --version` |
| Node.js 18+ and npm | Mobile app | `node --version`, `npm --version` |
| Git (optional) | Cloning | `git --version` |
| ngrok account + CLI | Lets the phone reach the backend | ngrok.com |
| Google AI Studio API key | Gemini calls | aistudio.google.com/apikey |
| Expo Go (Android) | Runs the app during development | Play Store |

If a `--version` command says "not recognized", the tool is missing or not on PATH — install it first.

---

## 3. Backend setup (`ai-vision-servermobile`)

Open a terminal in VS Code (**Terminal → New Terminal**, or `` Ctrl+` ``):

```powershell
cd D:\POSSPOLE\ai-vision-servermobile
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

The prompt should now start with `(.venv)`. If PowerShell blocks activation, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

The mobile app makes cross-origin requests, so `flask-cors` must be installed. If it is not in `requirements.txt`:

```powershell
pip install flask-cors==4.0.1
```

### Backend `.env`

Copy `.env.example` to `.env` (or create `.env` by hand next to `server.py`):

```powershell
copy .env.example .env
```

```
GEMINI_API_KEY=your_real_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash
GEMINI_TIMEOUT=120
PORT=5000
```

- Never commit or share this file — it holds a real credential.
- If you get "model not found", check the current model names in Google AI Studio and update `GEMINI_MODEL`.
- The file must be named exactly `.env` (not `.env.txt`).

---

## 4. ngrok setup (once per machine)

1. Download the ngrok CLI from ngrok.com/download and put it on your PATH.
2. Copy your authtoken from dashboard.ngrok.com/get-started/your-authtoken.
3. Run once:

```powershell
ngrok config add-authtoken <your-authtoken-here>
```

---

## 5. Mobile app setup (`ai-vision-expomobile`)

```powershell
cd D:\POSSPOLE\ai-vision-expomobile
npm install
```

Install the native modules the app needs (always use `expo install` so versions match SDK 57):

```powershell
npx expo install @react-native-picker/picker expo-image-picker @react-native-async-storage/async-storage expo-clipboard expo-file-system expo-sharing
npm install --save-dev @expo/ngrok@^4.1.0
```

What each is for:

| Package | Used for |
|---|---|
| `@react-native-picker/picker` | Product dropdown |
| `expo-image-picker` | Camera / gallery |
| `@react-native-async-storage/async-storage` | Saving the server URL |
| `expo-clipboard` | Paste button for the ngrok URL |
| `expo-file-system`, `expo-sharing` | **Download JSON** on the Results screen |
| `@expo/ngrok` (dev) | Only for `expo start --tunnel` |

### Mobile `.env`

Create `.env` in `ai-vision-expomobile`:

```
EXPO_PUBLIC_USE_RN_FETCH=1
```

**This line is required.** Expo SDK 57's default `fetch` breaks the React Native file-upload `FormData` format this app uses (error: `Unsupported FormDataPart implementation`). The file holds no secrets.

---

## 6. Running the project

You need **three terminals running at the same time**.

### Terminal 1 — Backend

```powershell
cd D:\POSSPOLE\ai-vision-servermobile
.venv\Scripts\activate
python server.py
```

Expected: `Running on http://127.0.0.1:5000`, and **no** `WARNING: GEMINI_API_KEY is not set` line.

### Terminal 2 — Tunnel

```powershell
ngrok http 5000
```

Copy the `Forwarding https://….ngrok-free.dev` URL exactly. The URL changes on every ngrok restart (unless you use a static domain).

**Optional** check before touching the phone:

```powershell
curl.exe -X POST https://<your-ngrok-url>/api/inspect -F "product=washing machine" -F "mode=prompt_only" -F "test_image=@<path-to-any-jpg>"
```

Any real JSON reply (even a validation error) means this layer works.

### Terminal 3 — Mobile app

```powershell
cd D:\POSSPOLE\ai-vision-expomobile v2
npx expo start -c
```

Phone and PC must be on the same Wi-Fi. If they are not (different network, router client isolation), use the tunnel:

```powershell
npx expo start --tunnel
```

### On the phone

1. Open **Expo Go** and scan the QR code.
2. Copy the ngrok URL on the phone (e.g. send it to yourself), then tap **Settings → Paste → Test Connection** (expect "Connection OK") → **Save**.
3. Use the app as described next.

---

## 7. Using the app

1. **Product** — pick from the dropdown. Choose **Others** to type a custom product name.
2. **Additional notes** (optional) — extra detail appended to the inspection prompt.
3. **Add reference image?**
   - **Yes** — add up to 5 known-good photos from the gallery; the inspection image is judged against them.
   - **No** (prompt-only) — the model judges from the product name and its general knowledge.
4. **Inspection image** — take a photo or choose from the gallery (one image).
5. Tap **Run Inspection**. The button shows progress while Gemini responds.
6. The **Results screen** opens automatically:
   - Verdict banner: green *Conforming*, red *Defective*, amber *Uncertain* (needs a human check).
   - Confidence and defect-coverage figures, the photo that was judged, finding, assessment, location, collapsible reasoning, and timing.
   - **New inspection** — returns to a blank form.
   - **Download JSON** — saves the result (see below).
   - **Back to form** — returns with your inputs intact, handy for re-running with tweaked notes.

### Download JSON

Tapping **Download JSON** writes the full backend response to a file named like `inspection_washing_machine_2026-10-05T10-30-00-000Z.json` and opens the Android share sheet. Choose **Drive**, **Files**, email, WhatsApp, etc. to save or send it. Expo Go supports this.

The file is the backend's run record unchanged:

```json
{
  "run_id": "...",
  "timestamp": "...",
  "product": "Washing machine",
  "mode": "prompt_only",
  "results": [
    {
      "verdict": "defective",
      "finding": "...",
      "assessment": "...",
      "location": "...",
      "defect_percentage": 12,
      "confidence_score": 0.88,
      "reasoning": "...",
      "error": null,
      "timing": { "...": 0.0 }
    }
  ],
  "timing_summary": { "...": 0.0 }
}
```

(Exact fields come from the backend; the app does not alter them.)

---

## 8. Project structure (mobile app)

```
ai-vision-expomobile/
├── .env                      # EXPO_PUBLIC_USE_RN_FETCH=1
├── app.json                  # Expo config (portrait, light UI)
├── package.json
├── lib/
│   ├── api.js / api.d.ts     # submitInspection, testConnection, ApiError + shared types
│   ├── storage.js / .d.ts    # AsyncStorage helpers for the server URL
│   ├── runStore.ts           # in-memory hand-off: Main screen -> Results screen
│   └── exportResult.ts       # writes the JSON file and opens the share sheet
├── screens/
│   └── MainScreen.js         # product dropdown, mode toggle, image pickers, validation
├── src/
│   ├── app/
│   │   ├── _layout.tsx       # Stack navigator (index -> results)
│   │   ├── index.tsx         # wires MainScreen to the API + temporary Settings modal
│   │   └── results.tsx       # Results screen (verdict, details, Download JSON)
│   ├── components/, hooks/, constants/   # Expo template files (animated splash etc.)
│   └── global.css
├── assets/
└── scripts/reset-project.js
```

Changed in this version: the tab navigator and `explore.tsx` were removed, replaced by a Stack with `index` and `results`; `userInterfaceStyle` is now `light` in `app.json` (screens use fixed light colours).

---

## 9. Troubleshooting

**`Could not reach the server at https://...`**
Usually: (a) Terminal 1 or 2 is not running; (b) the URL saved in Settings differs from the current Terminal 2 URL (ngrok changes it on each restart); (c) keyboard autocorrect altered a typed URL — use **Paste**.

**`Unsupported FormDataPart implementation`**
`EXPO_PUBLIC_USE_RN_FETCH=1` is missing from the mobile `.env`, or you edited it without a full restart. Run `npx expo start -c` and fully close and reopen Expo Go.

**`CommandError: Install @expo/ngrok@^4.1.0 and try again`**
Install it locally: `npm install --save-dev @expo/ngrok@^4.1.0` inside `ai-vision-expomobile`, then retry `npx expo start --tunnel`.

**`java.io.IOException: Failed to download remote update`**
Phone and PC cannot reach each other. Use `npx expo start --tunnel`.

**`405 METHOD NOT ALLOWED` for `GET /api/inspect` in the ngrok log**
Not a bug — that route accepts POST only; something opened it in a browser.

**`WARNING: GEMINI_API_KEY is not set`**
Backend `.env` is missing, misnamed, or not next to `server.py`.

**`HTTP 503 ... high demand` from Gemini**
Google-side overload. Wait 30–60 seconds and run again.

**"Export failed" or `File`/`Paths` is not exported from `expo-file-system`**
Run `npx expo install expo-file-system expo-sharing` and restart with `-c`. If your installed version has the older API, change `lib/exportResult.ts` to `import * as FileSystem from 'expo-file-system/legacy'`, use `FileSystem.writeAsStringAsync(FileSystem.cacheDirectory + name, text)`, and pass that URI to `Sharing.shareAsync`.

**TypeScript complains about `'/results'` not being a valid route**
Typed routes are regenerated when Metro starts. Restart with `npx expo start -c`.

**Results screen says "No result to show"**
The app was reloaded while on the Results screen (the run lives in memory). Go back and run the inspection again.

---

## 10. Building an installable APK (Phase 9 preview — not yet tested)

1. Create a free Expo account and install the CLI: `npm install -g eas-cli`, then `eas login`.
2. From `ai-vision-expomobile`: `eas build:configure`.
3. In the generated `eas.json`, add an APK profile that also carries the fetch flag (EAS builds do not read your local `.env`):

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_USE_RN_FETCH": "1" }
    }
  }
}
```

4. Build: `eas build -p android --profile preview`, then download and install the APK.
5. In the installed app, set the server URL in Settings, as in Expo Go.

---

## 11. Security notes

- The Gemini API key lives only in the backend `.env`; the phone never sees it.
- Anyone with your ngrok URL can call the backend while the tunnel is up. Stop ngrok when you are not testing, and use a static domain plus authentication before any real deployment.
- Exported JSON files may contain inspection details — share them deliberately.
