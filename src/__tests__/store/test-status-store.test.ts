import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { TestStatusStore } from '../../store/test-status-store.js';
import type { TestStatus } from '../../store/test-status-store.js';

let tempDir: string;
let store: TestStatusStore;

describe('TestStatusStore', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sentinel-test-'));
    store = new TestStatusStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('should return empty array for non-existent app', async () => {
      const result = await store.load('non-existent');
      assert.deepStrictEqual(result, []);
    });
  });

  describe('save and load round-trip', () => {
    it('should persist and retrieve statuses via YAML', async () => {
      const statuses: TestStatus[] = [
        {
          id: 'TC-001',
          status: 'stable',
          passRate: 1.0,
          runHistory: [true, true, true, true, true],
          lastRun: '2026-03-14T10:30:00.000Z',
        },
        {
          id: 'TC-002',
          status: 'quarantine',
          passRate: 0.6,
          runHistory: [true, false, true, true, false],
          lastRun: '2026-03-14T10:30:00.000Z',
          failureReason: 'Timing issue',
        },
      ];

      await store.save('my-app', statuses);
      const loaded = await store.load('my-app');

      assert.equal(loaded.length, 2);
      assert.equal(loaded[0].id, 'TC-001');
      assert.equal(loaded[0].status, 'stable');
      assert.equal(loaded[0].passRate, 1.0);
      assert.deepStrictEqual(loaded[0].runHistory, [true, true, true, true, true]);

      assert.equal(loaded[1].id, 'TC-002');
      assert.equal(loaded[1].status, 'quarantine');
      assert.equal(loaded[1].failureReason, 'Timing issue');
    });

    it('should write valid YAML to disk', async () => {
      await store.save('my-app', [
        { id: 'TC-001', status: 'new', passRate: 1, runHistory: [true], lastRun: '2026-01-01T00:00:00.000Z' },
      ]);

      const raw = await readFile(join(tempDir, 'my-app', 'status.yaml'), 'utf-8');
      const parsed = parse(raw) as { tests: TestStatus[] };
      assert.equal(parsed.tests.length, 1);
      assert.equal(parsed.tests[0].id, 'TC-001');
    });
  });

  describe('getStatus', () => {
    it('should return null for unknown test', async () => {
      const result = await store.getStatus('my-app', 'TC-999');
      assert.equal(result, null);
    });

    it('should return matching test status', async () => {
      await store.save('my-app', [
        { id: 'TC-001', status: 'stable', passRate: 1, runHistory: [true], lastRun: '2026-01-01T00:00:00.000Z' },
      ]);

      const result = await store.getStatus('my-app', 'TC-001');
      assert.notEqual(result, null);
      assert.equal(result!.id, 'TC-001');
      assert.equal(result!.status, 'stable');
    });
  });

  describe('recordRun', () => {
    it('should create new entry on first run', async () => {
      const result = await store.recordRun('my-app', 'TC-001', true);

      assert.equal(result.id, 'TC-001');
      assert.equal(result.status, 'new');
      assert.deepStrictEqual(result.runHistory, [true]);
      assert.equal(result.passRate, 1);
    });

    it('should accumulate run history', async () => {
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', false);
      const result = await store.recordRun('my-app', 'TC-001', true);

      assert.deepStrictEqual(result.runHistory, [true, false, true]);
      assert.equal(result.passRate, 2 / 3);
    });

    it('should promote to stable after 5/5 passes', async () => {
      for (let i = 0; i < 4; i++) {
        await store.recordRun('my-app', 'TC-001', true);
      }
      const result = await store.recordRun('my-app', 'TC-001', true);

      assert.equal(result.status, 'stable');
      assert.equal(result.passRate, 1);
      assert.equal(result.runHistory.length, 5);
    });

    it('should quarantine at 4/5 passes', async () => {
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', true);
      const result = await store.recordRun('my-app', 'TC-001', false);

      assert.equal(result.status, 'quarantine');
      assert.equal(result.passRate, 0.8);
    });

    it('should quarantine at 3/5 passes', async () => {
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', false);
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', false);
      const result = await store.recordRun('my-app', 'TC-001', true);

      assert.equal(result.status, 'quarantine');
      assert.equal(result.passRate, 0.6);
    });

    it('should reject at 2/5 passes', async () => {
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', false);
      await store.recordRun('my-app', 'TC-001', false);
      await store.recordRun('my-app', 'TC-001', false);
      const result = await store.recordRun('my-app', 'TC-001', true);

      assert.equal(result.status, 'rejected');
      assert.equal(result.passRate, 0.4);
    });

    it('should reject at 0/5 passes', async () => {
      for (let i = 0; i < 5; i++) {
        await store.recordRun('my-app', 'TC-001', false);
      }
      const result = await store.getStatus('my-app', 'TC-001');

      assert.equal(result!.status, 'rejected');
      assert.equal(result!.passRate, 0);
    });

    it('should keep only last 5 runs', async () => {
      // 5 failures → rejected
      for (let i = 0; i < 5; i++) {
        await store.recordRun('my-app', 'TC-001', false);
      }
      let result = await store.getStatus('my-app', 'TC-001');
      assert.equal(result!.status, 'rejected');

      // Now 5 passes → should become stable (old failures dropped)
      for (let i = 0; i < 5; i++) {
        await store.recordRun('my-app', 'TC-001', true);
      }
      result = await store.getStatus('my-app', 'TC-001');
      assert.equal(result!.status, 'stable');
      assert.equal(result!.runHistory.length, 5);
      assert.deepStrictEqual(result!.runHistory, [true, true, true, true, true]);
    });

    it('should not promote/demote with fewer than 5 runs', async () => {
      await store.recordRun('my-app', 'TC-001', false);
      await store.recordRun('my-app', 'TC-001', false);
      await store.recordRun('my-app', 'TC-001', false);
      const result = await store.recordRun('my-app', 'TC-001', false);

      // Only 4 runs — should still be 'new'
      assert.equal(result.status, 'new');
      assert.equal(result.runHistory.length, 4);
    });

    it('should calculate passRate correctly for partial history', async () => {
      await store.recordRun('my-app', 'TC-001', true);
      const result = await store.recordRun('my-app', 'TC-001', false);

      assert.equal(result.passRate, 0.5);
      assert.equal(result.runHistory.length, 2);
    });

    it('should set failureReason on quarantine', async () => {
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', false);
      const result = await store.recordRun('my-app', 'TC-001', true);

      assert.equal(result.status, 'quarantine');
      assert.ok(result.failureReason);
    });

    it('should clear failureReason on promotion to stable', async () => {
      // First get to quarantine
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', true);
      await store.recordRun('my-app', 'TC-001', false);
      await store.recordRun('my-app', 'TC-001', true);

      let result = await store.getStatus('my-app', 'TC-001');
      assert.equal(result!.status, 'quarantine');

      // Now push 5 passes
      for (let i = 0; i < 5; i++) {
        await store.recordRun('my-app', 'TC-001', true);
      }
      result = await store.getStatus('my-app', 'TC-001');
      assert.equal(result!.status, 'stable');
      assert.equal(result!.failureReason, undefined);
    });
  });
});
