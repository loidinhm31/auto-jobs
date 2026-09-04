import { useCallback, useMemo, useState } from 'react';
import type { ApiErrorResponse } from '../types/index.js';

export class ControlApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ControlApiError';
    this.status = status;
    if (code !== undefined) {
      this.code = code;
    }
  }
}

/**
 * Extracts CSRF token from the DOM document head meta tag.
 */
export function getCsrfTokenFromDom(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="csrf-token"]');
  const content = meta?.getAttribute('content') ?? '';
  return content && content !== '__CSRF_TOKEN_PLACEHOLDER__' ? content : '';
}

function isSameOriginOrRelative(url: string): boolean {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin;
    }
  } catch {
    return false;
  }
  return false;
}

export interface UseControlApiResult {
  csrfToken: string;
  setCsrfToken: React.Dispatch<React.SetStateAction<string>>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  requestJson: <T>(url: string, options?: RequestInit) => Promise<{ data: T; response: Response }>;
}

/**
 * Low-level API hook providing authenticated fetch wrapper with automatic
 * CSRF token injection and typed JSON response and error handling.
 */
export function useControlApi(): UseControlApiResult {
  const [csrfToken, setCsrfToken] = useState<string>(() => getCsrfTokenFromDom());

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const method = (options.method ?? 'GET').toUpperCase();
      const headers = new Headers(options.headers || {});

      // Auto-attach CSRF token for mutating HTTP requests on same-origin/relative endpoints
      if (
        (method === 'POST' || method === 'PUT' || method === 'DELETE') &&
        isSameOriginOrRelative(url)
      ) {
        const token = csrfToken || getCsrfTokenFromDom();
        if (token.length > 0 && !headers.has('x-csrf-token')) {
          headers.set('x-csrf-token', token);
        }
      }

      return fetch(url, { ...options, headers });
    },
    [csrfToken],
  );

  const requestJson = useCallback(
    async <T>(url: string, options: RequestInit = {}): Promise<{ data: T; response: Response }> => {
      const resp = await apiFetch(url, options);
      if (!resp.ok) {
        let errMessage = `HTTP ${resp.status}`;
        let errCode: string | undefined;
        try {
          const errBody = (await resp.json()) as ApiErrorResponse;
          if (errBody?.error?.message) {
            errMessage = errBody.error.message;
            errCode = errBody.error.code;
          } else if (errBody?.message) {
            errMessage = errBody.message;
          }
        } catch {
          // If JSON parse fails, fallback to status text or generic message
          if (resp.statusText) {
            errMessage = resp.statusText;
          }
        }
        throw new ControlApiError(errMessage, resp.status, errCode);
      }
      const data = (await resp.json()) as T;
      return { data, response: resp };
    },
    [apiFetch],
  );

  return useMemo(
    () => ({
      csrfToken,
      setCsrfToken,
      apiFetch,
      requestJson,
    }),
    [csrfToken, apiFetch, requestJson],
  );
}
