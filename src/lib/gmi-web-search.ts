// Web search tool definition (OpenAI format for GMI Cloud)
const webSearchTool = {
  type: 'function' as const,
  function: {
    name: 'webSearch',
    description: 'Search the web for current information using Google Search. Use this when you need up-to-date information, facts, news, or answers that require recent data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up on Google'
        },
        numResults: {
          type: 'number',
          description: 'Number of search results to retrieve (2-10). Choose based on complexity: 2-4 for simple facts, 5-7 for verification needs, 8-10 for deep research.',
          minimum: 2,
          maximum: 10
        }
      },
      required: ['query', 'numResults']
    }
  }
};

// Execute web search using Serper
async function executeWebSearch(query: string, numResults: number = 10) {
  console.log('🔍 [GMI Web Search] Executing search for:', query);
  console.log('📊 [GMI Web Search] Requesting', numResults, 'results');

  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: numResults }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.statusText}`);
  }

  const data = await response.json();

  console.log('✅ [GMI Web Search] Search completed successfully');

  return {
    organic: data.organic?.slice(0, numResults).map((result: any) => ({
      title: result.title,
      snippet: result.snippet,
      link: result.link,
    })) || [],
    answerBox: data.answerBox || null,
  };
}

export interface SearchSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface SearchMetadata {
  query: string;
  sources: SearchSource[];
}

export interface GMIWebSearchResult {
  content: string;
  reasoning?: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls: number;
  searchMetadata?: SearchMetadata;
}

/**
 * Chat with GMI Cloud using web search tool calling
 * GMI Cloud provides OpenAI-compatible API with reasoning_content field
 */
export async function chatWithGMIWebSearch(
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    maxIterations?: number;
    maxToolCalls?: number;
    reasoning?: "low" | "high";
  }
): Promise<GMIWebSearchResult> {
  const reasoningLevel = options?.reasoning || "high";
  const maxToolCalls = options?.maxToolCalls || 1;

  // Add system prompt based on reasoning level
  const systemPromptContent = reasoningLevel === "high"
    ? `CRITICAL INSTRUCTIONS - You have ONLY 4 iterations maximum. By iteration 3, you MUST provide a final response.

EXTENDED THINKING MODE ENABLED - You have ${maxToolCalls} search${maxToolCalls > 1 ? 'es' : ''} available for thorough research.

SEARCH STRATEGY:
- Use BROAD searches instead of narrow, specific ones
- ONE comprehensive search is better than multiple narrow searches
- Example: Instead of searching "IMF 2025 India GDP", "IMF 2025 Bangladesh GDP", "IMF 2025 Vietnam GDP" separately, use ONE search: "IMF 2025 GDP forecast emerging markets Asia India Bangladesh Vietnam"

CHOOSE THE RIGHT NUMBER OF SOURCES (numResults parameter):

**2-4 Sources** - Simple/Factual Requests:
- Weather forecasts, sports scores, stock prices, exchange rates
- Product specifications (phone specs, car features)
- Celebrity facts, release dates, business hours
- Flight status, simple "what is X" definitions
- Current time in different time zones

**5-7 Sources** - Information Requiring Verification:
- Political statements or claims (fact-checking)
- Health and medical advice
- Legal interpretations or regulations
- Breaking news events (to verify accuracy)
- Product reviews and comparisons
- Historical events with contested details
- Scientific findings or studies
- Investment advice or financial analysis
- Educational explanations (how things work)
- Travel recommendations and safety information
- Nutritional information and diet advice
- Technology troubleshooting guides

**8-10 Sources** - Deep Research/Complex Analysis:
- Academic research topics
- Market analysis and trend forecasting
- Comparative industry analysis
- Policy impact assessments
- Multi-faceted historical analysis
- Complex technical implementations
- Career path and salary research across industries
- Real estate market analysis by region
- Strategic business decisions
- Geopolitical situation analysis
- Long-form investigative questions

MAXIMIZE INSIGHT WITH MULTIPLE SEARCHES:
- With ${maxToolCalls} searches available, you can cross-verify information
- Use your first search for broad context, subsequent searches for specific details or verification
- ONLY use webSearch when absolutely necessary for current/recent information
- Prefer answering from existing knowledge when possible`
    : `QUICK MODE - You have ONLY 4 iterations maximum. By iteration 3, you MUST provide a final response.

