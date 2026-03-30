import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { AppRegistry } from '../registry/registry.js';
import { TestStatusStore } from '../store/test-status-store.js';
import type { AgentConfig } from '../types/config.js';
import type { AppEntry, SelectorMap, EventSpecConfig } from '../registry/types.js';
import type { TestStatus } from '../store/test-status-store.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

export interface AnalysisContext {
  app: AppEntry;
  diff: string;
  prd: string;
  selectors: SelectorMap | null;
  eventSpecs: EventSpecConfig | null;
  existingTests: TestStatus[];
}

/**
 * Analyze PR context for test generation.
 *
 * Collects: git diff, PRD content, app registry info, selectors,
 * event specs, and existing test statuses.
 */
export async function analyze(
  config: AgentConfig,
  registry: AppRegistry,
  statusStore: TestStatusStore,
): Promise<AnalysisContext> {
  // Load app from registry
  const app = registry.getApp(config.appId);
  if (!app) {
    throw new Error(`App "${config.appId}" not found in registry`);
  }

  // Collect git diff
  const diff = await collectDiff(config);

  // Load PRD
  const prd = await loadPrd(config);

  // Load selectors and event specs
  const selectors = await registry.getSelectors(config.appId);
  const eventSpecs = config.validateEvents
    ? await registry.getEventSpec(config.appId)
    : null;

  // Load existing test statuses (for quarantine info)
  const existingTests = await statusStore.load(config.appId);

  logger.info(
    `Analysis complete: diff=${diff.length} chars, prd=${prd.length} chars, ` +
    `selectors=${selectors ? 'loaded' : 'none'}, ` +
    `eventSpecs=${eventSpecs ? 'loaded' : 'none'}, ` +
    `existingTests=${existingTests.length}`,
  );

  return { app, diff, prd, selectors, eventSpecs, existingTests };
}

async function collectDiff(config: AgentConfig): Promise<string> {
  // Use explicit diff ref if provided (e.g., --diff HEAD~1)
  const diffRef = config.diff ?? `${config.baseBranch}...HEAD`;

  try {
    const { stdout } = await execFileAsync('git', ['diff', diffRef], {
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return stdout;
  } catch (err) {
    logger.warn(`git diff failed for "${diffRef}", falling back to HEAD~1`);
    try {
      const { stdout } = await execFileAsync('git', ['diff', 'HEAD~1'], {
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch {
      logger.warn('git diff HEAD~1 also failed, returning empty diff');
      return '';
    }
  }
}

async function loadPrd(config: AgentConfig): Promise<string> {
  if (!config.prdPath) {
    logger.info('No PRD path specified, skipping PRD load');
    return '';
  }

  if (!existsSync(config.prdPath)) {
    logger.warn(`PRD file not found: ${config.prdPath}`);
    return '';
  }

  return readFile(config.prdPath, 'utf-8');
}
