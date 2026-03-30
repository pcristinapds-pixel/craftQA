import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateEventSpec } from '../../event-validation/schema.js';

describe('validateEventSpec', () => {
  it('should accept a valid event spec', () => {
    const data = {
      events: [
        {
          trigger: 'Button click',
          event_name: 'button_click',
          required_params: { button_id: 'string' },
          optional_params: { section: 'string' },
        },
      ],
    };
    const result = validateEventSpec(data);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].event_name, 'button_click');
  });

  it('should accept event without optional params', () => {
    const data = {
      events: [
        {
          trigger: 'Page view',
          event_name: 'page_view',
          required_params: { page_path: 'string' },
        },
      ],
    };
    const result = validateEventSpec(data);
    assert.equal(result.events.length, 1);
  });

  it('should accept event without any params', () => {
    const data = {
      events: [
        { trigger: 'App open', event_name: 'app_open' },
      ],
    };
    const result = validateEventSpec(data);
    assert.equal(result.events.length, 1);
  });

  it('should reject invalid param types', () => {
    const data = {
      events: [
        {
          trigger: 'Test',
          event_name: 'test',
          required_params: { field: 'invalid_type' },
        },
      ],
    };
    assert.throws(() => validateEventSpec(data));
  });

  it('should reject missing event_name', () => {
    const data = {
      events: [
        { trigger: 'Test' },
      ],
    };
    assert.throws(() => validateEventSpec(data));
  });

  it('should reject missing trigger', () => {
    const data = {
      events: [
        { event_name: 'test' },
      ],
    };
    assert.throws(() => validateEventSpec(data));
  });

  it('should accept empty events array', () => {
    const result = validateEventSpec({ events: [] });
    assert.equal(result.events.length, 0);
  });
});
