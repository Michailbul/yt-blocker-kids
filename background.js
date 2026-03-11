// ============================================================
// YT Kids Guard — Background Service Worker
// ============================================================

// ---------- Default Settings ----------
const DEFAULTS = {
  parentPasswordHash: '',       // SHA-256 hash; empty = first-time setup
  dailyLimitMinutes: 60,
  allowedChannels: [],          // [{ name, url, id?, addedAt }]
  blockedChannels: [],          // [{ name, url, id?, blockedAt }]
  blockShorts: true,
  filterMode: 'whitelist',      // 'whitelist' | 'blocklist'
  extensionEnabled: true,
};

// ---------- Runtime State ----------
let settings = { ...DEFAULTS };
let watchData = { date: '', secondsUsed: 0 };
let currentChannelByTab = {};   // tabId → { name, url, handle }
let sessionToken = '';          // Auth token for parent session (in-memory only)
let failedPasswordAttempts = 0;
let lockoutUntil = 0;

// ---------- Init ----------
chrome.runtime.onInstalled.addListener(() => {
  loadSettings();
  loadWatchData();
  chrome.alarms.create('watch-timer', { periodInMinutes: 1 });
  chrome.alarms.create('daily-reset-check', { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings();
  loadWatchData();
  chrome.alarms.create('watch-timer', { periodInMinutes: 1 });
  chrome.alarms.create('daily-reset-check', { periodInMinutes: 5 });
});

// ---------- Storage ----------
async function loadSettings() {
  const data = await chrome.storage.sync.get(null);
  settings = {
    parentPasswordHash: data.parentPasswordHash || DEFAULTS.parentPasswordHash,
    dailyLimitMinutes: data.dailyLimitMinutes ?? DEFAULTS.dailyLimitMinutes,
    allowedChannels: data.allowedChannels || DEFAULTS.allowedChannels,
    blockedChannels: data.blockedChannels || DEFAULTS.blockedChannels,
    blockShorts: data.blockShorts ?? DEFAULTS.blockShorts,
    filterMode: data.filterMode || DEFAULTS.filterMode,
    extensionEnabled: data.extensionEnabled ?? DEFAULTS.extensionEnabled,
  };
}

async function saveSettings() {
  await chrome.storage.sync.set({
    parentPasswordHash: settings.parentPasswordHash,
    dailyLimitMinutes: settings.dailyLimitMinutes,
    allowedChannels: settings.allowedChannels,
    blockedChannels: settings.blockedChannels,
    blockShorts: settings.blockShorts,
    filterMode: settings.filterMode,
    extensionEnabled: settings.extensionEnabled,
  });
}

async function loadWatchData() {
  const data = await chrome.storage.local.get(['watchData']);
  const today = getToday();
  if (data.watchData && data.watchData.date === today) {
    watchData = data.watchData;
  } else {
    watchData = { date: today, secondsUsed: 0 };
    await chrome.storage.local.set({ watchData });
  }
}

async function saveWatchData() {
  await chrome.storage.local.set({ watchData });
}

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Timer Logic ----------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'watch-timer') {
    await handleTimerTick();
  }
  if (alarm.name === 'daily-reset-check') {
    await checkDailyReset();
  }
});

async function handleTimerTick() {
  await loadSettings();
  if (!settings.extensionEnabled) return;

  await loadWatchData();

  // Check if any YouTube tab is active in focused window
  const active = await isYouTubeTabActive();
  if (active) {
    watchData.secondsUsed += 60; // add 1 minute
    await saveWatchData();

    // Check if time is up
    if (isTimeUp()) {
      await blockAllYouTubeTabs();
    }
  }

  // Update badge
  updateBadge();
  broadcastState();
}

async function checkDailyReset() {
  const today = getToday();
  if (watchData.date !== today) {
    watchData = { date: today, secondsUsed: 0 };
    await saveWatchData();
    await unblockAllYouTubeTabs();
    updateBadge();
    broadcastState();
  }
}

function isTimeUp() {
  return watchData.secondsUsed >= settings.dailyLimitMinutes * 60;
}

function getRemainingSeconds() {
  const remaining = (settings.dailyLimitMinutes * 60) - watchData.secondsUsed;
  return Math.max(0, remaining);
}

async function isYouTubeTabActive() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs.length === 0) return false;
    const tab = tabs[0];
    return tab.url && (tab.url.includes('youtube.com') || tab.url.includes('youtu.be'));
  } catch {
    return false;
  }
}

