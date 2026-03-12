import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

export const listForFamily = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const family = await ctx.db
      .query('families')
      .withIndex('by_user', q => q.eq('createdBy', userId))
      .first();
    if (!family) return [];

    return await ctx.db
      .query('channelRules')
      .withIndex('by_family', q => q.eq('familyId', family._id))
      .collect();
  },
});

export const listForDevice = query({
  args: { deviceToken: v.string() },
  handler: async (ctx, { deviceToken }) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_token', q => q.eq('deviceToken', deviceToken))
      .first();
    if (!device) return [];

    return await ctx.db
      .query('channelRules')
      .withIndex('by_family', q => q.eq('familyId', device.familyId))
      .collect();
  },
});

export const addRule = mutation({
  args: {
    channelName: v.string(),
    channelHandle: v.optional(v.string()),
    channelUrl: v.optional(v.string()),
    status: v.union(v.literal('allowed'), v.literal('blocked')),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const family = await ctx.db
      .query('families')
      .withIndex('by_user', q => q.eq('createdBy', userId))
      .first();
    if (!family) throw new Error('No family found');

    // Check for duplicate
    const existing = await ctx.db
      .query('channelRules')
      .withIndex('by_family_channel', q =>
        q.eq('familyId', family._id).eq('channelName', args.channelName),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        channelHandle: args.channelHandle,
        channelUrl: args.channelUrl,
        addedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('channelRules', {
        familyId: family._id,
        channelName: args.channelName,
        channelHandle: args.channelHandle,
        channelUrl: args.channelUrl,
        status: args.status,
        addedBy: userId,
        addedAt: Date.now(),
      });
    }

    return { ok: true };
  },
});

export const removeRule = mutation({
  args: { channelName: v.string() },
  handler: async (ctx, { channelName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    const family = await ctx.db
      .query('families')
      .withIndex('by_user', q => q.eq('createdBy', userId))
      .first();
    if (!family) throw new Error('No family found');

    const rule = await ctx.db
      .query('channelRules')
      .withIndex('by_family_channel', q =>
        q.eq('familyId', family._id).eq('channelName', channelName),
      )
      .first();

    if (rule) await ctx.db.delete(rule._id);
    return { ok: true };
  },
});

export const addRuleFromDevice = mutation({
  args: {
    deviceToken: v.string(),
    channelName: v.string(),
    channelHandle: v.optional(v.string()),
    channelUrl: v.optional(v.string()),
    status: v.union(v.literal('allowed'), v.literal('blocked')),
  },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_token', q => q.eq('deviceToken', args.deviceToken))
      .first();
    if (!device) throw new Error('Unknown device');

    const existing = await ctx.db
      .query('channelRules')
      .withIndex('by_family_channel', q =>
        q.eq('familyId', device.familyId).eq('channelName', args.channelName),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        channelHandle: args.channelHandle,
        channelUrl: args.channelUrl,
        addedAt: Date.now(),
      });
    } else {
      await ctx.db.insert('channelRules', {
        familyId: device.familyId,
        channelName: args.channelName,
        channelHandle: args.channelHandle,
        channelUrl: args.channelUrl,
        status: args.status,
        addedBy: device._id,
        addedAt: Date.now(),
      });
    }

    return { ok: true };
  },
});
