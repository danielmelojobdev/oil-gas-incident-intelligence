import type { LanguageCode } from '../taxonomy';

/**
 * A per-language technical glossary.
 *
 * Deliberately NOT a literal translation of the English list: each language gets the
 * terms the industry actually uses in that language (e.g. Norwegian "brønnkontroll",
 * Portuguese "controle de poço"), plus the English loanwords that are used verbatim in
 * that market ("blowout", "BOP", "FPSO").
 */
export interface Glossary {
  readonly language: LanguageCode;
  /** Terms that mark the text as Oil & Gas. Required for relevance. */
  readonly industryTerms: readonly string[];
  /** Terms that mark the text as an incident/event. Required for relevance. */
  readonly eventTerms: readonly string[];
  /** High-signal phrases that on their own are strong evidence of an O&G incident. */
  readonly strongPhrases: readonly string[];
  /** Asset nouns used to build asset-specific queries. */
  readonly assetTerms: readonly string[];
  /** Well-integrity / well-control vocabulary. */
  readonly wellTerms: readonly string[];
  /** Ready-made high-value search phrases for the query generator. */
  readonly searchPhrases: readonly string[];
  /** Words that, in this language, indicate the article is about something else. */
  readonly exclusionTerms: readonly string[];
}
