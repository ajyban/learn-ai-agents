import ollama from 'ollama';
import fs from 'fs/promises';
import { performance } from 'perf_hooks';

async function benchmarkModel(modelName, prompt, filePrefix) {
  console.log(`\n----------------------------------------`);
  console.log(`[Running] Model: ${modelName}...`);
  
  // 1. Capture start time and memory snapshot
  const startTime = performance.now();
  const startMemory = process.memoryUsage();

  // Call local Ollama model
  const response = await ollama.chat({
    model: modelName,
    messages: [{ role: 'user', content: prompt }],
  });

  // 2. Capture end time and memory snapshot
  const endTime = performance.now();
  const endMemory = process.memoryUsage();

  // 3. Compute metrics
  const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
  const heapUsedMB = (endMemory.heapUsed / 1024 / 1024).toFixed(2);
  const rssMB = (endMemory.rss / 1024 / 1024).toFixed(2);

  console.log(`[Completed] Time: ${durationSeconds}s | Heap Used: ${heapUsedMB} MB | RSS: ${rssMB} MB`);

  // 4. Construct the header and response content
  const timestampISO = new Date().toISOString();
  const header = [
    `# Execution Report: ${modelName}`,
    `- **Prompt:** ${prompt}`,
    `- **Time Taken:** ${durationSeconds} seconds`,
    `- **Node.js Heap Used:** ${heapUsedMB} MB`,
    `- **Node.js RSS (Resident Set Size):** ${rssMB} MB`,
    `- **Timestamp:** ${timestampISO}`,
    `---`,
    ``
  ].join('\n');

  const fileContent = header + response.message.content;

  // 5. Generate unique timestamped filename (replacing invalid filesystem characters like colons)
  const safeTimestamp = timestampISO.replace(/[:.]/g, '-');
  const filename = `${filePrefix}_${safeTimestamp}.md`;

  // 6. Output to file
  await fs.writeFile(filename, fileContent, 'utf8');
  console.log(`[Saved] Output written to unique file: ${filename}`);
}

async function runBenchmarks() {
  await benchmarkModel(
    'llama3',
    'Summarize this in one sentence: Agentic harnesses wrap foundational models with tools, memory, and execution loops so they can safely operate on local files and execute code.',
    'llama3_summary'
  );

  await benchmarkModel(
    'qwen2.5-coder:7b',
    'Write a simple Node.js Express server that returns "Hello from Local Agent" on the root route.',
    'qwen_code'
  );
  
  console.log(`\nAll benchmarks completed successfully! Each run now saves unique timestamped files.`);
}

runBenchmarks().catch(console.error);