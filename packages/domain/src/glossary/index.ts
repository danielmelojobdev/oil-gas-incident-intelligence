import type { LanguageCode } from '../taxonomy';
import { foldCase } from '../text/normalise';
import { EN_GLOSSARY } from './en';
import { ES_GLOSSARY } from './es';
import { FR_GLOSSARY } from './fr';
import { NO_GLOSSARY } from './no';
import { PT_GLOSSARY } from './pt';
import type { Glossary } from './types';

export type { Glossary } from './types';
export { EN_GLOSSARY, PT_GLOSSARY, ES_GLOSSARY, FR_GLOSSARY, NO_GLOSSARY };

export const GLOSSARIES: Readonly<Record<LanguageCode, Glossary>> = {
  en: EN_GLOSSARY,
  pt: PT_GLOSSARY,
  es: ES_GLOSSARY,
  fr: FR_GLOSSARY,
  no: NO_GLOSSARY,
};

export function getGlossary(language: LanguageCode): Glossary {
  return GLOSSARIES[language];
}

export function getGlossaries(languages: readonly LanguageCode[]): Glossary[] {
  return languages.map(getGlossary);
}

/**
 * Cross-language term aggregates used by the language-agnostic heuristic.
 *
 * They are FOLDED (lowercase, diacritics stripped) because the heuristic matches them
 * against folded article text: an accented glossary entry such as `petroleo` with an
 * acute accent would otherwise never match.
 *
 * Duplicates across languages are removed and longer phrases are ordered first so that
 * "oil platform" is reported as the match rather than "oil".
 */
function foldedUnique(select: (glossary: Glossary) => readonly string[]): readonly string[] {
  const terms = new Set(Object.values(GLOSSARIES).flatMap((glossary) => select(glossary).map(foldCase)));
  return [...terms].sort((a, b) => b.length - a.length);
}

export const ALL_INDUSTRY_TERMS = foldedUnique((g) => g.industryTerms);
export const ALL_EVENT_TERMS = foldedUnique((g) => g.eventTerms);
export const ALL_STRONG_PHRASES = foldedUnique((g) => g.strongPhrases);
export const ALL_WELL_TERMS = foldedUnique((g) => g.wellTerms);
export const ALL_EXCLUSION_TERMS = foldedUnique((g) => g.exclusionTerms);
