/**
 * Renders a sample incident report to HTML so the PDF layout can be reviewed in a
 * browser without building the app.
 *
 *   npm run -w @ogii/mobile report:sample -- out.html [incident-id]
 */
import { writeFileSync } from 'node:fs';
import { buildIncidentReport, buildMockDataset } from '@ogii/domain';
import { renderReportHtml } from '../src/pdf/report-html';

const [, , outPath = 'sample-report.html', incidentId] = process.argv;

const now = new Date();
const dataset = buildMockDataset(now);
const incident =
  incidentId === undefined ? dataset.find((item) => item.articles.length >= 4) : dataset.find((item) => item.id === incidentId);

if (incident === undefined) {
  process.stderr.write(`No mock incident found${incidentId === undefined ? '' : ` for id "${incidentId}"`}.\n`);
  process.exit(1);
}

writeFileSync(outPath, renderReportHtml(buildIncidentReport(incident, now)));
process.stdout.write(`Wrote ${outPath} for "${incident.title}"\n`);
