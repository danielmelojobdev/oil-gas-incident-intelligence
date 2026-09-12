/** Native share sheet, clipboard and PDF sharing (brief section 42). */
import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { PRODUCT, formatDisplayDate, label, type IncidentDetail } from '@ogii/domain';

export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}

/** Share the original article link. The publisher is always named. */
export async function shareOriginalLink(publisher: string, title: string, url: string): Promise<void> {
  await Share.share(
    Platform.OS === 'ios'
      ? { url, message: `${title} — ${publisher}` }
      : { message: `${title} — ${publisher}\n${url}` },
    { dialogTitle: 'Share original source' },
  );
}

/** Share a plain-text summary of the incident. */
export async function shareIncidentSummary(incident: IncidentDetail): Promise<void> {
  const lines = [
    incident.title.toUpperCase(),
    '',
    [incident.country, formatDisplayDate(incident.incidentDate)].filter(Boolean).join(' · '),
    incident.operator === null ? null : `Operator: ${incident.operator}`,
    incident.asset === null ? null : `Asset: ${incident.asset}`,
    `${label(incident.environment)} · ${label(incident.lifecycleStage)} · ${label(incident.incidentType)}`,
    `Severity: ${label(incident.severity)} (${PRODUCT.severityCaveat})`,
    `Confidence: ${label(incident.confidence)}`,
    `Sources: ${incident.sourceCount}`,
    '',
    incident.summary ?? '',
    '',
    ...incident.highlights.slice(0, 6).map((highlight) => `• ${highlight.text}`),
    '',
    'Sources:',
    ...incident.articles.slice(0, 6).map((article) => `- ${article.publisher}: ${article.originalUrl}`),
    '',
    PRODUCT.disclaimer,
  ].filter((line): line is string => line !== null);

  await Share.share({ message: lines.join('\n') }, { dialogTitle: 'Share incident summary' });
}

/** Hands a generated PDF to the native share sheet (AirDrop, Mail, Files, Teams...). */
export async function sharePdf(fileUri: string, title: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/pdf',
    dialogTitle: title,
    UTI: 'com.adobe.pdf',
  });
  return true;
}
