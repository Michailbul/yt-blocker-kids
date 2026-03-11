# Privacy Policy — YT Kids Guard

**Last updated:** March 11, 2026

## Overview

YT Kids Guard is a Chrome browser extension that provides parental controls for YouTube. This privacy policy explains what data the extension accesses, how it is used, and how it is stored.

## Data Collection

**YT Kids Guard does NOT collect, transmit, or share any personal data.**

The extension operates entirely within your browser. No data is sent to any external server, analytics service, or third party.

## Data Storage

All data is stored locally on your device using Chrome's built-in storage APIs:

### chrome.storage.sync (synced across your Chrome profile)
- Parent password hash (SHA-256, one-way — the actual password is never stored)
- Daily watch time limit setting
- Allowed channels list (channel names and handles)
- Blocked channels list (channel names and handles)
- Shorts blocking preference
- Filter mode preference (whitelist/blocklist)
- Extension enabled/disabled state

### chrome.storage.local (device only)
- Daily watch time counter (seconds used today, resets at midnight)

## Permissions Explained

| Permission | Why It's Needed |
|------------|----------------|
| `tabs` | Detect which tabs are YouTube pages to track watch time |
| `storage` | Store parental control settings and watch time data |
| `alarms` | Timer that checks watch time every minute and resets daily |
| `activeTab` | Detect the current YouTube channel when the popup is opened |
| `scripting` | Extract channel name from the active YouTube tab |
| `*://*.youtube.com/*` | Inject content scripts to block channels, Shorts, and show timer overlays |

## Network Requests

**This extension makes ZERO network requests.** All fonts are bundled locally within the extension package. No analytics, telemetry, or tracking of any kind is included.

## Password Security

- Parent passwords are hashed using SHA-256 with a salt before storage
- The plaintext password is never stored or transmitted
- Hashing occurs in the browser's popup context before being sent to the background service worker
- Brute-force protection limits password attempts (5 attempts, then 60-second lockout)

## Children's Privacy

This extension is designed for families with children. It does not:
- Track or profile children's viewing habits beyond the daily time counter
- Store video history or watch patterns
- Transmit any data about what children watch
- Use cookies or fingerprinting

The daily time counter only stores a total seconds count and the current date. It does not record which videos or channels were watched.

## Data Deletion

All extension data can be removed by:
1. Uninstalling the extension from `chrome://extensions/`
2. Or clearing Chrome's extension storage via Settings → Privacy → Clear Browsing Data → Check "Extensions"

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this file with an updated date. The extension will never introduce data collection or external transmission without explicit user consent.

## Contact

For questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/Michailbul/yt-blocker-kids/issues).
