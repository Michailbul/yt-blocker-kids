# Chrome Web Store — Setup Guide

## Prerequisites
- Google account
- $5 one-time developer registration fee

## 1. Register as a Developer
1. Go to https://chrome.google.com/webstore/devconsole
2. Pay the $5 fee if prompted
3. Accept the developer agreement

## 2. Account Tab (DO THIS FIRST)
1. Go to **Account** tab in the developer console
2. Set your **contact email** (e.g. mbuloichykai@gmail.com)
3. **Verify** the contact email (click the verification link sent to your inbox)

## 3. Upload the Extension
1. Click **"New Item"** (blue button, top right)
2. Upload `yt-kids-guard.zip` from the project root
   - Generate it with: `npm run package`
3. Click **"Upload"**

## 4. Fill in Store Listing

### Store Listing Tab
| Field | Value |
|-------|-------|
| **Language** | English (United States) |
| **Extension name** | YT Kids Guard — Parental YouTube Timer & Blocker |
| **Summary** (132 chars max) | Parental control for YouTube: set watch timers, allow specific channels, block Shorts. Manage from your phone via web dashboard. |
| **Description** | See below |
| **Category** | Productivity (or search for "Family") |

#### Description (copy this):
```
YT Kids Guard gives parents full control over their children's YouTube watching.

FEATURES:
• Daily watch timer — set a time limit (15 min to 3 hours), get a friendly overlay when time's up
• Channel filtering — "Allow Only" mode (whitelist) or "Block Specific" mode (blocklist)
• Block YouTube Shorts entirely
• Add channels by name, @handle, or by pasting a video URL
• Password-protected settings so kids can't change them
• Cloud sync — manage everything from your phone via the web dashboard

HOW IT WORKS:
1. Install the extension on your child's browser
2. Set a parent password in the popup
3. Configure daily limits, allowed/blocked channels, and Shorts blocking
4. (Optional) Create a family at https://yt-blocker-kids.vercel.app to manage settings remotely

The extension only runs on YouTube — no data is collected from any other website.
Works on Chrome, Brave, Edge, and any Chromium-based browser.
```

### Screenshots (READY — upload from `store-assets/`)
Upload these pre-made 1280×800 PNG files from the `store-assets/` folder:

1. **`screenshot1.png`** — Main hero: timer popup + feature list
2. **`screenshot2.png`** — Web dashboard: remote management from phone
3. **`screenshot3.png`** — Channel control: allowed/blocked lists + blocked overlay

### Icon (READY — upload from `store-assets/`)
Upload **`store-assets/icon128.png`** (128×128 PNG) in the Store Listing tab under "Icon".

### Promotional Images (optional but recommended)
| Size | Purpose |
|------|---------|
| 440×280 | Small promo tile (shown in search results) |
| 1400×560 | Large promo tile (shown on featured pages) |

## 5. Privacy Tab

### Single Purpose (copy this):
```
Parental control for YouTube: manages watch time limits and channel filtering for children's accounts.
```

### Permission Justification
| Permission | Justification |
|------------|--------------|
| `tabs` | Needed to detect when the user navigates to YouTube and inject the content script |
| `storage` | Stores parental settings (timer, channel lists, password) locally on the device |
| `alarms` | Triggers periodic sync with the cloud dashboard and timer checks |
| `activeTab` | Required to interact with the currently active YouTube tab |
| `scripting` | Injects the content script that shows the time-up overlay on YouTube |
| `sidePanel` | Allows opening the settings panel as a side panel |
| Host: youtube.com | The extension only operates on YouTube to monitor and control watch time |
| Host: convex.cloud | Syncs settings with the parent's web dashboard (optional cloud feature) |

### Remote Code Use Justification (copy this into the Privacy practices tab):
```
This extension does NOT use remote code. All JavaScript is bundled locally in the extension package. The only remote communication is HTTPS API calls to our Convex backend (convex.cloud) to sync parental settings (timer limits, channel allow/block lists) when the user opts into the optional cloud sync feature. No code is fetched, evaluated, or executed from any remote source. The convex.cloud host permission is used solely for JSON data transfer (settings sync and watch time reporting) via standard fetch() API calls.
```

### Data Usage
Check ALL three boxes:
- [x] "I do not sell or transfer user data to third parties"
- [x] "I do not use or transfer user data for purposes unrelated to the item's single purpose"
- [x] "I do not use or transfer user data to determine creditworthiness or for lending purposes"

### Privacy Policy URL (READY):
```
https://yt-blocker-kids.vercel.app/privacy.html
```
Paste this URL in the Privacy Policy field. It's already live.

## 6. Distribution Tab
- **Visibility**: Public
- **Distribution**: All regions (or select specific ones)
- **Pricing**: Free

## 7. Submit for Review
Click **"Submit for Review"** — typically takes 1-3 business days.

---

## Quick Checklist (fixes for the 6 errors)

| Error | Fix | Status |
|-------|-----|--------|
| Remote code justification required | Paste the text from Section 5 "Remote Code Use Justification" into Privacy practices tab | Copy-paste |
| At least one screenshot required | Upload `store-assets/screenshot1.png`, `screenshot2.png`, `screenshot3.png` | Ready in `store-assets/` |
| Icon image missing | Upload `store-assets/icon128.png` in Store Listing | Ready in `store-assets/` |
| Privacy policy link not reachable | Enter `https://yt-blocker-kids.vercel.app/privacy.html` | Live now |
| Contact email required | Set email in Account tab | Manual — do this first |
| Verify contact email | Click verification link in your inbox | Manual — do this first |

---

## After Approval

### Setting up Auto-Publish from GitHub
Once approved, you'll get an **Extension ID** (looks like `abcdefghijklmnop...`).

1. Go to https://console.cloud.google.com
2. Create a project → Enable "Chrome Web Store API"
3. Create OAuth 2.0 credentials (Desktop app type)
4. Get a refresh token using the OAuth playground
5. Set these GitHub secrets:
   ```
   gh secret set CHROME_EXTENSION_ID --body "your-extension-id"
   gh secret set CHROME_CLIENT_ID --body "your-oauth-client-id"
   gh secret set CHROME_CLIENT_SECRET --body "your-oauth-client-secret"
   gh secret set CHROME_REFRESH_TOKEN --body "your-refresh-token"
   ```
6. To publish an update:
   - Bump version in `static/manifest.json`
   - `git tag v1.0.1 && git push --tags`
   - GitHub Action uploads and publishes automatically
