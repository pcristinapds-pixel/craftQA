import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyze } from '../../agent/analyzer.js';
import { AppRegistry } from '../../registry/registry.js';
import { TestStatusStore } from '../../store/test-status-store.js';
import type { AgentConfig } from '../../types/config.js';

let tempDir: string;
let registryDir: string;
let statusDir: string;

describe('analyze', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sentinel-analyzer-'));
    registryDir = join(tempDir, 'registry');
    statusDir = join(tempDir, 'status');

    // Create minimal registry
    await mkdir(registryDir, { recursive: true });
    await mkdir(join(registryDir, 'selectors'), { recursive: true });
    await writeFile(
      join(registryDir, 'apps.yaml'),
      `apps:
  - id: test-app
    type: web
    url: https://example.com
    context:
      selectors: ./selectors/test-app.yaml
`,
      'utf-8',
    );
    await writeFile(
      join(registryDir, 'selectors', 'test-app.yaml'),
      `login_button: "#login"\nsubmit_button: "#submit"`,
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('should collect analysis context', async () => {
    const registry = new AppRegistry(registryDir);
    await registry.load();
    const statusStore = new TestStatusStore(statusDir);

    const config: AgentConfig = {
      appId: 'test-app',
      baseBranch: 'main',
      maxRetries: 3,
      validateEvents: false,
      diff: 'HEAD~0', // Empty diff (no changes from HEAD to HEAD)
    };

    const context = await analyze(config, registry, statusStore);

    assert.equal(context.app.id, 'test-app');
    assert.equal(context.app.type, 'web');
    assert.ok(typeof context.diff === 'string');
    assert.equal(context.prd, '');
    assert.ok(context.selectors);
    assert.equal((context.selectors as Record<string, string>).login_button, '#login');
    assert.equal(context.eventSpecs, null);
    assert.deepEqual(context.existingTests, []);
  });

  it('should throw for unknown app', async () => {
    const registry = new AppRegistry(registryDir);
    await registry.load();
    const statusStore = new TestStatusStore(statusDir);

    const config: AgentConfig = {
      appId: 'nonexistent',
      baseBranch: 'main',
      maxRetries: 3,
      validateEvents: false,
    };

    await assert.rejects(
      () => analyze(config, registry, statusStore),
      /not found in registry/,
    );
  });

  it('should load PRD when path is provided', async () => {
    const prdPath = join(tempDir, 'prd.md');
    await writeFile(prdPath, '# Test PRD\n\nSome requirements here.', 'utf-8');

    const registry = new AppRegistry(registryDir);
    await registry.load();
    const statusStore = new TestStatusStore(statusDir);

    const config: AgentConfig = {
      appId: 'test-app',
      baseBranch: 'main',
      maxRetries: 3,
      validateEvents: false,
      prdPath,
      diff: 'HEAD~0',
    };

    const context = await analyze(config, registry, statusStore);
    assert.ok(context.prd.includes('Test PRD'));
    assert.ok(context.prd.includes('Some requirements'));
  });
});
