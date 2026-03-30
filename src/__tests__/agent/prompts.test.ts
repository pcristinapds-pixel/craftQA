import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildUserPrompt, buildCritiquePrompt } from '../../agent/prompts.js';
import type { AnalysisContext } from '../../agent/analyzer.js';

describe('buildSystemPrompt', () => {
  it('should include Playwright rules for web platform', () => {
    const prompt = buildSystemPrompt('web');
    assert.ok(prompt.includes('Playwright'));
    assert.ok(prompt.includes('waitForTimeout'));
    assert.ok(prompt.includes('@playwright/test'));
    assert.ok(prompt.includes('JSON array'));
  });

  it('should include Patrol rules for flutter platform', () => {
    const prompt = buildSystemPrompt('flutter');
    assert.ok(prompt.includes('Patrol'));
    assert.ok(prompt.includes('patrolTest'));
  });
});

describe('buildUserPrompt', () => {
  const baseContext: AnalysisContext = {
    app: { id: 'test-app', type: 'web', url: 'https://example.com', context: {} },
    diff: '+ some changes',
    prd: '# My PRD\nSome requirements',
    selectors: { btn: '#submit' },
    eventSpecs: null,
    existingTests: [],
  };

  it('should include PRD, diff, and selectors', () => {
    const prompt = buildUserPrompt(baseContext);
    assert.ok(prompt.includes('My PRD'));
    assert.ok(prompt.includes('some changes'));
    assert.ok(prompt.includes('#submit'));
  });

  it('should include stable tests for deduplication', () => {
    const context: AnalysisContext = {
      ...baseContext,
      existingTests: [
        { id: 'TC-OLD', status: 'stable', passRate: 1, runHistory: [], lastRun: '' },
        { id: 'TC-FLAKY', status: 'quarantine', passRate: 0.6, runHistory: [], lastRun: '' },
      ],
    };
    const prompt = buildUserPrompt(context);
    assert.ok(prompt.includes('TC-OLD'));
    assert.ok(!prompt.includes('TC-FLAKY')); // Only stable tests listed
  });

  it('should truncate very long diffs', () => {
    const context: AnalysisContext = {
      ...baseContext,
      diff: 'x'.repeat(20_000),
    };
    const prompt = buildUserPrompt(context);
    assert.ok(prompt.includes('truncated'));
    assert.ok(prompt.length < 20_000);
  });
});

describe('buildCritiquePrompt', () => {
  it('should include the generated tests', () => {
    const prompt = buildCritiquePrompt('[{"id": "TC-001"}]');
    assert.ok(prompt.includes('TC-001'));
    assert.ok(prompt.includes('security violations'));
    assert.ok(prompt.includes('auto-retry'));
  });
});
