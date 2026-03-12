# Chrome Web Store — Ready-to-Paste Fields
> All text below is ready to copy directly into the Chrome Web Store listing form.

---

## STORE LISTING TAB

### Extension Name (max 45 chars)
```
YT Kids Guard — YouTube Timer & Blocker
```

### Summary (max 132 chars)
```
Parental control for YouTube: set watch timers, allow specific channels, block Shorts. Manage from your phone via web dashboard.
```

### Description (full)
```
YT Kids Guard gives parents full control over their children's YouTube watching.

⏱ FEATURES:
• Daily watch timer — set a time limit (15 min to 3 hours), get a friendly overlay when time's up
• Channel filtering — "Allow Only" mode (whitelist) or "Block Specific" mode (blocklist)
• Block YouTube Shorts entirely
• Add channels by name, @handle, or by pasting a video URL
• Password-protected settings so kids can't change them
• Cloud sync — manage everything from your phone via the web dashboard

🔒 HOW IT WORKS:
1. Install the extension on your child's browser
2. Set a parent password in the popup
3. Configure daily limits, allowed/blocked channels, and Shorts blocking
4. (Optional) Create a family at https://yt-blocker-kids.vercel.app to manage settings remotely

The extension only runs on YouTube — no data is collected from any other website.

Works on Chrome, Brave, Edge, and any Chromium-based browser.
```

### Category
```
Productivity
```

---

## PRIVACY TAB

### Single Purpose Description
```
Parental control for YouTube: manages watch time limits and channel filtering for children's accounts.
```

### Permission Justifications (fill one per row)

| Permission | Justification text to paste |
|------------|------------------------------|
| `tabs` | Needed to detect when the user navigates to YouTube and track watch time on active tabs |
| `storage` | Stores parental settings (timer limit, channel lists, password hash) locally on the device |
| `alarms` | Triggers timer checks every minute and resets the daily watch counter at midnight |
| `activeTab` | Required to read the channel name from the active YouTube tab when the parent opens the popup |
| `scripting` | Injects the content script that shows the time-up overlay and manages channel blocking on YouTube |
| `sidePanel` | Allows the settings panel to open as a browser side panel for easier access |
| Host: `*://*.youtube.com/*` | The extension only operates on YouTube to monitor and control children's watch time |
| Host: `*://*.convex.cloud/*` | Syncs settings with the parent's optional web dashboard (cloud sync feature) |

### Data Usage Checkboxes — check ALL THREE:
- [x] I do not sell or transfer user data to third parties
- [x] I do not use or transfer user data for purposes unrelated to the item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy Policy URL
```
https://yt-blocker-kids.vercel.app/privacy.html
```
> ⚠️  Deploy your web app to Vercel first so this URL is live before submitting.

---

## DISTRIBUTION TAB

| Field | Value |
|-------|-------|
| Visibility | Public |
| Distribution | All regions |
| Pricing | Free |

---

## SCREENSHOTS NEEDED (1280×800 PNG)

Take these 4 screenshots using DevTools device emulation (F12 → device toolbar → 1280×800):

1. **Time-up overlay** — Set timer to 1 min, wait for the overlay on a YouTube video page
2. **Popup - Timer/Settings tab** — Open extension popup, show the settings tab
3. **Popup - Channels tab** — Show the allowed/blocked channel list
4. **Web dashboard** — Screenshot https://yt-blocker-kids.vercel.app showing the dashboard

---

## CHECKLIST BEFORE SUBMITTING

- [ ] `npm run package` ran successfully → `yt-kids-guard.zip` is up to date
- [ ] Web app deployed to Vercel (so privacy policy URL is live)
- [ ] 4 screenshots ready (1280×800 PNG)
- [ ] Developer registration fee ($5) paid at https://chrome.google.com/webstore/devconsole
- [ ] All fields above filled in
- [ ] All 3 data usage checkboxes checked
- [ ] Privacy policy URL verified live in browser
