import type { FilmEnrichedMetadata, FilmEnrichmentCacheMap } from '../../types/library';
import { filmLookupKey } from '../parsers/letterboxdParser';

export interface FilmLookupInput {
  name: string;
  year: number;
  uri?: string;
}

interface ImdbSuggestionItem {
  id?: string;
  l?: string;
  qid?: string;
  y?: number;
  q?: string;
}

const USER_AGENT = 'ExLibrisVault/1.0 (local-obsidian-library; +http://localhost:3100)';
const ALLOWED_QIDS = new Set([
  'movie',
  'tvMovie',
  'short',
  'video',
  'tvSpecial',
  'tvMiniSeries',
  'tvSeries',
]);
const FEATURE_QIDS = new Set(['movie', 'tvMovie', 'short', 'video', 'tvSpecial']);
const WIKIDATA_LANGS = ['en', 'en-gb', 'tr', 'mul', 'fr', 'de', 'es', 'ja', 'ko'];

function normalizeTitleForMatch(title: string): string {
  return (title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function imdbBucketChar(title: string): string {
  const norm = normalizeTitleForMatch(title).replace(/[^a-z0-9]/g, '');
  return norm ? norm[0] : 'a';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry<T>(url: string, init?: RequestInit, attempts = 3): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(init?.headers || {}),
        },
      });
      clearTimeout(timeout);
      if (res.ok) {
        return (await res.json()) as T;
      }
      if (res.status === 429 || res.status >= 500) {
        await sleep(300 * (i + 1));
        continue;
      }
      return null;
    } catch {
      clearTimeout(timeout);
      if (i + 1 < attempts) {
        await sleep(300 * (i + 1));
      }
    }
  }
  return null;
}

function scoreImdbCandidate(
  queryName: string,
  queryYear: number,
  cand: ImdbSuggestionItem
): number {
  if (!cand.id || !cand.id.startsWith('tt') || !cand.l) return -1;
  if (cand.qid && !ALLOWED_QIDS.has(cand.qid)) return -1;

  const qNorm = normalizeTitleForMatch(queryName);
  const cNorm = normalizeTitleForMatch(cand.l);
  if (!qNorm || !cNorm) return -1;

  // Guard unreleased / yearless titles against false sequel matches
  if (queryYear === 0 && qNorm !== cNorm) return -1;

  if (queryYear > 0 && typeof cand.y === 'number' && Math.abs(cand.y - queryYear) > 1) {
    return -1;
  }

  let score = 0;
  if (qNorm === cNorm) score += 100;
  else if (cNorm.startsWith(qNorm) || qNorm.startsWith(cNorm)) score += 45;
  else {
    const qTokens = new Set(qNorm.split(' '));
    const cTokens = cNorm.split(' ');
    const overlap = cTokens.filter((t) => qTokens.has(t)).length;
    if (overlap === 0) return -1;
    score += Math.round((overlap / Math.max(qTokens.size, cTokens.length)) * 40);
  }

  if (queryYear > 0 && typeof cand.y === 'number') {
    if (cand.y === queryYear) score += 50;
    else if (Math.abs(cand.y - queryYear) === 1) score += 20;
  }

  if (cand.qid && FEATURE_QIDS.has(cand.qid)) score += 15;
  return score;
}

async function resolveImdbId(film: FilmLookupInput): Promise<string | null> {
  const bucket = imdbBucketChar(film.name);
  const slug = encodeURIComponent(film.name.trim().toLowerCase());
  const url = `https://v3.sg.media-imdb.com/suggestion/${bucket}/${slug}.json`;
  const data = await fetchJsonWithRetry<{ d?: ImdbSuggestionItem[] }>(url);
  if (!data?.d || data.d.length === 0) return null;

  let bestId: string | null = null;
  let bestScore = -1;
  for (const item of data.d) {
    const score = scoreImdbCandidate(film.name, film.year, item);
    if (score > bestScore) {
      bestScore = score;
      bestId = item.id || null;
    }
  }
  return bestScore >= 60 ? bestId : null;
}

