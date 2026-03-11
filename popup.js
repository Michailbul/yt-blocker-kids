// ============================================================
// YT Kids Guard — Popup Logic (v2)
// ============================================================

let state = null;
let isParentAuthenticated = false;
let parentSessionToken = '';
let timerInterval = null;

// ---------- Crypto ----------
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'yt-kids-guard-salt-2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sendAuth(msg) {
  return chrome.runtime.sendMessage({ ...msg, sessionToken: parentSessionToken });
}

// ---------- DOM ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  await refreshState();
  bindEvents();
  startTimerUpdate();
  detectCurrentChannel();
});

window.addEventListener('unload', () => { if (timerInterval) clearInterval(timerInterval); });

// ---------- State ----------
async function refreshState() {
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    render();
  } catch (e) { console.error('State error:', e); }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_CHANGED') { state = msg.state; render(); }
});

// ---------- Render ----------
function render() {
  if (!state) return;

  const remaining = state.remainingSeconds;
  const total = state.settings.dailyLimitMinutes * 60;
  const fraction = total > 0 ? remaining / total : 1;

  // Timer digits
  if (remaining <= 0) {
    $('#timer-display').textContent = "Time's Up!";
    $('#timer-display').classList.add('times-up');
    $('#timer-label').textContent = 'see you tomorrow';
  } else {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    $('#timer-display').textContent = `${m}:${String(s).padStart(2, '0')}`;
    $('#timer-display').classList.remove('times-up');
    $('#timer-label').textContent = 'minutes left';
  }

  // Ring progress
  const circumference = 2 * Math.PI * 88; // ~553
  const offset = circumference * (1 - fraction);
  document.querySelector('.timer-progress').style.strokeDashoffset = offset;

  // Update gradient colors based on time
  const grad = document.querySelector('#timer-grad');
  const statusEl = $('#timer-status');
  statusEl.classList.remove('warning', 'danger');

  if (remaining <= 0) {
    grad.children[0].setAttribute('stop-color', '#E25555');
    grad.children[1].setAttribute('stop-color', '#F08080');
    statusEl.classList.add('danger');
    $('#status-text').textContent = "Time's up! Go play!";
  } else if (remaining < 300) {
    grad.children[0].setAttribute('stop-color', '#E25555');
    grad.children[1].setAttribute('stop-color', '#F08080');
    statusEl.classList.add('danger');
    $('#status-text').textContent = 'Almost done!';
  } else if (remaining < 600) {
    grad.children[0].setAttribute('stop-color', '#E8945A');
    grad.children[1].setAttribute('stop-color', '#F0A06A');
    statusEl.classList.add('warning');
    $('#status-text').textContent = 'Running low...';
  } else {
    grad.children[0].setAttribute('stop-color', '#D4723C');
    grad.children[1].setAttribute('stop-color', '#E89460');
    $('#status-text').textContent = 'Watching time active';
  }

  if (isParentAuthenticated) renderParent();
}

function renderParent() {
  if (!state) return;
  const s = state.settings;

  // Timer tab
  $('#daily-limit').value = s.dailyLimitMinutes;
  $('#daily-limit-value').textContent = `${s.dailyLimitMinutes} min`;
  updateRangeStyle($('#daily-limit'));

  const usedMins = Math.floor(state.watchData.secondsUsed / 60);
  const remainMins = Math.max(0, s.dailyLimitMinutes - usedMins);
  const usedPct = s.dailyLimitMinutes > 0 ? Math.min(100, (usedMins / s.dailyLimitMinutes) * 100) : 0;
  $('#used-time').textContent = `${usedMins} min used`;
  $('#remaining-time').textContent = `${remainMins} min left`;
  const bar = $('#usage-bar');
  bar.style.width = `${usedPct}%`;
  bar.classList.toggle('danger', usedPct > 85);

  // Settings
  $('#extension-toggle').checked = s.extensionEnabled;
  $('#block-shorts').checked = s.blockShorts;

  // Mode
  $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === s.filterMode));
  $('#allowed-section').style.display = s.filterMode === 'whitelist' ? 'block' : 'none';
  $('#blocked-section').style.display = s.filterMode === 'blocklist' ? 'block' : 'none';

  // Channel lists
  renderChannelList($('#allowed-channels-list'), s.allowedChannels, 'allowed');
  renderChannelList($('#blocked-channels-list'), s.blockedChannels, 'blocked');
  $('#allowed-count').textContent = s.allowedChannels.length;
  $('#blocked-count').textContent = s.blockedChannels.length;
}

