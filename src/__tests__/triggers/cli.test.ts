import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../../triggers/cli.js';

describe('runCli', () => {
  it('should show help and return 0', async () => {
    const code = await runCli(['--help']);
    assert.equal(code, 0);
  });

  it('should fail without --app', async () => {
    const code = await runCli([]);
    assert.equal(code, 1);
  });

  it('should return 1 when app not found in registry', async () => {
    // Agent will throw because the app is not in registry
    const code = await runCli(['--app', 'nonexistent-app']);
    assert.equal(code, 1);
  });
});