async function queryWikidataSparqlByImdb(
  imdbIds: string[]
): Promise<Map<string, { wikidataId?: string; directors: string[] }>> {
  const result = new Map<string, { wikidataId?: string; directors: string[] }>();
  if (imdbIds.length === 0) return result;

  // Query in batches of 75 so POST SPARQL requests remain fast and reliable
  for (let i = 0; i < imdbIds.length; i += 75) {
    const chunk = imdbIds.slice(i, i + 75);
    const valuesList = chunk.map((id) => `"${id}"`).join(' ');
    const sparql = `SELECT ?imdb ?film ?directorLabel WHERE {
  VALUES ?imdb { ${valuesList} }
  ?film wdt:P345 ?imdb .
  OPTIONAL { ?film wdt:P57 ?director . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${WIKIDATA_LANGS.join(',')}". }
}`;

    const body = new URLSearchParams({ query: sparql }).toString();
    const json = await fetchJsonWithRetry<{
      results?: {
        bindings?: Array<{
          imdb?: { value: string };
          film?: { value: string };
          directorLabel?: { value: string };
        }>;
      };
    }>('https://query.wikidata.org/sparql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/sparql-results+json',
      },
      body,
    });

    for (const row of json?.results?.bindings || []) {
      const imdb = row.imdb?.value;
      if (!imdb) continue;
      const entry = result.get(imdb) || { directors: [] };
      const qid = row.film?.value?.split('/').pop();
      if (qid && !entry.wikidataId) entry.wikidataId = qid;
      const dLabel = row.directorLabel?.value?.trim();
      if (dLabel && !/^Q\d+$/.test(dLabel) && !entry.directors.includes(dLabel)) {
        entry.directors.push(dLabel);
      }
      result.set(imdb, entry);
    }
  }
  return result;
}

function pickPreferredLabel(labels?: Record<string, { value?: string }>): string | null {
  if (!labels) return null;
  for (const lang of WIKIDATA_LANGS) {
    const val = labels[lang]?.value?.trim();
    if (val) return val;
  }
  const firstAny = Object.values(labels).find((l) => l?.value?.trim());
  return firstAny?.value?.trim() || null;
}

function extractPublicationYears(claims: any): number[] {
  const pubClaims = claims?.P577;
  if (!Array.isArray(pubClaims)) return [];
  const years: number[] = [];
  for (const c of pubClaims) {
    const t: string | undefined = c?.mainsnak?.datavalue?.value?.time;
    if (t) {
      const m = t.match(/([+-]?\d{4})-/);
      if (m) years.push(Math.abs(parseInt(m[1], 10)));
    }
  }
  return years;
}

function extractP57Qids(claims: any): string[] {
  const dirClaims = claims?.P57;
  if (!Array.isArray(dirClaims)) return [];
  const qids: string[] = [];
  for (const c of dirClaims) {
    const qid: string | undefined = c?.mainsnak?.datavalue?.value?.id;
    if (qid && !qids.includes(qid)) qids.push(qid);
  }
  return qids;
}

