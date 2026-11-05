import JSZip from 'jszip';
import type {
  LetterboxdArchiveData,
  LetterboxdFilmWatch,
  LetterboxdWatchlistItem,
} from '../../types/library';

export interface LetterboxdRawCsvFiles {
  diaryCsv?: string;
  ratingsCsv?: string;
  reviewsCsv?: string;
  watchedCsv?: string;
  watchlistCsv?: string;
}

/**
 * Robust CSV parser that handles quotes, escaped commas, newlines, and strips UTF-8 BOM.
 */
export function parseLetterboxdCsv(csvString: string): Record<string, string>[] {
  if (!csvString || typeof csvString !== 'string') return [];
  const clean = csvString.replace(/^\uFEFF/, '').trim();
  if (!clean) return [];

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0];
  const headers: string[] = [];
  let inQuotes = false;
  let currentToken = '';

  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      headers.push(currentToken.trim());
      currentToken = '';
    } else {
      currentToken += ch;
    }
  }
  headers.push(currentToken.trim());

  const rows: Record<string, string>[] = [];

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r];
    const cells: string[] = [];
    inQuotes = false;
    currentToken = '';

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cells.push(currentToken.trim());
        currentToken = '';
      } else {
        currentToken += ch;
      }
    }
    cells.push(currentToken.trim());

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      let val = cells[idx] !== undefined ? cells[idx].trim() : '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"').trim();
      }
      rowObj[h] = val;
    });
    rows.push(rowObj);
  }

  return rows;
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
 * Combines diary, ratings, reviews, watched, and watchlist into an archival Letterboxd dataset.
 */
