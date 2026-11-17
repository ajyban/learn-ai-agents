/*
 * Milestone 1: The Conversation Memory Loop (The Array)
 *
 * Learn how an LLM maintains context across multiple turns using an array
 * of { role, content } messages.
 */

import ollama from 'ollama';
import { appendFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const maxTurns = 10;
const transcriptPath = new URL('../chat-history.txt', import.meta.url);

function formatDuration(durationMs) {
    const totalTenthsOfSeconds = Math.round(durationMs / 100);

    if (totalTenthsOfSeconds < 600) {
        const seconds = (totalTenthsOfSeconds / 10).toFixed(1);
        const unit = totalTenthsOfSeconds === 10 ? 'second' : 'seconds';
        return `${seconds} ${unit}`;
    }

    const minutes = Math.floor(totalTenthsOfSeconds / 600);
    const remainingTenthsOfSeconds = totalTenthsOfSeconds % 600;
    const seconds = (remainingTenthsOfSeconds / 10).toFixed(1);
    const secondUnit = remainingTenthsOfSeconds === 10 ? 'second' : 'seconds';
    return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} ${secondUnit}`;
}

async function basicChatAgent(messages) {
    const startTime = performance.now();
    const response = await ollama.chat({
        model: 'llama3',
        messages,
    });

    return {
        content: response.message.content,
        durationMs: performance.now() - startTime,
    };
}

async function runConversation() {
    const conversation = [];
    const readline = createInterface({ input: stdin, output: stdout });
    const input = readline[Symbol.asyncIterator]();

    try {
        await appendFile(
            transcriptPath,
            `\n--- Chat session ${new Date().toISOString()} ---\n`,
            'utf8',
        );
        console.log(`Transcript: ${fileURLToPath(transcriptPath)}`);

        for (let turn = 1; turn <= maxTurns; turn++) {
            stdout.write(`\nYou (${turn}/${maxTurns}): `);
            const { value: userInput, done } = await input.next();
            if (done) {
                break;
            }

            if (userInput.trim() === '/exit') {
                break;
            }
            if (!userInput.trim()) {
                continue;
            }

            conversation.push({ role: 'user', content: userInput });
            await appendFile(transcriptPath, `\nYou: ${userInput}\n`, 'utf8');

            const { content, durationMs } = await basicChatAgent(conversation);
            conversation.push({ role: 'assistant', content });
            const responseTime = formatDuration(durationMs);
            await appendFile(
                transcriptPath,
                `Assistant: ${content}\nModel response time: ${responseTime}\n`,
                'utf8',
            );
            console.log(`\nAssistant: ${content}`);
            console.log(`Model response time: ${responseTime}`);
        }
    } finally {
        readline.close();
    }
}

await runConversation();