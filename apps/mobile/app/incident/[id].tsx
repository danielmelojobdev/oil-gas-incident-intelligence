/** Incident details (brief sections 34, 35, 41, 42). */
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  PRODUCT,
  formatDisplayDate,
  formatDisplayDateTime,
  label,
  type IncidentDetail,
  type UserIncidentState,
} from '@ogii/domain';
import { useTheme } from '../../src/theme';
import { Button, Card, Divider, Row, Screen, Spinner, Txt } from '../../src/components/primitives';
import {
  ConfidencePill,
  FieldRow,
  ScoreBar,
  SeverityPill,
  StatusTag,
  TierBadge,
} from '../../src/components/indicators';
import { EmptyState, ErrorState, InfoNote, MockBanner } from '../../src/components/states';
import { useIncident, useMeta, useSetIncidentState } from '../../src/hooks/queries';
import { formatBoolean, formatCount, joinDefined } from '../../src/lib/format';
import { incidentDeepLink, openArticle } from '../../src/lib/links';
import { copyToClipboard, shareIncidentSummary, shareOriginalLink } from '../../src/lib/share';
import { exportAndShareIncidentPdf, previewIncidentPdf } from '../../src/pdf/export';

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ marginTop: theme.spacing.xl }}>
      <Txt variant="label" muted uppercase style={{ marginBottom: theme.spacing.sm }}>
        {title}
      </Txt>
      <Card style={{ paddingHorizontal: theme.spacing.md }}>{children}</Card>
    </View>
  );
}

