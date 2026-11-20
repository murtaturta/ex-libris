import JSZip from 'jszip';
import type {
  Book,
  EnrichmentCacheMap,
  FilmEnrichmentCacheMap,
  LetterboxdArchiveData,
  LetterboxdFilmWatch,
  UserLocalState,
} from '../../types/library';
import { doesBookMatchFilm } from '../analytics/engine';
import { filmLookupKey, formatStarRating } from '../parsers/letterboxdParser';
import { bookHasAnnotations, wikilink, yamlEscape } from './markdownNoteExporter';
import {
  buildObsidianVaultFiles,
  sanitizeNoteName,
  type ObsidianExportScope,
} from './obsidianVaultExporter';

export type LetterboxdObsidianScope = 'all' | 'watched' | 'annotated';

export interface FilmWatchEntry {
  date: string;
  rating: number | null;
  rewatch: boolean;
  review: string | null;
  tags: string[];
  source: LetterboxdFilmWatch['source'];
}

export interface NormalizedFilmRecord {
  key: string;
  name: string;
  year: number;
  uri: string;
  status: 'watched' | 'watchlist';
  rating: number | null;
  liked: boolean;
  rewatchCount: number;
  firstWatched: string | null;
  lastWatched: string | null;
  dateWatchlisted: string | null;
  tags: string[];
  lists: string[];
  directors: string[];
  imdbId?: string;
  wikidataId?: string;
  watchLog: FilmWatchEntry[];
}

export interface LetterboxdVaultExportOptions {
  scope?: LetterboxdObsidianScope;
  includeDirectors?: boolean;
  filmEnrichmentCache?: FilmEnrichmentCacheMap;
  books?: Book[];
  bookNoteNamesById?: Map<string, string>;
  vaultRoot?: string;
  sharedUsedNames?: Set<string>;
}

export interface CombinedObsidianExportOptions {
  bookScope?: ObsidianExportScope;
  cinemaScope?: LetterboxdObsidianScope;
  includeDirectors?: boolean;
  filmEnrichmentCache?: FilmEnrichmentCacheMap;
}

export interface LetterboxdVaultStats {
  totalCount: number;
  watchedCount: number;
  watchlistCount: number;
  annotatedCount: number;
  directorsCount: number;
}

function claimUniqueNoteName(
  usedNames: Set<string>,
  rawName: string,
  disambiguator: string,
  fallback: string
): string {
  const base = sanitizeNoteName(rawName, fallback);
  if (!usedNames.has(base.toLowerCase())) {
    usedNames.add(base.toLowerCase());
    return base;
  }
  const withDisambig = sanitizeNoteName(`${base} ${disambiguator}`, fallback);
  if (!usedNames.has(withDisambig.toLowerCase())) {
    usedNames.add(withDisambig.toLowerCase());
    return withDisambig;
  }
  let n = 2;
  while (usedNames.has(`${withDisambig} (${n})`.toLowerCase())) {
    n++;
  }
  const resolved = `${withDisambig} (${n})`;
  usedNames.add(resolved.toLowerCase());
  return resolved;
}

function sanitizeObsidianTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_/]/g, '');
}

/**
 * Consolidates watches, diary entries, ratings, reviews, likes, lists, and watchlist
 * into one canonical record per unique `(name, year)` film.
 */
