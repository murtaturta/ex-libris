import Papa from 'papaparse';
import type {
  Book,
  ExclusiveShelf,
  LibraryBundle,
  SummaryStats,
} from '../../types/library';
import { extractSeriesFromTitle, sanitizeIsbn } from '../formatters';

/**
 * Normalizes date strings from Goodreads 'YYYY/MM/DD' to standard ISO 'YYYY-MM-DD'.
 */
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const y = slashMatch[1];
    const m = slashMatch[2].padStart(2, '0');
    const d = slashMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const dashMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch) {
    const y = dashMatch[1];
    const m = dashMatch[2].padStart(2, '0');
    const d = dashMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

/**
 * Normalizes user and community ratings:
 * Maps 0 or values <= 0 to null (Goodreads uses 0 for unrated books).
 */
function parseRating(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.trim());
  if (Number.isNaN(n) || n <= 0) {
    return null;
  }
  return n;
}

/**
 * Parses page counts: numbers <= 0 are treated as missing (null).
 */
function parsePageCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.trim(), 10);
  if (Number.isNaN(n) || n <= 0) {
    return null;
  }
  return n;
}

/**
 * Parses signed publication year (supports BCE dates like -400 or -800).
 * Falls back to Year Published if Original Publication Year is empty or 0.
 */
