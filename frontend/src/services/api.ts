/**
 * api.ts — base API client for Vyne.
 *
 * Requests route through the Vite proxy in local development,
 * and use frontend-controlled runtime settings for non-secret config.
 */

import { frontendSettings } from '@/lib/settings'

const BASE_URL = frontendSettings.apiBaseUrl

// ─── Auth token helpers (reads from Zustand store via getter) ─────────────────

let _getToken: (() => string | null) | null = null

/** Call once at app startup to wire up the token getter from auth store */
export function configureApiToken(getter: () => string | null) {
  _getToken = getter
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

interface RequestOptions extends RequestInit {
  skipAuth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth = false, ...init } = options

  const headers: Record<string, string> = {
    // Only set Content-Type when there is a body — GET/DELETE requests have none.
    // Some strict proxies/WAFs reject bodyless requests with Content-Type set.
    ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string>),
  }

  if (!skipAuth && _getToken) {
    const token = _getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    
    // Only collapse 401s for the passive session probe; login requests should
    // surface the backend's real message to the UI.
    if (res.status === 401 && skipAuth && path === '/auth/session') {
      throw new Error('Unauthenticated')
    }
    
    throw new Error(body?.detail ?? `API error ${res.status}`)
  }

  if (res.status === 204) {
    return undefined as T
  }

  const body = await res.text()
  return (body ? JSON.parse(body) : undefined) as T
}

// ─── Typed methods ────────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'GET', ...options }),

  post: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), ...options }),

  patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body), ...options }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'DELETE', ...options }),
}
