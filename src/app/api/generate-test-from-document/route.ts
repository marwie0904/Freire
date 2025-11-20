import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { trackAIUsage } from "@/lib/tracking-helper";

// Allow API calls up to 60 seconds
export const maxDuration = 60;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const testFormat = formData.get("testFormat") as string;
    const questionCount = parseInt(formData.get("questionCount") as string);

    console.log("=== Generate Test from Document API Request ===");
    console.log("Files count:", files.length);
    console.log("Test Format:", testFormat);
    console.log("Question Count:", questionCount);

    // Define supported file types
    const SUPPORTED_TYPES = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/m4a",
      "audio/webm",
    ];

    // Validate inputs
    if (!files || files.length === 0) {
      return new Response(
        JSON.stringify({ error: "No files uploaded" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate file types
    for (const file of files) {
      if (!SUPPORTED_TYPES.includes(file.type)) {
        return new Response(
          JSON.stringify({
            error: `File type not supported: ${file.type}`,
            details: `Supported file types: PDF, Images (PNG, JPG, WEBP, GIF), Audio (MP3, WAV, M4A, WEBM)`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (!testFormat || !["multiple_choice", "flashcard"].includes(testFormat)) {
      return new Response(
        JSON.stringify({ error: "Invalid test format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (questionCount < 5 || questionCount > 50) {
      return new Response(
        JSON.stringify({ error: "Question count must be between 5 and 50" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 1: Upload files to Convex storage and get URLs
    console.log("Uploading files to Convex storage...");
    const fileUrls: string[] = [];
    const fileTypes: string[] = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();

      // Generate upload URL
      const uploadUrl = await convex.mutation(api.messageFiles.generateUploadUrl);

      // Upload the file
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: arrayBuffer,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload file: ${file.name}`);
      }

      // Get storage ID from response
      const { storageId } = await uploadResponse.json();

      // Get the file URL
      const fileUrl = await convex.query(api.messageFiles.getUrl, {
        storageId,
      });

      if (!fileUrl) {
        throw new Error(`Failed to get URL for file: ${file.name}`);
      }

      fileUrls.push(fileUrl);
      fileTypes.push(file.type);
    }

    console.log("Files uploaded successfully");

    // Step 2: Extract file context using Gemini 2.5 Flash-Lite
    console.log("Extracting file content with Gemini 2.5 Flash-Lite...");

    const userPrompt = `Generate a ${testFormat === "multiple_choice" ? "multiple choice" : "flashcard"} test with ${questionCount} questions`;

    const geminiStartTime = Date.now();
    const geminiResult = await convex.action(api.gemini.extractFileContext, {
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
      const { calculateLLMCost } = await import("@/lib/analytics/llm-tracking");
      const { usdToPhp } = await import("@/lib/currency");

      const geminiCostUsd = calculateLLMCost(
        "google/gemini-2.5-flash-lite",
        geminiUsage.inputTokens,
        geminiUsage.outputTokens
      );

      await convex.mutation(api.aiTracking.track, {
        inputTokens: geminiUsage.inputTokens,
        outputTokens: geminiUsage.outputTokens,
        totalTokens: geminiUsage.totalTokens,
        model: "google/gemini-2.5-flash-lite",
        provider: "google",
        usageType: "file_analysis",
        costUsd: geminiCostUsd,
        costPhp: usdToPhp(geminiCostUsd),
        latencyMs: geminiLatencyMs,
        success: true,
      });

      console.log("✅ Gemini usage tracked:", {
        inputTokens: geminiUsage.inputTokens,
        outputTokens: geminiUsage.outputTokens,
        totalTokens: geminiUsage.totalTokens,
        costUsd: geminiCostUsd,
        costPhp: usdToPhp(geminiCostUsd),
      });
    }

    if (!extractedContext || extractedContext.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Failed to extract content from files" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
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

    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    let testData;

    try {
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
      console.log("120B Full response length:", result.text.length);

      // Extract and parse JSON (handles markdown code blocks and other formats)
      testData = extractJSON(result.text);

      console.log("✓ Test generated successfully, questions:", testData.questions?.length);

      // Track successful usage
      const latencyMs = Date.now() - startTime;
      const inputTokens = (result.usage as any)?.promptTokens || 0;
      const outputTokens = (result.usage as any)?.completionTokens || 0;

      await trackAIUsage({
        model: "openai/gpt-oss-120b",
        inputTokens,
        outputTokens,
        usageType: "file_analysis",
        latencyMs,
        success: true,
      });
    } catch (error) {
      const lastError = error as Error;
      console.log("✗ Test generation failed:", lastError.message);

      // Track failed usage
      const latencyMs = Date.now() - startTime;
      await trackAIUsage({
        model: "openai/gpt-oss-120b",
        inputTokens: 0,
        outputTokens: 0,
        usageType: "file_analysis",
        latencyMs,
        success: false,
        errorMessage: lastError.message,
      });

      return new Response(
        JSON.stringify({
          error: "Test creation failed",
          details: lastError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate the test data structure
    if (
      !testData ||
      !testData.title ||
      !Array.isArray(testData.questions) ||
      testData.questions.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid test data structure returned" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Ensure all questions have IDs
    testData.questions = testData.questions.map((q: any, index: number) => ({
      ...q,
      id: q.id || `q${index + 1}`,
    }));

    // Create a temporary conversation for this test
    const conversationId = await convex.mutation(api.conversations.create, {
      title: `Document Test: ${testData.title}`,
    });

    // Save test to Convex
    const testId = await convex.mutation(api.tests.create, {
      conversationId: conversationId as Id<"conversations">,
      title: testData.title,
      questions: testData.questions,
    });

    console.log("✓ Test saved to Convex:", testId);

    // Return the test data
    return new Response(
      JSON.stringify({
        testId,
        test: testData,
        modelUsed: "gpt-oss-120b",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Generate Test from Document API Error:", error);

    // Track failed request
    const latencyMs = Date.now() - startTime;
    await trackAIUsage({
      model: "openai/gpt-oss-120b",
      inputTokens: 0,
      outputTokens: 0,
      usageType: "file_analysis",
      latencyMs,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return new Response(
      JSON.stringify({
        error: "Failed to generate test from document",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
