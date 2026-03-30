import { z } from 'zod';

/**
 * Zod schema for validating event spec YAML input.
 */
export const eventParamSchema = z.record(
  z.string(),
  z.enum(['string', 'number', 'boolean']),
);

export const eventSpecEntrySchema = z.object({
  trigger: z.string().describe('Description of what triggers this event'),
  event_name: z.string().describe('Analytics event name'),
  required_params: eventParamSchema.optional().describe('Required parameters with type'),
  optional_params: eventParamSchema.optional().describe('Optional parameters with type'),
});

export const eventSpecConfigSchema = z.object({
  events: z.array(eventSpecEntrySchema),
});

/**
 * Validate an event spec config object against the Zod schema.
 * Returns the parsed result or throws on validation failure.
 */
export function validateEventSpec(data: unknown): z.infer<typeof eventSpecConfigSchema> {
  return eventSpecConfigSchema.parse(data);
}
