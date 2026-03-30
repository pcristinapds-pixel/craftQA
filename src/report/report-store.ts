import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { RunResult } from '../runners/playwright/types.js';
import { generateMarkdownReport } from './markdown.js';
import type { ReportMeta } from './markdown.js';
import type { EventValidationResult } from '../event-validation/types.js';
import { logger } from '../utils/logger.js';

/**
 * Manages report storage on disk.
 * Reports are saved to: <reportsDir>/<appId>/<timestamp>/report.md
 */
export class ReportStore {
  private reportsDir: string;

  constructor(reportsDir: string) {
    this.reportsDir = reportsDir;
  }

  /**
   * Save a test run result as a Markdown report.
   * Returns the absolute path to the saved report file.
   */
  async save(
    result: RunResult,
    meta: Omit<ReportMeta, 'timestamp'>,
    eventValidation?: EventValidationResult,
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fullMeta: ReportMeta = { ...meta, timestamp };

    const reportDir = join(this.reportsDir, meta.appId, timestamp);
    await mkdir(reportDir, { recursive: true });

    // Save Markdown report
    const markdown = generateMarkdownReport(result, fullMeta, eventValidation);
    const mdPath = join(reportDir, 'report.md');
    await writeFile(mdPath, markdown, 'utf-8');

    // Save raw JSON alongside for programmatic access
    const jsonPath = join(reportDir, 'result.json');
    const jsonData: Record<string, unknown> = { ...result, meta: fullMeta };
    if (eventValidation) {
      jsonData.event_validation = eventValidation;
    }
    await writeFile(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');

    logger.info(`Report saved: ${mdPath}`);
    return mdPath;
  }

  /**
   * Get the latest report for an app.
   * Returns the Markdown content and path, or null if no reports exist.
   */
  async getLatest(appId: string): Promise<{ markdown: string; path: string; jsonResult: RunResult & { meta: ReportMeta } } | null> {
    const appDir = join(this.reportsDir, appId);

    if (!existsSync(appDir)) return null;

    const entries = await readdir(appDir);
    if (entries.length === 0) return null;

    // Sort by name (timestamp-based, so alphabetical = chronological)
    entries.sort();
    const latest = entries[entries.length - 1];
    const reportDir = join(appDir, latest);

    const mdPath = join(reportDir, 'report.md');
    const jsonPath = join(reportDir, 'result.json');

    if (!existsSync(mdPath)) return null;

    const markdown = await readFile(mdPath, 'utf-8');

    let jsonResult;
    try {
      const raw = await readFile(jsonPath, 'utf-8');
      jsonResult = JSON.parse(raw);
    } catch {
      jsonResult = null;
    }

    return { markdown, path: mdPath, jsonResult };
  }
}
