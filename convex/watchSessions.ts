import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

export const report = mutation({
  args: {
    deviceToken: v.string(),
    date: v.string(),
    secondsUsed: v.number(),
  },
  handler: async (ctx, { deviceToken, date, secondsUsed }) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_token', q => q.eq('deviceToken', deviceToken))
      .first();
    if (!device) throw new Error('Unknown device');

    const existing = await ctx.db
      .query('watchSessions')
      .withIndex('by_device_date', q => q.eq('deviceId', device._id).eq('date', date))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        secondsUsed,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('watchSessions', {
        familyId: device.familyId,
        deviceId: device._id,
        date,
        secondsUsed,
        updatedAt: Date.now(),
      });
    }

    return { ok: true };
  },
});

export const getForFamily = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const family = await ctx.db
      .query('families')
      .withIndex('by_user', q => q.eq('createdBy', userId))
      .first();
    if (!family) return [];

    const today = new Date().toISOString().slice(0, 10);

    const sessions = await ctx.db
      .query('watchSessions')
      .withIndex('by_family_date', q => q.eq('familyId', family._id).eq('date', today))
      .collect();

    // Enrich with device names
    const devices = await ctx.db
      .query('devices')
      .withIndex('by_family', q => q.eq('familyId', family._id))
      .collect();

    const deviceMap = new Map(devices.map(d => [d._id, d.deviceName]));

    return sessions.map(s => ({
      ...s,
      deviceName: deviceMap.get(s.deviceId) || 'Unknown',
    }));
  },
});