// ---------- Badge ----------
function updateBadge() {
  if (!settings.extensionEnabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#999' });
    return;
  }

  const remaining = getRemainingSeconds();
  if (remaining <= 0) {
    chrome.action.setBadgeText({ text: '0:00' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF6B6B' });
    return;
  }

  const mins = Math.floor(remaining / 60);
  if (mins < 10) {
    chrome.action.setBadgeText({ text: `${mins}m` });
    chrome.action.setBadgeBackgroundColor({ color: '#FF9F43' });
  } else {
    chrome.action.setBadgeText({ text: `${mins}m` });
    chrome.action.setBadgeBackgroundColor({ color: '#7BC67E' });
  }
}

// ---------- Blocking ----------
async function blockAllYouTubeTabs() {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'BLOCK', reason: 'time_up' });
    } catch {
      // Tab might not have content script yet
    }
  }
}

async function unblockAllYouTubeTabs() {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'UNBLOCK' });
    } catch {}
  }
}

// ---------- Channel Management ----------
function isChannelAllowed(channelName, channelUrl, channelHandle) {
  if (!settings.extensionEnabled) return true;
  if (!channelName && !channelUrl && !channelHandle) return true; // Can't determine channel

  const normalize = (s) => (s || '').toLowerCase().trim();

  if (settings.filterMode === 'whitelist') {
    // In whitelist mode, only allowed channels pass
    if (settings.allowedChannels.length === 0) return true; // No channels set = allow all (first-time setup)
    return settings.allowedChannels.some(ch => {
      return normalize(ch.name) === normalize(channelName) ||
             (ch.url && channelUrl && normalize(ch.url) === normalize(channelUrl)) ||
             (ch.handle && channelHandle && normalize(ch.handle) === normalize(channelHandle));
    });
  } else {
    // In blocklist mode, blocked channels are rejected
    return !settings.blockedChannels.some(ch => {
      return normalize(ch.name) === normalize(channelName) ||
             (ch.url && channelUrl && normalize(ch.url) === normalize(channelUrl)) ||
             (ch.handle && channelHandle && normalize(ch.handle) === normalize(channelHandle));
    });
  }
}

function addAllowedChannel(channel) {
  const exists = settings.allowedChannels.some(
    ch => ch.name.toLowerCase() === channel.name.toLowerCase()
  );
  if (!exists) {
    settings.allowedChannels.push({
      name: channel.name,
      url: channel.url || '',
      handle: channel.handle || '',
      addedAt: Date.now(),
    });
    saveSettings();
  }
}

function removeAllowedChannel(channelName) {
  settings.allowedChannels = settings.allowedChannels.filter(
    ch => ch.name.toLowerCase() !== channelName.toLowerCase()
  );
  saveSettings();
}

function addBlockedChannel(channel) {
  const exists = settings.blockedChannels.some(
    ch => ch.name.toLowerCase() === channel.name.toLowerCase()
  );
  if (!exists) {
    settings.blockedChannels.push({
      name: channel.name,
      url: channel.url || '',
      handle: channel.handle || '',
      blockedAt: Date.now(),
    });
    saveSettings();
  }
  // Also remove from allowed if present
  removeAllowedChannel(channel.name);
}

function removeBlockedChannel(channelName) {
  settings.blockedChannels = settings.blockedChannels.filter(
    ch => ch.name.toLowerCase() !== channelName.toLowerCase()
  );
  saveSettings();
}

// ---------- Password ----------
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'yt-kids-guard-salt-2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function verifyPasswordHash(passwordHash) {
  // Brute-force protection
  if (Date.now() < lockoutUntil) {
    return { success: false, locked: true, retryAfter: Math.ceil((lockoutUntil - Date.now()) / 1000) };
  }

  if (passwordHash === settings.parentPasswordHash) {
    failedPasswordAttempts = 0;
    sessionToken = crypto.randomUUID();
    return { success: true, sessionToken };
  }

  failedPasswordAttempts++;
  if (failedPasswordAttempts >= 5) {
    lockoutUntil = Date.now() + 60000; // 1 minute lockout
    failedPasswordAttempts = 0;
    return { success: false, locked: true, retryAfter: 60 };
  }
  return { success: false, attemptsLeft: 5 - failedPasswordAttempts };
}

async function setPasswordHash(passwordHash) {
  if (passwordHash && passwordHash.length === 64) { // SHA-256 hex = 64 chars
    settings.parentPasswordHash = passwordHash;
    await saveSettings();
    sessionToken = crypto.randomUUID();
    return sessionToken;
  }
  return null;
}

function isAuthorized(msg) {
  return msg.sessionToken && msg.sessionToken === sessionToken;
}

// ---------- Broadcast ----------
function broadcastState() {
  const state = getFullState();
  chrome.runtime.sendMessage({ type: 'STATE_CHANGED', state }).catch(() => {});
}

function getFullState() {
  return {
    settings,
    watchData,
    remainingSeconds: getRemainingSeconds(),
    isTimeUp: isTimeUp(),
    currentChannelByTab,
    hasPassword: !!settings.parentPasswordHash,
  };
}

// ---------- Message Router ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true; // async
});

