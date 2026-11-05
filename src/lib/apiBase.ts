/* ============================================================================
 * LOCAL & SAME-ORIGIN BACKEND URL RESOLVER
 * Allows the React SPA (or Electron desktop renderer) to talk either to the
 * built-in same-origin server ("") or to a custom local backend endpoint
 * configured via VITE_API_BASE_URL or local settings (e.g. http://127.0.0.1:3000).
 * ========================================================================== */

const LOCAL_BACKEND_ORIGIN_STORAGE_KEY = "study_os_local_backend_origin_v1";

export function normalizeBackendOrigin(raw?: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

export function getConfiguredBackendOrigin(): string {
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(LOCAL_BACKEND_ORIGIN_STORAGE_KEY);
      const normalizedSaved = normalizeBackendOrigin(saved);
      if (normalizedSaved) return normalizedSaved;
    } catch {
      // Ignore storage access errors in restricted iframes
    }
  }
  const envBase =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env.VITE_API_BASE_URL as string | undefined)
      : undefined;
  return normalizeBackendOrigin(envBase);
}

export function setConfiguredBackendOrigin(origin: string): string {
  const normalized = normalizeBackendOrigin(origin);
  if (typeof window !== "undefined") {
    try {
      if (normalized) {
        window.localStorage.setItem(LOCAL_BACKEND_ORIGIN_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(LOCAL_BACKEND_ORIGIN_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }
  return normalized;
}

export function resolveApiUrl(pathName: string): string {
  if (/^https?:\/\//i.test(pathName)) return pathName;
  const cleanPath = pathName.startsWith("/") ? pathName : `/${pathName}`;
  const origin = getConfiguredBackendOrigin();
  return origin ? `${origin}${cleanPath}` : cleanPath;
}
