import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonReport } from '../../../runners/playwright/runner.js';
import type { PlaywrightJsonReport, TestInput } from '../../../runners/playwright/types.js';

const testInputs: TestInput[] = [
  { id: 'TC-001', title: 'Login test', code: '' },
  { id: 'TC-002', title: 'Recipe generation', code: '' },
];

describe('parseJsonReport', () => {
  it('should parse a successful report', () => {
    const report: PlaywrightJsonReport = {
      config: {},
      suites: [
        {
          title: 'test-0.spec.ts',
          specs: [
            {
              title: 'should login successfully',
              tests: [
                {
                  results: [
                    { status: 'passed', duration: 1200 },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: 'test-1.spec.ts',
          specs: [
            {
              title: 'should generate recipe',
              tests: [
                {
                  results: [
                    { status: 'passed', duration: 2300 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = parseJsonReport(report, testInputs);

    assert.equal(result.total, 2);
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.timedOut, 0);
    assert.equal(result.duration, 3500);
    assert.equal(result.tests[0].id, 'TC-001');
    assert.equal(result.tests[0].title, 'should login successfully');
    assert.equal(result.tests[0].status, 'passed');
    assert.equal(result.tests[1].id, 'TC-002');
  });

  it('should parse failed tests with error messages', () => {
    const report: PlaywrightJsonReport = {
      config: {},
      suites: [
        {
          title: 'test-0.spec.ts',
          specs: [
            {
              title: 'should login',
              tests: [
                {
                  results: [
                    {
                      status: 'failed',
                      duration: 5000,
                      error: {
                        message: 'Expected element to be visible',
                        stack: 'Error: Expected element to be visible\n  at ...',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = parseJsonReport(report, testInputs);

    assert.equal(result.total, 1);
    assert.equal(result.passed, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.tests[0].status, 'failed');
    assert.equal(result.tests[0].error, 'Expected element to be visible');
  });

  it('should handle timedOut status', () => {
    const report: PlaywrightJsonReport = {
      config: {},
      suites: [
        {
          title: 'test-0.spec.ts',
          specs: [
            {
              title: 'slow test',
              tests: [
                {
                  results: [{ status: 'timedOut', duration: 30000 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = parseJsonReport(report, testInputs);

    assert.equal(result.timedOut, 1);
    assert.equal(result.tests[0].status, 'timedOut');
  });

  it('should handle interrupted status as failed', () => {
    const report: PlaywrightJsonReport = {
      config: {},
      suites: [
        {
          title: 'test-0.spec.ts',
          specs: [
            {
              title: 'interrupted test',
              tests: [
                {
                  results: [{ status: 'interrupted', duration: 100 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = parseJsonReport(report, testInputs);

    assert.equal(result.failed, 1);
    assert.equal(result.tests[0].status, 'failed');
  });

  it('should extract screenshot paths from attachments', () => {
    const report: PlaywrightJsonReport = {
      config: {},
      suites: [
        {
          title: 'test-0.spec.ts',
          specs: [
            {
              title: 'visual test',
              tests: [
                {
                  results: [
                    {
                      status: 'failed',
                      duration: 3000,
                      error: { message: 'Mismatch' },
                      attachments: [
                        {
                          name: 'screenshot',
                          contentType: 'image/png',
                          path: '/tmp/screenshot-1.png',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = parseJsonReport(report, testInputs);

    assert.equal(result.tests[0].screenshotPath, '/tmp/screenshot-1.png');
  });

  it('should use last result when multiple retries exist', () => {
    const report: PlaywrightJsonReport = {
      config: {},
      suites: [
        {
          title: 'test-0.spec.ts',
          specs: [
            {
              title: 'retried test',
              tests: [
                {
                  results: [
                    { status: 'failed', duration: 1000, error: { message: 'first fail' } },
                    { status: 'passed', duration: 1500 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = parseJsonReport(report, testInputs);

    assert.equal(result.passed, 1);
    assert.equal(result.tests[0].status, 'passed');
  });

  it('should handle empty suites', () => {
    const report: PlaywrightJsonReport = {
      config: {},
      suites: [],
    };

    const result = parseJsonReport(report, testInputs);

    assert.equal(result.total, 0);
    assert.equal(result.passed, 0);
    assert.equal(result.duration, 0);
  });

  it('should handle nested suites', () => {
    const report: PlaywrightJsonReport = {
      config: {},
      suites: [
        {
          title: 'test-0.spec.ts',
          specs: [],
          suites: [
            {
              title: 'describe block',
              specs: [
                {
                  title: 'nested test',
                  tests: [
                    {
                      results: [{ status: 'passed', duration: 800 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = parseJsonReport(report, testInputs);

    assert.equal(result.total, 1);
    assert.equal(result.passed, 1);
    assert.equal(result.tests[0].id, 'TC-001');
    assert.equal(result.tests[0].title, 'nested test');
  });
});
