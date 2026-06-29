// Compact management list of cameras with edit/delete actions. Rendered in a
// side panel; the live tiles live in the dashboard grid.

import type { Camera } from '../types';
import { StatusBadge } from './StatusBadge';

interface CameraListProps {
  cameras: Camera[];
  onEdit: (camera: Camera) => void;
  onDelete: (camera: Camera) => void;
  deletingId: string | null;
}

export function CameraList({ cameras, onEdit, onDelete, deletingId }: CameraListProps) {
  if (cameras.length === 0) {
    return <p className="muted">No cameras yet. Add one to get started.</p>;
  }

  return (
    <ul className="camera-list">
      {cameras.map((camera) => (
        <li key={camera.id} className="camera-list-item">
          <div className="camera-list-info">
            <div className="camera-list-name">{camera.name}</div>
            <div className="camera-list-sub">
              {camera.location || 'No location'} · <StatusBadge state={camera.status} />
            </div>
          </div>
          <div className="camera-list-actions">
            <button
              type="button"
              className="btn btn-small btn-secondary"
              onClick={() => onEdit(camera)}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => onDelete(camera)}
              disabled={deletingId === camera.id}
            >
              {deletingId === camera.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
