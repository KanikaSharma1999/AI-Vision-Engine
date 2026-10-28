# Amalgamation Inspector — Full Project Setup (Backend + Mobile App)

## 1. Project Overview

Amalgamation Inspector is an AI-powered visual quality inspection system. A Python/Flask backend sends product photos to the Gemini API and returns a conforming/defective/uncertain verdict with reasoning; an Android mobile app (Expo/React Native) lets an operator photograph a product in the field and get that verdict instantly. The two halves talk to each other over an ngrok tunnel during development.

This repo is two separate projects, run together:

| Project | Folder | Stack |
|---|---|---|
| Backend | `blueprint-inspector-gemini` | Python, Flask, Gemini API |
| Mobile app | `ai-vision-expomobile` | Expo, React Native, TypeScript |

**Current phase:** Backend complete. Mobile app Phases 1–5 complete (project setup, Main screen UI, live API integration, product dropdown). Phases 6–10 (Results screen, polished Settings screen, structured testing, installable APK build, visual polish) pending.

---

## 2. Prerequisites

Install all of these before starting. Confirm each with the version-check command shown.

| Software | Why | Check it's installed |
|---|---|---|
| **Visual Studio Code** | Editor used for all steps below | Open the VS Code application |
| **Python 3.10+** | Runs the Flask backend | `python --version` |
| **Node.js 18+** | Runs the Expo/React Native mobile app | `node --version` |
| **npm** | Comes with Node.js; installs JS dependencies | `npm --version` |
| **Git** | Optional, only if cloning from a repository | `git --version` |
| **ngrok account** | Tunnels the backend so the phone can reach it | Sign up free at ngrok.com |
| **Google AI Studio API key** | Required for Gemini calls | Get one free at aistudio.google.com/apikey |
| **Expo Go app** | Installed on your Android phone, from the Play Store | — |

If any `--version` command says "not recognized" or "command not found," that program isn't installed or isn't on your system PATH — install it before continuing.

---

## 3. Steps for Setup

### 3.1 Open the project in VS Code

1. Launch **Visual Studio Code**.
2. Go to the top menu bar → **File** → **Open Folder...**
3. Navigate to and select your project's parent folder (e.g. `D:\POSSPOLE PROJECTS`), then click **Select Folder**.
4. You should now see the file explorer on the left side of VS Code showing your project folders.

### 3.2 Open a terminal inside VS Code

