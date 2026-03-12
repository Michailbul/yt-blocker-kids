import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');

    // Check if user already has a family
    const existing = await ctx.db
      .query('families')
      .withIndex('by_user', q => q.eq('createdBy', userId))
      .first();
    if (existing) throw new Error('You already have a family');

    let joinCode = generateJoinCode();
    // Ensure unique
    while (await ctx.db.query('families').withIndex('by_join_code', q => q.eq('joinCode', joinCode)).first()) {
      joinCode = generateJoinCode();
    }

    const familyId = await ctx.db.insert('families', {
      name,
      createdBy: userId,
      joinCode,
      createdAt: Date.now(),
    });

    // Create default settings
    await ctx.db.insert('settings', {
      familyId,
      dailyLimitMinutes: 60,
      blockShorts: true,
      filterMode: 'whitelist',
      extensionEnabled: true,
      updatedAt: Date.now(),
    });

    return { familyId, joinCode };
  },
});

export const getMyFamily = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const family = await ctx.db
      .query('families')
      .withIndex('by_user', q => q.eq('createdBy', userId))
      .first();
    if (!family) return null;

    const devices = await ctx.db
      .query('devices')
      .withIndex('by_family', q => q.eq('familyId', family._id))
      .collect();

    return { ...family, devices };
  },
});
