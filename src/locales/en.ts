// This file is the "source of truth" dictionary for every piece of text that
// sentinel-qa shows to a human: CLI help text, log lines, and the Markdown
// test report. Nothing here is code logic — it is just labelled sentences.
//
// Why a dictionary instead of writing text directly where it's used?
// Because it lets the same message exist in more than one language
// (see pt-br.ts) without touching the code that prints it. The rest of the
// app asks this dictionary "give me the text for X" instead of hard-coding
// the sentence itself.
//
// Some entries are plain strings (fixed text). Others are functions, used
// whenever the sentence needs to embed a value that is only known at
// runtime (a file path, a count, a test id, ...). Calling the function with
// that value produces the final sentence — this is how "Loaded 3 app(s)"
// is built from a number that changes every run.

export interface Messages {
  cli: {
    description: string;
    usageLabel: string;
    optionsLabel: string;
    appOptionDescription: string;
    prOptionDescription: string;
    baseBranchOptionDescription: string;
    diffOptionDescription: string;
    validateEventsOptionDescription: string;
    prdOptionDescription: string;
    configOptionDescription: string;
    helpOptionDescription: string;
    missingAppOption: string;
    agentFailed: string;
  };
  report: {
    title: (appId: string) => string;
    fieldColumn: string;
    valueColumn: string;
    appLabel: string;
    suiteLabel: string;
    platformLabel: string;
    timestampLabel: string;
    durationLabel: string;
    summaryHeading: string;
    totalColumn: string;
    passedColumn: string;
    failedColumn: string;
    timedOutColumn: string;
    skippedColumn: string;
    allPassed: string;
    failureCount: (count: number) => string;
    testDetailsHeading: string;
    indexColumn: string;
    idColumn: string;
    titleColumn: string;
    statusColumn: string;
    failuresHeading: string;
    statusDetailLabel: string;
    durationDetailLabel: string;
    errorLabel: string;
    screenshotLabel: string;
    statusPassed: string;
    statusFailed: string;
    statusTimedOut: string;
    statusSkipped: string;
    eventValidationHeading: string;
    expectedColumn: string;
    matchedColumn: string;
    missingColumn: string;
    paramErrorsColumn: string;
    unexpectedColumn: string;
    eventAllMatched: string;
    eventIssuesFound: string;
    eventResultsHeading: string;
    eventColumn: string;
    triggerColumn: string;
    eventStatusMatched: string;
    eventStatusMissing: string;
    eventStatusParamError: string;
    parameterErrorsHeading: string;
    parameterColumn: string;
    gotColumn: string;
    unexpectedEventsHeading: string;
    paramsColumn: string;
    footer: (timestamp: string) => string;
  };
  config: {
    loadedFrom: (path: string) => string;
  };
  registry: {
    appsFileNotFound: (path: string) => string;
    loaded: (count: number) => string;
    selectorFileNotFound: (path: string) => string;
    eventSpecFileNotFound: (path: string) => string;
  };
  store: {
    saved: (count: number, appId: string) => string;
  };
  reportStore: {
    saved: (path: string) => string;
  };
  agentPipeline: {
    stageAnalyze: string;
    stagePlan: string;
    noTestsGenerated: string;
    noTestsGeneratedReportBody: string;
    testsGenerated: (count: number) => string;
    stageExecute: string;
    flutterNotImplemented: string;
    stageReport: string;
    testValidationFailed: (testId: string, errors: string) => string;
  };
  analyzer: {
    appNotFound: (appId: string) => string;
    complete: (info: {
      diffLength: number;
      prdLength: number;
      selectorsLoaded: boolean;
      eventSpecsLoaded: boolean;
      existingTestsCount: number;
    }) => string;
    diffFailedFallback: (diffRef: string) => string;
    diffFallbackFailed: string;
    noPrdPath: string;
    prdFileNotFound: (path: string) => string;
  };
  planner: {
    generating: string;
    noTestsReturned: string;
    generatedRunningCritique: (count: number) => string;
    critiqueComplete: (count: number) => string;
    critiqueEmpty: string;
    critiqueFailed: string;
    parseFailed: string;
  };
  llmClient: {
    tokenBudgetExceeded: (consumed: number, max: number) => string;
    calling: (model: string) => string;
    response: (input: number, output: number, total: number) => string;
  };
}

