import JSZip from 'jszip';
import Papa from 'papaparse';
import type {
  LetterboxdArchiveData,
  LetterboxdFilmList,
  LetterboxdFilmWatch,
  LetterboxdWatchlistItem,
} from '../../types/library';

export interface LetterboxdRawCsvFiles {
  diaryCsv?: string;
  ratingsCsv?: string;
  reviewsCsv?: string;
  watchedCsv?: string;
  watchlistCsv?: string;
  likesFilmsCsv?: string;
  listCsvs?: string[];
}

export const filmLookupKey = (name: string, year: number): string =>
  `${name.trim().toLowerCase()} (${year || 0})`;

/**
 * Robust RFC-4180 CSV parser powered by PapaParse.
 * Handles multi-line quoted reviews, escaped quotes, trailing delimiters, and strips UTF-8 BOM.
 */
export function parseLetterboxdCsv(csvString: string): Record<string, string>[] {
  if (!csvString || typeof csvString !== 'string') return [];
  const clean = csvString.replace(/^\uFEFF/, '').trim();
  if (!clean) return [];

  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
  });

  if (!parsed.data || parsed.data.length === 0) return [];

  const rows: Record<string, string>[] = [];
  for (const rawRow of parsed.data) {
    if (!rawRow || typeof rawRow !== 'object') continue;
    const cleanedRow: Record<string, string> = {};
    let hasAnyValue = false;
    for (const [rawKey, rawVal] of Object.entries(rawRow)) {
      const k = rawKey.trim();
      if (!k) continue;
      const v = typeof rawVal === 'string' ? rawVal.trim() : String(rawVal ?? '').trim();
      if (v) hasAnyValue = true;
      cleanedRow[k] = v;
    }
    if (hasAnyValue) {
      rows.push(cleanedRow);
    }
  }
  return rows;
}

/**
 * Parses a Letterboxd `lists/*.csv` file (Letterboxd list export v7 format).
 * First section contains list metadata (`Date,Name,Tags,URL,Description`);
 * second section contains items (`Position,Name,Year,URL,Description`).
 */
export function parseLetterboxdListCsv(csvString: string): LetterboxdFilmList | null {
  if (!csvString || typeof csvString !== 'string') return null;
  const clean = csvString.replace(/^\uFEFF/, '').trim();
  if (!clean) return null;

  const parsed = Papa.parse<string[]>(clean, {
    header: false,
    skipEmptyLines: 'greedy',
  });
  const matrix = parsed.data || [];
  let listName = '';
  let listUri = '';
  let listDescription: string | null = null;
  let itemStartIdx = -1;

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i].map((c) => String(c ?? '').trim());
    if (row[0] === 'Date' && row[1] === 'Name' && i + 1 < matrix.length) {
      const metaRow = matrix[i + 1].map((c) => String(c ?? '').trim());
      listName = metaRow[1] || '';
      listUri = metaRow[3] || '';
      listDescription = metaRow[4] || null;
    }
    if (row[0] === 'Position' && row[1] === 'Name') {
      itemStartIdx = i + 1;
      break;
    }
  }

  if (!listName || itemStartIdx < 0) return null;

  const films: LetterboxdFilmList['films'] = [];
  for (let i = itemStartIdx; i < matrix.length; i++) {
    const row = matrix[i].map((c) => String(c ?? '').trim());
    const name = row[1];
    if (!name) continue;
    const year = parseInt(row[2] || '0', 10) || 0;
    const uri = row[3] || '';
    films.push({ name, year, uri });
  }

  return {
    name: listName,
    uri: listUri,
    description: listDescription,
    films,
  };
}

/**
 * Converts a 0.5-5.0 rating into classic letterpress star typography (e.g. 4.5 -> "★★★★½", 5 -> "★★★★★").
 */
export function formatStarRating(rating: number | null): string {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return '—';
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5 ? '½' : '';
  return `${'★'.repeat(fullStars)}${halfStar}`;
}

/**
 * Combines diary, ratings, reviews, watched, watchlist, likes, and lists into an archival Letterboxd dataset.
 */
