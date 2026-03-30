import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { parseMaestroResult } from './parser.js';
import type {
  MaestroTestInput,
  MaestroRunOptions,
  MaestroRunResult,
  MaestroTestResult,
  MaestroJsonOutput,
} from './types.js';

const DEFAULT_TIMEOUT = 300_000; // 5 minutes

/**
 * Run Maestro tests using the write-to-temp-file pattern.
 *
 * 1. Create a temp directory
 * 2. Write each test as a .yaml file
 * 3. Run `maestro test <file> --format json` via child_process.spawn
 * 4. Parse JSON output
 * 5. Cleanup temp directory
 */
export async function runMaestroTests(
  tests: MaestroTestInput[],
  options: MaestroRunOptions = {},
): Promise<MaestroRunResult> {
  const { timeout = DEFAULT_TIMEOUT, appId, signal, onProgress } = options;

  if (tests.length === 0) {
    return { passed: 0, failed: 0, total: 0, duration: 0, tests: [] };
  }

  // Check for cancellation before starting
  if (signal?.aborted) {
    return createCancelledResult(tests);
  }

  const tempDir = join(tmpdir(), `maestro-${randomUUID()}`);

  try {
    await mkdir(tempDir, { recursive: true });

    // Write YAML files to temp directory
    const yamlFiles: { input: MaestroTestInput; filePath: string }[] = [];
    for (const test of tests) {
      const filePath = join(tempDir, `${test.id}.yaml`);
      await writeFile(filePath, test.yaml, 'utf-8');
      yamlFiles.push({ input: test, filePath });
    }

    const allResults: MaestroTestResult[] = [];
    const startTime = Date.now();

    // Run each test file individually to get per-test results
    for (let i = 0; i < yamlFiles.length; i++) {
      if (signal?.aborted) {
        // Mark remaining tests as cancelled
        for (let j = i; j < yamlFiles.length; j++) {
          allResults.push({
            id: yamlFiles[j].input.id,
            title: yamlFiles[j].input.title,
            status: 'cancelled',
            duration: 0,
          });
        }
        break;
      }

      const { input, filePath } = yamlFiles[i];
      onProgress?.(i + 1, yamlFiles.length, input.title);

      const result = await runSingleTest(input, filePath, {
        timeout,
        appId,
        signal,
        tempDir,
      });
      allResults.push(result);
    }

    const totalDuration = Date.now() - startTime;
    const passed = allResults.filter((t) => t.status === 'passed').length;
    const failed = allResults.filter((t) => t.status === 'failed').length;

    return {
      passed,
      failed,
      total: allResults.length,
      duration: totalDuration,
      tests: allResults,
    };
  } finally {
    // Cleanup temp directory
    await rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors
    });
  }
}

interface SingleTestOptions {
  timeout: number;
  appId?: string;
  signal?: AbortSignal;
  tempDir: string;
}

async function runSingleTest(
  input: MaestroTestInput,
  filePath: string,
  options: SingleTestOptions,
): Promise<MaestroTestResult> {
  const { timeout, appId, signal, tempDir } = options;
  const outputFile = join(tempDir, `${input.id}-result.json`);
  const startTime = Date.now();

  return new Promise<MaestroTestResult>((resolve) => {
    const args = ['test', filePath, '--format', 'json', '--output', outputFile];
    if (appId) {
      args.push('--app-id', appId);
    }

    const child = spawn('maestro', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    let killed = false;

    // Handle cancellation via AbortSignal
    const abortHandler = () => {
      killed = true;
      child.kill('SIGTERM');
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', async (code) => {
      signal?.removeEventListener('abort', abortHandler);
      const duration = Date.now() - startTime;

      if (killed) {
        resolve({
          id: input.id,
          title: input.title,
          status: 'cancelled',
          duration,
        });
        return;
      }

      // Try to read JSON output file
      try {
        const raw = await readFile(outputFile, 'utf-8');
        const json: MaestroJsonOutput = JSON.parse(raw);
        const parsed = parseMaestroResult(json, [input]);

        if (parsed.tests.length > 0) {
          resolve(parsed.tests[0]);
        } else {
          resolve({
            id: input.id,
            title: input.title,
            status: code === 0 ? 'passed' : 'failed',
            duration,
            error: code !== 0 ? stderr.trim() || `Maestro exited with code ${code}` : undefined,
          });
        }
      } catch {
        // JSON output not available, determine result from exit code
        resolve({
          id: input.id,
          title: input.title,
          status: code === 0 ? 'passed' : 'failed',
          duration,
          error: code !== 0 ? stderr.trim() || `Maestro exited with code ${code}` : undefined,
        });
      }
    });

    child.on('error', (err) => {
      signal?.removeEventListener('abort', abortHandler);
      const duration = Date.now() - startTime;
      resolve({
        id: input.id,
        title: input.title,
        status: 'failed',
        duration,
        error: `Failed to spawn Maestro: ${err.message}`,
      });
    });
  });
}

function createCancelledResult(tests: MaestroTestInput[]): MaestroRunResult {
  return {
    passed: 0,
    failed: 0,
    total: tests.length,
    duration: 0,
    tests: tests.map((t) => ({
      id: t.id,
      title: t.title,
      status: 'cancelled' as const,
      duration: 0,
    })),
  };
}
