import type { CameraState } from '../types';

const LABELS: Record<CameraState, string> = {
  stopped: 'Stopped',
  connecting: 'Connecting',
  live: 'Live',
  error: 'Error',
};

export function StatusBadge({ state }: { state: CameraState }) {
  return (
    <span className={`status-badge status-${state}`}>
      {state === 'connecting' && <span className="badge-dot pulsing" />}
      {state === 'live' && <span className="badge-dot live-dot" />}
      {LABELS[state]}
    </span>
  );
}
