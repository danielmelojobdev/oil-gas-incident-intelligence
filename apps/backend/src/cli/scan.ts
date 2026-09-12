/**
 * CLI: run one scan to completion and print the summary from brief section 14.
 *
 *   npm run -w @ogii/backend scan
 */
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

  await container.shutdown();
}

main().catch((error: unknown) => {
  process.stderr.write(`scan failed: ${toErrorMessage(error)}\n`);
  process.exit(1);
});
