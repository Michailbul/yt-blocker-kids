// ============================================================
// YT Kids Guard — Popup Logic
// ============================================================

// ---------- State ----------
let state = null;
let isParentAuthenticated = false;
let parentSessionToken = '';
let timerInterval = null;

// ---------- Crypto (same as background) ----------
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'yt-kids-guard-salt-2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Authenticated message sender
function sendAuth(msg) {
  return chrome.runtime.sendMessage({ ...msg, sessionToken: parentSessionToken });
}

// ---------- DOM Refs ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Views
const kidsView = $('#kids-view');
const parentView = $('#parent-view');
const passwordModal = $('#password-modal');
const setupModal = $('#setup-modal');

// Kids elements
const timerDisplay = $('#timer-display');
const timerLabel = $('#timer-label');
const timerProgress = document.querySelector('.timer-progress');
const timerStatus = $('#timer-status');
const statusText = $('#status-text');
const currentChannelBar = $('#current-channel-bar');
const currentChannelName = $('#current-channel-name');
const channelBadge = $('#channel-badge');

// Parent elements
const dailyLimitSlider = $('#daily-limit');
const dailyLimitValue = $('#daily-limit-value');
const usedTime = $('#used-time');
const remainingTime = $('#remaining-time');
const extensionToggle = $('#extension-toggle');
const blockShortsCheckbox = $('#block-shorts');
const modeWhitelist = $('#mode-whitelist');
const modeBlocklist = $('#mode-blocklist');
const allowedChannelsList = $('#allowed-channels-list');
const blockedChannelsList = $('#blocked-channels-list');
const allowedCount = $('#allowed-count');
const blockedCount = $('#blocked-count');
const quickChannelInfo = $('#quick-channel-info');

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  await refreshState();
  bindEvents();
  startTimerUpdate();
  detectCurrentChannel();
});

// Cleanup on popup close
window.addEventListener('unload', () => {
  if (timerInterval) clearInterval(timerInterval);
});

// ---------- State Management ----------
async function refreshState() {
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    render();
  } catch (e) {
    console.error('Failed to get state:', e);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_CHANGED') {
    state = msg.state;
    render();
  }
});

// ---------- Render ----------
function render() {
  if (!state) return;

  // Timer display
  const remaining = state.remainingSeconds;
  const total = state.settings.dailyLimitMinutes * 60;
  const fraction = total > 0 ? remaining / total : 1;

  // Update timer digits
  if (remaining <= 0) {
    timerDisplay.textContent = "Time's Up!";
    timerDisplay.classList.add('times-up');
    timerLabel.textContent = 'See you tomorrow!';
  } else {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    timerDisplay.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    timerDisplay.classList.remove('times-up');
    timerLabel.textContent = 'minutes left!';
  }

  // Update ring progress
  const circumference = 2 * Math.PI * 78; // ~490
  const offset = circumference * (1 - fraction);
  timerProgress.style.strokeDashoffset = offset;

  // Color based on time remaining
  timerProgress.classList.remove('warning', 'danger');
  timerStatus.classList.remove('warning', 'danger');

  if (remaining <= 0) {
    timerProgress.classList.add('danger');
    timerStatus.classList.add('danger');
    $('.status-emoji').textContent = '\u23F0';
    statusText.textContent = "Time's up! Go play!";
  } else if (remaining < 300) { // < 5 min
    timerProgress.classList.add('danger');
    timerStatus.classList.add('danger');
    $('.status-emoji').textContent = '\u26A0\uFE0F';
    statusText.textContent = 'Almost done!';
  } else if (remaining < 600) { // < 10 min
    timerProgress.classList.add('warning');
    timerStatus.classList.add('warning');
    $('.status-emoji').textContent = '\u23F3';
    statusText.textContent = 'Watch wisely!';
  } else {
    $('.status-emoji').textContent = '\uD83C\uDFAC';
    statusText.textContent = 'Happy watching!';
  }

  // Parent dashboard
  if (isParentAuthenticated) {
    renderParentDashboard();
  }
}

