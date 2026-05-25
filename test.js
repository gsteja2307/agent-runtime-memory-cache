const assert = require('node:assert');
const { MultiAgentManager } = require('./dist/index.js');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("Running comprehensive end-to-end tests...\n");
  let passCount = 0;
  let failCount = 0;

  function runTest(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passCount++;
    } catch (error) {
      console.error(`❌ FAIL: ${name}`);
      console.error(error);
      failCount++;
    }
  }

  async function runAsyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passCount++;
    } catch (error) {
      console.error(`❌ FAIL: ${name}`);
      console.error(error);
      failCount++;
    }
  }

  const manager = new MultiAgentManager({ ttl: 60000 });

  // 1. Isolated Memory
  runTest('Isolated Agent Memory', () => {
    const a1 = manager.getAgent('a1');
    const a2 = manager.getAgent('a2');
    a1.remember('key', 'val1');
    a2.remember('key', 'val2');
    assert.strictEqual(a1.recall('key'), 'val1');
    assert.strictEqual(a2.recall('key'), 'val2');
  });

  // 2. Cache Eviction (TTL)
  await runAsyncTest('Cache TTL Eviction', async () => {
    const a = manager.getAgent('ttl-agent');
    a.remember('temp', 'data', 100); // 100ms
    assert.strictEqual(a.recall('temp'), 'data');
    await sleep(150);
    assert.strictEqual(a.recall('temp'), undefined);
  });

  // 3. Thoughts and Consolidation Hook
  runTest('Thoughts and Consolidation Hook', () => {
    let triggeredCount = 0;
    let payload = null;
    const a = new MultiAgentManager({
      onThoughtsFull: (key, thoughts) => {
        triggeredCount++;
        payload = thoughts;
      }
    }).getAgent('thought-agent');
    
    // maxThoughts is 3
    a.addThought('stream', '1', 3);
    a.addThought('stream', '2', 3);
    a.addThought('stream', '3', 3);
    assert.strictEqual(triggeredCount, 0); // Not full yet
    
    a.addThought('stream', '4', 3);
    assert.strictEqual(triggeredCount, 1);
    assert.strictEqual(payload.length, 4); // The array before slice
    assert.strictEqual(payload[0].content, '1');
    assert.strictEqual(payload[3].content, '4');
    
    const thoughts = a.getThoughts('stream');
    assert.strictEqual(thoughts.length, 3);
    assert.strictEqual(thoughts[0].content, '2');
    assert.strictEqual(thoughts[2].content, '4');
  });

  // 4. Semantic Knowledge Retrieval Edge Cases
  runTest('Semantic Knowledge Edge Cases', () => {
    const a = manager.getAgent('semantic-agent');
    a.learn('auth', { v: 1 }, ['security', 'backend']);
    a.learn('ui', { v: 2 }, ['frontend', 'react']);
    
    // Exact match
    const r1 = a.retrieveByTags(['security']);
    assert.strictEqual(r1.length, 1);
    
    // Intersection mismatch
    const r2 = a.retrieveByTags(['security', 'frontend']);
    assert.strictEqual(r2.length, 0);
    
    // Forget concept should remove from index
    a.forgetConcept('auth');
    assert.strictEqual(a.retrieveByTags(['security']).length, 0);
  });

  // 5. Fuzzy Search Edge Cases
  runTest('Fuzzy Search Case Insensitivity & Substrings', () => {
    const a = manager.getAgent('fuzzy-agent');
    a.learn('LongTermGoals', { data: 'Build an AI' }, []);
    
    const r1 = a.searchKnowledge('longterm'); // match key case-insensitive
    assert.strictEqual(r1.length, 1);
    
    const r2 = a.searchKnowledge('build'); // match content case-insensitive
    assert.strictEqual(r2.length, 1);
    
    const r3 = a.searchKnowledge('nothing');
    assert.strictEqual(r3.length, 0);
  });

  // 6. Knowledge Graph Duplicates
  runTest('Knowledge Graph Duplicates', () => {
    const a = manager.getAgent('graph-agent');
    a.link('A', 'B', 'depends');
    a.link('A', 'B', 'depends'); // duplicate
    a.link('A', 'C', 'depends');
    
    const links = a.getLinks('A');
    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].target, 'B');
    assert.strictEqual(links[1].target, 'C');
  });

  // 7. Event Listeners & State Hydration
  runTest('Event Listeners & isImporting Flag', () => {
    let events = [];
    const a = new MultiAgentManager({
      onMemoryChange: (e) => events.push(e)
    }).getAgent('event-agent');
    
    a.remember('k1', 'v1'); // event 1 (set)
    const state = a.exportState();
    
    const b = new MultiAgentManager({
      onMemoryChange: (e) => events.push(e)
    }).getAgent('event-agent');
    
    b.importState(state); // event 2 (import, skips sets)
    
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].action, 'set');
    assert.strictEqual(events[1].action, 'import');
    assert.strictEqual(b.recall('k1'), 'v1');

    const malformedImportEvents = [];
    const c = new MultiAgentManager({
      onMemoryChange: (e) => malformedImportEvents.push(e)
    }).getAgent('malformed-import-agent');

    const originalConsoleError = console.error;
    try {
      console.error = () => {};
      c.importState(JSON.stringify({
        agentId: 'malformed-import-agent',
        entries: [
          { key: 'valid-before-error', value: 'kept' },
          { key: '', value: 'invalid key' }
        ]
      }));
    } finally {
      console.error = originalConsoleError;
    }

    c.remember('after-failed-import', 'event should fire');
    assert.strictEqual(malformedImportEvents.length, 1);
    assert.strictEqual(malformedImportEvents[0].action, 'set');
    assert.strictEqual(malformedImportEvents[0].key, 'after-failed-import');
  });

  // 8. Tool Router Error Handling
  runTest('Tool Router Parsing & Execution', () => {
    const a = manager.getAgent('tool-agent');
    
    // Invalid JSON
    const res1 = JSON.parse(a.executeTool('learn_concept', 'not json'));
    assert.strictEqual(res1.success, false);
    
    // Invalid function
    const res2 = JSON.parse(a.executeTool('delete_database', '{}'));
    assert.strictEqual(res2.success, false);
    
    // Valid function
    const res3 = JSON.parse(a.executeTool('remember_kv', JSON.stringify({ key: 'a', value: 'b' })));
    assert.strictEqual(res3.success, true);
    assert.strictEqual(a.recall('a'), 'b');
  });

  console.log(`\nTests completed: ${passCount} passed, ${failCount} failed.`);
  if (failCount > 0) process.exit(1);
}

runTests();
