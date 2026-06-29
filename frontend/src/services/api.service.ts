// Typed REST client. Wraps fetch, injects the bearer token, unwraps `{ data }`
// envelopes, and throws a typed ApiError. On 401 it triggers a global handler so
// the auth layer can log the user out and redirect.

import type {
  Alert,
  ApiErrorBody,
  ApiListResponse,
  ApiSingleResponse,
  AuthResult,
  Camera,
  CameraCreateInput,
  CameraUpdateInput,
  Pagination,
  SdpAnswer,
  SdpOffer,
  User,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Token + unauthorized handling are module-level so non-React code can use them.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // Skip attaching the Authorization header (used for /auth/login & /auth/signup).
  skipAuth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, skipAuth = false, signal } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!skipAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed. Is the backend running?');
  }

  if (response.status === 401) {
    if (onUnauthorized) onUnauthorized();
    const errBody = await safeJson<ApiErrorBody>(response);
    throw new ApiError(
      401,
      errBody?.error?.code ?? 'UNAUTHORIZED',
      errBody?.error?.message ?? 'Your session has expired. Please log in again.',
      errBody?.error?.details,
    );
  }

  if (!response.ok) {
    const errBody = await safeJson<ApiErrorBody>(response);
    throw new ApiError(
      response.status,
      errBody?.error?.code ?? 'HTTP_ERROR',
      errBody?.error?.message ?? `Request failed with status ${response.status}`,
      errBody?.error?.details,
    );
  }

  // 204 No Content.
  if (response.status === 204) {
    return undefined as T;
  }

  const json = await safeJson<T>(response);
  if (json === null) {
    return undefined as T;
  }
  return json;
}

async function safeJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authApi = {
  async login(username: string, password: string): Promise<AuthResult> {
    const res = await request<ApiSingleResponse<AuthResult>>('/auth/login', {
      method: 'POST',
      body: { username, password },
      skipAuth: true,
    });
    return res.data;
  },

  async signup(username: string, password: string): Promise<AuthResult> {
    const res = await request<ApiSingleResponse<AuthResult>>('/auth/signup', {
      method: 'POST',
      body: { username, password },
      skipAuth: true,
    });
    return res.data;
  },

  async me(): Promise<User> {
    const res = await request<ApiSingleResponse<{ user: User }>>('/auth/me');
    return res.data.user;
  },
};

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------
export const cameraApi = {
  async list(): Promise<Camera[]> {
    const res = await request<{ data: Camera[] }>('/cameras');
    return res.data;
  },

  async get(id: string): Promise<Camera> {
    const res = await request<ApiSingleResponse<Camera>>(`/cameras/${id}`);
    return res.data;
  },

  async create(input: CameraCreateInput): Promise<Camera> {
    const res = await request<ApiSingleResponse<Camera>>('/cameras', {
      method: 'POST',
      body: input,
    });
    return res.data;
  },

  async update(id: string, input: CameraUpdateInput): Promise<Camera> {
    const res = await request<ApiSingleResponse<Camera>>(`/cameras/${id}`, {
      method: 'PATCH',
      body: input,
    });
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/cameras/${id}`, { method: 'DELETE' });
  },

  async start(id: string): Promise<Camera> {
    const res = await request<ApiSingleResponse<Camera>>(`/cameras/${id}/start`, {
      method: 'POST',
    });
    return res.data;
  },

  async stop(id: string): Promise<Camera> {
    const res = await request<ApiSingleResponse<Camera>>(`/cameras/${id}/stop`, {
      method: 'POST',
    });
    return res.data;
  },

  async streamOffer(id: string, offer: SdpOffer): Promise<SdpAnswer> {
    const res = await request<ApiSingleResponse<SdpAnswer>>(`/cameras/${id}/stream/offer`, {
      method: 'POST',
      body: offer,
    });
    return res.data;
  },
};

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export interface AlertQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}

export interface AlertsPage {
  data: Alert[];
  pagination: Pagination;
}

export const alertApi = {
  async listForCamera(cameraId: string, query: AlertQuery = {}): Promise<AlertsPage> {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const qs = params.toString();
    const res = await request<ApiListResponse<Alert>>(
      `/cameras/${cameraId}/alerts${qs ? `?${qs}` : ''}`,
    );
    return { data: res.data, pagination: res.pagination };
  },
};
