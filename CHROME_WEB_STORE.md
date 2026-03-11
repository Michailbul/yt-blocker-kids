# Chrome Web Store Listing

## Extension Name
YT Kids Guard — Parental YouTube Timer & Blocker

## Short Description (132 chars max)
Parental control for YouTube: set watch timers, allow specific channels, block Shorts and unwanted content. Kid-friendly design.

## Detailed Description

**Take control of your child's YouTube experience.**

YT Kids Guard is a lightweight parental control extension that helps families manage screen time and content on YouTube. Set daily watch timers, approve specific channels, and block YouTube Shorts — all protected behind a parent password.

**Key Features:**

⏰ **Watch Timer**
Set a daily YouTube time limit from 15 minutes to 3 hours. The timer counts down while your child watches and automatically blocks YouTube when time is up. Resets automatically at midnight.

✅ **Channel Whitelist**
Create a list of approved channels. Your child can only watch videos from channels you've specifically allowed. Perfect for younger children.

🚫 **Channel Blocklist**
Alternatively, block specific channels while allowing everything else. Better for older kids who need more freedom.

📱 **Block YouTube Shorts**
Completely removes Shorts from the YouTube feed and blocks Shorts URLs. No more endless short-form scrolling.

⚡ **One-Click Block**
See the current channel name right in the extension popup. Block or allow any channel with a single click while watching over your child's shoulder.

🔒 **Password Protected**
All parent settings are locked behind a password. Brute-force protection prevents kids from guessing the password.

🎨 **Kid-Friendly Design**
Fun paper notebook design with crayon colors that kids enjoy looking at. Friendly messages when time is up or content is blocked.

**Privacy First:**
- No data collection whatsoever
- No network requests (all fonts bundled locally)
- Everything stored in Chrome's local storage
- No analytics or tracking
- Open source on GitHub

**How to Get Started:**
1. Install the extension
2. Click the icon and set your parent password
3. Configure your daily time limit and channel rules
4. Done! Your child is protected.

Works on all YouTube pages including videos, channels, search, and the home feed. Supports both youtube.com and m.youtube.com.

## Category
Productivity (or "Fun" if available)

## Language
English

## Tags/Keywords
parental control, youtube, kids, screen time, timer, channel blocker, shorts blocker, family, child safety

## Screenshots Needed
1. Kids view — Timer countdown with paper aesthetic (1280x800)
2. Parent dashboard — Settings and channel management (1280x800)
3. Blocked overlay — "Time's Up!" screen on YouTube (1280x800)
4. Channel blocking — One-click block demonstration (1280x800)

## Privacy Practices (Chrome Web Store form)

**Single purpose description:**
This extension provides parental controls for YouTube by managing watch time limits and channel access for children.

**Permission justifications:**

| Permission | Justification |
|------------|--------------|
| `tabs` | Required to detect YouTube tabs and track which tab is currently active for watch time counting |
| `storage` | Required to persist parental control settings (time limits, channel lists, password hash) across browser sessions |
| `alarms` | Required for the watch time timer that checks every minute and the daily reset check |
| `activeTab` | Required to detect the current YouTube channel name when the parent opens the extension popup |
| `scripting` | Required to extract channel information from the active YouTube tab for the one-click block feature |
| Host: `youtube.com` | Required to inject content scripts that block unauthorized channels, hide Shorts, and display time-up overlays |

**Data usage:**
- [ ] Does not collect user data
- [x] All data is stored locally
- [ ] No data is transmitted to any server

## Publishing Checklist
- [ ] Register Chrome Web Store developer account ($5 fee)
- [ ] Create 1280x800 screenshots (at least 1, up to 5)
- [ ] Create 440x280 promotional tile image
- [ ] Host privacy policy at a public URL (use GitHub Pages or raw GitHub link)
- [ ] Package extension: `zip -r yt-kids-guard.zip . -x ".*" -x "CHROME_WEB_STORE.md"`
- [ ] Upload to Chrome Web Store Developer Dashboard
- [ ] Fill in all listing details from this document
- [ ] Submit for review (typically 1-3 business days)
