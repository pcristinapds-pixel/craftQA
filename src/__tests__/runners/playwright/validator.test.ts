import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateTestCode } from '../../../runners/playwright/validator.js';

describe('validateTestCode', () => {
  it('should accept valid Playwright test code', () => {
    const code = `
import { test, expect } from '@playwright/test';

test('should load page', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('h1')).toBeVisible();
});
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('should reject eval()', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { eval('alert(1)'); });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('eval()')));
  });

  it('should reject Function() constructor', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { const fn = new Function('return 1'); });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Function()')));
  });

  it('should reject child_process import', () => {
    const code = `
import { exec } from 'child_process';
import { test } from '@playwright/test';
test('bad', async () => { exec('rm -rf /'); });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('child_process')));
  });

  it('should reject node:child_process import', () => {
    const code = `
import { execSync } from 'node:child_process';
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('child_process')));
  });

  it('should reject fs module import', () => {
    const code = `
import { readFileSync } from 'fs';
import { test } from '@playwright/test';
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('"fs"')));
  });

  it('should reject fs/promises import', () => {
    const code = `
import { readFile } from 'node:fs/promises';
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('fs/promises')));
  });

  it('should reject require()', () => {
    const code = `
const fs = require('fs');
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('require()')));
  });

  it('should reject process.exit()', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { process.exit(1); });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('process.exit()')));
  });

  it('should reject process.env access', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { const key = process.env.SECRET; });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('process.env')));
  });

  it('should reject net module', () => {
    const code = `
import net from 'node:net';
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('"node:net"')));
  });

  it('should reject vm module', () => {
    const code = `
import { runInNewContext } from 'node:vm';
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('"node:vm"')));
  });

  it('should reject worker_threads module', () => {
    const code = `
import { Worker } from 'worker_threads';
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('"worker_threads"')));
  });

  it('should reject non-playwright imports', () => {
    const code = `
import axios from 'axios';
import { test } from '@playwright/test';
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('"axios" is not allowed')));
  });

  it('should reject dynamic imports of non-playwright modules', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { const m = await import('os'); });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Dynamic imports')));
  });

  it('should collect multiple errors', () => {
    const code = `
import { readFileSync } from 'fs';
import { exec } from 'child_process';
eval('bad');
process.exit(1);
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 4);
  });

  it('should allow @playwright sub-packages', () => {
    const code = `
import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, true);
  });

  it('should handle process.kill()', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { process.kill(process.pid); });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('process.kill()')));
  });

  // ── New AST-specific tests (bypass prevention) ──

  it('should reject globalThis dynamic property access', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { globalThis['ev' + 'al']('malicious'); });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('globalThis')));
  });

  it('should reject process dynamic property access', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { const e = process['en' + 'v']; });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('process')));
  });

  it('should reject global dynamic property access', () => {
    const code = `
import { test } from '@playwright/test';
test('bad', async () => { global['eval']('x'); });
`;
    const result = validateTestCode(code);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('global')));
  });
});
