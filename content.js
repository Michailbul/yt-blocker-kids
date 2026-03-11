// ============================================================
// YT Kids Guard — Content Script (v2)
// YouTube injection: blocking, timer, thumbnail channel controls
// ============================================================

(() => {
  let overlayEl = null;
  let currentBlockReason = null;
  let lastUrl = location.href;
  let parentModeActive = false;
  let cachedSettings = null;
  let channelButtonsInjected = new WeakSet();

  // ---------- Colors ----------
  const ORANGE = '#D4723C';
  const RED = '#E25555';
  const GREEN = '#4CAF50';

  // ---------- Init ----------
  function init() {
    checkCurrentPage();
    startHeartbeat();
    observeNavigation();
    checkParentMode();
    setInterval(checkCurrentPage, 5000);
    setInterval(() => { injectChannelButtons(); checkParentMode(); }, 2000);
  }

  // ---------- Navigation (YouTube SPA) ----------
  function observeNavigation() {
    document.addEventListener('yt-navigate-finish', () => {
      setTimeout(() => { checkCurrentPage(); injectChannelButtons(); }, 600);
    });
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => { checkCurrentPage(); injectChannelButtons(); }, 600);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function startHeartbeat() {
    setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await chrome.runtime.sendMessage({ type: 'HEARTBEAT' });
        if (r?.isTimeUp) showOverlay('time_up');
      } catch {}
    }, 30000);
  }

  // ---------- Parent Mode ----------
  async function checkParentMode() {
    try {
      const data = await chrome.storage.local.get(['parentModeUntil']);
      parentModeActive = data.parentModeUntil && Date.now() < data.parentModeUntil;
    } catch { parentModeActive = false; }
  }

  // ---------- Page Check ----------
  async function checkCurrentPage() {
    const url = location.href;
    const isShort = url.includes('/shorts/');
    const channel = extractChannelInfo();

    try {
      const r = await chrome.runtime.sendMessage({
        type: 'REPORT_CHANNEL',
        channel,
        isShort,
        url,
      });
      if (!r) return;
      cachedSettings = r.settings;

      if (!r.settings.extensionEnabled) { removeOverlay(); return; }
      if (!r.allowed) showOverlay(r.reason);
      else removeOverlay();
    } catch {}

    hideShortsShelf();
  }

  // ---------- Channel Extraction ----------
  function extractChannelInfo() {
    let name = '', url = '', handle = '';
    const sels = [
      'ytd-video-owner-renderer #channel-name a',
      'ytd-video-owner-renderer ytd-channel-name a',
      '#owner #channel-name a',
      'ytd-channel-name yt-formatted-string a',
      '#upload-info #channel-name a',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) { name = el.textContent.trim(); url = el.href || ''; break; }
    }
    const m = url.match(/@([^/?\s]+)/);
    if (m) handle = '@' + m[1];
    if (!name) { const meta = document.querySelector('meta[name="author"]'); if (meta) name = meta.content; }
    return { name, url, handle };
  }

  // ---------- Shorts Hiding ----------
  function hideShortsShelf() {
    if (!cachedSettings?.blockShorts) return;
    document.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]').forEach(e => e.style.display = 'none');
    document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer').forEach(e => {
      const t = e.querySelector('#endpoint-title, yt-formatted-string');
      if (t && t.textContent.trim() === 'Shorts') e.style.display = 'none';
    });
  }

  // ============================================================
  // THUMBNAIL CHANNEL BUTTONS (home page, search, feed)
  // ============================================================
  function injectChannelButtons() {
    if (!parentModeActive) {
      // Remove existing buttons if parent mode deactivated
      document.querySelectorAll('.ytkg-channel-ctrl').forEach(e => e.remove());
      channelButtonsInjected = new WeakSet();
      return;
    }

    // Find all video renderers
    const renderers = document.querySelectorAll(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer'
    );

    renderers.forEach(renderer => {
      if (channelButtonsInjected.has(renderer)) return;

      const channelEl = renderer.querySelector(
        '#channel-name a, ytd-channel-name a, .ytd-channel-name a, #text.ytd-channel-name'
      );
      if (!channelEl) return;

      const channelName = (channelEl.textContent || '').trim();
      if (!channelName) return;

      const channelUrl = channelEl.href || '';
      const handleMatch = channelUrl.match(/@([^/?\s]+)/);
      const handle = handleMatch ? '@' + handleMatch[1] : '';

      // Find the channel name container to attach our button
      const channelContainer = channelEl.closest('#channel-name') || channelEl.closest('ytd-channel-name') || channelEl.parentElement;
      if (!channelContainer) return;

      // Don't double-inject
      if (channelContainer.querySelector('.ytkg-channel-ctrl')) return;

      const btn = createChannelButton(channelName, channelUrl, handle);
      channelContainer.style.position = 'relative';
      channelContainer.appendChild(btn);
      channelButtonsInjected.add(renderer);
    });
  }

  function createChannelButton(name, url, handle) {
    const wrapper = document.createElement('span');
    wrapper.className = 'ytkg-channel-ctrl';
    wrapper.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin-left: 6px;
      vertical-align: middle;
      position: relative;
      z-index: 10;
    `;

    // Status dot
    const dot = document.createElement('span');
    dot.className = 'ytkg-dot';
    dot.style.cssText = `
      width: 8px; height: 8px;
      border-radius: 50%;
      background: ${ORANGE};
      cursor: pointer;
      transition: all 0.2s;
      flex-shrink: 0;
    `;

    // Popup menu (hidden by default)
    const menu = document.createElement('div');
    menu.className = 'ytkg-menu';
    menu.style.cssText = `
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      background: white;
      border: 1px solid #F0DED0;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(212,114,60,0.15);
      padding: 4px;
      z-index: 9999;
      min-width: 120px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 12px;
    `;

    const allowBtn = createMenuBtn('Allow', GREEN, async () => {
      await chrome.runtime.sendMessage({
        type: 'ADD_ALLOWED_CHANNEL',
        channel: { name, url, handle },
        sessionToken: await getSessionToken(),
      });
      updateDot(dot, 'allowed');
      menu.style.display = 'none';
    });

    const blockBtn = createMenuBtn('Block', RED, async () => {
      await chrome.runtime.sendMessage({
        type: 'BLOCK_CHANNEL',
        channel: { name, url, handle },
        sessionToken: await getSessionToken(),
      });
      updateDot(dot, 'blocked');
      menu.style.display = 'none';
      // Re-check page to apply blocking
      setTimeout(checkCurrentPage, 300);
    });

    menu.appendChild(allowBtn);
    menu.appendChild(blockBtn);

    // Toggle menu on dot click
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Close all other menus
      document.querySelectorAll('.ytkg-menu').forEach(m => { if (m !== menu) m.style.display = 'none'; });
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) menu.style.display = 'none';
    }, { passive: true });

    wrapper.appendChild(dot);
    wrapper.appendChild(menu);

    // Set initial dot color from current settings
    updateDotFromSettings(dot, name);

    return wrapper;
  }

  function createMenuBtn(label, color, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      display: block;
      width: 100%;
      padding: 6px 10px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #2C1A0E;
      font-family: inherit;
      font-size: 12px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = color + '18'; btn.style.color = color; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = '#2C1A0E'; });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return btn;
  }

  function updateDot(dot, status) {
    if (status === 'allowed') { dot.style.background = GREEN; dot.title = 'Allowed'; }
    else if (status === 'blocked') { dot.style.background = RED; dot.title = 'Blocked'; }
    else { dot.style.background = ORANGE; dot.title = 'Unknown'; }
  }

  async function updateDotFromSettings(dot, channelName) {
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (!state?.settings) return;
      const n = (v) => (v || '').toLowerCase().trim();
      const isAllowed = state.settings.allowedChannels.some(c => n(c.name) === n(channelName));
      const isBlocked = state.settings.blockedChannels.some(c => n(c.name) === n(channelName));
      if (isBlocked) updateDot(dot, 'blocked');
      else if (isAllowed) updateDot(dot, 'allowed');
      else updateDot(dot, 'unknown');
    } catch {}
  }

  async function getSessionToken() {
    // Parent mode uses background's session, but we pass through
    // The background will check if session is valid
    return '';
  }

  // ============================================================
  // BLOCKING OVERLAY
  // ============================================================
  function showOverlay(reason) {
    if (overlayEl && currentBlockReason === reason) return;
    currentBlockReason = reason;
    removeOverlay();
    pauseVideo();

    const host = document.createElement('div');
    host.id = 'yt-kids-guard-overlay';
    const root = host.attachShadow({ mode: 'closed' });

    const msgs = {
      time_up: {
        icon: '\u23F0',
        title: "Time's Up!",
        sub: "You've used all your YouTube time for today.",
        detail: 'Time to go play, read a book, or do something fun outdoors!',
        color: RED,
      },
      channel_blocked: {
        icon: '\uD83D\uDEE1\uFE0F',
        title: 'Channel Not Available',
        sub: 'This channel isn\'t on your approved list.',
        detail: 'Ask a parent to add this channel if you\'d like to watch it!',
        color: ORANGE,
      },
      shorts_blocked: {
        icon: '\u270B',
        title: 'Shorts Are Off',
        sub: 'YouTube Shorts are turned off for you.',
        detail: 'Try watching a full video from your approved channels!',
        color: '#A78BFA',
      },
    };
    const m = msgs[reason] || msgs.channel_blocked;

    root.innerHTML = `
      <style>
        :host { all: initial; }
        .overlay {
          position: fixed; inset: 0; z-index: 2147483647;
          display: flex; align-items: center; justify-content: center;
          background: #FFFAF7;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        }
        .content {
          text-align: center; padding: 40px; max-width: 420px;
          animation: fadeUp 0.5s cubic-bezier(0.34, 1.4, 0.64, 1);
        }
        .icon-circle {
          width: 80px; height: 80px; margin: 0 auto 20px;
          border-radius: 50%;
          background: ${m.color}15;
          border: 2px solid ${m.color}30;
          display: flex; align-items: center; justify-content: center;
          font-size: 36px;
        }
        h1 {
          font-size: 28px; font-weight: 700;
          color: #2C1A0E; margin: 0 0 8px;
        }
        .sub {
          font-size: 16px; color: #7A5E4A;
          margin: 0 0 12px; line-height: 1.5;
        }
        .detail {
          font-size: 14px; color: #B8A090;
          line-height: 1.6;
        }
        .accent-bar {
          width: 40px; height: 3px; border-radius: 2px;
          background: ${m.color}; margin: 16px auto 0;
        }
        @keyframes fadeUp {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      </style>
      <div class="overlay">
        <div class="content">
          <div class="icon-circle">${m.icon}</div>
          <h1>${m.title}</h1>
          <p class="sub">${m.sub}</p>
          <p class="detail">${m.detail}</p>
          <div class="accent-bar"></div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(host);
    overlayEl = host;
    blockInteraction();
  }

  function removeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; currentBlockReason = null; unblockInteraction(); }
  }

  function pauseVideo() {
    const v = document.querySelector('video');
    if (v) v.pause();
  }

  let blockHandler = null;
  function blockInteraction() {
    blockHandler = (e) => { if (overlayEl) { e.stopPropagation(); e.preventDefault(); } };
    ['keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchmove'].forEach(
      evt => document.addEventListener(evt, blockHandler, { capture: true })
    );
  }
  function unblockInteraction() {
    if (!blockHandler) return;
    ['keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchmove'].forEach(
      evt => document.removeEventListener(evt, blockHandler, { capture: true })
    );
    blockHandler = null;
  }

  // ---------- Message Listener ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'BLOCK') showOverlay(msg.reason);
    else if (msg.type === 'UNBLOCK') removeOverlay();
    else if (msg.type === 'SETTINGS_UPDATED') { cachedSettings = msg.settings; checkCurrentPage(); }
    else if (msg.type === 'PARENT_MODE_ACTIVATED') { parentModeActive = true; injectChannelButtons(); }
  });

  // ---------- Start ----------
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
