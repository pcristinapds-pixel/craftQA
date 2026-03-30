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

  it('should run with --app flag', async () => {
    // Runs against a non-existent app but should not crash
    // Agent will fail gracefully since app is not in registry
    const code = await runCli(['--app', 'test-app']);
    // Returns 0 because agent skeleton returns 'passed'
    assert.equal(code, 0);
  });
});
