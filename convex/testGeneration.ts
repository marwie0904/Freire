import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Helper function to extract JSON from various formats
function extractJSON(text: string): any {
  // First, try direct parsing
  try {
    return JSON.parse(text);
  } catch (e) {
    // If direct parsing fails, try to extract JSON from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e2) {
        // Continue to next attempt
      }
    }

    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e3) {
        // Continue to next attempt
      }
    }

    // If all else fails, throw the original error
    throw new Error(`Failed to extract valid JSON from response: ${text.substring(0, 200)}...`);
  }
}

// Background action to generate test from uploaded files
export const generateTestInBackground = action({
  args: {
    testId: v.id("tests"),
    fileUrls: v.array(v.string()),
    fileTypes: v.array(v.string()),
    testFormat: v.union(v.literal("multiple_choice"), v.literal("flashcard")),
    questionCount: v.number(),
  },
  handler: async (ctx, args) => {
    const { testId, fileUrls, fileTypes, testFormat, questionCount } = args;
    const startTime = Date.now();

    try {
      // Step 1: Update status to "generating" after upload
      await ctx.runMutation(api.tests.updateGenerationStatus, {
        testId,
        generationStatus: "generating" as const,
      });

      // Step 2: Extract file context using Gemini 2.5 Flash-Lite
      console.log("Extracting file content with Gemini 2.5 Flash-Lite...");
      const userPrompt = `Generate a ${testFormat === "multiple_choice" ? "multiple choice" : "flashcard"} test with ${questionCount} questions`;

      const geminiStartTime = Date.now();
      const geminiResult = await ctx.runAction(api.gemini.extractFileContext, {
        fileUrls,
        fileTypes,
        userPrompt,
      });

      const extractedContext = geminiResult.context;
      const geminiUsage = geminiResult.usage;

      console.log("File context extracted, length:", extractedContext.length);
      console.log("Gemini usage:", geminiUsage);

      // Track Gemini usage
      if (geminiUsage) {
        const geminiLatencyMs = Date.now() - geminiStartTime;

        // Calculate cost (simplified rates for gemini-2.5-flash-lite)
        // Input: $0.00001875 per 1K tokens, Output: $0.000075 per 1K tokens
        const geminiCostUsd =
          (geminiUsage.inputTokens / 1000) * 0.00001875 +
          (geminiUsage.outputTokens / 1000) * 0.000075;

        // USD to PHP conversion (approximate rate: 1 USD = 56 PHP)
        const geminiCostPhp = geminiCostUsd * 56;

        await ctx.runMutation(api.aiTracking.track, {
          inputTokens: geminiUsage.inputTokens,
          outputTokens: geminiUsage.outputTokens,
          totalTokens: geminiUsage.totalTokens,
          model: "google/gemini-2.5-flash-lite",
          provider: "google",
          usageType: "file_analysis",
          costUsd: geminiCostUsd,
          costPhp: geminiCostPhp,
          latencyMs: geminiLatencyMs,
          success: true,
        });

        console.log("✅ Gemini usage tracked");
      }

      if (!extractedContext || extractedContext.trim().length === 0) {
        throw new Error("Failed to extract content from files");
      }

      // Step 3: Generate test using GPT OSS 120B
      console.log("Generating test with GPT OSS 120B...");

      const testTypeDescription =
        testFormat === "multiple_choice"
          ? "multiple choice questions with 4 options"
          : "flashcards with front and back";

      const prompt = `You are a test generator. Generate a test with exactly ${questionCount} questions based on the file content below.

The file has already been analyzed. Here is the context of the file:

${extractedContext}

Test Requirements:
- Create ${questionCount} questions total
- Type: ${testTypeDescription}
- Questions should test understanding of the file content
- Make questions clear, educational, and well-distributed across all topics
- For important concepts, create multiple questions to ensure thorough coverage

Return ONLY valid JSON matching this exact schema (no markdown, no code blocks, no extra text):

{
  "title": "Test title that describes the document topic",
  "questions": [
    ${
      testFormat === "multiple_choice"
        ? `{
      "id": "q1",
      "type": "multiple_choice",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Brief explanation of why this is correct"
    }`
        : `{
      "id": "q1",
      "type": "flashcard",
      "front": "Front of card (question/term)",
      "back": "Back of card (answer/definition)"
    }`
    }
  ]
}

${
  testFormat === "multiple_choice"
    ? "Important: For multiple_choice, include question, options array, correctAnswer, and explanation fields."
    : "Important: For flashcard, ONLY include id, type, front, and back fields (NO question or correctAnswer fields)."
}

Output valid JSON only, no additional text or formatting.`;

      // Import AI SDK modules
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      const { generateText } = await import("ai");

      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });

      const result = await generateText({
        model: openrouter("openai/gpt-oss-120b", {
          usage: {
            include: true,
          },
        }),
        prompt,
        temperature: 0.7,
      });

      console.log("120B Raw response:", result.text.substring(0, 200));

      // Extract and parse JSON
      const testData = extractJSON(result.text);

      console.log("✓ Test generated successfully, questions:", testData.questions?.length);

      // Track successful usage
      const latencyMs = Date.now() - startTime;
      const inputTokens = (result.usage as any)?.promptTokens || 0;
      const outputTokens = (result.usage as any)?.completionTokens || 0;

      // Calculate cost for GPT OSS 120B
      // Input: $0.0002 per 1K tokens, Output: $0.0002 per 1K tokens (estimate)
      const gptCostUsd =
        (inputTokens / 1000) * 0.0002 +
        (outputTokens / 1000) * 0.0002;

      const gptCostPhp = gptCostUsd * 56;

      await ctx.runMutation(api.aiTracking.track, {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        model: "openai/gpt-oss-120b",
        provider: "openrouter",
        usageType: "test_creation",
        costUsd: gptCostUsd,
        costPhp: gptCostPhp,
        latencyMs,
        success: true,
      });

      // Validate test data
      if (
        !testData ||
        !testData.title ||
        !Array.isArray(testData.questions) ||
        testData.questions.length === 0
      ) {
        throw new Error("Invalid test data structure returned");
      }

      // Ensure all questions have IDs
      testData.questions = testData.questions.map((q: any, index: number) => ({
        ...q,
        id: q.id || `q${index + 1}`,
      }));

      // Step 4: Update the placeholder test with actual data
      await ctx.runMutation(api.tests.completeGeneration, {
        testId,
        title: testData.title,
        questions: testData.questions,
      });

      // Also update the conversation title
      const test = await ctx.runQuery(api.tests.get, { testId });
      if (test?.conversationId) {
        await ctx.runMutation(api.conversations.updateTitle, {
          conversationId: test.conversationId,
          title: `Document Test: ${testData.title}`,
        });
      }

      console.log("✓ Test generation complete:", testId);

      return { success: true, testId };
    } catch (error) {
      console.error("Background test generation error:", error);

      // Track failed usage
      const latencyMs = Date.now() - startTime;
      await ctx.runMutation(api.aiTracking.track, {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        model: "openai/gpt-oss-120b",
        provider: "openrouter",
        usageType: "test_creation",
        costUsd: 0,
        costPhp: 0,
        latencyMs,
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      // Mark test as failed (you might want to delete it or mark it as errored)
      // For now, just remove the generating status
      await ctx.runMutation(api.tests.updateGenerationStatus, {
        testId,
        generationStatus: "generating" as const, // Keep as generating to show error state
      });

      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});
