import type { EventSpecEntry } from '../registry/types.js';
import type {
  CapturedEvent,
  EventValidationResult,
  EventMatchResult,
  ParamError,
  UnexpectedEvent,
} from './types.js';

/**
 * Check if a value matches the expected type string.
 */
function matchesType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true; // unknown type = allow
  }
}

/**
 * Validate captured events against an event spec.
 *
 * For each expected event in the spec:
 * - Check if a matching captured event exists (by event_name)
 * - If found, validate required_params (presence + type)
 * - If not found, mark as missing
 *
 * Any captured events not in the spec are listed as unexpected.
 */
export function validateEvents(
  spec: EventSpecEntry[],
  captured: CapturedEvent[],
): EventValidationResult {
  const results: EventMatchResult[] = [];
  const matchedCapturedIndices = new Set<number>();

  for (const expected of spec) {
    // Find the first matching captured event by event_name
    const capturedIndex = captured.findIndex(
      (c, i) => c.event_name === expected.event_name && !matchedCapturedIndices.has(i),
    );

    if (capturedIndex === -1) {
      // Missing event
      results.push({
        event_name: expected.event_name,
        trigger: expected.trigger,
        status: 'missing',
      });
      continue;
    }

    matchedCapturedIndices.add(capturedIndex);
    const capturedEvent = captured[capturedIndex];

    // Validate required params
    const paramErrors: ParamError[] = [];

    if (expected.required_params) {
      for (const [paramName, expectedType] of Object.entries(expected.required_params)) {
        if (!(paramName in capturedEvent.params)) {
          paramErrors.push({
            param: paramName,
            expected: expectedType,
            got: 'missing',
          });
        } else if (!matchesType(capturedEvent.params[paramName], expectedType)) {
          paramErrors.push({
            param: paramName,
            expected: expectedType,
            got: typeof capturedEvent.params[paramName],
          });
        }
      }
    }

    if (paramErrors.length > 0) {
      results.push({
        event_name: expected.event_name,
        trigger: expected.trigger,
        status: 'param_error',
        param_errors: paramErrors,
      });
    } else {
      results.push({
        event_name: expected.event_name,
        trigger: expected.trigger,
        status: 'matched',
      });
    }
  }

  // Find unexpected events (captured but not in spec)
  const specEventNames = new Set(spec.map((s) => s.event_name));
  const unexpected: UnexpectedEvent[] = captured
    .filter((c, i) => !matchedCapturedIndices.has(i) && !specEventNames.has(c.event_name))
    .map((c) => ({ event_name: c.event_name, params: c.params }));

  const matched = results.filter((r) => r.status === 'matched').length;
  const missing = results.filter((r) => r.status === 'missing').length;
  const paramErrorCount = results.filter((r) => r.status === 'param_error').length;

  return {
    total_expected: spec.length,
    matched,
    missing,
    param_errors: paramErrorCount,
    unexpected_count: unexpected.length,
    results,
    unexpected,
  };
}
