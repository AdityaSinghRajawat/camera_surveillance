import type { Alert } from '../types';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface AlertFeedProps {
  alerts: Alert[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function AlertFeed({ alerts, isLoading, isError, error }: AlertFeedProps) {
  return (
    <div className="alert-feed">
      <div className="alert-feed-header">Recent detections</div>
      {isLoading && <div className="alert-feed-empty">Loading alerts…</div>}
      {isError && (
        <div className="alert-feed-error">
          {error?.message ?? 'Failed to load alerts'}
        </div>
      )}
      {!isLoading && !isError && alerts.length === 0 && (
        <div className="alert-feed-empty">No detections yet</div>
      )}
      {!isLoading && !isError && alerts.length > 0 && (
        <ul className="alert-list">
          {alerts.map((alert) => (
            <li key={alert.id} className="alert-item">
              <span className="alert-icon" aria-hidden>
                ●
              </span>
              <span className="alert-main">
                <span className="alert-label">
                  {alert.detectionCount}{' '}
                  {alert.detectionCount === 1 ? 'person' : 'people'}
                </span>
                <span className="alert-meta">
                  {(alert.confidence * 100).toFixed(0)}% confidence
                </span>
              </span>
              <span className="alert-time">{formatTime(alert.frameTimestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