export function normalizeFilmRecords(
  letterboxdData?: LetterboxdArchiveData | null,
  filmEnrichmentCache?: FilmEnrichmentCacheMap
): NormalizedFilmRecord[] {
  if (!letterboxdData) return [];

  const cache = filmEnrichmentCache || {};
  const likedSet = new Set<string>(letterboxdData.likedFilms || []);
  const listsByFilm = new Map<string, string[]>();
  for (const lst of letterboxdData.lists || []) {
    for (const item of lst.films || []) {
      const k = filmLookupKey(item.name, item.year || 0);
      const arr = listsByFilm.get(k) || [];
      if (!arr.includes(lst.name)) arr.push(lst.name);
      listsByFilm.set(k, arr);
    }
  }

  const byKey = new Map<
    string,
    {
      name: string;
      year: number;
      uri: string;
      status: 'watched' | 'watchlist';
      rating: number | null;
      liked: boolean;
      dateWatchlisted: string | null;
      tags: Set<string>;
      lists: Set<string>;
      watchLog: FilmWatchEntry[];
    }
  >();

  for (const w of letterboxdData.watches || []) {
    if (!w.name?.trim()) continue;
    const year = w.year || 0;
    const key = filmLookupKey(w.name, year);
    let rec = byKey.get(key);
    if (!rec) {
      rec = {
        name: w.name.trim(),
        year,
        uri: w.uri || '',
        status: 'watched',
        rating: null,
        liked: Boolean(w.liked || likedSet.has(key)),
        dateWatchlisted: null,
        tags: new Set<string>(),
        lists: new Set<string>(listsByFilm.get(key) || []),
        watchLog: [],
      };
      byKey.set(key, rec);
    }
    if (!rec.uri && w.uri) rec.uri = w.uri;
    if (w.liked) rec.liked = true;
    for (const t of w.tags || []) {
      if (t.trim()) rec.tags.add(t.trim());
    }
    for (const l of w.lists || []) {
      if (l.trim()) rec.lists.add(l.trim());
    }
    rec.watchLog.push({
      date: w.date || '',
      rating: w.rating ?? null,
      rewatch: Boolean(w.rewatch),
      review: w.review ?? null,
      tags: w.tags || [],
      source: w.source,
    });
  }

  for (const wl of letterboxdData.watchlist || []) {
    if (!wl.name?.trim()) continue;
    const year = wl.year || 0;
    const key = filmLookupKey(wl.name, year);
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.dateWatchlisted && wl.dateAdded) existing.dateWatchlisted = wl.dateAdded;
      if (!existing.uri && wl.uri) existing.uri = wl.uri;
      continue;
    }
    byKey.set(key, {
      name: wl.name.trim(),
      year,
      uri: wl.uri || '',
      status: 'watchlist',
      rating: letterboxdData.ratingsMap?.[key] ?? null,
      liked: likedSet.has(key),
      dateWatchlisted: wl.dateAdded || null,
      tags: new Set<string>(),
      lists: new Set<string>(listsByFilm.get(key) || []),
      watchLog: [],
    });
  }

  const normalized: NormalizedFilmRecord[] = [];
  for (const [key, rec] of byKey.entries()) {
    rec.watchLog.sort((a, b) => b.date.localeCompare(a.date));
    const firstRated = rec.watchLog.find((entry) => entry.rating !== null);
    const rating = firstRated?.rating ?? letterboxdData.ratingsMap?.[key] ?? rec.rating ?? null;
    const validDates = rec.watchLog.map((e) => e.date).filter(Boolean);
    const lastWatched = validDates.length > 0 ? validDates[0] : null;
    const firstWatched = validDates.length > 0 ? validDates[validDates.length - 1] : null;
    const explicitRewatches = rec.watchLog.filter((e) => e.rewatch).length;
    const rewatchCount = Math.max(explicitRewatches, Math.max(0, rec.watchLog.length - 1));
    const enriched = cache[key];

    normalized.push({
      key,
      name: rec.name,
      year: rec.year,
      uri: rec.uri,
      status: rec.status,
      rating,
      liked: rec.liked,
      rewatchCount,
      firstWatched,
      lastWatched,
      dateWatchlisted: rec.dateWatchlisted,
      tags: Array.from(rec.tags),
      lists: Array.from(rec.lists).sort(),
      directors: enriched?.directors ? [...enriched.directors] : [],
      imdbId: enriched?.imdbId || undefined,
      wikidataId: enriched?.wikidataId || undefined,
      watchLog: rec.watchLog,
    });
  }

  normalized.sort((a, b) => {
    const dateA = a.lastWatched || a.dateWatchlisted || '';
    const dateB = b.lastWatched || b.dateWatchlisted || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.name.localeCompare(b.name);
  });

  return normalized;
}

/**
 * Returns true if a film carries personal written reflections, tags, or curated list memberships.
 */
export function filmHasAnnotations(film: NormalizedFilmRecord): boolean {
  if (film.watchLog.some((entry) => Boolean(entry.review && entry.review.trim()))) return true;
  if (film.tags.length > 0) return true;
  if (film.lists.length > 0) return true;
  return false;
}

export function filterFilmsByScope(
  films: NormalizedFilmRecord[],
  scope: LetterboxdObsidianScope = 'all'
): NormalizedFilmRecord[] {
  if (scope === 'watched') return films.filter((f) => f.status === 'watched');
  if (scope === 'annotated') return films.filter(filmHasAnnotations);
  return films;
}

