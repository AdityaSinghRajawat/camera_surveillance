import type { Stats } from '../types';

export function StatsBadge({ stats }: { stats: Stats | null }) {
  return (
    <div className="stats-badge" title="Live stream stats">
      <span className="stat-item">
        <span className="stat-label">FPS</span>
        <span className="stat-value">{stats ? stats.fps.toFixed(1) : '—'}</span>
      </span>
      <span className="stat-item">
        <span className="stat-label">Det/min</span>
        <span className="stat-value">
          {stats ? stats.detectionsPerMinute : '—'}
        </span>
      </span>
    </div>
  );
}
