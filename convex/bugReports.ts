import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrThrow } from "./lib/auth";

/**
 * Create a new bug report
 */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();

    const bugReportId = await ctx.db.insert("bugReports", {
      userId: user._id,
      title: args.title,
      description: args.description,
      status: "pending",
      userName: args.userName,
      userEmail: args.userEmail,
      createdAt: now,
      updatedAt: now,
    });

    return bugReportId;
  },
});

/**
 * Update bug report with session recording information
 */
export const updateSessionRecording = mutation({
  args: {
    bugReportId: v.id("bugReports"),
    sessionRecordingUrl: v.string(),
    posthogSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const bugReport = await ctx.db.get(args.bugReportId);

    if (!bugReport) throw new Error("Bug report not found");
    if (bugReport.userId !== user._id) {
      throw new Error("Unauthorized access to bug report");
    }

    await ctx.db.patch(args.bugReportId, {
      sessionRecordingUrl: args.sessionRecordingUrl,
      posthogSessionId: args.posthogSessionId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update bug report status
 */
export const updateStatus = mutation({
  args: {
    bugReportId: v.id("bugReports"),
    status: v.union(
      v.literal("pending"),
      v.literal("in-progress"),
      v.literal("for-review"),
      v.literal("resolved")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const bugReport = await ctx.db.get(args.bugReportId);

    if (!bugReport) throw new Error("Bug report not found");
    if (bugReport.userId !== user._id) {
      throw new Error("Unauthorized access to bug report");
    }

    await ctx.db.patch(args.bugReportId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update bug report notes
 */
export const updateNotes = mutation({
  args: {
    bugReportId: v.id("bugReports"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const bugReport = await ctx.db.get(args.bugReportId);

    if (!bugReport) throw new Error("Bug report not found");
    if (bugReport.userId !== user._id) {
      throw new Error("Unauthorized access to bug report");
    }

    await ctx.db.patch(args.bugReportId, {
      notes: args.notes,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Get all bug reports
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);

    const bugReports = await ctx.db
      .query("bugReports")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return bugReports;
  },
});

/**
 * Get bug reports by status
 */
export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("in-progress"),
      v.literal("for-review"),
      v.literal("resolved")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const bugReports = await ctx.db
      .query("bugReports")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    // Filter by status in-memory since we need both userId and status filtering
    return bugReports.filter((report) => report.status === args.status);
  },
});

/**
 * Get a single bug report
 */
export const get = query({
  args: {
    bugReportId: v.id("bugReports"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const bugReport = await ctx.db.get(args.bugReportId);

    if (!bugReport) return null;
    if (bugReport.userId !== user._id) {
      throw new Error("Unauthorized access to bug report");
    }

    return bugReport;
  },
});

/**
 * Delete a bug report
 */
export const remove = mutation({
  args: {
    bugReportId: v.id("bugReports"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const bugReport = await ctx.db.get(args.bugReportId);

    if (!bugReport) throw new Error("Bug report not found");
    if (bugReport.userId !== user._id) {
      throw new Error("Unauthorized access to bug report");
    }

    await ctx.db.delete(args.bugReportId);
  },
});
