/**
 * URL patterns for known analytics SDK endpoints.
 * Used by Playwright to intercept analytics network requests.
 */

export interface AnalyticsPattern {
  /** Human-readable SDK name */
  sdk: string;
  /** URL patterns to match (supports glob-like matching) */
  urlPatterns: string[];
  /** Function to extract event name and params from request body/URL */
  parseRequest: (url: string, body: string | null) => ParsedEvent[];
}

export interface ParsedEvent {
  event_name: string;
  params: Record<string, unknown>;
}

/**
 * Parse Google Analytics 4 (GA4) Measurement Protocol requests.
 * Endpoint: google-analytics.com/g/collect
 */
function parseGA4Request(url: string, _body: string | null): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  try {
    const urlObj = new URL(url);
    const eventName = urlObj.searchParams.get('en');
    if (eventName) {
      const params: Record<string, unknown> = {};
      for (const [key, value] of urlObj.searchParams.entries()) {
        if (key !== 'en' && key !== 'v' && key !== 'tid') {
          params[key] = isNaN(Number(value)) ? value : Number(value);
        }
      }
      events.push({ event_name: eventName, params });
    }
  } catch { /* ignore parse errors */ }
  return events;
}

/**
 * Parse Firebase Analytics requests.
 * Endpoint: firebase-installations.googleapis.com, firebaselogging
 */
function parseFirebaseRequest(_url: string, body: string | null): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  if (!body) return events;
  try {
    const data = JSON.parse(body);
    if (Array.isArray(data.events)) {
      for (const event of data.events) {
        events.push({
          event_name: event.name ?? event.event_name ?? 'unknown',
          params: event.params ?? {},
        });
      }
    }
  } catch { /* ignore parse errors */ }
  return events;
}

/**
 * Parse Amplitude Analytics requests.
 * Endpoint: api.amplitude.com
 */
function parseAmplitudeRequest(_url: string, body: string | null): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  if (!body) return events;
  try {
    const data = JSON.parse(body);
    const eventList = data.events ?? (Array.isArray(data) ? data : [data]);
    for (const event of eventList) {
      events.push({
        event_name: event.event_type ?? event.event_name ?? 'unknown',
        params: event.event_properties ?? event.user_properties ?? {},
      });
    }
  } catch { /* ignore parse errors */ }
  return events;
}

/**
 * Parse Mixpanel Analytics requests.
 * Endpoint: api.mixpanel.com/track
 */
function parseMixpanelRequest(_url: string, body: string | null): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  if (!body) return events;
  try {
    // Mixpanel sends base64-encoded data or JSON
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      data = JSON.parse(Buffer.from(body, 'base64').toString());
    }
    const eventList = Array.isArray(data) ? data : [data];
    for (const event of eventList) {
      events.push({
        event_name: event.event ?? 'unknown',
        params: event.properties ?? {},
      });
    }
  } catch { /* ignore parse errors */ }
  return events;
}

/**
 * Built-in analytics SDK patterns.
 */
export const ANALYTICS_PATTERNS: AnalyticsPattern[] = [
  {
    sdk: 'Google Analytics 4',
    urlPatterns: [
      '**/google-analytics.com/g/collect**',
      '**/analytics.google.com/g/collect**',
    ],
    parseRequest: parseGA4Request,
  },
  {
    sdk: 'Firebase Analytics',
    urlPatterns: [
      '**/firebaselogging/**',
      '**/firebase-installations.googleapis.com/**',
      '**/app-measurement.com/**',
    ],
    parseRequest: parseFirebaseRequest,
  },
  {
    sdk: 'Amplitude',
    urlPatterns: [
      '**/api.amplitude.com/**',
      '**/api2.amplitude.com/**',
    ],
    parseRequest: parseAmplitudeRequest,
  },
  {
    sdk: 'Mixpanel',
    urlPatterns: [
      '**/api.mixpanel.com/**',
    ],
    parseRequest: parseMixpanelRequest,
  },
];

/**
 * Check if a URL matches any analytics pattern.
 * Returns the matching pattern or null.
 */
export function matchAnalyticsUrl(url: string): AnalyticsPattern | null {
  for (const pattern of ANALYTICS_PATTERNS) {
    for (const urlPattern of pattern.urlPatterns) {
      // Simple substring matching for URL patterns
      // Strip leading ** and trailing ** for contains-style matching
      const cleanPattern = urlPattern.replace(/^\*\*\//, '').replace(/\/?\*\*$/, '');
      if (url.includes(cleanPattern)) {
        return pattern;
      }
    }
  }
  return null;
}
