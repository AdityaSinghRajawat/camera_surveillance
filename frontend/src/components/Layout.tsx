// App shell: top bar with brand, live WS connection indicator, current user and
// logout. Renders children below.

import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useWebSocketStatus } from '../hooks/useWebSocket';

const WS_LABEL: Record<string, string> = {
  idle: 'Offline',
  connecting: 'Connecting',
  open: 'Realtime',
  closed: 'Disconnected',
};

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const wsStatus = useWebSocketStatus();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◉</span>
          <span className="brand-name">Skylark VMS</span>
        </div>
        <div className="topbar-right">
          <span className={`ws-indicator ws-${wsStatus}`} title="Realtime connection">
            <span className="badge-dot" />
            {WS_LABEL[wsStatus] ?? wsStatus}
          </span>
          {user && <span className="topbar-user">{user.username}</span>}
          <button type="button" className="btn btn-small btn-secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
