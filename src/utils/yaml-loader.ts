import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

export async function loadYaml<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return parse(content) as T;
}
