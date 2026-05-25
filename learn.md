# How to Connect Agent Memory to an LLM

This guide explains how to connect your `agent-runtime-memory-cache` to an actual LLM (like OpenAI's GPT-4, Anthropic's Claude, etc.).

There are two primary ways to wire up memory to an AI Agent: **Prompt Orchestration** and **Autonomous Tool Calling**.

---

## Pattern 1: Prompt Orchestration (The Developer Controls Memory)

In this pattern, your application code manages the memory. When a user asks a question, your code searches the memory for relevant context *before* asking the LLM, and injects the context directly into the prompt.

**Best for**: RAG (Retrieval-Augmented Generation), strict guardrails, and simpler chatbots.

```typescript
import { MultiAgentManager } from 'agent-runtime-memory-cache';
import OpenAI from 'openai';

const manager = new MultiAgentManager();
const agent = manager.getAgent('support-bot');
const openai = new OpenAI({ apiKey: '...' });

// 1. Give the agent some knowledge ahead of time
agent.learn('refund_policy', 'Refunds take 3-5 business days.', ['billing', 'refunds']);
agent.learn('store_hours', 'We are open 9am to 5pm.', ['info', 'hours']);

async function handleUserChat(userMessage: string) {
  // 2. You (the developer) look up relevant memory based on the user's message
  // E.g., fuzzy searching the user's query
  const retrievedDocs = agent.searchKnowledge(userMessage); 
  
  // 3. Automatically format the retrieved context
  const memoryContextString = agent.buildContext(); // You can pass specific tags here

  // 4. Inject the memory into the System Prompt
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { 
        role: "system", 
        content: `You are a helpful assistant. Use the following memory context to answer the user:\n\n${memoryContextString}` 
      },
      { role: "user", content: userMessage }
    ]
  });

  return response.choices[0].message.content;
}
```

---

## Pattern 2: Autonomous Tool Calling (The Agent Controls Memory)

In this pattern, you give the LLM "Tools" (functions). You don't inject the entire memory into the prompt. Instead, the LLM decides on its own to call a `searchKnowledge` or `remember` function when it realizes it needs to look something up or save something for later.

**Best for**: Autonomous agents, complex workflows, and long-running assistants.

```typescript
import { MultiAgentManager } from 'agent-runtime-memory-cache';
import OpenAI from 'openai';

const manager = new MultiAgentManager();
const agent = manager.getAgent('autonomous-agent');
const openai = new OpenAI({ apiKey: '...' });

// 1. Get the pre-built Memory Tools for OpenAI
const memoryTools = agent.getToolSchemas();

async function handleAutonomousAgent(userMessage: string) {
  // 2. Let the LLM decide if it needs to use memory
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: userMessage }],
    tools: memoryTools,
    tool_choice: "auto"
  });

  const toolCall = response.choices[0].message.tool_calls?.[0];

  // 3. Route the LLM's tool call directly into the AgentCache
  if (toolCall) {
    console.log(`LLM decided to call: ${toolCall.function.name}`);
    
    // The agent automatically parses the JSON arguments and executes the right method!
    const resultString = agent.executeTool(toolCall.function.name, toolCall.function.arguments);
    
    console.log("Result of memory operation:", resultString);
    
    // You can now send this resultString back to the LLM so it knows the memory was saved/retrieved!
  }
}
```
