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
};

/**
 * Safe localStorage reader that works in browser and Node/testing environments.
 */
function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // Restricted or quota error
  }
  return null;
}

/**
 * Safe localStorage writer that fails silently on quota or permission errors.
 */
function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Quota exceeded or private-mode restrictions
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
          bookOverrides: data.bookOverrides && typeof data.bookOverrides === 'object' ? data.bookOverrides : {},
          kindleClippings: Array.isArray(data.kindleClippings) ? data.kindleClippings : [],
        };
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
      return {
        version: parsed.version || DEFAULT_USER_STATE.version,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        showCovers: Boolean(parsed.showCovers),
        bookOverrides: parsed.bookOverrides && typeof parsed.bookOverrides === 'object' ? parsed.bookOverrides : {},
        kindleClippings: Array.isArray(parsed.kindleClippings) ? parsed.kindleClippings : [],
      };
    } catch {
      // Corrupt localStorage entry
    }
  }

  // 3. Fresh default state
  return {
    ...DEFAULT_USER_STATE,
    updatedAt: new Date().toISOString(),
  };
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
  try {
    const res = await fetch('/api/enrichment-cache');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        diskCache = data as EnrichmentCacheMap;
      }
    }
  } catch {
    // Dev server unavailable
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
