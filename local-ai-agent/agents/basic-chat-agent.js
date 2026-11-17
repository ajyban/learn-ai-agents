/*
 * Milestone 1: The Conversation Memory Loop (The Array)
 *
 * Learn how an LLM maintains context across multiple turns using an array
 * of { role, content } messages.
 */

import ollama from 'ollama';
import { appendFile, readFile, realpath } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { performance } from 'node:perf_hooks';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const maxTurns = 10;
const maxToolRounds = 5;
const transcriptPath = new URL('../chat-history.txt', import.meta.url);
const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const tools = [
    {
        type: 'function',
        function: {
            name: 'readFile',
            description: 'Read a UTF-8 text file inside the local-ai-agent workspace.',
            parameters: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Path relative to the local-ai-agent directory, such as package.json',
                    },
                },
                required: ['filePath'],
            },
        },
    },
];

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

function isWithinDirectory(directory, filePath) {
    const pathFromDirectory = relative(directory, filePath);
    return pathFromDirectory !== '..'
        && !pathFromDirectory.startsWith(`..${sep}`)
        && !isAbsolute(pathFromDirectory);
}

async function executeToolCall(toolCall) {
    const { name, arguments: args } = toolCall.function;
    if (name !== 'readFile') {
        throw new Error(`Unsupported tool: ${name}`);
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)
        || typeof args.filePath !== 'string' || !args.filePath.trim()) {
        throw new Error('readFile requires a non-empty filePath string');
    }
    if (isAbsolute(args.filePath)) {
        throw new Error('readFile only accepts paths relative to the local-ai-agent directory');
    }

    const resolvedPath = resolve(workspaceRoot, args.filePath);
    const realWorkspaceRoot = await realpath(workspaceRoot);
    const realFilePath = await realpath(resolvedPath);
    if (!isWithinDirectory(realWorkspaceRoot, realFilePath)) {
        throw new Error('readFile cannot access files outside the local-ai-agent directory');
    }

    return readFile(realFilePath, 'utf8');
}

async function basicChatAgent(messages) {
    let modelDurationMs = 0;
    let requestStartedAt = performance.now();
    let response = await ollama.chat({
        model: 'qwen2.5-coder:7b',
        messages,
        tools,
    });
    modelDurationMs += performance.now() - requestStartedAt;

    let toolRounds = 0;
    while (response.message.tool_calls?.length) {
        if (toolRounds >= maxToolRounds) {
            throw new Error(`Model exceeded the ${maxToolRounds}-round tool-call limit`);
        }
        toolRounds += 1;
        messages.push(response.message);

        for (const toolCall of response.message.tool_calls) {
            const content = await executeToolCall(toolCall);
            messages.push({
                role: 'tool',
                tool_name: toolCall.function.name,
                content,
            });
        }

        requestStartedAt = performance.now();
        response = await ollama.chat({
            model: 'qwen2.5-coder:7b',
            messages,
            tools,
        });
        modelDurationMs += performance.now() - requestStartedAt;
    }

    return {
        message: response.message,
        durationMs: modelDurationMs,
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

            const { message, durationMs } = await basicChatAgent(conversation);
            console.log(message);
            conversation.push(message);
            const responseTime = formatDuration(durationMs);
            const assistantOutput = message.content || JSON.stringify(message);
            await appendFile(
                transcriptPath,
                `Assistant: ${assistantOutput}\nModel response time: ${responseTime}\n`,
                'utf8',
            );
            if (message.content) {
                console.log(`\nAssistant: ${message.content}`);
            }
            console.log(`Model response time: ${responseTime}`);
        }
    } finally {
        readline.close();
    }
}

await runConversation();