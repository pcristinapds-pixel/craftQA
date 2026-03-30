import type { RunResult, TestResult } from '../runners/playwright/types.js';
import type { EventValidationResult } from '../event-validation/types.js';

export interface ReportMeta {
  appId: string;
  suite: string;
  platform: string;
  timestamp: string;
}

function statusIcon(status: TestResult['status']): string {
  switch (status) {
    case 'passed': return 'PASS';
    case 'failed': return 'FAIL';
    case 'timedOut': return 'TIMEOUT';
    case 'skipped': return 'SKIP';
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
  lines.push(`# Test Report: ${meta.appId}`);
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| App | ${meta.appId} |`);
  lines.push(`| Suite | ${meta.suite} |`);
  lines.push(`| Platform | ${meta.platform} |`);
  lines.push(`| Timestamp | ${meta.timestamp} |`);
  lines.push(`| Duration | ${formatDuration(result.duration)} |`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Total | Passed | Failed | Timed Out | Skipped |`);
  lines.push(`|-------|--------|--------|-----------|---------|`);
  lines.push(`| ${result.total} | ${result.passed} | ${result.failed} | ${result.timedOut} | ${result.skipped} |`);
  lines.push('');

  // Overall result
  if (result.failed === 0 && result.timedOut === 0) {
    lines.push('**Result: ALL PASSED**');
  } else {
    lines.push(`**Result: ${result.failed + result.timedOut} FAILURE(S)**`);
  }
  lines.push('');

  // Test details
  lines.push('## Test Details');
  lines.push('');
  lines.push('| # | ID | Title | Status | Duration |');
  lines.push('|---|-----|-------|--------|----------|');

  result.tests.forEach((test, i) => {
    lines.push(
      `| ${i + 1} | ${test.id} | ${test.title} | ${statusIcon(test.status)} | ${formatDuration(test.duration)} |`,
    );
  });

  lines.push('');

  // Failures detail
  const failures = result.tests.filter(
    (t) => t.status === 'failed' || t.status === 'timedOut',
  );

  if (failures.length > 0) {
    lines.push('## Failures');
    lines.push('');

    for (const test of failures) {
      lines.push(`### ${test.id}: ${test.title}`);
      lines.push('');
      lines.push(`- **Status**: ${statusIcon(test.status)}`);
      lines.push(`- **Duration**: ${formatDuration(test.duration)}`);
      if (test.error) {
        lines.push(`- **Error**:`);
        lines.push('```');
        lines.push(test.error);
        lines.push('```');
      }
      if (test.screenshotPath) {
        lines.push(`- **Screenshot**: \`${test.screenshotPath}\``);
      }
      lines.push('');
    }
  }

  // Event Validation (Data Log QA)
  if (eventValidation) {
    lines.push('## Event Validation (Data Log QA)');
    lines.push('');
    lines.push('| Expected | Matched | Missing | Param Errors | Unexpected |');
    lines.push('|----------|---------|---------|--------------|------------|');
    lines.push(`| ${eventValidation.total_expected} | ${eventValidation.matched} | ${eventValidation.missing} | ${eventValidation.param_errors} | ${eventValidation.unexpected_count} |`);
    lines.push('');

    if (eventValidation.missing === 0 && eventValidation.param_errors === 0 && eventValidation.unexpected_count === 0) {
      lines.push('**Event Validation: ALL MATCHED**');
    } else {
      lines.push('**Event Validation: ISSUES FOUND**');
    }
    lines.push('');

    // Event details table
    lines.push('### Event Results');
    lines.push('');
    lines.push('| Event | Trigger | Status |');
    lines.push('|-------|---------|--------|');

    for (const ev of eventValidation.results) {
      const statusLabel = ev.status === 'matched' ? 'MATCHED'
        : ev.status === 'missing' ? 'MISSING'
        : 'PARAM_ERROR';
      lines.push(`| ${ev.event_name} | ${ev.trigger} | ${statusLabel} |`);
    }
    lines.push('');

    // Param errors detail
    const paramErrorResults = eventValidation.results.filter((r) => r.status === 'param_error');
    if (paramErrorResults.length > 0) {
      lines.push('### Parameter Errors');
      lines.push('');

      for (const ev of paramErrorResults) {
        lines.push(`**${ev.event_name}**:`);
        lines.push('');
        lines.push('| Parameter | Expected | Got |');
        lines.push('|-----------|----------|-----|');
        for (const err of ev.param_errors ?? []) {
          lines.push(`| ${err.param} | ${err.expected} | ${err.got} |`);
        }
        lines.push('');
      }
    }

    // Unexpected events
    if (eventValidation.unexpected.length > 0) {
      lines.push('### Unexpected Events');
      lines.push('');
      lines.push('| Event | Params |');
      lines.push('|-------|--------|');
      for (const ev of eventValidation.unexpected) {
        lines.push(`| ${ev.event_name} | ${JSON.stringify(ev.params)} |`);
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push(`*Generated by sentinel-qa at ${meta.timestamp}*`);
  lines.push('');

  return lines.join('\n');
}