function renderChannelList(container, channels, type) {
  if (channels.length === 0) {
    container.innerHTML = `<p class="muted-text">${type === 'allowed' ? 'No channels added yet' : 'No channels blocked'}</p>`;
    return;
  }
  container.innerHTML = channels.map(ch => `
    <div class="channel-item">
      <div class="channel-item-dot ${type}"></div>
      <span class="channel-item-name">${esc(ch.name)}</span>
      ${ch.handle ? `<span class="channel-item-handle">${esc(ch.handle)}</span>` : ''}
      <button class="channel-remove" data-name="${escAttr(ch.name)}" data-type="${type}">\u00D7</button>
    </div>
  `).join('');

  container.querySelectorAll('.channel-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const msgType = btn.dataset.type === 'allowed' ? 'REMOVE_ALLOWED_CHANNEL' : 'UNBLOCK_CHANNEL';
      sendAuth({ type: msgType, channelName: name });
      toast(`Removed ${name}`);
    });
  });
}

function updateRangeStyle(el) {
  const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty('--pct', pct + '%');
}

// ---------- Channel Detection ----------
async function detectCurrentChannel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      $('#current-channel-bar').style.display = 'none';
      return;
    }

    if (state?.currentChannelByTab?.[tab.id]?.name) {
      showChannel(state.currentChannelByTab[tab.id]);
      return;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          for (const sel of [
            'ytd-video-owner-renderer #channel-name a',
            'ytd-video-owner-renderer ytd-channel-name a',
            '#owner #channel-name a',
            'ytd-channel-name yt-formatted-string a',
          ]) {
            const el = document.querySelector(sel);
            if (el) return { name: el.textContent.trim(), url: el.href || '' };
          }
          return null;
        },
      });
      if (results?.[0]?.result) showChannel(results[0].result);
      else $('#current-channel-bar').style.display = 'none';
    } catch { $('#current-channel-bar').style.display = 'none'; }
  } catch { $('#current-channel-bar').style.display = 'none'; }
}

function showChannel(ch) {
  $('#current-channel-bar').style.display = 'flex';
  $('#current-channel-name').textContent = ch.name || 'Unknown';

  if (state?.settings) {
    const s = state.settings;
    const n = (v) => (v || '').toLowerCase().trim();
    const isAllowed = s.allowedChannels.some(c => n(c.name) === n(ch.name));
    const isBlocked = s.blockedChannels.some(c => n(c.name) === n(ch.name));

    const badge = $('#channel-badge');
    if (isBlocked) { badge.textContent = 'Blocked'; badge.className = 'channel-badge blocked'; }
    else if (isAllowed || s.filterMode === 'blocklist') { badge.textContent = 'Allowed'; badge.className = 'channel-badge allowed'; }
    else { badge.textContent = 'Not Listed'; badge.className = 'channel-badge blocked'; }
  }

  renderQuickActions(ch);
}