export function parseLetterboxdExport(files: LetterboxdRawCsvFiles): LetterboxdArchiveData {
  const diaryRows = parseLetterboxdCsv(files.diaryCsv || '');
  const ratingsRows = parseLetterboxdCsv(files.ratingsCsv || '');
  const reviewsRows = parseLetterboxdCsv(files.reviewsCsv || '');
  const watchedRows = parseLetterboxdCsv(files.watchedCsv || '');
  const watchlistRows = parseLetterboxdCsv(files.watchlistCsv || '');
  const likesRows = parseLetterboxdCsv(files.likesFilmsCsv || '');

  // 1. Build Ratings Map: "name (year)" -> rating
  const ratingsMap: Record<string, number> = {};
  for (const r of ratingsRows) {
    const name = r['Name'];
    const yr = parseInt(r['Year'], 10);
    const ratingVal = parseFloat(r['Rating']);
    if (name && !Number.isNaN(ratingVal)) {
      const key = filmLookupKey(name, yr || 0);
      ratingsMap[key] = ratingVal;
    }
  }

  // 2. Build Reviews & Review Metadata Maps: "name (year)" + date-specific attribution
  const reviewsMap: Record<string, string> = {};
  const reviewsByDateMap = new Map<string, string>();
  const datedReviewFilmKeys = new Set<string>();
  const reviewMetaMap = new Map<string, { tags: string[]; uri?: string }>();
  for (const rev of reviewsRows) {
    const name = rev['Name'];
    const yr = parseInt(rev['Year'], 10);
    const text = rev['Review'];
    if (name) {
      const key = filmLookupKey(name, yr || 0);
      const revDate = (rev['Watched Date'] || rev['Date'] || '').slice(0, 10);
      if (text) {
        reviewsMap[key] = text;
        if (revDate) {
          reviewsByDateMap.set(`${key}-${revDate}`, text);
          datedReviewFilmKeys.add(key);
        }
      }
      const revTags = rev['Tags'] ? rev['Tags'].split(',').map((t) => t.trim()).filter(Boolean) : [];
      if (revTags.length > 0 || rev['Letterboxd URI']) {
        reviewMetaMap.set(key, { tags: revTags, uri: rev['Letterboxd URI'] || undefined });
      }
    }
  }

  // 2B. Build Likes Set & Lists Map
  const likedKeys = new Set<string>();
  for (const lk of likesRows) {
    const name = lk['Name'];
    if (!name) continue;
    const yr = parseInt(lk['Year'], 10) || 0;
    likedKeys.add(filmLookupKey(name, yr));
  }

  const parsedLists: LetterboxdFilmList[] = [];
  const seenListKeys = new Set<string>();
  const listsByFilm = new Map<string, string[]>();
  for (const listCsv of files.listCsvs || []) {
    const parsedList = parseLetterboxdListCsv(listCsv);
    if (!parsedList) continue;
    const dedupeId = (parsedList.uri || parsedList.name).toLowerCase();
    if (seenListKeys.has(dedupeId)) continue;
    seenListKeys.add(dedupeId);
    parsedLists.push(parsedList);
    for (const item of parsedList.films) {
      const k = filmLookupKey(item.name, item.year);
      const arr = listsByFilm.get(k) || [];
      if (!arr.includes(parsedList.name)) arr.push(parsedList.name);
      listsByFilm.set(k, arr);
    }
  }

  const watches: LetterboxdFilmWatch[] = [];
  const processedKeys = new Set<string>();

  // 3. Process Diary entries (high precision dated watches)
  for (const d of diaryRows) {
    const name = d['Name'];
    if (!name) continue;
    const year = parseInt(d['Year'], 10) || 0;
    const uri = d['Letterboxd URI'] || '';
    const date = (d['Watched Date'] || d['Date'] || '').slice(0, 10);
    if (!date) continue;

    const ratingRaw = parseFloat(d['Rating']);
    const lookupKey = filmLookupKey(name, year);
    const rating = !Number.isNaN(ratingRaw) ? ratingRaw : ratingsMap[lookupKey] ?? null;

    const rewatch = (d['Rewatch'] || '').toLowerCase() === 'yes';
    const review =
      reviewsByDateMap.get(`${lookupKey}-${date}`) ||
      (!datedReviewFilmKeys.has(lookupKey) ? reviewsMap[lookupKey] : undefined) ||
      d['Review'] ||
      null;
    const diaryTags = d['Tags'] ? d['Tags'].split(',').map((t) => t.trim()).filter(Boolean) : [];
    const revTags = reviewMetaMap.get(lookupKey)?.tags || [];
    const tags = Array.from(new Set([...diaryTags, ...revTags]));
    const lists = listsByFilm.get(lookupKey);

    const watchId = `diary-${name}-${year}-${date}-${watches.length}`;
    processedKeys.add(`${lookupKey}-${date}`);

    watches.push({
      id: watchId,
      name,
      year,
      uri,
      rating,
      rewatch,
      date,
      review,
      tags,
      liked: likedKeys.has(lookupKey),
      lists: lists && lists.length > 0 ? [...lists] : undefined,
      source: 'diary',
    });
  }

  // 4. Process Reviews entries not captured in diary
  for (const r of reviewsRows) {
    const name = r['Name'];
    if (!name) continue;
    const year = parseInt(r['Year'], 10) || 0;
    const uri = r['Letterboxd URI'] || '';
    const watchedDate = (r['Watched Date'] || '').slice(0, 10);
    const loggedDate = (r['Date'] || '').slice(0, 10);
    const date = watchedDate || loggedDate;
    if (!date) continue;

    const lookupKey = filmLookupKey(name, year);
    if (processedKeys.has(`${lookupKey}-${date}`)) continue;
    // If review omitted Watched Date and already enriched a diary entry for the same film, avoid creating a bogus watch
    if (!watchedDate && watches.some((wt) => filmLookupKey(wt.name, wt.year) === lookupKey)) continue;

    const ratingRaw = parseFloat(r['Rating']);
    const rating = !Number.isNaN(ratingRaw) ? ratingRaw : ratingsMap[lookupKey] ?? null;
    const rewatch = (r['Rewatch'] || '').toLowerCase() === 'yes';
    const review = r['Review'] || null;
    const tags = r['Tags'] ? r['Tags'].split(',').map((t) => t.trim()).filter(Boolean) : [];
    const lists = listsByFilm.get(lookupKey);

    watches.push({
      id: `review-${name}-${year}-${date}-${watches.length}`,
      name,
      year,
      uri,
      rating,
      rewatch,
      date,
      review,
      tags,
      liked: likedKeys.has(lookupKey),
      lists: lists && lists.length > 0 ? [...lists] : undefined,
      source: 'review',
    });
    processedKeys.add(`${lookupKey}-${date}`);
  }

  // 5. Process Watched entries not captured in diary or reviews
  for (const w of watchedRows) {
    const name = w['Name'];
    if (!name) continue;
    const year = parseInt(w['Year'], 10) || 0;
    const uri = w['Letterboxd URI'] || '';
    const date = (w['Date'] || '').slice(0, 10);

    const lookupKey = filmLookupKey(name, year);
    const alreadyLogged = watches.some((wt) => filmLookupKey(wt.name, wt.year) === lookupKey);
    if (alreadyLogged) continue;

    const rating = ratingsMap[lookupKey] ?? null;
    const lists = listsByFilm.get(lookupKey);

    watches.push({
      id: `watched-${name}-${year}-${date}-${watches.length}`,
      name,
      year,
      uri,
      rating,
      rewatch: false,
      date: date || '2025-01-01',
      review: reviewsMap[lookupKey] || null,
      liked: likedKeys.has(lookupKey),
      lists: lists && lists.length > 0 ? [...lists] : undefined,
      source: 'watched',
    });
  }

  // 5B. Process Ratings entries not captured in diary, reviews, or watched
  for (const rt of ratingsRows) {
    const name = rt['Name'];
    if (!name) continue;
    const year = parseInt(rt['Year'], 10) || 0;
    const uri = rt['Letterboxd URI'] || '';
    const date = (rt['Date'] || '').slice(0, 10);

    const lookupKey = filmLookupKey(name, year);
    const alreadyLogged = watches.some((wt) => filmLookupKey(wt.name, wt.year) === lookupKey);
    if (alreadyLogged) continue;

    const ratingRaw = parseFloat(rt['Rating']);
    const rating = !Number.isNaN(ratingRaw) ? ratingRaw : null;
    const lists = listsByFilm.get(lookupKey);

    watches.push({
      id: `rating-${name}-${year}-${date}-${watches.length}`,
      name,
      year,
      uri,
      rating,
      rewatch: false,
      date: date || '2025-01-01',
      review: reviewsMap[lookupKey] || null,
      liked: likedKeys.has(lookupKey),
      lists: lists && lists.length > 0 ? [...lists] : undefined,
      source: 'watched',
    });
  }

  // Sort watches: most recent date descending
  watches.sort((a, b) => b.date.localeCompare(a.date));

  // 6. Process Watchlist
  const watchlist: LetterboxdWatchlistItem[] = [];
  for (const wl of watchlistRows) {
    const name = wl['Name'];
    if (!name) continue;
    const year = parseInt(wl['Year'], 10) || 0;
    const uri = wl['Letterboxd URI'] || '';
    const dateAdded = (wl['Date'] || '').slice(0, 10);
    watchlist.push({
      name,
      year,
      uri,
      dateAdded,
    });
  }

  return {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    totalWatchedCount: watchedRows.length || watches.length,
    totalDiaryCount: diaryRows.length,
    totalReviewsCount: reviewsRows.length,
    totalWatchlistCount: watchlist.length,
    watches,
    ratingsMap,
    reviewsMap,
    watchlist,
    likedFilms: Array.from(likedKeys).sort(),
    lists: parsedLists,
  };
}

