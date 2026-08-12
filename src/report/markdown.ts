import type { RunResult, TestResult } from '../runners/playwright/types.js';
import type { EventValidationResult } from '../event-validation/types.js';
import { t } from '../locales/index.js';

export interface ReportMeta {
  appId: string;
  suite: string;
  platform: string;
  timestamp: string;
}

function statusIcon(status: TestResult['status']): string {
  switch (status) {
    case 'passed': return t.report.statusPassed;
    case 'failed': return t.report.statusFailed;
    case 'timedOut': return t.report.statusTimedOut;
    case 'skipped': return t.report.statusSkipped;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Convert a RunResult into a Markdown report string.
 */
export function generateMarkdownReport(
  result: RunResult,
  meta: ReportMeta,
  eventValidation?: EventValidationResult,
): string {
  const lines: string[] = [];

  // Header
  lines.push(t.report.title(meta.appId));
  lines.push('');
  lines.push(`| ${t.report.fieldColumn} | ${t.report.valueColumn} |`);
  lines.push(`|-------|-------|`);
  lines.push(`| ${t.report.appLabel} | ${meta.appId} |`);
  lines.push(`| ${t.report.suiteLabel} | ${meta.suite} |`);
  lines.push(`| ${t.report.platformLabel} | ${meta.platform} |`);
  lines.push(`| ${t.report.timestampLabel} | ${meta.timestamp} |`);
  lines.push(`| ${t.report.durationLabel} | ${formatDuration(result.duration)} |`);
  lines.push('');

  // Summary
  lines.push(t.report.summaryHeading);
  lines.push('');
  lines.push(`| ${t.report.totalColumn} | ${t.report.passedColumn} | ${t.report.failedColumn} | ${t.report.timedOutColumn} | ${t.report.skippedColumn} |`);
  lines.push(`|-------|--------|--------|-----------|---------|`);
  lines.push(`| ${result.total} | ${result.passed} | ${result.failed} | ${result.timedOut} | ${result.skipped} |`);
  lines.push('');

  // Overall result
  if (result.failed === 0 && result.timedOut === 0) {
    lines.push(t.report.allPassed);
  } else {
    lines.push(t.report.failureCount(result.failed + result.timedOut));
  }
  lines.push('');

  // Test details
  lines.push(t.report.testDetailsHeading);
  lines.push('');
  lines.push(`| ${t.report.indexColumn} | ${t.report.idColumn} | ${t.report.titleColumn} | ${t.report.statusColumn} | ${t.report.durationLabel} |`);
  lines.push('|---|-----|-------|--------|----------|');

  result.tests.forEach((test, i) => {
    lines.push(
      `| ${i + 1} | ${test.id} | ${test.title} | ${statusIcon(test.status)} | ${formatDuration(test.duration)} |`,
    );
  });

  lines.push('');

  // Failures detail
  const failures = result.tests.filter(
    (test) => test.status === 'failed' || test.status === 'timedOut',
  );

  if (failures.length > 0) {
    lines.push(t.report.failuresHeading);
    lines.push('');

    for (const test of failures) {
      lines.push(`### ${test.id}: ${test.title}`);
      lines.push('');
      lines.push(`- **${t.report.statusDetailLabel}**: ${statusIcon(test.status)}`);
      lines.push(`- **${t.report.durationDetailLabel}**: ${formatDuration(test.duration)}`);
      if (test.error) {
        lines.push(`- **${t.report.errorLabel}**:`);
        lines.push('```');
        lines.push(test.error);
        lines.push('```');
      }
      if (test.screenshotPath) {
        lines.push(`- **${t.report.screenshotLabel}**: \`${test.screenshotPath}\``);
      }
      lines.push('');
    }
  }

  // Event Validation (Data Log QA)
  if (eventValidation) {
    lines.push(t.report.eventValidationHeading);
    lines.push('');
    lines.push(`| ${t.report.expectedColumn} | ${t.report.matchedColumn} | ${t.report.missingColumn} | ${t.report.paramErrorsColumn} | ${t.report.unexpectedColumn} |`);
    lines.push('|----------|---------|---------|--------------|------------|');
    lines.push(`| ${eventValidation.total_expected} | ${eventValidation.matched} | ${eventValidation.missing} | ${eventValidation.param_errors} | ${eventValidation.unexpected_count} |`);
    lines.push('');

    if (eventValidation.missing === 0 && eventValidation.param_errors === 0 && eventValidation.unexpected_count === 0) {
      lines.push(t.report.eventAllMatched);
    } else {
      lines.push(t.report.eventIssuesFound);
    }
    lines.push('');

    // Event details table
    lines.push(t.report.eventResultsHeading);
    lines.push('');
    lines.push(`| ${t.report.eventColumn} | ${t.report.triggerColumn} | ${t.report.statusColumn} |`);
    lines.push('|-------|---------|--------|');

    for (const ev of eventValidation.results) {
      const statusLabel = ev.status === 'matched' ? t.report.eventStatusMatched
        : ev.status === 'missing' ? t.report.eventStatusMissing
        : t.report.eventStatusParamError;
      lines.push(`| ${ev.event_name} | ${ev.trigger} | ${statusLabel} |`);
    }
    lines.push('');

    // Param errors detail
    const paramErrorResults = eventValidation.results.filter((r) => r.status === 'param_error');
    if (paramErrorResults.length > 0) {
      lines.push(t.report.parameterErrorsHeading);
      lines.push('');

      for (const ev of paramErrorResults) {
        lines.push(`**${ev.event_name}**:`);
        lines.push('');
        lines.push(`| ${t.report.parameterColumn} | ${t.report.expectedColumn} | ${t.report.gotColumn} |`);
        lines.push('|-----------|----------|-----|');
        for (const err of ev.param_errors ?? []) {
          lines.push(`| ${err.param} | ${err.expected} | ${err.got} |`);
        }
        lines.push('');
      }
    }

    // Unexpected events
    if (eventValidation.unexpected.length > 0) {
      lines.push(t.report.unexpectedEventsHeading);
      lines.push('');
      lines.push(`| ${t.report.eventColumn} | ${t.report.paramsColumn} |`);
      lines.push('|-------|--------|');
      for (const ev of eventValidation.unexpected) {
        lines.push(`| ${ev.event_name} | ${JSON.stringify(ev.params)} |`);
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push(t.report.footer(meta.timestamp));
  lines.push('');

  return lines.join('\n');
}
