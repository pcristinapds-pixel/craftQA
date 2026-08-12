import { z } from 'zod';
import type { LLMClient } from './llm-client.js';
import type { AnalysisContext } from './analyzer.js';
import { buildSystemPrompt, buildUserPrompt, buildCritiquePrompt } from './prompts.js';
import { logger } from '../utils/logger.js';
import { t } from '../locales/index.js';

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

  logger.info(t.planner.generating);
  const generateResponse = await llmClient.call(systemPrompt, userPrompt);

  let tests = parseTestsFromResponse(generateResponse.content);
  if (tests.length === 0) {
    logger.warn(t.planner.noTestsReturned);
    return [];
  }

  logger.info(t.planner.generatedRunningCritique(tests.length));

  // Step 2: Self-critique
  try {
    const critiquePrompt = buildCritiquePrompt(JSON.stringify(tests, null, 2));
    const critiqueResponse = await llmClient.call(systemPrompt, critiquePrompt);
    const critiquedTests = parseTestsFromResponse(critiqueResponse.content);

    if (critiquedTests.length > 0) {
      tests = critiquedTests;
      logger.info(t.planner.critiqueComplete(tests.length));
    } else {
      logger.warn(t.planner.critiqueEmpty);
    }
  } catch (err) {
    logger.warn(t.planner.critiqueFailed, err);
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
    logger.error(t.planner.parseFailed, err);
    return [];
  }
}
