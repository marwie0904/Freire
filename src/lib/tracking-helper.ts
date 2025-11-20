import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { calculateLLMCost, trackLLMCallServer } from "./analytics/llm-tracking";
import { usdToPhp } from "./currency";

interface TrackingData {
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  usageType: "conversation" | "project" | "quick_question" | "canvas" | "title_generation" | "file_analysis" | "test_creation";
  conversationId?: Id<"conversations">;
  canvasId?: Id<"canvases">;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  convex?: ConvexHttpClient;
}

export async function trackAIUsage(data: TrackingData) {
  const totalTokens = data.inputTokens + data.outputTokens + (data.reasoningTokens || 0);
  const cost = calculateLLMCost(data.model, data.inputTokens, data.outputTokens);

  // Track in PostHog
  await trackLLMCallServer({
    model: data.model,
    provider: "openrouter",
    promptTokens: data.inputTokens,
    completionTokens: data.outputTokens,
    totalTokens,
    cost,
    latencyMs: data.latencyMs,
    conversationId: data.conversationId as string | undefined,
    success: data.success,
    errorMessage: data.errorMessage,
  });

  // Track in Convex (only if convex client is provided)
  if (data.convex) {
    try {
      await data.convex.mutation(api.aiTracking.track, {
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      reasoningTokens: data.reasoningTokens,
      totalTokens,
      model: data.model,
      usageType: data.usageType,
      costUsd: cost,
      costPhp: usdToPhp(cost),
      conversationId: data.conversationId,
      canvasId: data.canvasId,
      latencyMs: data.latencyMs,
      success: data.success,
      errorMessage: data.errorMessage,
      });
      console.log("✅ AI usage tracked in Convex");
    } catch (error) {
      console.error("Failed to track AI usage in Convex:", error);
    }
  }
}
