import { streamText, convertToModelMessages } from "ai";
import { createCerebras } from "@ai-sdk/cerebras";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { trackLLMCallServer, calculateLLMCost } from "@/lib/analytics/llm-tracking";
import { usdToPhp } from "@/lib/currency";
import { getProviderForModel } from "@/lib/provider-helper";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Helper function to convert UIMessages to CoreMessages
function convertMessages(messages: any[]) {
  return messages.map((msg: any) => {
    // If message has parts (UIMessage format), extract text content
    if (msg.parts) {
      const textContent = msg.parts
        .filter((part: any) => part.type === "text" && part.text)
        .map((part: any) => part.text)
        .join("");

      return {
        role: msg.role,
        content: textContent,
      };
    }

    // Already in CoreMessage format
    return {
      role: msg.role,
      content: msg.content,
    };
  });
}

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const { selectedText, conversationContext, userQuestion, model } =
      await req.json();

    console.log("=== Highlight Chat API Request ===");
    console.log("Model:", model);
    console.log("Selected text:", selectedText);
    console.log("User question:", userQuestion);

    // Convert conversation context to CoreMessages
    const contextMessages = convertMessages(conversationContext);

    // Build the prompt with context
    const systemPrompt = `You are an AI assistant helping to answer questions about specific text from a conversation. Here is the full conversation context for reference:

${contextMessages.map((msg) => `${msg.role}: ${msg.content}`).join("\n\n")}

---

The user has highlighted the following text and has a question about it:

HIGHLIGHTED TEXT:
"""
${selectedText}
"""

Please answer their question concisely and accurately. If you don't know something, be honest about it.`;

    // Create messages array for the AI
    const messages = [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: userQuestion,
      },
    ];

    console.log("Messages being sent to AI:", JSON.stringify(messages, null, 2));

    // Default to Cerebras GPT-OSS 120b (FREIRE FAST)
    const defaultModel = "cerebras/gpt-oss-120b";

    // Get provider type for model
    const getProviderType = (modelName: string): "cerebras" | "deepinfra" | "disabled" => {
      if (modelName === "openai/gpt-oss-20b") return "deepinfra"; // FREIRE LITE
      if (modelName === "cerebras/gpt-oss-120b") return "cerebras"; // FREIRE FAST
      if (modelName === "openai/gpt-oss-120b") return "disabled"; // FREIRE (original) - disabled
      return "cerebras"; // Default to Cerebras
    };

    const providerType = getProviderType(model || defaultModel);

    // Block disabled models
    if (providerType === "disabled") {
      return new Response(
        JSON.stringify({
          error: "This model is currently unavailable",
          details: "Please select FREIRE LITE or FREIRE FAST",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Initialize providers
    const cerebras = createCerebras({
      apiKey: process.env.CEREBRAS_API_KEY,
    });

    const deepinfra = createDeepInfra({
      apiKey: process.env.DEEPINFRA_API_KEY,
    });

    // Select model based on provider
    console.log("🔧 [Provider] Using provider:", providerType);
    let selectedModel;
    if (providerType === "deepinfra") {
      // FREIRE LITE - DeepInfra GPT-OSS 20B
      selectedModel = deepinfra("openai/gpt-oss-20b");
      console.log("🔧 [Model] Using DeepInfra with openai/gpt-oss-20b");
    } else {
      // FREIRE FAST - Cerebras GPT-OSS 120B (default)
      selectedModel = cerebras("gpt-oss-120b");
      console.log("🔧 [Model] Using Cerebras with gpt-oss-120b");
    }

    // Stream the response with onFinish callback for tracking
    const result = await streamText({
      model: selectedModel,
      messages: messages,
      temperature: 0.7,
      async onFinish({ usage }) {
        console.log("✅ Generation complete, tracking usage...");

        if (usage) {
          const usageData = usage as any;
          const promptToks = usageData?.promptTokens ?? 0;
          const completionToks = usageData?.completionTokens ?? 0;
          const totalToks = usageData?.totalTokens ?? (promptToks + completionToks);
          const modelName = model || defaultModel;
          const costUsd = calculateLLMCost(modelName, promptToks, completionToks);
          const costPhp = usdToPhp(costUsd);

          console.log("💰 [Cost Tracking] Model:", modelName);
          console.log("💰 [Cost Tracking] Tokens:", { promptToks, completionToks, totalToks });
          console.log("💰 [Cost Tracking] Cost USD:", costUsd);
          console.log("💰 [Cost Tracking] Cost PHP:", costPhp);

          // Track in PostHog
          await trackLLMCallServer({
            model: modelName,
            provider: providerType,
            promptTokens: promptToks,
            completionTokens: completionToks,
            totalTokens: totalToks,
            cost: costUsd,
            latencyMs: Date.now() - startTime,
            success: true,
          });

          // Track in Convex aiTracking table
          await convex.mutation(api.aiTracking.track, {
            inputTokens: promptToks,
            outputTokens: completionToks,
            totalTokens: totalToks,
            model: modelName,
            provider: getProviderForModel(modelName),
            usageType: "quick_question",
            costUsd,
            costPhp,
            latencyMs: Date.now() - startTime,
            success: true,
          });

          console.log("✅ Quick question tracking successful:", {
            inputTokens: promptToks,
            outputTokens: completionToks,
            latencyMs: Date.now() - startTime,
          });
        }
      },
    });

    // Return plain text stream for frontend (highlight chat expects raw text)
    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const textPart of result.textStream) {
            controller.enqueue(encoder.encode(textPart));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error("Highlight Chat API Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Track failed LLM call in PostHog
    await trackLLMCallServer({
      model: "unknown",
      provider: "unknown",
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
        usageType: "quick_question",
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
        error: "Failed to process highlight chat request",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
