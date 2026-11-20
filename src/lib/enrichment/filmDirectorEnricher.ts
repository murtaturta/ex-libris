import type {
  FilmEnrichmentCacheMap,
  LetterboxdArchiveData,
} from '../../types/library';
import { filmLookupKey } from '../parsers/letterboxdParser';
import { saveFilmEnrichmentBatch } from '../storage/localStateClient';
import type { FilmLookupInput } from './filmDirectorLookup';

export const filmCacheKey = filmLookupKey;

export interface FilmEnrichmentProgress {
  completed: number;
  total: number;
  enrichedCount: number;
  currentLabel?: string;
}

/**
 * Extracts unique normalized film entries across watches and watchlist in a LetterboxdArchiveData object.
 */
export function collectUniqueFilmsForEnrichment(
  letterboxdData?: LetterboxdArchiveData | null
): FilmLookupInput[] {
  if (!letterboxdData) return [];
  const map = new Map<string, FilmLookupInput>();

  for (const w of letterboxdData.watches || []) {
    if (!w.name?.trim()) continue;
    const key = filmCacheKey(w.name, w.year || 0);
    if (!map.has(key)) {
      map.set(key, { name: w.name.trim(), year: w.year || 0, uri: w.uri });
    }
  }

  for (const wl of letterboxdData.watchlist || []) {
    if (!wl.name?.trim()) continue;
    const key = filmCacheKey(wl.name, wl.year || 0);
    if (!map.has(key)) {
      map.set(key, { name: wl.name.trim(), year: wl.year || 0, uri: wl.uri });
    }
  }

  return Array.from(map.values());
}

/**
 * Counts how many unique films do not yet have a cached director lookup entry.
 */
export function countUnenrichedFilms(
  letterboxdData?: LetterboxdArchiveData | null,
  cache?: FilmEnrichmentCacheMap | null
): number {
  const unique = collectUniqueFilmsForEnrichment(letterboxdData);
  const existing = cache || {};
  return unique.filter((f) => !existing[filmCacheKey(f.name, f.year)]).length;
}

/**
 * Enriches missing film directors via `/api/enrich-films` in sequential chunks,
 * updating disk cache + localStorage after each chunk.
 */
export async function enrichFilmDirectors(
  films: FilmLookupInput[],
  existingCache: FilmEnrichmentCacheMap,
  onProgress?: (progress: FilmEnrichmentProgress) => void,
  options?: { retryNotFound?: boolean; chunkSize?: number }
): Promise<{ enriched: number; totalMissing: number; updatedCache: FilmEnrichmentCacheMap }> {
  const retryNotFound = Boolean(options?.retryNotFound);
  const chunkSize = options?.chunkSize ?? 40;

  const missing = films.filter((f) => {
    const entry = existingCache[filmCacheKey(f.name, f.year)];
    if (!entry) return true;
    return retryNotFound && entry.source === 'none';
  });

  const updatedCache: FilmEnrichmentCacheMap = { ...existingCache };
  if (missing.length === 0) {
    return { enriched: 0, totalMissing: 0, updatedCache };
  }

  let completed = 0;
  let enrichedCount = 0;

  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    onProgress?.({
      completed,
      total: missing.length,
      enrichedCount,
      currentLabel: chunk[0]?.name,
    });

    try {
      const res = await fetch('/api/enrich-films', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ films: chunk }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          results?: FilmEnrichmentCacheMap;
        };
        if (data.results && typeof data.results === 'object') {
          Object.assign(updatedCache, data.results);
          enrichedCount += Object.values(data.results).filter((r) => r.directors.length > 0).length;
          await saveFilmEnrichmentBatch(data.results, { localOnly: true });
        }
      }
    } catch {
      // Static build or offline — leave missing entries uncached gracefully
    }

    completed += chunk.length;
    onProgress?.({
      completed,
      total: missing.length,
      enrichedCount,
      currentLabel: chunk[chunk.length - 1]?.name,
    });
  }

  return {
    enriched: enrichedCount,
    totalMissing: missing.length,
    updatedCache,
  };
}
