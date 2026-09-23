/**
 * Storage key for active configuration persistence in jenkins control page.
 */
export const ACTIVE_CONFIG_STORAGE_KEY = 'jenkins_control_active_config';

export interface ResolveActiveConfigNameOptions {
  availableConfigs: string[];
  queryCandidate?: string | null;
  storedCandidate?: string | null;
}

/**
 * Pure resolver determining which configuration filename should be active.
 *
 * Precedence:
 * 1. Valid URL query candidate present in availableConfigs
 * 2. Valid stored candidate present in availableConfigs
 * 3. First available configuration if availableConfigs is non-empty
 * 4. Empty string if no configurations available
 */
export function resolveActiveConfigName({
  availableConfigs,
  queryCandidate,
  storedCandidate,
}: ResolveActiveConfigNameOptions): string {
  if (!availableConfigs || availableConfigs.length === 0) {
    return '';
  }

  const trimmedQuery = typeof queryCandidate === 'string' ? queryCandidate.trim() : '';
  if (trimmedQuery && availableConfigs.includes(trimmedQuery)) {
    return trimmedQuery;
  }

  const trimmedStored = typeof storedCandidate === 'string' ? storedCandidate.trim() : '';
  if (trimmedStored && availableConfigs.includes(trimmedStored)) {
    return trimmedStored;
  }

  return availableConfigs[0] ?? '';
}

/**
 * Safely reads the persisted active configuration filename from localStorage.
 * Returns null if window/localStorage is unavailable or if access throws.
 */
export function readStoredActiveConfig(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
    }
  } catch {
    // Storage access may be blocked by permissions or security settings
  }
  return null;
}

/**
 * Safely writes the persisted active configuration filename to localStorage.
 * Fails silently if window/localStorage is unavailable or if access throws.
 */
export function writeStoredActiveConfig(name: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACTIVE_CONFIG_STORAGE_KEY, name);
    }
  } catch {
    // Storage access may be blocked
  }
}

/**
 * Safely removes the persisted active configuration filename from localStorage.
 */
export function clearStoredActiveConfig(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(ACTIVE_CONFIG_STORAGE_KEY);
    }
  } catch {
    // Storage access may be blocked
  }
}

/**
 * Safely reads the active configuration candidate from URL query parameter `config`.
 * Returns null if window/location is unavailable or if access throws.
 */
export function readUrlActiveConfig(): string | null {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const params = new URLSearchParams(window.location.search);
      return params.get('config');
    }
  } catch {
    // URL access may fail in non-browser or sandbox environments
  }
  return null;
}

/**
 * Safely synchronizes the active configuration filename to the URL query parameter `config`
 * using history.replaceState, preserving the current pathname, unrelated query parameters, and hash.
 * If name is null or empty, removes the `config` parameter.
 */
export function syncUrlActiveConfig(name: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.location && window.history) {
      const url = new URL(window.location.href);
      if (name && name.trim()) {
        url.searchParams.set('config', name.trim());
      } else {
        url.searchParams.delete('config');
      }
      const newUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', newUrl);
    }
  } catch {
    // history.replaceState may be restricted
  }
}