async function handleMessage(msg, sender) {
  await loadSettings();
  await loadWatchData();

  switch (msg.type) {
    case 'GET_STATE':
      return getFullState();

    case 'VERIFY_PASSWORD':
      return verifyPasswordHash(msg.passwordHash);

    case 'SET_PASSWORD': {
      const token = await setPasswordHash(msg.passwordHash);
      return token ? { success: true, sessionToken: token } : { success: false };
    }

    // --- All mutations below require auth ---
    case 'UPDATE_SETTINGS': {
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      if (msg.dailyLimitMinutes !== undefined) settings.dailyLimitMinutes = msg.dailyLimitMinutes;
      if (msg.blockShorts !== undefined) settings.blockShorts = msg.blockShorts;
      if (msg.filterMode !== undefined) settings.filterMode = msg.filterMode;
      if (msg.extensionEnabled !== undefined) settings.extensionEnabled = msg.extensionEnabled;
      await saveSettings();
      updateBadge();
      broadcastState();
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      return { success: true };
    }

    case 'RESET_TIMER':
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      watchData.secondsUsed = 0;
      watchData.date = getToday();
      await saveWatchData();
      await unblockAllYouTubeTabs();
      updateBadge();
      broadcastState();
      return { success: true };

    case 'ADD_TIME': {
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      const addMinutes = msg.minutes || 15;
      watchData.secondsUsed = Math.max(0, watchData.secondsUsed - (addMinutes * 60));
      await saveWatchData();
      if (!isTimeUp()) {
        await unblockAllYouTubeTabs();
      }
      updateBadge();
      broadcastState();
      return { success: true };
    }

    case 'ADD_ALLOWED_CHANNEL':
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      addAllowedChannel(msg.channel);
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      broadcastState();
      return { success: true };

    case 'REMOVE_ALLOWED_CHANNEL':
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      removeAllowedChannel(msg.channelName);
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      broadcastState();
      return { success: true };

    case 'BLOCK_CHANNEL':
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      addBlockedChannel(msg.channel);
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      broadcastState();
      return { success: true };

    case 'UNBLOCK_CHANNEL':
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      removeBlockedChannel(msg.channelName);
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      broadcastState();
      return { success: true };

    case 'BLOCK_CURRENT_CHANNEL': {
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs.length > 0 && currentChannelByTab[tabs[0].id]) {
        const ch = currentChannelByTab[tabs[0].id];
        addBlockedChannel(ch);
        await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
        broadcastState();
        return { success: true, channel: ch };
      }
      return { success: false, error: 'No YouTube channel detected' };
    }

    case 'ALLOW_CURRENT_CHANNEL': {
      if (!isAuthorized(msg)) return { success: false, error: 'unauthorized' };
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs.length > 0 && currentChannelByTab[tabs[0].id]) {
        const ch = currentChannelByTab[tabs[0].id];
        addAllowedChannel(ch);
        await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
        broadcastState();
        return { success: true, channel: ch };
      }
      return { success: false, error: 'No YouTube channel detected' };
    }

    case 'REPORT_CHANNEL': {
      if (sender.tab) {
        currentChannelByTab[sender.tab.id] = msg.channel;
      }
      // Check if this channel is allowed
      const allowed = isChannelAllowed(msg.channel.name, msg.channel.url, msg.channel.handle);
      const timeUp = isTimeUp();
      const isShort = msg.isShort && settings.blockShorts;
      return {
        allowed: allowed && !timeUp && !isShort,
        reason: timeUp ? 'time_up' : (!allowed ? 'channel_blocked' : (isShort ? 'shorts_blocked' : null)),
        remainingSeconds: getRemainingSeconds(),
        settings: {
          blockShorts: settings.blockShorts,
          filterMode: settings.filterMode,
          extensionEnabled: settings.extensionEnabled,
        },
      };
    }

    case 'HEARTBEAT': {
      // Content script heartbeat - track active watching
      if (sender.tab) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs.length > 0 && tabs[0].id === sender.tab.id) {
          // This YouTube tab is the active focused tab
          // We'll let the alarm handle time tracking, but update badge
          updateBadge();
        }
      }
      return { remainingSeconds: getRemainingSeconds(), isTimeUp: isTimeUp() };
    }

    case 'CHECK_STATUS':
      return {
        remainingSeconds: getRemainingSeconds(),
        isTimeUp: isTimeUp(),
        extensionEnabled: settings.extensionEnabled,
        blockShorts: settings.blockShorts,
      };

    default:
      return { error: 'Unknown message type' };
  }
}

// ---------- Tab Cleanup ----------
chrome.tabs.onRemoved.addListener((tabId) => {
  delete currentChannelByTab[tabId];
});

// ---------- Notify Tabs ----------
async function notifyAllYouTubeTabs(message) {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {}
  }
}

// ---------- Initial Load ----------
loadSettings().then(() => {
  loadWatchData().then(() => {
    updateBadge();
  });
});