FAST SEARCH STRATEGY:
- You have ONLY ${maxToolCalls} search available - make it count
- Use BROAD, comprehensive searches to gather all needed information at once
- Example: Instead of multiple narrow searches, use ONE comprehensive query

CHOOSE THE RIGHT NUMBER OF SOURCES (numResults parameter):
- **2-4 Sources**: Simple facts (weather, scores, prices, definitions)
- **5-7 Sources**: Verification needs (news, reviews, health/legal info)
- **8-10 Sources**: Deep research (academic, market analysis, complex topics)

MINIMIZE TOOL CALLS:
- ONLY use webSearch when absolutely necessary for current/recent information
- Prefer answering from existing knowledge when possible
- Make your single search comprehensive and thorough`;

  const systemPrompt = {
    role: 'system' as const,
    content: systemPromptContent
  };

  console.log('📋 [GMI Web Search] System Prompt:', systemPrompt.content);

  const conversationMessages: any[] = [systemPrompt, ...messages];
  let iteration = 0;
  const maxIterations = options?.maxIterations || 4;
  let toolCallsCount = 0;
  let totalUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
  let allSources: SearchSource[] = [];
  let searchQueries: string[] = [];

  console.log('🚀 [GMI Web Search] Starting conversation with max iterations:', maxIterations);
  console.log('🧠 [GMI Web Search] Reasoning level:', reasoningLevel);
  console.log('🔒 [GMI Web Search] Max tool calls allowed:', maxToolCalls);

  while (iteration < maxIterations) {
    iteration++;
    console.log(`🔄 [GMI Web Search] Iteration ${iteration}/${maxIterations}`);

    // If max tool calls reached, don't offer tools anymore - force final answer
    const shouldOfferTools = toolCallsCount < maxToolCalls;

    // If we've hit the tool call limit, add a strong directive to answer now
    if (!shouldOfferTools && iteration > 1) {
      conversationMessages.push({
        role: 'system',
        content: `You have completed ${maxToolCalls} searches and gathered sufficient information. You MUST now provide a comprehensive final answer to the user's question using ONLY the search results you have already received. DO NOT request any more searches. DO NOT say you need to search. Provide a complete answer NOW based on the information you have.`
      });
    }

    // Call GMI Cloud API
    const payload = {
      model: 'openai/gpt-oss-120b',
      messages: conversationMessages,
      tools: shouldOfferTools ? [webSearchTool] : undefined,
      tool_choice: shouldOfferTools ? 'auto' : undefined,
      max_tokens: options?.maxTokens || 2000,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    const response = await fetch('https://api.gmi-serving.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GMI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GMI API error: ${response.status} - ${errorText}`);
    }

    const completion = await response.json();
    const assistantMessage = completion.choices[0].message;

    console.log('🔍 [GMI Web Search] Assistant message keys:', Object.keys(assistantMessage));
    console.log('🔍 [GMI Web Search] Assistant message role:', assistantMessage.role);
    console.log('🔍 [GMI Web Search] Assistant message content type:', typeof assistantMessage.content);

    // Accumulate token usage
    if (completion.usage) {
      totalUsage.promptTokens += completion.usage.prompt_tokens || 0;
      totalUsage.completionTokens += completion.usage.completion_tokens || 0;
      totalUsage.totalTokens += completion.usage.total_tokens || 0;
    }

    // Add assistant message to conversation
    conversationMessages.push(assistantMessage);

    // Check if there are tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`🛠️  [GMI Web Search] Model requested ${assistantMessage.tool_calls.length} tool call(s)`);

      // Check if we've already hit the max tool calls limit
      if (toolCallsCount >= maxToolCalls) {
        console.log(`⚠️  [GMI Web Search] Max tool calls (${maxToolCalls}) reached. Forcing final response.`);

        // Add a system message to force the model to respond without more tool calls
        conversationMessages.push({
          role: 'system',
          content: `You have reached the maximum number of searches allowed (${maxToolCalls}). You MUST provide a final answer now using the information you have gathered. DO NOT request any more tool calls.`
        });

        // Continue to next iteration to force a response
        continue;
      }

      // Execute tool calls only if under the limit
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'webSearch') {
          // Check before each tool call
          if (toolCallsCount >= maxToolCalls) {
            console.log(`⚠️  [GMI Web Search] Skipping tool call - max limit reached`);
            break;
          }

          toolCallsCount++;
          console.log(`🔍 [GMI Web Search] Executing search ${toolCallsCount}/${maxToolCalls}`);

          const args = JSON.parse(toolCall.function.arguments);
          console.log('🔍 [GMI Web Search] Search query:', args.query);
          console.log('🔍 [GMI Web Search] Num results requested:', args.numResults || 10);

          const searchResults = await executeWebSearch(args.query, args.numResults || 10);

          // Track search query
          searchQueries.push(args.query);

          // Collect sources from search results
          if (searchResults.organic && searchResults.organic.length > 0) {
            searchResults.organic.forEach((result: any) => {
              allSources.push({
                title: result.title,
                url: result.link,
                snippet: result.snippet
              });
            });
          }

          // Add tool result to messages
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(searchResults)
          });
        }
      }

      // Continue to next iteration to get response using tool results
      continue;
    }

    // No tool calls, we have final response
    if (assistantMessage.content) {
      console.log('✅ [GMI Web Search] Final response generated');
      console.log('📝 [GMI Web Search] Content type:', typeof assistantMessage.content);
      console.log('📝 [GMI Web Search] Content preview:', assistantMessage.content.substring(0, 200));
      console.log(`📊 [GMI Web Search] Total usage: ${totalUsage.totalTokens} tokens (${totalUsage.promptTokens} prompt + ${totalUsage.completionTokens} completion)`);
      console.log(`🛠️  [GMI Web Search] Tool calls made: ${toolCallsCount}`);
      console.log(`📚 [GMI Web Search] Sources collected: ${allSources.length}`);

      // Build search metadata if sources were found
      const searchMetadata: SearchMetadata | undefined = allSources.length > 0
        ? {
            query: searchQueries.join(', '),
            sources: allSources
          }
        : undefined;

      // GMI uses reasoning_content field instead of reasoning
      const reasoning = (assistantMessage as any).reasoning_content;

      // Filter out GMI control tokens from final content
      const controlTokenPattern = /<\|[^|]+\|>/g;
      const cleanedContent = assistantMessage.content.replace(controlTokenPattern, '').trim();

      return {
        content: cleanedContent,
        reasoning,
        usage: totalUsage,
        toolCalls: toolCallsCount,
        searchMetadata
      };
    }

    // Model stopped without response
    throw new Error('Model finished without providing content');
  }

  throw new Error('Reached max iterations without completion');
}

