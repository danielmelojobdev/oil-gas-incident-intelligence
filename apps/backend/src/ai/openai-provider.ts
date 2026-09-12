/** OpenAI adapter. Only `complete()` is provider-specific. */
import { BaseAiProvider, type BaseAiOptions, type CompletionRequest, type CompletionResponse } from './base-ai-provider';
import { fetchJson, type HttpOptions } from '../util/http';
import { AiResponseError } from '../util/errors';

interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface OpenAiOptions extends BaseAiOptions {
  readonly apiKey: string | null;
  readonly http: HttpOptions;
  readonly baseUrl?: string;
}

export class OpenAiProvider extends BaseAiProvider {
  readonly id = 'openai';
  private readonly apiKey: string | null;
  private readonly http: HttpOptions;
  private readonly baseUrl: string;

  constructor(options: OpenAiOptions) {
    super({
      ...options,
      classifyModel: options.classifyModel || 'gpt-4o-mini',
      extractModel: options.extractModel || 'gpt-4o',
    });
    this.apiKey = options.apiKey;
    this.http = options.http;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  protected async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.apiKey === null) throw new AiResponseError('OPENAI_API_KEY is not configured', '');

    const { data } = await fetchJson<OpenAiChatResponse>(
      `${this.baseUrl}/chat/completions`,
      this.http,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: request.model,
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
      },
      'openai',
    );

    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new AiResponseError('OpenAI returned an empty completion', JSON.stringify(data).slice(0, 500));
    }
    return {
      text,
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
    };
  }
}
