export { validateEvents } from './validator.js';
export { matchAnalyticsUrl, ANALYTICS_PATTERNS } from './capture-patterns.js';
export { validateEventSpec, eventSpecConfigSchema } from './schema.js';
export type {
  CapturedEvent,
  EventValidationResult,
  EventMatchResult,
  ParamError,
  UnexpectedEvent,
} from './types.js';
export type { AnalyticsPattern, ParsedEvent } from './capture-patterns.js';
