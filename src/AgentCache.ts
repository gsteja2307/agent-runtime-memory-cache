import RuntimeMemoryCache from 'runtime-memory-cache';
import { AgentCacheOptions, Thought, AgentMemoryStats } from './types';

export class AgentCache {
  public readonly agentId: string;
  private cache: RuntimeMemoryCache;
  private options?: AgentCacheOptions;
  private isImporting: boolean = false;

  constructor(agentId: string, options?: AgentCacheOptions) {
    this.agentId = agentId;
    this.options = options;
    this.cache = new RuntimeMemoryCache({
      ttl: options?.ttl,
      maxSize: options?.maxSize ?? 1000,
      enableStats: options?.enableStats ?? false,
      evictionPolicy: options?.evictionPolicy ?? 'LRU', // default to LRU for agent memories
    });
  }

  /**
   * Remember a specific value associated with a key.
   * @param key The memory key
   * @param value The memory value
   * @param ttl Optional time-to-live for this specific memory
   */
  public remember<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, ttl);
    this.triggerChangeEvent('set', key, value);
  }

  /**
   * Recall a value associated with a key.
   * @param key The memory key
   * @returns The memory value or undefined if not found/expired
   */
  public recall<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  /**
   * Forget a specific memory.
   * @param key The memory key
   * @returns boolean indicating if the memory existed and was forgotten
   */
  public forget(key: string): boolean {
    const existed = this.cache.del(key);
    if (existed) {
      this.triggerChangeEvent('del', key);
    }
    return existed;
  }

  /**
   * Check if the agent remembers a specific key.
   * @param key The memory key
   * @param skipTouch If true, does not update the LRU access time
   * @returns boolean indicating existence
   */
  public hasMemory(key: string, skipTouch?: boolean): boolean {
    return this.cache.has(key, skipTouch);
  }

  /**
   * Append a thought to a chronological list of thoughts.
   * @param listKey The key representing the list of thoughts (e.g., 'recent_thoughts')
   * @param content The thought content
   * @param maxThoughts The maximum number of thoughts to keep in this list
   */
  public addThought<T>(listKey: string, content: T, maxThoughts: number = 50): Thought<T> {
    const thought: Thought<T> = {
      id: Math.random().toString(36).substring(2, 11), // Simple UUID equivalent
      timestamp: Date.now(),
      content,
    };

    let thoughts = this.recall<Thought<T>[]>(listKey) || [];
    thoughts.push(thought);

    // Trigger hook if we exceed capacity
    if (thoughts.length > maxThoughts) {
      if (this.options?.onThoughtsFull) {
        this.options.onThoughtsFull(listKey, [...thoughts]);
      }
      // Keep only the last `maxThoughts` thoughts
      thoughts = thoughts.slice(thoughts.length - maxThoughts);
    }

    this.remember(listKey, thoughts);
    return thought;
  }

  /**
   * Get the chronological list of thoughts for a specific list key.
   * @param listKey The key representing the list of thoughts
   * @returns Array of thoughts
   */
  public getThoughts<T>(listKey: string): Thought<T>[] {
    return this.recall<Thought<T>[]>(listKey) || [];
  }

  /**
   * Clear all memories for this agent.
   */
  public clearMemory(): void {
    this.cache.clear();
    this.triggerChangeEvent('clear');
  }

  /**
   * Get the size of the agent's memory.
   */
  public memorySize(): number {
    return this.cache.size();
  }

  /**
   * Get memory statistics for the agent (if enableStats was true).
   */
  public getStats(): AgentMemoryStats {
    const stats = this.cache.getStats();
    return {
      agentId: this.agentId,
      size: this.cache.size(),
      hits: stats?.hits,
      misses: stats?.misses,
      evictions: stats?.evictions,
    };
  }

  /**
   * Get the underlying RuntimeMemoryCache instance for advanced usage.
   */
  public getUnderlyingCache(): RuntimeMemoryCache {
    return this.cache;
  }

  /**
   * Export the agent's memory state as a JSON string.
   */
  public exportState(): string {
    const keys = this.cache.keys();
    const entries = keys.map(key => ({
      key,
      value: this.cache.get(key)
    })).filter(entry => entry.value !== undefined);

    return JSON.stringify({
      agentId: this.agentId,
      entries
    });
  }

  /**
   * Import memory state from a JSON string.
   */
  public importState(jsonString: string): void {
    let importCompleted = false;

    try {
      const state = JSON.parse(jsonString);
      if (state.agentId === this.agentId && Array.isArray(state.entries)) {
        this.isImporting = true;
        for (const entry of state.entries) {
          this.remember(entry.key, entry.value);
        }
        importCompleted = true;
      }
    } catch (err) {
      console.error(`Failed to import state for agent ${this.agentId}`, err);
    } finally {
      this.isImporting = false;
    }

    if (importCompleted) {
      this.triggerChangeEvent('import');
    }
  }

  private triggerChangeEvent(action: 'set' | 'del' | 'clear' | 'import', key?: string, value?: any) {
    if (this.isImporting && action !== 'import') return;
    if (this.options?.onMemoryChange) {
      const event: import('./types').MemoryChangeEvent = {
        agentId: this.agentId,
        action,
        key,
        value,
      };
      if (this.options.exportOnMemoryChange) {
        event.stateSnapshot = this.exportState();
      }
      this.options.onMemoryChange(event);
    }
  }

  /**
   * Learn a concept and index it by tags for later retrieval.
   * @param conceptKey Unique key for the concept
   * @param content The actual knowledge content
   * @param tags Array of tags for semantic retrieval
   * @param ttl Optional time-to-live
   */
  public learn<T>(conceptKey: string, content: T, tags: string[], ttl?: number): void {
    const doc = {
      conceptKey,
      content,
      tags,
      learnedAt: Date.now()
    };
    
    // Store the document itself
    this.remember(`__doc__${conceptKey}`, doc, ttl);

    // Update the master index
    const allConcepts = this.recall<string[]>('__all_concepts__') || [];
    if (!allConcepts.includes(conceptKey)) {
      allConcepts.push(conceptKey);
      this.remember('__all_concepts__', allConcepts);
    }

    // Update the inverted index for each tag
    for (const tag of tags) {
      const indexKey = `__tag__${tag}`;
      const existingKeys = this.recall<string[]>(indexKey) || [];
      if (!existingKeys.includes(conceptKey)) {
        existingKeys.push(conceptKey);
        this.remember(indexKey, existingKeys); // The index itself does not expire automatically. For advanced use cases, cleanup might be needed.
      }
    }
  }

  /**
   * Retrieve learned concepts that match ALL provided tags.
   */
  public retrieveByTags<T = any>(tags: string[]): import('./types').KnowledgeDocument<T>[] {
    if (tags.length === 0) return [];

    // Find concept keys that match the first tag
    let matchingKeys = this.recall<string[]>(`__tag__${tags[0]}`) || [];

    // Intersect with concept keys from other tags
    for (let i = 1; i < tags.length; i++) {
      if (matchingKeys.length === 0) break;
      const tagKeys = this.recall<string[]>(`__tag__${tags[i]}`) || [];
      matchingKeys = matchingKeys.filter(key => tagKeys.includes(key));
    }

    // Retrieve the actual documents
    const results: import('./types').KnowledgeDocument<T>[] = [];
    for (const key of matchingKeys) {
      const doc = this.recall<import('./types').KnowledgeDocument<T>>(`__doc__${key}`);
      if (doc) {
        results.push(doc);
      }
    }
    return results;
  }

  /**
   * Forget a learned concept and remove it from the tag index.
   */
  public forgetConcept(conceptKey: string): void {
    const doc = this.recall<import('./types').KnowledgeDocument<any>>(`__doc__${conceptKey}`);
    if (doc && doc.tags) {
      for (const tag of doc.tags) {
        const indexKey = `__tag__${tag}`;
        let existingKeys = this.recall<string[]>(indexKey) || [];
        existingKeys = existingKeys.filter(k => k !== conceptKey);
        if (existingKeys.length === 0) {
          this.forget(indexKey);
        } else {
          this.remember(indexKey, existingKeys);
        }
      }
    }
    this.forget(`__doc__${conceptKey}`);

    const allConcepts = this.recall<string[]>('__all_concepts__') || [];
    const updatedConcepts = allConcepts.filter(k => k !== conceptKey);
    if (updatedConcepts.length === 0) {
      this.forget('__all_concepts__');
    } else {
      this.remember('__all_concepts__', updatedConcepts);
    }
  }

  /**
   * Builds a formatted string containing retrieved semantic knowledge and chronological thoughts, ready to be injected into an LLM prompt.
   * @param tags Tags to retrieve semantic knowledge
   * @param thoughtKeys Keys of thought streams to include
   */
  public buildContext(tags?: string[], thoughtKeys?: string[]): string {
    let context = "";

    if (tags && tags.length > 0) {
      const docs = this.retrieveByTags(tags);
      if (docs.length > 0) {
        context += "### Retrieved Knowledge:\n";
        docs.forEach(doc => {
          context += `- [${doc.conceptKey}]: ${typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content)}\n`;
        });
        context += "\n";
      }
    }

    if (thoughtKeys && thoughtKeys.length > 0) {
      thoughtKeys.forEach(key => {
        const thoughts = this.getThoughts(key);
        if (thoughts.length > 0) {
          context += `### Recent Thoughts (${key}):\n`;
          thoughts.forEach(t => {
            context += `- ${typeof t.content === 'string' ? t.content : JSON.stringify(t.content)}\n`;
          });
          context += "\n";
        }
      });
    }

    return context.trim();
  }

  /**
   * Link two concepts together to build a knowledge graph.
   * @param conceptA The source concept key
   * @param conceptB The target concept key
   * @param relationship Optional description of the relationship
   */
  public link(conceptA: string, conceptB: string, relationship: string = 'related_to'): void {
    const linkKey = `__link__${conceptA}`;
    const links = this.recall<{ target: string, relationship: string }[]>(linkKey) || [];
    // Prevent duplicates
    if (!links.some(l => l.target === conceptB && l.relationship === relationship)) {
      links.push({ target: conceptB, relationship });
      this.remember(linkKey, links); // No TTL for links
    }
  }

  /**
   * Get all links for a specific concept.
   */
  public getLinks(conceptKey: string): { target: string, relationship: string }[] {
    return this.recall<{ target: string, relationship: string }[]>(`__link__${conceptKey}`) || [];
  }

  /**
   * Performs a fuzzy text search across all learned knowledge content and concept keys.
   * @param query The search string
   */
  public searchKnowledge<T = any>(query: string): import('./types').KnowledgeDocument<T>[] {
    const lowerQuery = query.toLowerCase();
    const results: import('./types').KnowledgeDocument<T>[] = [];
    const allConcepts = this.recall<string[]>('__all_concepts__') || [];

    for (const conceptKey of allConcepts) {
      const doc = this.recall<import('./types').KnowledgeDocument<T>>(`__doc__${conceptKey}`);
      if (doc) {
        // Check conceptKey
        if (doc.conceptKey.toLowerCase().includes(lowerQuery)) {
          results.push(doc);
          continue;
        }
        // Check stringified content
        const contentStr = typeof doc.content === 'string' ? doc.content.toLowerCase() : JSON.stringify(doc.content).toLowerCase();
        if (contentStr.includes(lowerQuery)) {
          results.push(doc);
        }
      }
    }
    return results;
  }

  /**
   * Returns an array of standardized JSON Tool Schemas (OpenAI format) for the agent's memory capabilities.
   */
  public getToolSchemas(): import('./types').ToolSchema[] {
    return [
      {
        type: 'function',
        function: {
          name: 'learn_concept',
          description: 'Store a new concept or knowledge in long-term memory with semantic tags.',
          parameters: {
            type: 'object',
            properties: {
              conceptKey: { type: 'string', description: 'A unique identifier for this concept' },
              content: { type: 'string', description: 'The actual knowledge content to store' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Semantic tags for later retrieval' }
            },
            required: ['conceptKey', 'content', 'tags']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_knowledge',
          description: 'Perform a fuzzy search across your learned knowledge concepts.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The search query to match against concepts' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'add_thought',
          description: 'Append a thought or reasoning step to a chronological scratchpad/list.',
          parameters: {
            type: 'object',
            properties: {
              listKey: { type: 'string', description: 'The name of the thought stream (e.g., "reasoning", "scratchpad")' },
              content: { type: 'string', description: 'The thought to append' }
            },
            required: ['listKey', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'remember_kv',
          description: 'Save a simple key-value memory.',
          parameters: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'The memory key' },
              value: { type: 'string', description: 'The memory value' }
            },
            required: ['key', 'value']
          }
        }
      }
    ];
  }

  /**
   * A router that parses an LLM's tool call arguments and executes the corresponding memory function internally.
   * @param functionName The name of the tool called by the LLM
   * @param argumentsJson The JSON string of arguments provided by the LLM
   * @returns A stringified result of the operation
   */
  public executeTool(functionName: string, argumentsJson: string): string {
    try {
      const args = JSON.parse(argumentsJson);
      
      switch (functionName) {
        case 'learn_concept':
          this.learn(args.conceptKey, args.content, args.tags);
          return JSON.stringify({ success: true, message: `Learned concept '${args.conceptKey}'.` });
          
        case 'search_knowledge':
          const results = this.searchKnowledge(args.query);
          return JSON.stringify({ success: true, count: results.length, data: results });
          
        case 'add_thought':
          this.addThought(args.listKey, args.content);
          return JSON.stringify({ success: true, message: `Added thought to '${args.listKey}'.` });
          
        case 'remember_kv':
          this.remember(args.key, args.value);
          return JSON.stringify({ success: true, message: `Remembered '${args.key}'.` });
          
        default:
          return JSON.stringify({ success: false, error: `Unknown tool function: ${functionName}` });
      }
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  }
}
