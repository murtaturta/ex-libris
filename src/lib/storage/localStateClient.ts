import type {
  UserLocalState,
  EnrichmentCacheMap,
  LibraryBundle,
} from '../../types/library';

/**
 * Storage keys used for localStorage persistence and offline mirroring.
 */
const STORAGE_KEY_USER_STATE = 'exlibris_user_state_v02';
const STORAGE_KEY_ENRICHMENT_CACHE = 'exlibris_enrichment_cache_v02';
const STORAGE_KEY_LIBRARY_BUNDLE = 'exlibris_library_bundle_v02';

/**
 * Default empty UserLocalState representing a fresh user profile.
 */
export const DEFAULT_USER_STATE: UserLocalState = {
  version: '0.2.0',
  updatedAt: new Date(0).toISOString(),
  showCovers: false,
  bookOverrides: {},
  kindleClippings: [],
  externalWantList: [],
};

/**
 * Storage health status interface for local quota monitoring.
 */
export interface StorageHealthStatus {
  available: boolean;
  usedBytes: number;
  quotaWarning: boolean;
  lastError: string | null;
}

let lastStorageError: string | null = null;

/**
 * Measures approximate byte usage of exlibris_* keys in localStorage and checks quota health.
 */
export function getStorageHealth(): StorageHealthStatus {
  let usedBytes = 0;
  let available = false;
  try {
    const ls = (typeof window !== 'undefined' && window.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (ls) {
      available = true;
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (key && key.startsWith('exlibris_')) {
          const val = ls.getItem(key);
          if (val) {
            usedBytes += (key.length + val.length) * 2; // UTF-16 approximate bytes
          }
        }
      }
    }
  } catch (err: any) {
    available = false;
    lastStorageError = err?.message || String(err);
  }

  // Quota warning if usage exceeds 3.8 MB (typical localStorage quota is ~5 MB)
  const quotaWarning = usedBytes > 3800000;

  return {
    available,
    usedBytes,
    quotaWarning,
    lastError: lastStorageError,
  };
}

/**
 * Safe localStorage reader that works in browser and Node/testing environments.
 */