function renderParentDashboard() {
  if (!state) return;

  const s = state.settings;
  dailyLimitSlider.value = s.dailyLimitMinutes;
  dailyLimitValue.textContent = `${s.dailyLimitMinutes} min`;

  const usedMins = Math.floor(state.watchData.secondsUsed / 60);
  const remainMins = Math.max(0, s.dailyLimitMinutes - usedMins);
  usedTime.textContent = `Used: ${usedMins} min`;
  remainingTime.textContent = `Left: ${remainMins} min`;

  extensionToggle.checked = s.extensionEnabled;
  blockShortsCheckbox.checked = s.blockShorts;

  if (s.filterMode === 'whitelist') {
    modeWhitelist.checked = true;
  } else {
    modeBlocklist.checked = true;
  }

  // Show/hide sections based on mode
  $('#allowed-section').style.display = s.filterMode === 'whitelist' ? 'block' : 'none';
  $('#blocked-section').style.display = s.filterMode === 'blocklist' ? 'block' : 'none';

  // Render channel lists
  renderChannelList(allowedChannelsList, s.allowedChannels, 'allowed');
  renderChannelList(blockedChannelsList, s.blockedChannels, 'blocked');

  allowedCount.textContent = s.allowedChannels.length;
  blockedCount.textContent = s.blockedChannels.length;
}

function renderChannelList(container, channels, type) {
  if (channels.length === 0) {
    container.innerHTML = `<p class="empty-list">${
      type === 'allowed'
        ? 'No channels added yet. Add channels your kids can watch!'
        : 'No channels blocked.'
    }</p>`;
    return;
  }

  container.innerHTML = channels.map(ch => `
    <div class="channel-item">
      <span class="channel-item-name">${escapeHtml(ch.name)}</span>
      ${ch.handle ? `<span class="channel-item-handle">${escapeHtml(ch.handle)}</span>` : ''}
      <button class="channel-remove-btn" data-name="${escapeAttr(ch.name)}" data-type="${type}" title="Remove">\u00D7</button>
    </div>
  `).join('');

  // Bind remove buttons
  container.querySelectorAll('.channel-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const msgType = btn.dataset.type === 'allowed' ? 'REMOVE_ALLOWED_CHANNEL' : 'UNBLOCK_CHANNEL';
      sendAuth({ type: msgType, channelName: name });
      toast(`Removed ${name}`);
    });
  });
}

// ---------- Current Channel Detection ----------
async function detectCurrentChannel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      currentChannelBar.style.display = 'none';
      return;
    }

    // Get current channel from background
    if (state && state.currentChannelByTab && state.currentChannelByTab[tab.id]) {
      const ch = state.currentChannelByTab[tab.id];
      if (ch.name) {
        showCurrentChannel(ch);
        return;
      }
    }

    // Try to extract from the tab via scripting
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selectors = [
            'ytd-video-owner-renderer #channel-name a',
            'ytd-video-owner-renderer ytd-channel-name a',
            '#owner #channel-name a',
            'ytd-channel-name yt-formatted-string a',
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              return { name: el.textContent.trim(), url: el.href || '' };
            }
          }
          return null;
        },
      });

      if (results && results[0] && results[0].result) {
        showCurrentChannel(results[0].result);
      } else {
        currentChannelBar.style.display = 'none';
      }
    } catch {
      currentChannelBar.style.display = 'none';
    }
  } catch {
    currentChannelBar.style.display = 'none';
  }
}

function showCurrentChannel(ch) {
  currentChannelBar.style.display = 'flex';
  currentChannelName.textContent = ch.name || 'Unknown';

  // Check if allowed/blocked
  if (state && state.settings) {
    const s = state.settings;
    const norm = (str) => (str || '').toLowerCase().trim();
    const isAllowed = s.allowedChannels.some(c => norm(c.name) === norm(ch.name));
    const isBlocked = s.blockedChannels.some(c => norm(c.name) === norm(ch.name));

    if (isBlocked) {
      channelBadge.textContent = 'Blocked';
      channelBadge.className = 'channel-badge blocked';
    } else if (isAllowed || s.filterMode === 'blocklist') {
      channelBadge.textContent = 'Allowed';
      channelBadge.className = 'channel-badge allowed';
    } else {
      channelBadge.textContent = 'Not Listed';
      channelBadge.className = 'channel-badge blocked';
    }
  }

  // Also update quick actions in parent view
  renderQuickActions(ch);
}