function renderQuickActions(ch) {
  const el = $('#quick-channel-info');
  if (!ch?.name) {
    el.innerHTML = '<p class="muted-text">Open a YouTube video to manage channels</p>';
    return;
  }
  el.innerHTML = `
    <div class="quick-channel-row">
      <div class="quick-channel-icon">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6.5 6.5l3.5 2-3.5 2z" fill="currentColor"/></svg>
      </div>
      <span class="quick-channel-name">${esc(ch.name)}</span>
    </div>
    <div class="quick-actions-btns">
      <button class="btn btn-small btn-primary" id="quick-allow-btn">Allow</button>
      <button class="btn btn-small btn-danger" id="quick-block-btn">Block</button>
    </div>
  `;

  $('#quick-allow-btn').addEventListener('click', async () => {
    await sendAuth({ type: 'ADD_ALLOWED_CHANNEL', channel: ch });
    toast(`Allowed: ${ch.name}`);
    await refreshState();
  });
  $('#quick-block-btn').addEventListener('click', async () => {
    await sendAuth({ type: 'BLOCK_CHANNEL', channel: ch });
    toast(`Blocked: ${ch.name}`);
    await refreshState();
  });
}

// ---------- Timer Loop ----------
function startTimerUpdate() {
  timerInterval = setInterval(async () => {
    try {
      const r = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' });
      if (r && state) {
        state.remainingSeconds = r.remainingSeconds;
        state.isTimeUp = r.isTimeUp;
        render();
      }
    } catch {}
  }, 1000);
}

// ---------- Events ----------
function bindEvents() {
  // Parent access
  $('#parent-access-btn').addEventListener('click', () => {
    if (!state || !state.hasPassword) showSetupModal();
    else showPasswordModal();
  });

  // Password modal
  $('#password-cancel').addEventListener('click', hideModals);
  $('#password-submit').addEventListener('click', submitPassword);
  $('#password-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitPassword(); });

  // Setup modal
  $('#setup-cancel').addEventListener('click', hideModals);
  $('#setup-submit').addEventListener('click', submitSetup);
  $('#setup-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') submitSetup(); });

  // Back
  $('#back-btn').addEventListener('click', () => {
    isParentAuthenticated = false;
    parentSessionToken = '';
    // Deactivate parent mode
    chrome.storage.local.set({ parentModeUntil: 0 });
    switchView('kids');
  });

  // Tabs
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $(`#${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Range slider
  const range = $('#daily-limit');
  range.addEventListener('input', () => {
    $('#daily-limit-value').textContent = `${range.value} min`;
    updateRangeStyle(range);
  });
  range.addEventListener('change', () => {
    sendAuth({ type: 'UPDATE_SETTINGS', dailyLimitMinutes: parseInt(range.value) });
  });

  // Toggle switches
  $('#extension-toggle').addEventListener('change', function() {
    sendAuth({ type: 'UPDATE_SETTINGS', extensionEnabled: this.checked });
  });
  $('#block-shorts').addEventListener('change', function() {
    sendAuth({ type: 'UPDATE_SETTINGS', blockShorts: this.checked });
  });

  // Mode buttons
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sendAuth({ type: 'UPDATE_SETTINGS', filterMode: btn.dataset.mode });
    });
  });

  // Timer actions
  $('#reset-timer-btn').addEventListener('click', async () => {
    await sendAuth({ type: 'RESET_TIMER' });
    toast('Timer reset!');
  });
  $('#add-time-btn').addEventListener('click', async () => {
    await sendAuth({ type: 'ADD_TIME', minutes: 15 });
    toast('+15 minutes added!');
  });

  // Add channels
  bindAddChannel('add-allowed-input', 'add-allowed-btn', 'ADD_ALLOWED_CHANNEL', 'Added');
  bindAddChannel('add-blocked-input', 'add-blocked-btn', 'BLOCK_CHANNEL', 'Blocked');

  // Parent mode (browse YouTube to manage channels on thumbnails)
  $('#activate-parent-mode').addEventListener('click', async () => {
    const until = Date.now() + 30 * 60 * 1000; // 30 minutes
    await chrome.storage.local.set({ parentModeUntil: until });
    // Notify all YouTube tabs
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'PARENT_MODE_ACTIVATED' }); } catch {}
    }
    toast('Parent mode active for 30 min. Browse YouTube to manage channels.');
  });

  // Change password
  $('#change-password-btn').addEventListener('click', async () => {
    const pw = $('#new-password').value;
    const confirm = $('#confirm-password').value;
    const msg = $('#password-msg');

    if (!pw || pw.length < 4) { showMsg(msg, 'Password must be at least 4 characters', 'error'); return; }
    if (pw !== confirm) { showMsg(msg, "Passwords don't match", 'error'); return; }

    const hash = await hashPassword(pw);
    const r = await sendAuth({ type: 'SET_PASSWORD', passwordHash: hash });
    if (r?.success) {
      parentSessionToken = r.sessionToken;
      showMsg(msg, 'Password updated!', 'success');
    } else {
      showMsg(msg, 'Failed to update', 'error');
    }
    $('#new-password').value = '';
    $('#confirm-password').value = '';
  });
}

function bindAddChannel(inputId, btnId, msgType, verb) {
  const btn = $(`#${btnId}`);
  const input = $(`#${inputId}`);
  const action = () => {
    const name = input.value.trim();
    if (!name) return;
    sendAuth({ type: msgType, channel: { name, handle: name.startsWith('@') ? name : '' } });
    input.value = '';
    toast(`${verb}: ${name}`);
  };
  btn.addEventListener('click', action);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') action(); });
}

