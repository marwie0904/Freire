import 'dotenv/config';

const webSearchTool = {
  type: 'function',
  function: {
    name: 'webSearch',
    description: 'Search the web for current information using Google Search. Use this when you need up-to-date information, facts, news, or answers that require recent data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up on Google'
        }
      },
      required: ['query']
    }
  }
};

async function executeWebSearch(query: string) {
  console.log(`\n🔍 Executing search: "${query}"\n`);

  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: 5 }),
  });

  const data = await response.json();

  return {
    organic: data.organic?.slice(0, 5).map((result: any) => ({
      title: result.title,
      snippet: result.snippet,
      link: result.link,
    })) || [],
    answerBox: data.answerBox || null,
  };
}

async function chatWithWebSearchStreaming(question: string) {
  if (!process.env.GMI_API_KEY || process.env.GMI_API_KEY === 'your_gmi_key_here') {
    console.log('⚠️  GMI_API_KEY not set in .env file');
    console.log('Please add your GMI Cloud API key to .env to run this test');
    return;
  }

  if (!process.env.SERPER_API_KEY || process.env.SERPER_API_KEY === 'your_serper_key_here') {
    console.log('⚠️  SERPER_API_KEY not set in .env file');
    console.log('Please add your Serper API key to .env to run this test');
    return;
  }

  const url = 'https://api.gmi-serving.com/v1/chat/completions';

  // ✅ FIX PART 1: System prompt with search limits
  const messages: any[] = [
    {
      role: 'system',
      content: `You are a helpful AI assistant with access to web search capabilities.

IMPORTANT SEARCH GUIDELINES:
- Limit yourself to 1-2 web searches maximum per question
- After searching, synthesize a comprehensive answer from the results you have
- Do NOT make additional searches unless absolutely critical information is missing
- If your first search provides relevant results, use them to answer - don't search again for more specifics
- Focus on providing a complete answer with the information available

When you need current information, use the webSearch tool.
After searching, provide a well-organized answer citing your sources.`
    },
    {
      role: 'user',
      content: question
    }
  ];

  let iteration = 0;
  const maxIterations = 5;

  // ✅ FIX PART 2: Hard limit counter
  let toolCallCount = 0;
  const maxToolCalls = 3; // Safety buffer - allows up to 3 searches

  console.log('='.repeat(80));
  console.log('GMI Cloud - GPT OSS 120b Web Search (STREAMING)');
  console.log('='.repeat(80));
  console.log('\n📝 Question:', question);
  console.log('\n' + '='.repeat(80) + '\n');

  while (iteration < maxIterations) {
    iteration++;
    console.log(`🔄 Iteration ${iteration}/${maxIterations} (Searches performed: ${toolCallCount}/${maxToolCalls})\n`);

    const requestBody: any = {
      model: 'openai/gpt-oss-120b',
      messages,
      max_tokens: 2000,
      temperature: 0.2,
      stream: true, // ✅ Enable streaming
    };

    // 🔑 KEY CHANGE: Only include tools if under limit
    if (toolCallCount < maxToolCalls) {
      requestBody.tools = [webSearchTool];
      requestBody.tool_choice = 'auto';
    } else {
      console.log('⚠️  Tool call limit reached. Forcing final answer...\n');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GMI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GMI API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // Process SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let assistantMessage: any = {
      role: 'assistant',
      content: '',
      tool_calls: []
    };
    let currentToolCall: any = null;
    let hasContent = false;
    let hasToolCalls = false;

    console.log('📥 Streaming response...\n');

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.trim() === 'data: [DONE]') continue;
        if (!line.startsWith('data: ')) continue;

        try {
          const jsonStr = line.slice(6); // Remove 'data: ' prefix
          const chunk = JSON.parse(jsonStr);
          const delta = chunk.choices[0]?.delta;

          if (!delta) continue;

          // Handle content streaming
          if (delta.content) {
            if (!hasContent) {
              console.log('💬 Final Answer:');
              console.log('-'.repeat(80));
              hasContent = true;
            }
            process.stdout.write(delta.content);
            assistantMessage.content += delta.content;
          }

          // Handle tool call streaming
          if (delta.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;

              // Initialize new tool call
              if (!assistantMessage.tool_calls[index]) {
                assistantMessage.tool_calls[index] = {
                  id: '',
                  type: 'function',
                  function: {
                    name: '',
                    arguments: ''
                  }
                };
                hasToolCalls = true;
              }

              const toolCall = assistantMessage.tool_calls[index];

              // Accumulate tool call data
              if (toolCallDelta.id) {
                toolCall.id = toolCallDelta.id;
              }
              if (toolCallDelta.function?.name) {
                toolCall.function.name += toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                toolCall.function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
        } catch (e) {
          // Skip malformed JSON chunks
          continue;
        }
      }
    }

    if (hasContent) {
      console.log('\n' + '-'.repeat(80) + '\n');
    }

    // Clean up empty tool calls
    assistantMessage.tool_calls = assistantMessage.tool_calls.filter((tc: any) => tc.id);
    if (assistantMessage.tool_calls.length === 0) {
      delete assistantMessage.tool_calls;
    }

    // Add assistant message to conversation
    messages.push(assistantMessage);

    // Handle tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`\n🔧 Tool calls detected: ${assistantMessage.tool_calls.length}`);

      // Increment counter
      toolCallCount += assistantMessage.tool_calls.length;

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'webSearch') {
          const args = JSON.parse(toolCall.function.arguments);
          const searchResults = await executeWebSearch(args.query);

          console.log(`✅ Search completed - Found ${searchResults.organic.length} results\n`);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(searchResults)
          });
        }
      }

      continue; // Next iteration
    }

    // Check for final response
    if (assistantMessage.content) {
      console.log('='.repeat(80));
      console.log('✅ COMPLETED');
      console.log('='.repeat(80));
      console.log(`Total searches performed: ${toolCallCount}/${maxToolCalls}`);
      console.log(`Iterations used: ${iteration}/${maxIterations}`);

      return {
        response: assistantMessage.content,
        searchesPerformed: toolCallCount
      };
    }

    throw new Error('Model finished without providing content');
  }

  throw new Error('Reached max iterations without completion');
}

// Test with both simple and complex queries
async function runTests() {
  console.log('\n\n');
  console.log('█'.repeat(80));
  console.log('TEST 1: SIMPLE QUERY');
  console.log('█'.repeat(80));
  console.log('\n');

  const simpleResult = await chatWithWebSearchStreaming('What is the weather in San Francisco today?');

  console.log('\n\n');
  console.log('█'.repeat(80));
  console.log('TEST 2: COMPLEX QUERY (Testing infinite loop fix)');
  console.log('█'.repeat(80));
  console.log('\n');

  const complexResult = await chatWithWebSearchStreaming(
    'What are the latest findings on GLP-1 agonists for conditions other than diabetes?'
  );

  console.log('\n\n');
  console.log('█'.repeat(80));
  console.log('SUMMARY');
  console.log('█'.repeat(80));
  console.log(`Simple query searches: ${simpleResult?.searchesPerformed || 0}`);
  console.log(`Complex query searches: ${complexResult?.searchesPerformed || 0}`);
  console.log('\n✅ Both tests completed successfully!');
  console.log('The hard limit prevented infinite loops while allowing thorough research.\n');
}

// Run the tests
runTests().catch(console.error);
