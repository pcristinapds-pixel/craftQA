import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import type {
  TestInput,
  RunOptions,
  RunResult,
  TestResult,
  PlaywrightJsonReport,
  PlaywrightSuite,
  PlaywrightSpec,
} from './types.js';
import { validateTestCode } from './validator.js';

const DEFAULT_TIMEOUT = 30_000;

/**
 * Generates a Playwright config file content for the temp directory.
 */
function generateConfig(options: RunOptions): string {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const headless = options.headless ?? true;

  return `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: ${timeout},
  use: {
    headless: ${headless},
    screenshot: 'only-on-failure',
  },
  reporter: [['json', { outputFile: 'results.json' }]],
  testDir: '.',
  testMatch: '**/*.spec.ts',
});
`.trimStart();
}

/**
 * Parse Playwright JSON reporter output into structured RunResult.
 */
export function parseJsonReport(
  report: PlaywrightJsonReport,
  testInputs: TestInput[],
): RunResult {
  const tests: TestResult[] = [];
  const idMap = new Map(testInputs.map((t, i) => [`test-${i}.spec.ts`, t.id]));

  function extractFromSuites(suites: PlaywrightSuite[]): void {
    for (const suite of suites) {
      // The suite title is the spec file name
      const testId = idMap.get(suite.title) ?? suite.title;

      for (const spec of suite.specs) {
        extractFromSpec(spec, testId);
      }

      if (suite.suites) {
        // Nested suites inherit the parent's file context
        for (const nested of suite.suites) {
          const nestedId = idMap.get(nested.title) ?? testId;
          for (const spec of nested.specs) {
            extractFromSpec(spec, nestedId);
          }
          if (nested.suites) {
            extractFromSuites(nested.suites);
          }
        }
      }
    }
  }

  function extractFromSpec(spec: PlaywrightSpec, testId: string): void {
    for (const test of spec.tests) {
      const lastResult = test.results[test.results.length - 1];
      if (!lastResult) continue;

      const status =
        lastResult.status === 'interrupted' ? 'failed' : lastResult.status;

      const screenshotAttachment = lastResult.attachments?.find(
        (a) => a.name === 'screenshot' && a.path,
      );

      tests.push({
        id: testId,
        title: spec.title,
        status,
        duration: lastResult.duration,
        error: lastResult.error?.message ?? lastResult.error?.stack,
        screenshotPath: screenshotAttachment?.path,
      });
    }
  }

  extractFromSuites(report.suites);

  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  const timedOut = tests.filter((t) => t.status === 'timedOut').length;
  const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);

  return {
    passed,
    failed,
    skipped,
    timedOut,
    total: tests.length,
    duration: totalDuration,
    tests,
  };
}

/**
 * Execute Playwright tests using the write-to-temp-file pattern.
 *
 * 1. Creates a temp directory
 * 2. Writes test code as .spec.ts files
 * 3. Writes a playwright.config.ts
 * 4. Runs `npx playwright test` via child_process
 * 5. Parses JSON results
 * 6. Cleans up temp directory
 */
export async function runPlaywrightTests(
  tests: TestInput[],
  options: RunOptions = {},
): Promise<RunResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'sentinel-pw-'));

  try {
    // Validate all test code before writing
    for (const test of tests) {
      const validation = validateTestCode(test.code);
      if (!validation.valid) {
        return {
          passed: 0,
          failed: tests.length,
          skipped: 0,
          timedOut: 0,
          total: tests.length,
          duration: 0,
          tests: tests.map((t) => ({
            id: t.id,
            title: t.title,
            status: 'failed' as const,
            duration: 0,
            error: t.id === test.id
              ? `Code validation failed: ${validation.errors.join('; ')}`
              : 'Skipped due to validation failure in another test',
          })),
        };
      }
    }

    // Write config
    await writeFile(join(tmpDir, 'playwright.config.ts'), generateConfig(options));

    // Write test files
    for (let i = 0; i < tests.length; i++) {
      const fileName = `test-${i}.spec.ts`;
      await writeFile(join(tmpDir, fileName), tests[i].code);
    }

    // Run playwright
    const exitCode = await runPlaywrightProcess(tmpDir, options);

    // Parse results
    const resultsPath = join(tmpDir, 'results.json');
    let report: PlaywrightJsonReport;

    try {
      const raw = await readFile(resultsPath, 'utf-8');
      report = JSON.parse(raw) as PlaywrightJsonReport;
    } catch {
      // If JSON results file doesn't exist (e.g., process was killed),
      // return a failure result.
      if (options.signal?.aborted) {
        return {
          passed: 0,
          failed: 0,
          skipped: tests.length,
          timedOut: 0,
          total: tests.length,
          duration: 0,
          tests: tests.map((t) => ({
            id: t.id,
            title: t.title,
            status: 'skipped' as const,
            duration: 0,
            error: 'Test run was cancelled',
          })),
        };
      }

      return {
        passed: 0,
        failed: tests.length,
        skipped: 0,
        timedOut: 0,
        total: tests.length,
        duration: 0,
        tests: tests.map((t) => ({
          id: t.id,
          title: t.title,
          status: 'failed' as const,
          duration: 0,
          error: `Playwright exited with code ${exitCode} — no results file produced`,
        })),
      };
    }

    return parseJsonReport(report, tests);
  } finally {
    // Cleanup temp directory
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Spawn the Playwright test process.
 * Returns the exit code.
 */
/**
 * Resolve the path to the Playwright CLI binary from our own node_modules.
 */
function resolvePlaywrightCli(): string {
  const require = createRequire(import.meta.url);
  const playwrightPath = require.resolve('@playwright/test/cli');
  return playwrightPath;
}

function runPlaywrightProcess(
  cwd: string,
  options: RunOptions,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const playwrightCli = resolvePlaywrightCli();
    const args = [playwrightCli, 'test', '--config', 'playwright.config.ts'];

    // Resolve the node_modules directory so temp-dir tests can find @playwright/test
    const nodeModulesDir = join(dirname(playwrightCli), '..', '..');

    const child = spawn('node', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NODE_PATH: nodeModulesDir,
      },
    });

    let stderr = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();

      // Parse progress from Playwright line reporter output on stderr
      if (options.onProgress) {
        const lines = stderr.split('\n');
        const progressLine = [...lines].reverse().find((l: string) => l.includes('passed') || l.includes('failed'));
        if (progressLine) {
          const match = progressLine.match(/(\d+)\s+passed/);
          if (match) {
            const current = parseInt(match[1], 10);
            options.onProgress(current, -1, progressLine.trim());
          }
        }
      }
    });

    // Handle cancellation
    if (options.signal) {
      if (options.signal.aborted) {
        child.kill('SIGTERM');
        resolve(1);
        return;
      }
      options.signal.addEventListener('abort', () => {
        child.kill('SIGTERM');
      }, { once: true });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}
