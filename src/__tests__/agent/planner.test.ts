import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planTests } from '../../agent/planner.js';
import type { LLMClient, LLMResponse, TokenUsage } from '../../agent/llm-client.js';
import type { AnalysisContext } from '../../agent/analyzer.js';

/** Minimal mock LLM client for testing. */
function createMockClient(responses: string[]): LLMClient {
  let callIndex = 0;
  return {
    async call(_system: string, _user: string): Promise<LLMResponse> {
      const content = responses[callIndex] ?? '[]';
      callIndex++;
      return { content, usage: { inputTokens: 100, outputTokens: 50 } };
    },
    getTotalUsage(): TokenUsage {
      return { inputTokens: 100 * callIndex, outputTokens: 50 * callIndex };
    },
  };
}

const baseContext: AnalysisContext = {
  app: { id: 'test-app', type: 'web', url: 'https://example.com', context: {} },
  diff: '+ added some code',
  prd: 'Users can log in and see a dashboard',
  selectors: { login_button: '#login' },
  eventSpecs: null,
  existingTests: [],
};

describe('planTests', () => {
  it('should parse valid LLM response into PlannedTest[]', async () => {
    const validResponse = JSON.stringify([
      {
        id: 'TC-001',
        title: 'Should display login button',
        priority: 'high',
        trigger: 'prd',
        platform: 'web',
        code: 'import { test } from "@playwright/test";\ntest("login", async ({ page }) => {});',
      },
    ]);

    // First call: generate, second call: critique (returns same)
    const client = createMockClient([validResponse, validResponse]);
    const tests = await planTests(baseContext, client);

    assert.equal(tests.length, 1);
    assert.equal(tests[0].id, 'TC-001');
    assert.equal(tests[0].priority, 'high');
    assert.equal(tests[0].trigger, 'prd');
    assert.equal(tests[0].platform, 'web');
  });

  it('should handle empty LLM response', async () => {
    const client = createMockClient(['[]']);
    const tests = await planTests(baseContext, client);
    assert.equal(tests.length, 0);
  });

  it('should handle malformed JSON gracefully', async () => {
    const client = createMockClient(['this is not json']);
    const tests = await planTests(baseContext, client);
    assert.equal(tests.length, 0);
  });

  it('should strip markdown fences from response', async () => {
    const response = '```json\n' + JSON.stringify([{
      id: 'TC-002',
      title: 'Test with fences',
      priority: 'medium',
      trigger: 'diff',
      platform: 'web',
      code: 'test code here',
    }]) + '\n```';

    const client = createMockClient([response, response]);
    const tests = await planTests(baseContext, client);
    assert.equal(tests.length, 1);
    assert.equal(tests[0].id, 'TC-002');
  });

  it('should fall back to original if self-critique fails', async () => {
    const validResponse = JSON.stringify([{
      id: 'TC-003',
      title: 'Original test',
      priority: 'low',
      trigger: 'prd',
      platform: 'web',
      code: 'test code',
    }]);

    // Second call (critique) returns garbage
    const client = createMockClient([validResponse, 'invalid json']);
    const tests = await planTests(baseContext, client);
    assert.equal(tests.length, 1);
    assert.equal(tests[0].id, 'TC-003');
  });

  it('should reject tests with invalid schema fields', async () => {
    const invalidResponse = JSON.stringify([{
      id: 'TC-004',
      title: 'Bad priority',
      priority: 'ultra', // invalid
      trigger: 'prd',
      platform: 'web',
      code: 'test',
    }]);

    const client = createMockClient([invalidResponse]);
    const tests = await planTests(baseContext, client);
    assert.equal(tests.length, 0);
  });
});
