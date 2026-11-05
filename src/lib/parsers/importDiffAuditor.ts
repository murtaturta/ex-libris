import type {
  LibraryBundle,
  Book,
  SummaryStats,
  KindleClipping,
  UserLocalState,
} from '../../types/library';

export interface ShelfTransitionDiff {
  bookId: string;
  title: string;
  author: string;
  fromShelf: string;
  toShelf: string;
}

export interface RatingChangeDiff {
  bookId: string;
  title: string;
  fromRating: number | null;
  toRating: number | null;
}

export interface LibraryImportDiffReport {
  incomingTotal: number;
  existingTotal: number;
  addedBooks: Array<{ id: string; title: string; author: string; shelf: string }>;
  unchangedCount: number;
  shelfTransitions: ShelfTransitionDiff[];
  ratingChanges: RatingChangeDiff[];
  newReviewsCount: number;
  preservedOverridesCount: number;
  preservedOverrideDetails: Array<{
    bookId: string;
    title: string;
    preservedFields: string[]; // e.g. ['originalLanguageOverride', 'localNotes', 'progressLogs']
  }>;
  missingInIncomingCount: number; // existing books NOT in the new export that non-destructive merge keeps safe!
}

export interface ClippingsImportDiffReport {
  sourceFormat: 'clippings-txt' | 'notebook-html' | 'mixed';
  incomingTotal: number;
  existingTotal: number;
  newClippingsCount: number;
  duplicateSkippedCount: number;
  matchedBooksCount: number;
  chaptersDetectedCount: number;
  colorBreakdown: Record<string, number>;
  sampleNewTitles: string[];
}

/**
 * Normalizes book title and author for robust fuzzy / canonical matching.
 */
function getBookMatchKey(book: Pick<Book, 'id' | 'isbn13' | 'isbn' | 'cleanTitle' | 'title' | 'author'>): string {
  if (book.id && book.id.trim() && !book.id.startsWith('zip-')) {
    return `id:${book.id.trim()}`;
  }
  if (book.isbn13 && book.isbn13.trim()) {
    return `isbn13:${book.isbn13.trim()}`;
  }
  if (book.isbn && book.isbn.trim()) {
    return `isbn:${book.isbn.trim()}`;
  }
  const title = (book.cleanTitle || book.title || '').toLowerCase().trim();
  const author = (book.author || '').toLowerCase().trim();
  return `ta:${title}|${author}`;
}

/**
 * Computes pre-flight import diff report between existing library bundle and incoming export.
 */
