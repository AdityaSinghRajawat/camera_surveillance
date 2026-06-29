// Modal for creating/editing a camera. Controlled form; on submit calls the
// provided onSubmit (a React Query mutation wrapper) and surfaces errors.

import { useEffect, useState, type FormEvent } from 'react';
import type { Camera, CameraCreateInput, CameraUpdateInput } from '../types';

interface CameraFormModalProps {
  // When editing, the camera being edited; null for create.
  camera: Camera | null;
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (input: CameraCreateInput | CameraUpdateInput) => void;
}

export function CameraFormModal({
  camera,
  isOpen,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: CameraFormModalProps) {
  const [name, setName] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [location, setLocation] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Reset form whenever the modal opens or the target camera changes.
  useEffect(() => {
    if (isOpen) {
      setName(camera?.name ?? '');
      setRtspUrl(camera?.rtspUrl ?? '');
      setLocation(camera?.location ?? '');
      setEnabled(camera?.enabled ?? true);
    }
  }, [isOpen, camera]);

  if (!isOpen) return null;

  const isEdit = camera !== null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = rtspUrl.trim();
    if (!trimmedName || !trimmedUrl) return;
    const payload: CameraCreateInput | CameraUpdateInput = {
      name: trimmedName,
      rtspUrl: trimmedUrl,
      location: location.trim() || undefined,
      enabled,
    };
    onSubmit(payload);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit camera' : 'Add camera'}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{isEdit ? 'Edit camera' : 'Add camera'}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Front Door"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">RTSP URL</span>
            <input
              className="input"
              type="text"
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              placeholder="rtsp://user:pass@host:554/stream"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Location</span>
            <input
              className="input"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Lobby"
            />
          </label>

          <label className="field field-inline">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="field-label">Enabled</span>
          </label>

          {errorMessage && <div className="form-error">{errorMessage}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create camera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
