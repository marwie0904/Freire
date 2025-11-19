import OpenAI from 'openai';

// Web search tool definition (OpenAI format)
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
  console.log('🔍 [DeepInfra Web Search] Executing search for:', query);
  console.log('📊 [DeepInfra Web Search] Requesting', numResults, 'results');

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

  console.log('✅ [DeepInfra Web Search] Search completed successfully');

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

export interface DeepInfraWebSearchResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls: number;
  searchMetadata?: SearchMetadata;
}

/**
 * Chat with DeepInfra GPT-OSS-20B using web search tool calling
 * Using OpenAI-compatible API
 */
export async function chatWithDeepInfraWebSearch(
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    maxIterations?: number;
    maxToolCalls?: number;
  }
): Promise<DeepInfraWebSearchResult> {
  const openai = new OpenAI({
    apiKey: process.env.DEEPINFRA_API_KEY,
    baseURL: 'https://api.deepinfra.com/v1/openai',
  });

  // Add system prompt to encourage efficient web search usage
  const systemPrompt = {
    role: 'system' as const,
    content: `CRITICAL INSTRUCTIONS - You have ONLY 4 iterations maximum. By iteration 3, you MUST provide a final response.

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

MINIMIZE TOOL CALLS:
- ONLY use webSearch when absolutely necessary for current/recent information
- Prefer answering from existing knowledge when possible
- If you must search, make it count - use broad, comprehensive queries
- You can only make 1 search, so make it comprehensive and thorough`
  };

  console.log('📋 [DeepInfra Web Search] System Prompt:', systemPrompt.content);

  const conversationMessages: any[] = [systemPrompt, ...messages];
  let iteration = 0;
  const maxIterations = options?.maxIterations || 4;
  const maxToolCalls = options?.maxToolCalls || 1;
  let toolCallsCount = 0;
  let totalUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
  let allSources: SearchSource[] = [];
  let searchQueries: string[] = [];

  console.log('🚀 [DeepInfra Web Search] Starting conversation with max iterations:', maxIterations);
  console.log('🔒 [DeepInfra Web Search] Max tool calls allowed:', maxToolCalls);

  while (iteration < maxIterations) {
    iteration++;
    console.log(`🔄 [DeepInfra Web Search] Iteration ${iteration}/${maxIterations}`);

    // If max tool calls reached, don't offer tools anymore - force final answer
    const shouldOfferTools = toolCallsCount < maxToolCalls;

    // If we've hit the tool call limit, add a strong directive to answer now
    if (!shouldOfferTools && iteration > 1) {
      conversationMessages.push({
        role: 'system',
        content: `You have completed ${maxToolCalls} searches and gathered sufficient information. You MUST now provide a comprehensive final answer to the user's question using ONLY the search results you have already received. DO NOT request any more searches. DO NOT say you need to search. Provide a complete answer NOW based on the information you have.`
      });
    }

    // Call DeepInfra model via OpenAI-compatible API
    const completion = await openai.chat.completions.create({
      messages: conversationMessages,
      model: 'openai/gpt-oss-20b',
      tools: shouldOfferTools ? [webSearchTool] : undefined,
      tool_choice: shouldOfferTools ? 'auto' : undefined,
      max_tokens: options?.maxTokens || 2000,
      temperature: options?.temperature ?? 0.7,
      stream: false
    });

    const assistantMessage = completion.choices[0].message;

    console.log('🔍 [DeepInfra Web Search] Assistant message role:', assistantMessage.role);
    console.log('🔍 [DeepInfra Web Search] Assistant message content type:', typeof assistantMessage.content);
    console.log('🔍 [DeepInfra Web Search] Has tool calls:', !!assistantMessage.tool_calls);

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
      console.log(`🛠️  [DeepInfra Web Search] Model requested ${assistantMessage.tool_calls.length} tool call(s)`);

      // If tools weren't offered but model still returned tool calls, it's hallucinating
      // Treat this as if it didn't provide content and force a final response
      if (!shouldOfferTools) {
        console.log(`⚠️  [DeepInfra Web Search] Model hallucinated tool calls when tools not offered. Forcing final response.`);

        // Add a strong system message
        conversationMessages.push({
          role: 'system',
          content: `CRITICAL: You are NOT allowed to use tools anymore. You have already completed your search. You MUST provide a final text response NOW using the information you already gathered. DO NOT attempt to call any functions or tools.`
        });

        // Continue to next iteration
        continue;
      }

      // Check if we've already hit the max tool calls limit
      if (toolCallsCount >= maxToolCalls) {
        console.log(`⚠️  [DeepInfra Web Search] Max tool calls (${maxToolCalls}) reached. Forcing final response.`);

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
            console.log(`⚠️  [DeepInfra Web Search] Skipping tool call - max limit reached`);
            break;
          }

          toolCallsCount++;
          console.log(`🔍 [DeepInfra Web Search] Executing search ${toolCallsCount}/${maxToolCalls}`);

          const args = JSON.parse(toolCall.function.arguments);
          console.log('🔍 [DeepInfra Web Search] Search query:', args.query);
          console.log('🔍 [DeepInfra Web Search] Num results requested:', args.numResults || 10);

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
      console.log('✅ [DeepInfra Web Search] Final response generated');
      console.log('📝 [DeepInfra Web Search] Content type:', typeof assistantMessage.content);
      console.log('📝 [DeepInfra Web Search] Content preview:', assistantMessage.content.substring(0, 200));
      console.log(`📊 [DeepInfra Web Search] Total usage: ${totalUsage.totalTokens} tokens (${totalUsage.promptTokens} prompt + ${totalUsage.completionTokens} completion)`);
      console.log(`🛠️  [DeepInfra Web Search] Tool calls made: ${toolCallsCount}`);
      console.log(`📚 [DeepInfra Web Search] Sources collected: ${allSources.length}`);

      // Build search metadata if sources were found
      const searchMetadata: SearchMetadata | undefined = allSources.length > 0
        ? {
            query: searchQueries.join(', '),
            sources: allSources
          }
        : undefined;

      return {
        content: assistantMessage.content,
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