function renderQuickActions(ch) {
  if (!ch || !ch.name) {
    quickChannelInfo.innerHTML = `<p class="no-channel">Open a YouTube video to see channel actions here</p>`;
    return;
  }

  quickChannelInfo.innerHTML = `
    <div class="quick-channel-row">
      <span style="font-size:20px">\uD83D\uDCFA</span>
      <span class="quick-channel-name">${escapeHtml(ch.name)}</span>
    </div>
    <div class="quick-channel-actions">
      <button class="btn-block-channel" id="quick-block-btn">\uD83D\uDEAB Block Channel</button>
      <button class="btn-allow-channel" id="quick-allow-btn">\u2705 Allow Channel</button>
    </div>
  `;

  $('#quick-block-btn').addEventListener('click', async () => {
    await sendAuth({ type: 'BLOCK_CHANNEL', channel: ch });
    toast(`Blocked: ${ch.name}`);
    await refreshState();
  });

  $('#quick-allow-btn').addEventListener('click', async () => {
    await sendAuth({ type: 'ADD_ALLOWED_CHANNEL', channel: ch });
    toast(`Allowed: ${ch.name}`);
    await refreshState();
  });
}

// ---------- Timer Update Loop ----------
function startTimerUpdate() {
  timerInterval = setInterval(async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
      if (resp) {
        if (state) {
          state.remainingSeconds = resp.remainingSeconds;
          state.isTimeUp = resp.isTimeUp;
        }
        render();
      }
    } catch {
      // Extension context may be invalidated
    }
  }, 1000);
}

// ---------- Event Bindings ----------
function bindEvents() {
  // Parent access
  $('#parent-access-btn').addEventListener('click', () => {
    if (!state || !state.hasPassword) {
      showSetupModal();
    } else {
      showPasswordModal();
    }
  });

  // Password modal
  $('#password-cancel').addEventListener('click', hideModals);
  $('#password-submit').addEventListener('click', submitPassword);
  $('#password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPassword();
  });

  // Setup modal
  $('#setup-cancel').addEventListener('click', hideModals);
  $('#setup-submit').addEventListener('click', submitSetup);
  $('#setup-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitSetup();
  });

  // Back button
  $('#back-btn').addEventListener('click', () => {
    isParentAuthenticated = false;
    parentSessionToken = '';
    parentView.classList.add('hidden');
    parentView.classList.remove('active');
    kidsView.classList.remove('hidden');
    kidsView.classList.add('active');
  });

  // Settings changes (all use authenticated messages)
  dailyLimitSlider.addEventListener('input', () => {
    dailyLimitValue.textContent = `${dailyLimitSlider.value} min`;
  });
  dailyLimitSlider.addEventListener('change', () => {
    sendAuth({
      type: 'UPDATE_SETTINGS',
      dailyLimitMinutes: parseInt(dailyLimitSlider.value),
    });
  });

  extensionToggle.addEventListener('change', () => {
    sendAuth({
      type: 'UPDATE_SETTINGS',
      extensionEnabled: extensionToggle.checked,
    });
  });

  blockShortsCheckbox.addEventListener('change', () => {
    sendAuth({
      type: 'UPDATE_SETTINGS',
      blockShorts: blockShortsCheckbox.checked,
    });
  });

  // Filter mode
  modeWhitelist.addEventListener('change', () => {
    if (modeWhitelist.checked) {
      sendAuth({ type: 'UPDATE_SETTINGS', filterMode: 'whitelist' });
    }
  });
  modeBlocklist.addEventListener('change', () => {
    if (modeBlocklist.checked) {
      sendAuth({ type: 'UPDATE_SETTINGS', filterMode: 'blocklist' });
    }
  });

  // Reset timer
  $('#reset-timer-btn').addEventListener('click', async () => {
    await sendAuth({ type: 'RESET_TIMER' });
    toast('Timer reset!');
  });

  // Add time
  $('#add-time-btn').addEventListener('click', async () => {
    await sendAuth({ type: 'ADD_TIME', minutes: 15 });
    toast('+15 minutes added!');
  });

  // Add allowed channel
  $('#add-allowed-btn').addEventListener('click', () => {
    const input = $('#add-allowed-input');
    const name = input.value.trim();
    if (!name) return;
    sendAuth({
      type: 'ADD_ALLOWED_CHANNEL',
      channel: { name, handle: name.startsWith('@') ? name : '' },
    });
    input.value = '';
    toast(`Added: ${name}`);
  });
  $('#add-allowed-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#add-allowed-btn').click();
  });

  // Add blocked channel
  $('#add-blocked-btn').addEventListener('click', () => {
    const input = $('#add-blocked-input');
    const name = input.value.trim();
    if (!name) return;
    sendAuth({
      type: 'BLOCK_CHANNEL',
      channel: { name, handle: name.startsWith('@') ? name : '' },
    });
    input.value = '';
    toast(`Blocked: ${name}`);
  });
  $('#add-blocked-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#add-blocked-btn').click();
  });

  // Change password
  $('#change-password-btn').addEventListener('click', async () => {
    const newPw = $('#new-password').value;
    const confirmPw = $('#confirm-password').value;
    const msg = $('#password-msg');

    if (!newPw || newPw.length < 4) {
      msg.textContent = 'Password must be at least 4 characters';
      msg.className = 'password-msg error';
      msg.classList.remove('hidden');
      return;
    }
    if (newPw !== confirmPw) {
      msg.textContent = 'Passwords don\'t match!';
      msg.className = 'password-msg error';
      msg.classList.remove('hidden');
      return;
    }

    const passwordHash = await hashPassword(newPw);
    const resp = await sendAuth({ type: 'SET_PASSWORD', passwordHash });
    if (resp && resp.success) {
      parentSessionToken = resp.sessionToken;
      msg.textContent = 'Password updated!';
      msg.className = 'password-msg success';
    } else {
      msg.textContent = 'Failed to update password';
      msg.className = 'password-msg error';
    }
    msg.classList.remove('hidden');
    $('#new-password').value = '';
    $('#confirm-password').value = '';
    setTimeout(() => msg.classList.add('hidden'), 2000);
  });
}

