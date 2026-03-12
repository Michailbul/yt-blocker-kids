// ============================================================
// YT Kids Guard — Background Service Worker
// ============================================================

import type {
  Settings,
  WatchData,
  Channel,
  FullState,
  PasswordResult,
  ReportChannelResponse,
  CheckStatusResponse,
  HeartbeatResponse,
  FilterMode,
} from './types';

// ---------- Default Settings ----------
const DEFAULTS: Settings = {
  parentPasswordHash: '',
  dailyLimitMinutes: 60,
  allowedChannels: [],
  blockedChannels: [],
  blockShorts: true,
  filterMode: 'whitelist',
  extensionEnabled: true,
};

// ---------- Runtime State ----------
let settings: Settings = { ...DEFAULTS };
let watchData: WatchData = { date: '', secondsUsed: 0 };
let currentChannelByTab: Record<number, Channel> = {};
let sessionToken = '';
let failedPasswordAttempts = 0;
let lockoutUntil = 0;

// ---------- Init ----------
chrome.runtime.onInstalled.addListener(() => {
  loadSettings();
  loadWatchData();
  chrome.alarms.create('watch-timer', { periodInMinutes: 1 });
  chrome.alarms.create('daily-reset-check', { periodInMinutes: 5 });
  chrome.alarms.create('convex-sync', { periodInMinutes: 2 });
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings();
  loadWatchData();
  chrome.alarms.create('watch-timer', { periodInMinutes: 1 });
  chrome.alarms.create('daily-reset-check', { periodInMinutes: 5 });
  chrome.alarms.create('convex-sync', { periodInMinutes: 2 });
});

// ---------- Storage ----------
async function loadSettings(): Promise<void> {
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

async function saveSettings(): Promise<void> {
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

async function loadWatchData(): Promise<void> {
  const data = await chrome.storage.local.get(['watchData']);
  const today = getToday();
  if (data.watchData && data.watchData.date === today) {
    watchData = data.watchData;
  } else {
    watchData = { date: today, secondsUsed: 0 };
    await chrome.storage.local.set({ watchData });
  }
}

async function saveWatchData(): Promise<void> {
  await chrome.storage.local.set({ watchData });
}

function getToday(): string {
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
  if (alarm.name === 'convex-sync') {
    try {
      const { pullFromConvex, pushToConvex } = await import('./convex-sync');
      await pullFromConvex();
      await pushToConvex(watchData);
    } catch {}
  }
});

async function handleTimerTick(): Promise<void> {
  await loadSettings();
  if (!settings.extensionEnabled) return;

  await loadWatchData();

  const active = await isYouTubeTabActive();
  if (active) {
    watchData.secondsUsed += 60;
    await saveWatchData();

    if (isTimeUp()) {
      await blockAllYouTubeTabs();
    }
  }

  updateBadge();
  broadcastState();
}

async function checkDailyReset(): Promise<void> {
  const today = getToday();
  if (watchData.date !== today) {
    watchData = { date: today, secondsUsed: 0 };
    await saveWatchData();
    await unblockAllYouTubeTabs();
    updateBadge();
    broadcastState();
  }
}

function isTimeUp(): boolean {
  return watchData.secondsUsed >= settings.dailyLimitMinutes * 60;
}

function getRemainingSeconds(): number {
  const remaining = (settings.dailyLimitMinutes * 60) - watchData.secondsUsed;
  return Math.max(0, remaining);
}

async function isYouTubeTabActive(): Promise<boolean> {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs.length === 0) return false;
    const tab = tabs[0];
    return !!(tab.url && (tab.url.includes('youtube.com') || tab.url.includes('youtu.be')));
  } catch {
    return false;
  }
}

// ---------- Badge ----------
function updateBadge(): void {
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
async function blockAllYouTubeTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    try {
      if (tab.id != null) {
        await chrome.tabs.sendMessage(tab.id, { type: 'BLOCK', reason: 'time_up' });
      }
    } catch {
      // Tab might not have content script yet
    }
  }
}

async function unblockAllYouTubeTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    try {
      if (tab.id != null) {
        await chrome.tabs.sendMessage(tab.id, { type: 'UNBLOCK' });
      }
    } catch {}
  }
}

// ---------- Channel Management ----------
function normalize(s: string): string {
  return (s || '').toLowerCase().trim();
}

