// ============================================================
// YT Kids Guard — Content Script (YouTube Injection)
// ============================================================

(() => {
  let overlayEl = null;
  let currentBlockReason = null;
  let checkInterval = null;
  let heartbeatInterval = null;
  let lastUrl = location.href;

  // ---------- Init ----------
  function init() {
    checkCurrentPage();
    startHeartbeat();
    observeNavigation();
    startPeriodicCheck();
  }

  // ---------- Navigation Detection (YouTube SPA) ----------
  function observeNavigation() {
    // YouTube fires this on SPA navigation
    document.addEventListener('yt-navigate-finish', () => {
      setTimeout(checkCurrentPage, 500);
    });

    // Fallback: watch URL changes
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(checkCurrentPage, 500);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function startPeriodicCheck() {
    checkInterval = setInterval(checkCurrentPage, 5000);
  }

  function startHeartbeat() {
    heartbeatInterval = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        try {
          const resp = await chrome.runtime.sendMessage({ type: 'HEARTBEAT' });
          if (resp && resp.isTimeUp) {
            showOverlay('time_up');
          }
        } catch {}
      }
    }, 30000);
  }

  // ---------- Page Check ----------
  async function checkCurrentPage() {
    const url = location.href;
    const isShort = url.includes('/shorts/');
    const isVideo = url.includes('/watch') || isShort;
    const isHome = url.match(/youtube\.com\/?(\?.*)?$/);
    const isChannel = url.includes('/@') || url.includes('/channel/');

    // Get channel info
    const channel = extractChannelInfo();
    const isShortPage = isShort;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'REPORT_CHANNEL',
        channel,
        isShort: isShortPage,
        url,
      });

      if (!resp) return;

      if (!resp.settings.extensionEnabled) {
        removeOverlay();
        return;
      }

      if (!resp.allowed) {
        showOverlay(resp.reason);
      } else {
        removeOverlay();
      }
    } catch {
      // Extension context invalidated
    }

    // Also hide Shorts shelf elements on home/browse pages
    hideShortsShelf();
  }

  // ---------- Channel Extraction ----------
  function extractChannelInfo() {
    let name = '';
    let url = '';
    let handle = '';

    // Try multiple selectors for channel name
    const selectors = [
      'ytd-video-owner-renderer #channel-name a',
      'ytd-video-owner-renderer ytd-channel-name a',
      '#owner #channel-name a',
      '#channel-name .ytd-channel-name a',
      'ytd-channel-name yt-formatted-string a',
      '#upload-info #channel-name a',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        name = el.textContent.trim();
        url = el.href || '';
        break;
      }
    }

    // Extract handle from URL
    const handleMatch = url.match(/@([^/?\s]+)/);
    if (handleMatch) handle = '@' + handleMatch[1];

    // Fallback: try meta tags
    if (!name) {
      const metaAuthor = document.querySelector('meta[name="author"]');
      if (metaAuthor) name = metaAuthor.content;
    }

    // Fallback: structured data
    if (!name) {
      const ldJson = document.querySelector('script[type="application/ld+json"]');
      if (ldJson) {
        try {
          const data = JSON.parse(ldJson.textContent);
          if (data.author) name = data.author.name || data.author;
        } catch {}
      }
    }

    return { name, url, handle };
  }

  // ---------- Shorts Shelf Hiding ----------
  function hideShortsShelf() {
    // Check settings
    chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }).then(resp => {
      if (!resp || !resp.blockShorts) return;

      // Hide Shorts shelf on home page
      const shortsShelves = document.querySelectorAll('ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]');
      shortsShelves.forEach(el => { el.style.display = 'none'; });

      // Hide Shorts tab in navigation
      const tabs = document.querySelectorAll('ytd-mini-guide-entry-renderer, ytd-guide-entry-renderer');
      tabs.forEach(el => {
        if (el.textContent.includes('Shorts')) {
          el.style.display = 'none';
        }
      });

      // Hide Shorts in sidebar
      const sidebarItems = document.querySelectorAll('ytd-guide-entry-renderer');
      sidebarItems.forEach(el => {
        const title = el.querySelector('#endpoint-title, yt-formatted-string');
        if (title && title.textContent.trim() === 'Shorts') {
          el.style.display = 'none';
        }
      });
    }).catch(() => {});
  }

  // ---------- Overlay ----------
  function showOverlay(reason) {
    if (overlayEl && currentBlockReason === reason) return;
    currentBlockReason = reason;

    removeOverlay();
    pauseVideo();

    const shadow = document.createElement('div');
    shadow.id = 'yt-kids-guard-overlay';
    const root = shadow.attachShadow({ mode: 'closed' });

    const messages = {
      time_up: {
        emoji: getTimeUpEmoji(),
        title: "Time's Up!",
        subtitle: 'You\'ve watched enough YouTube for today.',
        detail: 'Time to go play, read a book, or do something fun! See you tomorrow!',
        color: '#FF6B6B',
      },
      channel_blocked: {
        emoji: '🚫',
        title: 'This Channel Isn\'t Available',
        subtitle: 'Your parents haven\'t approved this channel yet.',
        detail: 'Ask a parent to add this channel to your watch list!',
        color: '#FF9F43',
      },
      shorts_blocked: {
        emoji: '✋',
        title: 'Shorts Are Turned Off',
        subtitle: 'YouTube Shorts aren\'t available right now.',
        detail: 'Try watching a full video from your allowed channels instead!',
        color: '#A78BFA',
      },
    };

    const msg = messages[reason] || messages.channel_blocked;

    root.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #FFF8E7;
          font-family: 'Comic Sans MS', 'Comic Neue', cursive, sans-serif;
        }

        .paper-bg {
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(
              transparent,
              transparent 27px,
              rgba(180, 160, 120, 0.15) 27px,
              rgba(180, 160, 120, 0.15) 28px
            );
          pointer-events: none;
        }

        .margin-line {
          position: absolute;
          left: 60px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: rgba(255, 120, 120, 0.2);
          pointer-events: none;
        }

        .content {
          position: relative;
          text-align: center;
          padding: 40px;
          max-width: 500px;
          animation: bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .doodle-border {
          position: absolute;
          inset: -20px;
          border: 4px solid ${msg.color};
          border-radius: 255px 15px 225px 15px/15px 225px 15px 255px;
          opacity: 0.3;
          pointer-events: none;
        }

        .emoji {
          font-size: 80px;
          display: block;
          margin-bottom: 16px;
          animation: wobble 2s ease-in-out infinite;
          filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));
        }

        h1 {
          font-family: 'Comic Sans MS', 'Comic Neue', cursive, sans-serif;
          font-size: 42px;
          color: ${msg.color};
          margin: 0 0 8px 0;
          text-shadow: 2px 2px 0 rgba(0,0,0,0.05);
          transform: rotate(-1deg);
        }

        .subtitle {
          font-size: 22px;
          color: #6B5B4F;
          margin: 0 0 16px 0;
        }

        .detail {
          font-size: 18px;
          color: #9B8B7F;
          line-height: 1.6;
        }

        .stars {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .star {
          position: absolute;
          font-size: 24px;
          opacity: 0.3;
          animation: twinkle 3s ease-in-out infinite;
        }

        .star:nth-child(1) { top: 10%; left: 15%; animation-delay: 0s; }
        .star:nth-child(2) { top: 20%; right: 20%; animation-delay: 0.5s; }
        .star:nth-child(3) { bottom: 30%; left: 10%; animation-delay: 1s; }
        .star:nth-child(4) { bottom: 15%; right: 15%; animation-delay: 1.5s; }
        .star:nth-child(5) { top: 50%; left: 5%; animation-delay: 2s; }
        .star:nth-child(6) { top: 40%; right: 8%; animation-delay: 0.8s; }

        @keyframes bounceIn {
          0% { transform: scale(0.3) rotate(-5deg); opacity: 0; }
          50% { transform: scale(1.05) rotate(1deg); }
          70% { transform: scale(0.95) rotate(-0.5deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes wobble {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(5deg); }
          75% { transform: rotate(-5deg); }
        }

        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
      </style>

      <div class="overlay">
        <div class="paper-bg"></div>
        <div class="margin-line"></div>
        <div class="stars">
          <span class="star">★</span>
          <span class="star">✦</span>
          <span class="star">★</span>
          <span class="star">✦</span>
          <span class="star">☆</span>
          <span class="star">★</span>
        </div>
        <div class="content">
          <div class="doodle-border"></div>
          <span class="emoji">${msg.emoji}</span>
          <h1>${msg.title}</h1>
          <p class="subtitle">${msg.subtitle}</p>
          <p class="detail">${msg.detail}</p>
        </div>
      </div>
    `;

    document.documentElement.appendChild(shadow);
    overlayEl = shadow;

    // Block interaction
    blockInteraction();
  }

  function getTimeUpEmoji() {
    const emojis = ['⏰', '😴', '🌟', '🎨', '📚', '⚽'];
    return emojis[Math.floor(Math.random() * emojis.length)];
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
      currentBlockReason = null;
      unblockInteraction();
    }
  }

  function pauseVideo() {
    const video = document.querySelector('video');
    if (video) video.pause();
  }

  // ---------- Interaction Blocking ----------
  let blockHandler = null;

  function blockInteraction() {
    blockHandler = (e) => {
      if (overlayEl) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    ['keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchmove'].forEach(evt => {
      document.addEventListener(evt, blockHandler, { capture: true });
    });
  }

  function unblockInteraction() {
    if (blockHandler) {
      ['keydown', 'keyup', 'keypress', 'wheel', 'touchstart', 'touchmove'].forEach(evt => {
        document.removeEventListener(evt, blockHandler, { capture: true });
      });
      blockHandler = null;
    }
  }

  // ---------- Message Listener ----------
  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case 'BLOCK':
        showOverlay(msg.reason);
        break;
      case 'UNBLOCK':
        removeOverlay();
        break;
      case 'SETTINGS_UPDATED':
        checkCurrentPage();
        break;
    }
  });

  // ---------- Start ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