/**
 * Checks if a file or CSV contents belong to a Letterboxd export.
 */
export function isLetterboxdCsv(fileName: string, text: string): boolean {
  const lowerName = fileName.toLowerCase();
  if (
    lowerName === 'diary.csv' ||
    lowerName === 'ratings.csv' ||
    lowerName === 'reviews.csv' ||
    lowerName === 'watched.csv' ||
    lowerName === 'watchlist.csv' ||
    lowerName === 'films.csv' ||
    lowerName.includes('letterboxd')
  ) {
    return true;
  }
  const firstLine = text.slice(0, 400).toLowerCase();
  return (
    firstLine.includes('letterboxd uri') ||
    firstLine.includes('watched date') ||
    (firstLine.includes('position,name,year') && firstLine.includes('url'))
  );
}

/**
 * Checks if a zip archive contains Letterboxd export CSVs.
 */
export async function isLetterboxdZip(file: File): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(file);
    const names = Object.keys(zip.files).map((n) => n.toLowerCase());
    return names.some((n) => n.endsWith('watched.csv') || n.endsWith('diary.csv') || n.endsWith('ratings.csv'));
  } catch {
    return false;
  }
}

/**
 * Parses a zipped Letterboxd export (e.g. letterboxd-username-YYYY-MM-DD.zip).
 */
