import { resolve } from 'node:path';
import type { AgentConfig, SentinelConfig } from '../types/config.js';
import type { UnifiedRunResult, UnifiedTestResult } from '../types/runner.js';
import { AppRegistry } from '../registry/registry.js';
import { TestStatusStore } from '../store/test-status-store.js';
import { ClaudeLLMClient } from './llm-client.js';
import { analyze } from './analyzer.js';
import { planTests } from './planner.js';
import type { PlannedTest } from './planner.js';
import { validateTestCode } from '../runners/playwright/validator.js';
import { runPlaywrightTests } from '../runners/playwright/runner.js';
import type { TestInput } from '../runners/playwright/types.js';
import { generateMarkdownReport } from '../report/markdown.js';
import { ReportStore } from '../report/report-store.js';
import { logger } from '../utils/logger.js';

export interface AgentResult {
  status: 'passed' | 'failed' | 'error';
  totalTests: number;
  passed: number;
  failed: number;
  report: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
}

/**
 * Main agent orchestrator.
 *
 * Runs the 4-stage pipeline: Analyze → Plan → Execute → Report.
 */
export async function runAgent(
  agentConfig: AgentConfig,
  sentinelConfig: SentinelConfig,
): Promise<AgentResult> {
  const registryDir = resolve(process.cwd(), 'registry');
  const reportsDir = resolve(process.cwd(), 'reports');
  const statusDir = resolve(process.cwd(), 'reports');

  const registry = new AppRegistry(registryDir);
  await registry.load();
  const statusStore = new TestStatusStore(statusDir);
  const reportStore = new ReportStore(reportsDir);

  // Stage 1: Analyze
  logger.info('Stage 1: Analyze — collecting context...');
  const context = await analyze(agentConfig, registry, statusStore);

  // Stage 2: Plan
  logger.info('Stage 2: Plan — generating test cases...');
  const llmClient = new ClaudeLLMClient(sentinelConfig);
  const plannedTests = await planTests(context, llmClient);

  if (plannedTests.length === 0) {
    logger.info('No tests generated. Nothing to execute.');
    return {
      status: 'passed',
      totalTests: 0,
      passed: 0,
      failed: 0,
      report: 'No tests were generated for this PR.',
      tokenUsage: llmClient.getTotalUsage(),
    };
  }

  logger.info(`Generated ${plannedTests.length} test(s)`);

  // Stage 3: Execute
  logger.info('Stage 3: Execute — running tests...');
  const webTests = plannedTests.filter((t) => t.platform === 'web');
  const flutterTests = plannedTests.filter((t) => t.platform === 'flutter');

  let runResult: UnifiedRunResult = {
    passed: 0, failed: 0, skipped: 0, timedOut: 0,
    total: 0, duration: 0, tests: [],
  };

  if (webTests.length > 0) {
    runResult = await executeWebTests(webTests, sentinelConfig);
  }

  if (flutterTests.length > 0) {
    logger.warn('Flutter/Patrol execution not yet implemented. Skipping Flutter tests.');
  }

  // Record results in status store
  if (runResult.tests.length > 0) {
    await statusStore.recordBatch(
      agentConfig.appId,
      runResult.tests.map((t) => ({ testId: t.id, passed: t.status === 'passed' })),
    );
  }

  // Stage 4: Report
  logger.info('Stage 4: Report — generating report...');
  const report = generateMarkdownReport(
    { ...runResult, total: runResult.tests.length },
    {
      appId: agentConfig.appId,
      suite: 'auto',
      platform: webTests.length > 0 ? 'web' : 'flutter',
      timestamp: new Date().toISOString(),
    },
  );

  await reportStore.save(
    { ...runResult, total: runResult.tests.length },
    { appId: agentConfig.appId, suite: 'auto', platform: 'web' },
  );

  const hasFailures = runResult.failed > 0 || runResult.timedOut > 0;

  return {
    status: hasFailures ? 'failed' : 'passed',
    totalTests: runResult.tests.length,
    passed: runResult.passed,
    failed: runResult.failed + runResult.timedOut,
    report,
    tokenUsage: llmClient.getTotalUsage(),
  };
}

/**
 * Validate and execute web (Playwright) tests.
 */
async function executeWebTests(
  tests: PlannedTest[],
  config: SentinelConfig,
): Promise<UnifiedRunResult> {
  // Validate all test code before execution
  const validTests: TestInput[] = [];
  const skippedTests: UnifiedTestResult[] = [];

  for (const test of tests) {
    const validation = validateTestCode(test.code);
    if (validation.valid) {
      validTests.push({ id: test.id, title: test.title, code: test.code });
    } else {
      logger.warn(`Test ${test.id} failed validation: ${validation.errors.join(', ')}`);
      skippedTests.push({
        id: test.id,
        title: test.title,
        status: 'skipped',
        duration: 0,
        error: `Validation failed: ${validation.errors.join('; ')}`,
      });
    }
  }

  if (validTests.length === 0) {
    return {
      passed: 0, failed: 0, skipped: skippedTests.length, timedOut: 0,
      total: skippedTests.length, duration: 0, tests: skippedTests,
    };
  }

  // Execute via Playwright
  const result = await runPlaywrightTests(validTests, {
    timeout: config.test.timeout,
  });

  // Merge skipped + executed results
  const allTests: UnifiedTestResult[] = [
    ...result.tests.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      duration: t.duration,
      error: t.error,
      screenshotPath: t.screenshotPath,
    })),
    ...skippedTests,
  ];

  return {
    passed: result.passed,
    failed: result.failed,
    skipped: result.skipped + skippedTests.length,
    timedOut: result.timedOut,
    total: allTests.length,
    duration: result.duration,
    tests: allTests,
  };
}
