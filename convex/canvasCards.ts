import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Token limit per canvas card (output tokens only)
const OUTPUT_TOKEN_LIMIT = 50000;

// Get all cards for a canvas
export const list = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, args) => {
    const cards = await ctx.db
      .query("canvasCards")
      .withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
      .collect();

    return cards;
  },
});

// Get a specific card by ID
export const get = query({
  args: { id: v.id("canvasCards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.id);
    return card;
  },
});

// Create a new card
export const create = mutation({
  args: {
    canvasId: v.id("canvases"),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const cardId = await ctx.db.insert("canvasCards", {
      canvasId: args.canvasId,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      content: args.content || "",
      conversationHistory: [],
      createdAt: now,
      updatedAt: now,
    });

    return cardId;
  },
});

// Update card position and size
export const updatePosition = mutation({
  args: {
    id: v.id("canvasCards"),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

// Update card content
export const updateContent = mutation({
  args: {
    id: v.id("canvasCards"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      content: args.content,
      updatedAt: Date.now(),
    });
  },
});

// Get token usage for a canvas card
export const getTokenUsage = query({
  args: { cardId: v.id("canvasCards") },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new Error("Card not found");

    const conversationHistory = card.conversationHistory || [];
    const totalOutputTokens = conversationHistory.reduce((sum, msg) => {
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

// Add message to conversation history
export const addMessage = mutation({
  args: {
    id: v.id("canvasCards"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.string(),
          fileName: v.string(),
          fileType: v.string(),
          fileSize: v.number(),
        })
      )
    ),
    tokenUsage: v.optional(
      v.object({
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.id);
    if (!card) throw new Error("Card not found");

    // Check token limit before adding new message
    if (args.role === "assistant" && args.tokenUsage) {
      const conversationHistory = card.conversationHistory || [];
      const totalOutputTokens = conversationHistory.reduce((sum, msg) => {
        return sum + (msg.tokenUsage?.completionTokens || 0);
      }, 0);

      if (totalOutputTokens >= OUTPUT_TOKEN_LIMIT) {
        throw new Error(
          `This card has reached its output token limit of ${OUTPUT_TOKEN_LIMIT.toLocaleString()}. Please create a new card.`
        );
      }
    }

    const conversationHistory = card.conversationHistory || [];
    conversationHistory.push({
      role: args.role,
      content: args.content,
      timestamp: Date.now(),
      tokenUsage: args.tokenUsage,
      attachments: args.attachments,
    });

    await ctx.db.patch(args.id, {
      conversationHistory,
      content: args.role === "assistant" ? args.content : card.content,
      updatedAt: Date.now(),
    });

    // Return the updated conversation history so caller doesn't need to query again
    return conversationHistory;
  },
});

// Branch a card (duplicate with all content)
export const branch = mutation({
  args: {
    sourceCardId: v.id("canvasCards"),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const sourceCard = await ctx.db.get(args.sourceCardId);
    if (!sourceCard) throw new Error("Source card not found");

    const now = Date.now();

    // Create duplicate card with same content and conversation history
    const newCardId = await ctx.db.insert("canvasCards", {
      canvasId: sourceCard.canvasId,
      x: args.x,
      y: args.y,
      width: sourceCard.width,
      height: sourceCard.height,
      content: sourceCard.content,
      conversationHistory: sourceCard.conversationHistory || [],
      createdAt: now,
      updatedAt: now,
    });

    return newCardId;
  },
});

// Delete a card
export const remove = mutation({
  args: { id: v.id("canvasCards") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