function getStorageItem(key: string): string | null {
  try {
    const ls = (typeof window !== 'undefined' && window.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (ls) {
      return ls.getItem(key);
    }
  } catch (err: any) {
    lastStorageError = err?.message || String(err);
  }
  return null;
}

/**
 * Safe localStorage writer that handles QuotaExceededError by evicting oversized redundant bundles.
 */
function setStorageItem(key: string, value: string): void {
  lastStorageError = null;
  const getLs = () => (typeof window !== 'undefined' && window.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
  const ls = getLs();
  if (!ls) return;

  try {
    ls.setItem(key, value);
  } catch (err: any) {
    lastStorageError = err?.message || String(err);
    // Graceful QuotaExceededError recovery: evict oversized redundant library bundle cache
    if (
      err &&
      (err.name === 'QuotaExceededError' ||
        err.code === 22 ||
        err.code === 1014 ||
        (err.message && err.message.toLowerCase().includes('quota')))
    ) {
      try {
        ls.removeItem(STORAGE_KEY_LIBRARY_BUNDLE);
        ls.setItem(key, value);
        lastStorageError = null; // recovered successfully
      } catch (retryErr: any) {
        lastStorageError = retryErr?.message || String(retryErr);
      }
    }
  }
}

/**
 * Loads UserLocalState from the Vite dev server endpoint `/api/user-state`,
 * falling back seamlessly to `localStorage` in static or offline environments.
 */
export async function loadUserState(): Promise<UserLocalState> {
  // 1. Try server endpoint
  try {
    const res = await fetch('/api/user-state');
    if (res.ok) {
      const data = (await res.json()) as Partial<UserLocalState>;
      if (data && typeof data === 'object') {
        const merged: UserLocalState = {
          version: data.version || DEFAULT_USER_STATE.version,
          updatedAt: data.updatedAt || new Date().toISOString(),
          showCovers: Boolean(data.showCovers),
          bookOverrides:
            data.bookOverrides && typeof data.bookOverrides === 'object' ? data.bookOverrides : {},
          kindleClippings: Array.isArray(data.kindleClippings) ? data.kindleClippings : [],
          externalWantList: Array.isArray(data.externalWantList) ? data.externalWantList : [],
          bookplateConfig:
            data.bookplateConfig && typeof data.bookplateConfig === 'object'
              ? data.bookplateConfig
              : undefined,
          writingTelemetry:
            data.writingTelemetry && typeof data.writingTelemetry === 'object'
              ? data.writingTelemetry
              : undefined,
          letterboxdData:
            data.letterboxdData && typeof data.letterboxdData === 'object'
              ? data.letterboxdData
              : undefined,
        };

        // Fallback to static writing telemetry if not yet saved on server or if dailyFiles is missing
        if (!merged.writingTelemetry || !merged.writingTelemetry.dailyFiles || Object.keys(merged.writingTelemetry.dailyFiles).length === 0) {
          try {
            const staticRes = await fetch('./data/writing_telemetry.json');
            if (staticRes.ok) {
              const staticTelem = await staticRes.json();
              merged.writingTelemetry = {
                ...staticTelem,
                ...(merged.writingTelemetry || {}),
                dailyFiles: staticTelem.dailyFiles,
              };
            }
          } catch {
            // Ignore
          }
        }

        // Fallback to static letterboxd data if not yet saved on server
        if (!merged.letterboxdData) {
          try {
            const staticRes = await fetch('./data/letterboxd_data.json');
            if (staticRes.ok) {
              merged.letterboxdData = await staticRes.json();
            }
          } catch {
            // Ignore
          }
        }

        // Mirror to localStorage for offline fallback
        setStorageItem(STORAGE_KEY_USER_STATE, JSON.stringify(merged));
        return merged;
      }
    }
  } catch {
    // Dev server unavailable or running in static export mode
  }

  // 2. Fallback to localStorage
  const localRaw = getStorageItem(STORAGE_KEY_USER_STATE);
  if (localRaw) {
    try {
      const parsed = JSON.parse(localRaw) as Partial<UserLocalState>;
      const merged: UserLocalState = {
        version: parsed.version || DEFAULT_USER_STATE.version,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        showCovers: Boolean(parsed.showCovers),
        bookOverrides:
          parsed.bookOverrides && typeof parsed.bookOverrides === 'object' ? parsed.bookOverrides : {},
        kindleClippings: Array.isArray(parsed.kindleClippings) ? parsed.kindleClippings : [],
        externalWantList: Array.isArray(parsed.externalWantList) ? parsed.externalWantList : [],
        bookplateConfig:
          parsed.bookplateConfig && typeof parsed.bookplateConfig === 'object'
            ? parsed.bookplateConfig
            : undefined,
        writingTelemetry:
          parsed.writingTelemetry && typeof parsed.writingTelemetry === 'object'
            ? parsed.writingTelemetry
            : undefined,
        letterboxdData:
          parsed.letterboxdData && typeof parsed.letterboxdData === 'object'
            ? parsed.letterboxdData
            : undefined,
      };

      // If writingTelemetry or dailyFiles is missing in localStorage, attempt static fallback
      if (!merged.writingTelemetry || !merged.writingTelemetry.dailyFiles || Object.keys(merged.writingTelemetry.dailyFiles).length === 0) {
        try {
          const staticRes = await fetch('./data/writing_telemetry.json');
          if (staticRes.ok) {
            const staticTelem = await staticRes.json();
            merged.writingTelemetry = {
              ...staticTelem,
              ...(merged.writingTelemetry || {}),
              dailyFiles: staticTelem.dailyFiles,
            };
          }
        } catch {
          // Ignore
        }
      }

      // If letterboxdData is missing in localStorage, attempt static fallback
      if (!merged.letterboxdData) {
        try {
          const staticRes = await fetch('./data/letterboxd_data.json');
          if (staticRes.ok) {
            merged.letterboxdData = await staticRes.json();
          }
        } catch {
          // Ignore
        }
      }

      return merged;
    } catch {
      // Corrupt localStorage entry
    }
  }

  // 3. Fresh default state with static writing telemetry & letterboxd fallback
  const fresh: UserLocalState = {
    ...DEFAULT_USER_STATE,
    updatedAt: new Date().toISOString(),
  };

  try {
    const staticRes = await fetch('./data/writing_telemetry.json');
    if (staticRes.ok) {
      fresh.writingTelemetry = await staticRes.json();
    }
  } catch {
    // Ignore
  }

  try {
    const staticRes = await fetch('./data/letterboxd_data.json');
    if (staticRes.ok) {
      fresh.letterboxdData = await staticRes.json();
    }
  } catch {
    // Ignore
  }

  return fresh;
}

/**
 * Saves UserLocalState to both `localStorage` and the Vite server endpoint `/api/user-state`.
 */
export async function saveUserState(state: UserLocalState): Promise<void> {
  const payload: UserLocalState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  // Immediate local write to guarantee zero-data-loss
  setStorageItem(STORAGE_KEY_USER_STATE, JSON.stringify(payload));

  // Sync to Vite local disk endpoint
  try {
    const res = await fetch('/api/user-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[localStateClient] Server save returned HTTP ${res.status}`);
    }
  } catch {
    // Static mode or dev server not reachable
  }
}

/**
 * Loads the enrichment cache map from disk (`/api/enrichment-cache`),
 * merged with any entries saved in `localStorage`.
 */
export async function loadEnrichmentCache(): Promise<EnrichmentCacheMap> {
  let diskCache: EnrichmentCacheMap = {};
  let localCache: EnrichmentCacheMap = {};

  // Read localStorage cache
  const localRaw = getStorageItem(STORAGE_KEY_ENRICHMENT_CACHE);
  if (localRaw) {
    try {
      localCache = JSON.parse(localRaw) as EnrichmentCacheMap;
    } catch {
      // Ignore parse failure
    }
  }

  // Read server disk cache
  let fetchedDisk = false;
  try {
    const res = await fetch('/api/enrichment-cache');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        diskCache = data as EnrichmentCacheMap;
        fetchedDisk = true;
      }
    }
  } catch {
    // Dev server unavailable
  }

  // Static fallback for GitHub Pages or offline static deployments: `./data/enrichment_cache.json`
  if (!fetchedDisk || Object.keys(diskCache).length === 0) {
    try {
      const staticRes = await fetch('./data/enrichment_cache.json');
      if (staticRes.ok) {
        const staticData = await staticRes.json();
        if (staticData && typeof staticData === 'object') {
          diskCache = { ...(staticData as EnrichmentCacheMap), ...diskCache };
        }
      }
    } catch {
      // Static fallback unavailable
    }
  }

  // Merge both: disk cache + local cache
  const merged: EnrichmentCacheMap = {
    ...localCache,
    ...diskCache,
  };

  // Keep localStorage updated if entries exist
  if (Object.keys(merged).length > 0) {
    setStorageItem(STORAGE_KEY_ENRICHMENT_CACHE, JSON.stringify(merged));
  }

  return merged;
}

