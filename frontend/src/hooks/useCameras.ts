// React Query hooks for camera CRUD + start/stop, with cache invalidation.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { cameraApi } from '../services/api.service';
import type { Camera, CameraCreateInput, CameraUpdateInput } from '../types';

export const camerasQueryKey = ['cameras'] as const;

export function useCameras(): UseQueryResult<Camera[], Error> {
  return useQuery({
    queryKey: camerasQueryKey,
    queryFn: () => cameraApi.list(),
    staleTime: 10_000,
  });
}

export function useCameraMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: camerasQueryKey });
  };

  // Optimistically patch a single camera in the cached list (used by start/stop
  // and by live camera_state WS updates surfaced elsewhere).
  const patchCameraInCache = (id: string, patch: Partial<Camera>) => {
    queryClient.setQueryData<Camera[]>(camerasQueryKey, (prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, ...patch } : c)) : prev,
    );
  };

  const createCamera = useMutation({
    mutationFn: (input: CameraCreateInput) => cameraApi.create(input),
    onSuccess: invalidate,
  });

  const updateCamera = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CameraUpdateInput }) =>
      cameraApi.update(id, input),
    onSuccess: invalidate,
  });

  const deleteCamera = useMutation({
    mutationFn: (id: string) => cameraApi.remove(id),
    onSuccess: invalidate,
  });

  const startCamera = useMutation({
    mutationFn: (id: string) => cameraApi.start(id),
    onSuccess: (camera) => patchCameraInCache(camera.id, camera),
  });

  const stopCamera = useMutation({
    mutationFn: (id: string) => cameraApi.stop(id),
    onSuccess: (camera) => patchCameraInCache(camera.id, camera),
  });

  return {
    createCamera,
    updateCamera,
    deleteCamera,
    startCamera,
    stopCamera,
    patchCameraInCache,
  };
}
