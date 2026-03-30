import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMaestroResult } from '../../../runners/maestro/parser.js';
import type { MaestroJsonOutput, MaestroTestInput } from '../../../runners/maestro/types.js';

describe('parseMaestroResult', () => {
  const inputs: MaestroTestInput[] = [
    { id: 'login-test', title: 'Login flow', yaml: 'appId: com.example\n---\n- launchApp' },
    { id: 'signup-test', title: 'Signup flow', yaml: 'appId: com.example\n---\n- launchApp' },
    { id: 'cart-test', title: 'Cart flow', yaml: 'appId: com.example\n---\n- launchApp' },
  ];

  it('should parse all-passing results', () => {
    const json: MaestroJsonOutput = {
      suites: [
        {
          status: 'SUCCESS',
          flows: [
            { name: 'login-test', status: 'SUCCESS', duration: 1200, failure: null },
            { name: 'signup-test', status: 'SUCCESS', duration: 800, failure: null },
            { name: 'cart-test', status: 'SUCCESS', duration: 1500, failure: null },
          ],
        },
      ],
    };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.passed, 3);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 3);
    assert.equal(result.duration, 3500);
    assert.equal(result.tests[0].id, 'login-test');
    assert.equal(result.tests[0].title, 'Login flow');
    assert.equal(result.tests[0].status, 'passed');
    assert.equal(result.tests[0].duration, 1200);
    assert.equal(result.tests[0].error, undefined);
  });

  it('should parse all-failing results', () => {
    const json: MaestroJsonOutput = {
      suites: [
        {
          status: 'ERROR',
          flows: [
            { name: 'login-test', status: 'ERROR', duration: 500, failure: 'Element not found' },
            { name: 'signup-test', status: 'ERROR', duration: 300, failure: 'Timeout' },
          ],
        },
      ],
    };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.passed, 0);
    assert.equal(result.failed, 2);
    assert.equal(result.total, 2);
    assert.equal(result.tests[0].status, 'failed');
    assert.equal(result.tests[0].error, 'Element not found');
    assert.equal(result.tests[1].error, 'Timeout');
  });

  it('should parse mixed results', () => {
    const json: MaestroJsonOutput = {
      suites: [
        {
          status: 'ERROR',
          flows: [
            { name: 'login-test', status: 'SUCCESS', duration: 1000, failure: null },
            { name: 'signup-test', status: 'ERROR', duration: 400, failure: 'Assertion failed' },
            { name: 'cart-test', status: 'SUCCESS', duration: 900, failure: null },
          ],
        },
      ],
    };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.passed, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.total, 3);
    assert.equal(result.tests[0].status, 'passed');
    assert.equal(result.tests[1].status, 'failed');
    assert.equal(result.tests[1].error, 'Assertion failed');
    assert.equal(result.tests[2].status, 'passed');
  });

  it('should handle empty suites', () => {
    const json: MaestroJsonOutput = { suites: [] };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.passed, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 0);
    assert.equal(result.duration, 0);
    assert.deepEqual(result.tests, []);
  });

  it('should handle empty flows in suite', () => {
    const json: MaestroJsonOutput = {
      suites: [{ status: 'SUCCESS', flows: [] }],
    };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.total, 0);
    assert.deepEqual(result.tests, []);
  });

  it('should handle unmatched flow names gracefully', () => {
    const json: MaestroJsonOutput = {
      suites: [
        {
          status: 'SUCCESS',
          flows: [
            { name: 'unknown-flow', status: 'SUCCESS', duration: 700, failure: null },
          ],
        },
      ],
    };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.total, 1);
    assert.equal(result.tests[0].id, 'unknown-flow');
    assert.equal(result.tests[0].title, 'unknown-flow');
    assert.equal(result.tests[0].status, 'passed');
  });

  it('should match by title when id does not match', () => {
    const json: MaestroJsonOutput = {
      suites: [
        {
          status: 'SUCCESS',
          flows: [
            { name: 'Login flow', status: 'SUCCESS', duration: 600, failure: null },
          ],
        },
      ],
    };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.tests[0].id, 'login-test');
    assert.equal(result.tests[0].title, 'Login flow');
  });

  it('should handle multiple suites', () => {
    const json: MaestroJsonOutput = {
      suites: [
        {
          status: 'SUCCESS',
          flows: [
            { name: 'login-test', status: 'SUCCESS', duration: 500, failure: null },
          ],
        },
        {
          status: 'ERROR',
          flows: [
            { name: 'signup-test', status: 'ERROR', duration: 300, failure: 'Failed' },
          ],
        },
      ],
    };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.total, 2);
    assert.equal(result.passed, 1);
    assert.equal(result.failed, 1);
  });

  it('should not include error for passed tests even if failure is empty string', () => {
    const json: MaestroJsonOutput = {
      suites: [
        {
          status: 'SUCCESS',
          flows: [
            { name: 'login-test', status: 'SUCCESS', duration: 100, failure: '' },
          ],
        },
      ],
    };

    const result = parseMaestroResult(json, inputs);

    assert.equal(result.tests[0].status, 'passed');
    assert.equal(result.tests[0].error, undefined);
  });
});
