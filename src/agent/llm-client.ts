import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import type { SentinelConfig } from '../types/config.js';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResponse {
  content: string;
  usage: TokenUsage;
}

/**
 * Abstract LLM client interface.
 *
 * Allows swapping Claude for another provider in the future.
 */
export interface LLMClient {
  call(systemPrompt: string, userPrompt: string): Promise<LLMResponse>;
  getTotalUsage(): TokenUsage;
}

/**
 * Claude API client with token usage tracking.
 */
export class ClaudeLLMClient implements LLMClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private maxTokensPerRun: number;
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(config: SentinelConfig) {
    this.client = new Anthropic();
    this.model = config.anthropic.model;
    this.maxTokens = config.anthropic.max_tokens;
    this.maxTokensPerRun = config.cost.max_tokens_per_run;
  }

  async call(systemPrompt: string, userPrompt: string): Promise<LLMResponse> {
    // Check token budget before calling
    const totalConsumed = this.totalUsage.inputTokens + this.totalUsage.outputTokens;
    if (totalConsumed >= this.maxTokensPerRun) {
      throw new Error(
        `Token budget exceeded: ${totalConsumed} >= ${this.maxTokensPerRun}. ` +
        'Increase cost.max_tokens_per_run in config to continue.',
      );
    }

    logger.info(`Calling Claude API (model: ${this.model})...`);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };

    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;

    logger.info(
      `Claude API response: ${usage.inputTokens} input + ${usage.outputTokens} output tokens ` +
      `(total: ${this.totalUsage.inputTokens + this.totalUsage.outputTokens})`,
    );

    // Extract text content
    const textBlock = response.content.find((b) => b.type === 'text');
    const content = textBlock?.text ?? '';

    return { content, usage };
  }

  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }
}
