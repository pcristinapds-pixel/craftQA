import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import type { ZodSchema } from 'zod';

/**
 * Load and parse a YAML file.
 *
 * When a Zod schema is provided, the parsed data is validated at runtime.
 * Without a schema, the raw parsed result is returned with a type assertion
 * (unsafe — prefer providing a schema for external inputs).
 */
export async function loadYaml<T>(filePath: string, schema?: ZodSchema<T>): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  const raw = parse(content);

  if (schema) {
    return schema.parse(raw);
  }

  return raw as T;
}