export async function importLetterboxdZip(file: File): Promise<LetterboxdArchiveData> {
  const zip = await JSZip.loadAsync(file);
  const rawFiles: LetterboxdRawCsvFiles = { listCsvs: [] };

  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
    // Skip deleted/ and orphaned/ archival folders inside Letterboxd exports
    if (/(^|\/)(deleted|orphaned)\//.test(normalized)) continue;

    if (/(^|\/)likes\/films\.csv$/.test(normalized)) {
      rawFiles.likesFilmsCsv = await zipEntry.async('string');
    } else if (/(^|\/)lists\/[^/]+\.csv$/.test(normalized)) {
      rawFiles.listCsvs!.push(await zipEntry.async('string'));
    } else if (/(^|\/)diary\.csv$/.test(normalized)) {
      rawFiles.diaryCsv = await zipEntry.async('string');
    } else if (/(^|\/)ratings\.csv$/.test(normalized)) {
      rawFiles.ratingsCsv = await zipEntry.async('string');
    } else if (/(^|\/)reviews\.csv$/.test(normalized)) {
      rawFiles.reviewsCsv = await zipEntry.async('string');
    } else if (/(^|\/)watched\.csv$/.test(normalized)) {
      rawFiles.watchedCsv = await zipEntry.async('string');
    } else if (/(^|\/)watchlist\.csv$/.test(normalized)) {
      rawFiles.watchlistCsv = await zipEntry.async('string');
    }
  }

  return parseLetterboxdExport(rawFiles);
}

