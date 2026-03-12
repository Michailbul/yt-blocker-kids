// ============================================================
// YT Kids Guard — Convex Sync Layer
// Uses ConvexHttpClient for service worker compatibility
// ============================================================

import { ConvexHttpClient } from 'convex/browser';
import type { Settings, WatchData } from './types';

// The Convex deployment URL — set via environment or hardcode after deploy
const CONVEX_URL = 'https://hallowed-dogfish-39.convex.cloud';

let client: ConvexHttpClient | null = null;
let deviceToken: string | null = null;
let familyName: string | null = null;
let lastSyncTime: number | null = null;

function getClient(): ConvexHttpClient | null {
  if (CONVEX_URL === '__CONVEX_URL__') return null;
  if (!client) client = new ConvexHttpClient(CONVEX_URL);
  return client;
}

async function loadDeviceToken(): Promise<string | null> {
  if (deviceToken) return deviceToken;
  try {
    const data = await chrome.storage.local.get(['convexDeviceToken', 'convexFamilyName']);
    deviceToken = data.convexDeviceToken || null;
    familyName = data.convexFamilyName || null;
  } catch {}
  return deviceToken;
}

export async function registerDevice(
  joinCode: string,
  deviceName: string,
): Promise<{ success: boolean; familyName?: string; error?: string }> {
  const c = getClient();
  if (!c) return { success: false, error: 'Cloud sync not configured' };

  try {
    const result = await c.mutation('devices:register' as any, {
      joinCode: joinCode.toUpperCase(),
      deviceName,
      extensionId: chrome.runtime.id,
    });

    if (result && typeof result === 'object' && 'deviceToken' in (result as any)) {
      const r = result as { deviceToken: string; familyName: string };
      deviceToken = r.deviceToken;
      familyName = r.familyName;
      await chrome.storage.local.set({
        convexDeviceToken: r.deviceToken,
        convexFamilyName: r.familyName,
      });
      return { success: true, familyName: r.familyName };
    }
    return { success: false, error: 'Invalid join code' };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Connection failed' };
  }
}

export async function getSyncStatus(): Promise<{
  connected: boolean;
  familyName?: string;
  lastSync?: number;
}> {
  const token = await loadDeviceToken();
  return {
    connected: !!token,
    familyName: familyName || undefined,
    lastSync: lastSyncTime || undefined,
  };
}

export async function pullFromConvex(): Promise<void> {
  const c = getClient();
  const token = await loadDeviceToken();
  if (!c || !token) return;

  try {
    const result = await c.query('settings:getForDevice' as any, { deviceToken: token });
    if (!result) return;

    const remote = result as {
      dailyLimitMinutes: number;
      blockShorts: boolean;
      filterMode: string;
      extensionEnabled: boolean;
      channelRules: Array<{ channelName: string; channelHandle?: string; channelUrl?: string; status: string }>;
    };

    // Merge remote settings into local chrome.storage.sync
    const current = await chrome.storage.sync.get(null);
    const updates: Partial<Settings> = {};

    if (remote.dailyLimitMinutes !== undefined) updates.dailyLimitMinutes = remote.dailyLimitMinutes;
    if (remote.blockShorts !== undefined) updates.blockShorts = remote.blockShorts;
    if (remote.filterMode !== undefined) updates.filterMode = remote.filterMode as Settings['filterMode'];
    if (remote.extensionEnabled !== undefined) updates.extensionEnabled = remote.extensionEnabled;

    // Merge channel rules
    if (remote.channelRules) {
      const allowed = remote.channelRules
        .filter(r => r.status === 'allowed')
        .map(r => ({
          name: r.channelName,
          url: r.channelUrl || '',
          handle: r.channelHandle || '',
          addedAt: Date.now(),
        }));
      const blocked = remote.channelRules
        .filter(r => r.status === 'blocked')
        .map(r => ({
          name: r.channelName,
          url: r.channelUrl || '',
          handle: r.channelHandle || '',
          blockedAt: Date.now(),
        }));
      if (allowed.length > 0 || (current.allowedChannels?.length || 0) === 0) {
        (updates as any).allowedChannels = allowed;
      }
      if (blocked.length > 0 || (current.blockedChannels?.length || 0) === 0) {
        (updates as any).blockedChannels = blocked;
      }
    }

    await chrome.storage.sync.set(updates);
    lastSyncTime = Date.now();

    // Heartbeat
    await c.mutation('devices:heartbeat' as any, { deviceToken: token });
  } catch {}
}

export async function pushToConvex(watchData: WatchData): Promise<void> {
  const c = getClient();
  const token = await loadDeviceToken();
  if (!c || !token) return;

  try {
    await c.mutation('watchSessions:report' as any, {
      deviceToken: token,
      date: watchData.date,
      secondsUsed: watchData.secondsUsed,
    });
    lastSyncTime = Date.now();
  } catch {}
}
