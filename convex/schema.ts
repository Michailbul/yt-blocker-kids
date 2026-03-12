// ============================================================
// YT Kids Guard — Convex Schema
// ============================================================

import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
  ...authTables,

  // A family group (parent + children share a familyId)
  families: defineTable({
    name: v.string(),
    createdBy: v.id('users'),
    joinCode: v.string(), // 6-char code devices use to join
    createdAt: v.number(),
  })
    .index('by_join_code', ['joinCode'])
    .index('by_user', ['createdBy']),

  // Registered devices (one per Chrome profile)
  devices: defineTable({
    familyId: v.id('families'),
    deviceName: v.string(),
    extensionId: v.string(),
    deviceToken: v.string(), // unique token for extension auth
    lastSeen: v.number(),
    createdAt: v.number(),
  })
    .index('by_family', ['familyId'])
    .index('by_device_token', ['deviceToken']),

  // Channel rules synced across devices
  channelRules: defineTable({
    familyId: v.id('families'),
    channelName: v.string(),
    channelHandle: v.optional(v.string()),
    channelUrl: v.optional(v.string()),
    status: v.union(v.literal('allowed'), v.literal('blocked')),
    addedBy: v.string(), // userId or deviceId
    addedAt: v.number(),
  })
    .index('by_family', ['familyId'])
    .index('by_family_channel', ['familyId', 'channelName']),

  // Daily watch sessions reported by extension
  watchSessions: defineTable({
    familyId: v.id('families'),
    deviceId: v.id('devices'),
    date: v.string(), // YYYY-MM-DD
    secondsUsed: v.number(),
    updatedAt: v.number(),
  })
    .index('by_device_date', ['deviceId', 'date'])
    .index('by_family_date', ['familyId', 'date']),

  // Family-level settings (synced to all devices)
  settings: defineTable({
    familyId: v.id('families'),
    dailyLimitMinutes: v.number(),
    blockShorts: v.boolean(),
    filterMode: v.union(v.literal('whitelist'), v.literal('blocklist')),
    extensionEnabled: v.boolean(),
    updatedAt: v.number(),
  }).index('by_family', ['familyId']),
});