export function computeLibraryImportDiff(
  existingBundle: LibraryBundle | null,
  incomingBundle: LibraryBundle,
  userState?: UserLocalState
): LibraryImportDiffReport {
  const existingBooks = existingBundle?.books || [];
  const incomingBooks = incomingBundle.books || [];

  const existingMap = new Map<string, Book>();
  for (const b of existingBooks) {
    existingMap.set(getBookMatchKey(b), b);
  }

  const incomingMap = new Map<string, Book>();
  for (const b of incomingBooks) {
    incomingMap.set(getBookMatchKey(b), b);
  }

  const addedBooks: Array<{ id: string; title: string; author: string; shelf: string }> = [];
  const shelfTransitions: ShelfTransitionDiff[] = [];
  const ratingChanges: RatingChangeDiff[] = [];
  let newReviewsCount = 0;
  let unchangedCount = 0;

  for (const inc of incomingBooks) {
    const key = getBookMatchKey(inc);
    const existing = existingMap.get(key);

    if (!existing) {
      addedBooks.push({
        id: inc.id,
        title: inc.title || inc.cleanTitle,
        author: inc.author,
        shelf: inc.exclusiveShelf,
      });
    } else {
      let isUnchanged = true;

      // Check shelf transition
      if (existing.exclusiveShelf !== inc.exclusiveShelf) {
        isUnchanged = false;
        shelfTransitions.push({
          bookId: inc.id || existing.id,
          title: inc.title || existing.title,
          author: inc.author || existing.author,
          fromShelf: existing.exclusiveShelf,
          toShelf: inc.exclusiveShelf,
        });
      }

      // Check rating change
      if (existing.myRating !== inc.myRating) {
        isUnchanged = false;
        ratingChanges.push({
          bookId: inc.id || existing.id,
          title: inc.title || existing.title,
          fromRating: existing.myRating,
          toRating: inc.myRating,
        });
      }

      // Check new review
      if (!existing.myReview && inc.myReview && inc.myReview.trim() !== '') {
        isUnchanged = false;
        newReviewsCount++;
      }

      if (isUnchanged) {
        unchangedCount++;
      }
    }
  }

  // Count existing books missing in incoming export
  let missingInIncomingCount = 0;
  for (const [key, b] of existingMap.entries()) {
    if (!incomingMap.has(key)) {
      missingInIncomingCount++;
    }
  }

  // Preserved overrides analysis
  const preservedOverrideDetails: Array<{ bookId: string; title: string; preservedFields: string[] }> = [];
  const overrides = userState?.bookOverrides || {};
  for (const [bookId, override] of Object.entries(overrides)) {
    const fields: string[] = [];
    if (override.originalLanguageOverride) fields.push('originalLanguageOverride');
    if (override.editionLanguageOverride) fields.push('editionLanguageOverride');
    if (override.formatOverride) fields.push('formatOverride');
    if (override.localNotes) fields.push('localNotes');
    if (override.progressLogs && override.progressLogs.length > 0) fields.push('progressLogs');
    if (override.moodTags && override.moodTags.length > 0) fields.push('moodTags');

    if (fields.length > 0) {
      const matchBook = existingBooks.find(b => b.id === bookId) || incomingBooks.find(b => b.id === bookId);
      preservedOverrideDetails.push({
        bookId,
        title: matchBook?.title || bookId,
        preservedFields: fields,
      });
    }
  }

  return {
    incomingTotal: incomingBooks.length,
    existingTotal: existingBooks.length,
    addedBooks,
    unchangedCount,
    shelfTransitions,
    ratingChanges,
    newReviewsCount,
    preservedOverridesCount: preservedOverrideDetails.length,
    preservedOverrideDetails,
    missingInIncomingCount,
  };
}

/**
 * Computes import diff report for Kindle clippings/notes.
 */
export function computeClippingsImportDiff(
  existingClippings: KindleClipping[],
  incomingClippings: KindleClipping[]
): ClippingsImportDiffReport {
  const existingSet = new Set<string>();
  for (const c of existingClippings) {
    const sig = `${(c.cleanTitle || c.rawTitle).toLowerCase().trim()}|${(c.content || '').trim().substring(0, 80)}`;
    existingSet.add(sig);
  }

  let newClippingsCount = 0;
  let duplicateSkippedCount = 0;
  const sampleNewTitles: string[] = [];
  const colorBreakdown: Record<string, number> = { yellow: 0, blue: 0, pink: 0, orange: 0, unspecified: 1 };
  const matchedBooks = new Set<string>();

  for (const inc of incomingClippings) {
    const sig = `${(inc.cleanTitle || inc.rawTitle).toLowerCase().trim()}|${(inc.content || '').trim().substring(0, 80)}`;
    if (existingSet.has(sig)) {
      duplicateSkippedCount++;
    } else {
      newClippingsCount++;
      if (sampleNewTitles.length < 5 && inc.cleanTitle) {
        sampleNewTitles.push(inc.cleanTitle);
      }
    }
    if (inc.matchedBookId || inc.cleanTitle) {
      matchedBooks.add(inc.cleanTitle || inc.matchedBookId || '');
    }
  }

  return {
    sourceFormat: 'clippings-txt',
    incomingTotal: incomingClippings.length,
    existingTotal: existingClippings.length,
    newClippingsCount,
    duplicateSkippedCount,
    matchedBooksCount: matchedBooks.size,
    chaptersDetectedCount: 0,
    colorBreakdown,
    sampleNewTitles,
  };
}