/**
 * Saves a batch of enriched book metadata into `localStorage` and the
 * Vite server endpoint `/api/enrichment-cache` (which appends to `data/enrichment_cache.json`).
 */
export async function saveEnrichmentBatch(batch: EnrichmentCacheMap): Promise<void> {
  if (!batch || Object.keys(batch).length === 0) return;

  // 1. Update localStorage
  try {
    const localRaw = getStorageItem(STORAGE_KEY_ENRICHMENT_CACHE);
    const existing: EnrichmentCacheMap = localRaw ? JSON.parse(localRaw) : {};
    const merged = { ...existing, ...batch };
    setStorageItem(STORAGE_KEY_ENRICHMENT_CACHE, JSON.stringify(merged));
  } catch {
    // Quota reached or storage disabled
  }

  // 2. Post to Vite local disk endpoint
  try {
    await fetch('/api/enrichment-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
  } catch {
    // Static mode or offline
  }
}

/**
 * Persists the entire LibraryBundle to the Vite server endpoint `/api/library-bundle`
 * (updating both `data/library_bundle.json` and `public/data/library_bundle.json`),
 * with a mirror to `localStorage` if size allows.
 */
export async function persistLibraryBundle(bundle: LibraryBundle): Promise<void> {
  // Try mirror to localStorage (may exceed quota on very large libraries)
  try {
    setStorageItem(STORAGE_KEY_LIBRARY_BUNDLE, JSON.stringify(bundle));
  } catch {
    // Silently ignore quota exceeded
  }

  // Sync to Vite local disk endpoint
  try {
    const res = await fetch('/api/library-bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    });
    if (!res.ok) {
      console.warn(`[localStateClient] Server bundle persistence returned HTTP ${res.status}`);
    }
  } catch {
    // Static mode or offline
  }
}