/**
 * Streaming version of chatWithGMIWebSearch
 * Yields content chunks in real-time as they arrive from GMI Cloud API
 */
export async function* streamGMIWebSearch(
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    maxIterations?: number;
    maxToolCalls?: number;
    reasoning?: "low" | "high";
  }
): AsyncGenerator<{ type: 'content' | 'metadata', data: string | { usage: any; searchMetadata?: SearchMetadata; toolCalls: number; reasoning?: string } }> {
  const reasoningLevel = options?.reasoning || "high";
  const maxToolCalls = options?.maxToolCalls || 1;

  // Add system prompt based on reasoning level
  const systemPromptContent = reasoningLevel === "high"
    ? `CRITICAL INSTRUCTIONS - You have ONLY 4 iterations maximum. By iteration 3, you MUST provide a final response.

EXTENDED THINKING MODE ENABLED - You have ${maxToolCalls} search${maxToolCalls > 1 ? 'es' : ''} available for thorough research.

SEARCH STRATEGY:
- Use BROAD searches instead of narrow, specific ones
- ONE comprehensive search is better than multiple narrow searches
- Example: Instead of searching "IMF 2025 India GDP", "IMF 2025 Bangladesh GDP", "IMF 2025 Vietnam GDP" separately, use ONE search: "IMF 2025 GDP forecast emerging markets Asia India Bangladesh Vietnam"

CHOOSE THE RIGHT NUMBER OF SOURCES (numResults parameter):

**2-4 Sources** - Simple/Factual Requests:
- Weather forecasts, sports scores, stock prices, exchange rates
- Product specifications (phone specs, car features)
- Celebrity facts, release dates, business hours
- Flight status, simple "what is X" definitions
- Current time in different time zones

**5-7 Sources** - Information Requiring Verification:
- Political statements or claims (fact-checking)
- Health and medical advice
- Legal interpretations or regulations
- Breaking news events (to verify accuracy)
- Product reviews and comparisons
- Historical events with contested details
- Scientific findings or studies
- Investment advice or financial analysis
- Educational explanations (how things work)
- Travel recommendations and safety information
- Nutritional information and diet advice
- Technology troubleshooting guides

**8-10 Sources** - Deep Research/Complex Analysis:
- Academic research topics
- Market analysis and trend forecasting
- Comparative industry analysis
- Policy impact assessments
- Multi-faceted historical analysis
- Complex technical implementations
- Career path and salary research across industries
- Real estate market analysis by region
- Strategic business decisions
- Geopolitical situation analysis
- Long-form investigative questions

MAXIMIZE INSIGHT WITH MULTIPLE SEARCHES:
- With ${maxToolCalls} searches available, you can cross-verify information
- Use your first search for broad context, subsequent searches for specific details or verification
- ONLY use webSearch when absolutely necessary for current/recent information
- Prefer answering from existing knowledge when possible`
    : `QUICK MODE - You have ONLY 4 iterations maximum. By iteration 3, you MUST provide a final response.

FAST SEARCH STRATEGY:
- You have ONLY ${maxToolCalls} search available - make it count
- Use BROAD, comprehensive searches to gather all needed information at once
- Example: Instead of multiple narrow searches, use ONE comprehensive query

CHOOSE THE RIGHT NUMBER OF SOURCES (numResults parameter):
- **2-4 Sources**: Simple facts (weather, scores, prices, definitions)
- **5-7 Sources**: Verification needs (news, reviews, health/legal info)
- **8-10 Sources**: Deep research (academic, market analysis, complex topics)

MINIMIZE TOOL CALLS:
- ONLY use webSearch when absolutely necessary for current/recent information
- Prefer answering from existing knowledge when possible
- Make your single search comprehensive and thorough`;

  const systemPrompt = {
    role: 'system' as const,
    content: systemPromptContent
  };

  console.log('📋 [GMI Web Search Stream] System Prompt:', systemPrompt.content);

  const conversationMessages: any[] = [systemPrompt, ...messages];
  let iteration = 0;
  const maxIterations = options?.maxIterations || 4;
  let toolCallsCount = 0;
  let totalUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
  let allSources: SearchSource[] = [];
  let searchQueries: string[] = [];
  let reasoningContent: string | undefined;

  console.log('🚀 [GMI Web Search Stream] Starting conversation with max iterations:', maxIterations);
  console.log('🧠 [GMI Web Search Stream] Reasoning level:', reasoningLevel);
  console.log('🔒 [GMI Web Search Stream] Max tool calls allowed:', maxToolCalls);

  while (iteration < maxIterations) {
    iteration++;
    console.log(`🔄 [GMI Web Search Stream] Iteration ${iteration}/${maxIterations}`);

    // 🔑 KEY FIX: Add user instruction when limit is reached (not system message)
    if (toolCallsCount >= maxToolCalls && conversationMessages[conversationMessages.length - 1].role !== 'user') {
      conversationMessages.push({
        role: 'user',
        content: 'Please provide your final answer based on the search results you have gathered. Do not attempt any more searches.'
      });
    }

    // If max tool calls reached, don't offer tools anymore - force final answer
    const shouldOfferTools = toolCallsCount < maxToolCalls;

    // Call GMI Cloud API with streaming
    // Build request body
    const payload: any = {
      model: 'openai/gpt-oss-120b',
      messages: conversationMessages,
      max_tokens: options?.maxTokens || 2000,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    // Only add tools if under limit (don't set tool_choice at all when tools removed)
    if (shouldOfferTools) {
      payload.tools = [webSearchTool];
      payload.tool_choice = 'auto';
    }

    const response = await fetch('https://api.gmi-serving.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GMI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GMI API error: ${response.status} - ${errorText}`);
    }

    // Parse streaming response (Server-Sent Events format)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let assistantMessage: any = {
      role: 'assistant',
      content: '',
      tool_calls: []
    };

    // Process stream chunks
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta;

            if (!delta) continue;

            // Accumulate token usage
            if (parsed.usage) {
              totalUsage.promptTokens += parsed.usage.prompt_tokens || 0;
              totalUsage.completionTokens += parsed.usage.completion_tokens || 0;
              totalUsage.totalTokens += parsed.usage.total_tokens || 0;
            }

            // Handle reasoning content (GMI uses reasoning_content field)
            if (delta.reasoning_content) {
              reasoningContent = (reasoningContent || '') + delta.reasoning_content;
              console.log(`🧠 [GMI Web Search Stream] Reasoning chunk: "${delta.reasoning_content}"`);
            }

            // Handle tool calls
            if (delta.tool_calls) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                // Initialize tool call if needed
                if (!assistantMessage.tool_calls[index]) {
                  assistantMessage.tool_calls[index] = {
                    id: toolCallDelta.id || '',
                    type: 'function',
                    function: {
                      name: '',
                      arguments: ''
                    }
                  };
                }

                // Accumulate tool call data
                if (toolCallDelta.id) {
                  assistantMessage.tool_calls[index].id = toolCallDelta.id;
                }
                if (toolCallDelta.function?.name) {
                  assistantMessage.tool_calls[index].function.name += toolCallDelta.function.name;
                }
                if (toolCallDelta.function?.arguments) {
                  assistantMessage.tool_calls[index].function.arguments += toolCallDelta.function.arguments;
                }
              }
            }

            // Handle content streaming - yield immediately (no filtering)
            if (delta.content) {
              assistantMessage.content += delta.content;
              console.log(`📤 [GMI Web Search Stream] Content chunk: "${delta.content}"`);
              yield { type: 'content', data: delta.content };
            }
          } catch (e) {
            console.error('[GMI Web Search Stream] Error parsing chunk:', e);
          }
        }
      }
    }

    console.log('🔍 [GMI Web Search Stream] Assistant message content length:', assistantMessage.content.length);
    console.log('🔍 [GMI Web Search Stream] Tool calls:', assistantMessage.tool_calls.length);

    // Add assistant message to conversation
    conversationMessages.push(assistantMessage);

    // Clean up empty tool calls
    assistantMessage.tool_calls = assistantMessage.tool_calls.filter((tc: any) => tc.id);
    if (assistantMessage.tool_calls.length === 0) {
      delete assistantMessage.tool_calls;
    }

    // Check if there are tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`🛠️  [GMI Web Search Stream] Model requested ${assistantMessage.tool_calls.length} tool call(s)`);

      // Increment counter
      toolCallsCount += assistantMessage.tool_calls.length;

      // Execute tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'webSearch') {
          const args = JSON.parse(toolCall.function.arguments);
          console.log('🔍 [GMI Web Search Stream] Search query:', args.query);
          console.log('🔍 [GMI Web Search Stream] Num results requested:', args.numResults || 10);

          const searchResults = await executeWebSearch(args.query, args.numResults || 10);

          // Track search query
          searchQueries.push(args.query);

          // Collect sources from search results
          if (searchResults.organic && searchResults.organic.length > 0) {
            searchResults.organic.forEach((result: any) => {
              allSources.push({
                title: result.title,
                url: result.link,
                snippet: result.snippet
              });
            });
          }

          // Add tool result to messages
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(searchResults)
          });
        }
      }

      // Continue to next iteration to get response using tool results
      continue;
    }

    // No tool calls, we have final response
    if (assistantMessage.content) {
      console.log('✅ [GMI Web Search Stream] Final response generated');
      console.log('📝 [GMI Web Search Stream] Content length:', assistantMessage.content.length);
      console.log(`📊 [GMI Web Search Stream] Total usage: ${totalUsage.totalTokens} tokens (${totalUsage.promptTokens} prompt + ${totalUsage.completionTokens} completion)`);
      console.log(`🛠️  [GMI Web Search Stream] Tool calls made: ${toolCallsCount}`);
      console.log(`📚 [GMI Web Search Stream] Sources collected: ${allSources.length}`);

      // Build search metadata if sources were found
      const searchMetadata: SearchMetadata | undefined = allSources.length > 0
        ? {
            query: searchQueries.join(', '),
            sources: allSources
          }
        : undefined;

      // Yield final metadata
      yield {
        type: 'metadata',
        data: {
          usage: totalUsage,
          searchMetadata,
          toolCalls: toolCallsCount,
          reasoning: reasoningContent
        }
      };

      return;
    }

    // Model stopped without response
    throw new Error('Model finished without providing content');
  }

  throw new Error('Reached max iterations without completion');
}
