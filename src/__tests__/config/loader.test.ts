import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../../config/loader.js';

let tempDir: string;

describe('loadConfig', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sentinel-config-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('should return defaults when no config file exists', async () => {
    const config = await loadConfig(tempDir);
    assert.equal(config.anthropic.model, 'claude-sonnet-4-20250514');
    assert.equal(config.test.max_retries, 3);
    assert.equal(config.test.confidence_threshold, 0.7);
    assert.equal(config.cost.track_tokens, true);
    assert.equal(config.cost.max_tokens_per_run, 100_000);
  });

  it('should load config from sentinel-qa.config.yaml', async () => {
    await writeFile(
      join(tempDir, 'sentinel-qa.config.yaml'),
      `
anthropic:
  model: claude-opus-4-20250514
  max_tokens: 8192
test:
  max_retries: 5
  confidence_threshold: 0.8
`,
      'utf-8',
    );

    const config = await loadConfig(tempDir);
    assert.equal(config.anthropic.model, 'claude-opus-4-20250514');
    assert.equal(config.anthropic.max_tokens, 8192);
    assert.equal(config.test.max_retries, 5);
    assert.equal(config.test.confidence_threshold, 0.8);
    // Defaults still apply for unset fields
    assert.equal(config.cost.track_tokens, true);
  });

  it('should also accept .yml extension', async () => {
    await writeFile(
      join(tempDir, 'sentinel-qa.config.yml'),
      `
anthropic:
  model: custom-model
`,
      'utf-8',
    );

    const config = await loadConfig(tempDir);
    assert.equal(config.anthropic.model, 'custom-model');
  });
});