async function resolveByWikidataSearch(
  film: FilmLookupInput
): Promise<{ wikidataId?: string; imdbId?: string; directorQids: string[] } | null> {
  const langsToTry = ['en', 'tr'];
  const candidateIds: string[] = [];

  for (const lang of langsToTry) {
    const url =
      `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
      `&search=${encodeURIComponent(film.name)}` +
      `&language=${lang}&limit=5&format=json`;
    const data = await fetchJsonWithRetry<{ search?: Array<{ id?: string }> }>(url);
    for (const hit of data?.search || []) {
      if (hit.id && !candidateIds.includes(hit.id)) candidateIds.push(hit.id);
    }
    if (candidateIds.length >= 5) break;
  }
  if (candidateIds.length === 0) return null;

  const entitiesUrl =
    `https://www.wikidata.org/w/api.php?action=wbgetentities` +
    `&ids=${candidateIds.slice(0, 8).join('|')}&props=claims|labels&languages=${WIKIDATA_LANGS.join('|')}&format=json`;
  const entitiesRes = await fetchJsonWithRetry<{ entities?: Record<string, any> }>(entitiesUrl);
  const entities = entitiesRes?.entities;
  if (!entities) return null;

  const qNorm = normalizeTitleForMatch(film.name);
  for (const qid of candidateIds) {
    const ent = entities[qid];
    if (!ent?.claims) continue;
    const directorQids = extractP57Qids(ent.claims);
    if (directorQids.length === 0) continue;

    const years = extractPublicationYears(ent.claims);
    if (film.year > 0 && years.length > 0 && !years.some((y) => Math.abs(y - film.year) <= 1)) {
      continue;
    }
    if (film.year === 0) {
      const labelMatch = Object.values(ent.labels || {}).some(
        (l: any) => normalizeTitleForMatch(l?.value || '') === qNorm
      );
      if (!labelMatch) continue;
    }

    const imdbId: string | undefined = ent.claims?.P345?.[0]?.mainsnak?.datavalue?.value;
    return { wikidataId: qid, imdbId, directorQids };
  }
  return null;
}

async function resolveEntityLabels(qids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(qids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 45) {
    const slice = unique.slice(i, i + 45);
    const url =
      `https://www.wikidata.org/w/api.php?action=wbgetentities` +
      `&ids=${slice.join('|')}&props=labels&languages=${WIKIDATA_LANGS.join('|')}&format=json`;
    const res = await fetchJsonWithRetry<{ entities?: Record<string, { labels?: Record<string, { value?: string }> }> }>(url);
    for (const qid of slice) {
      const label = pickPreferredLabel(res?.entities?.[qid]?.labels);
      if (label && !/^Q\d+$/.test(label)) {
        out.set(qid, label);
      }
    }
  }
  return out;
}

/**
 * Resolves film directors for a batch of Letterboxd films using unauthenticated
 * IMDb Suggestions -> Wikidata SPARQL (`VALUES ?imdb`) + Wikidata entity search fallback.
 */
export async function lookupFilmsDirectors(films: FilmLookupInput[]): Promise<FilmEnrichmentCacheMap> {
  const results: FilmEnrichmentCacheMap = {};
  if (!films || films.length === 0) return results;

  // Deduplicate input list by canonical lookup key
  const uniqueByKey = new Map<string, FilmLookupInput>();
  for (const f of films) {
    if (!f.name?.trim()) continue;
    const key = filmLookupKey(f.name, f.year || 0);
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, f);
  }
  const queue = Array.from(uniqueByKey.entries());

  // Stage 1: Polite bounded-concurrency (<=4 workers) IMDb Suggestion lookup
  const imdbByKey = new Map<string, string>();
  let cursor = 0;
  const workerCount = Math.min(4, queue.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < queue.length) {
        const idx = cursor++;
        const [key, film] = queue[idx];
        const imdbId = await resolveImdbId(film);
        if (imdbId) imdbByKey.set(key, imdbId);
      }
    })
  );

  // Stage 2: Batched Wikidata SPARQL lookup for all matched IMDb IDs
  const sparqlMap = await queryWikidataSparqlByImdb(Array.from(new Set(imdbByKey.values())));

  // Stage 3: Identify films still missing directors and run Wikidata entity search fallback
  const fallbackTargets: Array<[string, FilmLookupInput]> = [];
  const nowIso = new Date().toISOString();

  for (const [key, film] of queue) {
    const imdbId = imdbByKey.get(key);
    const sparqlHit = imdbId ? sparqlMap.get(imdbId) : undefined;
    if (sparqlHit && sparqlHit.directors.length > 0) {
      results[key] = {
        key,
        title: film.name,
        year: film.year || 0,
        directors: sparqlHit.directors,
        imdbId: imdbId || null,
        wikidataId: sparqlHit.wikidataId || null,
        source: 'wikidata',
        fetchedAt: nowIso,
      };
    } else {
      fallbackTargets.push([key, film]);
    }
  }

  if (fallbackTargets.length > 0) {
    const pendingFallbackMatches: Array<{
      key: string;
      film: FilmLookupInput;
      wikidataId?: string;
      imdbId?: string;
      directorQids: string[];
    }> = [];
    const allDirectorQids: string[] = [];

    let fbCursor = 0;
    const fbWorkers = Math.min(3, fallbackTargets.length);
    await Promise.all(
      Array.from({ length: fbWorkers }, async () => {
        while (fbCursor < fallbackTargets.length) {
          const idx = fbCursor++;
          const [key, film] = fallbackTargets[idx];
          const hit = await resolveByWikidataSearch(film);
          if (hit && hit.directorQids.length > 0) {
            pendingFallbackMatches.push({
              key,
              film,
              wikidataId: hit.wikidataId,
              imdbId: hit.imdbId || imdbByKey.get(key),
              directorQids: hit.directorQids,
            });
            allDirectorQids.push(...hit.directorQids);
          } else {
            const existingImdb = imdbByKey.get(key);
            results[key] = {
              key,
              title: film.name,
              year: film.year || 0,
              directors: [],
              imdbId: existingImdb || null,
              wikidataId: (existingImdb ? sparqlMap.get(existingImdb)?.wikidataId : undefined) || null,
              source: 'none',
              fetchedAt: nowIso,
            };
          }
        }
      })
    );

    const dirLabelMap = await resolveEntityLabels(allDirectorQids);
    for (const item of pendingFallbackMatches) {
      const directors = item.directorQids
        .map((q) => dirLabelMap.get(q))
        .filter((d): d is string => Boolean(d));
      results[item.key] = {
        key: item.key,
        title: item.film.name,
        year: item.film.year || 0,
        directors,
        imdbId: item.imdbId || null,
        wikidataId: item.wikidataId || null,
        source: directors.length > 0 ? 'wikidata' : 'none',
        fetchedAt: nowIso,
      };
    }
  }

  return results;
}
