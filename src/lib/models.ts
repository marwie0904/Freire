/**
 * Centralized model configuration
 * Maps display names to actual model identifiers
 */

export interface ModelOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

// Actual models used by the application
export const ACTUAL_MODELS = {
  GPT_OSS_20B: "openai/gpt-oss-20b",
  GPT_OSS_120B: "openai/gpt-oss-120b",
  GPT_OSS_120B_FAST: "cerebras/gpt-oss-120b",
  KIMI_K2_THINKING: "moonshotai/kimi-k2-thinking",
} as const;

// Model options displayed in the UI
// Multiple display options can map to the same actual model
export const MODEL_OPTIONS: ModelOption[] = [
  {
    value: ACTUAL_MODELS.GPT_OSS_20B,
    label: "FREIRE LITE",
    description: "Temporarily Unavailable - Tool Calling Issues",
    disabled: true, // DISABLED: GPT-OSS-20B has known tool calling bugs - see deepinfra-web-search.ts for details
  },
  {
    value: ACTUAL_MODELS.GPT_OSS_120B,
    label: "FREIRE",
    description: "Currently Unavailable",
    disabled: true,
  },
  {
    value: ACTUAL_MODELS.GPT_OSS_120B_FAST,
    label: "FREIRE FAST",
    description: "Accurate & fast - best for power users",
    disabled: false,
  },
  {
    value: ACTUAL_MODELS.KIMI_K2_THINKING,
    label: "FREIRE PLUS",
    description: "Currently Unavailable",
    disabled: true,
  },
];

// Default model if none is selected
// Changed from GPT_OSS_20B to GPT_OSS_120B_FAST due to tool calling issues with 20B model
export const DEFAULT_MODEL = ACTUAL_MODELS.GPT_OSS_120B_FAST;