/**
 * Recalculates summary statistics for a library bundle.
 */
function recalculateSummaryStats(books: Book[], baseStats?: SummaryStats): SummaryStats {
  const totalBooks = books.length;
  const authorSet = new Set<string>();
  let booksWithSeries = 0;
  const shelves = { read: 0, toRead: 0, currentlyReading: 0, didNotFinish: 0 };
  let ratedCount = 0;
  let unratedCount = 0;
  let ratingSum = 0;
  const ratingDist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let totalPagesRead = 0;
  let totalLibraryPages = 0;
  let booksWithPagesCount = 0;
  let booksWithoutPagesCount = 0;

  for (const b of books) {
    if (b.author) authorSet.add(b.author.trim());
    if (b.seriesName) booksWithSeries++;

    const shelf = (b.exclusiveShelf || '').toLowerCase();
    if (shelf === 'read') {
      shelves.read++;
    } else if (shelf === 'to-read' || shelf === 'want-to-read') {
      shelves.toRead++;
    } else if (shelf === 'currently-reading') {
      shelves.currentlyReading++;
    } else if (shelf === 'did-not-finish' || shelf === 'dnf') {
      shelves.didNotFinish++;
    } else {
      shelves.toRead++;
    }

    if (b.myRating !== null && b.myRating !== undefined && b.myRating > 0) {
      ratedCount++;
      ratingSum += b.myRating;
      const rKey = String(Math.round(b.myRating));
      ratingDist[rKey] = (ratingDist[rKey] || 0) + 1;
    } else {
      unratedCount++;
    }

    if (b.pageCount !== null && b.pageCount !== undefined && b.pageCount > 0) {
      booksWithPagesCount++;
      totalLibraryPages += b.pageCount;
      if (shelf === 'read') {
        totalPagesRead += b.pageCount;
      }
    } else {
      booksWithoutPagesCount++;
    }
  }

  const averageRating = ratedCount > 0 ? Number((ratingSum / ratedCount).toFixed(2)) : null;

  return {
    totalBooks,
    distinctAuthors: authorSet.size,
    booksWithSeries,
    shelves,
    ratings: {
      ratedCount,
      unratedCount,
      averageRating,
      distribution: ratingDist,
    },
    pages: {
      totalPagesRead,
      totalLibraryPages,
      booksWithPagesCount,
      booksWithoutPagesCount,
    },
    reconciliationCoverage: baseStats?.reconciliationCoverage || {
      csvTotalBooks: totalBooks,
      matchedShelvings: totalBooks,
      dsarTotalShelvings: totalBooks,
      matchedReviews: ratedCount,
      dsarTotalReviews: ratedCount,
      booksWithReadingSessions: 0,
      attachedReadingSessions: 0,
      dsarTotalSessions: 0,
      matchedKindleNotes: 0,
      dsarTotalNotes: 0,
      booksWithKindleNotes: 0,
      writtenReviewsInCsv: 0,
    },
    enrichmentCounts: baseStats?.enrichmentCounts || {},
  };
}

/**
 * Merges existing library bundle with incoming export non-destructively.
 * Preserves DSAR-rich fields (readingSessions, kindleNotes, recommendations, quotes, achievements, etc.)
 * on matched books and retains existing books not present in partial incoming exports.
 */
