import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadYaml } from '../utils/yaml-loader.js';
import { sentinelConfigSchema } from '../types/config.js';
import type { SentinelConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

const CONFIG_FILENAMES = [
  'sentinel-qa.config.yaml',
  'sentinel-qa.config.yml',
];

/**
 * Load sentinel-qa configuration from YAML file + environment variable overrides.
 *
 * Searches for config files in the given directory (or cwd).
 * Falls back to defaults if no config file is found.
 */
export async function loadConfig(baseDir?: string): Promise<SentinelConfig> {
  const dir = baseDir ?? process.cwd();
  let raw: Record<string, unknown> = {};

  for (const filename of CONFIG_FILENAMES) {
    const configPath = resolve(dir, filename);
    if (existsSync(configPath)) {
      raw = await loadYaml<Record<string, unknown>>(configPath);
      logger.info(`Loaded config from ${configPath}`);
      break;
    }
  }

  // Environment variable overrides
  if (process.env.ANTHROPIC_API_KEY && !raw.anthropic) {
    raw.anthropic = {};
  }
  if (process.env.SLACK_WEBHOOK_URL) {
    const slack = (raw.slack ?? {}) as Record<string, unknown>;
    slack.webhook_url = process.env.SLACK_WEBHOOK_URL;
    raw.slack = slack;
  }

  return sentinelConfigSchema.parse(raw);
}
