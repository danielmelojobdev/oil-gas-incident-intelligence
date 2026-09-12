/** Composition of the configured AI provider. One switch, nothing else. */
import type { Env } from '../env';
import type { Logger } from '../logger';
import type { HttpOptions } from '../util/http';
import type { AIProvider } from './ai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GeminiProvider } from './gemini-provider';
import { MockAiProvider } from './mock-ai-provider';
import { OpenAiProvider } from './openai-provider';

export function createAiProvider(env: Env, logger: Logger, http: HttpOptions): AIProvider {
  if (env.APP_MODE === 'mock' || env.AI_PROVIDER === 'mock') {
    logger.info('ai provider: mock (rules engine, no API calls, no cost)');
    return new MockAiProvider();
  }

  const base = {
    classifyModel: env.AI_CLASSIFY_MODEL ?? '',
    extractModel: env.AI_EXTRACT_MODEL ?? '',
    logger,
    http: { ...http, timeoutMs: env.AI_TIMEOUT_MS },
  };

  switch (env.AI_PROVIDER) {
    case 'openai':
      return new OpenAiProvider({ ...base, apiKey: env.OPENAI_API_KEY });
    case 'anthropic':
      return new AnthropicProvider({ ...base, apiKey: env.ANTHROPIC_API_KEY });
    case 'gemini':
      return new GeminiProvider({ ...base, apiKey: env.GEMINI_API_KEY });
    default:
      return new MockAiProvider();
  }
}

export { MockAiProvider } from './mock-ai-provider';
export type { AIProvider, AiResult, ArticleForAi, IncidentForAi } from './ai-provider';
