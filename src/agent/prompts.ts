import type { AnalysisContext } from './analyzer.js';

const PLAYWRIGHT_FEW_SHOT = `
Example 1 — A simple navigation + assertion test:
\`\`\`typescript
import { test, expect } from '@playwright/test';

test('should display homepage heading', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Welcome');
});
\`\`\`

Example 2 — A form interaction test with selectors:
\`\`\`typescript
import { test, expect } from '@playwright/test';

test('should submit login form', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.locator('#email').fill('user@test.com');
  await page.locator('#password').fill('password123');
  await page.locator('#login-button').click();
  await expect(page.locator('.dashboard')).toBeVisible();
});
\`\`\`
`.trim();

/**
 * Build the system prompt for test generation.
 */
export function buildSystemPrompt(platform: 'web' | 'flutter'): string {
  const frameworkSection = platform === 'web'
    ? `
You generate **Playwright** test code in TypeScript.

Rules:
- Each test is a standalone \`test()\` block with \`import { test, expect } from '@playwright/test'\`.
- Use ONLY selectors provided in the selector map. Do not invent selectors.
- Use auto-retry assertions: \`expect(locator).toBeVisible()\`, \`toHaveText()\`, etc.
- Use explicit waits: \`waitForSelector\`, \`waitForLoadState\`. NEVER use \`waitForTimeout\`.
- Each test must call \`page.goto()\` with the app URL.
- No shared state between tests. Each test is independent.
- No external network requests, no file system access, no process access.
- Import only from \`@playwright/test\`.

${PLAYWRIGHT_FEW_SHOT}
`
    : `
You generate **Patrol** test code in Dart.

Rules:
- Each test is a standalone \`patrolTest()\` block.
- Use widget keys or text-based finders.
- Each test is independent — no shared state.
- No external network requests or file system access.
`;

  return `You are a senior QA engineer working for sentinel-qa, an autonomous QA agent.

Your job is to generate executable E2E test cases based on:
1. A PRD (Product Requirements Document) describing features
2. A git diff showing recent code changes
3. A selector map with available UI selectors
4. Optionally, an event spec for analytics validation

${frameworkSection}

Output format: Return a JSON array of test objects. Each object has:
- "id": unique test ID (e.g., "TC-001")
- "title": descriptive test title
- "priority": "critical" | "high" | "medium" | "low"
- "trigger": "prd" (from requirements) or "diff" (from code changes)
- "platform": "${platform}"
- "code": the complete, executable test code as a string

Return ONLY the JSON array, no markdown fences, no explanation.
Do not generate tests that duplicate existing stable tests (listed below if any).
`.trim();
}

/**
 * Build the user prompt with analysis context.
 */
export function buildUserPrompt(context: AnalysisContext): string {
  const parts: string[] = [];

  if (context.prd) {
    parts.push(`## PRD\n\n${context.prd}`);
  }

  if (context.diff) {
    // Truncate very large diffs
    const diff = context.diff.length > 15_000
      ? context.diff.slice(0, 15_000) + '\n\n... (truncated)'
      : context.diff;
    parts.push(`## Git Diff\n\n\`\`\`diff\n${diff}\n\`\`\``);
  }

  if (context.selectors) {
    parts.push(`## Selector Map\n\n\`\`\`json\n${JSON.stringify(context.selectors, null, 2)}\n\`\`\``);
  }

  if (context.eventSpecs) {
    parts.push(`## Event Specs (for data log QA)\n\n\`\`\`json\n${JSON.stringify(context.eventSpecs, null, 2)}\n\`\`\``);
  }

  // Existing stable tests to avoid duplication
  const stableTests = context.existingTests.filter((t) => t.status === 'stable');
  if (stableTests.length > 0) {
    const list = stableTests.map((t) => `- ${t.id}`).join('\n');
    parts.push(`## Existing Stable Tests (do not duplicate)\n\n${list}`);
  }

  if (context.app.url) {
    parts.push(`## App URL\n\n${context.app.url}`);
  }

  if (parts.length === 0) {
    parts.push('No PRD or diff provided. Generate basic smoke tests for the app.');
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Build a self-critique prompt for reviewing generated tests.
 */
export function buildCritiquePrompt(generatedTests: string): string {
  return `Review the following generated test code for issues:

1. Are all selectors from the provided selector map used correctly?
2. Are there any missing assertions?
3. Are there any security violations (eval, fs, child_process, etc.)?
4. Do all tests use auto-retry assertions instead of hard waits?
5. Are tests independent (no shared state)?

If there are issues, return the corrected JSON array.
If the tests are good, return the same JSON array unchanged.

Return ONLY the JSON array, no explanation.

Generated tests:
${generatedTests}`;
}
