// ============================================================
// YT Kids Guard — Shared Types
// ============================================================

export interface Channel {
  name: string;
  url: string;
  handle: string;
}

export interface AllowedChannel extends Channel {
  addedAt: number;
}

export interface BlockedChannel extends Channel {
  blockedAt: number;
}

export type FilterMode = 'whitelist' | 'blocklist';

export interface Settings {
  parentPasswordHash: string;
  dailyLimitMinutes: number;
  allowedChannels: AllowedChannel[];
  blockedChannels: BlockedChannel[];
  blockShorts: boolean;
  filterMode: FilterMode;
  extensionEnabled: boolean;
}

export interface WatchData {
  date: string;
  secondsUsed: number;
}

export interface FullState {
  settings: Settings;
  watchData: WatchData;
  remainingSeconds: number;
  isTimeUp: boolean;
  currentChannelByTab: Record<number, Channel>;
  hasPassword: boolean;
}

// ---------- Message Types ----------

export type MessageType =
  | 'GET_STATE'
  | 'VERIFY_PASSWORD'
  | 'SET_PASSWORD'
  | 'UPDATE_SETTINGS'
  | 'RESET_TIMER'
  | 'ADD_TIME'
  | 'ADD_ALLOWED_CHANNEL'
  | 'REMOVE_ALLOWED_CHANNEL'
  | 'BLOCK_CHANNEL'
  | 'UNBLOCK_CHANNEL'
  | 'BLOCK_CURRENT_CHANNEL'
  | 'ALLOW_CURRENT_CHANNEL'
  | 'REPORT_CHANNEL'
  | 'RESOLVE_VIDEO_URL'
  | 'REGISTER_DEVICE'
  | 'GET_SYNC_STATUS'
  | 'HEARTBEAT'
  | 'CHECK_STATUS'
  | 'BLOCK'
  | 'UNBLOCK'
  | 'SETTINGS_UPDATED'
  | 'STATE_CHANGED';

export interface BaseMessage {
  type: MessageType;
  sessionToken?: string;
}

export interface VerifyPasswordMessage extends BaseMessage {
  type: 'VERIFY_PASSWORD';
  passwordHash: string;
}

export interface SetPasswordMessage extends BaseMessage {
  type: 'SET_PASSWORD';
  passwordHash: string;
}

export interface UpdateSettingsMessage extends BaseMessage {
  type: 'UPDATE_SETTINGS';
  dailyLimitMinutes?: number;
  blockShorts?: boolean;
  filterMode?: FilterMode;
  extensionEnabled?: boolean;
}

export interface AddTimeMessage extends BaseMessage {
  type: 'ADD_TIME';
  minutes?: number;
}

export interface ChannelMessage extends BaseMessage {
  type: 'ADD_ALLOWED_CHANNEL' | 'BLOCK_CHANNEL';
  channel: Channel;
}

export interface RemoveChannelMessage extends BaseMessage {
  type: 'REMOVE_ALLOWED_CHANNEL' | 'UNBLOCK_CHANNEL';
  channelName: string;
}

export interface ReportChannelMessage extends BaseMessage {
  type: 'REPORT_CHANNEL';
  channel: Channel;
  isShort: boolean;
  isWatchPage: boolean;
  url: string;
}

export interface ResolveVideoUrlMessage extends BaseMessage {
  type: 'RESOLVE_VIDEO_URL';
  videoUrl: string;
}

export interface ResolveVideoUrlResponse {
  success: boolean;
  channel?: Channel;
  error?: string;
}

export interface RegisterDeviceMessage extends BaseMessage {
  type: 'REGISTER_DEVICE';
  joinCode: string;
  deviceName: string;
}

export interface SyncStatus {
  connected: boolean;
  familyName?: string;
  lastSync?: number;
  deviceToken?: string;
}

export interface BlockMessage {
  type: 'BLOCK';
  reason: BlockReason;
}

export interface SettingsUpdatedMessage {
  type: 'SETTINGS_UPDATED';
  settings: Settings;
}

export type BlockReason = 'time_up' | 'channel_blocked' | 'shorts_blocked';

export interface ReportChannelResponse {
  allowed: boolean;
  reason: BlockReason | null;
  remainingSeconds: number;
  settings: {
    blockShorts: boolean;
    filterMode: FilterMode;
    extensionEnabled: boolean;
  };
}

export interface PasswordResult {
  success: boolean;
  sessionToken?: string;
  locked?: boolean;
  retryAfter?: number;
  attemptsLeft?: number;
}

export interface CheckStatusResponse {
  remainingSeconds: number;
  isTimeUp: boolean;
  extensionEnabled: boolean;
  blockShorts: boolean;
}

export interface HeartbeatResponse {
  remainingSeconds: number;
  isTimeUp: boolean;
}
