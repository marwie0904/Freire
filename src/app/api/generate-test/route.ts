import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { trackLLMCallServer, calculateLLMCost } from "@/lib/analytics/llm-tracking";
import { usdToPhp } from "@/lib/currency";
import { getProviderForModel } from "@/lib/provider-helper";

// Allow API calls up to 60 seconds
export const maxDuration = 60;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface GenerateTestRequest {
  conversationId: string;
  testTypes: string[];
  questionCount: number;
}

async function generateTestInBackground(
  conversationId: Id<"conversations">,
  testId: Id<"tests">,
  testTypes: string[],
  questionCount: number,
  startTime: number
) {
  try {
    // Fetch conversation messages
    const messages = await convex.query(api.messages.getAll, {
      conversationId,
    });

    if (!messages || messages.length === 0) {
      throw new Error("No conversation history found");
    }

    // Build conversation context
    const conversationContext = messages
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n\n");

    // Build test type description
    const typeDescriptions = testTypes.map((type) => {
      switch (type) {
        case "multiple_choice":
          return "multiple choice questions with 4 options";
        case "written":
          return "written answer questions (open-ended)";
        case "fill_blank":
          return "fill in the blank questions (use ____ as placeholder)";
        case "flashcard":
          return "flashcards with front and back (use 'front' and 'back' fields)";
        default:
          return type;
      }
    });

    // Build the prompt
    const prompt = `You are a test generator. Generate a test with exactly ${questionCount} questions based on the conversation below.

Test Requirements:
- Create ${questionCount} questions total
- ONLY use these types: ${typeDescriptions.join(", ")}
- You MUST distribute questions evenly across ONLY the specified types above
- Do NOT use any other question types that are not listed
- Questions should test understanding of the conversation content
- Make questions clear and educational

Conversation Context:
${conversationContext}

Return ONLY valid JSON matching this exact schema (no markdown, no code blocks, no extra text):

{
  "title": "Test title that describes the topic",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice" | "written" | "fill_blank" | "flashcard",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

Important format rules:
- For multiple_choice: include "question", "options" array, and single "correctAnswer"
- For written: include "question" and sample "correctAnswer" text
- For fill_blank: use ____ in "question" text, include single word/phrase "correctAnswer"
- For flashcard: ONLY include "id", "type", "front", and "back" fields (NO question or correctAnswer fields)

Output valid JSON only, no additional text or formatting.`;

    // Initialize OpenRouter
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    let testData;
    let attempt = 1;
    let lastError: Error | null = null;

    // Attempt 1: GPT OSS 20B
    try {
      console.log("Attempting test generation with GPT OSS 20B...");

      const result = await generateText({
        model: openrouter("openai/gpt-oss-20b", {
          usage: {
            include: true,
          },
        }),
        prompt,
        temperature: 0.7,
      });

      console.log("20B Raw response:", result.text.substring(0, 200));

      // Parse JSON directly
      testData = JSON.parse(result.text);

      console.log("✓ 20B succeeded, questions generated:", testData.questions?.length);

      // Track successful 20B usage
      const latencyMs = Date.now() - startTime;

      // OpenRouter returns usage in providerMetadata
      const openrouterUsage = (result as any).experimental_providerMetadata?.openrouter?.usage;

      console.log("📊 [RAW] OpenRouter usage:", JSON.stringify(openrouterUsage, null, 2));
      console.log("📊 [RAW] AI SDK usage:", JSON.stringify(result.usage, null, 2));

      if (result.usage) {
        const usageData = result.usage as any;
        const promptToks = usageData?.inputTokens ?? openrouterUsage?.prompt_tokens ?? usageData?.promptTokens ?? usageData?.prompt_tokens ?? 0;
        const completionToks = usageData?.outputTokens ?? openrouterUsage?.completion_tokens ?? usageData?.completionTokens ?? usageData?.completion_tokens ?? 0;
        const reasoningToks = usageData?.reasoningTokens ?? 0;
        const totalToks = usageData?.totalTokens ?? openrouterUsage?.total_tokens ?? usageData?.total_tokens ?? (promptToks + completionToks);
        const costUsd = calculateLLMCost("openai/gpt-oss-20b", promptToks, completionToks);

        // Track in PostHog
        await trackLLMCallServer({
          model: "openai/gpt-oss-20b",
          provider: "openrouter",
          promptTokens: promptToks,
          completionTokens: completionToks,
          totalTokens: totalToks,
          cost: costUsd,
          latencyMs,
          conversationId: conversationId as string,
          success: true,
        });

        // Track in Convex aiTracking table
        await convex.mutation(api.aiTracking.track, {
          inputTokens: promptToks,
          outputTokens: completionToks,
          reasoningTokens: reasoningToks > 0 ? reasoningToks : undefined,
          totalTokens: totalToks,
          model: "openai/gpt-oss-20b",
          provider: getProviderForModel("openai/gpt-oss-20b"),
          usageType: "test_creation",
          costUsd,
          costPhp: usdToPhp(costUsd),
          conversationId: conversationId as Id<"conversations">,
          latencyMs,
          success: true,
        });
      }
    } catch (error) {
      lastError = error as Error;
      console.log("✗ 20B failed:", lastError.message);

      // Track failed 20B usage
      const latencyMs = Date.now() - startTime;
      const errorMessage = lastError.message;

      // Track in PostHog
      await trackLLMCallServer({
        model: "openai/gpt-oss-20b",
        provider: "openrouter",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        latencyMs,
        conversationId: conversationId as string,
        success: false,
        errorMessage,
      });

      // Track in Convex
      try {
        await convex.mutation(api.aiTracking.track, {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          model: "openai/gpt-oss-20b",
          provider: getProviderForModel("openai/gpt-oss-20b"),
          usageType: "test_creation",
          costUsd: 0,
          costPhp: 0,
          conversationId: conversationId as Id<"conversations">,
          latencyMs,
          success: false,
          errorMessage,
        });
      } catch (trackError) {
        console.error("Failed to track error in Convex:", trackError);
      }

      // Attempt 2: GPT OSS 120B
      try {
        attempt = 2;
        console.log("Attempting test generation with GPT OSS 120B...");

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

        // Parse JSON directly
        testData = JSON.parse(result.text);

        console.log("✓ 120B succeeded, questions generated:", testData.questions?.length);

        // Track successful 120B usage
        const latencyMs = Date.now() - startTime;

        // OpenRouter returns usage in providerMetadata
        const openrouterUsage = (result as any).experimental_providerMetadata?.openrouter?.usage;

        console.log("📊 [RAW] OpenRouter usage:", JSON.stringify(openrouterUsage, null, 2));
        console.log("📊 [RAW] AI SDK usage:", JSON.stringify(result.usage, null, 2));

        if (result.usage) {
          const usageData = result.usage as any;
          const promptToks = usageData?.inputTokens ?? openrouterUsage?.prompt_tokens ?? usageData?.promptTokens ?? usageData?.prompt_tokens ?? 0;
          const completionToks = usageData?.outputTokens ?? openrouterUsage?.completion_tokens ?? usageData?.completionTokens ?? usageData?.completion_tokens ?? 0;
          const reasoningToks = usageData?.reasoningTokens ?? 0;
          const totalToks = usageData?.totalTokens ?? openrouterUsage?.total_tokens ?? usageData?.total_tokens ?? (promptToks + completionToks);
          const costUsd = calculateLLMCost("openai/gpt-oss-120b", promptToks, completionToks);

          // Track in PostHog
          await trackLLMCallServer({
            model: "openai/gpt-oss-120b",
            provider: "openrouter",
            promptTokens: promptToks,
            completionTokens: completionToks,
            totalTokens: totalToks,
            cost: costUsd,
            latencyMs,
            conversationId: conversationId as string,
            success: true,
          });

          // Track in Convex aiTracking table
          await convex.mutation(api.aiTracking.track, {
            inputTokens: promptToks,
            outputTokens: completionToks,
            reasoningTokens: reasoningToks > 0 ? reasoningToks : undefined,
            totalTokens: totalToks,
            model: "openai/gpt-oss-120b",
            provider: getProviderForModel("openai/gpt-oss-120b"),
            usageType: "test_creation",
            costUsd,
            costPhp: usdToPhp(costUsd),
            conversationId: conversationId as Id<"conversations">,
            latencyMs,
            success: true,
          });
        }
      } catch (error) {
        lastError = error as Error;
        console.log("✗ 120B also failed:", lastError.message);

        // Track failed 120B usage
        const latencyMs = Date.now() - startTime;
        const errorMessage = lastError.message;

        // Track in PostHog
        await trackLLMCallServer({
          model: "openai/gpt-oss-120b",
          provider: "openrouter",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          latencyMs,
          conversationId: conversationId as string,
          success: false,
          errorMessage,
        });

        // Track in Convex
        try {
          await convex.mutation(api.aiTracking.track, {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            model: "openai/gpt-oss-120b",
            provider: getProviderForModel("openai/gpt-oss-120b"),
            usageType: "test_creation",
            costUsd: 0,
            costPhp: 0,
            conversationId: conversationId as Id<"conversations">,
            latencyMs,
            success: false,
            errorMessage,
          });
        } catch (trackError) {
          console.error("Failed to track error in Convex:", trackError);
        }

        // Both attempts failed - delete the placeholder test
        await convex.mutation(api.tests.remove, { testId });
        throw new Error("Test creation failed, too complex for AI to handle");
      }
    }

    // Validate the test data structure
    if (
      !testData ||
      !testData.title ||
      !Array.isArray(testData.questions) ||
      testData.questions.length === 0
    ) {
      // Delete the placeholder test
      await convex.mutation(api.tests.remove, { testId });
      throw new Error("Invalid test data structure returned");
    }

    // Filter questions to only include requested types
    const requestedTypes = testTypes.map(type => {
      if (type === "multiple_choice") return "multiple_choice";
      if (type === "written") return "written";
      if (type === "fill_blank") return "fill_blank";
      if (type === "flashcard") return "flashcard";
      return type;
    });

    testData.questions = testData.questions
      .filter((q: any) => requestedTypes.includes(q.type))
      .map((q: any, index: number) => ({
        ...q,
        id: q.id || `q${index + 1}`,
      }));

    // Validate we still have questions after filtering
    if (testData.questions.length === 0) {
      // Delete the placeholder test
      await convex.mutation(api.tests.remove, { testId });
      throw new Error("No valid questions generated for requested types");
    }

    // Complete the test generation
    await convex.mutation(api.tests.completeGeneration, {
      testId,
      questions: testData.questions,
    });

    // Update the title if needed
    if (testData.title !== "Generating test...") {
      await convex.mutation(api.tests.updateTitle, {
        testId,
        title: testData.title,
      });
    }

    console.log("✓ Test generation completed:", testId);
  } catch (error) {
    console.error("Background test generation error:", error);
    throw error;
  }
}

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const {
      conversationId,
      testTypes,
      questionCount,
    }: GenerateTestRequest = await req.json();

    console.log("=== Generate Test API Request ===");
    console.log("Conversation ID:", conversationId);
    console.log("Test Types:", testTypes);
    console.log("Question Count:", questionCount);

    // Validate inputs
    if (!conversationId || !testTypes || testTypes.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (questionCount < 5 || questionCount > 50) {
      return new Response(
        JSON.stringify({ error: "Question count must be between 5 and 50" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create a placeholder test immediately
    const placeholderTestId = await convex.mutation(api.tests.createPlaceholder, {
      conversationId: conversationId as Id<"conversations">,
      title: "Generating test...",
      questionCount,
    });

    console.log("✓ Placeholder test created:", placeholderTestId);

    // Return immediately with the placeholder test ID
    // The generation will continue in the background
    const response = new Response(
      JSON.stringify({
        testId: placeholderTestId,
        isGenerating: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );

    // Continue generation in background (don't await)
    (async () => {
      try {
        await generateTestInBackground(
          conversationId as Id<"conversations">,
          placeholderTestId as Id<"tests">,
          testTypes,
          questionCount,
          startTime
        );
      } catch (error) {
        console.error("Background test generation failed:", error);
      }
    })();

    return response;
  } catch (error) {
    console.error("Generate Test API Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Track failed LLM call in PostHog
    await trackLLMCallServer({
      model: "unknown",
      provider: "openrouter",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      latencyMs: 0,
      success: false,
      errorMessage,
    });

    // Track failed LLM call in Convex
    try {
      await convex.mutation(api.aiTracking.track, {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        model: "unknown",
        provider: "unknown",
        usageType: "test_creation",
        costUsd: 0,
        costPhp: 0,
        success: false,
        errorMessage,
      });
    } catch (trackError) {
      console.error("Failed to track error in Convex:", trackError);
    }

    return new Response(
      JSON.stringify({
        error: "Failed to generate test",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