function isChannelAllowed(channelName: string, channelUrl: string, channelHandle: string): boolean {
  if (!settings.extensionEnabled) return true;
  if (!channelName && !channelUrl && !channelHandle) return true;

  if (settings.filterMode === 'whitelist') {
    if (settings.allowedChannels.length === 0) return true;
    return settings.allowedChannels.some(ch =>
      normalize(ch.name) === normalize(channelName) ||
      (ch.url && channelUrl && normalize(ch.url) === normalize(channelUrl)) ||
      (ch.handle && channelHandle && normalize(ch.handle) === normalize(channelHandle))
    );
  } else {
    return !settings.blockedChannels.some(ch =>
      normalize(ch.name) === normalize(channelName) ||
      (ch.url && channelUrl && normalize(ch.url) === normalize(channelUrl)) ||
      (ch.handle && channelHandle && normalize(ch.handle) === normalize(channelHandle))
    );
  }
}

function addAllowedChannel(channel: Channel): void {
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

function removeAllowedChannel(channelName: string): void {
  settings.allowedChannels = settings.allowedChannels.filter(
    ch => ch.name.toLowerCase() !== channelName.toLowerCase()
  );
  saveSettings();
}

function addBlockedChannel(channel: Channel): void {
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
  removeAllowedChannel(channel.name);
}

function removeBlockedChannel(channelName: string): void {
  settings.blockedChannels = settings.blockedChannels.filter(
    ch => ch.name.toLowerCase() !== channelName.toLowerCase()
  );
  saveSettings();
}

// ---------- Password ----------
function verifyPasswordHash(passwordHash: string): PasswordResult {
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
    lockoutUntil = Date.now() + 60000;
    failedPasswordAttempts = 0;
    return { success: false, locked: true, retryAfter: 60 };
  }
  return { success: false, attemptsLeft: 5 - failedPasswordAttempts };
}

async function setPasswordHash(passwordHash: string): Promise<string | null> {
  if (passwordHash && passwordHash.length === 64) {
    settings.parentPasswordHash = passwordHash;
    await saveSettings();
    sessionToken = crypto.randomUUID();
    return sessionToken;
  }
  return null;
}

async function isAuthorized(msg: { sessionToken?: string }): Promise<boolean> {
  if (msg.sessionToken && msg.sessionToken === sessionToken) return true;
  const data = await chrome.storage.local.get(['contentAuthUntil']);
  if (data.contentAuthUntil && Date.now() < data.contentAuthUntil) return true;
  return false;
}

// ---------- Broadcast ----------
function broadcastState(): void {
  const state = getFullState();
  chrome.runtime.sendMessage({ type: 'STATE_CHANGED', state }).catch(() => {});
}

