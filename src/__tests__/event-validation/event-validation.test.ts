import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateEvents } from '../../event-validation/validator.js';
import type { EventSpecEntry } from '../../registry/types.js';
import type { CapturedEvent } from '../../event-validation/types.js';

const sampleSpec: EventSpecEntry[] = [
  {
    trigger: 'Button click',
    event_name: 'button_click',
    required_params: { button_id: 'string', button_text: 'string' },
    optional_params: { section: 'string' },
  },
  {
    trigger: 'Page view',
    event_name: 'page_view',
    required_params: { page_path: 'string', page_title: 'string' },
  },
  {
    trigger: 'Form submit',
    event_name: 'form_submit',
    required_params: { form_id: 'string', field_count: 'number' },
  },
];

describe('validateEvents', () => {
  it('should match all events when captured matches spec', () => {
    const captured: CapturedEvent[] = [
      { event_name: 'button_click', params: { button_id: 'btn-1', button_text: 'Submit' } },
      { event_name: 'page_view', params: { page_path: '/home', page_title: 'Home' } },
      { event_name: 'form_submit', params: { form_id: 'login', field_count: 3 } },
    ];

    const result = validateEvents(sampleSpec, captured);

    assert.equal(result.total_expected, 3);
    assert.equal(result.matched, 3);
    assert.equal(result.missing, 0);
    assert.equal(result.param_errors, 0);
    assert.equal(result.unexpected_count, 0);
  });

  it('should detect missing events', () => {
    const captured: CapturedEvent[] = [
      { event_name: 'button_click', params: { button_id: 'btn-1', button_text: 'Submit' } },
    ];

    const result = validateEvents(sampleSpec, captured);

    assert.equal(result.matched, 1);
    assert.equal(result.missing, 2);

    const missingEvents = result.results.filter((r) => r.status === 'missing');
    assert.equal(missingEvents.length, 2);
    assert.ok(missingEvents.some((e) => e.event_name === 'page_view'));
    assert.ok(missingEvents.some((e) => e.event_name === 'form_submit'));
  });

  it('should detect unexpected events', () => {
    const captured: CapturedEvent[] = [
      { event_name: 'button_click', params: { button_id: 'btn-1', button_text: 'Submit' } },
      { event_name: 'page_view', params: { page_path: '/home', page_title: 'Home' } },
      { event_name: 'form_submit', params: { form_id: 'login', field_count: 3 } },
      { event_name: 'debug_tap', params: { x: 100, y: 200 } },
      { event_name: 'scroll_event', params: { direction: 'down' } },
    ];

    const result = validateEvents(sampleSpec, captured);

    assert.equal(result.matched, 3);
    assert.equal(result.unexpected_count, 2);
    assert.ok(result.unexpected.some((e) => e.event_name === 'debug_tap'));
    assert.ok(result.unexpected.some((e) => e.event_name === 'scroll_event'));
  });

  it('should detect missing required params', () => {
    const captured: CapturedEvent[] = [
      { event_name: 'button_click', params: { button_id: 'btn-1' } }, // missing button_text
      { event_name: 'page_view', params: { page_path: '/home', page_title: 'Home' } },
      { event_name: 'form_submit', params: { form_id: 'login', field_count: 3 } },
    ];

    const result = validateEvents(sampleSpec, captured);

    assert.equal(result.matched, 2);
    assert.equal(result.param_errors, 1);

    const paramErrorResult = result.results.find((r) => r.status === 'param_error');
    assert.ok(paramErrorResult);
    assert.equal(paramErrorResult.event_name, 'button_click');
    assert.equal(paramErrorResult.param_errors?.length, 1);
    assert.equal(paramErrorResult.param_errors?.[0].param, 'button_text');
    assert.equal(paramErrorResult.param_errors?.[0].got, 'missing');
  });

  it('should detect type mismatches in params', () => {
    const captured: CapturedEvent[] = [
      { event_name: 'button_click', params: { button_id: 'btn-1', button_text: 'Submit' } },
      { event_name: 'page_view', params: { page_path: '/home', page_title: 'Home' } },
      { event_name: 'form_submit', params: { form_id: 'login', field_count: 'three' } }, // should be number
    ];

    const result = validateEvents(sampleSpec, captured);

    assert.equal(result.matched, 2);
    assert.equal(result.param_errors, 1);

    const paramErrorResult = result.results.find((r) => r.event_name === 'form_submit');
    assert.ok(paramErrorResult);
    assert.equal(paramErrorResult.status, 'param_error');
    assert.equal(paramErrorResult.param_errors?.[0].param, 'field_count');
    assert.equal(paramErrorResult.param_errors?.[0].expected, 'number');
    assert.equal(paramErrorResult.param_errors?.[0].got, 'string');
  });

  it('should handle empty spec', () => {
    const captured: CapturedEvent[] = [
      { event_name: 'some_event', params: {} },
    ];

    const result = validateEvents([], captured);

    assert.equal(result.total_expected, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.unexpected_count, 1);
  });

  it('should handle empty captured events', () => {
    const result = validateEvents(sampleSpec, []);

    assert.equal(result.total_expected, 3);
    assert.equal(result.matched, 0);
    assert.equal(result.missing, 3);
  });

  it('should handle both empty', () => {
    const result = validateEvents([], []);

    assert.equal(result.total_expected, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.unexpected_count, 0);
  });

  it('should not count duplicate captured events as unexpected', () => {
    const captured: CapturedEvent[] = [
      { event_name: 'button_click', params: { button_id: 'btn-1', button_text: 'Submit' } },
      { event_name: 'button_click', params: { button_id: 'btn-2', button_text: 'Cancel' } },
      { event_name: 'page_view', params: { page_path: '/home', page_title: 'Home' } },
      { event_name: 'form_submit', params: { form_id: 'login', field_count: 3 } },
    ];

    const result = validateEvents(sampleSpec, captured);

    // First button_click matches spec, second is not unexpected because it shares the event_name
    assert.equal(result.matched, 3);
    assert.equal(result.unexpected_count, 0);
  });

  it('should include trigger info in results', () => {
    const captured: CapturedEvent[] = [];
    const result = validateEvents(sampleSpec, captured);

    assert.equal(result.results[0].trigger, 'Button click');
    assert.equal(result.results[1].trigger, 'Page view');
    assert.equal(result.results[2].trigger, 'Form submit');
  });

  it('should handle multiple param errors in one event', () => {
    const captured: CapturedEvent[] = [
      { event_name: 'button_click', params: {} }, // missing both required params
      { event_name: 'page_view', params: { page_path: '/home', page_title: 'Home' } },
      { event_name: 'form_submit', params: { form_id: 'login', field_count: 3 } },
    ];

    const result = validateEvents(sampleSpec, captured);

    const paramErrorResult = result.results.find((r) => r.event_name === 'button_click');
    assert.ok(paramErrorResult);
    assert.equal(paramErrorResult.param_errors?.length, 2);
  });
});