1. Go to the top menu bar → **Terminal** → **New Terminal**.
   (Keyboard shortcut: **Ctrl + `** — the backtick key, usually above Tab.)


### 3.3 Create/confirm the project folder structure

If starting completely from scratch (no existing folders):

```powershell
cd D:\POSSPOLE
mkdir blueprint-inspector-gemini
mkdir ai-vision-expomobile
```

If the folders already exist with code in them, skip this step — just confirm both folders are visible in VS Code's file explorer (Section 3.1).

### 3.4 Backend setup (`blueprint-inspector-gemini`)

In Terminal 1:

```powershell
cd D:\POSSPOLE\blueprint-inspector-gemini
```


**Create a virtual environment** (keeps this project's Python packages separate from your system Python):

```powershell
python -m venv .venv
```

**Activate it:**

```powershell
venv\Scripts\activate
```

You'll know it worked because your terminal prompt now starts with `(venv)`

**Install dependencies:**

```powershell
pip install -r requirements.txt
```

If `flask-cors` is not already listed in `requirements.txt`, add it (needed so the mobile app's cross-origin requests aren't blocked):

```powershell
pip install flask-cors==4.0.1
```

**Create the `.env` file** — see Section 4 for exact contents.

### 3.5 Mobile app setup (`ai-vision-expomobile`)

OPTION

1. In Terminal 2:
OPEN THE FOLDER PATH IN YOUR SYSTEM

Eg.
```powershell
cd D:\POSSPOLE\blueprint-inspector-gemini\ai-vision-expomobile
```
2. Open New window in VS Code and open EXPO Mobile folder.

**Install dependencies:**

```powershell
npm install
```

**Install the native modules this project specifically needs** (camera/gallery access, persistent storage, clipboard, product dropdown):

```powershell
npx expo install expo-image-picker @react-native-async-storage/async-storage expo-clipboard @react-native-picker/picker
```

**Install Expo's tunnel dependency locally** (fixes a known issue where the global install isn't found):

```powershell
npm install --save-dev @expo/ngrok@^4.1.0
```


**Create the `.env` file** — see Section 4 for exact contents.

### 3.6 Install ngrok (for tunneling the backend)

1. Download the ngrok CLI for Windows from ngrok.com/download and unzip it somewhere on your PATH.
2. Get your personal authtoken from dashboard.ngrok.com/get-started/your-authtoken.
3. In any terminal, run once (never needs repeating on this machine):

```powershell
ngrok config add-authtoken <your-authtoken-here>
```

---

## 4. Environment Variables

### Backend — `blueprint-inspector-gemini\.env`

If the file structure has .env.example- change it to .env

```
cp .env.example. env
```

**OR**Create this file by hand in that folder (VS Code: right-click the folder in the file explorer → **New File** → name it `.env`):
add given below into the .env

```
GEMINI_API_KEY=your_real_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash
GEMINI_TIMEOUT=120
PORT=5000
```

Replace `your_real_gemini_api_key_here` with the key from aistudio.google.com/apikey. Never commit or share this file — it contains a real credential.

### Mobile app — `ai-vision-expomobile\.env`

Create this file by hand in that folder (VS Code: right-click the folder in the file explorer → **New File** → name it `.env`):
Add the given below line of code inside .env and save it.

```
EXPO_PUBLIC_USE_RN_FETCH=1
```

This line is required, not optional. Without it, image uploads fail with `Unsupported FormDataPart implementation` (Expo SDK 57's default `fetch` doesn't support the file-upload format this app uses). Unlike the backend `.env`, this file holds no secrets — it's safe to share/commit.

---

## 5. Execution & Running the Project

You need **three terminals running simultaneously**, every time you work on this project.

### Terminal 1 — Backend

```powershell
cd D:\POSSPOLE\blueprint-inspector-gemini
venv\Scripts\activate
python server.py
```

**Expected output:**
```
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
 * Running on http://<your-local-ip>:5000
```
No `WARNING: GEMINI_API_KEY is not set` line should appear. Leave this running.

### Terminal 2 — Backend tunnel

```powershell
ngrok http 5000
```

**Expected output includes a line like:**
```
Forwarding    https://document-gruffly-stammer.ngrok-free.dev -> http://localhost:5000
```
Copy this URL exactly (select + copy, don't retype) — you'll paste it into the mobile app. Leave this running.

**Verify it works before touching the phone: TO TEST**
```powershell
curl.exe -X POST https://<your-ngrok-url>/api/inspect -F "product=washing machine" -F "mode=prompt_only" -F "test_image=@<path-to-any-jpg>"
```
A real JSON response (even an error one, like a validation message) confirms this layer works.

### Terminal 3 or in seperate VSCode Window — Mobile app

```powershell
cd D:\POSSPOLE\blueprint-inspector-gemini\ai-vision-expomobile
npx expo start -c
```

**Expected output:** a QR code printed in the terminal, plus a URL like `exp://192.168.x.x:8081`.

If your phone can't reach that IP (different network, router isolation, or the SDK 57 Android bug — see Troubleshooting), use the tunnel version instead:
```powershell
npx expo start --tunnel
```

**On your phone:**
1. Open the **Expo Go** app.
2. Scan the QR code from Terminal 3.
3. The app loads — you should see the Amalgamation Inspector main screen (Product dropdown, mode toggle, image pickers).
4. Tap **Settings** (top right), tap **Paste** (after copying the ngrok URL from Terminal 2 onto your phone's clipboard), tap **Test Connection** to confirm "Connection OK," then **Save**.
5. Fill in the form and tap **Run Inspection**.

There is no browser URL for this project — the web version (`http://localhost:5000` from Terminal 1) is a secondary interface; the primary interface is the Expo Go app on your phone.

---

## 6. Troubleshooting

**`Could not reach the server at https://...`**
Almost always one of: (a) Terminal 1 or 2 isn't actually running, (b) the URL saved in the app's Settings doesn't exactly match the current Terminal 2 output (ngrok issues a new URL on every restart unless using a static domain), or (c) a typo introduced by phone keyboard autocorrect while typing the URL manually — use the in-app **Paste** button instead of typing it.

**`Unsupported FormDataPart implementation`**
The mobile app's `.env` is missing `EXPO_PUBLIC_USE_RN_FETCH=1`, or you edited `.env` without fully restarting (`npx expo start -c` + fully close/reopen Expo Go — this setting isn't picked up by a normal reload).

**`CommandError: Install @expo/ngrok@^4.1.0 and try again` (even right after installing it)**
Expo looks for this package in your project's local `node_modules`, but a global install puts it elsewhere. Fix: `npm install --save-dev @expo/ngrok@^4.1.0` from inside `ai-vision-expomobile`, then retry `npx expo start --tunnel`.

**`Uncaught Error: java.io.IOException: Failed to download remote update`**
Your phone and PC aren't on a network that can reach each other (different WiFi, mobile data, or router client isolation). Fix: run `npx expo start --tunnel` instead of plain `npx expo start`.

**`GET /api/inspect 405 METHOD NOT ALLOWED` in the ngrok log**
Not a bug — `/api/inspect` only accepts POST. A GET here usually means the URL was opened directly in a browser, or an old connection-test implementation was hitting it with GET. The actual inspection request always uses POST and won't produce this line.

**`WARNING: GEMINI_API_KEY is not set` on backend startup**
The backend `.env` file is missing, misnamed, or in the wrong folder. It must be named exactly `.env` (not `.env.txt`) and sit directly inside `blueprint-inspector-gemini`, next to `server.py`.

**Gemini returns `HTTP 503 ... currently experiencing high demand`**
Not a bug — this is Google's own transient overload response. Wait 30–60 seconds and tap Run Inspection again.