function getFullState(): FullState {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMessage(msg: any, sender: chrome.runtime.MessageSender): Promise<any> {
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
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      if (msg.dailyLimitMinutes !== undefined) settings.dailyLimitMinutes = msg.dailyLimitMinutes;
      if (msg.blockShorts !== undefined) settings.blockShorts = msg.blockShorts;
      if (msg.filterMode !== undefined) settings.filterMode = msg.filterMode as FilterMode;
      if (msg.extensionEnabled !== undefined) settings.extensionEnabled = msg.extensionEnabled;
      await saveSettings();
      updateBadge();
      broadcastState();
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      return { success: true };
    }

    case 'RESET_TIMER':
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      watchData.secondsUsed = 0;
      watchData.date = getToday();
      await saveWatchData();
      await unblockAllYouTubeTabs();
      updateBadge();
      broadcastState();
      return { success: true };

    case 'ADD_TIME': {
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      const addMinutes: number = msg.minutes || 15;
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
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      addAllowedChannel(msg.channel);
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      broadcastState();
      return { success: true };

    case 'REMOVE_ALLOWED_CHANNEL':
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      removeAllowedChannel(msg.channelName);
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      broadcastState();
      return { success: true };

    case 'BLOCK_CHANNEL':
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      addBlockedChannel(msg.channel);
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      broadcastState();
      return { success: true };

    case 'UNBLOCK_CHANNEL':
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      removeBlockedChannel(msg.channelName);
      await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
      broadcastState();
      return { success: true };

    case 'BLOCK_CURRENT_CHANNEL': {
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs.length > 0 && tabs[0].id != null && currentChannelByTab[tabs[0].id]) {
        const ch = currentChannelByTab[tabs[0].id];
        addBlockedChannel(ch);
        await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
        broadcastState();
        return { success: true, channel: ch };
      }
      return { success: false, error: 'No YouTube channel detected' };
    }

    case 'ALLOW_CURRENT_CHANNEL': {
      if (!(await isAuthorized(msg))) return { success: false, error: 'unauthorized' };
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs.length > 0 && tabs[0].id != null && currentChannelByTab[tabs[0].id]) {
        const ch = currentChannelByTab[tabs[0].id];
        addAllowedChannel(ch);
        await notifyAllYouTubeTabs({ type: 'SETTINGS_UPDATED', settings });
        broadcastState();
        return { success: true, channel: ch };
      }
      return { success: false, error: 'No YouTube channel detected' };
    }

    case 'REPORT_CHANNEL': {
      if (sender.tab?.id != null) {
        currentChannelByTab[sender.tab.id] = msg.channel;
      }
      const timeUp = isTimeUp();
      const isShort = msg.isShort && settings.blockShorts;

      // Only check channel filtering on watch pages — browse pages (home, search, etc.)
      // pick up random channel names from thumbnails and would false-positive block.
      const channelAllowed = msg.isWatchPage
        ? isChannelAllowed(msg.channel.name, msg.channel.url, msg.channel.handle)
        : true;

      const allowed = channelAllowed && !timeUp && !isShort;
      return {
        allowed,
        reason: timeUp ? 'time_up' : (!channelAllowed ? 'channel_blocked' : (isShort ? 'shorts_blocked' : null)),
        remainingSeconds: getRemainingSeconds(),
        settings: {
          blockShorts: settings.blockShorts,
          filterMode: settings.filterMode,
          extensionEnabled: settings.extensionEnabled,
        },
      } satisfies ReportChannelResponse;
    }

    case 'HEARTBEAT': {
      if (sender.tab?.id != null) {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs.length > 0 && tabs[0].id === sender.tab.id) {
          updateBadge();
        }
      }
      return { remainingSeconds: getRemainingSeconds(), isTimeUp: isTimeUp() } satisfies HeartbeatResponse;
    }

    case 'CHECK_STATUS':
      return {
        remainingSeconds: getRemainingSeconds(),
        isTimeUp: isTimeUp(),
        extensionEnabled: settings.extensionEnabled,
        blockShorts: settings.blockShorts,
      } satisfies CheckStatusResponse;

    case 'RESOLVE_VIDEO_URL': {
      const videoUrl = msg.videoUrl as string;
      if (!videoUrl) return { success: false, error: 'No URL provided' };
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
        const resp = await fetch(oembedUrl);
        if (!resp.ok) return { success: false, error: 'Video not found' };
        const data = await resp.json();
        const authorUrl: string = data.author_url || '';
        const handleMatch = authorUrl.match(/@([^/?\s]+)/);
        return {
          success: true,
          channel: {
            name: data.author_name || '',
            url: authorUrl,
            handle: handleMatch ? '@' + handleMatch[1] : '',
          },
        };
      } catch {
        return { success: false, error: 'Failed to fetch video info' };
      }
    }

    case 'REGISTER_DEVICE': {
      try {
        const { registerDevice } = await import('./convex-sync');
        const result = await registerDevice(msg.joinCode, msg.deviceName);
        return result;
      } catch (e) {
        return { success: false, error: 'Sync not available' };
      }
    }

    case 'GET_SYNC_STATUS': {
      try {
        const { getSyncStatus } = await import('./convex-sync');
        return await getSyncStatus();
      } catch {
        return { connected: false };
      }
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ---------- Tab Cleanup ----------
chrome.tabs.onRemoved.addListener((tabId) => {
  delete currentChannelByTab[tabId];
});

// ---------- Notify Tabs ----------
async function notifyAllYouTubeTabs(message: object): Promise<void> {
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  for (const tab of tabs) {
    try {
      if (tab.id != null) {
        await chrome.tabs.sendMessage(tab.id, message);
      }
    } catch {}
  }
}

// ---------- Initial Load ----------
loadSettings().then(() => {
  loadWatchData().then(() => {
    updateBadge();
  });
});
