/**
 * Unified test run result interface.
 *
 * All runners (Playwright, Patrol) must produce results conforming to this
 * interface so that the agent pipeline can handle them uniformly.
 */
export interface UnifiedTestResult {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped';
  duration: number;
  error?: string;
  screenshotPath?: string;
}

export interface UnifiedRunResult {
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  total: number;
  duration: number;
  tests: UnifiedTestResult[];
}
