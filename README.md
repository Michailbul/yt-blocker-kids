# YT Kids Guard

Parental control Chrome extension for YouTube. Set watch timers, manage allowed channels, block Shorts, and keep your kids safe from brain rot content.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Watch Timer** — Set a daily YouTube time limit (15–180 minutes). Auto-resets at midnight.
- **Channel Whitelist** — Only allow approved channels your kids can watch.
- **Channel Blocklist** — Alternatively, block specific channels while allowing everything else.
- **Block YouTube Shorts** — Completely hides Shorts from the feed and blocks Shorts URLs.
- **One-Click Block/Allow** — See the current channel and block or allow it instantly.
- **Password-Protected Parent Dashboard** — All settings locked behind a parent password.
- **Kid-Friendly Design** — Paper notebook aesthetic with crayon colors and playful animations.

## Installation

### From Source (Developer Mode)

**Windows / Mac / Linux:**

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Michailbul/yt-blocker-kids.git
   ```

2. **Open Chrome Extensions page:**
   - Navigate to `chrome://extensions/`
   - Or go to Menu → More Tools → Extensions

3. **Enable Developer Mode:**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the extension:**
   - Click "Load unpacked"
   - Select the `yt-blocker-kids` folder you just cloned

5. **Pin the extension:**
   - Click the puzzle piece icon in Chrome's toolbar
   - Pin "YT Kids Guard" for easy access

### Windows Quick Install (PowerShell)

```powershell
# Clone the repo
git clone https://github.com/Michailbul/yt-blocker-kids.git "$env:USERPROFILE\yt-blocker-kids"

# Open Chrome extensions page
Start-Process "chrome://extensions/"
```

Then enable Developer Mode and click "Load unpacked" → select `C:\Users\<YourName>\yt-blocker-kids`.

## First-Time Setup

1. Click the YT Kids Guard icon in Chrome's toolbar
2. Click "Parent Settings" at the bottom
3. Create a parent password (minimum 4 characters)
4. Configure your settings:
   - Set the daily watch time limit
   - Choose Whitelist or Blocklist mode
   - Add allowed/blocked channels
   - Toggle Shorts blocking

## How It Works

### For Kids
- Kids see a friendly timer showing remaining YouTube time
- When time runs out, a full-screen overlay blocks YouTube with a fun message
- Blocked channels show a friendly "not available" message
- Shorts are hidden from the feed and blocked when navigated to

### For Parents
- Password-protected dashboard with all controls
- **Timer**: Set daily limit, reset timer, add extra time (+15 min)
- **Channels**: Add channels by name or @handle, one-click block from any video
- **Modes**: Whitelist (only approved channels) or Blocklist (block specific ones)
- **Shorts**: Toggle YouTube Shorts blocking on/off
- **Enable/Disable**: Turn the entire extension on/off

## Security

- Passwords are SHA-256 hashed locally before being stored
- All settings changes require an authenticated session token
- Brute-force protection: 5 failed attempts triggers a 60-second lockout
- No data is sent to any external server — everything stays in Chrome's local storage
- Fonts are bundled locally (no external CDN requests)

## File Structure

```
yt-blocker-kids/
├── manifest.json       # Chrome extension manifest (MV3)
├── background.js       # Service worker: timer, auth, channel management
├── content.js          # YouTube page injection: blocking overlays
├── content.css         # Minimal content script styles
├── popup.html          # Extension popup markup
├── popup.css           # Paper/crayon aesthetic styles
├── popup.js            # Popup logic and UI
├── fonts/              # Bundled Google Fonts (Patrick Hand, Bubblegum Sans, Caveat)
└── icons/              # Extension icons (16, 48, 128px)
```

## Privacy

This extension:
- Does **NOT** collect or transmit any personal data
- Does **NOT** make any network requests (fonts are bundled locally)
- Stores all settings in Chrome's built-in storage (`chrome.storage.sync` and `chrome.storage.local`)
- Only accesses YouTube pages to detect channels and enforce parental controls

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Contributing

Contributions are welcome! Please open an issue or pull request.

## License

MIT License. See [LICENSE](LICENSE) for details.
