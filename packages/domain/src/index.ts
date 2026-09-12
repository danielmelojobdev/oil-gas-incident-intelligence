/**
 * @ogii/domain — pure, I/O-free domain core.
 *
 * Imported by the mobile app, the scanner backend and the test suite. Contains no
 * `fetch`, no `fs`, no `process.env` and no implicit clock: `now` is always injected.
 */

export * from './taxonomy';
export * from './schemas';

export * from './config/defaults';
export * from './config/thresholds';

export * from './glossary';

export * from './text/normalise';
export * from './text/hash';
export * from './text/url';
export * from './text/similarity';

export * from './time/periods';

export * from './search/query-generator';

export * from './filtering/exclusions';
export * from './filtering/relevance-heuristics';

export * from './dedup/article-dedup';
export * from './dedup/incident-grouping';

export * from './scoring/severity';
export * from './scoring/confidence';
export * from './scoring/relevance-score';

export * from './updates/material-update';

export * from './query/filters';
export * from './report/incident-report';

export * from './mock';
