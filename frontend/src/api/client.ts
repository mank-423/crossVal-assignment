import type { ApiErrorCode, ApiErrorResponse } from '@orders/shared';

/**
 * In development, Vite proxies /api to the API process, so the browser sees one origin and
 * there is no CORS preflight. In a deployed build VITE_API_URL points at the API directly.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

const TOKEN_STORAGE_KEY = 'orders.accessToken';

/**
 * A failed request, carrying the server's own explanation.
 *
 * `hint` and `fieldErrors` are passed through untouched and rendered verbatim: the API knows
 * why it refused — including the exact maximum payment allowed — and paraphrasing that into
 * "Something went wrong" throws away the only part the user can act on.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'NETWORK_ERROR';
  readonly hint?: string;
  readonly details?: Record<string, unknown>;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(params: {
    status: number;
    code: ApiErrorCode | 'NETWORK_ERROR';
    message: string;
    hint?: string;
    details?: Record<string, unknown>;
    fieldErrors?: Record<string, string[]>;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.hint = params.hint;
    this.details = params.details;
    this.fieldErrors = params.fieldErrors;
  }

  /** Message plus hint, for a single-line banner. */
  get fullMessage(): string {
    return this.hint ? `${this.message} ${this.hint}` : this.message;
  }
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private browsing modes can throw on storage access. Falling back to an in-memory
    // session is better than a blank page.
    return null;
  }
}

export function storeToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* Storage unavailable — the token stays in memory for this tab only. */
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sent as Idempotency-Key. Used for payments so a retry cannot charge twice. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, signal } = options;

  const headers: Record<string, string> = {};
  const token = getStoredToken();

  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;

    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server.',
      hint: 'Check your connection and try again.',
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload as ApiErrorResponse | null;

    throw new ApiError({
      status: response.status,
      code: error?.code ?? 'INTERNAL_ERROR',
      message: error?.message ?? `Request failed with status ${response.status}.`,
      hint: error?.hint,
      details: error?.details,
      fieldErrors: error?.fieldErrors,
    });
  }

  return payload as T;
}
