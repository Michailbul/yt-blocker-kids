import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const register = mutation({
  args: {
    joinCode: v.string(),
    deviceName: v.string(),
    extensionId: v.string(),
  },
  handler: async (ctx, { joinCode, deviceName, extensionId }) => {
    const family = await ctx.db
      .query('families')
      .withIndex('by_join_code', q => q.eq('joinCode', joinCode.toUpperCase()))
      .first();
    if (!family) throw new Error('Invalid join code');

    const deviceToken = crypto.randomUUID();

    await ctx.db.insert('devices', {
      familyId: family._id,
      deviceName,
      extensionId,
      deviceToken,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    });

    return { deviceToken, familyName: family.name };
  },
});

export const heartbeat = mutation({
  args: { deviceToken: v.string() },
  handler: async (ctx, { deviceToken }) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_token', q => q.eq('deviceToken', deviceToken))
      .first();
    if (!device) throw new Error('Unknown device');

    await ctx.db.patch(device._id, { lastSeen: Date.now() });
    return { ok: true };
  },
});