function parsePublicationYear(
  rawOrig: string | null | undefined,
  rawPub: string | null | undefined
): number | null {
  if (rawOrig !== undefined && rawOrig !== null && rawOrig.trim() !== '') {
    const parsed = parseInt(rawOrig.trim(), 10);
    if (!Number.isNaN(parsed) && parsed !== 0) {
      return parsed;
    }
  }

  if (rawPub !== undefined && rawPub !== null && rawPub.trim() !== '') {
    const parsed = parseInt(rawPub.trim(), 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

/**
 * Normalizes exclusive shelf names, mapping abbreviations like 'dnf' to 'did-not-finish'.
 */
function normalizeExclusiveShelf(raw: string | null | undefined): ExclusiveShelf {
  if (!raw) return 'to-read';
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'dnf' || trimmed === 'abandoned') {
    return 'did-not-finish';
  }
  return trimmed;
}

/**
 * Parses comma-separated user bookshelves.
 */
function parseBookshelves(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Parses 23 or 24 column Goodreads CSV exports into strongly-typed Book records.
 */
export function parseGoodreadsCsv(csvText: string): Book[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  const books: Book[] = [];

  for (const row of result.data) {
    const id = row['Book Id']?.trim() ?? '';
    const title = row['Title']?.trim() ?? '';
    if (!id && !title) continue;

    const { cleanTitle, seriesName, seriesNumber } = extractSeriesFromTitle(title);
    const author = row['Author']?.replace(/\s+/g, ' ').trim() ?? '';
    const authorSort = row['Author l-f']?.replace(/\s+/g, ' ').trim() || null;
    const additionalAuthors = row['Additional Authors']
      ? row['Additional Authors'].split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const isbn = sanitizeIsbn(row['ISBN']);
    const isbn13 = sanitizeIsbn(row['ISBN13']);

    const myRating = parseRating(row['My Rating']);
    const averageRating = row['Average Rating'] ? parseRating(row['Average Rating']) : null;

    const publisher = row['Publisher']?.trim() || null;
    const binding = row['Binding']?.trim() || null;
    const pageCount = parsePageCount(row['Number of Pages']);

    const rawPubYear = row['Year Published'];
    const pubYearParsed = rawPubYear ? parseInt(rawPubYear.trim(), 10) : null;
    const yearPublished =
      pubYearParsed && !Number.isNaN(pubYearParsed) && pubYearParsed > 0 ? pubYearParsed : null;

    const originalPublicationYear = parsePublicationYear(row['Original Publication Year'], rawPubYear);

    const dateRead = normalizeDate(row['Date Read']);
    const dateAdded = normalizeDate(row['Date Added']);

    const exclusiveShelf = normalizeExclusiveShelf(row['Exclusive Shelf']);
    const bookshelves = parseBookshelves(row['Bookshelves']);
    const bookshelvesWithPositions = row['Bookshelves with positions']?.trim() || null;

    const rawReadCount = parseInt(row['Read Count'] ?? '', 10);
    const readCount =
      !Number.isNaN(rawReadCount) && rawReadCount >= 0
        ? rawReadCount
        : exclusiveShelf === 'read'
        ? 1
        : 0;

    const ownedRaw = row['Owned Copies'];
    const ownedCopies = ownedRaw ? Math.max(0, parseInt(ownedRaw.trim(), 10) || 0) : 0;

    const myReview = row['My Review'] ? row['My Review'].trim() || null : null;
    const spoiler = row['Spoiler'] === 'true' || row['Spoiler'] === '1';
    const privateNotes = row['Private Notes'] ? row['Private Notes'].trim() || null : null;

    books.push({
      id,
      title,
      cleanTitle,
      seriesName,
      seriesNumber,
      author,
      authorSort,
      additionalAuthors,
      isbn,
      isbn13,
      myRating,
      averageRating,
      publisher,
      binding,
      pageCount,
      yearPublished,
      originalPublicationYear,
      dateRead,
      dateAdded,
      exclusiveShelf,
      bookshelves,
      bookshelvesWithPositions,
      readCount,
      ownedCopies,
      myReview,
      spoiler,
      privateNotes,
      shelving: null,
      reviewDetails: null,
      readingSessions: [],
      kindleNotes: [],
      recommendations: [],
    });
  }

  return books;
}

/**
 * Recomputes library aggregate statistics across all books.
 */
export function calculateSummaryStats(books: Book[], baseBundle?: LibraryBundle): SummaryStats {
  const totalBooks = books.length;

  const distinctAuthors = new Set(
    books.map(b => b.author.trim().toLowerCase()).filter(Boolean)
  ).size;

  const booksWithSeries = books.filter(b => Boolean(b.seriesName)).length;

  const shelves = {
    read: books.filter(b => b.exclusiveShelf === 'read').length,
    toRead: books.filter(b => b.exclusiveShelf === 'to-read').length,
    currentlyReading: books.filter(b => b.exclusiveShelf === 'currently-reading').length,
    didNotFinish: books.filter(
      b => b.exclusiveShelf === 'did-not-finish' || b.exclusiveShelf === 'dnf'
    ).length,
  };

  const ratedBooks = books.filter(
    b => b.myRating !== null && b.myRating >= 1 && b.myRating <= 5
  );
  const ratedCount = ratedBooks.length;
  const unratedCount = totalBooks - ratedCount;

  let averageRating: number | null = null;
  if (ratedCount > 0) {
    const sum = ratedBooks.reduce((acc, b) => acc + (b.myRating ?? 0), 0);
    averageRating = Number((sum / ratedCount).toFixed(2));
  }

  const distribution: Record<string, number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };
  for (const b of ratedBooks) {
    const star = String(Math.round(b.myRating!));
    if (distribution[star] !== undefined) {
      distribution[star]++;
    }
  }

  const booksWithPages = books.filter(b => b.pageCount !== null && b.pageCount > 0);
  const booksWithPagesCount = booksWithPages.length;
  const booksWithoutPagesCount = totalBooks - booksWithPagesCount;

  const totalPagesRead = books
    .filter(b => b.exclusiveShelf === 'read' && b.pageCount !== null && b.pageCount > 0)
    .reduce((acc, b) => acc + (b.pageCount ?? 0), 0);

  const totalLibraryPages = booksWithPages.reduce(
    (acc, b) => acc + (b.pageCount ?? 0),
    0
  );

  return {
    totalBooks,
    distinctAuthors,
    booksWithSeries,
    shelves,
    ratings: {
      ratedCount,
      unratedCount,
      averageRating,
      distribution,
    },
    pages: {
      totalPagesRead,
      totalLibraryPages,
      booksWithPagesCount,
      booksWithoutPagesCount,
    },
    reconciliationCoverage: baseBundle?.summaryStats.reconciliationCoverage,
    enrichmentCounts: baseBundle?.summaryStats.enrichmentCounts,
  };
}

/**
 * Non-destructively merges incoming CSV books into an existing LibraryBundle.
 * Resolves books by Goodreads ID or clean title.
 * Strictly preserves existing readingSessions, kindleNotes, recommendations,
 * shelving, and reviewDetails, and recalculates summaryStats.
 */
export function mergeBooksIntoBundle(
  existing: LibraryBundle,
  incomingBooks: Book[]
): LibraryBundle {
  const existingBooks = [...existing.books];
  const bookIndexById = new Map<string, number>();
  const bookIndexByTitle = new Map<string, number>();

  existingBooks.forEach((b, idx) => {
    if (b.id) bookIndexById.set(b.id, idx);
    const key = b.cleanTitle.trim().toLowerCase();
    if (key) bookIndexByTitle.set(key, idx);
  });

  for (const incoming of incomingBooks) {
    let targetIndex: number | undefined;

    if (incoming.id && bookIndexById.has(incoming.id)) {
      targetIndex = bookIndexById.get(incoming.id);
    } else {
      const titleKey = incoming.cleanTitle.trim().toLowerCase();
      if (titleKey && bookIndexByTitle.has(titleKey)) {
        targetIndex = bookIndexByTitle.get(titleKey);
      }
    }

    if (targetIndex !== undefined) {
      const prev = existingBooks[targetIndex];

      // Non-destructively merge: update bibliographic details while preserving attachments
      const merged: Book = {
        ...prev,
        title: incoming.title || prev.title,
        cleanTitle: incoming.cleanTitle || prev.cleanTitle,
        seriesName: incoming.seriesName ?? prev.seriesName,
        seriesNumber: incoming.seriesNumber ?? prev.seriesNumber,
        author: incoming.author || prev.author,
        authorSort: incoming.authorSort ?? prev.authorSort,
        additionalAuthors:
          incoming.additionalAuthors.length > 0 ? incoming.additionalAuthors : prev.additionalAuthors,
        isbn: incoming.isbn ?? prev.isbn,
        isbn13: incoming.isbn13 ?? prev.isbn13,
        // Preserve local rating if incoming is unrated (null)
        myRating: incoming.myRating !== null ? incoming.myRating : prev.myRating,
        averageRating: incoming.averageRating !== null ? incoming.averageRating : prev.averageRating,
        publisher: incoming.publisher ?? prev.publisher,
        binding: incoming.binding ?? prev.binding,
        pageCount: incoming.pageCount !== null ? incoming.pageCount : prev.pageCount,
        yearPublished: incoming.yearPublished ?? prev.yearPublished,
        originalPublicationYear:
          incoming.originalPublicationYear ?? prev.originalPublicationYear,
        dateRead: incoming.dateRead ?? prev.dateRead,
        dateAdded: incoming.dateAdded ?? prev.dateAdded,
        exclusiveShelf: incoming.exclusiveShelf ?? prev.exclusiveShelf,
        bookshelves: incoming.bookshelves.length > 0 ? incoming.bookshelves : prev.bookshelves,
        bookshelvesWithPositions:
          incoming.bookshelvesWithPositions ?? prev.bookshelvesWithPositions,
        readCount: Math.max(incoming.readCount, prev.readCount),
        ownedCopies: Math.max(incoming.ownedCopies, prev.ownedCopies),
        myReview: incoming.myReview ?? prev.myReview,
        spoiler: incoming.spoiler || prev.spoiler,
        privateNotes: incoming.privateNotes ?? prev.privateNotes,

        // STRICT PRESERVATION of rich relational records
        shelving: prev.shelving ?? incoming.shelving,
        reviewDetails: prev.reviewDetails ?? incoming.reviewDetails,
        readingSessions:
          prev.readingSessions && prev.readingSessions.length > 0
            ? prev.readingSessions
            : incoming.readingSessions,
        kindleNotes:
          prev.kindleNotes && prev.kindleNotes.length > 0
            ? prev.kindleNotes
            : incoming.kindleNotes,
        recommendations:
          prev.recommendations && prev.recommendations.length > 0
            ? prev.recommendations
            : incoming.recommendations,
      };

      existingBooks[targetIndex] = merged;
    } else {
      // New incoming book record
      const newIndex = existingBooks.length;
      existingBooks.push(incoming);
      if (incoming.id) bookIndexById.set(incoming.id, newIndex);
      const titleKey = incoming.cleanTitle.trim().toLowerCase();
      if (titleKey) bookIndexByTitle.set(titleKey, newIndex);
    }
  }

  const summaryStats = calculateSummaryStats(existingBooks, existing);

  return {
    ...existing,
    generatedAt: new Date().toISOString(),
    books: existingBooks,
    summaryStats,
  };
}