export const en: Messages = {
  cli: {
    description: 'Autonomous QA agent',
    usageLabel: 'Usage:',
    optionsLabel: 'Options:',
    appOptionDescription: 'App ID from registry/apps.yaml (required)',
    prOptionDescription: 'GitHub PR number',
    baseBranchOptionDescription: 'Base branch for diff (default: main)',
    diffOptionDescription: 'Git diff reference (e.g., HEAD~1)',
    validateEventsOptionDescription: 'Enable data log QA',
    prdOptionDescription: 'Path to PRD file',
    configOptionDescription: 'Path to config directory',
    helpOptionDescription: 'Show this help message',
    missingAppOption: 'Missing required option: --app <id>',
    agentFailed: 'Agent failed with error:',
  },
  report: {
    title: (appId) => `# Test Report: ${appId}`,
    fieldColumn: 'Field',
    valueColumn: 'Value',
    appLabel: 'App',
    suiteLabel: 'Suite',
    platformLabel: 'Platform',
    timestampLabel: 'Timestamp',
    durationLabel: 'Duration',
    summaryHeading: '## Summary',
    totalColumn: 'Total',
    passedColumn: 'Passed',
    failedColumn: 'Failed',
    timedOutColumn: 'Timed Out',
    skippedColumn: 'Skipped',
    allPassed: '**Result: ALL PASSED**',
    failureCount: (count) => `**Result: ${count} FAILURE(S)**`,
    testDetailsHeading: '## Test Details',
    indexColumn: '#',
    idColumn: 'ID',
    titleColumn: 'Title',
    statusColumn: 'Status',
    failuresHeading: '## Failures',
    statusDetailLabel: 'Status',
    durationDetailLabel: 'Duration',
    errorLabel: 'Error',
    screenshotLabel: 'Screenshot',
    statusPassed: 'PASS',
    statusFailed: 'FAIL',
    statusTimedOut: 'TIMEOUT',
    statusSkipped: 'SKIP',
    eventValidationHeading: '## Event Validation (Data Log QA)',
    expectedColumn: 'Expected',
    matchedColumn: 'Matched',
    missingColumn: 'Missing',
    paramErrorsColumn: 'Param Errors',
    unexpectedColumn: 'Unexpected',
    eventAllMatched: '**Event Validation: ALL MATCHED**',
    eventIssuesFound: '**Event Validation: ISSUES FOUND**',
    eventResultsHeading: '### Event Results',
    eventColumn: 'Event',
    triggerColumn: 'Trigger',
    eventStatusMatched: 'MATCHED',
    eventStatusMissing: 'MISSING',
    eventStatusParamError: 'PARAM_ERROR',
    parameterErrorsHeading: '### Parameter Errors',
    parameterColumn: 'Parameter',
    gotColumn: 'Got',
    unexpectedEventsHeading: '### Unexpected Events',
    paramsColumn: 'Params',
    footer: (timestamp) => `*Generated by sentinel-qa at ${timestamp}*`,
  },
  config: {
    loadedFrom: (path) => `Loaded config from ${path}`,
  },
  registry: {
    appsFileNotFound: (path) => `apps.yaml not found at ${path}`,
    loaded: (count) => `Loaded ${count} app(s) from registry`,
    selectorFileNotFound: (path) => `Selector file not found: ${path}`,
    eventSpecFileNotFound: (path) => `Event spec file not found: ${path}`,
  },
  store: {
    saved: (count, appId) => `Saved ${count} test statuses for ${appId}`,
  },
  reportStore: {
    saved: (path) => `Report saved: ${path}`,
  },
  agentPipeline: {
    stageAnalyze: 'Stage 1: Analyze — collecting context...',
    stagePlan: 'Stage 2: Plan — generating test cases...',
    noTestsGenerated: 'No tests generated. Nothing to execute.',
    noTestsGeneratedReportBody: 'No tests were generated for this PR.',
    testsGenerated: (count) => `Generated ${count} test(s)`,
    stageExecute: 'Stage 3: Execute — running tests...',
    flutterNotImplemented: 'Flutter/Patrol execution not yet implemented. Skipping Flutter tests.',
    stageReport: 'Stage 4: Report — generating report...',
    testValidationFailed: (testId, errors) => `Test ${testId} failed validation: ${errors}`,
  },
  analyzer: {
    appNotFound: (appId) => `App "${appId}" not found in registry`,
    complete: ({ diffLength, prdLength, selectorsLoaded, eventSpecsLoaded, existingTestsCount }) =>
      `Analysis complete: diff=${diffLength} chars, prd=${prdLength} chars, ` +
      `selectors=${selectorsLoaded ? 'loaded' : 'none'}, ` +
      `eventSpecs=${eventSpecsLoaded ? 'loaded' : 'none'}, ` +
      `existingTests=${existingTestsCount}`,
    diffFailedFallback: (diffRef) => `git diff failed for "${diffRef}", falling back to HEAD~1`,
    diffFallbackFailed: 'git diff HEAD~1 also failed, returning empty diff',
    noPrdPath: 'No PRD path specified, skipping PRD load',
    prdFileNotFound: (path) => `PRD file not found: ${path}`,
  },
  planner: {
    generating: 'Generating test cases via LLM...',
    noTestsReturned: 'LLM returned no tests',
    generatedRunningCritique: (count) => `Generated ${count} test(s). Running self-critique...`,
    critiqueComplete: (count) => `Self-critique complete: ${count} test(s) after review`,
    critiqueEmpty: 'Self-critique returned empty result, using original tests',
    critiqueFailed: 'Self-critique failed, using original tests:',
    parseFailed: 'Failed to parse LLM response as PlannedTest[]:',
  },
  llmClient: {
    tokenBudgetExceeded: (consumed, max) =>
      `Token budget exceeded: ${consumed} >= ${max}. ` +
      'Increase cost.max_tokens_per_run in config to continue.',
    calling: (model) => `Calling Claude API (model: ${model})...`,
    response: (input, output, total) =>
      `Claude API response: ${input} input + ${output} output tokens (total: ${total})`,
  },
};
