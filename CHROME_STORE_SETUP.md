# Chrome Web Store — Setup Guide

## Prerequisites
- Google account
- $5 one-time developer registration fee

## 1. Register as a Developer
1. Go to https://chrome.google.com/webstore/devconsole
2. Pay the $5 fee if prompted
3. Accept the developer agreement

## 2. Upload the Extension
1. Click **"New Item"** (blue button, top right)
2. Upload `yt-kids-guard.zip` from the project root
   - Generate it with: `npm run package`
3. Click **"Upload"**

## 3. Fill in Store Listing

### Store Listing Tab
| Field | Value |
|-------|-------|
| **Language** | English |
| **Extension name** | YT Kids Guard — Parental YouTube Timer & Blocker |
| **Summary** (132 chars max) | Parental control for YouTube: set watch timers, allow specific channels, block Shorts. Manage from your phone via web dashboard. |
| **Description** | See below |
| **Category** | Productivity (or search for "Family") |
| **Language** | English (United States) |

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

### Screenshots
You need **1280×800** or **640×400** PNG/JPEG screenshots. Take these:

1. **YouTube with overlay** — Go to YouTube, trigger the time-up overlay (set timer to 1 min), screenshot the full page
2. **Popup — Settings tab** — Open the extension popup, show the settings tab with timer, mode toggle, shorts blocking
3. **Popup — Channels tab** — Show allowed/blocked channel lists
4. **Web dashboard** — Screenshot https://yt-blocker-kids.vercel.app showing the dashboard with settings

To take a 1280×800 screenshot in Brave:
- Open DevTools (F12) → click the device toolbar icon → set dimensions to 1280×800
- Or use a screenshot extension

### Icon
Already included in the ZIP (128×128 PNG). The store will use it automatically.

### Promotional Images (optional but recommended)
| Size | Purpose |
|------|---------|
| 440×280 | Small promo tile (shown in search results) |
| 1400×560 | Large promo tile (shown on featured pages) |

## 4. Privacy Tab

### Single Purpose
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

### Data Usage
- Check: "I do not sell or transfer user data to third parties"
- Check: "I do not use or transfer user data for purposes unrelated to the item's single purpose"
- Check: "I do not use or transfer user data to determine creditworthiness or for lending purposes"

### Privacy Policy
You need a privacy policy URL. Quick option — create a GitHub Gist or a page on your site. Content:

```
Privacy Policy for YT Kids Guard

Last updated: March 2026

YT Kids Guard stores settings (watch timer, channel lists, parent password hash)
locally in Chrome storage.

If you opt into cloud sync, settings are synced to our Convex backend
(https://dashing-hippopotamus-836.convex.cloud) and associated with your family
account. No personal data beyond email (for account creation) and YouTube channel
names is stored.

We do not collect browsing history, video watching data, or any information from
sites other than YouTube. We do not sell or share any data with third parties.

Contact: [your email]
```

## 5. Distribution Tab
- **Visibility**: Public
- **Distribution**: All regions (or select specific ones)
- **Pricing**: Free

## 6. Submit for Review
Click **"Submit for Review"** — typically takes 1-3 business days.

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
