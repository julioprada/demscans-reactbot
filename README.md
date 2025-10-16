# DemScans React Bot

## Run (double-click)

- On Windows, double-click `run-bot.bat`.
- The script installs dependencies if missing and runs `npm start`.

## Build a single .exe (optional)

1. Install dev deps if needed: `npm i`
2. Build:
   - `npm run build:exe`
3. Launch the binary: `dist/demscans-reactbot.exe`

Notes:

- The executable uses `pkg`. Playwright bundles are large; first run may install browser binaries.
- Ensure the Brave path in `bot.ts` is valid for your system or remove `executablePath` to use default Chromium.
