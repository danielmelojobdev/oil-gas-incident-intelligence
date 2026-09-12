/** Anthropic adapter. Only `complete()` is provider-specific. */
import { BaseAiProvider, type BaseAiOptions, type CompletionRequest, type CompletionResponse } from './base-ai-provider';
import { fetchJson, type HttpOptions } from '../util/http';
import { AiResponseError } from '../util/errors';

interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface AnthropicOptions extends BaseAiOptions {
  readonly apiKey: string | null;
  readonly http: HttpOptions;
  readonly baseUrl?: string;
  readonly apiVersion?: string;
}

export class AnthropicProvider extends BaseAiProvider {
  readonly id = 'anthropic';
  private readonly apiKey: string | null;
  private readonly http: HttpOptions;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(options: AnthropicOptions) {
    super({
      ...options,
      classifyModel: options.classifyModel || 'claude-haiku-4-5-20251001',
      extractModel: options.extractModel || 'claude-sonnet-5',
    });
    this.apiKey = options.apiKey;
    this.http = options.http;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com/v1';
    this.apiVersion = options.apiVersion ?? '2023-06-01';
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  protected async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.apiKey === null) throw new AiResponseError('ANTHROPIC_API_KEY is not configured', '');

    const { data } = await fetchJson<AnthropicResponse>(
      `${this.baseUrl}/messages`,
      this.http,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
        }),
      },
      'anthropic',
    );

    const text = data.content?.find((block) => block.type === 'text')?.text;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new AiResponseError('Anthropic returned an empty completion', JSON.stringify(data).slice(0, 500));
    }
    return {
      text,
      promptTokens: data.usage?.input_tokens ?? null,
      completionTokens: data.usage?.output_tokens ?? null,
    };
  }
}
