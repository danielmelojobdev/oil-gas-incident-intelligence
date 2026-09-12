/**
 * PDF generation, preview and sharing (brief section 41).
 *
 * `expo-print` renders the HTML to a real PDF file; `expo-sharing` hands it to the
 * native share sheet, which is how "send to computer" works (AirDrop, Mail, Files,
 * Drive, Teams — whatever the user has).
 */
import * as Print from 'expo-print';
import { buildIncidentReport, type IncidentDetail, type IncidentReport } from '@ogii/domain';
import { renderReportHtml } from './report-html';
import { sharePdf } from '../lib/share';

export interface GeneratedPdf {
  readonly uri: string;
  readonly fileName: string;
  readonly report: IncidentReport;
}

function safeFileName(incident: IncidentDetail): string {
  const slug = incident.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  const date = incident.incidentDate ?? 'undated';
  return `ogii-incident-${date}-${slug || 'report'}.pdf`;
}

/** Builds the report model, renders it and writes a PDF to the cache directory. */
export async function generateIncidentPdf(incident: IncidentDetail, now: Date): Promise<GeneratedPdf> {
  const report = buildIncidentReport(incident, now);
  const html = renderReportHtml(report);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return { uri, fileName: safeFileName(incident), report };
}

/** Opens the OS print/preview sheet without writing a file. */
export async function previewIncidentPdf(incident: IncidentDetail, now: Date): Promise<void> {
  const report = buildIncidentReport(incident, now);
  await Print.printAsync({ html: renderReportHtml(report) });
}

/** Generate, then hand the file to the share sheet. Returns false if sharing is unavailable. */
export async function exportAndShareIncidentPdf(incident: IncidentDetail, now: Date): Promise<boolean> {
  const pdf = await generateIncidentPdf(incident, now);
  return sharePdf(pdf.uri, `Export ${pdf.fileName}`);
}