// ---------- Password Handling ----------
function showPasswordModal() {
  passwordModal.classList.remove('hidden');
  $('#password-error').classList.add('hidden');
  $('#password-input').value = '';
  setTimeout(() => $('#password-input').focus(), 100);
}

function showSetupModal() {
  setupModal.classList.remove('hidden');
  $('#setup-error').classList.add('hidden');
  $('#setup-password').value = '';
  $('#setup-confirm').value = '';
  setTimeout(() => $('#setup-password').focus(), 100);
}

function hideModals() {
  passwordModal.classList.add('hidden');
  setupModal.classList.add('hidden');
}

async function submitPassword() {
  const password = $('#password-input').value;
  if (!password) return;

  const passwordHash = await hashPassword(password);
  const resp = await chrome.runtime.sendMessage({ type: 'VERIFY_PASSWORD', passwordHash });

  if (resp.success) {
    isParentAuthenticated = true;
    parentSessionToken = resp.sessionToken;
    hideModals();
    kidsView.classList.add('hidden');
    kidsView.classList.remove('active');
    parentView.classList.remove('hidden');
    parentView.classList.add('active');
    await refreshState();
    renderParentDashboard();
  } else if (resp.locked) {
    const errEl = $('#password-error');
    errEl.textContent = `Too many attempts. Locked for ${resp.retryAfter}s.`;
    errEl.classList.remove('hidden');
    $('#password-input').value = '';
  } else {
    const errEl = $('#password-error');
    errEl.textContent = resp.attemptsLeft
      ? `Wrong password! ${resp.attemptsLeft} attempts left.`
      : 'Wrong password! Try again.';
    errEl.classList.remove('hidden');
    $('#password-input').value = '';
    $('#password-input').focus();
  }
}

async function submitSetup() {
  const pw = $('#setup-password').value;
  const confirm = $('#setup-confirm').value;

  if (!pw || pw.length < 4) {
    $('#setup-error').textContent = 'Password must be at least 4 characters';
    $('#setup-error').classList.remove('hidden');
    return;
  }
  if (pw !== confirm) {
    $('#setup-error').textContent = "Passwords don't match!";
    $('#setup-error').classList.remove('hidden');
    return;
  }

  const passwordHash = await hashPassword(pw);
  const resp = await chrome.runtime.sendMessage({ type: 'SET_PASSWORD', passwordHash });

  if (resp && resp.success) {
    parentSessionToken = resp.sessionToken;
    hideModals();
    isParentAuthenticated = true;
    kidsView.classList.add('hidden');
    kidsView.classList.remove('active');
    parentView.classList.remove('hidden');
    parentView.classList.add('active');
    await refreshState();
    renderParentDashboard();
    toast('Password set! Welcome to the parent dashboard.');
  }
}

// ---------- Helpers ----------
function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('show');
  });

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2000);
}
