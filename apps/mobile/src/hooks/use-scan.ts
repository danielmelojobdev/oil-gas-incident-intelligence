/** Drives Scan Now: start, poll, and refresh the feed when it finishes. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScanRun } from '@ogii/domain';
import { getRepository } from '../data';
import { useRefreshAfterScan } from './queries';

export interface ScanController {
  readonly visible: boolean;
  readonly run: ScanRun | null;
  readonly error: string | null;
  readonly isStarting: boolean;
  start: () => Promise<void>;
  dismiss: () => void;
}

const POLL_MS = 800;

export function useScanController(): ScanController {
  const [visible, setVisible] = useState(false);
  const [run, setRun] = useState<ScanRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshAfterScan = useRefreshAfterScan();

  const stopPolling = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(async () => {
    setError(null);
    setRun(null);
    setVisible(true);
    setIsStarting(true);

    try {
      const started = await getRepository().startScan();
      setIsStarting(false);

      stopPolling();
      timer.current = setInterval(() => {
        void (async () => {
          try {
            const latest = await getRepository().getScanRun(started.scanId);
            if (latest === null) return;
            setRun(latest);
            if (latest.status !== 'running' && latest.status !== 'queued') {
              stopPolling();
              refreshAfterScan();
            }
          } catch (pollError) {
            stopPolling();
            setError(pollError instanceof Error ? pollError.message : 'Could not read the scan status.');
          }
        })();
      }, POLL_MS);
    } catch (startError) {
      setIsStarting(false);
      setError(
        startError instanceof Error
          ? startError.message
          : 'Could not start a scan. Check that the backend is reachable.',
      );
    }
  }, [refreshAfterScan, stopPolling]);

  const dismiss = useCallback(() => {
    setVisible(false);
    stopPolling();
    refreshAfterScan();
  }, [refreshAfterScan, stopPolling]);

  return { visible, run, error, isStarting, start, dismiss };
}
