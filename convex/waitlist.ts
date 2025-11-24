import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Join the waitlist
 */
export const joinWaitlist = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    gradeLevel: v.optional(v.string()),
    interestedFeature: v.optional(v.string()),
    joinBetaTesting: v.optional(v.boolean()),
    operatingSystems: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if email already exists in waitlist
    const existingEntry = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingEntry) {
      throw new Error("This email is already on the waitlist");
    }

    const waitlistId = await ctx.db.insert("waitlist", {
      name: args.name,
      email: args.email,
      gradeLevel: args.gradeLevel,
      interestedFeature: args.interestedFeature,
      joinBetaTesting: args.joinBetaTesting,
      operatingSystems: args.operatingSystems,
      createdAt: now,
    });

    return waitlistId;
  },
});

/**
 * Get all waitlist entries (admin only)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const waitlistEntries = await ctx.db
      .query("waitlist")
      .withIndex("by_created")
      .order("desc")
      .collect();

    return waitlistEntries;
  },
});

/**
 * Get waitlist count
 */
export const getCount = query({
  args: {},
  handler: async (ctx) => {
    const waitlistEntries = await ctx.db.query("waitlist").collect();
    return waitlistEntries.length;
  },
});
