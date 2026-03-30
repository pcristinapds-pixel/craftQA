import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { logger } from '../utils/logger.js';

export interface TestStatus {
  id: string;
  status: 'new' | 'stable' | 'quarantine' | 'rejected';
  passRate: number;
  runHistory: boolean[];
  lastRun: string;
  failureReason?: string;
}

interface StatusFile {
  tests: TestStatus[];
}

export class TestStatusStore {
  constructor(private baseDir: string) {}

  private filePath(appId: string): string {
    return join(this.baseDir, appId, 'status.yaml');
  }

  async load(appId: string): Promise<TestStatus[]> {
    try {
      const content = await readFile(this.filePath(appId), 'utf-8');
      const data = parse(content) as StatusFile | null;
      return data?.tests ?? [];
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async save(appId: string, statuses: TestStatus[]): Promise<void> {
    const dir = join(this.baseDir, appId);
    await mkdir(dir, { recursive: true });

    const data: StatusFile = { tests: statuses };
    const content = stringify(data);
    await writeFile(this.filePath(appId), content, 'utf-8');
    logger.debug(`Saved ${statuses.length} test statuses for ${appId}`);
  }

  async getStatus(appId: string, testId: string): Promise<TestStatus | null> {
    const statuses = await this.load(appId);
    return statuses.find((s) => s.id === testId) ?? null;
  }

  async recordRun(appId: string, testId: string, passed: boolean): Promise<TestStatus> {
    const statuses = await this.load(appId);
    let entry = statuses.find((s) => s.id === testId);

    if (!entry) {
      entry = {
        id: testId,
        status: 'new',
        passRate: 0,
        runHistory: [],
        lastRun: new Date().toISOString(),
      };
      statuses.push(entry);
    }

    // Append result, keep last 5
    entry.runHistory.push(passed);
    if (entry.runHistory.length > 5) {
      entry.runHistory = entry.runHistory.slice(-5);
    }

    entry.lastRun = new Date().toISOString();

    // Calculate pass rate
    const passes = entry.runHistory.filter(Boolean).length;
    entry.passRate = passes / entry.runHistory.length;

    // Promote/demote only when 5 runs accumulated
    if (entry.runHistory.length === 5) {
      if (passes === 5) {
        entry.status = 'stable';
        delete entry.failureReason;
      } else if (passes >= 3) {
        entry.status = 'quarantine';
        entry.failureReason = entry.failureReason ?? 'Intermittent failure';
      } else {
        entry.status = 'rejected';
        entry.failureReason = entry.failureReason ?? 'Consistent failure';
      }
    }

    await this.save(appId, statuses);
    return entry;
  }
}
