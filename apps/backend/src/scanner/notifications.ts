/**
 * Notification dispatch (brief sections 36 and 37).
 *
 * Three independent gates, all of which must pass:
 *   1. Quality   — relevance in the feed band and confidence above the floor.
 *   2. Preference— the user asked for this severity / category / country.
 *   3. Novelty   — (user, incident, fingerprint) has never been notified before.
 *
 * The novelty gate is also enforced by a UNIQUE constraint in the database, so a bug
 * here still cannot ring the same phone twice.
 */
import {
  THRESHOLDS,
  label,
  truncate,
  userPreferencesSchema,
  updateFingerprint as computeFingerprint,
  type IncidentDetail,
  type MaterialUpdateResult,
  type NotificationPreferences,
  type Severity,
} from '@ogii/domain';
import type { Database } from '../db/database';
import type { Logger } from '../logger';
import type { PushMessage, PushProvider } from '../notifications/push-provider';
import { toErrorMessage } from '../util/errors';

const SEVERITY_RANK: Readonly<Record<Severity, number>> = { low: 0, moderate: 1, high: 2, critical: 3 };

export interface NotificationDispatcherOptions {
  readonly db: Database;
  readonly push: PushProvider;
  readonly logger: Logger;
  readonly notifyMinConfidence: number;
}

export class NotificationDispatcher {
  private sent = 0;
  /**
   * Incidents already alerted during the current scan.
   *
   * Two sources of the same incident can both carry a material development within one
   * scan. Each is recorded in `material_updates`, but the user gets ONE alert: two
   * buzzes a second apart about the same platform is noise, not intelligence.
   */
  private readonly alertedThisRun = new Set<string>();

  constructor(private readonly options: NotificationDispatcherOptions) {}

  get sentCount(): number {
    return this.sent;
  }

  /** Called at the start of every scan run. */
  reset(): void {
    this.sent = 0;
    this.alertedThisRun.clear();
  }

  /** Gate 2: does this incident match what the user asked to be told about? */
  private matchesPreferences(incident: IncidentDetail, preferences: NotificationPreferences): boolean {
    if (!preferences.enabled) return false;
    if (preferences.criticalOnly && incident.severity !== 'critical') return false;
    if (SEVERITY_RANK[incident.severity] < SEVERITY_RANK[preferences.minSeverity]) return false;
    if (preferences.severities.length > 0 && !preferences.severities.includes(incident.severity)) return false;
    if (preferences.incidentTypes.length > 0 && !preferences.incidentTypes.includes(incident.incidentType)) {
      return false;
    }
    if (preferences.countries.length > 0) {
      const country = (incident.country ?? '').toLowerCase();
      if (!preferences.countries.some((value) => value.toLowerCase() === country)) return false;
    }
    if (!preferences.wellIntegrityAlerts && incident.isWellIntegrityRelated === true) return false;
    if (
      !preferences.wellControlAlerts &&
      (incident.incidentType === 'well_control' || incident.incidentType === 'blowout')
    ) {
      return false;
    }
    return true;
  }

  private buildBody(incident: IncidentDetail): string {
    const parts = [
      incident.country,
      label(incident.environment) === 'Unknown' ? null : label(incident.environment),
      `${label(incident.severity)} severity`,
    ].filter((part): part is string => part !== null && part !== '');
    const lead = incident.summary?.split('\n')[0] ?? incident.title;
    return `${truncate(lead, 140)}\n${parts.join(' · ')}`;
  }

  private async dispatch(
    incident: IncidentDetail,
    kind: 'new_incident' | 'material_update',
    title: string,
    body: string,
    fingerprint: string,
    materialUpdateId: string | null,
  ): Promise<number> {
    const { db, push, logger } = this.options;

    if (this.alertedThisRun.has(incident.id)) {
      logger.debug('incident already alerted in this scan, coalescing', { incidentId: incident.id });
      return 0;
    }

    const devices = await db.listActiveDevices();
    if (devices.length === 0) {
      logger.debug('no registered devices, nothing to send', { incidentId: incident.id });
      return 0;
    }

    const messages: PushMessage[] = [];
    const recipients: { userId: string | null; token: string }[] = [];

    for (const device of devices) {
      const preferences =
        device.userId === null
          ? userPreferencesSchema.parse({}).notifications
          : (await db.getUserPreferences(device.userId)).notifications;

      if (!this.matchesPreferences(incident, preferences)) continue;
      if (await db.hasNotification(device.userId, incident.id, fingerprint)) continue;

      messages.push({
        to: device.expoPushToken,
        title,
        body,
        sound: preferences.sound,
        data: { incidentId: incident.id, kind },
      });
      recipients.push({ userId: device.userId, token: device.expoPushToken });
    }

    if (messages.length === 0) return 0;

    let results;
    try {
      results = await push.send(messages);
    } catch (error) {
      logger.error('push send failed', { incidentId: incident.id, error: toErrorMessage(error) });
      results = messages.map((message) => ({ token: message.to, ok: false, error: toErrorMessage(error) }));
    }

    let delivered = 0;
    for (const [index, result] of results.entries()) {
      const recipient = recipients[index];
      if (recipient === undefined) continue;
      await db.recordNotification(
        {
          userId: recipient.userId,
          incidentId: incident.id,
          materialUpdateId,
          kind,
          title,
          body,
          updateFingerprint: fingerprint,
        },
        result.ok ? 'sent' : 'failed',
        result.error,
      );
      if (result.ok) delivered += 1;
    }

    if (delivered > 0) this.alertedThisRun.add(incident.id);
    this.sent += delivered;
    return delivered;
  }

  /** Gate 1 + dispatch for a brand new incident. */
  async notifyNewIncident(incident: IncidentDetail, confidenceScore: number): Promise<number> {
    if (incident.status === 'under_review') return 0;
    if (confidenceScore < THRESHOLDS.notification.minConfidenceScore) {
      this.options.logger.info('confidence below the notification floor, queued for review only', {
        incidentId: incident.id,
        confidenceScore,
      });
      return 0;
    }

    const fingerprint = computeFingerprint([
      'new',
      incident.id,
      incident.severity,
      incident.consequences.fatalities,
      incident.consequences.injuries,
    ]);

    return this.dispatch(
      incident,
      'new_incident',
      'NEW OIL & GAS INCIDENT',
      this.buildBody(incident),
      fingerprint,
      null,
    );
  }

  /** Only ever called when the rules found a real change (brief section 37). */
  async notifyMaterialUpdate(
    incident: IncidentDetail,
    update: MaterialUpdateResult,
    materialUpdateId: string | null,
    confidenceScore: number,
  ): Promise<number> {
    if (!update.isMaterialUpdate) return 0;
    if (confidenceScore < THRESHOLDS.notification.minConfidenceScore) return 0;

    const headline = update.descriptions[0] ?? 'New information has been reported.';
    return this.dispatch(
      incident,
      'material_update',
      'INCIDENT UPDATE',
      `${truncate(incident.title, 90)}\n${truncate(headline, 140)}`,
      update.fingerprint,
      materialUpdateId,
    );
  }
}
