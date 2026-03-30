import { parseArgs } from 'node:util';
import { agentConfigSchema } from '../types/config.js';
import { loadConfig } from '../config/loader.js';
import { runAgent } from '../agent/index.js';
import { logger } from '../utils/logger.js';

function printHelp(): void {
  console.log(`
sentinel-qa — Autonomous QA agent

Usage:
  sentinel-qa run [options]

Options:
  --app <id>              App ID from registry/apps.yaml (required)
  --pr <number>           GitHub PR number
  --base-branch <branch>  Base branch for diff (default: main)
  --diff <ref>            Git diff reference (e.g., HEAD~1)
  --validate-events       Enable data log QA
  --prd <path>            Path to PRD file
  --config <path>         Path to config directory
  --help                  Show this help message
`);
}

export async function runCli(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      app: { type: 'string' },
      pr: { type: 'string' },
      'base-branch': { type: 'string' },
      diff: { type: 'string' },
      'validate-events': { type: 'boolean', default: false },
      prd: { type: 'string' },
      config: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  if (!values.app) {
    logger.error('Missing required option: --app <id>');
    printHelp();
    return 1;
  }

  const agentConfig = agentConfigSchema.parse({
    appId: values.app,
    prNumber: values.pr ? parseInt(values.pr as string, 10) : undefined,
    baseBranch: values['base-branch'] ?? 'main',
    diff: values.diff as string | undefined,
    validateEvents: values['validate-events'] ?? false,
    prdPath: values.prd as string | undefined,
  });

  const sentinelConfig = await loadConfig(values.config as string | undefined);

  try {
    const result = await runAgent(agentConfig, sentinelConfig);
    console.log(result.report);

    return result.status === 'passed' ? 0 : 1;
  } catch (err) {
    logger.error('Agent failed with error:', err);
    return 1;
  }
}
