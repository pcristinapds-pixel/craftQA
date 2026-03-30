export interface MaestroTestInput {
  id: string;
  title: string;
  yaml: string; // Maestro YAML test content
}

export interface MaestroRunOptions {
  timeout?: number;
  appId?: string; // e.g., com.eodin.fridgify
  signal?: AbortSignal;
  onProgress?: (current: number, total: number, testTitle: string) => void;
}

export interface MaestroTestResult {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'cancelled';
  duration: number;
  error?: string;
}

export interface MaestroRunResult {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  tests: MaestroTestResult[];
}

/** Shape of Maestro CLI JSON output from `maestro test --format json` */
export interface MaestroJsonOutput {
  suites: MaestroSuite[];
}

export interface MaestroSuite {
  status: 'SUCCESS' | 'ERROR';
  flows: MaestroFlow[];
}

export interface MaestroFlow {
  name: string;
  status: 'SUCCESS' | 'ERROR';
  duration: number;
  failure?: string | null;
}
