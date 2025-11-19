import { posthog } from './posthog'

export interface LLMTrackingData {
  model: string
  provider: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
  latencyMs: number
  userId?: string
  conversationId?: string
  messageId?: string
  reasoningLevel?: string
  toolsUsed?: string[]
  success: boolean
  errorMessage?: string
  totalRetryAttempts?: number
  failedRetryAttempts?: number
  successfulRetryAttempts?: number
}

/**
 * Track LLM API calls with usage, cost, and performance metrics
 * Uses PostHog's LLM Analytics format with $ai_generation events
 */
export function trackLLMCall(data: LLMTrackingData) {
  if (!posthog) return

  // Generate unique IDs for trace and span
  const traceId = data.conversationId || `trace_${Date.now()}_${Math.random().toString(36).substring(7)}`
  const spanId = data.messageId || `span_${Date.now()}_${Math.random().toString(36).substring(7)}`

  posthog.capture('$ai_generation', {
    // Required LLM Analytics properties
    $ai_model: data.model,
    $ai_provider: data.provider,
    $ai_input_tokens: data.promptTokens,
    $ai_output_tokens: data.completionTokens,
    $ai_total_tokens: data.totalTokens,
    $ai_trace_id: traceId,
    $ai_span_id: spanId,

    // Optional cost and performance metrics
    $ai_total_cost_usd: data.cost,
    $ai_latency_ms: data.latencyMs,

    // Custom properties for additional context
    conversation_id: data.conversationId,
    message_id: data.messageId,
    reasoning_level: data.reasoningLevel,
    tools_used: data.toolsUsed,
    success: data.success,
    error_message: data.errorMessage,
    total_retry_attempts: data.totalRetryAttempts,
    failed_retry_attempts: data.failedRetryAttempts,
    successful_retry_attempts: data.successfulRetryAttempts,
  })
}

/**
 * Calculate estimated cost based on model and token usage
 * Using direct provider pricing (DeepInfra, Cerebras, Google)
 */
export function calculateLLMCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Pricing per million tokens (as of 2025)
  // Using specific provider pricing for better cost accuracy
  const pricing: Record<string, { prompt: number; completion: number }> = {
    'openai/gpt-oss-20b': {
      prompt: 0.04,  // hyperbolic provider
      completion: 0.04,
    },
    'openai/gpt-oss-120b': {
      prompt: 0.05,  // gmicloud/fp4 provider
      completion: 0.25,
    },
    'cerebras/gpt-oss-120b': {
      prompt: 0,  // Cerebras is currently free
      completion: 0,
    },
    'gmi/gpt-oss-120b': {
      prompt: 0.05,  // GMI Cloud pricing
      completion: 0.25,
    },
    'moonshotai/kimi-k2-thinking': {
      prompt: 0.55,  // chutes/int4 provider (main), fireworks fallback is $0.60/$2.50
      completion: 2.25,
    },
    'nousresearch/hermes-3-llama-3.1-405b:extended': {
      prompt: 1.0,
      completion: 1.0,
    },
    'meta-llama/llama-3.3-70b-instruct': {
      prompt: 0.25,
      completion: 0.25,
    },
    'deepseek/deepseek-chat': {
      prompt: 0.14,
      completion: 0.28,
    },
    'google/gemini-2.0-flash-exp:free': {
      prompt: 0,
      completion: 0,
    },
    'google/gemini-flash-1.5': {
      prompt: 0.075,
      completion: 0.3,
    },
    'google/gemini-2.5-flash-lite': {
      prompt: 0.0015,  // $0.0015 per 1M tokens
      completion: 0.006,  // $0.006 per 1M tokens
    },
  }

  const modelPricing = pricing[model] || { prompt: 0, completion: 0 }

  const promptCost = (promptTokens / 1_000_000) * modelPricing.prompt
  const completionCost = (completionTokens / 1_000_000) * modelPricing.completion

  return promptCost + completionCost
}

/**
 * Server-side LLM tracking using PostHog Node SDK
 * Uses PostHog's LLM Analytics format with $ai_generation events
 */
export async function trackLLMCallServer(data: LLMTrackingData) {
  // Check if server-side API key is configured
  if (!process.env.POSTHOG_API_KEY) {
    console.warn('POSTHOG_API_KEY not configured. Server-side LLM tracking disabled.')
    console.warn('Get a Personal API Key from: https://us.posthog.com/settings/user-api-keys')
    return
  }

  try {
    const { PostHog } = await import('posthog-node')
    const posthogServer = new PostHog(process.env.POSTHOG_API_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    })

    // Generate unique IDs for trace and span
    const traceId = data.conversationId || `trace_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const spanId = data.messageId || `span_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Capture using PostHog's LLM Analytics format
    posthogServer.capture({
      distinctId: data.userId || 'anonymous',
      event: '$ai_generation', // PostHog LLM Analytics requires this event name
      properties: {
        // Required LLM Analytics properties
        $ai_model: data.model,
        $ai_provider: data.provider,
        $ai_input_tokens: data.promptTokens,
        $ai_output_tokens: data.completionTokens,
        $ai_total_tokens: data.totalTokens,
        $ai_trace_id: traceId,
        $ai_span_id: spanId,

        // Optional cost and performance metrics
        $ai_total_cost_usd: data.cost,
        $ai_latency_ms: data.latencyMs,

        // Custom properties for additional context
        conversation_id: data.conversationId,
        message_id: data.messageId,
        reasoning_level: data.reasoningLevel,
        tools_used: data.toolsUsed,
        success: data.success,
        error_message: data.errorMessage,
        total_retry_attempts: data.totalRetryAttempts,
        failed_retry_attempts: data.failedRetryAttempts,
        successful_retry_attempts: data.successfulRetryAttempts,
      },
    })

    await posthogServer.shutdown()
  } catch (error) {
    // Log the error but don't crash the application
    if (error instanceof Error) {
      console.error('Failed to track LLM call (server-side):', error.message)
      console.warn('Please verify POSTHOG_API_KEY is a valid Personal API Key from:')
      console.warn('https://us.posthog.com/settings/user-api-keys')
    } else {
      console.error('Failed to track LLM call:', error)
    }
  }
}
