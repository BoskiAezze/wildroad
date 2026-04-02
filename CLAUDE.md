# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WildRoad is a single-file PWA (Progressive Web App) for registering wildlife road incidents. It runs offline-first with localStorage, syncs bidirectionally with Google Sheets via Apps Script, and uploads photos to Google Drive. The entire frontend is one `index.html` file (~2300 lines) with inline CSS and JS. The backend is `Code.gs` (Google Apps Script).

## Dev Server

```bash
# Use npx serve (Python HTTP has permission issues on macOS):
npx serve -l 3000 -s
```

Launch config in `.claude/launch.json` — use the "WildRoad PWA (npx serve)" configuration.

## Architecture

### Frontend (index.html)
- **Single-file SPA** — vanilla JS (ES6+), no frameworks, no build step
- **5 screens** as `div.screen`, toggled via `.active` class: list, form, detail, step2 (photo/GPS), settings
- **Custom numeric keyboard overlay** for road/km input (avoids mobile keyboard issues)
- **PIN login screen** — 4-digit PIN checked per session (`sessionStorage`), default `1234`
- **Inline service worker** registered via blob URL for offline caching

### Backend (Code.gs)
- Google Apps Script deployed as Web App (Execute as: Me, Access: Anyone)
- Sheet "Zdarzenia" with 21 columns (ID through Synced)
- Dynamic columns added for photo links: Photo URL, Thumbnail URL, Drive File ID
- Photos stored in Google Drive folder "WildRoad Zdjęcia" with monthly subfolders

### Data Flow
1. **Step 1** (basic info) → saves to localStorage → async push to Sheets
2. **Step 2** (photo + GPS) → updates localStorage → updates Sheets → async uploads photo to Drive
3. **Sync** — `doSync()` sends all local records to Apps Script `fullSync()`, which merges by `lastModified` timestamp (last-write-wins) and returns records the client should update

### Key State Variables
- `events[]` — all incidents (localStorage key: `wr_events`)
- `settings{}` — API URL, sheet ID, toggles (localStorage key: `wr_settings`)
- `syncQueue[]` — failed operations queued for retry
- `currentDate` — YYYY-MM-DD, drives all filtering/display
- `currentFilter` — pill filter (all/pending/complete/odolion/kowal)

### Event Object Shape
```js
{ id, dataSgloszen, godzinaSgloszen, grupa, droga, km, strona, gatunek, osoba,
  gpsRaw, lat, lng, latDeg/Min/Sec, lngDeg/Min/Sec,
  photo (base64), photoName, driveFileId, driveUrl, driveThumbnail,
  godzinaDzialania, virtualCol, step (1|2), monthIndex, ts, lastModified }
```

### Google Apps Script API
- `GET ?action=ping` — health check
- `GET ?action=fetchAll` — all records
- `POST {action:'sync', records}` — bidirectional merge
- `POST {action:'insert', row}` / `{action:'update', id, row}` — CRUD
- `POST {action:'uploadPhoto', photoData, fileName, yearMonth, eventId}` — Drive upload

### CORS Handling
Google Apps Script redirects (302) to `googleusercontent.com`. The app uses `gsFetch()` wrapper with `redirect:'follow'` and no `Content-Type` header to avoid CORS preflight. POST bodies are sent as plain text (stringified JSON).

## Conventions

- All UI text is in Polish
- CSS uses custom properties (--bg, --card, --border, --text, --green, --blue, etc.)
- Dark theme: GitHub-like palette (#0d1117 bg, #161b22 cards)
- Fonts: DM Sans (text) + DM Mono (data/codes) from Google Fonts
- iOS optimized: viewport-fit=cover, safe-area-inset, apple-mobile-web-app-capable
- Minimum tap target: 44px
- Photos compressed client-side via canvas (max 1200px, JPEG 70%)
- Groups: Odolion, Kowal (included in daily report), RDW, ZDP Wloclawek, ZDP Lipno (excluded from report)

## Important Notes

- Every Code.gs change requires a **new Apps Script deployment** (not just save)
- Photos are NOT stored in Sheets (too large) — only filename and Drive links
- The `virtualCol` format is `DDMMYYYY_ROAD_KM_SIDE_SPECIES` (e.g., `27032026_DK62_55+300_P_Kot`)
- Event IDs use `'WR-' + Date.now().toString(36).toUpperCase()`
