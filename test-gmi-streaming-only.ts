import { config } from 'dotenv';
config({ path: '.env.local' });

const webSearchTool = {
  type: 'function',
  function: {
    name: 'webSearch',
    description: 'Search the web for current information using Google Search.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        numResults: {
          type: 'number',
          description: 'Number of results to return (2-10)'
        }
      },
      required: ['query']
    }
  }
};

async function executeWebSearch(query: string, numResults: number = 5) {
  console.log(`\n🔍 Executing search: "${query}" (${numResults} results)\n`);

  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: numResults }),
  });

  const data = await response.json();

  return {
    organic: data.organic?.slice(0, numResults).map((result: any) => ({
      title: result.title,
      snippet: result.snippet,
      link: result.link,
    })) || [],
    answerBox: data.answerBox || null,
  };
}

async function testGMIStreaming() {
  const url = 'https://api.gmi-serving.com/v1/chat/completions';

  const messages: any[] = [
    {
      role: 'system',
      content: `You are a helpful AI assistant with web search capabilities.

IMPORTANT SEARCH GUIDELINES:
- Limit yourself to 1-2 web searches maximum per question
- After searching, synthesize a comprehensive answer from the results you have
- Do NOT make additional searches unless absolutely critical information is missing
- If your first search provides relevant results, use them to answer - don't search again

When you need current information, use the webSearch tool.
After searching, provide a well-organized answer citing your sources.`
    },
    {
      role: 'user',
      content: 'What are the latest human trial results from Neuralink? - do a web search for me'
    }
  ];

  let iteration = 0;
  const maxIterations = 5;
  let toolCallCount = 0;
  const maxToolCalls = 3;

  console.log('='.repeat(80));
  console.log('GMI STREAMING TEST - Backend Only');
  console.log('='.repeat(80));
  console.log('\n');

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n🔄 Iteration ${iteration}/${maxIterations} (Tool calls: ${toolCallCount}/${maxToolCalls})\n`);

    const requestBody: any = {
      model: 'openai/gpt-oss-120b',
      messages,
      max_tokens: 2000,
      temperature: 0.2,
      stream: true,
    };

    // Only add tools if under limit
    if (toolCallCount < maxToolCalls) {
      requestBody.tools = [webSearchTool];
      requestBody.tool_choice = 'auto';
      console.log('✅ Tools enabled for this iteration');
    } else {
      console.log('⚠️  Tool limit reached - forcing final answer\n');
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
    let hasContent = false;

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
          const jsonStr = line.slice(6);
          const chunk = JSON.parse(jsonStr);
          const delta = chunk.choices[0]?.delta;

          if (!delta) continue;

          // Log RAW delta for debugging
          if (delta.content) {
            console.log(`[RAW CONTENT]: "${delta.content}"`);
          }

          if (delta.reasoning_content) {
            console.log(`[RAW REASONING]: "${delta.reasoning_content}"`);
          }

          if (delta.tool_calls) {
            console.log(`[RAW TOOL_CALLS]:`, JSON.stringify(delta.tool_calls, null, 2));
          }

          // Handle content streaming
          if (delta.content) {
            if (!hasContent) {
              console.log('\n💬 Final Answer (streaming):');
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

              if (!assistantMessage.tool_calls[index]) {
                assistantMessage.tool_calls[index] = {
                  id: '',
                  type: 'function',
                  function: {
                    name: '',
                    arguments: ''
                  }
                };
              }

              const toolCall = assistantMessage.tool_calls[index];

              if (toolCallDelta.id) toolCall.id = toolCallDelta.id;
              if (toolCallDelta.function?.name) toolCall.function.name += toolCallDelta.function.name;
              if (toolCallDelta.function?.arguments) toolCall.function.arguments += toolCallDelta.function.arguments;
            }
          }
        } catch (e) {
          console.error('[PARSE ERROR]:', line);
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

    console.log('\n📋 Assistant Message Summary:');
    console.log('Content length:', assistantMessage.content.length);
    console.log('Tool calls:', assistantMessage.tool_calls?.length || 0);
    if (assistantMessage.content) {
      console.log('Content preview:', assistantMessage.content.substring(0, 200));
    }
    console.log('');

    // Add to conversation
    messages.push(assistantMessage);

    // Handle tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`\n🔧 Detected ${assistantMessage.tool_calls.length} tool call(s)`);
      toolCallCount += assistantMessage.tool_calls.length;

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'webSearch') {
          const args = JSON.parse(toolCall.function.arguments);
          const searchResults = await executeWebSearch(args.query, args.numResults || 5);

          console.log(`✅ Search completed - Found ${searchResults.organic.length} results\n`);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(searchResults)
          });
        }
      }

      continue;
    }

    // Check for final response
    if (assistantMessage.content) {
      console.log('\n' + '='.repeat(80));
      console.log('✅ TEST COMPLETED');
      console.log('='.repeat(80));
      console.log(`Total searches: ${toolCallCount}/${maxToolCalls}`);
      console.log(`Iterations used: ${iteration}/${maxIterations}`);
      console.log(`Final content length: ${assistantMessage.content.length} characters`);
      return;
    }

    throw new Error('Model finished without providing content');
  }

  throw new Error('Reached max iterations');
}

// Run test
testGMIStreaming().catch(console.error);
