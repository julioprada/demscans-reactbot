# DemScans React Bot

## Prerequisites

- Brave Browser (required to run): https://brave.com/download/
- Node.js (only required to build from source): https://nodejs.org/en/download

## Run (double‑click)

- On Windows, double‑click the packaged app: `dist/demscans-reactbot.exe`.
- Ensure a `credentials.json` sits next to the `.exe` with your email/password.

Example `credentials.json`:

{
"DEMONIC_EMAIL": "you@example.com",
"DEMONIC_PASSWORD": "your-password"
}

The bot will create/update `progress.json` next to the `.exe` to resume across runs.

## Build a single .exe (optional)

1. Install dev deps if needed: `npm i`
2. Build: `npm run build:exe`
3. Launch: `dist/demscans-reactbot.exe`

Notes:

- The executable uses `pkg`. Playwright bundles are large; first run may install browser binaries.
- Ensure the Brave path in `bot.ts` is valid for your system or remove `executablePath` to use default Chromium.
