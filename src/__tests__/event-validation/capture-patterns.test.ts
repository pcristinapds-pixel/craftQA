import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { matchAnalyticsUrl, ANALYTICS_PATTERNS } from '../../event-validation/capture-patterns.js';

describe('matchAnalyticsUrl', () => {
  it('should match GA4 collect endpoint', () => {
    const result = matchAnalyticsUrl('https://www.google-analytics.com/g/collect?v=2&en=page_view&tid=G-123');
    assert.ok(result);
    assert.equal(result.sdk, 'Google Analytics 4');
  });

  it('should match Amplitude API endpoint', () => {
    const result = matchAnalyticsUrl('https://api.amplitude.com/2/httpapi');
    assert.ok(result);
    assert.equal(result.sdk, 'Amplitude');
  });

  it('should match Mixpanel track endpoint', () => {
    const result = matchAnalyticsUrl('https://api.mixpanel.com/track');
    assert.ok(result);
    assert.equal(result.sdk, 'Mixpanel');
  });

  it('should match Firebase app-measurement endpoint', () => {
    const result = matchAnalyticsUrl('https://app-measurement.com/a?foo=bar');
    assert.ok(result);
    assert.equal(result.sdk, 'Firebase Analytics');
  });

  it('should return null for non-analytics URLs', () => {
    assert.equal(matchAnalyticsUrl('https://api.example.com/data'), null);
    assert.equal(matchAnalyticsUrl('https://www.google.com/search'), null);
  });
});

describe('GA4 parser', () => {
  const ga4Pattern = ANALYTICS_PATTERNS.find((p) => p.sdk === 'Google Analytics 4')!;

  it('should parse event name from URL params', () => {
    const events = ga4Pattern.parseRequest(
      'https://www.google-analytics.com/g/collect?v=2&en=page_view&tid=G-123&page_path=/home',
      null,
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].event_name, 'page_view');
    assert.equal(events[0].params.page_path, '/home');
  });
});

describe('Amplitude parser', () => {
  const ampPattern = ANALYTICS_PATTERNS.find((p) => p.sdk === 'Amplitude')!;

  it('should parse events from JSON body', () => {
    const body = JSON.stringify({
      events: [
        { event_type: 'button_click', event_properties: { button_id: 'submit' } },
      ],
    });
    const events = ampPattern.parseRequest('https://api.amplitude.com/2/httpapi', body);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_name, 'button_click');
    assert.equal(events[0].params.button_id, 'submit');
  });
});

describe('Firebase parser', () => {
  const fbPattern = ANALYTICS_PATTERNS.find((p) => p.sdk === 'Firebase Analytics')!;

  it('should parse events from JSON body', () => {
    const body = JSON.stringify({
      events: [
        { name: 'screen_view', params: { screen_name: 'home' } },
      ],
    });
    const events = fbPattern.parseRequest('https://firebaselogging-pa.googleapis.com/v1', body);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_name, 'screen_view');
  });

  it('should handle empty body', () => {
    const events = fbPattern.parseRequest('https://firebaselogging-pa.googleapis.com/v1', null);
    assert.equal(events.length, 0);
  });
});

describe('Mixpanel parser', () => {
  const mxPattern = ANALYTICS_PATTERNS.find((p) => p.sdk === 'Mixpanel')!;

  it('should parse events from JSON body', () => {
    const body = JSON.stringify([
      { event: 'signup', properties: { plan: 'pro' } },
    ]);
    const events = mxPattern.parseRequest('https://api.mixpanel.com/track', body);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_name, 'signup');
    assert.equal(events[0].params.plan, 'pro');
  });
});
