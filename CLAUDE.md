# YT Kids Guard — Development Guide

## Project Overview
Chrome extension + web dashboard for parents to manage children's YouTube watching. Timer limits, channel allow/block lists, Shorts blocking, and cross-device sync via Convex.

## Architecture

### Extension (Chrome MV3)
- **Service Worker** (`src/background.ts`) — Timer logic, channel management, password auth, message routing, Convex sync alarms
- **Content Script** (`src/content.ts`) — YouTube page injection: blocking overlays, timer heartbeats, thumbnail channel buttons (DOM-based, Trusted Types safe)
- **Popup** (`src/popup.ts` + `static/popup.html`) — Parent dashboard UI with tabs (Timer/Channels/Settings), child-facing timer view
- **Types** (`src/types.ts`) — Shared interfaces and message types
- **Sync Layer** (`src/convex-sync.ts`) — ConvexHttpClient wrapper for service worker ↔ Convex communication

### Convex Backend
- **Schema** (`convex/schema.ts`) — families, devices, channelRules, watchSessions, settings + auth tables
- **Auth** — `@convex-dev/auth` with email+password (web app only). Extension uses device tokens via join codes.
- **Functions** — families, devices, settings, channelRules, watchSessions, resolveChannel

### Web App (`web/`)
- React 19 + Vite + Convex — mobile-first parent dashboard
- Separate `package.json`, own npm deps
- Connects to same Convex deployment

## Key Patterns

### Security
- Passwords stored as SHA-256 hashes (salt: `yt-kids-guard-salt-2024`)
- Brute force: 5 attempts → 60s lockout
- Session tokens: `crypto.randomUUID()`, 2-hour content auth window
- All mutations require auth except GET_STATE, VERIFY_PASSWORD, SET_PASSWORD
- Extension ↔ Convex: device tokens (not JWT/OAuth)

### Trusted Types Compliance
- Content script buttons: DOM APIs only (createElement, createElementNS) — **never innerHTML**
- Overlays + password dialogs: Shadow DOM (innerHTML safe inside shadow roots)

### Channel Filtering
- **Allow Only** (whitelist): only approved channels on watch pages
- **Block Specific** (blocklist): all channels except blocked ones
- Page-type detection: channel filter only runs on `/watch` pages, not homepage/search (prevents false positives from thumbnail selectors)
- Matching: case-insensitive on name, URL, or handle

### Timer
- 1-minute alarm increments `watchData.secondsUsed` when YouTube tab is active
- Daily reset at midnight (checked every 5 min)
- Watch data in `chrome.storage.local`, settings in `chrome.storage.sync`

### Convex Sync
- 2-minute alarm pulls settings/channels from Convex, pushes watch data
- Fire-and-forget — works offline, no blocking
- Device registered via 6-char join code → gets `deviceToken`

## Build & Run

```bash
# Extension
npm install
npm run build        # → dist/ (load unpacked in Chrome)
npm run watch        # rebuild on changes
npm run typecheck    # tsc --noEmit

# Convex (after setting up project)
npx convex dev       # starts dev server, generates _generated/

# Web app
cd web && npm install
npm run dev          # Vite dev server on :5174
```

## File Organization
- `src/` — Extension TypeScript source (esbuild → dist/)
- `static/` — HTML, CSS, icons, fonts, manifest (copied to dist/)
- `convex/` — Convex schema + functions (deployed separately)
- `web/` — React web app (separate package)
- `scripts/build.mjs` — esbuild build script

## Convex URL Configuration
After `npx convex dev`, update `CONVEX_URL` in `src/convex-sync.ts` and set `VITE_CONVEX_URL` in `web/.env.local`.

## Palette
- Olive: `#B5A67A`
- Cream: `#FAF8F4`
- Dark: `#2D2A26`
- Green: `#7BA67B`
- Red: `#C47070`
