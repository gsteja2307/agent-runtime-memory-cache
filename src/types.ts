export interface AgentCacheOptions {
  /**
   * Default time-to-live for cache entries in milliseconds.
   */
  ttl?: number;
  /**
   * Maximum number of entries the cache can hold.
   * Default is 1000.
   */
  maxSize?: number;
  /**
   * Whether to enable statistics tracking.
   * Default is false.
   */
  enableStats?: boolean;
  /**
   * Eviction policy to use when maxSize is reached.
   * Default is 'FIFO'.
   */
  evictionPolicy?: 'FIFO' | 'LRU';
  /**
   * Callback triggered whenever memory changes.
   */
  onMemoryChange?: (event: MemoryChangeEvent) => void;
  /**
   * If true, includes the complete exported state in the MemoryChangeEvent.
   */
  exportOnMemoryChange?: boolean;
  /**
   * Callback triggered when a thought list reaches its maximum capacity before old thoughts are truncated.
   * Useful for triggering LLM summarization of old thoughts.
   */
  onThoughtsFull?: (listKey: string, thoughts: Thought<any>[]) => void;
}

export interface MemoryChangeEvent {
  agentId: string;
  action: 'set' | 'del' | 'clear' | 'import';
  key?: string;
  value?: any;
  stateSnapshot?: string;
}

export interface Thought<T = any> {
  id: string;
  timestamp: number;
  content: T;
}

export interface AgentMemoryStats {
  agentId: string;
  size: number;
  hits?: number;
  misses?: number;
  evictions?: number;
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface KnowledgeDocument<T = any> {
  conceptKey: string;
  content: T;
  tags: string[];
  learnedAt: number;
}

export interface SerializedState {
  agentId: string;
  entries: { key: string; value: any }[];
}
