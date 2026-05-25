# agent-runtime-memory-cache

[![npm downloads](https://img.shields.io/npm/dm/agent-runtime-memory-cache.svg)](https://www.npmjs.com/package/agent-runtime-memory-cache)

A highly semantic, agent-centric memory wrapper built on top of the high-performance `runtime-memory-cache`. This package provides a robust memory architecture designed specifically for LLM-based multi-agent systems.

It allows multiple agents to have isolated, high-performance in-memory caches, track chronological thought streams, and broadcast shared memories across all agents simultaneously.

## Features

- **Agent Isolation**: Give each agent its own sandboxed memory store.
- **Chronological Thought Streams**: Dedicated APIs to track sequences of thoughts, reasoning steps, or scratchpad content.
- **Native LLM Tool Calling**: Built-in JSON Schema generation and execution router for autonomous agents (OpenAI, MCP).
- **Semantic Knowledge Graph**: Built-in fuzzy search, tag-based inverted index, and memory linking. No external Vector DB required!
- **Prompt Context Builder**: Automatically aggregate thoughts and memories into a clean markdown string for injection.
- **Global Broadcasting**: Instantly drop a memory or a thought into the minds of *all* managed agents.
- **High Performance**: Built on `runtime-memory-cache`, providing O(1) lookups, TTL support, and LRU/FIFO eviction policies.
- **Dual Output**: Supports both CommonJS (`require()`) and ES Modules (`import`).
- **Fully Typed**: Written in TypeScript with complete type definitions.

## Installation

```bash
npm install agent-runtime-memory-cache
```

## Core Concepts

### `AgentCache`
A class representing the "brain" or memory store for a single agent. It handles explicit memories (Key-Value) and chronologically ordered "thoughts".

### `MultiAgentManager`
A centralized orchestrator that manages multiple `AgentCache` instances. It ensures agents don't step on each other's toes but allows you to broadcast global contexts to all of them when needed.

---

## Usage Guide & Examples

### 1. Basic Agent Memory (Key-Value)

You can use the `MultiAgentManager` to initialize agents and store simple episodic memories.

```typescript
import { MultiAgentManager } from 'agent-runtime-memory-cache';

// Initialize the manager
const manager = new MultiAgentManager({
  ttl: 60000, // Default 1 minute TTL for memories
  maxSize: 1000 // Keep up to 1000 memories
});

// Retrieve or create a memory cache for a specific agent
const agent1 = manager.getAgent('agent-1');
const agent2 = manager.getAgent('agent-2');

// Store isolated memories
agent1.remember('current_goal', 'Find the holy grail');
agent2.remember('current_goal', 'Protect the castle');

console.log(agent1.recall('current_goal')); // "Find the holy grail"
console.log(agent2.recall('current_goal')); // "Protect the castle"

// Forget a memory
agent1.forget('current_goal');
```

### 2. Tracking "Thoughts" (Chronological Streams)

Agents often need a scratchpad to store their step-by-step reasoning. You can use the `addThought` method to maintain a chronological sequence of thoughts. It automatically handles appending new thoughts and keeping the list within a maximum limit (default: 50).

```typescript
// Add thoughts to a specific stream (e.g., 'reasoning_steps')
agent1.addThought('reasoning_steps', 'I need to cross the bridge.');
agent1.addThought('reasoning_steps', 'The bridge is guarded by a troll.');
agent1.addThought('reasoning_steps', 'I must answer his riddles.');

// Retrieve the chronologically ordered thoughts
const thoughts = agent1.getThoughts('reasoning_steps');
console.log(thoughts);
/*
[
  { id: 'x8fj2l...', timestamp: 1699999999999, content: 'I need to cross the bridge.' },
  { id: 'p9zk1m...', timestamp: 1699999999999, content: 'The bridge is guarded by a troll.' },
  { id: 'b2nc4p...', timestamp: 1699999999999, content: 'I must answer his riddles.' }
]
*/
```

### 3. Broadcasting to All Agents

Sometimes you need to inject a piece of context into *every* agent's memory simultaneously (e.g., a system-wide halt command, or a change in global environment).

```typescript
// Broadcast a standard memory
manager.broadcast('system_directive', 'DO NOT HARM HUMANS');

console.log(agent1.recall('system_directive')); // "DO NOT HARM HUMANS"
console.log(agent2.recall('system_directive')); // "DO NOT HARM HUMANS"

// Broadcast a thought to all agents
manager.broadcastThought('environment_updates', 'It started raining.');
```

### 4. Semantic Knowledge Retrieval (AI / MCP)

For advanced AI systems and Model Context Protocol (MCP) integrations, you don't want to load an agent's entire memory into the LLM context. You can use the built-in, zero-dependency **Tag-Based Inverted Index** to let agents `learn` concepts and `retrieve` them semantically.

```typescript
// The agent learns various concepts and tags them
agent1.learn('api_auth', { endpoint: '/login', method: 'POST' }, ['api', 'auth', 'backend']);
agent1.learn('api_users', { endpoint: '/users', method: 'GET' }, ['api', 'users', 'backend']);
agent1.learn('ui_login', { component: 'LoginForm' }, ['ui', 'auth', 'frontend']);

// Later, the agent needs context about "auth". 
// It retrieves only the relevant knowledge without loading everything else!
const authContext = agent1.retrieveByTags(['auth']);
/*
[
  { conceptKey: 'api_auth', content: { endpoint: '/login', method: 'POST' }, tags: ['api', 'auth', 'backend'], learnedAt: 17... },
  { conceptKey: 'ui_login', content: { component: 'LoginForm' }, tags: ['ui', 'auth', 'frontend'], learnedAt: 17... }
]
*/

// You can also require multiple tags (intersection)
const backendApiContext = agent1.retrieveByTags(['api', 'backend']);
```

### 5. Prompt Context Builder

Automatically aggregate tags and thoughts into a clean markdown string that can be injected directly into an LLM's system prompt.

```typescript
const contextString = agent1.buildContext(['auth'], ['reasoning_steps']);
// Returns a formatted string with ### Retrieved Knowledge and ### Recent Thoughts
```

### 6. Knowledge Graph (Memory Linking)

Tags are great, but sometimes concepts are related directly. You can build a lightweight graph of knowledge.

```typescript
agent1.link('api_auth', 'api_users', 'authenticates');
const links = agent1.getLinks('api_auth');
// [{ target: 'api_users', relationship: 'authenticates' }]
```

### 7. Native LLM Tool Calling (Function Calling)

Give your agent autonomous control over its memory. You can retrieve standardized JSON Tool Schemas for OpenAI/MCP and automatically execute the LLM's responses.

```typescript
// 1. Give the schemas directly to the LLM
const schemas = agent1.getToolSchemas();
// e.g. openai.chat.completions.create({ tools: schemas, ... })

// ... LLM outputs a tool call ...
const toolCall = response.choices[0].message.tool_calls[0];

// 2. The router automatically parses arguments and executes the correct memory function!
const resultStr = agent1.executeTool(toolCall.function.name, toolCall.function.arguments);
```

### 8. Fuzzy Keyword Search

If you don't know the exact tag, you can perform a zero-dependency fuzzy text search across all learned concepts.

```typescript
const searchResults = agent1.searchKnowledge('Login');
```

### 9. Thought Consolidation Hook

When an agent is thinking for a long time, the `addThought()` array eventually reaches its maximum size. You can pass an `onThoughtsFull` callback to summarize old thoughts before they are truncated!

```typescript
const smartManager = new MultiAgentManager({
  onThoughtsFull: (listKey, thoughts) => {
    console.log(`Stream ${listKey} is full! Time to summarize:`, thoughts);
    // Send to LLM to summarize, then save summary to long-term memory
  }
});
```

### 10. Multi-Server Sync (Export & Import)

If your architecture spans multiple servers, a purely in-memory cache won't sync automatically. You can seamlessly bounce an agent's brain between servers using state hydration.

```typescript
// On Server A: Export the agent's entire memory state to JSON
const stateJson = agent1.exportState();
await database.save(agent1.agentId, stateJson);

// On Server B: Wake the agent up and restore its memory
const savedState = await database.load('agent-1');
const agent1OnServerB = manager.getAgent('agent-1');
agent1OnServerB.importState(savedState);
```

### 11. Advanced: Individual Agent Options

You can override the default manager options for a specific agent if it requires a different memory capacity or eviction policy.

```typescript
const smartAgent = manager.getAgent('einstein', {
  ttl: undefined, // Memory never expires
  maxSize: 10000, // Massive capacity
  evictionPolicy: 'LRU' // Evict Least Recently Used
});
```

### 12. Event Listeners (WebSockets, DB Sync)

You can optionally configure an agent (or the manager) to trigger a callback whenever memory changes (`set`, `del`, `clear`, or `import`). This is perfect for streaming memory updates over WebSockets or writing them to a database.

```typescript
const eventAgent = manager.getAgent('event-agent-1', {
  // Triggers on any memory modification
  onMemoryChange: (event) => {
    console.log(`Agent ${event.agentId} performed a ${event.action} on key ${event.key}`);
    
    // If you enable exportOnMemoryChange, the entire exported memory JSON is included!
    if (event.stateSnapshot) {
      console.log('Full memory backup:', event.stateSnapshot);
    }
  },
  // Optionally include the full JSON state snapshot in every event
  exportOnMemoryChange: false
});

eventAgent.remember('myKey', 'myValue'); // Triggers the callback!
```

## API Reference

### `AgentCacheOptions`
- `ttl?: number`: Time-to-live in milliseconds.
- `maxSize?: number`: Maximum number of entries (default: 1000).
- `enableStats?: boolean`: Enable tracking hits, misses, etc. (default: false).
- `evictionPolicy?: 'FIFO' | 'LRU'`: Eviction policy (default: 'LRU').
- `onMemoryChange?: (event: MemoryChangeEvent) => void`: Event listener.
- `exportOnMemoryChange?: boolean`: Attach state snapshot to events.
- `onThoughtsFull?: (listKey: string, thoughts: Thought[]) => void`: Consolidation hook.

### `MultiAgentManager`
- `constructor(defaultOptions?: AgentCacheOptions)`
- `getAgent(agentId: string, options?: AgentCacheOptions): AgentCache`
- `hasAgent(agentId: string): boolean`
- `removeAgent(agentId: string): boolean`
- `getActiveAgents(): string[]`
- `broadcast<T>(key: string, value: T, ttl?: number): void`
- `broadcastThought<T>(listKey: string, content: T, maxThoughts?: number): void`
- `clearAll(): void`

### `AgentCache`
- `remember<T>(key: string, value: T, ttl?: number): void`
- `recall<T>(key: string): T | undefined`
- `forget(key: string): boolean`
- `hasMemory(key: string, skipTouch?: boolean): boolean`
- `addThought<T>(listKey: string, content: T, maxThoughts?: number): Thought<T>`
- `getThoughts<T>(listKey: string): Thought<T>[]`
- `learn<T>(conceptKey: string, content: T, tags: string[], ttl?: number): void`
- `retrieveByTags<T = any>(tags: string[]): KnowledgeDocument<T>[]`
- `forgetConcept(conceptKey: string): void`
- `buildContext(tags?: string[], thoughtKeys?: string[]): string`
- `link(conceptA: string, conceptB: string, relationship?: string): void`
- `getLinks(conceptKey: string): { target: string, relationship: string }[]`
- `searchKnowledge<T = any>(query: string): KnowledgeDocument<T>[]`
- `getToolSchemas(): ToolSchema[]`
- `executeTool(functionName: string, argumentsJson: string): string`
- `exportState(): string`
- `importState(jsonString: string): void`
- `clearMemory(): void`
- `memorySize(): number`
- `getStats(): AgentMemoryStats`
- `getUnderlyingCache(): RuntimeMemoryCache`

## License

MIT
