import ollama from 'ollama';
import fs from 'fs/promises';
import path from 'path';

// --- 1. GUARDRAIL: Sandbox file access to the current project folder ---
function resolveSafePath(targetPath) {
  const workspaceRoot = process.cwd();
  const resolved = path.resolve(workspaceRoot, targetPath);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error(`Security violation: Access denied outside workspace (${targetPath})`);
  }
  return resolved;
}

// --- 2. TOOL IMPLEMENTATIONS (The Harness's Hands) ---
const toolExecutors = {
  async listFiles({ directory = '.' }) {
    const safeDir = resolveSafePath(directory);
    const entries = await fs.readdir(safeDir, { withFileTypes: true });
    return entries
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join('\n');
  },

  async readFile({ filePath }) {
    const safePath = resolveSafePath(filePath);
    return await fs.readFile(safePath, 'utf8');
  },

  async writeFile({ filePath, content }) {
    const safePath = resolveSafePath(filePath);
    await fs.writeFile(safePath, content, 'utf8');
    return `Successfully wrote ${content.length} characters to ${filePath}`;
  },
};

// --- 3. TOOL SCHEMAS (Metadata shared with Qwen so it knows how to call them) ---
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'listFiles',
      description: 'List all files and folders in a given directory inside the workspace.',
      parameters: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Relative directory path (defaults to "." for project root)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read the full text content of a file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path to the file' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Create a new file or overwrite an existing file with text content.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Relative path to the file' },
          content: { type: 'string', description: 'Full text content to write into the file' },
        },
        required: ['filePath', 'content'],
      },
    },
  },
];

// --- 4. THE AGENT HARNESS CLASS ---
class AgentHarness {
  constructor(model, systemPrompt) {
    this.model = model;
    // Memory: Stores the ongoing conversation history across turns
    this.messages = [{ role: 'system', content: systemPrompt }];
  }

  async run(userPrompt, maxTurns = 6) {
    this.messages.push({ role: 'user', content: userPrompt });
    console.log(`\n[User]: ${userPrompt}`);

    // The Execution Loop: Keep going until the model gives a final text answer
    for (let turn = 1; turn <= maxTurns; turn++) {
      console.log(`\n--- Turn ${turn} (Thinking...) ---`);

      // Track response latency
      const startTime = Date.now();
      
      const response = await ollama.chat({
        model: this.model,
        messages: this.messages,
        tools: toolDefinitions,
      });

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      // Extract token usage metrics provided by Ollama
      const promptTokens = response.prompt_eval_count || 0;
      const completionTokens = response.eval_count || 0;
      const totalTurnTokens = promptTokens + completionTokens;

      console.log(
        `Model response time: ${durationSec}s | Tokens: Prompt(${promptTokens}) + Completion(${completionTokens}) = Total(${totalTurnTokens})`
      );

      const assistantMessage = response.message;
      // Save the model's response into memory
      this.messages.push(assistantMessage);

      let toolsToExecute = [];

      // 1. Check if Ollama returned native structured tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        toolsToExecute = assistantMessage.tool_calls.map(call => ({
          name: call.function.name,
          args: call.function.arguments
        }));
      } 
      // 2. FALLBACK: Check if the model wrote JSON tool calls as raw text in content
      else if (assistantMessage.content) {
        try {
          const cleanedContent = assistantMessage.content.replace(/```json/g, '').replace(/```/g, '').trim();
          const lines = cleanedContent.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
              const parsed = JSON.parse(trimmed);
              if (parsed.name && parsed.arguments) {
                toolsToExecute.push({ name: parsed.name, args: parsed.arguments });
              }
            }
          }
        } catch (e) {
          // Not a JSON tool call, treat as regular text
        }
      }

      // If we found tool calls, execute them and feed the results back into memory
      if (toolsToExecute.length > 0) {
        for (const call of toolsToExecute) {
          const toolName = call.name;
          const args = call.args;
          console.log(`[Harness Executing Tool]: ${toolName}(${JSON.stringify(args)})`);

          let toolResult;
          try {
            const executor = toolExecutors[toolName];
            if (!executor) throw new Error(`Unknown tool: ${toolName}`);
            toolResult = await executor(args);
          } catch (err) {
            toolResult = `Error: ${err.message}`;
          }

          console.log(`[Tool Result Output Snippet]: ${String(toolResult).slice(0, 100)}...`);

          // Append the tool result back into conversation history
          this.messages.push({
            role: 'tool',
            content: String(toolResult),
          });
        }
      } else {
        // No tool calls found, so this is the final answer text from the agent
        console.log(`\n[Agent Final Answer]:\n${assistantMessage.content}`);
        return assistantMessage.content;
      }
    }

    console.log('\n[Harness Warning]: Reached max turns limit without final answer.');
  }
}

// --- 5. EXECUTION TEST ---
const agent = new AgentHarness(
  'qwen2.5-coder:7b',
  'You are a helpful local coding assistant with access to file tools. Always read files to inspect their contents before writing summaries about them.'
);

await agent.run(
  'Step 1: Read package.json to see the actual dependencies. Step 2: Once you have read the contents, write a detailed summary of those dependencies into project-notes.md.'
);