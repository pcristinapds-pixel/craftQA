import type {
  MaestroJsonOutput,
  MaestroTestInput,
  MaestroTestResult,
  MaestroRunResult,
} from './types.js';

/**
 * Parse Maestro CLI JSON output into a MaestroRunResult.
 *
 * Each flow in the JSON output is matched to a test input by filename convention:
 * the flow name from Maestro corresponds to the YAML filename (without extension).
 * If no match is found, the flow name and a generated ID are used.
 */
export function parseMaestroResult(
  json: MaestroJsonOutput,
  inputs: MaestroTestInput[],
): MaestroRunResult {
  const startTime = Date.now();
  const tests: MaestroTestResult[] = [];

  // Build a lookup from flow name (derived from filename) to test input
  const inputByFlowName = new Map<string, MaestroTestInput>();
  for (const input of inputs) {
    // Maestro uses the YAML filename (without extension) as the flow name
    inputByFlowName.set(input.id, input);
  }

  for (const suite of json.suites) {
    for (const flow of suite.flows) {
      // Try to match flow name to an input test
      const matched = inputByFlowName.get(flow.name) ?? findByTitle(inputs, flow.name);

      const status = flow.status === 'SUCCESS' ? 'passed' : 'failed';
      const result: MaestroTestResult = {
        id: matched?.id ?? flow.name,
        title: matched?.title ?? flow.name,
        status,
        duration: flow.duration,
      };

      if (status === 'failed' && flow.failure) {
        result.error = flow.failure;
      }

      tests.push(result);
    }
  }

  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);

  return {
    passed,
    failed,
    total: tests.length,
    duration: totalDuration,
    tests,
  };
}

function findByTitle(
  inputs: MaestroTestInput[],
  flowName: string,
): MaestroTestInput | undefined {
  return inputs.find((i) => i.title === flowName);
}
