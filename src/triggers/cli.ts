import { parseArgs } from 'node:util';
import { agentConfigSchema } from '../types/config.js';
import { loadConfig } from '../config/loader.js';
import { runAgent } from '../agent/index.js';
import { logger } from '../utils/logger.js';
import { t } from '../locales/index.js';

// The flag names themselves (--app, --pr, ...) never change with the
// language, since the user types them verbatim on the command line. Only
// the description text next to each flag comes from the dictionary.
function printHelp(): void {
  console.log(`
sentinel-qa — ${t.cli.description}

${t.cli.usageLabel}
  sentinel-qa run [options]

${t.cli.optionsLabel}
  --app <id>              ${t.cli.appOptionDescription}
  --pr <number>           ${t.cli.prOptionDescription}
  --base-branch <branch>  ${t.cli.baseBranchOptionDescription}
  --diff <ref>            ${t.cli.diffOptionDescription}
  --validate-events       ${t.cli.validateEventsOptionDescription}
  --prd <path>            ${t.cli.prdOptionDescription}
  --config <path>         ${t.cli.configOptionDescription}
  --help                  ${t.cli.helpOptionDescription}
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
    logger.error(t.cli.missingAppOption);
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
    logger.error(t.cli.agentFailed, err);
    return 1;
  }
}
