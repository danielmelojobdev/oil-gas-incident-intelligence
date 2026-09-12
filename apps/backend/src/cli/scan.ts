/**
 * CLI: run one scan to completion and print the summary from brief section 14.
 *
 *   npm run -w @ogii/backend scan
 */
import { incidentFiltersSchema, label } from '@ogii/domain';
import { createContainer } from '../container';
import { ScanQueue } from '../scanner/scan-queue';
import { toErrorMessage } from '../util/errors';

async function main(): Promise<void> {
  const container = await createContainer();
  const queue = new ScanQueue(container.scanner, container.logger);

  const summary = await queue.runToCompletion('manual', container.defaultScanConfig());

  const lines = [
    '',
    '  Scan complete.',
    '',
    `  ${summary.sourcesSearched} sources searched`,
    `  ${summary.articlesAnalysed} articles analysed`,
    `  ${summary.potentialIncidents} potential incidents`,
    `  ${summary.rejected} rejected`,
    `  ${summary.duplicates} duplicates`,
    `  ${summary.newIncidents} new incidents`,
    `  ${summary.updatedIncidents} updated incidents`,
    `  ${summary.notificationsSent} notifications sent`,
    '',
    `  Duration: ${(summary.durationMs / 1000).toFixed(1)}s   AI calls: ${summary.run.aiCalls}   Status: ${summary.run.status}`,
    '',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);

  if (summary.run.errors.length > 0) {
    process.stdout.write(`  Provider notes:\n${summary.run.errors.map((error) => `    - ${error}`).join('\n')}\n\n`);
  }

  // Show what the run actually produced. Counters alone hide quality problems:
  // 25 incidents is only good news if they are 25 real Oil & Gas incidents.
  const page = await container.db.listIncidents(
    incidentFiltersSchema.parse({ period: 'last_30_days', limit: 40, sort: 'relevance_desc' }),
    null,
    container.now(),
  );

  if (page.items.length > 0) {
    process.stdout.write(`  Incidents in the feed (${page.total}), best relevance first:\n\n`);
    for (const incident of page.items) {
      const facts = [
        incident.country,
        incident.operator,
        incident.asset,
        label(incident.incidentType),
        label(incident.environment),
      ]
        .filter((value): value is string => value !== null && value !== '' && value !== 'Unknown')
        .join(' | ');
      process.stdout.write(
        `  [rel ${String(incident.relevanceScore).padStart(3)} | sev ${incident.severity.padEnd(8)} | conf ${incident.confidence.padEnd(6)} | ${String(incident.sourceCount)} src] ` +
          `${incident.title.slice(0, 96)}\n` +
          `        ${facts || '(no structured facts extracted)'}\n`,
      );
    }
    process.stdout.write('\n');
  }

  await container.shutdown();
}

main().catch((error: unknown) => {
  process.stderr.write(`scan failed: ${toErrorMessage(error)}\n`);
  process.exit(1);
});
