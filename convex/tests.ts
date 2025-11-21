import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./lib/auth";

// Question schema for validation
const questionSchema = v.object({
  id: v.string(),
  type: v.union(
    v.literal("multiple_choice"),
    v.literal("written"),
    v.literal("fill_blank"),
    v.literal("flashcard")
  ),
  question: v.optional(v.string()),
  options: v.optional(v.array(v.string())),
  correctAnswer: v.optional(v.union(v.string(), v.array(v.string()))),
  explanation: v.optional(v.string()),
  front: v.optional(v.string()),
  back: v.optional(v.string()),
});

// Create a new test and initialize testResponse
export const create = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
    questions: v.array(questionSchema),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);

    if (!conversation) throw new Error("Conversation not found");
    if (conversation.userId !== user._id) {
      throw new Error("Unauthorized access to conversation");
    }

    const now = Date.now();

    // Create the test
    const testId = await ctx.db.insert("tests", {
      userId: user._id,
      conversationId: args.conversationId,
      title: args.title,
      questions: args.questions,
      createdAt: now,
    });

    // Automatically create an incomplete testResponse
    await ctx.db.insert("testResponses", {
      userId: user._id,
      testId,
      conversationId: args.conversationId,
      answers: "{}",
      score: 0,
      totalQuestions: args.questions.length,
      isCompleted: false,
      submittedAt: now,
    });

    return testId;
  },
});

// Create a placeholder test that will be generated in the background
export const createPlaceholder = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
    questionCount: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);

    if (!conversation) throw new Error("Conversation not found");
    if (conversation.userId !== user._id) {
      throw new Error("Unauthorized access to conversation");
    }

    const now = Date.now();

    // Create a placeholder test with empty questions
    const testId = await ctx.db.insert("tests", {
      userId: user._id,
      conversationId: args.conversationId,
      title: args.title,
      questions: [],
      isGenerating: true,
      createdAt: now,
    });

    return testId;
  },
});

// Update generation status (uploading -> generating)
export const updateGenerationStatus = mutation({
  args: {
    testId: v.id("tests"),
    generationStatus: v.union(v.literal("uploading"), v.literal("generating")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const test = await ctx.db.get(args.testId);

    if (!test) throw new Error("Test not found");
    if (test.userId !== user._id) {
      throw new Error("Unauthorized access to test");
    }

    await ctx.db.patch(args.testId, {
      generationStatus: args.generationStatus,
    });

    return args.testId;
  },
});

// Update test with generated questions and mark as complete
export const completeGeneration = mutation({
  args: {
    testId: v.id("tests"),
    title: v.string(),
    questions: v.array(questionSchema),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const test = await ctx.db.get(args.testId);

    if (!test) throw new Error("Test not found");
    if (test.userId !== user._id) {
      throw new Error("Unauthorized access to test");
    }

    // Update the test with questions, title, and mark as not generating
    await ctx.db.patch(args.testId, {
      title: args.title,
      questions: args.questions,
      isGenerating: false,
      generationStatus: undefined,
    });

    // Create an incomplete testResponse for the newly generated test
    const now = Date.now();
    await ctx.db.insert("testResponses", {
      userId: user._id,
      testId: args.testId,
      conversationId: test.conversationId,
      answers: "{}",
      score: 0,
      totalQuestions: args.questions.length,
      isCompleted: false,
      submittedAt: now,
    });

    return args.testId;
  },
});

// List all tests with completion status
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);

    const tests = await ctx.db
      .query("tests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);

    // For each test, get the latest response to check if it's completed
    const testsWithStatus = await Promise.all(
      tests.map(async (test) => {
        const latestResponse = await ctx.db
          .query("testResponses")
          .withIndex("by_test", (q) => q.eq("testId", test._id))
          .order("desc")
          .first();

        return {
          ...test,
          // If isCompleted is undefined (old data), treat as completed (true)
          // If isCompleted is false, it's incomplete
          // If isCompleted is true, it's completed
          isCompleted: latestResponse?.isCompleted ?? true,
          hasResponse: !!latestResponse,
          score: latestResponse?.score,
          totalQuestions: latestResponse?.totalQuestions,
        };
      })
    );

    return testsWithStatus;
  },
});

// Get a single test by ID
export const get = query({
  args: { testId: v.id("tests") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const test = await ctx.db.get(args.testId);

    if (!test) return null;
    if (test.userId !== user._id) {
      throw new Error("Unauthorized access to test");
    }

    return test;
  },
});

// Get all tests for a conversation
export const getByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const conversation = await ctx.db.get(args.conversationId);

    if (!conversation) throw new Error("Conversation not found");
    if (conversation.userId !== user._id) {
      throw new Error("Unauthorized access to conversation");
    }

    return await ctx.db
      .query("tests")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(20);
  },
});

// Update test title
export const updateTitle = mutation({
  args: {
    testId: v.id("tests"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const test = await ctx.db.get(args.testId);

    if (!test) throw new Error("Test not found");
    if (test.userId !== user._id) {
      throw new Error("Unauthorized access to test");
    }

    await ctx.db.patch(args.testId, {
      title: args.title,
    });
  },
});

// Delete a test
export const remove = mutation({
  args: { testId: v.id("tests") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const test = await ctx.db.get(args.testId);

    if (!test) throw new Error("Test not found");
    if (test.userId !== user._id) {
      throw new Error("Unauthorized access to test");
    }

    // Delete all test responses
    const responses = await ctx.db
      .query("testResponses")
      .withIndex("by_test", (q) => q.eq("testId", args.testId))
      .collect();

    for (const response of responses) {
      await ctx.db.delete(response._id);
    }

    await ctx.db.delete(args.testId);
  },
});