export function computeLetterboxdVaultStats(
  letterboxdData?: LetterboxdArchiveData | null,
  filmEnrichmentCache?: FilmEnrichmentCacheMap
): LetterboxdVaultStats {
  const films = normalizeFilmRecords(letterboxdData, filmEnrichmentCache);
  const directors = new Set<string>();
  for (const f of films) {
    for (const d of f.directors) directors.add(d);
  }
  return {
    totalCount: films.length,
    watchedCount: films.filter((f) => f.status === 'watched').length,
    watchlistCount: films.filter((f) => f.status === 'watchlist').length,
    annotatedCount: films.filter(filmHasAnnotations).length,
    directorsCount: directors.size,
  };
}

interface MatchedBookLink {
  book: Book;
  noteName: string;
  note?: string;
}

function findMatchingBooksForFilm(
  film: NormalizedFilmRecord,
  books: Book[],
  bookNoteNamesById?: Map<string, string>
): MatchedBookLink[] {
  const out: MatchedBookLink[] = [];
  for (const book of books) {
    const bTitle = book.cleanTitle || book.title;
    const match = doesBookMatchFilm(bTitle, film.name);
    if (match.matched) {
      const noteName =
        bookNoteNamesById?.get(book.id) || sanitizeNoteName(bTitle, 'Book');
      out.push({ book, noteName, note: match.note });
    }
  }
  return out;
}

