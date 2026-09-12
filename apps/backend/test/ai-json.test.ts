import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { oilGasRelevanceResultSchema, extractedIncidentSchema } from '@ogii/domain';
import { extractJsonObject, parseAiJson } from '../src/ai/json';
import { AiResponseError } from '../src/util/errors';

const simple = z.object({ a: z.string(), b: z.number().nullable() });

describe('AI JSON parsing (anti-hallucination gate)', () => {
  it('parses a bare JSON object', () => {
    expect(parseAiJson(simple, '{"a":"x","b":1}')).toEqual({ a: 'x', b: 1 });
  });

  it('unwraps a fenced code block', () => {
    expect(parseAiJson(simple, '```json\n{"a":"x","b":null}\n```')).toEqual({ a: 'x', b: null });
  });

  it('ignores prose before and after the object', () => {
    const raw = 'Here is the result:\n```\n{"a":"x","b":2}\n```\nLet me know if you need more.';
    expect(parseAiJson(simple, raw)).toEqual({ a: 'x', b: 2 });
  });

  it('repairs trailing commas', () => {
    expect(parseAiJson(simple, '{"a":"x","b":3,}')).toEqual({ a: 'x', b: 3 });
  });

  it('handles braces inside string values', () => {
    expect(extractJsonObject('{"a":"a } b","b":1}')).toBe('{"a":"a } b","b":1}');
  });

  it('normalises the strings models use for "not reported" into null', () => {
    const schema = z.object({ operator: z.string().nullable(), fatalities: z.number().nullable() });
    expect(parseAiJson(schema, '{"operator":"N/A","fatalities":null}')).toEqual({
      operator: null,
      fatalities: null,
    });
    expect(parseAiJson(schema, '{"operator":"not reported","fatalities":null}').operator).toBeNull();
    expect(parseAiJson(schema, '{"operator":"  ","fatalities":null}').operator).toBeNull();
  });

  it('leaves the literal "unknown" alone: it is a valid taxonomy value', () => {
    const schema = z.object({ sector: z.enum(['upstream', 'unknown']) });
    expect(parseAiJson(schema, '{"sector":"unknown"}').sector).toBe('unknown');
  });

  it('but maps "unknown" to null on free-text fields, so it is never shown as a name', () => {
    const raw = JSON.stringify({
      isOilAndGasRelated: true,
      oilAndGasSector: 'upstream',
      confidence: 0.7,
      title: 'Test',
      summary: 'Summary.',
      operator: 'Unknown',
      asset: 'N/A',
      field: 'not reported',
    });
    const result = parseAiJson(extractedIncidentSchema, raw);
    expect(result.operator).toBeNull();
    expect(result.asset).toBeNull();
    expect(result.field).toBeNull();
    expect(result.oilAndGasSector).toBe('upstream');
  });

  it('never turns "not reported" into 0', () => {
    const schema = z.object({ fatalities: z.number().int().min(0).nullable() });
    expect(parseAiJson(schema, '{"fatalities":"not reported"}')).toEqual({ fatalities: null });
    expect(parseAiJson(schema, '{"fatalities":0}')).toEqual({ fatalities: 0 });
  });

  it('rejects a response with no JSON at all', () => {
    expect(() => parseAiJson(simple, 'I cannot help with that.')).toThrow(AiResponseError);
  });

  it('rejects a response that fails validation', () => {
    expect(() => parseAiJson(simple, '{"a":123,"b":"nope"}')).toThrow(AiResponseError);
  });

  it('rejects an unbalanced object', () => {
    expect(() => parseAiJson(simple, '{"a":"x"')).toThrow(AiResponseError);
  });

  it('validates a realistic relevance response', () => {
    const raw = `\`\`\`json
{
  "isOilAndGasRelated": true,
  "confidence": 0.96,
  "oilAndGasSector": "upstream",
  "isIncident": true,
  "reason": "The article describes an offshore drilling well control incident.",
}
\`\`\``;
    const result = parseAiJson(oilGasRelevanceResultSchema, raw);
    expect(result.isOilAndGasRelated).toBe(true);
    expect(result.oilAndGasSector).toBe('upstream');
    expect(result.confidence).toBeCloseTo(0.96, 2);
  });

  it('coerces an invalid enum to null rather than corrupting the record', () => {
    const raw = JSON.stringify({
      isOilAndGasRelated: true,
      oilAndGasSector: 'upstream',
      confidence: 0.8,
      title: 'Test incident',
      summary: 'A summary.',
      highlights: [],
      installationType: 'flying_saucer',
      environment: 'offshore',
      lifecycleStage: 'production',
      incidentType: 'fire',
      severity: 'high',
    });
    const result = parseAiJson(extractedIncidentSchema, raw);
    expect(result.installationType).toBeNull();
    expect(result.incidentType).toBe('fire');
  });

  it('defaults a missing enum to its safe value instead of failing', () => {
    const raw = JSON.stringify({
      isOilAndGasRelated: true,
      oilAndGasSector: 'unknown',
      confidence: 0.5,
      title: 'Test',
      summary: 'Summary.',
    });
    const result = parseAiJson(extractedIncidentSchema, raw);
    expect(result.environment).toBe('unknown');
    expect(result.lifecycleStage).toBe('unknown');
    expect(result.incidentType).toBe('other');
    expect(result.fatalities).toBeNull();
  });
});
