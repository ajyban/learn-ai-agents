import ollama from 'ollama';

async function testModels() {
  console.log("=== 1. Testing General Model (llama3) for Summarization ===");
  const summaryPrompt = "Summarize this in one sentence: Agentic harnesses wrap foundational models with tools, memory, and execution loops so they can safely operate on local files and execute code.";
  
  const response1 = await ollama.chat({
    model: 'llama3',
    messages: [{ role: 'user', content: summaryPrompt }],
  });
  console.log(`Llama3 Response:\n${response1.message.content}\n`);

  console.log("=== 2. Testing Coding Model (qwen2.5-coder:7b) for Code Generation ===");
  const codePrompt = "Write a simple Node.js Express server that returns 'Hello from Local Agent' on the root route.";
  
  const response2 = await ollama.chat({
    model: 'qwen2.5-coder:7b',
    messages: [{ role: 'user', content: codePrompt }],
  });
  console.log(`Qwen Coder Response:\n${response2.message.content}\n`);
}

testModels().catch(console.error);