function generateFilmMarkdownNote(
  film: NormalizedFilmRecord,
  directorNoteNames: string[],
  includeDirectors: boolean,
  adaptedBooks: MatchedBookLink[]
): string {
  const directorFieldLines: string[] = [];
  if (includeDirectors && directorNoteNames.length > 0) {
    directorFieldLines.push(
      `directors:\n${directorNoteNames.map((d, idx) => `  - ${yamlEscape(wikilink(d, film.directors[idx]))}`).join('\n')}`
    );
  } else if (film.directors.length > 0) {
    directorFieldLines.push(
      `directors:\n${film.directors.map((d) => `  - ${yamlEscape(d)}`).join('\n')}`
    );
  }

  const watchedDates = Array.from(
    new Set(film.watchLog.map((w) => w.date).filter(Boolean))
  );

  const tags = Array.from(
    new Set([
      'film',
      'cinema',
      'letterboxd',
      film.status === 'watchlist' ? 'watchlist' : 'watched',
      ...film.tags.map(sanitizeObsidianTag).filter(Boolean),
    ])
  );

  const yamlLines = [
    '---',
    'type: film',
    `title: ${yamlEscape(film.name)}`,
    film.year > 0 ? `year: ${film.year}` : '',
    ...directorFieldLines,
    `status: ${film.status}`,
    film.rating !== null ? `my_rating: ${film.rating}` : '',
    film.liked ? 'liked: true' : '',
    film.rewatchCount > 0 ? `rewatch_count: ${film.rewatchCount}` : '',
    watchedDates.length > 0
      ? `watched_dates:\n${watchedDates.map((d) => `  - ${yamlEscape(d)}`).join('\n')}`
      : '',
    film.dateWatchlisted ? `date_watchlisted: ${yamlEscape(film.dateWatchlisted)}` : '',
    film.lists.length > 0
      ? `lists:\n${film.lists.map((l) => `  - ${yamlEscape(l)}`).join('\n')}`
      : '',
    adaptedBooks.length > 0
      ? `adapted_from:\n${adaptedBooks.map((b) => `  - ${yamlEscape(wikilink(b.noteName))}`).join('\n')}`
      : '',
    `tags:\n${tags.map((t) => `  - ${t}`).join('\n')}`,
    film.imdbId ? `imdb_id: ${yamlEscape(film.imdbId)}` : '',
    film.wikidataId ? `wikidata_id: ${yamlEscape(film.wikidataId)}` : '',
    film.uri ? `letterboxd_uri: ${yamlEscape(film.uri)}` : '',
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const displayHeading = film.year > 0 ? `${film.name} (${film.year})` : film.name;
  const metaParts: string[] = [];

  if (film.directors.length > 0) {
    const dirLinks =
      includeDirectors && directorNoteNames.length > 0
        ? directorNoteNames.map((n, idx) => wikilink(n, film.directors[idx])).join(', ')
        : film.directors.join(', ');
    metaParts.push(`**Directed by:** ${dirLinks}`);
  }

  metaParts.push(`**Status:** ${film.status === 'watched' ? 'Watched' : 'Watchlist'}`);

  if (film.rating !== null) {
    metaParts.push(`**Rating:** ${formatStarRating(film.rating)} (${film.rating}/5)`);
  }
  if (film.liked) {
    metaParts.push('**Liked:** Yes');
  }
  if (film.rewatchCount > 0) {
    metaParts.push(`**Rewatches:** ${film.rewatchCount}`);
  }
  if (film.status === 'watchlist' && film.dateWatchlisted) {
    metaParts.push(`**Added:** ${film.dateWatchlisted}`);
  }

  const sections: string[] = [`# ${displayHeading}`, '', metaParts.join(' · ')];

  if (film.watchLog.length > 0) {
    sections.push('', '## Watch Log');
    const seenReviews = new Set<string>();
    for (const entry of film.watchLog) {
      const entryMeta = [
        entry.rewatch ? 'Rewatch' : '',
        entry.rating !== null ? formatStarRating(entry.rating) : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const cleanReview = entry.review?.trim() || '';
      if (cleanReview && !seenReviews.has(cleanReview)) {
        seenReviews.add(cleanReview);
        sections.push(
          '',
          `### ${entry.date || 'Undated'}${entryMeta ? ` (${entryMeta})` : ''}`,
          '',
          cleanReview
        );
      } else {
        sections.push(
          `- **${entry.date || 'Undated'}** — ${entry.rewatch ? 'Rewatched' : 'Watched'}${
            entry.rating !== null ? ` · ${formatStarRating(entry.rating)}` : ''
          }`
        );
      }
    }
  }

  if (film.lists.length > 0) {
    sections.push('', '## Lists', ...film.lists.map((l) => `- ${l}`));
  }

  if (film.tags.length > 0) {
    sections.push('', `**Letterboxd Tags:** ${film.tags.map((t) => `#${sanitizeObsidianTag(t)}`).join(' ')}`);
  }

  if (adaptedBooks.length > 0) {
    sections.push(
      '',
      '## Literary Source',
      ...adaptedBooks.map(({ book, noteName, note }) => {
        const bookRating = book.myRating !== null && book.myRating > 0 ? ` · ${book.myRating}/5` : '';
        const noteText = note ? ` — *${note}*` : '';
        return `- ${wikilink(noteName)} by ${book.author} (\`${book.exclusiveShelf}\`${bookRating})${noteText}`;
      })
    );
  }

  return `${yamlLines}\n\n${sections.join('\n')}\n`;
}

function generateDirectorHubNote(
  directorName: string,
  entries: Array<{ film: NormalizedFilmRecord; noteName: string }>
): string {
  const sorted = [...entries].sort((a, b) => {
    const yA = a.film.year || 9999;
    const yB = b.film.year || 9999;
    if (yA !== yB) return yA - yB;
    return a.film.name.localeCompare(b.film.name);
  });

  const watchedEntries = sorted.filter((e) => e.film.status === 'watched');
  const watchlistEntries = sorted.filter((e) => e.film.status === 'watchlist');
  const rated = sorted.filter((e) => e.film.rating !== null);
  const avgRating =
    rated.length > 0
      ? Number((rated.reduce((s, e) => s + (e.film.rating || 0), 0) / rated.length).toFixed(2))
      : null;

  const yamlLines = [
    '---',
    'type: director',
    `name: ${yamlEscape(directorName)}`,
    `films_count: ${sorted.length}`,
    `watched_count: ${watchedEntries.length}`,
    watchlistEntries.length > 0 ? `watchlist_count: ${watchlistEntries.length}` : '',
    avgRating !== null ? `average_rating: ${avgRating}` : '',
    'tags:',
    '  - director',
    '  - cinema',
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const summaryBits = [`**Watched:** ${watchedEntries.length}`];
  if (watchlistEntries.length > 0) {
    summaryBits.push(`**Watchlist:** ${watchlistEntries.length}`);
  }
  if (avgRating !== null) {
    summaryBits.push(`**Average Rating:** ${formatStarRating(avgRating)} (${avgRating}/5)`);
  }

  const lines = sorted.map(({ film, noteName }) => {
    const titleWithYear = film.year > 0
      ? `${wikilink(noteName, film.name)} (${film.year})`
      : wikilink(noteName, film.name);
    const parts = [
      titleWithYear,
      film.rating !== null ? formatStarRating(film.rating) : '',
      film.status === 'watched'
        ? `Watched ${film.lastWatched || ''}`.trim()
        : 'Watchlist',
      film.liked ? 'Liked' : '',
    ].filter(Boolean);
    return `- ${parts.join(' · ')}`;
  });

  return `${yamlLines}\n\n# ${directorName}\n\n${summaryBits.join(' · ')}\n\n## Filmography in Archive\n${lines.join('\n')}\n`;
}

/**
 * Builds the in-memory Obsidian vault map (`Cinema/Films/*.md` and optionally `Cinema/Directors/*.md`).
 * Never generates generic synopses, catch-all Unknown Director hubs, or Vault Index MOCs.
 */
export function buildLetterboxdVaultFiles(
  letterboxdData?: LetterboxdArchiveData | null,
  options: LetterboxdVaultExportOptions = {}
): Map<string, string> {
  const files = new Map<string, string>();
  const vaultRoot = options.vaultRoot ?? 'Cinema';
  const scope = options.scope ?? 'all';
  const includeDirectors = options.includeDirectors ?? true;
  const books = options.books || [];

  const allNormalized = normalizeFilmRecords(letterboxdData, options.filmEnrichmentCache);
  const selectedFilms = filterFilmsByScope(allNormalized, scope);
  if (selectedFilms.length === 0) return files;

  const usedNames = options.sharedUsedNames ? new Set(options.sharedUsedNames) : new Set<string>();
  const directorEntriesMap = new Map<
    string,
    { noteName: string; items: Array<{ film: NormalizedFilmRecord; noteName: string }> }
  >();

  // Pass 1: Claim all film note names first so films never receive secondary disambiguation from directors
  const filmNoteEntries = selectedFilms.map((film) => {
    const rawFilmStem = film.year > 0 ? `${film.name} (${film.year})` : film.name;
    const filmNoteName = claimUniqueNoteName(usedNames, rawFilmStem, '(Film)', 'Film');
    return { film, filmNoteName };
  });

  // Pass 2: Claim director hub note names and link them to each film
  const filmNoteRecords = filmNoteEntries.map(({ film, filmNoteName }) => {
    const directorNoteNames: string[] = [];
    if (includeDirectors && film.directors.length > 0) {
      for (const dirName of film.directors) {
        let dirEntry = directorEntriesMap.get(dirName);
        if (!dirEntry) {
          const dirNoteName = claimUniqueNoteName(usedNames, dirName, '(Director)', 'Director');
          dirEntry = { noteName: dirNoteName, items: [] };
          directorEntriesMap.set(dirName, dirEntry);
        }
        directorEntryPush(dirEntry.items, { film, noteName: filmNoteName });
        directorNoteNames.push(dirEntry.noteName);
      }
    }

    return { film, filmNoteName, directorNoteNames };
  });

  for (const { film, filmNoteName, directorNoteNames } of filmNoteRecords) {
    const adaptedBooks = findMatchingBooksForFilm(film, books, options.bookNoteNamesById);
    const md = generateFilmMarkdownNote(
      film,
      directorNoteNames,
      includeDirectors,
      adaptedBooks
    );
    files.set(`${vaultRoot}/Films/${filmNoteName}.md`, md);
  }

  if (includeDirectors) {
    for (const [directorName, entry] of directorEntriesMap.entries()) {
      if (entry.items.length === 0) continue;
      files.set(
        `${vaultRoot}/Directors/${entry.noteName}.md`,
        generateDirectorHubNote(directorName, entry.items)
      );
    }
  }

  return files;
}

function directorEntryPush(
  items: Array<{ film: NormalizedFilmRecord; noteName: string }>,
  item: { film: NormalizedFilmRecord; noteName: string }
) {
  if (!items.some((x) => x.noteName === item.noteName)) {
    items.push(item);
  }
}

export function filterBooksByObsidianScope(
  books: Book[],
  scope: ObsidianExportScope,
  userState?: UserLocalState
): Book[] {
  if (scope === 'read') return books.filter((b) => b.exclusiveShelf === 'read');
  if (scope === 'annotated') return books.filter((b) => bookHasAnnotations(b, userState));
  return books;
}

/**
 * Builds a single collision-free Obsidian vault containing both Books/Authors (`Ex Libris/`)
 * and Letterboxd Cinema (`Cinema/`) with Book <-> Film wikilinks.
 */
export function buildCombinedObsidianVaultFiles(
  books: Book[],
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap,
  options: CombinedObsidianExportOptions = {}
): Map<string, string> {
  const bookScope = options.bookScope ?? 'all';
  const filteredBooks = filterBooksByObsidianScope(books, bookScope, userState);
  const combined = buildObsidianVaultFiles(filteredBooks, userState, enrichmentCache);

  const sharedUsedNames = new Set<string>();
  const bookNoteNamesById = new Map<string, string>();
  const bookStemByTitleAuthorKey = new Map<string, string>();
  const bookStemByTitleLower = new Map<string, string>();

  const unescapeYamlString = (raw: string): string =>
    raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

  for (const [path, content] of combined.entries()) {
    const fileName = path.split('/').pop() || '';
    const stem = fileName.replace(/\.md$/i, '');
    if (stem) sharedUsedNames.add(stem.toLowerCase());

    if (path.includes('/Books/')) {
      const titleMatch = content.match(/^title:\s*"((?:[^"\\]|\\.)*)"/m);
      const authorMatch = content.match(/^author:\s*"((?:[^"\\]|\\.)*)"/m);
      if (titleMatch?.[1]) {
        const titleLower = unescapeYamlString(titleMatch[1]).toLowerCase();
        if (!bookStemByTitleLower.has(titleLower)) {
          bookStemByTitleLower.set(titleLower, stem);
        }
        if (authorMatch?.[1]) {
          const rawAuthor = unescapeYamlString(authorMatch[1]);
          const authorDisplay = rawAuthor.replace(/^\[\[([^|\]]+\|)?([^\]]+)\]\]$/, '$2').toLowerCase();
          bookStemByTitleAuthorKey.set(`${titleLower}::${authorDisplay}`, stem);
        }
      }
    }
  }

  for (const book of filteredBooks) {
    const titleLower = (book.cleanTitle || book.title || '').toLowerCase();
    const authorLower = (book.author || '').toLowerCase();
    const exactMatch =
      bookStemByTitleAuthorKey.get(`${titleLower}::${authorLower}`) ||
      bookStemByTitleLower.get(titleLower);
    if (exactMatch) {
      bookNoteNamesById.set(book.id, exactMatch);
    }
  }

  const cinemaFiles = buildLetterboxdVaultFiles(userState?.letterboxdData, {
    scope: options.cinemaScope ?? 'all',
    includeDirectors: options.includeDirectors ?? true,
    filmEnrichmentCache: options.filmEnrichmentCache,
    books: filteredBooks,
    bookNoteNamesById,
    vaultRoot: 'Cinema',
    sharedUsedNames,
  });

  for (const [path, content] of cinemaFiles.entries()) {
    combined.set(path, content);
  }

  return combined;
}

