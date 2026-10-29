import type {
  Book,
  BookFormat,
  EnrichmentCacheMap,
  LanguageCode,
  LibraryBundle,
  UserLocalState,
} from '../../types/library';
import {
  classifyBookLanguageAndFormat,
  FORMAT_LABELS,
  LANGUAGE_LABELS,
} from '../classifiers/languageAndFormat';

export interface OracleFilters {
  maxPages?: 'any' | 'sprint' | 'weekend' | 'standard' | 'epic';
  age?: 'any' | 'fresh' | 'seasoned' | 'vintage';
  era?:
    | 'any'
    | 'classic'
    | 'modern'
    | 'series'
    | 'classical'
    | 'premodern'
    | 'nineteenth'
    | 'twentieth'
    | 'contemporary';
  commitment?: 'any' | 'sprint' | 'deep' | 'epic';
  dust?: 'any' | 'forgotten' | 'recent';
  genre?: string;
  editionLanguage?: LanguageCode | 'any';
  originalLanguage?: LanguageCode | 'any';
  translationMode?: 'any' | 'original' | 'translated';
  format?: BookFormat | 'any';
}

export interface OracleCandidate {
  book: Book;
  score: number;
  reasons: string[];
  estimatedHours?: number;
  matchScore?: number;
}

export interface UnfinishedSeriesItem {
  seriesName: string;
  readBooks: Book[];
  nextBooks: Book[];
  avgRating: number | null;
  totalTracked?: number;
  readCount?: number;
  books?: Book[];
  nextBook?: Book | null;
}

export interface TrustedAuthorPick {
  author: string;
  avgRating: number;
  readCount: number;
  unreadBooks: Book[];
  toReadBooks?: Book[];
}

export interface FormatVelocityItem {
  format: BookFormat;
  label: string;
  booksCompleted: number;
  sessionsWithDuration: number;
  totalPages: number;
  avgPagesPerDay: number;
  medianDaysToFinish: number;
}

export interface NightstandBookDiagnostic {
  book: Book;
  state: 'active' | 'on-hold';
  idleDays: number;
  isHibernatingCandidate: boolean;
  startedAt: string | null;
  currentPage: number;
  totalPages: number | null;
  percentComplete: number;
  format: BookFormat;
  pacePagesPerDay: number;
  projectedFinishDate: string | null;
  targetFinishDate: string | null;
  pagesPerDayForTarget: number | null;
}

const BASELINE_PAGES_PER_DAY: Record<BookFormat, number> = {
  prose: 32,
  'comic-manga': 140,
  'short-essay': 45,
  'academic-ref': 18,
};

const BASELINE_MEDIAN_DAYS: Record<BookFormat, number> = {
  prose: 12,
  'comic-manga': 2,
  'short-essay': 2,
  'academic-ref': 25,
};

/**
 * Generates scored TBR recommendations matching the reader's current constraints.
 * Implements TBR Concierge logic:
 * - Page budget filtering (sprint <=180p, weekend <=300p, standard <=480p, epic >=450p)
 * - TBR age decay scoring (fresh momentum picks vs. vintage dust gems)
 * - Affinity bonuses for trusted authors, series continuations, and high community acclaim
 * - Language, translation mode, and format constraints
 */
