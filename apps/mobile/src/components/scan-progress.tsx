/**
 * Scan Now progress and result summary (brief sections 14 and 55).
 *
 * The work happens on the backend; this component only reflects the run's reported
 * stage and, at the end, the numbers from the run record.
 */
import { Modal, View } from 'react-native';
import type { ScanRun } from '@ogii/domain';
import { useTheme } from '../theme';
import { Button, Card, Divider, Row, Txt } from './primitives';

const STAGES = [
  'Scanning...',
  'Searching sources...',
  'Analysing articles...',
  'Removing duplicates...',
  'Grouping incidents...',
  'Generating intelligence...',
  'Complete.',
] as const;

function SummaryRow({ value, label }: { value: number; label: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Row justify="space-between" style={{ paddingVertical: 5 }}>
      <Txt variant="small" muted>
        {label}
      </Txt>
      <Txt variant="mono" color={theme.colors.text}>
        {value}
      </Txt>
    </Row>
  );
}

export function ScanProgressSheet({
  visible,
  run,
  onClose,
  error,
}: {
  visible: boolean;
  run: ScanRun | null;
  onClose: () => void;
  error: string | null;
}): React.JSX.Element {
  const theme = useTheme();
  const stage = run?.stage ?? STAGES[0];
  const complete = run?.status === 'completed' || run?.status === 'partial' || run?.status === 'failed';
  const progress = Math.round((run?.progress ?? 0) * 100);
  const currentIndex = STAGES.indexOf(stage as (typeof STAGES)[number]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: 'flex-end',
        }}
      >
        <Card style={{ margin: theme.spacing.md, padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <Row justify="space-between">
            <Txt variant="heading">{complete ? 'Scan complete' : 'Scanning'}</Txt>
            <Txt variant="mono" muted>
              {progress}%
            </Txt>
          </Row>

          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.surfaceSunken,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.max(3, progress)}%`,
                height: '100%',
                backgroundColor: complete ? theme.colors.success : theme.colors.accent,
              }}
            />
          </View>

          {error !== null ? (
            <Txt variant="small" color={theme.colors.danger}>
              {error}
            </Txt>
          ) : (
            <View style={{ gap: 3 }}>
              {STAGES.map((item, index) => {
                const done = currentIndex > index || complete;
                const active = currentIndex === index && !complete;
                return (
                  <Row key={item} gap={theme.spacing.sm}>
                    <Txt
                      variant="small"
                      color={done ? theme.colors.success : active ? theme.colors.accent : theme.colors.textFaint}
                    >
                      {done ? '✓' : active ? '›' : '·'}
                    </Txt>
                    <Txt
                      variant="small"
                      color={active ? theme.colors.text : undefined}
                      muted={!active}
                      faint={!done && !active}
                    >
                      {item}
                    </Txt>
                  </Row>
                );
              })}
            </View>
          )}

          {complete && run !== null ? (
            <>
              <Divider />
              <View>
                <SummaryRow value={run.providerCount} label="sources searched" />
                <SummaryRow value={run.articlesProcessed} label="articles analysed" />
                <SummaryRow value={run.newIncidents + run.updatedIncidents} label="potential incidents" />
                <SummaryRow value={run.resultsRejected} label="rejected" />
                <SummaryRow value={run.duplicatesFound} label="duplicates" />
                <SummaryRow value={run.newIncidents} label="new incidents" />
                <SummaryRow value={run.updatedIncidents} label="updated incidents" />
                <SummaryRow value={run.notificationsSent} label="notifications sent" />
              </View>
              {run.errors.length > 0 ? (
                <Txt variant="caption" color={theme.colors.warning}>
                  {run.errors.length} provider warning{run.errors.length === 1 ? '' : 's'} — see Settings › Scanner.
                </Txt>
              ) : null}
            </>
          ) : null}

          <Button title={complete ? 'Done' : 'Run in background'} onPress={onClose} variant={complete ? 'primary' : 'secondary'} />
        </Card>
      </View>
    </Modal>
  );
}