export function parseLetterboxdExport(files: LetterboxdRawCsvFiles): LetterboxdArchiveData {
  const diaryRows = parseLetterboxdCsv(files.diaryCsv || '');
  const ratingsRows = parseLetterboxdCsv(files.ratingsCsv || '');
  const reviewsRows = parseLetterboxdCsv(files.reviewsCsv || '');
  const watchedRows = parseLetterboxdCsv(files.watchedCsv || '');
  const watchlistRows = parseLetterboxdCsv(files.watchlistCsv || '');

  // 1. Build Ratings Map: "Name (Year)" -> rating
  const ratingsMap: Record<string, number> = {};
  for (const r of ratingsRows) {
    const name = r['Name'];
    const yr = parseInt(r['Year'], 10);
    const ratingVal = parseFloat(r['Rating']);
    if (name && !Number.isNaN(ratingVal)) {
      const key = `${name.toLowerCase()} (${yr || 0})`;
      ratingsMap[key] = ratingVal;
    }
  }

  // 2. Build Reviews Map: "Name (Year) [Watched Date]" -> review text
  const reviewsMap: Record<string, string> = {};
  for (const rev of reviewsRows) {
    const name = rev['Name'];
    const yr = parseInt(rev['Year'], 10);
    const text = rev['Review'];
    if (name && text) {
      const key = `${name.toLowerCase()} (${yr || 0})`;
      reviewsMap[key] = text;
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
    const lookupKey = `${name.toLowerCase()} (${year})`;
    const rating = !Number.isNaN(ratingRaw) ? ratingRaw : ratingsMap[lookupKey] ?? null;

    const rewatch = (d['Rewatch'] || '').toLowerCase() === 'yes';
    const review = reviewsMap[lookupKey] || (d['Review'] || null);
    const tags = d['Tags'] ? d['Tags'].split(',').map((t) => t.trim()).filter(Boolean) : [];

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
      source: 'diary',
    });
  }

  // 4. Process Reviews entries not captured in diary
  for (const r of reviewsRows) {
    const name = r['Name'];
    if (!name) continue;
    const year = parseInt(r['Year'], 10) || 0;
    const uri = r['Letterboxd URI'] || '';
    const date = (r['Watched Date'] || r['Date'] || '').slice(0, 10);
    if (!date) continue;

    const lookupKey = `${name.toLowerCase()} (${year})`;
    if (processedKeys.has(`${lookupKey}-${date}`)) continue;

    const ratingRaw = parseFloat(r['Rating']);
    const rating = !Number.isNaN(ratingRaw) ? ratingRaw : ratingsMap[lookupKey] ?? null;
    const rewatch = (r['Rewatch'] || '').toLowerCase() === 'yes';
    const review = r['Review'] || null;

    watches.push({
      id: `review-${name}-${year}-${date}-${watches.length}`,
      name,
      year,
      uri,
      rating,
      rewatch,
      date,
      review,
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

    const lookupKey = `${name.toLowerCase()} (${year})`;
    // If we already have a watch record for this movie, skip duplicate generic logged watch
    const alreadyLogged = watches.some((wt) => wt.name.toLowerCase() === name.toLowerCase() && wt.year === year);
    if (alreadyLogged) continue;

    const rating = ratingsMap[lookupKey] ?? null;

    watches.push({
      id: `watched-${name}-${year}-${date}-${watches.length}`,
      name,
      year,
      uri,
      rating,
      rewatch: false,
      date: date || '2025-01-01',
      review: reviewsMap[lookupKey] || null,
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

    const lookupKey = `${name.toLowerCase()} (${year})`;
    const alreadyLogged = watches.some((wt) => wt.name.toLowerCase() === name.toLowerCase() && wt.year === year);
    if (alreadyLogged) continue;

    const ratingRaw = parseFloat(rt['Rating']);
    const rating = !Number.isNaN(ratingRaw) ? ratingRaw : null;

    watches.push({
      id: `rating-${name}-${year}-${date}-${watches.length}`,
      name,
      year,
      uri,
      rating,
      rewatch: false,
      date: date || '2025-01-01',
      review: reviewsMap[lookupKey] || null,
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
    lowerName.includes('letterboxd')
  ) {
    return true;
  }
  const firstLine = text.slice(0, 300).toLowerCase();
  return firstLine.includes('letterboxd uri') || firstLine.includes('watched date');
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
  const rawFiles: LetterboxdRawCsvFiles = {};

  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const lower = relativePath.toLowerCase();
    if (lower.endsWith('diary.csv')) {
      rawFiles.diaryCsv = await zipEntry.async('string');
    } else if (lower.endsWith('ratings.csv')) {
      rawFiles.ratingsCsv = await zipEntry.async('string');
    } else if (lower.endsWith('reviews.csv')) {
      rawFiles.reviewsCsv = await zipEntry.async('string');
    } else if (lower.endsWith('watched.csv')) {
      rawFiles.watchedCsv = await zipEntry.async('string');
    } else if (lower.endsWith('watchlist.csv')) {
      rawFiles.watchlistCsv = await zipEntry.async('string');
    }
  }

  return parseLetterboxdExport(rawFiles);
}

/**
 * Ingests a single Letterboxd CSV file (e.g. diary.csv, watched.csv, ratings.csv, reviews.csv, or watchlist.csv)
 * and merges it with an existing Letterboxd archive state.
 */
export function mergeSingleLetterboxdCsv(
  fileName: string,
  csvText: string,
  existingData?: LetterboxdArchiveData | null
): LetterboxdArchiveData {
  const lowerName = fileName.toLowerCase();
  const raw: LetterboxdRawCsvFiles = {};
  if (lowerName.includes('diary')) raw.diaryCsv = csvText;
  else if (lowerName.includes('rating')) raw.ratingsCsv = csvText;
  else if (lowerName.includes('review')) raw.reviewsCsv = csvText;
  else if (lowerName.includes('watchlist')) raw.watchlistCsv = csvText;
  else raw.watchedCsv = csvText;

  const newlyParsed = parseLetterboxdExport(raw);
  if (!existingData) return newlyParsed;

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
      watchMap.set(key, { ...prev, ...w, rating: w.rating ?? prev.rating, review: w.review ?? prev.review });
    } else {
      watchMap.set(key, w);
    }
  }

  const mergedWatches = Array.from(watchMap.values()).sort((a, b) => b.date.localeCompare(a.date));

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
  };
}