export function getOracleCandidates(
  bundle: LibraryBundle,
  filters: OracleFilters = {},
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): OracleCandidate[] {
  // Target unread books on TBR
  let candidates = bundle.books.filter(b => b.exclusiveShelf === 'to-read');
  if (candidates.length === 0) {
    candidates = bundle.books.filter(
      b =>
        b.exclusiveShelf !== 'read' &&
        b.exclusiveShelf !== 'did-not-finish' &&
        b.exclusiveShelf !== 'dnf'
    );
  }

  // Precompute user author ratings and series progress from read books
  const authorStats = new Map<string, { sumRating: number; count: number }>();
  const readSeriesNames = new Set<string>();

  for (const b of bundle.books) {
    if (b.exclusiveShelf === 'read') {
      const authorKey = b.author.trim().toLowerCase();
      if (authorKey && b.myRating !== null && b.myRating >= 1) {
        const curr = authorStats.get(authorKey) || { sumRating: 0, count: 0 };
        authorStats.set(authorKey, {
          sumRating: curr.sumRating + b.myRating,
          count: curr.count + 1,
        });
      }

      if (b.seriesName) {
        readSeriesNames.add(b.seriesName.trim().toLowerCase());
      }
    }
  }

  const now = Date.now();

  // Apply filters
  const filtered = candidates.filter(book => {
    // 1. Max pages / commitment filter
    if (filters.maxPages && filters.maxPages !== 'any') {
      if (book.pageCount === null || book.pageCount <= 0) return false;
      if (filters.maxPages === 'sprint' && book.pageCount > 180) return false;
      if (filters.maxPages === 'weekend' && book.pageCount > 300) return false;
      if (filters.maxPages === 'standard' && book.pageCount > 480) return false;
      if (filters.maxPages === 'epic' && book.pageCount < 450) return false;
    } else if (filters.commitment && filters.commitment !== 'any') {
      const p = book.pageCount || 300;
      if (filters.commitment === 'sprint' && p >= 250) return false;
      if (filters.commitment === 'deep' && (p < 250 || p > 500)) return false;
      if (filters.commitment === 'epic' && p <= 500) return false;
    }

    // 2. Age on TBR / Dust filter
    const addedTime = book.dateAdded ? new Date(book.dateAdded).getTime() : null;
    const daysOnShelf =
      addedTime && !Number.isNaN(addedTime)
        ? Math.max(0, Math.floor((now - addedTime) / (1000 * 60 * 60 * 24)))
        : 365;

    if (filters.age && filters.age !== 'any') {
      if (filters.age === 'fresh' && daysOnShelf > 90) return false;
      if (filters.age === 'seasoned' && (daysOnShelf <= 90 || daysOnShelf > 730)) return false;
      if (filters.age === 'vintage' && daysOnShelf <= 730) return false;
    } else if (filters.dust && filters.dust !== 'any') {
      if (filters.dust === 'forgotten' && daysOnShelf <= 730) return false;
      if (filters.dust === 'recent' && daysOnShelf > 180) return false;
    }

    // 3. Era filter
    if (filters.era && filters.era !== 'any') {
      const pubYear = book.originalPublicationYear ?? book.yearPublished;
      if (filters.era === 'classic') {
        if (pubYear === null || pubYear >= 1975) return false;
      } else if (filters.era === 'modern') {
        if (pubYear === null || pubYear < 1975) return false;
      } else if (filters.era === 'classical') {
        if (pubYear === null || pubYear > 500) return false;
      } else if (filters.era === 'premodern') {
        if (pubYear === null || pubYear <= 500 || pubYear >= 1800) return false;
      } else if (filters.era === 'nineteenth') {
        if (pubYear === null || pubYear < 1800 || pubYear >= 1900) return false;
      } else if (filters.era === 'twentieth') {
        if (pubYear === null || pubYear < 1900 || pubYear >= 2000) return false;
      } else if (filters.era === 'contemporary') {
        if (pubYear === null || pubYear < 2000) return false;
      } else if (filters.era === 'series') {
        if (!book.seriesName) return false;
      }
    }

    // 4. Genre filter
    if (filters.genre && filters.genre !== 'any') {
      const gLower = filters.genre.toLowerCase();
      const hasGenre =
        book.bookshelves.some(s => s.toLowerCase().includes(gLower)) ||
        (book.bookshelvesWithPositions &&
          book.bookshelvesWithPositions.toLowerCase().includes(gLower));
      if (!hasGenre) return false;
    }

    // 5. Language & Format filters
    const profile = classifyBookLanguageAndFormat(
      book,
      userState?.bookOverrides?.[book.id],
      enrichmentCache?.[book.id]
    );

    if (filters.editionLanguage && filters.editionLanguage !== 'any') {
      if (profile.editionLanguage !== filters.editionLanguage) return false;
    }

    if (filters.originalLanguage && filters.originalLanguage !== 'any') {
      if (profile.originalLanguage !== filters.originalLanguage) return false;
    }

    if (filters.translationMode && filters.translationMode !== 'any') {
      if (filters.translationMode === 'original' && profile.isTranslation) return false;
      if (filters.translationMode === 'translated' && !profile.isTranslation) return false;
    }

    if (filters.format && filters.format !== 'any') {
      if (profile.format !== filters.format) return false;
    }

    return true;
  });

  // Score each candidate
  const scored: OracleCandidate[] = filtered.map(book => {
    let score = 50;
    const reasons: string[] = [];

    const profile = classifyBookLanguageAndFormat(
      book,
      userState?.bookOverrides?.[book.id],
      enrichmentCache?.[book.id]
    );

    // Author affinity
    const authorKey = book.author.trim().toLowerCase();
    const authorStat = authorStats.get(authorKey);
    if (authorStat && authorStat.count > 0) {
      const avg = authorStat.sumRating / authorStat.count;
      if (avg >= 4.0) {
        score += 35;
        reasons.push(
          `By trusted author ${book.author} (your avg rating: ${avg.toFixed(1)}★ across ${authorStat.count} works)`
        );
      } else if (avg >= 3.0) {
        score += 15;
        reasons.push(`You have read ${authorStat.count} previous books by ${book.author}`);
      }
    }

    // Series continuation
    if (book.seriesName) {
      const sKey = book.seriesName.trim().toLowerCase();
      if (readSeriesNames.has(sKey)) {
        score += 30;
        reasons.push(
          `Next in series "${book.seriesName}" (#${book.seriesNumber ?? '?'})`
        );
      } else {
        score += 10;
        reasons.push(`Part of "${book.seriesName}" series`);
      }
    }

    // Community acclaim
    const communityRating =
      book.averageRating ?? enrichmentCache?.[book.id]?.communityRating ?? null;
    if (communityRating !== null) {
      if (communityRating >= 4.2) {
        score += 20;
        reasons.push(
          `Acclaimed by readers (${communityRating.toFixed(2)}★ community average)`
        );
      } else if (communityRating >= 4.0) {
        score += 10;
        reasons.push(
          `Highly rated (${communityRating.toFixed(2)}★ community average)`
        );
      }
    }

    // TBR age
    const addedTime = book.dateAdded ? new Date(book.dateAdded).getTime() : null;
    const daysOnShelf =
      addedTime && !Number.isNaN(addedTime)
        ? Math.max(0, Math.floor((now - addedTime) / (1000 * 60 * 60 * 24)))
        : 365;

    if (daysOnShelf > 730) {
      score += 15;
      const years = Math.floor(daysOnShelf / 365);
      reasons.push(`Vintage gem waiting on your shelf for ${years}+ years`);
    } else if (daysOnShelf <= 30) {
      score += 12;
      reasons.push(`Added recently (${daysOnShelf}d ago) — strike while interest is high`);
    }

    // Page count ease
    if (book.pageCount !== null && book.pageCount > 0 && book.pageCount <= 220) {
      score += 10;
      reasons.push(`Brisk, focused commitment (${book.pageCount} pages)`);
    }

    // Language & format insights
    if (profile.isTranslation) {
      const origName = LANGUAGE_LABELS[profile.originalLanguage] || profile.originalLanguage;
      reasons.push(`Translation from ${origName} (${profile.translationFlow})`);
    } else if (profile.editionLanguage === 'TR') {
      reasons.push('Turkish edition');
    } else if (profile.editionLanguage === 'FR') {
      reasons.push('French edition');
    }

    if (profile.format === 'comic-manga') {
      reasons.push('Graphic / manga format');
    } else if (profile.format === 'academic-ref') {
      reasons.push('Academic / reference work');
    } else if (profile.format === 'short-essay') {
      reasons.push(`Brisk read: short essay/story (${book.pageCount}p)`);
    }

    if (enrichmentCache?.[book.id]?.synopsis) {
      reasons.push('Verified synopsis archive available');
    }

    if (reasons.length === 0) {
      reasons.push('Matches your active TBR discovery criteria');
    }

    const estimatedHours = Math.round(((book.pageCount || 300) * 1.5) / 60);

    return {
      book,
      score,
      reasons,
      estimatedHours,
      matchScore: score,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Finds all book series where the user has started reading, but still has unread
 * books waiting on their shelves.
 */
export function getUnfinishedSeries(
  bundle: LibraryBundle
): Array<{
  seriesName: string;
  readBooks: Book[];
  nextBooks: Book[];
  avgRating: number | null;
  totalTracked: number;
  readCount: number;
  books: Book[];
  nextBook: Book | null;
}> {
  const seriesMap = new Map<string, { displayName: string; books: Book[] }>();

  for (const book of bundle.books) {
    if (!book.seriesName) continue;
    const trimmed = book.seriesName.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    const entry = seriesMap.get(key) || { displayName: trimmed, books: [] };
    entry.books.push(book);
    seriesMap.set(key, entry);
  }

  const results: Array<{
    seriesName: string;
    readBooks: Book[];
    nextBooks: Book[];
    avgRating: number | null;
    totalTracked: number;
    readCount: number;
    books: Book[];
    nextBook: Book | null;
  }> = [];

  for (const { displayName, books } of seriesMap.values()) {
    const readBooks = books.filter(b => b.exclusiveShelf === 'read');
    const nextBooks = books.filter(
      b => b.exclusiveShelf === 'to-read' || b.exclusiveShelf === 'currently-reading'
    );

    // Only unfinished series with both read and unread volumes
    if (readBooks.length > 0 && nextBooks.length > 0) {
      const rated = readBooks.filter(b => b.myRating !== null && b.myRating >= 1);
      const avgRating =
        rated.length > 0
          ? Number(
              (
                rated.reduce((acc, b) => acc + (b.myRating ?? 0), 0) / rated.length
              ).toFixed(2)
            )
          : null;

      // Sort volumes numerically by series position
      const sortFn = (a: Book, b: Book) => {
        const numA = parseFloat(a.seriesNumber ?? '0') || 0;
        const numB = parseFloat(b.seriesNumber ?? '0') || 0;
        return numA - numB;
      };

      const sortedRead = [...readBooks].sort(sortFn);
      const sortedNext = [...nextBooks].sort(sortFn);

      results.push({
        seriesName: displayName,
        readBooks: sortedRead,
        nextBooks: sortedNext,
        avgRating,
        totalTracked: books.length,
        readCount: readBooks.length,
        books,
        nextBook: sortedNext[0] || null,
      });
    }
  }

  return results.sort((a, b) => {
    if (b.readBooks.length !== a.readBooks.length) {
      return b.readBooks.length - a.readBooks.length;
    }
    return (b.avgRating ?? 0) - (a.avgRating ?? 0);
  });
}

/**
 * Finds authors the user loves (user average rating >= 3.8★) who have unread
 * books currently sitting on the to-read shelf.
 */
export function getTrustedAuthorPicks(
  bundle: LibraryBundle
): Array<{
  author: string;
  avgRating: number;
  readCount: number;
  unreadBooks: Book[];
  toReadBooks: Book[];
}> {
  const authorMap = new Map<string, { displayName: string; books: Book[] }>();

  for (const book of bundle.books) {
    const author = book.author.trim();
    if (!author) continue;

    const key = author.toLowerCase();
    const entry = authorMap.get(key) || { displayName: author, books: [] };
    entry.books.push(book);
    authorMap.set(key, entry);
  }

  const results: Array<{
    author: string;
    avgRating: number;
    readCount: number;
    unreadBooks: Book[];
    toReadBooks: Book[];
  }> = [];

  for (const { displayName, books } of authorMap.values()) {
    const readBooks = books.filter(
      b => b.exclusiveShelf === 'read' || b.readCount > 0
    );
    const unreadBooks = books.filter(b => b.exclusiveShelf === 'to-read');

    const ratedRead = readBooks.filter(
      b => b.myRating !== null && b.myRating >= 1 && b.myRating <= 5
    );

    if (ratedRead.length > 0 && unreadBooks.length > 0) {
      const avgRating = Number(
        (
          ratedRead.reduce((acc, b) => acc + (b.myRating ?? 0), 0) /
          ratedRead.length
        ).toFixed(2)
      );

      // Trusted author threshold
      if (avgRating >= 3.8) {
        results.push({
          author: displayName,
          avgRating,
          readCount: readBooks.length,
          unreadBooks,
          toReadBooks: unreadBooks,
        });
      }
    }
  }

  return results.sort((a, b) => {
    if (b.avgRating !== a.avgRating) {
      return b.avgRating - a.avgRating;
    }
    return b.readCount - a.readCount;
  });
}

/**
 * Computes realistic reading velocity statistics across formats using DSAR readingSessions,
 * falling back gracefully to baselines when session history is sparse.
 */
export function computeFormatVelocity(
  bundle: LibraryBundle,
  userState?: UserLocalState
): FormatVelocityItem[] {
  const formats: BookFormat[] = ['prose', 'comic-manga', 'short-essay', 'academic-ref'];

  return formats.map(fmt => {
    const formatBooks = bundle.books.filter(b => {
      const profile = classifyBookLanguageAndFormat(b, userState?.bookOverrides?.[b.id]);
      return profile.format === fmt;
    });

    const completedBooks = formatBooks.filter(
      b => b.exclusiveShelf === 'read' || b.readCount > 0
    );
    const booksCompleted = completedBooks.length;
    const totalPages = completedBooks.reduce((sum, b) => sum + (b.pageCount ?? 0), 0);

    const sessionDurations: number[] = [];
    const sessionSpeeds: number[] = [];

    for (const book of formatBooks) {
      for (const session of book.readingSessions || []) {
        if (session.durationDays !== null && session.durationDays > 0) {
          sessionDurations.push(session.durationDays);
          if (book.pageCount !== null && book.pageCount > 0) {
            sessionSpeeds.push(book.pageCount / session.durationDays);
          }
        }
      }
    }

    const sessionsWithDuration = sessionDurations.length;

    let avgPagesPerDay = BASELINE_PAGES_PER_DAY[fmt];
    if (sessionSpeeds.length >= 2) {
      const sumSpeed = sessionSpeeds.reduce((acc, s) => acc + s, 0);
      avgPagesPerDay = Number((sumSpeed / sessionSpeeds.length).toFixed(1));
    }

    let medianDaysToFinish = BASELINE_MEDIAN_DAYS[fmt];
    if (sessionDurations.length > 0) {
      const sorted = [...sessionDurations].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianDaysToFinish =
        sorted.length % 2 !== 0
          ? sorted[mid]
          : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    return {
      format: fmt,
      label: FORMAT_LABELS[fmt] || fmt,
      booksCompleted,
      sessionsWithDuration,
      totalPages,
      avgPagesPerDay,
      medianDaysToFinish,
    };
  });
}

/**
 * Evaluates active and currently reading books on the nightstand,
 * tracking idle days, pacing, hibernate status, and target deadlines.
 */
export function computeNightstandDiagnostics(
  bundle: LibraryBundle,
  userState?: UserLocalState
): NightstandBookDiagnostic[] {
  const velocityList = computeFormatVelocity(bundle, userState);
  const velocityMap: Record<BookFormat, number> = {
    prose: 32,
    'comic-manga': 140,
    'short-essay': 45,
    'academic-ref': 18,
  };
  for (const v of velocityList) {
    velocityMap[v.format] = v.avgPagesPerDay;
  }

  // Find all nightstand books
  const nightstandBooks = bundle.books.filter(
    b =>
      b.exclusiveShelf === 'currently-reading' ||
      userState?.bookOverrides?.[b.id]?.nightstandState !== undefined
  );

  const now = Date.now();

  return nightstandBooks.map(book => {
    const override = userState?.bookOverrides?.[book.id];
    const state = override?.nightstandState ?? 'active';

    // Page progress
    let currentPage = 0;
    if (override?.progressLogs && override.progressLogs.length > 0) {
      const lastLog = override.progressLogs[override.progressLogs.length - 1];
      currentPage = lastLog.page;
    } else if (override?.currentPage !== undefined && override?.currentPage !== null) {
      currentPage = override.currentPage;
    }
    currentPage = Math.max(0, currentPage);

    const totalPages = book.pageCount ?? null;
    const percentComplete =
      totalPages !== null && totalPages > 0
        ? Math.min(100, Math.max(0, Math.round((currentPage / totalPages) * 100)))
        : 0;

    const formatProfile = classifyBookLanguageAndFormat(book, override);
    const format = formatProfile.format;
    const pacePagesPerDay = velocityMap[format] || BASELINE_PAGES_PER_DAY[format] || 32;

    // Started date
    let startedAt: string | null = null;
    if (override?.progressLogs && override.progressLogs.length > 0) {
      startedAt = override.progressLogs[0].date;
    } else if (book.readingSessions && book.readingSessions.length > 0) {
      const activeSession = book.readingSessions.find(s => s.state === 'READING') || book.readingSessions[0];
      startedAt = activeSession.startedAt;
    } else if (book.dateAdded) {
      startedAt = book.dateAdded;
    }

    // Idle days calculation from latest activity
    let latestActivityTimestamp = 0;
    if (override?.progressLogs && override.progressLogs.length > 0) {
      const lastDate = override.progressLogs[override.progressLogs.length - 1].date;
      const t = new Date(lastDate).getTime();
      if (!Number.isNaN(t)) latestActivityTimestamp = Math.max(latestActivityTimestamp, t);
    }

    if (book.readingSessions && book.readingSessions.length > 0) {
      for (const s of book.readingSessions) {
        if (s.startedAt) {
          const t = new Date(s.startedAt).getTime();
          if (!Number.isNaN(t)) latestActivityTimestamp = Math.max(latestActivityTimestamp, t);
        }
        if (s.endedAt) {
          const t = new Date(s.endedAt).getTime();
          if (!Number.isNaN(t)) latestActivityTimestamp = Math.max(latestActivityTimestamp, t);
        }
      }
    }

    if (latestActivityTimestamp === 0 && book.dateAdded) {
      const t = new Date(book.dateAdded).getTime();
      if (!Number.isNaN(t)) latestActivityTimestamp = t;
    }

    const idleDays =
      latestActivityTimestamp > 0
        ? Math.max(0, Math.floor((now - latestActivityTimestamp) / (1000 * 60 * 60 * 24)))
        : 0;

    const isHibernatingCandidate = idleDays > 60 && state !== 'on-hold';

    // Projected finish date based on remaining pages / format pace
    let projectedFinishDate: string | null = null;
    if (totalPages !== null) {
      const remainingPages = Math.max(0, totalPages - currentPage);
      if (remainingPages === 0) {
        projectedFinishDate = new Date().toISOString().split('T')[0];
      } else if (pacePagesPerDay > 0) {
        const daysNeeded = Math.ceil(remainingPages / pacePagesPerDay);
        const projDate = new Date(now + daysNeeded * 24 * 60 * 60 * 1000);
        projectedFinishDate = projDate.toISOString().split('T')[0];
      }
    }

    // Target deadline calculation
    const targetFinishDate = override?.targetFinishDate ?? null;
    let pagesPerDayForTarget: number | null = null;

    if (targetFinishDate) {
      const targetTime = new Date(targetFinishDate).getTime();
      if (!Number.isNaN(targetTime)) {
        const remainingDays = Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24));
        const remainingPages = Math.max(0, (totalPages ?? 0) - currentPage);
        if (remainingDays > 0) {
          pagesPerDayForTarget = Math.ceil(remainingPages / remainingDays);
        } else {
          pagesPerDayForTarget = remainingPages;
        }
      }
    }

    return {
      book,
      state,
      idleDays,
      isHibernatingCandidate,
      startedAt,
      currentPage,
      totalPages,
      percentComplete,
      format,
      pacePagesPerDay,
      projectedFinishDate,
      targetFinishDate,
      pagesPerDayForTarget,
    };
  });
}

/**
 * Computes deep multilingual analytics: translation flows, original vs translated volume,
 * language distribution, and translator credits.
 */
export function computeLanguagePassportMetrics(
  bundle: LibraryBundle,
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): {
  byEditionLanguage: Array<{
    lang: LanguageCode;
    label: string;
    readCount: number;
    toReadCount: number;
    totalCount: number;
  }>;
  byOriginalLanguage: Array<{
    lang: LanguageCode;
    label: string;
    readCount: number;
    toReadCount: number;
    totalCount: number;
  }>;
  translationFlows: Array<{
    flow: string;
    isTranslation: boolean;
    count: number;
    readCount: number;
    examples: string[];
  }>;
  originalVsTranslated: {
    originalRead: number;
    translatedRead: number;
    originalTBR: number;
    translatedTBR: number;
  };
  topTranslators: Array<{
    name: string;
    count: number;
    languages: string[];
  }>;
} {
  const editionMap = new Map<LanguageCode, { read: number; toRead: number; total: number }>();
  const originalMap = new Map<LanguageCode, { read: number; toRead: number; total: number }>();
  const flowsMap = new Map<
    string,
    { flow: string; isTranslation: boolean; count: number; readCount: number; examples: string[] }
  >();

  let originalRead = 0;
  let translatedRead = 0;
  let originalTBR = 0;
  let translatedTBR = 0;

  const translatorStats = new Map<string, { count: number; languages: Set<string> }>();

  for (const book of bundle.books) {
    const override = userState?.bookOverrides?.[book.id];
    const enriched = enrichmentCache?.[book.id];
    const profile = classifyBookLanguageAndFormat(book, override, enriched);

    const isRead = book.exclusiveShelf === 'read';
    const isToRead = book.exclusiveShelf === 'to-read';

    // Edition language aggregation
    const edStats = editionMap.get(profile.editionLanguage) || { read: 0, toRead: 0, total: 0 };
    edStats.total += 1;
    if (isRead) edStats.read += 1;
    if (isToRead) edStats.toRead += 1;
    editionMap.set(profile.editionLanguage, edStats);

    // Original language aggregation
    const origStats = originalMap.get(profile.originalLanguage) || { read: 0, toRead: 0, total: 0 };
    origStats.total += 1;
    if (isRead) origStats.read += 1;
    if (isToRead) origStats.toRead += 1;
    originalMap.set(profile.originalLanguage, origStats);

    // Flow aggregation
    const flowEntry = flowsMap.get(profile.translationFlow) || {
      flow: profile.translationFlow,
      isTranslation: profile.isTranslation,
      count: 0,
      readCount: 0,
      examples: [],
    };
    flowEntry.count += 1;
    if (isRead) flowEntry.readCount += 1;
    if (flowEntry.examples.length < 3 && !flowEntry.examples.includes(book.cleanTitle)) {
      flowEntry.examples.push(book.cleanTitle);
    }
    flowsMap.set(profile.translationFlow, flowEntry);

    // Original vs translated breakdown
    if (isRead) {
      if (profile.isTranslation) {
        translatedRead += 1;
      } else {
        originalRead += 1;
      }
    } else if (isToRead) {
      if (profile.isTranslation) {
        translatedTBR += 1;
      } else {
        originalTBR += 1;
      }
    }

    // Translator tracking
    if (profile.isTranslation && profile.translators.length > 0) {
      for (const tName of profile.translators) {
        const entry = translatorStats.get(tName) || { count: 0, languages: new Set<string>() };
        entry.count += 1;
        entry.languages.add(profile.translationFlow);
        translatorStats.set(tName, entry);
      }
    }
  }

  const byEditionLanguage = Array.from(editionMap.entries())
    .map(([lang, counts]) => ({
      lang,
      label: LANGUAGE_LABELS[lang] || lang,
      readCount: counts.read,
      toReadCount: counts.toRead,
      totalCount: counts.total,
    }))
    .filter(i => i.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount);

  const byOriginalLanguage = Array.from(originalMap.entries())
    .map(([lang, counts]) => ({
      lang,
      label: LANGUAGE_LABELS[lang] || lang,
      readCount: counts.read,
      toReadCount: counts.toRead,
      totalCount: counts.total,
    }))
    .filter(i => i.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount);

  const translationFlows = Array.from(flowsMap.values()).sort((a, b) => b.count - a.count);

  const topTranslators = Array.from(translatorStats.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      languages: Array.from(data.languages),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    byEditionLanguage,
    byOriginalLanguage,
    translationFlows,
    originalVsTranslated: {
      originalRead,
      translatedRead,
      originalTBR,
      translatedTBR,
    },
    topTranslators,
  };
}

/**
 * Computes Contrarian Index metrics: personal rating divergence from community consensus,
 * identifying Sacred Cows Slain (harsh personal critiques of popular favorites) and
 * Hidden Champions (personal masterpieces undervalued by the crowd).
 */
export function computeContrarianMetrics(
  bundle: LibraryBundle,
  enrichmentCache?: EnrichmentCacheMap
): {
  enrichedRatedCount: number;
  meanDelta: number;
  sacredCowsSlain: Array<{
    book: Book;
    myRating: number;
    communityRating: number;
    delta: number;
  }>;
  hiddenChampions: Array<{
    book: Book;
    myRating: number;
    communityRating: number;
    delta: number;
  }>;
  allPoints: Array<{
    book: Book;
    myRating: number;
    communityRating: number;
    delta: number;
  }>;
} {
  const allPoints: Array<{
    book: Book;
    myRating: number;
    communityRating: number;
    delta: number;
  }> = [];

  for (const book of bundle.books) {
    if (book.myRating === null || book.myRating < 1 || book.myRating > 5) continue;

    const communityRating =
      book.averageRating ?? enrichmentCache?.[book.id]?.communityRating ?? null;
    if (communityRating === null || communityRating <= 0) continue;

    const delta = Number((book.myRating - communityRating).toFixed(2));
    allPoints.push({
      book,
      myRating: book.myRating,
      communityRating: Number(communityRating.toFixed(2)),
      delta,
    });
  }

  const enrichedRatedCount = allPoints.length;
  const meanDelta =
    enrichedRatedCount > 0
      ? Number(
          (allPoints.reduce((sum, p) => sum + p.delta, 0) / enrichedRatedCount).toFixed(2)
        )
      : 0;

  // Sacred Cows Slain: user rating is significantly lower than community (most negative delta first)
  const sacredCowsSlain = [...allPoints]
    .filter(p => p.delta < -0.3)
    .sort((a, b) => a.delta - b.delta);

  // Hidden Champions: user rating is significantly higher than community (most positive delta first)
  const hiddenChampions = [...allPoints]
    .filter(p => p.delta > 0.3)
    .sort((a, b) => b.delta - a.delta);

  const finalSacredCows =
    sacredCowsSlain.length > 0
      ? sacredCowsSlain
      : [...allPoints].sort((a, b) => a.delta - b.delta).slice(0, 5);

  const finalHiddenChampions =
    hiddenChampions.length > 0
      ? hiddenChampions
      : [...allPoints].sort((a, b) => b.delta - a.delta).slice(0, 5);

  return {
    enrichedRatedCount,
    meanDelta,
    sacredCowsSlain: finalSacredCows,
    hiddenChampions: finalHiddenChampions,
    allPoints,
  };
}

/**
 * Computes comprehensive Observatory analytics metrics for the entire library bundle:
 * - ratingBuckets: distribution and percentages for rated books
 * - fiveStarCanon: 5-star masterpieces
 * - sprintReads: fast, short read completions (<= 200 pages)
 * - slowBurnReads: epic tomes (>= 500 pages)
 * - rereadHallOfFame: books read multiple times
 * - eraBuckets: historical era breakdown from Classical Antiquity to 21st Century
 * - topAuthorsByPages: leaderboard of authors by total volume of pages read
 * - dnfBooks: books cataloged on did-not-finish shelf
 */
export function computeObservatoryMetrics(bundle: LibraryBundle): {
  ratingBuckets: Array<{ rating: number; count: number; percentage: number }>;
  fiveStarCanon: Book[];
  sprintReads: Book[];
  slowBurnReads: Book[];
  rereadHallOfFame: Book[];
  eraBuckets: Array<{ era: string; count: number; books: Book[] }>;
  topAuthorsByPages: Array<{
    author: string;
    totalPages: number;
    bookCount: number;
    avgRating: number | null;
  }>;
  dnfBooks: Book[];
  totalBooks: number;
  readBooks: number;
  toReadBooks: number;
  currentlyReading: number;
  didNotFinish: number;
  meanRating: number;
  canonCount: number;
} {
  const readBooksList = bundle.books.filter(b => b.exclusiveShelf === 'read');
  const ratedBooks = bundle.books.filter(
    b => b.myRating !== null && b.myRating >= 1 && b.myRating <= 5
  );

  // 1. Rating buckets (1 to 5 stars)
  const totalRated = ratedBooks.length;
  const ratingBuckets: Array<{ rating: number; count: number; percentage: number }> = [];

  for (let rating = 1; rating <= 5; rating++) {
    const count = ratedBooks.filter(b => Math.round(b.myRating!) === rating).length;
    const percentage = totalRated > 0 ? Number(((count / totalRated) * 100).toFixed(1)) : 0;
    ratingBuckets.push({ rating, count, percentage });
  }

  // 2. Five-star canon
  const fiveStarCanon = bundle.books
    .filter(b => b.myRating === 5)
    .sort((a, b) => (b.dateRead || '').localeCompare(a.dateRead || ''));

  // 3. Sprint reads (<= 200 pages on read shelf)
  const sprintReads = readBooksList
    .filter(b => b.pageCount !== null && b.pageCount > 0 && b.pageCount <= 200)
    .sort((a, b) => (a.pageCount ?? 0) - (b.pageCount ?? 0));

  // 4. Slow burn reads (>= 500 pages on read shelf)
  const slowBurnReads = readBooksList
    .filter(b => b.pageCount !== null && b.pageCount >= 500)
    .sort((a, b) => (b.pageCount ?? 0) - (a.pageCount ?? 0));

  // 5. Reread hall of fame (Read count > 1 or multiple completed reading sessions)
  const rereadHallOfFame = bundle.books
    .filter(
      b =>
        b.readCount > 1 ||
        (b.readingSessions &&
          b.readingSessions.filter(s => s.state === 'COMPLETED').length > 1)
    )
    .sort((a, b) => {
      const countA = Math.max(a.readCount, a.readingSessions?.length || 0);
      const countB = Math.max(b.readCount, b.readingSessions?.length || 0);
      return countB - countA;
    });

  // 6. Era buckets
  const eraDefinitions: Array<{
    era: string;
    predicate: (year: number | null) => boolean;
  }> = [
    {
      era: 'Antiquity & Classical (Pre-1800)',
      predicate: y => y !== null && y < 1800,
    },
    {
      era: '19th Century (1800–1899)',
      predicate: y => y !== null && y >= 1800 && y < 1900,
    },
    {
      era: 'Early 20th Century (1900–1949)',
      predicate: y => y !== null && y >= 1900 && y < 1950,
    },
    {
      era: 'Mid-to-Late 20th Century (1950–1999)',
      predicate: y => y !== null && y >= 1950 && y < 2000,
    },
    {
      era: '21st Century (2000–Present)',
      predicate: y => y !== null && y >= 2000,
    },
    {
      era: 'Unknown Publication Era',
      predicate: y => y === null,
    },
  ];

  const eraBuckets = eraDefinitions
    .map(def => {
      const eraBooks = readBooksList.filter(b => {
        const year = b.originalPublicationYear ?? b.yearPublished;
        return def.predicate(year);
      });
      return {
        era: def.era,
        count: eraBooks.length,
        books: eraBooks,
      };
    })
    .filter(bucket => bucket.count > 0);

  // 7. Top authors by total pages read
  const authorPageMap = new Map<
    string,
    { author: string; totalPages: number; bookCount: number; ratedBooks: number[] }
  >();

  for (const b of readBooksList) {
    const author = b.author.trim();
    if (!author) continue;

    const key = author.toLowerCase();
    const entry = authorPageMap.get(key) || {
      author,
      totalPages: 0,
      bookCount: 0,
      ratedBooks: [],
    };

    entry.totalPages += b.pageCount ?? 0;
    entry.bookCount += 1;
    if (b.myRating !== null && b.myRating >= 1) {
      entry.ratedBooks.push(b.myRating);
    }
    authorPageMap.set(key, entry);
  }

  const topAuthorsByPages = Array.from(authorPageMap.values())
    .map(e => ({
      author: e.author,
      totalPages: e.totalPages,
      bookCount: e.bookCount,
      avgRating:
        e.ratedBooks.length > 0
          ? Number(
              (
                e.ratedBooks.reduce((sum, r) => sum + r, 0) / e.ratedBooks.length
              ).toFixed(2)
            )
          : null,
    }))
    .sort((a, b) => b.totalPages - a.totalPages)
    .slice(0, 15);

  // 8. DNF books
  const dnfBooks = bundle.books
    .filter(
      b =>
        b.exclusiveShelf === 'did-not-finish' ||
        b.exclusiveShelf === 'dnf' ||
        b.exclusiveShelf === 'abandoned'
    )
    .sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));

  const totalBooks = bundle.books.length;
  const readBooks = readBooksList.length;
  const toReadBooks = bundle.books.filter(b => b.exclusiveShelf === 'to-read').length;
  const currentlyReading = bundle.books.filter(b => b.exclusiveShelf === 'currently-reading').length;
  const didNotFinish = dnfBooks.length;
  const meanRating =
    totalRated > 0
      ? Number((ratedBooks.reduce((s, b) => s + b.myRating!, 0) / totalRated).toFixed(2))
      : 0;
  const canonCount = fiveStarCanon.length;

  return {
    ratingBuckets,
    fiveStarCanon,
    sprintReads,
    slowBurnReads,
    rereadHallOfFame,
    eraBuckets,
    topAuthorsByPages,
    dnfBooks,
    totalBooks,
    readBooks,
    toReadBooks,
    currentlyReading,
    didNotFinish,
    meanRating,
    canonCount,
  };
}
