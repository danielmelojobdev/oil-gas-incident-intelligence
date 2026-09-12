/**
 * Renders the shared report model (brief section 41) to printable HTML.
 *
 * The MODEL comes from `@ogii/domain`, so the disclaimer, the "system-assessed"
 * labelling and the "Not reported" handling cannot be lost by editing this template.
 */
import { PRODUCT, type IncidentReport } from '@ogii/domain';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fieldRows(fields: readonly { label: string; value: string; known: boolean }[]): string {
  return fields
    .map(
      (field) => `
        <tr>
          <th>${escapeHtml(field.label)}</th>
          <td${field.known ? '' : ' class="unknown"'}>${escapeHtml(field.value)}</td>
        </tr>`,
    )
    .join('');
}

export function renderReportHtml(report: IncidentReport): string {
  const highlights =
    report.highlights.length === 0
      ? '<li class="unknown">No highlights available.</li>'
      : report.highlights.map((text) => `<li>${escapeHtml(text)}</li>`).join('');

  const summary = report.summary
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join('');

  const sources = report.sources
    .map(
      (source) => `
      <li>
        <div class="src-publisher">${escapeHtml(source.publisher)}</div>
        <div class="src-title">${escapeHtml(source.title)}</div>
        <div class="src-meta">${escapeHtml(source.publishedAt)} &middot; ${escapeHtml(source.tier)}</div>
        <div class="src-url">${escapeHtml(source.url)}</div>
      </li>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(report.incidentTitle)}</title>
<style>
  /* A report is a print document: it is always light, whatever the viewer prefers.
     Without this the PDF renderer inherits a dark colour scheme and the page is unreadable. */
  :root { color-scheme: light; }
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #14203a; font-size: 11pt; line-height: 1.45; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc-head { border-bottom: 2.5pt solid #14203a; padding-bottom: 10pt; margin-bottom: 16pt; }
  .doc-title { font-size: 13pt; font-weight: 800; letter-spacing: 0.7pt; text-transform: uppercase; margin: 0 0 6pt; }
  .incident-title { font-size: 19pt; font-weight: 700; line-height: 1.2; margin: 0 0 6pt; }
  .generated { font-size: 9pt; color: #63708a; margin: 0; }
  .mock {
    background: #fdeee5; border: 1pt solid #d4541f; color: #9a3a12;
    font-size: 9pt; font-weight: 700; letter-spacing: 0.5pt; text-transform: uppercase;
    padding: 6pt 8pt; margin: 0 0 14pt; text-align: center; border-radius: 3pt;
  }
  h2 {
    font-size: 10pt; font-weight: 800; letter-spacing: 0.9pt; text-transform: uppercase;
    color: #14203a; border-bottom: 0.75pt solid #c8d0de; padding-bottom: 4pt;
    margin: 20pt 0 9pt;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 4.5pt 0; border-bottom: 0.5pt solid #e6eaf1; font-size: 10pt; }
  th { width: 38%; font-weight: 600; color: #5b688a; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.4pt; padding-right: 10pt; }
  td.unknown { color: #99a3b8; font-style: italic; }
  ul { margin: 0; padding-left: 14pt; }
  li { margin-bottom: 5pt; }
  li.unknown { color: #99a3b8; font-style: italic; }
  p { margin: 0 0 8pt; }
  ol.sources { list-style: decimal; padding-left: 16pt; }
  ol.sources li { margin-bottom: 9pt; }
  .src-publisher { font-weight: 700; }
  .src-title { }
  .src-meta { font-size: 9pt; color: #63708a; }
  .src-url { font-size: 8.5pt; color: #2a6ba8; word-break: break-all; }
  .disclaimer {
    margin-top: 20pt; padding: 9pt; background: #f2f5f9; border-left: 2.5pt solid #63708a;
    font-size: 9pt; color: #3d4a66;
  }
  .footer { margin-top: 14pt; padding-top: 7pt; border-top: 0.5pt solid #c8d0de; font-size: 8.5pt; color: #7b869c; text-align: center; }
</style>
</head>
<body>
  ${report.isMock ? `<div class="mock">Mock data &mdash; fictional incident generated for testing. Not a real event.</div>` : ''}

  <header class="doc-head">
    <p class="doc-title">${escapeHtml(report.documentTitle)}</p>
    <h1 class="incident-title">${escapeHtml(report.incidentTitle)}</h1>
    <p class="generated">Generated: ${escapeHtml(report.generatedAt)}</p>
  </header>

  <h2>Incident Overview</h2>
  <table>${fieldRows(report.overview)}</table>

  <h2>System Assessment</h2>
  <table>${fieldRows(report.assessment)}</table>

  <h2>Key Highlights</h2>
  <ul>${highlights}</ul>

  <h2>Incident Summary</h2>
  ${summary}

  <h2>Consequences</h2>
  <table>${fieldRows(report.consequences)}</table>

  <h2>Sources</h2>
  <ol class="sources">${sources}</ol>

  <div class="disclaimer">${escapeHtml(report.disclaimer)}</div>
  <div class="footer">${escapeHtml(report.footer)} &middot; ${escapeHtml(PRODUCT.shortName)}</div>
</body>
</html>`;
}