/**
 * Ingests a single Letterboxd CSV file (e.g. diary.csv, watched.csv, ratings.csv, reviews.csv, watchlist.csv,
 * likes/films.csv, or lists/*.csv) and merges it with an existing Letterboxd archive state.
 */
export function mergeSingleLetterboxdCsv(
  fileName: string,
  csvText: string,
  existingData?: LetterboxdArchiveData | null
): LetterboxdArchiveData {
  const lowerName = fileName.toLowerCase();
  const sample = csvText.slice(0, 400).toLowerCase();
  const raw: LetterboxdRawCsvFiles = {};
  if (lowerName.includes('diary')) raw.diaryCsv = csvText;
  else if (lowerName.includes('rating')) raw.ratingsCsv = csvText;
  else if (lowerName.includes('review')) raw.reviewsCsv = csvText;
  else if (lowerName.includes('watchlist')) raw.watchlistCsv = csvText;
  else if (lowerName.includes('like') || lowerName === 'films.csv') raw.likesFilmsCsv = csvText;
  else if (lowerName.includes('list') || (sample.includes('position,name,year') && sample.includes('url'))) {
    raw.listCsvs = [csvText];
  } else raw.watchedCsv = csvText;

  const newlyParsed = parseLetterboxdExport(raw);
  if (!existingData) return newlyParsed;

  const mergedLikedSet = new Set<string>([
    ...(existingData.likedFilms || []),
    ...(newlyParsed.likedFilms || []),
  ]);

  const listMap = new Map<string, LetterboxdFilmList>();
  for (const lst of existingData.lists || []) {
    listMap.set((lst.uri || lst.name).toLowerCase(), lst);
  }
  for (const lst of newlyParsed.lists || []) {
    listMap.set((lst.uri || lst.name).toLowerCase(), lst);
  }
  const mergedLists = Array.from(listMap.values());
  const listsByFilm = new Map<string, string[]>();
  for (const lst of mergedLists) {
    for (const item of lst.films) {
      const k = filmLookupKey(item.name, item.year);
      const arr = listsByFilm.get(k) || [];
      if (!arr.includes(lst.name)) arr.push(lst.name);
      listsByFilm.set(k, arr);
    }
  }

  // Merge watches
  const watchMap = new Map<string, LetterboxdFilmWatch>();
  for (const w of existingData.watches || []) {
    const key = `${w.name.toLowerCase()}_${w.year}_${w.date}`;
    watchMap.set(key, w);
  }
  for (const w of newlyParsed.watches || []) {
    const key = `${w.name.toLowerCase()}_${w.year}_${w.date}`;
    const prev = watchMap.get(key);
    if (prev) {
      watchMap.set(key, {
        ...prev,
        ...w,
        rating: w.rating ?? prev.rating,
        review: w.review ?? prev.review,
        liked: w.liked || prev.liked,
        tags: Array.from(new Set([...(prev.tags || []), ...(w.tags || [])])),
      });
    } else {
      watchMap.set(key, w);
    }
  }

  const mergedWatches = Array.from(watchMap.values())
    .map((w) => {
      const lk = filmLookupKey(w.name, w.year);
      const filmLists = listsByFilm.get(lk);
      return {
        ...w,
        liked: Boolean(w.liked || mergedLikedSet.has(lk)),
        lists: filmLists && filmLists.length > 0 ? filmLists : w.lists,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    totalWatchedCount: Math.max(existingData.totalWatchedCount, newlyParsed.totalWatchedCount, mergedWatches.length),
    totalDiaryCount: Math.max(existingData.totalDiaryCount, newlyParsed.totalDiaryCount),
    totalReviewsCount: Math.max(existingData.totalReviewsCount, newlyParsed.totalReviewsCount),
    totalWatchlistCount: Math.max(existingData.totalWatchlistCount, newlyParsed.totalWatchlistCount),
    watches: mergedWatches,
    ratingsMap: { ...(existingData.ratingsMap || {}), ...(newlyParsed.ratingsMap || {}) },
    reviewsMap: { ...(existingData.reviewsMap || {}), ...(newlyParsed.reviewsMap || {}) },
    watchlist: newlyParsed.watchlist.length > 0 ? newlyParsed.watchlist : (existingData.watchlist || []),
    likedFilms: Array.from(mergedLikedSet).sort(),
    lists: mergedLists,
  };
}
