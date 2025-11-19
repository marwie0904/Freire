/**
 * Get the direct provider name for a given model
 * All models use AI SDK for consistent streaming
 */
export function getProviderForModel(modelName: string): string {
  const providerMap: Record<string, string> = {
    // FREIRE LITE - DeepInfra GPT-OSS 20B (AI SDK)
    "openai/gpt-oss-20b": "deepinfra",

    // FREIRE - Disabled
    "openai/gpt-oss-120b": "disabled",

    // FREIRE FAST - Cerebras GPT-OSS 120B (AI SDK)
    "cerebras/gpt-oss-120b": "cerebras",

    // FREIRE PRO - GMI Cloud GPT-OSS 120B
    "gmi/gpt-oss-120b": "gmi",

    // FREIRE PLUS - Disabled
    "moonshotai/kimi-k2-thinking": "disabled",
    "kimi/k2-thinking": "disabled",
  };

  return providerMap[modelName] || "unknown";
}
