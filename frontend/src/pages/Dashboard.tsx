// Dashboard: management panel (camera CRUD) + responsive grid of live tiles.
// Registers all owned camera ids with the shared WebSocket so realtime alerts/
// stats/state flow in without manual refresh.

import { useMemo, useState } from 'react';
import { Layout } from '../components/Layout';
import { CameraTile } from '../components/CameraTile';
import { CameraList } from '../components/CameraList';
import { CameraFormModal } from '../components/CameraFormModal';
import { useCameras, useCameraMutations } from '../hooks/useCameras';
import { useRegisterCameras } from '../hooks/useWebSocket';
import { ApiError } from '../services/api.service';
import type { Camera, CameraCreateInput, CameraUpdateInput } from '../types';

export function Dashboard() {
  const { data: cameras, isLoading, isError, error, refetch } = useCameras();
  const { createCamera, updateCamera, deleteCamera } = useCameraMutations();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const cameraList = useMemo(() => cameras ?? [], [cameras]);
  const cameraIds = useMemo(() => cameraList.map((c) => c.id), [cameraList]);

  // Keep the WS subscription in sync with the cameras we own.
  useRegisterCameras(cameraIds);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (camera: Camera) => {
    setEditing(camera);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (createCamera.isPending || updateCamera.isPending) return;
    setModalOpen(false);
  };

  const handleSubmit = (input: CameraCreateInput | CameraUpdateInput) => {
    setFormError(null);
    const onError = (err: unknown) =>
      setFormError(err instanceof ApiError ? err.message : 'Failed to save camera');

    if (editing) {
      updateCamera.mutate(
        { id: editing.id, input },
        {
          onSuccess: () => setModalOpen(false),
          onError,
        },
      );
    } else {
      createCamera.mutate(input as CameraCreateInput, {
        onSuccess: () => setModalOpen(false),
        onError,
      });
    }
  };

  const handleDelete = (camera: Camera) => {
    const confirmed = window.confirm(`Delete camera "${camera.name}"? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(camera.id);
    deleteCamera.mutate(camera.id, {
      onSettled: () => setDeletingId(null),
      onError: (err) =>
        window.alert(err instanceof ApiError ? err.message : 'Failed to delete camera'),
    });
  };

  return (
    <Layout>
      <div className="dashboard">
        <section className="manage-panel">
          <div className="manage-header">
            <h2>Cameras</h2>
            <button type="button" className="btn btn-primary btn-small" onClick={openCreate}>
              + Add camera
            </button>
          </div>
          {isLoading && <p className="muted">Loading cameras…</p>}
          {isError && (
            <div className="panel-error">
              <p>{(error as Error)?.message ?? 'Failed to load cameras'}</p>
              <button type="button" className="btn btn-small btn-secondary" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          )}
          {!isLoading && !isError && (
            <CameraList
              cameras={cameraList}
              onEdit={openEdit}
              onDelete={handleDelete}
              deletingId={deletingId}
            />
          )}
        </section>

        <section className="grid-panel">
          {!isLoading && !isError && cameraList.length === 0 && (
            <div className="empty-grid">
              <p>No cameras to display.</p>
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                Add your first camera
              </button>
            </div>
          )}
          <div className="camera-grid">
            {cameraList.map((camera) => (
              <CameraTile key={camera.id} camera={camera} />
            ))}
          </div>
        </section>
      </div>

      <CameraFormModal
        camera={editing}
        isOpen={modalOpen}
        isSubmitting={createCamera.isPending || updateCamera.isPending}
        errorMessage={formError}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />
    </Layout>
  );
}
