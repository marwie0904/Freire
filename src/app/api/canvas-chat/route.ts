import { streamText, convertToModelMessages } from "ai";
import { createCerebras } from "@ai-sdk/cerebras";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { trackLLMCallServer, calculateLLMCost } from "@/lib/analytics/llm-tracking";
import { usdToPhp } from "@/lib/currency";
import { getProviderForModel } from "@/lib/provider-helper";

export const maxDuration = 30;

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const startTime = Date.now();
  let modelName = "openai/gpt-oss-20b"; // Default model

  try {
    const { message, cardId, canvasId, model } = await req.json();

    if (!message || !cardId || !canvasId) {
      return Response.json({ error: "Missing message, cardId, or canvasId" }, { status: 400 });
    }

    // Default to Cerebras GPT-OSS 120b (FREIRE FAST)
    const defaultModel = "cerebras/gpt-oss-120b";
    modelName = model || defaultModel;

    // Get provider type for model
    const getProviderType = (modelName: string): "cerebras" | "deepinfra" | "disabled" => {
      if (modelName === "openai/gpt-oss-20b") return "deepinfra"; // FREIRE LITE
      if (modelName === "cerebras/gpt-oss-120b") return "cerebras"; // FREIRE FAST
      if (modelName === "openai/gpt-oss-120b") return "disabled"; // FREIRE (original) - disabled
      return "cerebras"; // Default to Cerebras
    };

    const providerType = getProviderType(modelName);

    // Block disabled models
    if (providerType === "disabled") {
      return Response.json(
        {
          error: "This model is currently unavailable",
          details: "Please select FREIRE LITE or FREIRE FAST",
        },
        { status: 400 }
      );
    }

    // Get all cards for this canvas
    const cards = await convex.query(api.canvasCards.list, {
      canvasId: canvasId as Id<"canvases">
    });

    const currentCard = cards?.find((c: any) => c._id === cardId);
    if (!currentCard) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }

    const conversationHistory = currentCard.conversationHistory || [];

    // Build messages for AI with system prompt
    const messages = [
      {
        role: "system" as const,
        content: "You are a helpful AI assistant. Answer questions concisely and accurately.",
      },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: "user" as const,
        content: message,
      },
    ];

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

    // Store token usage to send at the end (captured from onFinish)
    let tokenUsageData: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;

    // Use streamText for streaming response
    const result = await streamText({
      model: selectedModel,
      messages,
      temperature: 0.7,
      async onFinish({ usage }) {
        console.log("✅ Generation complete, tracking usage...");

        const latencyMs = Date.now() - startTime;

        if (usage) {
          const usageData = usage as any;
          const promptToks = usageData?.promptTokens ?? 0;
          const completionToks = usageData?.completionTokens ?? 0;
          const totalToks = usageData?.totalTokens ?? (promptToks + completionToks);
          const costUsd = calculateLLMCost(modelName, promptToks, completionToks);

          console.log("💰 Cost Calculation:", {
            modelName,
            promptToks,
            completionToks,
            costUsd,
            costPhp: usdToPhp(costUsd),
          });

          // Store token usage to send in stream
          tokenUsageData = {
            promptTokens: promptToks,
            completionTokens: completionToks,
            totalTokens: totalToks,
          };

          // Track in PostHog
          await trackLLMCallServer({
            model: modelName,
            provider: providerType,
            promptTokens: promptToks,
            completionTokens: completionToks,
            totalTokens: totalToks,
            cost: costUsd,
            latencyMs,
            success: true,
          });

          // Track in Convex aiTracking table
          await convex.mutation(api.aiTracking.track, {
            inputTokens: promptToks,
            outputTokens: completionToks,
            totalTokens: totalToks,
            model: modelName,
            provider: getProviderForModel(modelName),
            usageType: "canvas",
            costUsd,
            costPhp: usdToPhp(costUsd),
            canvasId: canvasId as Id<"canvases">,
            latencyMs,
            success: true,
          });

          console.log("✅ Canvas tracking successful:", {
            inputTokens: promptToks,
            outputTokens: completionToks,
            latencyMs,
          });
        }
      },
    });

    // Use TransformStream to convert AI SDK stream to our format
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Stream chunks in background
    (async () => {
      try {
        for await (const chunk of result.textStream) {
          // Stream text chunks in AI SDK format: 0:"text"
          await writer.write(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
        }

        // Wait for onFinish to populate tokenUsageData
        await new Promise(resolve => setTimeout(resolve, 200));

        // Send token usage as final metadata chunk (captured from onFinish)
        if (tokenUsageData) {
          console.log("📤 Sending token usage to client:", tokenUsageData);
          await writer.write(encoder.encode(`e:${JSON.stringify({ tokenUsage: tokenUsageData })}\n`));
        }

        await writer.close();
      } catch (error) {
        console.error("❌ Stream error:", error);
        await writer.abort(error);
      }
    })();

    // Return streaming response
    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Canvas chat error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Track failed LLM call in PostHog
    await trackLLMCallServer({
      model: modelName || "cerebras/gpt-oss-120b",
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
        model: modelName || "cerebras/gpt-oss-120b",
        provider: getProviderForModel(modelName || "cerebras/gpt-oss-120b"),
        usageType: "canvas",
        costUsd: 0,
        costPhp: 0,
        success: false,
        errorMessage,
      });
    } catch (trackError) {
      console.error("Failed to track error in Convex:", trackError);
    }

    return Response.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
