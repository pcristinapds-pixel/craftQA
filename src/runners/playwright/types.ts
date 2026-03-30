/**
 * Input for a single test to execute.
 */
export interface TestInput {
  id: string;
  title: string;
  code: string;
}

/**
 * Options for the Playwright runner.
 */
export interface RunOptions {
  /** Test execution timeout in ms (default: 30000) */
  timeout?: number;
  /** Run in headless mode (default: true) */
  headless?: boolean;
  /** Callback for progress updates */
  onProgress?: (current: number, total: number, testTitle: string) => void;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result from a single test execution.
 */
export interface TestResult {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped';
  duration: number;
  error?: string;
  screenshotPath?: string;
}

/**
 * Aggregated result from a Playwright run.
 */
export interface RunResult {
  passed: number;
  failed: number;
  skipped: number;
  timedOut: number;
  total: number;
  duration: number;
  tests: TestResult[];
}

/**
 * Playwright JSON reporter output types (subset we care about).
 */
export interface PlaywrightJsonReport {
  config: Record<string, unknown>;
  suites: PlaywrightSuite[];
}

export interface PlaywrightSuite {
  title: string;
  specs: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

export interface PlaywrightSpec {
  title: string;
  tests: PlaywrightTest[];
}

export interface PlaywrightTest {
  results: PlaywrightTestResult[];
}

export interface PlaywrightTestResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  error?: {
    message?: string;
    stack?: string;
  };
  attachments?: PlaywrightAttachment[];
}

export interface PlaywrightAttachment {
  name: string;
  contentType: string;
  path?: string;
}
