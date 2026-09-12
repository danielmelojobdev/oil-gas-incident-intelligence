/**
 * CLI: explain why a headline was accepted or rejected by the Oil & Gas filter.
 *
 *   npm run -w @ogii/backend explain -- "some headline" ["excerpt"]
 *
 * The relevance decision is the product. When it gets something wrong, this is how you
 * find out which rule was responsible instead of guessing.
 */
import { evaluateOilGasHeuristics, evaluateExclusions, hasOilGasAnchor, foldCase } from '@ogii/domain';

const [, , title, excerpt] = process.argv;

if (title === undefined || title.trim() === '') {
  process.stderr.write('usage: explain "<headline>" ["<excerpt>"]\n');
  process.exit(1);
}

const verdict = evaluateOilGasHeuristics({ title, excerpt: excerpt ?? null });
const exclusion = evaluateExclusions(foldCase(`${title} ${excerpt ?? ''}`));

const line = (name: string, value: unknown): void => {
  process.stdout.write(`  ${name.padEnd(22)} ${String(value)}\n`);
};

process.stdout.write(`\n  "${title}"\n\n`);
line('verdict', verdict.passed ? 'ACCEPTED' : 'REJECTED');
line('heuristic score', `${verdict.score}/100`);
line('sector hint', verdict.sectorHint);
process.stdout.write('\n');
line('event signal', verdict.hasEventSignal);
line('  matched', verdict.matchedEventTerms.join(', ') || '(none)');
line('industry signal', verdict.hasIndustrySignal);
line('  matched', verdict.matchedIndustryTerms.join(', ') || '(none)');
line('  O&G anchor phrase', hasOilGasAnchor(`${title} ${excerpt ?? ''}`));
line('strong phrase', verdict.hasStrongPhrase);
line('  matched', verdict.matchedStrongPhrases.join(', ') || '(none)');
line('well vocabulary', verdict.hasWellSignal);
process.stdout.write('\n');
line('exclusion domain', exclusion.domain ?? '(none matched)');
line('excluded', exclusion.excluded);
line('anchor override', exclusion.overriddenByAnchor);
process.stdout.write(`\n  reason: ${verdict.reason}\n\n`);
