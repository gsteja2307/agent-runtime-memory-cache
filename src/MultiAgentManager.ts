import { AgentCache } from './AgentCache';
import { AgentCacheOptions } from './types';

export class MultiAgentManager {
  private caches: Map<string, AgentCache> = new Map();
  private defaultOptions?: AgentCacheOptions;

  /**
   * Initialize the MultiAgentManager with optional default options for newly created agent caches.
   */
  constructor(defaultOptions?: AgentCacheOptions) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Get an existing AgentCache or create a new one if it doesn't exist.
   * @param agentId The unique identifier for the agent
   * @param options Specific options for this agent (overrides default options)
   * @returns AgentCache instance
   */
  public getAgent(agentId: string, options?: AgentCacheOptions): AgentCache {
    if (!this.caches.has(agentId)) {
      const mergedOptions = { ...this.defaultOptions, ...options };
      const cache = new AgentCache(agentId, mergedOptions);
      this.caches.set(agentId, cache);
    }
    return this.caches.get(agentId)!;
  }

  /**
   * Check if a cache exists for a given agent.
   * @param agentId The unique identifier for the agent
   */
  public hasAgent(agentId: string): boolean {
    return this.caches.has(agentId);
  }

  /**
   * Delete an agent's entire cache.
   * @param agentId The unique identifier for the agent
   * @returns boolean indicating if the agent cache existed and was deleted
   */
  public removeAgent(agentId: string): boolean {
    const cache = this.caches.get(agentId);
    if (cache) {
      cache.clearMemory();
      return this.caches.delete(agentId);
    }
    return false;
  }

  /**
   * Get an array of all active agent IDs in the manager.
   */
  public getActiveAgents(): string[] {
    return Array.from(this.caches.keys());
  }

  /**
   * Broadcast a memory to all agents managed by this manager.
   * Useful for global state or multi-agent announcements.
   * @param key The memory key
   * @param value The memory value
   * @param ttl Optional time-to-live
   */
  public broadcast<T>(key: string, value: T, ttl?: number): void {
    for (const cache of this.caches.values()) {
      cache.remember(key, value, ttl);
    }
  }

  /**
   * Broadcast a thought to a specific list across all agents.
   * @param listKey The list key
   * @param content The thought content
   * @param maxThoughts The max thoughts to keep
   */
  public broadcastThought<T>(listKey: string, content: T, maxThoughts?: number): void {
    for (const cache of this.caches.values()) {
      cache.addThought(listKey, content, maxThoughts);
    }
  }

  /**
   * Clear all caches for all agents.
   */
  public clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clearMemory();
    }
    this.caches.clear();
  }
}