async function zipFilesMap(files: Map<string, string>): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of files.entries()) {
    zip.file(path, content);
  }
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function triggerZipDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportLetterboxdVaultZip(
  letterboxdData?: LetterboxdArchiveData | null,
  options: LetterboxdVaultExportOptions = {}
): Promise<Blob> {
  const files = buildLetterboxdVaultFiles(letterboxdData, options);
  return zipFilesMap(files);
}

export async function downloadLetterboxdVault(
  letterboxdData?: LetterboxdArchiveData | null,
  options: LetterboxdVaultExportOptions = {}
): Promise<void> {
  const blob = await exportLetterboxdVaultZip(letterboxdData, options);
  const dateStr = new Date().toISOString().slice(0, 10);
  const scopeLabel = options.scope && options.scope !== 'all' ? `-${options.scope}` : '';
  triggerZipDownload(blob, `letterboxd-obsidian-vault${scopeLabel}-${dateStr}.zip`);
}

export async function exportCombinedObsidianVaultZip(
  books: Book[],
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap,
  options: CombinedObsidianExportOptions = {}
): Promise<Blob> {
  const files = buildCombinedObsidianVaultFiles(books, userState, enrichmentCache, options);
  return zipFilesMap(files);
}

export async function downloadCombinedObsidianVault(
  books: Book[],
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap,
  options: CombinedObsidianExportOptions = {}
): Promise<void> {
  const blob = await exportCombinedObsidianVaultZip(books, userState, enrichmentCache, options);
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerZipDownload(blob, `ex-libris-and-cinema-obsidian-vault-${dateStr}.zip`);
}