// ---------- Password ----------
function showPasswordModal() {
  $('#password-modal').classList.remove('hidden');
  $('#password-error').classList.add('hidden');
  $('#password-input').value = '';
  setTimeout(() => $('#password-input').focus(), 100);
}

function showSetupModal() {
  $('#setup-modal').classList.remove('hidden');
  $('#setup-error').classList.add('hidden');
  $('#setup-password').value = '';
  $('#setup-confirm').value = '';
  setTimeout(() => $('#setup-password').focus(), 100);
}

function hideModals() {
  $('#password-modal').classList.add('hidden');
  $('#setup-modal').classList.add('hidden');
}

async function submitPassword() {
  const pw = $('#password-input').value;
  if (!pw) return;
  const hash = await hashPassword(pw);
  const r = await chrome.runtime.sendMessage({ type: 'VERIFY_PASSWORD', passwordHash: hash });

  if (r.success) {
    isParentAuthenticated = true;
    parentSessionToken = r.sessionToken;
    hideModals();
    switchView('parent');
    await refreshState();
    renderParent();
  } else if (r.locked) {
    $('#password-error').textContent = `Locked for ${r.retryAfter}s. Too many attempts.`;
    $('#password-error').classList.remove('hidden');
    $('#password-input').value = '';
  } else {
    $('#password-error').textContent = r.attemptsLeft ? `Wrong password. ${r.attemptsLeft} attempts left.` : 'Wrong password.';
    $('#password-error').classList.remove('hidden');
    $('#password-input').value = '';
    $('#password-input').focus();
  }
}

async function submitSetup() {
  const pw = $('#setup-password').value;
  const confirm = $('#setup-confirm').value;
  if (!pw || pw.length < 4) { $('#setup-error').textContent = 'Min 4 characters'; $('#setup-error').classList.remove('hidden'); return; }
  if (pw !== confirm) { $('#setup-error').textContent = "Passwords don't match"; $('#setup-error').classList.remove('hidden'); return; }

  const hash = await hashPassword(pw);
  const r = await chrome.runtime.sendMessage({ type: 'SET_PASSWORD', passwordHash: hash });
  if (r?.success) {
    parentSessionToken = r.sessionToken;
    isParentAuthenticated = true;
    hideModals();
    switchView('parent');
    await refreshState();
    renderParent();
    toast('Password set! Welcome.');
  }
}

function switchView(view) {
  $('#kids-view').classList.toggle('active', view === 'kids');
  $('#kids-view').classList.toggle('hidden', view !== 'kids');
  $('#parent-view').classList.toggle('active', view === 'parent');
  $('#parent-view').classList.toggle('hidden', view !== 'parent');
}

// ---------- Helpers ----------
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) { return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = 'modal-error' + (type === 'success' ? ' success' : '');
  el.style.color = type === 'success' ? 'var(--green)' : 'var(--red)';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function toast(message) {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