export function mergeLibraryBundlesNonDestructive(
  existingBundle: LibraryBundle | null,
  incomingBundle: LibraryBundle
): LibraryBundle {
  if (!existingBundle || !existingBundle.books || existingBundle.books.length === 0) {
    return {
      ...incomingBundle,
      summaryStats: recalculateSummaryStats(incomingBundle.books, incomingBundle.summaryStats),
    };
  }

  const existingBooksMap = new Map<string, Book>();
  for (const b of existingBundle.books) {
    existingBooksMap.set(getBookMatchKey(b), b);
  }

  const mergedBooksMap = new Map<string, Book>();

  // 1. First add all existing books to preserve non-destructive state and DSAR-rich fields
  for (const [key, b] of existingBooksMap.entries()) {
    mergedBooksMap.set(key, { ...b });
  }

  // 2. Merge incoming books over existing books, preserving DSAR-rich sub-arrays if incoming is empty
  for (const inc of incomingBundle.books) {
    const key = getBookMatchKey(inc);
    const existing = existingBooksMap.get(key);

    if (!existing) {
      mergedBooksMap.set(key, { ...inc });
    } else {
      // Non-destructive merge: update primary CSV metadata while preserving DSAR-rich arrays if incoming has none
      mergedBooksMap.set(key, {
        ...existing,
        ...inc,
        id: inc.id || existing.id,
        exclusiveShelf: inc.exclusiveShelf || existing.exclusiveShelf,
        myRating: inc.myRating !== null && inc.myRating !== undefined ? inc.myRating : existing.myRating,
        myReview: inc.myReview !== null && inc.myReview !== undefined ? inc.myReview : existing.myReview,
        dateRead: inc.dateRead || existing.dateRead,
        dateAdded: inc.dateAdded || existing.dateAdded,
        readingSessions:
          inc.readingSessions && inc.readingSessions.length > 0
            ? inc.readingSessions
            : existing.readingSessions,
        kindleNotes:
          inc.kindleNotes && inc.kindleNotes.length > 0 ? inc.kindleNotes : existing.kindleNotes,
        recommendations:
          inc.recommendations && inc.recommendations.length > 0
            ? inc.recommendations
            : existing.recommendations,
      });
    }
  }

  const finalBooks = Array.from(mergedBooksMap.values());
  const newSummaryStats = recalculateSummaryStats(finalBooks, incomingBundle.summaryStats || existingBundle.summaryStats);

  return {
    schemaVersion: incomingBundle.schemaVersion || existingBundle.schemaVersion,
    generatedAt: new Date().toISOString(),
    summaryStats: newSummaryStats,
    books: finalBooks,
    quotes:
      incomingBundle.quotes && incomingBundle.quotes.length > 0 ? incomingBundle.quotes : existingBundle.quotes,
    kindleNotes:
      incomingBundle.kindleNotes && incomingBundle.kindleNotes.length > 0
        ? incomingBundle.kindleNotes
        : existingBundle.kindleNotes,
    recommendations:
      incomingBundle.recommendations && incomingBundle.recommendations.length > 0
        ? incomingBundle.recommendations
        : existingBundle.recommendations,
    readingGoals:
      incomingBundle.readingGoals && incomingBundle.readingGoals.length > 0
        ? incomingBundle.readingGoals
        : existingBundle.readingGoals,
    achievements:
      incomingBundle.achievements && incomingBundle.achievements.length > 0
        ? incomingBundle.achievements
        : existingBundle.achievements,
    followedAuthors:
      incomingBundle.followedAuthors && incomingBundle.followedAuthors.length > 0
        ? incomingBundle.followedAuthors
        : existingBundle.followedAuthors,
    favoriteGenres: incomingBundle.favoriteGenres || existingBundle.favoriteGenres,
    reviewDrafts:
      incomingBundle.reviewDrafts && incomingBundle.reviewDrafts.length > 0
        ? incomingBundle.reviewDrafts
        : existingBundle.reviewDrafts,
    activityByHour: incomingBundle.activityByHour || existingBundle.activityByHour,
    suggestedLists:
      incomingBundle.suggestedLists && incomingBundle.suggestedLists.length > 0
        ? incomingBundle.suggestedLists
        : existingBundle.suggestedLists,
  };
}
