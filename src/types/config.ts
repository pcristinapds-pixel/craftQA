import { z } from 'zod';

export const agentConfigSchema = z.object({
  appId: z.string().min(1),
  prNumber: z.number().int().positive().optional(),
  baseBranch: z.string().default('main'),
  maxRetries: z.number().int().min(0).default(3),
  validateEvents: z.boolean().default(false),
  prdPath: z.string().optional(),
  diff: z.string().optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const sentinelConfigSchema = z.object({
  anthropic: z.object({
    model: z.string().default('claude-sonnet-4-20250514'),
    max_tokens: z.number().default(4096),
  }).default({}),
  slack: z.object({
    webhook_url: z.string().optional(),
    channel: z.string().default('#qa-alerts'),
  }).default({}),
  github: z.object({
    comment_on_pr: z.boolean().default(true),
  }).default({}),
  test: z.object({
    max_retries: z.number().default(3),
    timeout: z.number().default(300_000),
    confidence_threshold: z.number().default(0.7),
    quarantine: z.object({
      enabled: z.boolean().default(true),
      window: z.number().default(5),
    }).default({}),
  }).default({}),
  cost: z.object({
    track_tokens: z.boolean().default(true),
    max_tokens_per_run: z.number().default(100_000),
  }).default({}),
});

export type SentinelConfig = z.infer<typeof sentinelConfigSchema>;
