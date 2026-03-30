import { z } from 'zod';
import type { LLMClient } from './llm-client.js';
import type { AnalysisContext } from './analyzer.js';
import { buildSystemPrompt, buildUserPrompt, buildCritiquePrompt } from './prompts.js';
import { logger } from '../utils/logger.js';

export const plannedTestSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  trigger: z.enum(['prd', 'diff']),
  platform: z.enum(['web', 'flutter']),
  code: z.string(),
});

export type PlannedTest = z.infer<typeof plannedTestSchema>;

const plannedTestArraySchema = z.array(plannedTestSchema);

/**
 * Generate test cases + executable code via LLM.
 *
 * Pipeline: generate → validate → self-critique → return
 */
export async function planTests(
  context: AnalysisContext,
  llmClient: LLMClient,
): Promise<PlannedTest[]> {
  const platform = context.app.type === 'web' ? 'web' : 'flutter';

  // Step 1: Generate tests
  const systemPrompt = buildSystemPrompt(platform);
  const userPrompt = buildUserPrompt(context);

  logger.info('Generating test cases via LLM...');
  const generateResponse = await llmClient.call(systemPrompt, userPrompt);

  let tests = parseTestsFromResponse(generateResponse.content);
  if (tests.length === 0) {
    logger.warn('LLM returned no tests');
    return [];
  }

  logger.info(`Generated ${tests.length} test(s). Running self-critique...`);

  // Step 2: Self-critique
  try {
    const critiquePrompt = buildCritiquePrompt(JSON.stringify(tests, null, 2));
    const critiqueResponse = await llmClient.call(systemPrompt, critiquePrompt);
    const critiquedTests = parseTestsFromResponse(critiqueResponse.content);

    if (critiquedTests.length > 0) {
      tests = critiquedTests;
      logger.info(`Self-critique complete: ${tests.length} test(s) after review`);
    } else {
      logger.warn('Self-critique returned empty result, using original tests');
    }
  } catch (err) {
    logger.warn('Self-critique failed, using original tests:', err);
  }

  return tests;
}

/**
 * Parse LLM response text into PlannedTest array.
 *
 * Handles both raw JSON arrays and markdown-fenced JSON.
 */
function parseTestsFromResponse(content: string): PlannedTest[] {
  // Strip markdown fences if present
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return plannedTestArraySchema.parse(parsed);
  } catch (err) {
    logger.error('Failed to parse LLM response as PlannedTest[]:', err);
    return [];
  }
}
