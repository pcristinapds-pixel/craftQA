import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runPlaywrightTests } from '../../../runners/playwright/runner.js';
import type { TestInput } from '../../../runners/playwright/types.js';

describe('runPlaywrightTests E2E', () => {
  it('should execute a passing test against a real page', async () => {
    const tests: TestInput[] = [
      {
        id: 'TC-E2E-001',
        title: 'Load example.com',
        code: `
import { test, expect } from '@playwright/test';

test('should load example.com', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('h1')).toContainText('Example Domain');
});
`,
      },
    ];

    const result = await runPlaywrightTests(tests, {
      timeout: 15_000,
      headless: true,
    });

    assert.equal(result.total, 1);
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.tests[0].id, 'TC-E2E-001');
    assert.equal(result.tests[0].status, 'passed');
    assert.ok(result.tests[0].duration > 0);
  });

  it('should capture failures with error messages', async () => {
    const tests: TestInput[] = [
      {
        id: 'TC-E2E-002',
        title: 'Expect non-existent element',
        code: `
import { test, expect } from '@playwright/test';

test('should fail on missing element', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('#non-existent')).toBeVisible({ timeout: 2000 });
});
`,
      },
    ];

    const result = await runPlaywrightTests(tests, {
      timeout: 15_000,
      headless: true,
    });

    assert.equal(result.total, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.tests[0].status, 'failed');
    assert.ok(result.tests[0].error);
  });

  it('should run multiple tests and aggregate results', async () => {
    const tests: TestInput[] = [
      {
        id: 'TC-E2E-003',
        title: 'Passing test',
        code: `
import { test, expect } from '@playwright/test';

test('should pass', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('h1')).toBeVisible();
});
`,
      },
      {
        id: 'TC-E2E-004',
        title: 'Failing test',
        code: `
import { test, expect } from '@playwright/test';

test('should fail', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('#does-not-exist')).toBeVisible({ timeout: 2000 });
});
`,
      },
    ];

    const result = await runPlaywrightTests(tests, {
      timeout: 15_000,
      headless: true,
    });

    assert.equal(result.total, 2);
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 1);
  });

  it('should reject code with dangerous patterns before execution', async () => {
    const tests: TestInput[] = [
      {
        id: 'TC-E2E-005',
        title: 'Malicious test',
        code: `
import { readFileSync } from 'fs';
import { test } from '@playwright/test';

test('steal secrets', async () => {
  const secret = readFileSync('/etc/passwd', 'utf-8');
});
`,
      },
    ];

    const result = await runPlaywrightTests(tests, {
      timeout: 15_000,
      headless: true,
    });

    assert.equal(result.failed, 1);
    assert.ok(result.tests[0].error?.includes('validation failed'));
  });

  it('should handle cancellation via AbortSignal', async () => {
    const controller = new AbortController();

    const tests: TestInput[] = [
      {
        id: 'TC-E2E-006',
        title: 'Long running test',
        code: `
import { test } from '@playwright/test';

test('slow test', async ({ page }) => {
  await page.goto('https://example.com');
  await page.waitForTimeout(30000);
});
`,
      },
    ];

    // Cancel after 2 seconds
    setTimeout(() => controller.abort(), 2000);

    const result = await runPlaywrightTests(tests, {
      timeout: 60_000,
      headless: true,
      signal: controller.signal,
    });

    // Should be skipped/cancelled, not a normal pass
    assert.equal(result.passed, 0);
  });
});
