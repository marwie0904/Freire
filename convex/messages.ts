import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./lib/auth";
import { checkRateLimit } from "./lib/rateLimit";

// Token limit per conversation (output tokens only)
const OUTPUT_TOKEN_LIMIT = 50000;

// Get all messages for a conversation
export const getAll = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);

    // Return empty array if conversation doesn't exist yet (race condition)
    if (!conversation) return [];

    if (conversation.userId !== user._id) {
      throw new Error("Unauthorized access to conversation");
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();
  },
});

// Get total output tokens for a conversation
export const getOutputTokenCount = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);

    // Return default values if conversation doesn't exist yet (race condition)
    if (!conversation) {
      return {
        totalOutputTokens: 0,
        limit: OUTPUT_TOKEN_LIMIT,
        isLimitReached: false,
        remainingTokens: OUTPUT_TOKEN_LIMIT,
      };
    }

    if (conversation.userId !== user._id) {
      throw new Error("Unauthorized access to conversation");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    const totalOutputTokens = messages.reduce((sum, msg) => {
      return sum + (msg.tokenUsage?.completionTokens || 0);
    }, 0);

    return {
      totalOutputTokens,
      limit: OUTPUT_TOKEN_LIMIT,
      isLimitReached: totalOutputTokens >= OUTPUT_TOKEN_LIMIT,
      remainingTokens: Math.max(0, OUTPUT_TOKEN_LIMIT - totalOutputTokens),
    };
  },
});

// Create a message (alias for send)
export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          fileSize: v.number(),
          fileType: v.string(),
        })
      )
    ),
    searchMetadata: v.optional(
      v.object({
        query: v.string(),
        sources: v.array(
          v.object({
            title: v.string(),
            url: v.string(),
            snippet: v.optional(v.string()),
          })
        ),
      })
    ),
    tokenUsage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
    reasoningDetails: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Apply rate limiting (1 request per second per user)
    await checkRateLimit(ctx, user._id);

    // Get current conversation and verify ownership
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.userId !== user._id) {
      throw new Error("Unauthorized access to conversation");
    }

    // Check token limit for user messages (before AI responds)
    if (args.role === "user") {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .collect();

      const totalOutputTokens = messages.reduce((sum, msg) => {
        return sum + (msg.tokenUsage?.completionTokens || 0);
      }, 0);

      if (totalOutputTokens >= OUTPUT_TOKEN_LIMIT) {
        throw new Error(
          `This conversation has reached its output token limit of ${OUTPUT_TOKEN_LIMIT.toLocaleString()}. Please start a new conversation.`
        );
      }
    }

    const now = Date.now();

    // Insert message
    const messageId = await ctx.db.insert("messages", {
      userId: user._id,
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      attachments: args.attachments,
      searchMetadata: args.searchMetadata,
      tokenUsage: args.tokenUsage,
      reasoningDetails: args.reasoningDetails,
      createdAt: now,
      updatedAt: now,
    });

    // Update conversation metadata
    await ctx.db.patch(args.conversationId, {
      lastMessagePreview: args.content.substring(0, 100),
      lastMessageAt: now,
      messageCount: (conversation.messageCount || 0) + 1,
      updatedAt: now,
    });

    return messageId;
  },
});

// Send/save a message
export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          fileName: v.string(),
          fileSize: v.number(),
          fileType: v.string(),
        })
      )
    ),
    searchMetadata: v.optional(
      v.object({
        query: v.string(),
        sources: v.array(
          v.object({
            title: v.string(),
            url: v.string(),
            snippet: v.optional(v.string()),
          })
        ),
      })
    ),
    tokenUsage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
    reasoningDetails: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Get current conversation and verify ownership
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.userId !== user._id) {
      throw new Error("Unauthorized access to conversation");
    }

    // Check token limit for user messages (before AI responds)
    if (args.role === "user") {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .collect();

      const totalOutputTokens = messages.reduce((sum, msg) => {
        return sum + (msg.tokenUsage?.completionTokens || 0);
      }, 0);

      if (totalOutputTokens >= OUTPUT_TOKEN_LIMIT) {
        throw new Error(
          `This conversation has reached its output token limit of ${OUTPUT_TOKEN_LIMIT.toLocaleString()}. Please start a new conversation.`
        );
      }
    }

    const now = Date.now();

    // Insert message
    const messageId = await ctx.db.insert("messages", {
      userId: user._id,
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      attachments: args.attachments,
      searchMetadata: args.searchMetadata,
      tokenUsage: args.tokenUsage,
      reasoningDetails: args.reasoningDetails,
      createdAt: now,
      updatedAt: now,
    });

    // Update conversation metadata
    await ctx.db.patch(args.conversationId, {
      lastMessagePreview: args.content.substring(0, 100),
      lastMessageAt: now,
      messageCount: (conversation.messageCount || 0) + 1,
      updatedAt: now,
    });

    return messageId;
  },
});
