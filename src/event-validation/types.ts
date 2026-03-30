/**
 * A captured analytics event from network interception or device logs.
 */
export interface CapturedEvent {
  event_name: string;
  params: Record<string, unknown>;
  timestamp?: string;
  source_url?: string;
}

/**
 * Result of comparing a single expected event against captured events.
 */
export interface EventMatchResult {
  event_name: string;
  trigger: string;
  status: 'matched' | 'missing' | 'param_error';
  param_errors?: ParamError[];
}

export interface ParamError {
  param: string;
  expected: string;
  got: string;
}

/**
 * An unexpected event that was captured but not in the spec.
 */
export interface UnexpectedEvent {
  event_name: string;
  params: Record<string, unknown>;
}

/**
 * Full validation result comparing spec vs captured events.
 */
export interface EventValidationResult {
  total_expected: number;
  matched: number;
  missing: number;
  param_errors: number;
  unexpected_count: number;
  results: EventMatchResult[];
  unexpected: UnexpectedEvent[];
}
