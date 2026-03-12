// ============================================================
// YT Kids Guard — Content Script (v2)
// YouTube injection: blocking, timer, thumbnail channel controls
// ============================================================

import type {
  Channel,
  BlockReason,
  ReportChannelResponse,
  HeartbeatResponse,
  Settings,
  FullState,
  PasswordResult,
} from './types';

(() => {
  let overlayEl: HTMLElement | null = null;
  let currentBlockReason: BlockReason | null = null;
  let lastUrl = location.href;
  let cachedSettings: Pick<Settings, 'blockShorts' | 'filterMode' | 'extensionEnabled'> | null = null;
  const injectedChannelNames = new WeakSet<Element>();

  // ---------- Colors ----------
  const OLIVE = '#B5A67A';
  const RED = '#C47070';
  const GREEN = '#7BA67B';

  // ---------- Content Auth Session ----------
  let contentSessionToken = '';

  async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'yt-kids-guard-salt-2024');
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function isContentAuthed(): Promise<boolean> {
    try {
      const data = await chrome.storage.local.get(['contentAuthUntil']);
      return !!(data.contentAuthUntil && Date.now() < data.contentAuthUntil);
    } catch { return false; }
  }

  async function storeContentAuth(token: string): Promise<void> {
    contentSessionToken = token;
    const until = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
    await chrome.storage.local.set({ contentAuthUntil: until });
  }

  async function getSessionToken(): Promise<string> {
    return contentSessionToken;
  }

  // ---------- Init ----------
  function init(): void {
    checkCurrentPage();
    startHeartbeat();
    observeNavigation();
    setInterval(checkCurrentPage, 5000);
    setInterval(injectChannelButtons, 2000);
  }

  // ---------- Navigation (YouTube SPA) ----------
  function observeNavigation(): void {
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

  function startHeartbeat(): void {
    setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await chrome.runtime.sendMessage({ type: 'HEARTBEAT' }) as HeartbeatResponse | undefined;
        if (r?.isTimeUp) showOverlay('time_up');
      } catch {}
    }, 30000);
  }

  // ---------- Page Check ----------
  async function checkCurrentPage(): Promise<void> {
    const url = location.href;
    const isShort = url.includes('/shorts/');
    const isWatchPage = url.includes('/watch?') || url.includes('/watch/');
    const channel = isWatchPage ? extractChannelInfo() : { name: '', url: '', handle: '' };

    try {
      const r = await chrome.runtime.sendMessage({
        type: 'REPORT_CHANNEL',
        channel,
        isShort,
        isWatchPage,
        url,
      }) as ReportChannelResponse | undefined;
      if (!r) return;
      cachedSettings = r.settings;

      if (!r.settings.extensionEnabled) { removeOverlay(); return; }
      if (!r.allowed) showOverlay(r.reason!);
      else removeOverlay();
    } catch {}

    hideShortsShelf();
  }

  // ---------- Channel Extraction ----------
  function extractChannelInfo(): Channel {
    let name = '', url = '', handle = '';
    const sels = [
      'ytd-video-owner-renderer #channel-name a',
      'ytd-video-owner-renderer ytd-channel-name a',
      '#owner #channel-name a',
      'ytd-channel-name yt-formatted-string a',
      '#upload-info #channel-name a',
    ];
    for (const s of sels) {
      const el = document.querySelector(s) as HTMLAnchorElement | null;
      if (el) { name = el.textContent?.trim() || ''; url = el.href || ''; break; }
    }
    const m = url.match(/@([^/?\s]+)/);
    if (m) handle = '@' + m[1];
    if (!name) {
      const meta = document.querySelector('meta[name="author"]') as HTMLMetaElement | null;
      if (meta) name = meta.content;
    }
    return { name, url, handle };
  }

  // ---------- Shorts Hiding ----------
  function hideShortsShelf(): void {
    if (!cachedSettings?.blockShorts) return;
    document.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]').forEach(e => {
      (e as HTMLElement).style.display = 'none';
    });
    document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer').forEach(e => {
      const t = e.querySelector('#endpoint-title, yt-formatted-string');
      if (t && t.textContent?.trim() === 'Shorts') (e as HTMLElement).style.display = 'none';
    });
  }

  // ============================================================
  // THUMBNAIL CHANNEL BUTTONS (home, search, feed)
  // Always visible, password-protected on click.
  //
  // Finds every <ytd-channel-name> on the page that is actually
  // visible (non-zero dimensions) and attaches a shield button.
  // YouTube renders two per video — one hidden in #byline-container
  // (0×0) and one visible in #channel-info. We skip the hidden ones.
  //
  // IMPORTANT: YouTube enforces Trusted Types, so we MUST use
  // DOM APIs (createElement / createElementNS) — never innerHTML.
  // ============================================================

  function createShieldSVG(): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');

    const p1 = document.createElementNS(ns, 'path');
    p1.setAttribute('d', 'M10 2L3 5.5V9.5C3 13.64 6.01 17.47 10 18.5C13.99 17.47 17 13.64 17 9.5V5.5L10 2Z');
    p1.setAttribute('fill', 'currentColor');
    p1.setAttribute('opacity', '0.25');
    p1.setAttribute('stroke', 'currentColor');
    p1.setAttribute('stroke-width', '1.5');
    p1.setAttribute('stroke-linejoin', 'round');

    const p2 = document.createElementNS(ns, 'path');
    p2.setAttribute('d', 'M8 10L9.5 11.5L12.5 8.5');
    p2.setAttribute('stroke', 'currentColor');
    p2.setAttribute('stroke-width', '1.5');
    p2.setAttribute('stroke-linecap', 'round');
    p2.setAttribute('stroke-linejoin', 'round');

    svg.appendChild(p1);
    svg.appendChild(p2);
    return svg;
  }

  function createLockSVG(): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', '3'); rect.setAttribute('y', '7');
    rect.setAttribute('width', '10'); rect.setAttribute('height', '7');
    rect.setAttribute('rx', '1.5');

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M5 7V5a3 3 0 0 1 6 0v2');

    svg.appendChild(rect);
    svg.appendChild(path);
    return svg;
  }

  function injectChannelButtons(): void {
    const channelNameEls = document.querySelectorAll('ytd-channel-name');

    channelNameEls.forEach(channelNameEl => {
      if (injectedChannelNames.has(channelNameEl)) return;

      // Skip channel name in the video player / watch page owner area
      if (channelNameEl.closest('ytd-video-owner-renderer') || channelNameEl.closest('ytd-watch-metadata')) return;

      // Skip zero-dimension elements (YouTube renders hidden duplicates)
      const rect = channelNameEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Find the anchor or formatted-string inside
      const anchor = channelNameEl.querySelector('yt-formatted-string a, a') as HTMLAnchorElement | null;
      const fmtStr = channelNameEl.querySelector('yt-formatted-string') as HTMLElement | null;
      const textSource = anchor || fmtStr;
      if (!textSource) return;

      const channelName = (textSource.textContent || '').trim();
      if (!channelName) return;

      const channelUrl = anchor?.href || '';
      const handleMatch = channelUrl.match(/@([^/?\s]+)/);
      const handle = handleMatch ? '@' + handleMatch[1] : '';

      // Already has a button?
      if (channelNameEl.querySelector('.ytkg-channel-ctrl')) return;

      const btn = createChannelButton(channelName, channelUrl, handle);
      (channelNameEl as HTMLElement).style.overflow = 'visible';
      channelNameEl.appendChild(btn);
      injectedChannelNames.add(channelNameEl);
    });
  }

  function createChannelButton(name: string, url: string, handle: string): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'ytkg-channel-ctrl';
    wrapper.style.cssText = `
      display: inline-flex; align-items: center; margin-left: 4px;
      vertical-align: middle; position: relative; z-index: 10;
    `;

    // Shield button (DOM-built, no innerHTML)
    const shieldBtn = document.createElement('span');
    shieldBtn.className = 'ytkg-shield';
    shieldBtn.appendChild(createShieldSVG());
    shieldBtn.title = 'Manage channel';
    shieldBtn.style.cssText = `
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border-radius: 5px;
      background: ${OLIVE}20; color: ${OLIVE}; cursor: pointer;
      transition: all 0.15s; flex-shrink: 0; border: 1px solid ${OLIVE}50;
    `;
    shieldBtn.addEventListener('mouseenter', () => {
      shieldBtn.style.background = OLIVE + '38';
      shieldBtn.style.transform = 'scale(1.12)';
    });
    shieldBtn.addEventListener('mouseleave', () => {
      shieldBtn.style.background = shieldBtn.dataset.bg || (OLIVE + '20');
      shieldBtn.style.transform = 'scale(1)';
    });

    // Dropdown menu (DOM-built, no innerHTML)
    const menu = document.createElement('div');
    menu.className = 'ytkg-menu';
    menu.style.cssText = `
      display: none; position: absolute; top: calc(100% + 4px); left: 0;
      background: #FAF8F4; border: 1px solid #E8E2D8; border-radius: 8px;
      box-shadow: 0 4px 16px rgba(181,166,122,0.15); padding: 4px;
      z-index: 9999; min-width: 120px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 12px;
    `;

    const allowBtn = createMenuBtn('Allow', GREEN, async () => {
      await chrome.runtime.sendMessage({
        type: 'ADD_ALLOWED_CHANNEL',
        channel: { name, url, handle },
        sessionToken: await getSessionToken(),
      });
      setShieldStatus(shieldBtn, 'allowed');
      menu.style.display = 'none';
    });

    const blockBtn = createMenuBtn('Block', RED, async () => {
      await chrome.runtime.sendMessage({
        type: 'BLOCK_CHANNEL',
        channel: { name, url, handle },
        sessionToken: await getSessionToken(),
      });
      setShieldStatus(shieldBtn, 'blocked');
      menu.style.display = 'none';
      setTimeout(checkCurrentPage, 300);
    });

    menu.appendChild(allowBtn);
    menu.appendChild(blockBtn);

    // Click handler — password-protected
    shieldBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Close other open menus & dialogs
      document.querySelectorAll('.ytkg-menu').forEach(m => {
        if (m !== menu) (m as HTMLElement).style.display = 'none';
      });
      document.querySelectorAll('.ytkg-auth-dialog').forEach(d => d.remove());

      if (menu.style.display !== 'none') {
        menu.style.display = 'none';
        return;
      }

      if (await isContentAuthed()) {
        menu.style.display = 'block';
      } else {
        showPasswordDialog(wrapper, () => {
          menu.style.display = 'block';
        });
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target as Node)) menu.style.display = 'none';
    }, { passive: true });

    wrapper.appendChild(shieldBtn);
    wrapper.appendChild(menu);

    // Set initial colour from settings
    loadShieldStatus(shieldBtn, name);

    return wrapper;
  }

  // ---------- Password Dialog (Shadow DOM — innerHTML is safe inside shadow roots) ----------
  function showPasswordDialog(anchor: HTMLElement, onSuccess: () => void): void {
    document.querySelectorAll('.ytkg-auth-dialog').forEach(d => d.remove());

    const host = document.createElement('div');
    host.className = 'ytkg-auth-dialog';
    host.style.cssText = `position:absolute;top:calc(100% + 4px);left:0;z-index:10000;`;
    const shadow = host.attachShadow({ mode: 'closed' });

    // Build dialog with DOM APIs (Trusted Types safe)
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .dlg { background:#FAF8F4; border:1px solid #E8E2D8; border-radius:10px;
             box-shadow:0 6px 24px rgba(181,166,122,0.18); padding:12px;
             width:200px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
             animation:fadeIn .15s ease; }
      @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
      .hdr { font-size:12px; font-weight:600; color:#2D2A26; margin:0 0 8px;
             display:flex; align-items:center; gap:6px; }
      .hdr svg { color:${OLIVE}; flex-shrink:0; }
      input { width:100%; padding:7px 10px; border:1.5px solid #E8E2D8; border-radius:6px;
              font-size:12px; font-family:inherit; outline:none; box-sizing:border-box; }
      input:focus { border-color:${OLIVE}; }
      .row { display:flex; gap:6px; margin-top:8px; }
      button { flex:1; padding:6px 0; border:none; border-radius:6px; font-size:11px;
               font-weight:600; font-family:inherit; cursor:pointer; }
      .c { background:#F0EBE3; color:#6B655C; } .c:hover { background:#E8E2D8; }
      .u { background:${OLIVE}; color:#fff; } .u:hover { background:#A09570; }
      .err { font-size:11px; color:${RED}; margin-top:6px; display:none; }
      .err.vis { display:block; }
    `;

    const dlg = document.createElement('div');
    dlg.className = 'dlg';

    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    hdr.appendChild(createLockSVG());
    hdr.appendChild(document.createTextNode('Parent Password'));

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Enter password';
    input.autocomplete = 'off';

    const errEl = document.createElement('div');
    errEl.className = 'err';
    errEl.textContent = 'Wrong password';

    const row = document.createElement('div');
    row.className = 'row';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'c';
    cancelBtn.textContent = 'Cancel';

    const unlockBtn = document.createElement('button');
    unlockBtn.className = 'u';
    unlockBtn.textContent = 'Unlock';

    row.appendChild(cancelBtn);
    row.appendChild(unlockBtn);

    dlg.appendChild(hdr);
    dlg.appendChild(input);
    dlg.appendChild(errEl);
    dlg.appendChild(row);

    shadow.appendChild(style);
    shadow.appendChild(dlg);

    cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); host.remove(); });

    async function tryUnlock() {
      const pw = input.value;
      if (!pw) return;
      const hash = await hashPassword(pw);
      try {
        const r = await chrome.runtime.sendMessage({ type: 'VERIFY_PASSWORD', passwordHash: hash }) as PasswordResult;
        if (r.success) {
          await storeContentAuth(r.sessionToken || '');
          host.remove();
          onSuccess();
        } else if (r.locked) {
          errEl.textContent = `Locked for ${r.retryAfter}s`;
          errEl.classList.add('vis');
          input.value = '';
        } else {
          errEl.textContent = r.attemptsLeft ? `Wrong password. ${r.attemptsLeft} left.` : 'Wrong password';
          errEl.classList.add('vis');
          input.value = '';
          input.focus();
        }
      } catch {
        errEl.textContent = 'Error verifying';
        errEl.classList.add('vis');
      }
    }

    unlockBtn.addEventListener('click', (e) => { e.stopPropagation(); tryUnlock(); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') tryUnlock();
      if (e.key === 'Escape') host.remove();
    });

    const closeHandler = (e: MouseEvent) => {
      if (!host.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
        host.remove();
        document.removeEventListener('click', closeHandler, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0);

    anchor.appendChild(host);
    setTimeout(() => input.focus(), 50);
  }

  function createMenuBtn(label: string, color: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      display:block; width:100%; padding:6px 10px; border:none; border-radius:4px;
      background:transparent; color:#2D2A26; font-family:inherit; font-size:12px;
      cursor:pointer; text-align:left; transition:background .15s;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = color + '18'; btn.style.color = color; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = '#2D2A26'; });
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
    return btn;
  }

  function setShieldStatus(shield: HTMLElement, status: 'allowed' | 'blocked' | 'unknown'): void {
    const cfg = {
      allowed: { color: GREEN, title: 'Allowed' },
      blocked: { color: RED, title: 'Blocked' },
      unknown: { color: OLIVE, title: 'Manage channel' },
    }[status];
    shield.style.color = cfg.color;
    shield.style.borderColor = cfg.color + '50';
    shield.style.background = cfg.color + '20';
    shield.dataset.bg = cfg.color + '20';
    shield.title = cfg.title;
  }

  async function loadShieldStatus(shield: HTMLElement, channelName: string): Promise<void> {
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' }) as FullState | undefined;
      if (!state?.settings) return;
      const n = (v: string) => (v || '').toLowerCase().trim();
      const isBlocked = state.settings.blockedChannels.some(c => n(c.name) === n(channelName));
      const isAllowed = state.settings.allowedChannels.some(c => n(c.name) === n(channelName));
      setShieldStatus(shield, isBlocked ? 'blocked' : isAllowed ? 'allowed' : 'unknown');
    } catch {}
  }

  // ============================================================
  // BLOCKING OVERLAY  (uses Shadow DOM — innerHTML is fine here)
  // ============================================================
  function showOverlay(reason: BlockReason): void {
    if (overlayEl && currentBlockReason === reason) return;
    currentBlockReason = reason;
    removeOverlay();
    pauseVideo();

    const host = document.createElement('div');
    host.id = 'yt-kids-guard-overlay';
    const root = host.attachShadow({ mode: 'closed' });

    const msgs: Record<BlockReason, { icon: string; title: string; sub: string; detail: string; color: string }> = {
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
        color: OLIVE,
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

    // Build overlay with DOM APIs (Trusted Types safe)
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .overlay {
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        background: #F0EBE3;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
      .content {
        text-align: center; padding: 40px; max-width: 420px;
        animation: fadeUp 0.5s cubic-bezier(0.34, 1.4, 0.64, 1);
      }
      .icon-circle {
        width: 80px; height: 80px; margin: 0 auto 20px; border-radius: 50%;
        background: ${m.color}15; border: 2px solid ${m.color}30;
        display: flex; align-items: center; justify-content: center; font-size: 36px;
      }
      h1 { font-size: 28px; font-weight: 700; color: #2D2A26; margin: 0 0 8px; }
      .sub { font-size: 16px; color: #6B655C; margin: 0 0 12px; line-height: 1.5; }
      .detail { font-size: 14px; color: #A09A90; line-height: 1.6; }
      .accent-bar { width: 40px; height: 3px; border-radius: 2px; background: ${m.color}; margin: 16px auto 0; }
      @keyframes fadeUp {
        from { transform: translateY(16px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    const content = document.createElement('div');
    content.className = 'content';

    const iconCircle = document.createElement('div');
    iconCircle.className = 'icon-circle';
    iconCircle.textContent = m.icon;

    const h1 = document.createElement('h1');
    h1.textContent = m.title;

    const sub = document.createElement('p');
    sub.className = 'sub';
    sub.textContent = m.sub;

    const detail = document.createElement('p');
    detail.className = 'detail';
    detail.textContent = m.detail;

    const bar = document.createElement('div');
    bar.className = 'accent-bar';

    content.appendChild(iconCircle);
    content.appendChild(h1);
    content.appendChild(sub);
    content.appendChild(detail);
    content.appendChild(bar);
    overlay.appendChild(content);

    root.appendChild(style);
    root.appendChild(overlay);

    document.documentElement.appendChild(host);
    overlayEl = host;
    blockInteraction();
  }

  function removeOverlay(): void {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; currentBlockReason = null; unblockInteraction(); }
  }

  function pauseVideo(): void {
    const v = document.querySelector('video');
    if (v) v.pause();
  }

  let blockHandler: ((e: Event) => void) | null = null;
  function blockInteraction(): void {
    blockHandler = (e: Event) => { if (overlayEl) { e.stopPropagation(); e.preventDefault(); } };
    (['keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchmove'] as const).forEach(
      evt => document.addEventListener(evt, blockHandler!, { capture: true, passive: false })
    );
  }
  function unblockInteraction(): void {
    if (!blockHandler) return;
    (['keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchmove'] as const).forEach(
      evt => document.removeEventListener(evt, blockHandler!, { capture: true })
    );
    blockHandler = null;
  }

  // ---------- Message Listener ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'BLOCK') showOverlay(msg.reason);
    else if (msg.type === 'UNBLOCK') removeOverlay();
    else if (msg.type === 'SETTINGS_UPDATED') { cachedSettings = msg.settings; checkCurrentPage(); }
  });

  // ---------- Start ----------
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
