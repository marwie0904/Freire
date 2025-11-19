import { streamText, convertToModelMessages } from "ai";
import { createCerebras } from "@ai-sdk/cerebras";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { trackLLMCallServer, calculateLLMCost } from "@/lib/analytics/llm-tracking";
import { usdToPhp } from "@/lib/currency";
import { getProviderForModel } from "@/lib/provider-helper";
import { chatWithCerebrasWebSearch } from "@/lib/cerebras-web-search";

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
  try {
    const { messages, model, conversationId, attachments } = await req.json();

    console.log("=== API Request ===");
    console.log("Model:", model);
    console.log("Conversation ID:", conversationId);
    console.log("Attachments:", attachments);

    // Convert UIMessages to CoreMessages
    let coreMessages;
    try {
      // Try AI SDK converter first
      coreMessages = convertToModelMessages(messages);
    } catch (error) {
      // Fall back to custom converter
      console.log("Using custom message converter");
      coreMessages = convertMessages(messages);
    }

    console.log("Messages after conversion:", JSON.stringify(coreMessages, null, 2));

    // Process file attachments with Gemini if present
    if (attachments && attachments.length > 0) {
      console.log("Processing file attachments with Gemini...");

      try {
        // Get file URLs from Convex storage
        const fileUrls: string[] = [];
        const fileTypes: string[] = [];

        for (const attachment of attachments) {
          const url = await convex.query(api.messageFiles.getUrl, {
            storageId: attachment.storageId,
          });
          if (url) {
            fileUrls.push(url);
            fileTypes.push(attachment.fileType);
          }
        }

        // Get the user's original message
        const lastMessage = coreMessages[coreMessages.length - 1];
        const userPrompt = lastMessage.content as string;

        // Extract context from files using Gemini
        const geminiStartTime = Date.now();
        const geminiResult = await convex.action(api.gemini.extractFileContext, {
          fileUrls,
          fileTypes,
          userPrompt,
        });

        const geminiContext = geminiResult.context;
        const geminiUsage = geminiResult.usage;

        console.log("Gemini context extracted successfully");

        // Track Gemini usage
        if (geminiUsage) {
          const geminiLatencyMs = Date.now() - geminiStartTime;
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
            conversationId: conversationId as Id<"conversations">,
            latencyMs: geminiLatencyMs,
            success: true,
          });
        }

        // Combine user message with Gemini context
        const combinedMessage = `${userPrompt}\n\n[File Context]\n${geminiContext}`;

        // Update the last message with combined content
        coreMessages = [
          ...coreMessages.slice(0, -1),
          {
            role: lastMessage.role,
            content: combinedMessage,
          },
        ];

        console.log("Combined message created with file context");
      } catch (error) {
        console.error("Failed to process file attachments:", error);
        // Continue without file context if Gemini processing fails
      }
    }

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

    // Get the last user message for saving
    const lastUserMessage = messages[messages.length - 1];
    const userMessageContent =
      typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : lastUserMessage.content;

    const startTime = Date.now();

    // Save user message BEFORE streaming
    if (conversationId) {
      console.log("💾 Saving user message to Convex...");
      await convex.mutation(api.messages.send, {
        conversationId: conversationId as Id<"conversations">,
        content: userMessageContent,
        role: "user",
        attachments: attachments || undefined,
      });
      console.log("✅ User message saved");
    }

    // Check if user is requesting web search and using Cerebras
    const isWebSearchRequest = userMessageContent.toLowerCase().includes('web search') ||
                               userMessageContent.toLowerCase().includes('search for') ||
                               userMessageContent.toLowerCase().includes('look up') ||
                               userMessageContent.toLowerCase().includes('current') ||
                               userMessageContent.toLowerCase().includes('latest') ||
                               userMessageContent.toLowerCase().includes('recent');
    const useWebSearch = isWebSearchRequest && providerType === "cerebras";

    if (useWebSearch) {
      console.log("🔍 [Web Search] Detected web search request with Cerebras, using tool calling");

      // Use Cerebras SDK for tool calling (non-streaming)
      const cerebrasResult = await chatWithCerebrasWebSearch(
        coreMessages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        })),
        {
          temperature: 0.3,
          maxTokens: 2000,
          maxIterations: 4,
          maxToolCalls: 1
        }
      );

      const text = cerebrasResult.content;
      console.log('🔍 [API] Cerebras result content type:', typeof text);
      console.log('🔍 [API] Cerebras result content preview:', text?.substring(0, 200));

      const usage = {
        promptTokens: cerebrasResult.usage.promptTokens,
        completionTokens: cerebrasResult.usage.completionTokens,
        totalTokens: cerebrasResult.usage.totalTokens
      };

      // Save assistant message to Convex with search metadata
      if (conversationId && text) {
        await convex.mutation(api.messages.create, {
          conversationId: conversationId as Id<"conversations">,
          content: text,
          role: "assistant",
          tokenUsage: usage,
          searchMetadata: cerebrasResult.searchMetadata,
        });

        // Generate title if first exchange
        const conversation = await convex.query(api.conversations.get, {
          conversationId: conversationId as Id<"conversations">,
        });

        if (conversation && conversation.messageCount === 2) {
          convex
            .action(api.openai.generateTitle, {
              conversationId: conversationId as Id<"conversations">,
            })
            .catch((err) => console.error("Title generation failed:", err));
        }
      }

      // Track analytics
      if (conversationId) {
        const costUsd = calculateLLMCost(model || defaultModel, usage.promptTokens, usage.completionTokens);

        await trackLLMCallServer({
          model: model || defaultModel,
          provider: providerType,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          cost: costUsd,
          latencyMs: Date.now() - startTime,
          conversationId: conversationId as string,
          success: true,
          toolsUsed: cerebrasResult.toolCalls > 0 ? ['webSearch'] : undefined
        });

        await convex.mutation(api.aiTracking.track, {
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          model: model || defaultModel,
          provider: getProviderForModel(model || defaultModel),
          usageType: "conversation",
          costUsd,
          costPhp: usdToPhp(costUsd),
          conversationId: conversationId as Id<"conversations">,
          latencyMs: Date.now() - startTime,
          success: true,
        });
      }

      // Return the response as a formatted stream
      const encoder = new TextEncoder();
      const formattedResponse = `0:${JSON.stringify(text)}\n`;
      console.log('📤 [API] Sending formatted response, length:', formattedResponse.length);
      console.log('📤 [API] Response preview:', formattedResponse.substring(0, 200));

      const customStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(formattedResponse));
          controller.close();
        },
      });

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // Simple streaming without tools (for non-web search or DeepInfra)
    const result = await streamText({
      model: selectedModel,
      messages: coreMessages,
      temperature: 0.7,
      async onFinish({ text, usage }) {
        console.log("✅ Generation complete, saving to Convex...");
        console.log("📊 Final text length:", text?.length || 0);

        if (conversationId && text) {
          // Extract token data from usage
          const usageData = usage as any;
          const promptTokens = usageData?.promptTokens ?? 0;
          const completionTokens = usageData?.completionTokens ?? 0;
          const totalTokens = usageData?.totalTokens ?? (promptTokens + completionTokens);

          await convex.mutation(api.messages.create, {
            conversationId: conversationId as Id<"conversations">,
            content: text,
            role: "assistant",
            tokenUsage: {
              promptTokens,
              completionTokens,
              totalTokens,
            },
          });

          // Generate title if first exchange
          const conversation = await convex.query(api.conversations.get, {
            conversationId: conversationId as Id<"conversations">,
          });

          if (conversation && conversation.messageCount === 2) {
            convex
              .action(api.openai.generateTitle, {
                conversationId: conversationId as Id<"conversations">,
              })
              .catch((err) => console.error("Title generation failed:", err));
          }
        }

        if (usage && conversationId) {
          const usageData = usage as any;
          const promptToks = usageData?.promptTokens ?? 0;
          const completionToks = usageData?.completionTokens ?? 0;
          const totalToks = usageData?.totalTokens ?? (promptToks + completionToks);
          const costUsd = calculateLLMCost(model || defaultModel, promptToks, completionToks);

          // Track in PostHog
          await trackLLMCallServer({
            model: model || defaultModel,
            provider: providerType,
            promptTokens: promptToks,
            completionTokens: completionToks,
            totalTokens: totalToks,
            cost: costUsd,
            latencyMs: Date.now() - startTime,
            conversationId: conversationId as string,
            success: true,
          });

          // Track in Convex aiTracking table
          await convex.mutation(api.aiTracking.track, {
            inputTokens: promptToks,
            outputTokens: completionToks,
            totalTokens: totalToks,
            model: model || defaultModel,
            provider: getProviderForModel(model || defaultModel),
            usageType: "conversation",
            costUsd,
            costPhp: usdToPhp(costUsd),
            conversationId: conversationId as Id<"conversations">,
            latencyMs: Date.now() - startTime,
            success: true,
          });
        }
      },
    });

    // Return the stream using AI SDK's data stream format
    // Frontend expects: 0:"text"
    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const textPart of result.textStream) {
            // Format as AI SDK data stream: 0:"text"\n
            const formatted = `0:${JSON.stringify(textPart)}\n`;
            controller.enqueue(encoder.encode(formatted));
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
    console.error("Chat API Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Track failed LLM call
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

    try {
      await convex.mutation(api.aiTracking.track, {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        model: "unknown",
        provider: "unknown",
        usageType: "conversation",
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
        error: "Failed to process chat request",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
