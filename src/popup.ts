// ============================================================
// YT Kids Guard — Popup Logic (v2)
// ============================================================

import type { FullState, Channel, PasswordResult } from './types';

let state: FullState | null = null;
let isParentAuthenticated = false;
let parentSessionToken = '';
let timerInterval: ReturnType<typeof setInterval> | null = null;

// ---------- Crypto ----------
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'yt-kids-guard-salt-2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sendAuth(msg: object): Promise<unknown> {
  return chrome.runtime.sendMessage({ ...msg, sessionToken: parentSessionToken });
}

// ---------- DOM ----------
const $ = (s: string): HTMLElement => document.querySelector(s)!;
const $$ = (s: string): NodeListOf<HTMLElement> => document.querySelectorAll(s);

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  await refreshState();
  bindEvents();
  startTimerUpdate();
  detectCurrentChannel();
});

window.addEventListener('unload', () => { if (timerInterval) clearInterval(timerInterval); });

// ---------- State ----------
async function refreshState(): Promise<void> {
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' }) as FullState;
    render();
  } catch (e) { console.error('State error:', e); }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_CHANGED') { state = msg.state; render(); }
});

// ---------- Render ----------
function render(): void {
  if (!state) return;

  const remaining = state.remainingSeconds;
  const total = state.settings.dailyLimitMinutes * 60;
  const fraction = total > 0 ? remaining / total : 1;

  // Timer digits
  const timerDisplay = $('#timer-display');
  const timerLabel = $('#timer-label');
  if (remaining <= 0) {
    timerDisplay.textContent = "Time's Up!";
    timerDisplay.classList.add('times-up');
    timerLabel.textContent = 'see you tomorrow';
  } else {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`;
    timerDisplay.classList.remove('times-up');
    timerLabel.textContent = 'minutes left';
  }

  // Ring progress
  const circumference = 2 * Math.PI * 88;
  const offset = circumference * (1 - fraction);
  (document.querySelector('.timer-progress') as SVGElement).style.strokeDashoffset = String(offset);

  // Update gradient colors based on time
  const grad = document.querySelector('#timer-grad')!;
  const statusEl = $('#timer-status');
  statusEl.classList.remove('warning', 'danger');

  if (remaining <= 0) {
    grad.children[0].setAttribute('stop-color', '#C47070');
    grad.children[1].setAttribute('stop-color', '#D09090');
    statusEl.classList.add('danger');
    $('#status-text').textContent = "Time's up! Go play!";
  } else if (remaining < 300) {
    grad.children[0].setAttribute('stop-color', '#C47070');
    grad.children[1].setAttribute('stop-color', '#D09090');
    statusEl.classList.add('danger');
    $('#status-text').textContent = 'Almost done!';
  } else if (remaining < 600) {
    grad.children[0].setAttribute('stop-color', '#C4A870');
    grad.children[1].setAttribute('stop-color', '#D0B880');
    statusEl.classList.add('warning');
    $('#status-text').textContent = 'Running low...';
  } else {
    grad.children[0].setAttribute('stop-color', '#B5A67A');
    grad.children[1].setAttribute('stop-color', '#C8BB96');
    $('#status-text').textContent = 'Watching time active';
  }

  if (isParentAuthenticated) renderParent();
}

function renderParent(): void {
  if (!state) return;
  const s = state.settings;

  // Timer tab
  const limitSlider = $('#daily-limit') as HTMLInputElement;
  limitSlider.value = String(s.dailyLimitMinutes);
  $('#daily-limit-value').textContent = `${s.dailyLimitMinutes} min`;
  updateRangeStyle(limitSlider);

  const usedMins = Math.floor(state.watchData.secondsUsed / 60);
  const remainMins = Math.max(0, s.dailyLimitMinutes - usedMins);
  const usedPct = s.dailyLimitMinutes > 0 ? Math.min(100, (usedMins / s.dailyLimitMinutes) * 100) : 0;
  $('#used-time').textContent = `${usedMins} min used`;
  $('#remaining-time').textContent = `${remainMins} min left`;
  const bar = $('#usage-bar');
  bar.style.width = `${usedPct}%`;
  bar.classList.toggle('danger', usedPct > 85);

  // Settings
  ($('#extension-toggle') as HTMLInputElement).checked = s.extensionEnabled;
  ($('#block-shorts') as HTMLInputElement).checked = s.blockShorts;

  // Mode
  $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === s.filterMode));
  $('#allowed-section').style.display = s.filterMode === 'whitelist' ? 'block' : 'none';
  $('#blocked-section').style.display = s.filterMode === 'blocklist' ? 'block' : 'none';
  const modeDesc = $('#mode-desc');
  if (modeDesc) {
    modeDesc.textContent = s.filterMode === 'whitelist'
      ? 'Only approved channels can be watched'
      : 'Everything allowed except blocked channels';
  }

  // Channel lists
  renderChannelList($('#allowed-channels-list'), s.allowedChannels, 'allowed');
  renderChannelList($('#blocked-channels-list'), s.blockedChannels, 'blocked');
  $('#allowed-count').textContent = String(s.allowedChannels.length);
  $('#blocked-count').textContent = String(s.blockedChannels.length);
}

function renderChannelList(container: HTMLElement, channels: Array<{ name: string; handle?: string }>, type: 'allowed' | 'blocked'): void {
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
    btn.addEventListener('click', async () => {
      const el = btn as HTMLElement;
      const name = el.dataset.name!;
      const msgType = el.dataset.type === 'allowed' ? 'REMOVE_ALLOWED_CHANNEL' : 'UNBLOCK_CHANNEL';
      await sendAuth({ type: msgType, channelName: name });
      toast(`Removed ${name}`);
      await refreshState();
    });
  });
}

function updateRangeStyle(el: HTMLInputElement): void {
  const pct = ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100;
  el.style.setProperty('--pct', pct + '%');
}

// ---------- Channel Detection ----------
async function detectCurrentChannel(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      $('#current-channel-bar').style.display = 'none';
      return;
    }

    if (tab.id != null && state?.currentChannelByTab?.[tab.id]?.name) {
      showChannel(state.currentChannelByTab[tab.id]);
      return;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => {
          for (const sel of [
            'ytd-video-owner-renderer #channel-name a',
            'ytd-video-owner-renderer ytd-channel-name a',
            '#owner #channel-name a',
            'ytd-channel-name yt-formatted-string a',
          ]) {
            const el = document.querySelector(sel) as HTMLAnchorElement | null;
            if (el) return { name: el.textContent?.trim() || '', url: el.href || '' };
          }
          return null;
        },
      });
      if (results?.[0]?.result) showChannel(results[0].result as Channel);
      else $('#current-channel-bar').style.display = 'none';
    } catch { $('#current-channel-bar').style.display = 'none'; }
  } catch { $('#current-channel-bar').style.display = 'none'; }
}

function showChannel(ch: { name: string; url?: string; handle?: string }): void {
  $('#current-channel-bar').style.display = 'flex';
  $('#current-channel-name').textContent = ch.name || 'Unknown';

  if (state?.settings) {
    const s = state.settings;
    const n = (v: string) => (v || '').toLowerCase().trim();
    const isAllowed = s.allowedChannels.some(c => n(c.name) === n(ch.name));
    const isBlocked = s.blockedChannels.some(c => n(c.name) === n(ch.name));

    const badge = $('#channel-badge');
    if (isBlocked) { badge.textContent = 'Blocked'; badge.className = 'channel-badge blocked'; }
    else if (isAllowed || s.filterMode === 'blocklist') { badge.textContent = 'Allowed'; badge.className = 'channel-badge allowed'; }
    else { badge.textContent = 'Not Listed'; badge.className = 'channel-badge blocked'; }
  }

  renderQuickActions(ch as Channel);
}

function renderQuickActions(ch: Channel | null): void {
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
function startTimerUpdate(): void {
  timerInterval = setInterval(async () => {
    try {
      const r = await chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }) as { remainingSeconds: number; isTimeUp: boolean } | undefined;
      if (r && state) {
        state.remainingSeconds = r.remainingSeconds;
        state.isTimeUp = r.isTimeUp;
        render();
      }
    } catch {}
  }, 1000);
}

// ---------- Events ----------
function bindEvents(): void {
  // Parent access
  $('#parent-access-btn').addEventListener('click', () => {
    if (!state || !state.hasPassword) showSetupModal();
    else showPasswordModal();
  });

  // Password modal
  $('#password-cancel').addEventListener('click', hideModals);
  $('#password-submit').addEventListener('click', submitPassword);
  ($('#password-input') as HTMLInputElement).addEventListener('keydown', e => { if (e.key === 'Enter') submitPassword(); });

  // Setup modal
  $('#setup-cancel').addEventListener('click', hideModals);
  $('#setup-submit').addEventListener('click', submitSetup);
  ($('#setup-confirm') as HTMLInputElement).addEventListener('keydown', e => { if (e.key === 'Enter') submitSetup(); });

  // Back
  $('#back-btn').addEventListener('click', () => {
    isParentAuthenticated = false;
    parentSessionToken = '';
    chrome.storage.local.set({ contentAuthUntil: 0 });
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
  const range = $('#daily-limit') as HTMLInputElement;
  range.addEventListener('input', () => {
    $('#daily-limit-value').textContent = `${range.value} min`;
    updateRangeStyle(range);
  });
  range.addEventListener('change', () => {
    sendAuth({ type: 'UPDATE_SETTINGS', dailyLimitMinutes: parseInt(range.value) });
  });

  // Toggle switches
  ($('#extension-toggle') as HTMLInputElement).addEventListener('change', function() {
    sendAuth({ type: 'UPDATE_SETTINGS', extensionEnabled: this.checked });
  });
  ($('#block-shorts') as HTMLInputElement).addEventListener('change', function() {
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

  // Cloud sync
  $('#connect-btn')?.addEventListener('click', async () => {
    const joinCode = ($('#join-code-input') as HTMLInputElement).value.trim().toUpperCase();
    const deviceName = ($('#device-name-input') as HTMLInputElement).value.trim();
    const errEl = $('#sync-error');
    if (!joinCode || joinCode.length !== 6) { errEl.textContent = 'Enter a 6-character code'; errEl.classList.remove('hidden'); return; }
    if (!deviceName) { errEl.textContent = 'Enter a device name'; errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');
    try {
      const r = await sendAuth({ type: 'REGISTER_DEVICE', joinCode, deviceName }) as { success: boolean; familyName?: string; error?: string };
      if (r?.success) {
        toast('Connected to family!');
        renderSyncStatus();
      } else {
        errEl.textContent = r?.error || 'Failed to connect';
        errEl.classList.remove('hidden');
      }
    } catch {
      errEl.textContent = 'Connection failed';
      errEl.classList.remove('hidden');
    }
  });

  renderSyncStatus();

  // Change password
  $('#change-password-btn').addEventListener('click', async () => {
    const pw = ($('#new-password') as HTMLInputElement).value;
    const confirm = ($('#confirm-password') as HTMLInputElement).value;
    const msg = $('#password-msg');

    if (!pw || pw.length < 4) { showMsg(msg, 'Password must be at least 4 characters', 'error'); return; }
    if (pw !== confirm) { showMsg(msg, "Passwords don't match", 'error'); return; }

    const hash = await hashPassword(pw);
    const r = await sendAuth({ type: 'SET_PASSWORD', passwordHash: hash }) as { success: boolean; sessionToken?: string } | undefined;
    if (r?.success) {
      parentSessionToken = r.sessionToken || '';
      showMsg(msg, 'Password updated!', 'success');
    } else {
      showMsg(msg, 'Failed to update', 'error');
    }
    ($('#new-password') as HTMLInputElement).value = '';
    ($('#confirm-password') as HTMLInputElement).value = '';
  });
}

function isYouTubeVideoUrl(s: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(s);
}

function bindAddChannel(inputId: string, btnId: string, msgType: string, verb: string): void {
  const btn = $(`#${btnId}`);
  const input = $(`#${inputId}`) as HTMLInputElement;
  const action = async () => {
    const value = input.value.trim();
    if (!value) return;

    if (isYouTubeVideoUrl(value)) {
      btn.setAttribute('disabled', '');
      btn.textContent = '...';
      try {
        const r = await chrome.runtime.sendMessage({ type: 'RESOLVE_VIDEO_URL', videoUrl: value }) as
          { success: boolean; channel?: { name: string; url: string; handle: string }; error?: string };
        if (r?.success && r.channel) {
          await sendAuth({ type: msgType, channel: r.channel });
          input.value = '';
          toast(`${verb}: ${r.channel.name}`);
          await refreshState();
        } else {
          toast(r?.error || 'Could not resolve channel');
        }
      } catch {
        toast('Failed to resolve video URL');
      }
      btn.removeAttribute('disabled');
      btn.textContent = verb === 'Added' ? 'Add' : 'Block';
    } else {
      const name = value;
      await sendAuth({ type: msgType, channel: { name, url: '', handle: name.startsWith('@') ? name : '' } });
      input.value = '';
      toast(`${verb}: ${name}`);
      await refreshState();
    }
  };
  btn.addEventListener('click', action);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') action(); });
}

// ---------- Password ----------
function showPasswordModal(): void {
  $('#password-modal').classList.remove('hidden');
  $('#password-error').classList.add('hidden');
  ($('#password-input') as HTMLInputElement).value = '';
  setTimeout(() => ($('#password-input') as HTMLInputElement).focus(), 100);
}

function showSetupModal(): void {
  $('#setup-modal').classList.remove('hidden');
  $('#setup-error').classList.add('hidden');
  ($('#setup-password') as HTMLInputElement).value = '';
  ($('#setup-confirm') as HTMLInputElement).value = '';
  setTimeout(() => ($('#setup-password') as HTMLInputElement).focus(), 100);
}

function hideModals(): void {
  $('#password-modal').classList.add('hidden');
  $('#setup-modal').classList.add('hidden');
}

async function submitPassword(): Promise<void> {
  const pw = ($('#password-input') as HTMLInputElement).value;
  if (!pw) return;
  const hash = await hashPassword(pw);
  const r = await chrome.runtime.sendMessage({ type: 'VERIFY_PASSWORD', passwordHash: hash }) as PasswordResult;

  if (r.success) {
    isParentAuthenticated = true;
    parentSessionToken = r.sessionToken || '';
    hideModals();
    switchView('parent');
    await refreshState();
    renderParent();
  } else if (r.locked) {
    $('#password-error').textContent = `Locked for ${r.retryAfter}s. Too many attempts.`;
    $('#password-error').classList.remove('hidden');
    ($('#password-input') as HTMLInputElement).value = '';
  } else {
    $('#password-error').textContent = r.attemptsLeft ? `Wrong password. ${r.attemptsLeft} attempts left.` : 'Wrong password.';
    $('#password-error').classList.remove('hidden');
    ($('#password-input') as HTMLInputElement).value = '';
    ($('#password-input') as HTMLInputElement).focus();
  }
}

async function submitSetup(): Promise<void> {
  const pw = ($('#setup-password') as HTMLInputElement).value;
  const confirm = ($('#setup-confirm') as HTMLInputElement).value;
  if (!pw || pw.length < 4) { $('#setup-error').textContent = 'Min 4 characters'; $('#setup-error').classList.remove('hidden'); return; }
  if (pw !== confirm) { $('#setup-error').textContent = "Passwords don't match"; $('#setup-error').classList.remove('hidden'); return; }

  const hash = await hashPassword(pw);
  const r = await chrome.runtime.sendMessage({ type: 'SET_PASSWORD', passwordHash: hash }) as { success: boolean; sessionToken?: string } | undefined;
  if (r?.success) {
    parentSessionToken = r.sessionToken || '';
    isParentAuthenticated = true;
    hideModals();
    switchView('parent');
    await refreshState();
    renderParent();
    toast('Password set! Welcome.');
  }
}

function switchView(view: 'kids' | 'parent'): void {
  $('#kids-view').classList.toggle('active', view === 'kids');
  $('#kids-view').classList.toggle('hidden', view !== 'kids');
  $('#parent-view').classList.toggle('active', view === 'parent');
  $('#parent-view').classList.toggle('hidden', view !== 'parent');
}

// ---------- Helpers ----------
function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showMsg(el: HTMLElement, text: string, type: 'success' | 'error'): void {
  el.textContent = text;
  el.className = 'modal-error' + (type === 'success' ? ' success' : '');
  el.style.color = type === 'success' ? 'var(--green)' : 'var(--red)';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

async function renderSyncStatus(): Promise<void> {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }) as
      { connected: boolean; familyName?: string; lastSync?: number } | undefined;
    if (r?.connected) {
      $('#sync-disconnected').style.display = 'none';
      $('#sync-connected').style.display = 'block';
      $('#sync-family-name').textContent = r.familyName || 'Family';
      $('#sync-status-text').textContent = r.lastSync
        ? `Last synced ${Math.round((Date.now() - r.lastSync) / 60000)}m ago`
        : 'Connected';
    } else {
      $('#sync-disconnected').style.display = 'block';
      $('#sync-connected').style.display = 'none';
    }
  } catch {}
}

function toast(message: string): void {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
