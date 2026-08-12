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
import { t } from '../locales/index.js';

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
  logger.info(t.agentPipeline.stageAnalyze);
  const context = await analyze(agentConfig, registry, statusStore);

  // Stage 2: Plan
  logger.info(t.agentPipeline.stagePlan);
  const llmClient = new ClaudeLLMClient(sentinelConfig);
  const plannedTests = await planTests(context, llmClient);

  if (plannedTests.length === 0) {
    logger.info(t.agentPipeline.noTestsGenerated);
    return {
      status: 'passed',
      totalTests: 0,
      passed: 0,
      failed: 0,
      report: t.agentPipeline.noTestsGeneratedReportBody,
      tokenUsage: llmClient.getTotalUsage(),
    };
  }

  logger.info(t.agentPipeline.testsGenerated(plannedTests.length));

  // Stage 3: Execute
  logger.info(t.agentPipeline.stageExecute);
  const webTests = plannedTests.filter((test) => test.platform === 'web');
  const flutterTests = plannedTests.filter((test) => test.platform === 'flutter');

  let runResult: UnifiedRunResult = {
    passed: 0, failed: 0, skipped: 0, timedOut: 0,
    total: 0, duration: 0, tests: [],
  };

  if (webTests.length > 0) {
    runResult = await executeWebTests(webTests, sentinelConfig);
  }

  if (flutterTests.length > 0) {
    logger.warn(t.agentPipeline.flutterNotImplemented);
  }

  // Record results in status store
  if (runResult.tests.length > 0) {
    await statusStore.recordBatch(
      agentConfig.appId,
      runResult.tests.map((test) => ({ testId: test.id, passed: test.status === 'passed' })),
    );
  }

  // Stage 4: Report
  logger.info(t.agentPipeline.stageReport);
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
      logger.warn(t.agentPipeline.testValidationFailed(test.id, validation.errors.join(', ')));
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
    ...result.tests.map((test) => ({
      id: test.id,
      title: test.title,
      status: test.status,
      duration: test.duration,
      error: test.error,
      screenshotPath: test.screenshotPath,
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
