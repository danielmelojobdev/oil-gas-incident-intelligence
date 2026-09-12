/** Google Gemini adapter. Only `complete()` is provider-specific. */
import { BaseAiProvider, type BaseAiOptions, type CompletionRequest, type CompletionResponse } from './base-ai-provider';
import { fetchJson, type HttpOptions } from '../util/http';
import { AiResponseError } from '../util/errors';

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export interface GeminiOptions extends BaseAiOptions {
  readonly apiKey: string | null;
  readonly http: HttpOptions;
  readonly baseUrl?: string;
}

export class GeminiProvider extends BaseAiProvider {
  readonly id = 'gemini';
  private readonly apiKey: string | null;
  private readonly http: HttpOptions;
  private readonly baseUrl: string;

  constructor(options: GeminiOptions) {
    super({
      ...options,
      classifyModel: options.classifyModel || 'gemini-2.0-flash',
      extractModel: options.extractModel || 'gemini-2.5-pro',
    });
    this.apiKey = options.apiKey;
    this.http = options.http;
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  protected async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.apiKey === null) throw new AiResponseError('GEMINI_API_KEY is not configured', '');

    const { data } = await fetchJson<GeminiResponse>(
      `${this.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`,
      this.http,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            responseMimeType: 'application/json',
          },
        }),
      },
      'gemini',
    );

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
    if (typeof text !== 'string' || text.trim() === '') {
      throw new AiResponseError('Gemini returned an empty completion', JSON.stringify(data).slice(0, 500));
    }
    return {
      text,
      promptTokens: data.usageMetadata?.promptTokenCount ?? null,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
}
