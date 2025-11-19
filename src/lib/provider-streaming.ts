/**
 * Provider-specific streaming implementations for chat completions
 * Supports DeepInfra, GMI Cloud, and Cerebras
 */

import Cerebras from "@cerebras/cerebras_cloud_sdk";

export type ProviderType = "deepinfra" | "gmi" | "cerebras";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
}

export interface CompletionResult {
  text: string;
  reasoning?: string;
  usage: TokenUsage;
}

export interface StreamCallbacks {
  onText?: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onFinish?: (result: CompletionResult) => void;
}

/**
 * Complete chat using DeepInfra (OpenAI-compatible API)
 */
export async function completeDeepInfra(
  messages: any[],
  apiKey: string,
  temperature: number = 0.7
): Promise<CompletionResult> {
  console.log("🔷 [DeepInfra] Starting completion...");

  const response = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages,
      stream: false,
      temperature,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ [DeepInfra] API error:", errorText);
    throw new Error(`DeepInfra API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices[0].message;

  console.log("✅ [DeepInfra] Completion successful");

  return {
    text: message.content || "",
    reasoning: undefined, // DeepInfra doesn't support reasoning tokens
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

/**
 * Stream chat completion from GMI Cloud
 */
export async function streamGMICloud(
  messages: any[],
  apiKey: string,
  temperature: number = 0.7
): Promise<CompletionResult> {
  const response = await fetch("https://api.gmi-serving.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages,
      stream: false, // For now, use non-streaming to simplify
      temperature,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GMI Cloud API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices[0].message;

  return {
    text: message.content,
    reasoning: message.reasoning_content, // GMI Cloud uses reasoning_content
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

/**
 * Stream chat completion from Cerebras
 */
export async function streamCerebras(
  messages: any[],
  apiKey: string,
  temperature: number = 0.7
): Promise<CompletionResult> {
  const cerebras = new Cerebras({
    apiKey,
  });

  const completion = await cerebras.chat.completions.create({
    model: "gpt-oss-120b",
    messages,
    stream: false, // For now, use non-streaming to simplify
    temperature,
    max_completion_tokens: 2000,
  });

  const message = completion.choices[0].message;

  return {
    text: message.content || "",
    reasoning: (message as any).reasoning, // Cerebras uses reasoning field
    usage: {
      promptTokens: completion.usage?.prompt_tokens || 0,
      completionTokens: completion.usage?.completion_tokens || 0,
      totalTokens: completion.usage?.total_tokens || 0,
    },
  };
}

/**
 * Route to appropriate provider based on model selection
 */
export async function streamCompletion(
  provider: ProviderType,
  messages: any[],
  apiKeys: {
    deepinfra?: string;
    gmi?: string;
    cerebras?: string;
  },
  temperature: number = 0.7
): Promise<CompletionResult> {
  switch (provider) {
    case "deepinfra":
      if (!apiKeys.deepinfra) throw new Error("DeepInfra API key not configured");
      return completeDeepInfra(messages, apiKeys.deepinfra, temperature);

    case "gmi":
      if (!apiKeys.gmi) throw new Error("GMI Cloud API key not configured");
      return streamGMICloud(messages, apiKeys.gmi, temperature);

    case "cerebras":
      if (!apiKeys.cerebras) throw new Error("Cerebras API key not configured");
      return streamCerebras(messages, apiKeys.cerebras, temperature);

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
