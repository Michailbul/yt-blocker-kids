import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

export const getForFamily = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const family = await ctx.db
      .query('families')
      .withIndex('by_user', q => q.eq('createdBy', userId))
      .first();
    if (!family) return null;

    return await ctx.db
      .query('settings')
      .withIndex('by_family', q => q.eq('familyId', family._id))
      .first();
  },
});

export const getForDevice = query({
  args: { deviceToken: v.string() },
  handler: async (ctx, { deviceToken }) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_token', q => q.eq('deviceToken', deviceToken))
      .first();
    if (!device) return null;

    const settings = await ctx.db
      .query('settings')
      .withIndex('by_family', q => q.eq('familyId', device.familyId))
      .first();

    const channelRules = await ctx.db
      .query('channelRules')
      .withIndex('by_family', q => q.eq('familyId', device.familyId))
      .collect();

    return settings ? { ...settings, channelRules } : null;
  },
});

export const update = mutation({
  args: {
    dailyLimitMinutes: v.optional(v.number()),
    blockShorts: v.optional(v.boolean()),
    filterMode: v.optional(v.union(v.literal('whitelist'), v.literal('blocklist'))),
    extensionEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const family = await ctx.db
      .query('families')
      .withIndex('by_user', q => q.eq('createdBy', userId))
      .first();
    if (!family) throw new Error('No family found');

    const settings = await ctx.db
      .query('settings')
      .withIndex('by_family', q => q.eq('familyId', family._id))
      .first();
    if (!settings) throw new Error('No settings found');

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.dailyLimitMinutes !== undefined) updates.dailyLimitMinutes = args.dailyLimitMinutes;
    if (args.blockShorts !== undefined) updates.blockShorts = args.blockShorts;
    if (args.filterMode !== undefined) updates.filterMode = args.filterMode;
    if (args.extensionEnabled !== undefined) updates.extensionEnabled = args.extensionEnabled;

    await ctx.db.patch(settings._id, updates);
    return { ok: true };
  },
});