export default function IncidentDetailScreen(): React.JSX.Element {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : undefined;
  const now = useMemo(() => new Date(), []);

  const meta = useMeta();
  const query = useIncident(id);
  const setState = useSetIncidentState();
  const [busy, setBusy] = useState<string | null>(null);

  const incident = query.data ?? null;

  const changeState = useCallback(
    (state: UserIncidentState) => {
      if (id === undefined) return;
      setState.mutate({ id, state });
    },
    [id, setState],
  );

  const handleExportPdf = useCallback(async () => {
    if (incident === null) return;
    setBusy('pdf');
    try {
      const shared = await exportAndShareIncidentPdf(incident, now);
      if (!shared) {
        Alert.alert('Sharing unavailable', 'The PDF was generated but sharing is not available on this device.');
      }
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'The PDF could not be generated.');
    } finally {
      setBusy(null);
    }
  }, [incident, now]);

  const handlePreviewPdf = useCallback(async () => {
    if (incident === null) return;
    setBusy('preview');
    try {
      await previewIncidentPdf(incident, now);
    } catch (error) {
      Alert.alert('Preview failed', error instanceof Error ? error.message : 'The preview could not be opened.');
    } finally {
      setBusy(null);
    }
  }, [incident, now]);

  if (query.isLoading) return <Spinner label="Loading incident" />;

  if (query.isError) {
    return (
      <Screen>
        <ErrorState
          message={query.error instanceof Error ? query.error.message : 'The incident could not be loaded.'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  if (incident === null) {
    return (
      <Screen>
        <EmptyState title="Incident not found" message="It may have been removed, or the link is out of date." />
      </Screen>
    );
  }

  const location = joinDefined([incident.city, incident.region, incident.country]);
  const well = joinDefined([incident.wellName, incident.wellNumber], ' ');
  const saved = incident.userState === 'saved';
  const archived = incident.userState === 'archived';

  return (
    <Screen padded={false}>
      {meta.data?.isMock === true && meta.data.mockBanner !== null ? (
        <MockBanner text={meta.data.mockBanner} />
      ) : null}

      <ScrollView
        contentContainerStyle={{
          padding: theme.layout.screenPadding,
          paddingBottom: theme.spacing.xxxl * 2,
        }}
      >
        {/* ---------------------------------------------------------- Overview */}
        <Row gap={theme.spacing.xs} wrap>
          <StatusTag status={incident.status} />
          <SeverityPill severity={incident.severity} compact />
          <ConfidencePill confidence={incident.confidence} compact />
        </Row>

        <Txt variant="display" style={{ marginTop: theme.spacing.md }}>
          {incident.title}
        </Txt>

        <Txt variant="small" muted style={{ marginTop: theme.spacing.xs }}>
          {joinDefined([formatDisplayDate(incident.incidentDate), incident.country, incident.operator])}
        </Txt>
        <Txt variant="caption" faint style={{ marginTop: 2 }}>
          Detected {formatDisplayDateTime(incident.detectedAt)} · Last updated{' '}
          {formatDisplayDateTime(incident.lastUpdatedAt)}
        </Txt>

        {incident.incidentDateIsEstimated ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <InfoNote>
              The incident date was not stated by the sources; the publication date is shown as an estimate.
            </InfoNote>
          </View>
        ) : null}

        {/* -------------------------------------------------------- Highlights */}
        <Section title="Key Highlights">
          <View style={{ paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
            {incident.highlights.length === 0 ? (
              <Txt variant="small" faint>
                No highlights are available for this incident yet.
              </Txt>
            ) : (
              incident.highlights
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((highlight) => (
                  <Row key={highlight.id} gap={theme.spacing.sm} align="flex-start">
                    <Txt variant="body" color={theme.colors.accent}>
                      •
                    </Txt>
                    <Txt variant="body" style={{ flex: 1 }}>
                      {highlight.text}
                    </Txt>
                  </Row>
                ))
            )}
          </View>
        </Section>

        {/* ----------------------------------------------------------- Summary */}
        <Section title="Summary">
          <View style={{ paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
            <Txt variant="caption" faint uppercase>
              Facts reported by the sources
            </Txt>
            {(incident.summary ?? 'No consolidated summary is available yet.')
              .split(/\n{2,}/)
              .map((paragraph, index) => (
                <Txt key={index} variant="body">
                  {paragraph.trim()}
                </Txt>
              ))}
          </View>
        </Section>

        {/* ---------------------------------------------------- Classification */}
        <Section title="Incident Details">
          <FieldRow name="Oil & Gas Sector" value={label(incident.oilGasSector)} />
          <FieldRow name="Environment" value={label(incident.environment)} />
          {incident.waterDepthCategory === null ? null : (
            <FieldRow name="Water Depth" value={label(incident.waterDepthCategory)} />
          )}
          <FieldRow name="Country" value={incident.country ?? 'Not reported'} />
          {location === '' ? null : <FieldRow name="Location" value={location} />}
          {incident.basin === null ? null : <FieldRow name="Basin" value={incident.basin} />}
          {incident.block === null ? null : <FieldRow name="Block" value={incident.block} />}
          <FieldRow name="Operator" value={incident.operator ?? 'Not reported'} emphasis />
          {incident.company === null ? null : <FieldRow name="Company" value={incident.company} />}
          {incident.drillingContractor === null ? null : (
            <FieldRow name="Drilling Contractor" value={incident.drillingContractor} />
          )}
          {incident.serviceCompany === null ? null : (
            <FieldRow name="Service Company" value={incident.serviceCompany} />
          )}
          {incident.pipelineOperator === null ? null : (
            <FieldRow name="Pipeline Operator" value={incident.pipelineOperator} />
          )}
          {incident.asset === null ? null : <FieldRow name="Asset" value={incident.asset} emphasis />}
          {incident.installation === null ? null : <FieldRow name="Installation" value={incident.installation} />}
          {incident.installationType === null ? null : (
            <FieldRow name="Installation Type" value={label(incident.installationType)} />
          )}
          {incident.vessel === null ? null : <FieldRow name="Vessel" value={incident.vessel} />}
          {incident.field === null ? null : <FieldRow name="Field" value={incident.field} />}
          {well === '' ? null : <FieldRow name="Well" value={well} />}
          {incident.wellType === null ? null : <FieldRow name="Well Type" value={label(incident.wellType)} />}
          {incident.wellStatus === null ? null : <FieldRow name="Well Status" value={label(incident.wellStatus)} />}
          <FieldRow name="Life-Cycle Stage" value={label(incident.lifecycleStage)} />
          <FieldRow name="Incident Type" value={label(incident.incidentType)} emphasis />
          {incident.secondaryIncidentTypes.length === 0 ? null : (
            <FieldRow
              name="Also Classified As"
              value={incident.secondaryIncidentTypes.map((type) => label(type)).join(', ')}
            />
          )}
        </Section>

        {/* -------------------------------------------------- Well integrity */}
        {incident.isWellIntegrityRelated === true ? (
          <Section title="Well Integrity">
            <FieldRow name="Well Integrity Related" value="Yes" emphasis />
            <FieldRow
              name="Category"
              value={incident.wellIntegrityCategory === null ? 'Not reported' : label(incident.wellIntegrityCategory)}
            />
            <FieldRow name="Suspected Failed Component" value={incident.suspectedFailedComponent ?? 'Not reported'} />
            <FieldRow
              name="Barrier Function Impacted"
              value={incident.barrierFunctionImpacted === null ? 'Not reported' : label(incident.barrierFunctionImpacted)}
            />
          </Section>
        ) : null}

        {/* --------------------------------------------------- Process safety */}
        {incident.isProcessSafetyEvent === true ? (
          <Section title="Process Safety">
            <FieldRow name="Process Safety Event" value="Yes" emphasis />
            <FieldRow
              name="Category"
              value={incident.processSafetyCategory === null ? 'Not reported' : label(incident.processSafetyCategory)}
            />
          </Section>
        ) : null}

        {/* ------------------------------------------------------ Consequences */}
        <Section title="Consequences">
          <FieldRow name="Fatalities" value={formatCount(incident.consequences.fatalities)} emphasis />
          <FieldRow name="Injuries" value={formatCount(incident.consequences.injuries)} />
          <FieldRow name="Missing" value={formatCount(incident.consequences.missingPersons)} />
          <FieldRow name="Evacuated" value={formatCount(incident.consequences.evacuatedPersons)} />
          <FieldRow name="Hydrocarbon Release" value={formatBoolean(incident.consequences.hydrocarbonRelease)} />
          <FieldRow name="Environmental Impact" value={incident.consequences.environmentalImpact ?? 'Not reported'} />
          <FieldRow name="Production Impact" value={incident.consequences.productionImpact ?? 'Not reported'} />
          {incident.consequences.assetDamage === null ? null : (
            <FieldRow name="Asset Damage" value={incident.consequences.assetDamage} />
          )}
        </Section>

        {/* -------------------------------------------------------- Assessment */}
        <Section title="System Assessment">
          <View style={{ paddingVertical: theme.spacing.md, gap: theme.spacing.md }}>
            <View style={{ gap: theme.spacing.xs }}>
              <Row justify="space-between">
                <Txt variant="smallStrong">Severity</Txt>
                <Txt variant="mono" color={theme.colors.severity[incident.severity]}>
                  {label(incident.severity)} · {incident.severityScore}/100
                </Txt>
              </Row>
              <ScoreBar
                value={incident.severityScore}
                color={theme.colors.severity[incident.severity]}
                caption={PRODUCT.severityCaveat}
              />
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <Row justify="space-between">
                <Txt variant="smallStrong">Confidence</Txt>
                <Txt variant="mono" color={theme.colors.confidence[incident.confidence]}>
                  {label(incident.confidence)} · {incident.confidenceScore}/100
                </Txt>
              </Row>
              <ScoreBar
                value={incident.confidenceScore}
                color={theme.colors.confidence[incident.confidence]}
                caption={
                  incident.hasOfficialSource
                    ? 'An official regulator or operator source is attached.'
                    : 'No official source attached yet.'
                }
              />
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <Row justify="space-between">
                <Txt variant="smallStrong">Relevance</Txt>
                <Txt variant="mono" muted>
                  {incident.relevanceScore}/100
                </Txt>
              </Row>
              <ScoreBar value={incident.relevanceScore} color={theme.colors.info} />
            </View>
          </View>
        </Section>

        {/* ------------------------------------------------------------ Sources */}
        <Section title={`Sources (${incident.articles.length})`}>
          {incident.articles
            .slice()
            .sort((a, b) => a.sourceTier - b.sourceTier)
            .map((article, index) => (
              <View key={article.id}>
                {index === 0 ? null : <Divider />}
                <View style={{ paddingVertical: theme.spacing.md, gap: theme.spacing.xs }}>
                  <Row justify="space-between" gap={theme.spacing.sm}>
                    <Txt variant="smallStrong" style={{ flex: 1 }}>
                      {article.publisher}
                    </Txt>
                    <TierBadge tier={article.sourceTier} />
                  </Row>
                  <Txt variant="body" numberOfLines={3}>
                    {article.title}
                  </Txt>
                  <Txt variant="caption" faint>
                    {formatDisplayDate(article.publishedAt)}
                    {article.author === null ? '' : ` · ${article.author}`}
                  </Txt>
                  <Row gap={theme.spacing.sm} style={{ marginTop: theme.spacing.xs }} wrap>
                    <Button
                      title="Open Original Source"
                      variant="secondary"
                      onPress={() => {
                        void openArticle(article.originalUrl).then((opened) => {
                          if (!opened) Alert.alert('Cannot open link', 'The source URL is not a valid web address.');
                        });
                      }}
                    />
                    <Button
                      title="Share link"
                      variant="ghost"
                      onPress={() => void shareOriginalLink(article.publisher, article.title, article.originalUrl)}
                    />
                    <Button
                      title="Copy link"
                      variant="ghost"
                      onPress={() => {
                        void copyToClipboard(article.originalUrl);
                        Alert.alert('Copied', 'The original article link was copied to the clipboard.');
                      }}
                    />
                  </Row>
                </View>
              </View>
            ))}
        </Section>

        {/* ------------------------------------------------------------ Actions */}
        <Section title="Report & Sharing">
          <View style={{ paddingVertical: theme.spacing.md, gap: theme.spacing.sm }}>
            <Button
              title="Export PDF"
              onPress={() => void handleExportPdf()}
              loading={busy === 'pdf'}
            />
            <Button
              title="Preview PDF"
              variant="secondary"
              onPress={() => void handlePreviewPdf()}
              loading={busy === 'preview'}
            />
            <Button
              title="Share incident summary"
              variant="secondary"
              onPress={() => void shareIncidentSummary(incident)}
            />
            <Button
              title="Copy incident link"
              variant="ghost"
              onPress={() => {
                void copyToClipboard(incidentDeepLink(incident.id));
                Alert.alert('Copied', 'A deep link to this incident was copied to the clipboard.');
              }}
            />
          </View>
        </Section>

        <Section title="Tracking">
          <View style={{ paddingVertical: theme.spacing.md, gap: theme.spacing.sm }}>
            <Button
              title={saved ? 'Remove from Saved' : 'Save Incident'}
              variant={saved ? 'secondary' : 'primary'}
              onPress={() => changeState(saved ? 'read' : 'saved')}
            />
            <Button
              title={incident.userState === 'monitoring' ? 'Stop monitoring' : 'Monitor this incident'}
              variant="secondary"
              onPress={() => changeState(incident.userState === 'monitoring' ? 'read' : 'monitoring')}
            />
            <Button
              title={archived ? 'Unarchive' : 'Archive'}
              variant="ghost"
              onPress={() => changeState(archived ? 'read' : 'archived')}
            />
          </View>
        </Section>

        <View style={{ marginTop: theme.spacing.xl }}>
          <InfoNote>{PRODUCT.disclaimer}</InfoNote>
        </View>
      </ScrollView>
    </Screen>
  );
}

export type { IncidentDetail };
