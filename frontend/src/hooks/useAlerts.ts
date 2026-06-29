// Per-camera alerts: initial page fetched via React Query, then live `alert` WS
// messages are prepended. Returns a merged, de-duplicated, recency-ordered list.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { alertApi } from '../services/api.service';
import type { Alert } from '../types';
import { useWebSocketEvent } from './useWebSocket';

const MAX_ALERTS = 20;

export function useAlerts(cameraId: string) {
  const query = useQuery({
    queryKey: ['alerts', cameraId],
    queryFn: () => alertApi.listForCamera(cameraId, { pageSize: 10 }),
    staleTime: 30_000,
  });

  // Live alerts received over the WS since mount.
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);

  useWebSocketEvent('alert', (msg) => {
    if (msg.cameraId !== cameraId) return;
    setLiveAlerts((prev) => {
      if (prev.some((a) => a.id === msg.data.id)) return prev;
      return [msg.data, ...prev].slice(0, MAX_ALERTS);
    });
  });

  const alerts = useMemo<Alert[]>(() => {
    const fetched = query.data?.data ?? [];
    const seen = new Set<string>();
    const merged: Alert[] = [];
    for (const a of [...liveAlerts, ...fetched]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      merged.push(a);
    }
    merged.sort(
      (a, b) =>
        new Date(b.frameTimestamp).getTime() - new Date(a.frameTimestamp).getTime(),
    );
    return merged.slice(0, MAX_ALERTS);
  }, [query.data, liveAlerts]);

  return {
    alerts,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
