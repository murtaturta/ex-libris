import type {
  Book,
  BookFormat,
  EnrichmentCacheMap,
  ExternalDiscoveryEngine,
  ExternalDiscoveryPick,
  KindleClipping,
  LanguageCode,
  LetterboxdFilmWatch,
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
  translationMode?:
    | 'any'
    | 'original'
    | 'translated'
    | 'trusted-translator'
    | 'turkish-edition';
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
  isStalled?: boolean;
  stallReason?: string | null;
  hasCognitiveDrag?: boolean;
  cognitiveDragReason?: string | null;
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

export interface ReadingFlight {
  id: string;
  title: string;
  subtitle: string;
  rationale: string;
  books: Book[]; // 3 distinct unread TBR books (or 2 if TBR is tiny)
  totalPages: number;
  estimatedDays: number;
  badges: string[];
}

export interface SlumpIntermezzoPick {
  book: Book;
  pages: number;
  formatLabel: string;
  translationFlow: string;
  pitch: string;
}

export interface TranslatorLoyaltyItem {
  translator: string;
  readCount: number;
  toReadCount: number;
  avgRating: number | null;
  translationFlows: string[];
  sampleTitles: string[];
}

export interface LiterarySuperpower {
  id: string;
  title: string;
  dimension: 'tradition' | 'era' | 'format' | 'subject';
  readCount: number;
  avgMyRating: number;
  contrarianDelta: number;
  signatureBooks: Book[];
  summary: string;
}

export interface UnchartedHorizon {
  id: string;
  title: string;
  dimension: 'tradition' | 'era' | 'format' | 'subject';
  tbrCount: number;
  readCount: number;
  opportunityScore: number;
  sampleTbrBooks: Book[];
  callToAdventure: string;
}

export interface FrontierExpeditionPair {
  id: string;
  title: string;
  anchorBook: Book;
  frontierBook: Book;
  bridgeRationale: string;
  estimatedHours: number;
  horizonTag: string;
}

export interface LiteraryHorizonsReport {
  superpowers: LiterarySuperpower[];
  unchartedHorizons: UnchartedHorizon[];
  expeditionPairs: FrontierExpeditionPair[];
  explorationRatio: number;
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
 * Computes deep translator loyalty and affinity metrics across all books in the library.
 * Ranks translators by readCount (descending), then avg personal rating, then toReadCount.
 */
export function computeTranslatorLoyalty(
  bundle: LibraryBundle,
  userState?: UserLocalState
): TranslatorLoyaltyItem[] {
  const map = new Map<
    string,
    {
      displayName: string;
      readCount: number;
      toReadCount: number;
      ratings: number[];
      flows: Set<string>;
      sampleTitles: Set<string>;
    }
  >();

  for (const book of bundle.books) {
    const override = userState?.bookOverrides?.[book.id];
    const profile = classifyBookLanguageAndFormat(book, override);
    if (!profile.translators || profile.translators.length === 0) continue;

    const isRead = book.exclusiveShelf === 'read' || (book.readCount ?? 0) > 0;
    const isToRead = book.exclusiveShelf === 'to-read';

    for (const rawName of profile.translators) {
      const trimmed = rawName.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();

      let entry = map.get(key);
      if (!entry) {
        entry = {
          displayName: trimmed,
          readCount: 0,
          toReadCount: 0,
          ratings: [],
          flows: new Set<string>(),
          sampleTitles: new Set<string>(),
        };
        map.set(key, entry);
      }

      if (isRead) {
        entry.readCount += 1;
        if (book.myRating !== null && book.myRating >= 1 && book.myRating <= 5) {
          entry.ratings.push(book.myRating);
        }
      } else if (isToRead) {
        entry.toReadCount += 1;
      }

      if (profile.translationFlow) {
        entry.flows.add(profile.translationFlow);
      }

      const title = book.cleanTitle || book.title;
      if (title && entry.sampleTitles.size < 5) {
        entry.sampleTitles.add(title);
      }
    }
  }

  const items: TranslatorLoyaltyItem[] = Array.from(map.values()).map(entry => {
    const avgRating =
      entry.ratings.length > 0
        ? Number((entry.ratings.reduce((sum, r) => sum + r, 0) / entry.ratings.length).toFixed(2))
        : null;

    return {
      translator: entry.displayName,
      readCount: entry.readCount,
      toReadCount: entry.toReadCount,
      avgRating,
      translationFlows: Array.from(entry.flows),
      sampleTitles: Array.from(entry.sampleTitles),
    };
  });

  return items.sort((a, b) => {
    if (b.readCount !== a.readCount) {
      return b.readCount - a.readCount;
    }
    const rateA = a.avgRating ?? -1;
    const rateB = b.avgRating ?? -1;
    if (rateB !== rateA) {
      return rateB - rateA;
    }
    if (b.toReadCount !== a.toReadCount) {
      return b.toReadCount - a.toReadCount;
    }
    return a.translator.localeCompare(b.translator);
  });
}

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

  // Precompute user author ratings, series progress, and high-rated translators from read books
  const authorStats = new Map<string, { sumRating: number; count: number }>();
  const readSeriesNames = new Set<string>();
  const highRatedTranslators = new Map<string, string>();

  for (const b of bundle.books) {
    if (b.exclusiveShelf === 'read' || (b.readCount ?? 0) > 0) {
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

      if (b.myRating !== null && b.myRating >= 4) {
        const p = classifyBookLanguageAndFormat(
          b,
          userState?.bookOverrides?.[b.id],
          enrichmentCache?.[b.id]
        );
        if (p.translators && p.translators.length > 0) {
          for (const t of p.translators) {
            const trimmed = t.trim();
            if (trimmed) {
              highRatedTranslators.set(trimmed.toLowerCase(), trimmed);
            }
          }
        }
      }
    }
  }

  // Precompute translator loyalty for translationMode filtering
  const translatorLoyalty = computeTranslatorLoyalty(bundle, userState);
  const trustedTranslatorSet = new Set(
    translatorLoyalty
      .filter(t => t.readCount >= 1 && (t.avgRating === null || t.avgRating >= 3.5))
      .map(t => t.translator.toLowerCase())
  );

  const hasTrustedTranslatorCandidate =
    filters.translationMode === 'trusted-translator' &&
    candidates.some(b => {
      const p = classifyBookLanguageAndFormat(
        b,
        userState?.bookOverrides?.[b.id],
        enrichmentCache?.[b.id]
      );
      return (
        p.isTranslation &&
        p.translators &&
        p.translators.some(t => trustedTranslatorSet.has(t.trim().toLowerCase()))
      );
    });

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
      if (filters.translationMode === 'turkish-edition' && profile.editionLanguage !== 'TR') return false;
      if (filters.translationMode === 'trusted-translator') {
        if (!profile.isTranslation || !profile.translators || profile.translators.length === 0) {
          return false;
        }
        if (hasTrustedTranslatorCandidate) {
          const isTrusted = profile.translators.some(t =>
            trustedTranslatorSet.has(t.trim().toLowerCase())
          );
          if (!isTrusted) return false;
        }
      }
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

    // Translator affinity bonus: +12 for sharing a translator with a >= 4★ read book
    if (profile.isTranslation && profile.translators && profile.translators.length > 0) {
      for (const t of profile.translators) {
        const matched = highRatedTranslators.get(t.trim().toLowerCase());
        if (matched) {
          score += 12;
          reasons.push(`Translated by trusted conduit ${matched}`);
          break;
        }
      }
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

    // Nightstand Stall Detection (>40 days idle or >25 days on <25% progress)
    const isStalled = state === 'active' && (idleDays >= 40 || (idleDays >= 25 && percentComplete < 25));
    const stallReason = isStalled
      ? `Stalled on page ${currentPage} for ${idleDays} days. Shift to 'On Hold' to clear desk space?`
      : null;

    // Cognitive drag detection
    const hasCognitiveDrag =
      state === 'active' &&
      ((pacePagesPerDay < BASELINE_PAGES_PER_DAY[format] * 0.5 && idleDays >= 10) ||
        (idleDays >= 21 && percentComplete < 50) ||
        isHibernatingCandidate);

    let cognitiveDragReason: string | null = null;
    if (hasCognitiveDrag) {
      if (isHibernatingCandidate) {
        cognitiveDragReason =
          'Extended hibernation (>60 days idle) — consider parking on hold or reviving with an Intermezzo';
      } else if (idleDays >= 21 && percentComplete < 50) {
        cognitiveDragReason = 'Stalled 21+ days mid-volume (<50% complete) — high friction threshold';
      } else if (pacePagesPerDay < BASELINE_PAGES_PER_DAY[format] * 0.5 && idleDays >= 10) {
        const baseline = BASELINE_PAGES_PER_DAY[format] || 32;
        cognitiveDragReason = `Pace dropped below 50% ${FORMAT_LABELS[format] || format} baseline (${baseline} p/d) with 10+ days idle — consider a brisk <120p Intermezzo`;
      } else {
        cognitiveDragReason = 'Reading velocity stall detected — consider a brisk <120p Intermezzo';
      }
    }

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
      isStalled,
      stallReason,
      hasCognitiveDrag,
      cognitiveDragReason,
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
 * Selects top unread to-read palate-cleansers <= 150 pages (strongly prioritizing 40..120 pages,
 * trusted authors, novellas/essays/plays/comics) with a sharp 1-line curatorial pitch.
 */
export function getSlumpIntermezzos(
  bundle: LibraryBundle,
  userState?: UserLocalState,
  limit: number = 3
): SlumpIntermezzoPick[] {
  let candidates = bundle.books.filter(b => b.exclusiveShelf === 'to-read');
  if (candidates.length === 0) {
    candidates = bundle.books.filter(
      b =>
        b.exclusiveShelf !== 'read' &&
        b.exclusiveShelf !== 'did-not-finish' &&
        b.exclusiveShelf !== 'dnf'
    );
  }
  if (candidates.length === 0) return [];

  // Compute author ratings from read books
  const authorStats = new Map<string, { sum: number; count: number }>();
  for (const b of bundle.books) {
    if ((b.exclusiveShelf === 'read' || (b.readCount ?? 0) > 0) && b.author) {
      const key = b.author.trim().toLowerCase();
      if (b.myRating !== null && b.myRating >= 1) {
        const curr = authorStats.get(key) || { sum: 0, count: 0 };
        authorStats.set(key, { sum: curr.sum + b.myRating, count: curr.count + 1 });
      }
    }
  }

  // Pre-filter to books <= 150 pages if available
  const shortCandidates = candidates.filter(
    b => b.pageCount !== null && b.pageCount > 0 && b.pageCount <= 150
  );
  const pool = shortCandidates.length > 0 ? shortCandidates : candidates;

  const scored = pool.map(book => {
    const override = userState?.bookOverrides?.[book.id];
    const profile = classifyBookLanguageAndFormat(book, override);
    const pages = book.pageCount && book.pageCount > 0 ? book.pageCount : 90;
    let score = 50;

    // Sweet spot: 40..120 pages
    if (pages >= 40 && pages <= 120) {
      score += 40;
    } else if (pages < 40) {
      score += 25;
    } else if (pages <= 150) {
      score += 15;
    } else {
      score -= Math.min(60, Math.floor((pages - 150) / 10));
    }

    // Format suitability
    if (profile.format === 'short-essay') {
      score += 25;
    } else if (profile.format === 'comic-manga') {
      score += 20;
    }

    // Author loyalty
    const authKey = book.author?.trim().toLowerCase();
    const aStat = authKey ? authorStats.get(authKey) : null;
    const avgAuth = aStat && aStat.count > 0 ? aStat.sum / aStat.count : null;
    if (avgAuth !== null && avgAuth >= 4.0) {
      score += 30;
    } else if (avgAuth !== null && avgAuth >= 3.0) {
      score += 15;
    }

    // Acclaim
    if (book.averageRating && book.averageRating >= 4.0) {
      score += 15;
    }

    // Generate curatorial pitch
    const formatDesc =
      profile.format === 'short-essay'
        ? 'novella / essay'
        : profile.format === 'comic-manga'
        ? 'graphic work'
        : 'novella';

    let pitch: string;
    if (avgAuth !== null && avgAuth >= 4.0) {
      pitch = `A brisk ${pages}-page ${formatDesc} from trusted master ${book.author}—designed to reset your cognitive rhythm with zero narrative bloat.`;
    } else if (profile.format === 'comic-manga') {
      pitch = `A high-velocity ${pages}-page graphic work by ${book.author} to reignite visual narrative momentum.`;
    } else if (profile.format === 'short-essay' || pages <= 90) {
      pitch = `A razor-sharp ${pages}-page ${formatDesc} by ${book.author} delivering swift intellectual payoff in a single sitting.`;
    } else {
      pitch = `A compact ${pages}-page palate-cleanser by ${book.author} to break reading friction and restore velocity.`;
    }

    return {
      book,
      pages,
      score,
      formatLabel: FORMAT_LABELS[profile.format] || profile.format,
      translationFlow: profile.translationFlow,
      pitch,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ book, pages, formatLabel, translationFlow, pitch }) => ({
      book,
      pages,
      formatLabel,
      translationFlow,
      pitch,
    }));
}

/**
 * Generates 3-4 distinct curated 3-book Reading Flights from unread TBR books:
 * 1. The Momentum & Palate-Cleanser Flight (Anchor Epic + Sharp Novella + Agile Sprint)
 * 2. The Cross-Border Translation Flight (3 unread books across distinct translation flows)
 * 3. The Trusted Masters & Proven Voices Flight (Authors/translators user rated >=4★)
 * 4. The Archival Dust & Hidden Gems Flight (Oldest TBR acquisitions balanced for accessible commitment)
 */
export function generateReadingFlights(
  bundle: LibraryBundle,
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): ReadingFlight[] {
  let tbrBooks = bundle.books.filter(b => b.exclusiveShelf === 'to-read');
  if (tbrBooks.length === 0) {
    tbrBooks = bundle.books.filter(
      b =>
        b.exclusiveShelf !== 'read' &&
        b.exclusiveShelf !== 'did-not-finish' &&
        b.exclusiveShelf !== 'dnf'
    );
  }
  if (tbrBooks.length === 0) return [];

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

  // Precompute author ratings
  const authorStats = new Map<string, { sum: number; count: number }>();
  for (const b of bundle.books) {
    if ((b.exclusiveShelf === 'read' || (b.readCount ?? 0) > 0) && b.author) {
      const key = b.author.trim().toLowerCase();
      if (b.myRating !== null && b.myRating >= 1) {
        const curr = authorStats.get(key) || { sum: 0, count: 0 };
        authorStats.set(key, { sum: curr.sum + b.myRating, count: curr.count + 1 });
      }
    }
  }

  // Precompute translator loyalty
  const translatorLoyalty = computeTranslatorLoyalty(bundle, userState);
  const highRatedTranslators = new Set(
    translatorLoyalty
      .filter(t => t.readCount >= 1 && t.avgRating !== null && t.avgRating >= 4.0)
      .map(t => t.translator.toLowerCase())
  );

  const targetSize = Math.min(3, tbrBooks.length);

  const fillFlight = (selected: Book[], pool: Book[]): Book[] => {
    const usedIds = new Set(selected.map(b => b.id));
    const result = [...selected];
    for (const b of pool) {
      if (result.length >= targetSize) break;
      if (!usedIds.has(b.id)) {
        result.push(b);
        usedIds.add(b.id);
      }
    }
    return result;
  };

  const calcFlightStats = (books: Book[]) => {
    const totalPages = books.reduce((sum, b) => sum + (b.pageCount || 300), 0);
    const estimatedDays = books.reduce((sum, b) => {
      const p = classifyBookLanguageAndFormat(
        b,
        userState?.bookOverrides?.[b.id],
        enrichmentCache?.[b.id]
      );
      const pace = velocityMap[p.format] || 32;
      const days = Math.max(1, Math.ceil((b.pageCount || 300) / pace));
      return sum + days;
    }, 0);
    return { totalPages, estimatedDays };
  };

  const flights: ReadingFlight[] = [];

  // 1. The Momentum & Palate-Cleanser Flight
  {
    const anchors = [...tbrBooks]
      .filter(b => b.pageCount !== null && b.pageCount >= 380)
      .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0));

    const novellas = [...tbrBooks]
      .filter(b => b.pageCount !== null && b.pageCount > 0 && b.pageCount <= 180)
      .sort((a, b) => (a.pageCount ?? 0) - (b.pageCount ?? 0));

    const sprints = [...tbrBooks]
      .filter(b => {
        const p = classifyBookLanguageAndFormat(
          b,
          userState?.bookOverrides?.[b.id],
          enrichmentCache?.[b.id]
        );
        return (
          p.format === 'comic-manga' ||
          (b.pageCount !== null && b.pageCount > 180 && b.pageCount < 380)
        );
      })
      .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0));

    const selected: Book[] = [];
    if (anchors.length > 0) selected.push(anchors[0]);
    const novellaPick = novellas.find(b => !selected.some(s => s.id === b.id));
    if (novellaPick) selected.push(novellaPick);
    const sprintPick = sprints.find(b => !selected.some(s => s.id === b.id));
    if (sprintPick) selected.push(sprintPick);

    const flightBooks = fillFlight(selected, tbrBooks);
    const { totalPages, estimatedDays } = calcFlightStats(flightBooks);

    flights.push({
      id: 'flight-momentum',
      title: 'The Momentum & Palate-Cleanser Flight',
      subtitle: 'Anchor Epic + Sharp Novella + Agile Sprint',
      rationale:
        'Balances an ambitious, immersive epic with a swift novella and an agile sprint, neutralizing reading fatigue before it starts.',
      books: flightBooks,
      totalPages,
      estimatedDays,
      badges: ['Pacing Balance', 'Palate Cleanser', 'Momentum'],
    });
  }

  // 2. The Cross-Border Translation Flight
  {
    const candidates = [...tbrBooks].map(b => {
      const p = classifyBookLanguageAndFormat(
        b,
        userState?.bookOverrides?.[b.id],
        enrichmentCache?.[b.id]
      );
      return { book: b, profile: p };
    });

    const selected: Book[] = [];
    const usedFlows = new Set<string>();

    const sorted = [...candidates].sort((a, b) => {
      if (a.profile.isTranslation !== b.profile.isTranslation) {
        return a.profile.isTranslation ? -1 : 1;
      }
      return (b.book.averageRating ?? 0) - (a.book.averageRating ?? 0);
    });

    for (const item of sorted) {
      if (selected.length >= targetSize) break;
      const flow = item.profile.translationFlow || item.profile.originalLanguage;
      if (!usedFlows.has(flow)) {
        selected.push(item.book);
        usedFlows.add(flow);
      }
    }

    const flightBooks = fillFlight(selected, tbrBooks);
    const { totalPages, estimatedDays } = calcFlightStats(flightBooks);

    flights.push({
      id: 'flight-translation',
      title: 'The Cross-Border Translation Flight',
      subtitle: 'Polyglot Horizons & Linguistic Bridges',
      rationale:
        '3 unread books spanning distinct linguistic flows and translation conduits, exploring contrasting worldviews across cultural borders.',
      books: flightBooks,
      totalPages,
      estimatedDays,
      badges: ['Translation Bridges', 'Global Voices', 'Polyglot'],
    });
  }

  // 3. The Trusted Masters & Proven Voices Flight
  {
    const scoredMasters = [...tbrBooks].map(b => {
      let score = 0;
      const authKey = b.author?.trim().toLowerCase();
      const aStat = authKey ? authorStats.get(authKey) : null;
      if (aStat && aStat.count > 0) {
        const avg = aStat.sum / aStat.count;
        if (avg >= 4.0) score += 40;
        else if (avg >= 3.5) score += 20;
      }

      const p = classifyBookLanguageAndFormat(
        b,
        userState?.bookOverrides?.[b.id],
        enrichmentCache?.[b.id]
      );
      if (p.translators) {
        for (const t of p.translators) {
          if (highRatedTranslators.has(t.trim().toLowerCase())) {
            score += 25;
            break;
          }
        }
      }

      if (b.averageRating && b.averageRating >= 4.0) {
        score += b.averageRating * 5;
      }

      return { book: b, score };
    });

    const sorted = scoredMasters.sort((a, b) => b.score - a.score);
    const selected = sorted.slice(0, targetSize).map(s => s.book);
    const flightBooks = fillFlight(selected, tbrBooks);
    const { totalPages, estimatedDays } = calcFlightStats(flightBooks);

    flights.push({
      id: 'flight-trusted-masters',
      title: 'The Trusted Masters & Proven Voices Flight',
      subtitle: 'Authors & Conduits of Verified Caliber',
      rationale:
        'Zero-risk literary mastery guided by authors and translators you have already rewarded with your highest ratings (>= 4★).',
      books: flightBooks,
      totalPages,
      estimatedDays,
      badges: ['Trusted Authors', 'Mastery', 'High Acclaim'],
    });
  }

  // 4. The Archival Dust & Hidden Gems Flight
  {
    const now = Date.now();
    const sortedByAge = [...tbrBooks].sort((a, b) => {
      const timeA = a.dateAdded ? new Date(a.dateAdded).getTime() : now;
      const timeB = b.dateAdded ? new Date(b.dateAdded).getTime() : now;
      return timeA - timeB;
    });

    const selected: Book[] = [];
    let currentPages = 0;

    for (const book of sortedByAge) {
      if (selected.length >= targetSize) break;
      const pages = book.pageCount || 300;
      if (selected.length < targetSize - 1 && currentPages + pages > 1300 && sortedByAge.length > 5) {
        continue;
      }
      selected.push(book);
      currentPages += pages;
    }

    const flightBooks = fillFlight(selected, sortedByAge);
    const { totalPages, estimatedDays } = calcFlightStats(flightBooks);

    flights.push({
      id: 'flight-vintage-dust',
      title: 'The Archival Dust & Hidden Gems Flight',
      subtitle: 'Resurrecting Long-Cherished Shelf Acquisitions',
      rationale:
        'Patient shelf companions and vintage TBR acquisitions that have waited the longest for their moment, curated for accessible total commitment.',
      books: flightBooks,
      totalPages,
      estimatedDays,
      badges: ['Vintage TBR', 'Deep Archive', 'Patience Rewarded'],
    });
  }

  return flights;
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

/**
 * The Literary Frontier Radar & Uncharted Horizons Engine:
 * Analyzes the reader's proven literary superpowers, spotlights unexplored territories
 * waiting on their TBR (Uncharted Horizons), and constructs curated 4★-5★ anchor bridges
 * (Frontier Expedition Pairs) to guide next-step exploration.
 */
export function computeLiteraryHorizons(
  bundle: LibraryBundle,
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): LiteraryHorizonsReport {
  const readBooks = (bundle.books || []).filter(
    b => b.exclusiveShelf === 'read' || (b.readCount ?? 0) > 0
  );
  const tbrBooks = (bundle.books || []).filter(b => b.exclusiveShelf === 'to-read');

  if (readBooks.length === 0 && tbrBooks.length === 0) {
    return {
      superpowers: [],
      unchartedHorizons: [],
      expeditionPairs: [],
      explorationRatio: 0,
    };
  }

  // Pre-classify all books
  const classifiedRead = readBooks.map(b => ({
    book: b,
    profile: classifyBookLanguageAndFormat(
      b,
      userState?.bookOverrides?.[b.id],
      enrichmentCache?.[b.id]
    ),
    year: b.originalPublicationYear ?? b.yearPublished,
    subjects: (enrichmentCache?.[b.id]?.subjects || []).map(s => s.toLowerCase()),
  }));

  const classifiedTbr = tbrBooks.map(b => ({
    book: b,
    profile: classifyBookLanguageAndFormat(
      b,
      userState?.bookOverrides?.[b.id],
      enrichmentCache?.[b.id]
    ),
    year: b.originalPublicationYear ?? b.yearPublished,
    subjects: (enrichmentCache?.[b.id]?.subjects || []).map(s => s.toLowerCase()),
  }));

  // Helper for computing rating & contrarian delta
  const computeRatingStats = (items: typeof classifiedRead) => {
    const rated = items.filter(
      i => i.book.myRating !== null && i.book.myRating >= 1 && i.book.myRating <= 5
    );
    if (rated.length === 0) return { avg: 0, contrarianDelta: 0 };
    const avg = Number(
      (rated.reduce((sum, i) => sum + i.book.myRating!, 0) / rated.length).toFixed(2)
    );
    const deltas: number[] = [];
    for (const i of rated) {
      const comm =
        i.book.averageRating ?? enrichmentCache?.[i.book.id]?.communityRating ?? null;
      if (comm !== null && comm > 0) {
        deltas.push(i.book.myRating! - comm);
      }
    }
    const contrarianDelta =
      deltas.length > 0
        ? Number((deltas.reduce((sum, d) => sum + d, 0) / deltas.length).toFixed(2))
        : 0;
    return { avg, contrarianDelta };
  };

  // 1. Detect Superpowers
  const superpowerCandidates: LiterarySuperpower[] = [];

  // Superpower 1: Graphic Compendiums (format)
  {
    const graphicItems = classifiedRead.filter(i => i.profile.format === 'comic-manga');
    if (graphicItems.length >= 2) {
      const { avg, contrarianDelta } = computeRatingStats(graphicItems);
      if (avg >= 3.8) {
        const signatureBooks = [...graphicItems]
          .sort((a, b) => (b.book.myRating ?? 0) - (a.book.myRating ?? 0))
          .slice(0, 3)
          .map(i => i.book);
        superpowerCandidates.push({
          id: 'sp-graphic-velocity',
          title: 'Graphic Serial & Visual Compendiums',
          dimension: 'format',
          readCount: graphicItems.length,
          avgMyRating: avg,
          contrarianDelta,
          signatureBooks,
          summary:
            'Exceptional reading momentum and near-flawless satisfaction across sprawling graphic compendiums and visual epics.',
        });
      }
    }
  }

  // Superpower 2: Speculative & Post-Human Sci-Fi (subject)
  {
    const specItems = classifiedRead.filter(i => {
      const titleLower = (i.book.title || '').toLowerCase();
      const authorLower = (i.book.author || '').toLowerCase();
      const isSpecAuthor = [
        'dukaj',
        'martin',
        'herbert',
        'tolkien',
        'brooks',
        'asimov',
        'wells',
        'clarke',
        'cixin',
      ].some(a => authorLower.includes(a));
      const hasSpecSubject = i.subjects.some(s =>
        ['science fiction', 'fantasy', 'speculative', 'dystopian', 'post-apocalyptic'].some(kw =>
          s.includes(kw)
        )
      );
      return (
        isSpecAuthor ||
        hasSpecSubject ||
        titleLower.includes('dune') ||
        titleLower.includes('axolotl')
      );
    });

    if (specItems.length >= 2) {
      const { avg, contrarianDelta } = computeRatingStats(specItems);
      if (avg >= 3.8) {
        const signatureBooks = [...specItems]
          .sort((a, b) => (b.book.myRating ?? 0) - (a.book.myRating ?? 0))
          .slice(0, 3)
          .map(i => i.book);
        superpowerCandidates.push({
          id: 'sp-speculative-architecture',
          title: 'Speculative & Post-Human Sci-Fi',
          dimension: 'subject',
          readCount: specItems.length,
          avgMyRating: avg,
          contrarianDelta,
          signatureBooks,
          summary:
            'A profound affinity for intricate metaphysical world-building, high-concept timelines, and post-biological consciousness.',
        });
      }
    }
  }

  // Superpower 3: Continental Irony & Existential Wit (tradition)
  {
    const continentalItems = classifiedRead.filter(i => {
      const auth = (i.book.author || '').toLowerCase();
      const isContinentalWit =
        auth.includes('wilde') ||
        auth.includes('kafka') ||
        auth.includes('binet') ||
        auth.includes('maupassant') ||
        auth.includes('sartre') ||
        auth.includes('zweig') ||
        i.profile.originalLanguage === 'FR' ||
        i.profile.originalLanguage === 'DE';
      return isContinentalWit;
    });

    if (continentalItems.length >= 2) {
      const { avg, contrarianDelta } = computeRatingStats(continentalItems);
      if (avg >= 3.8) {
        const signatureBooks = [...continentalItems]
          .sort((a, b) => (b.book.myRating ?? 0) - (a.book.myRating ?? 0))
          .slice(0, 3)
          .map(i => i.book);
        superpowerCandidates.push({
          id: 'sp-continental-wit',
          title: 'Continental Irony & Existential Wit',
          dimension: 'tradition',
          readCount: continentalItems.length,
          avgMyRating: avg,
          contrarianDelta,
          signatureBooks,
          summary:
            'Mastery of European existential satire, razor-sharp dialogue, and historical metafiction that punctures societal vanity.',
        });
      }
    }
  }

  // Superpower 4: Anatolian Modernism & Turkish Voice (tradition)
  {
    const trItems = classifiedRead.filter(
      i => i.profile.originalLanguage === 'TR' || i.profile.editionLanguage === 'TR'
    );
    if (trItems.length >= 2) {
      const { avg, contrarianDelta } = computeRatingStats(trItems);
      if (avg >= 3.7) {
        const signatureBooks = [...trItems]
          .sort((a, b) => (b.book.myRating ?? 0) - (a.book.myRating ?? 0))
          .slice(0, 3)
          .map(i => i.book);
        superpowerCandidates.push({
          id: 'sp-turkish-voice',
          title: 'Anatolian Modernism & Contemporary Turkish Voice',
          dimension: 'tradition',
          readCount: trItems.length,
          avgMyRating: avg,
          contrarianDelta,
          signatureBooks,
          summary:
            'Deep emotional resonance with Turkish modernist introspection, nuanced cultural observation, and satirical wit.',
        });
      }
    }
  }

  // Superpower 5: Fin-de-Siècle & High Modernist Era (era)
  {
    const modernistItems = classifiedRead.filter(
      i => i.year !== null && i.year >= 1880 && i.year <= 1945
    );
    if (modernistItems.length >= 3) {
      const { avg, contrarianDelta } = computeRatingStats(modernistItems);
      if (avg >= 3.8) {
        const signatureBooks = [...modernistItems]
          .sort((a, b) => (b.book.myRating ?? 0) - (a.book.myRating ?? 0))
          .slice(0, 3)
          .map(i => i.book);
        superpowerCandidates.push({
          id: 'sp-modernist-era',
          title: 'Fin-de-Siècle & Early Modernism (1880–1945)',
          dimension: 'era',
          readCount: modernistItems.length,
          avgMyRating: avg,
          contrarianDelta,
          signatureBooks,
          summary:
            'A natural home in the psychological revolutions, aesthetic rebellion, and concise moral allegories of early 20th-century literature.',
        });
      }
    }
  }

  // Fallback superpower if library is small or specialized
  if (superpowerCandidates.length === 0 && readBooks.length > 0) {
    const { avg, contrarianDelta } = computeRatingStats(classifiedRead);
    const signatureBooks = [...classifiedRead]
      .sort((a, b) => (b.book.myRating ?? 0) - (a.book.myRating ?? 0))
      .slice(0, 3)
      .map(i => i.book);
    superpowerCandidates.push({
      id: 'sp-foundational-taste',
      title: 'Foundational Literary Taste',
      dimension: 'subject',
      readCount: readBooks.length,
      avgMyRating: avg,
      contrarianDelta,
      signatureBooks,
      summary: 'A curated core of foundational reading shaping your literary compass.',
    });
  }

  const superpowers = superpowerCandidates.slice(0, 4);

  // 2. Detect Uncharted Horizons (TBR lands waiting to be explored)
  const horizonCandidates: UnchartedHorizon[] = [];

  // Horizon 1: Slavic & Russian Existential Psychology (tradition)
  {
    const tbrSlavic = classifiedTbr.filter(i => {
      const auth = (i.book.author || '').toLowerCase();
      return (
        i.profile.originalLanguage === 'RU' ||
        i.profile.originalLanguage === 'PL' ||
        auth.includes('dostoevsky') ||
        auth.includes('goncharov') ||
        auth.includes('tolstoy') ||
        auth.includes('chekhov')
      );
    });
    const readSlavic = classifiedRead.filter(i => {
      const auth = (i.book.author || '').toLowerCase();
      return (
        i.profile.originalLanguage === 'RU' ||
        auth.includes('dostoevsky') ||
        auth.includes('goncharov') ||
        auth.includes('tolstoy')
      );
    });

    if (tbrSlavic.length >= 1) {
      const sampleTbrBooks = tbrSlavic.slice(0, 3).map(i => i.book);
      const oppScore = Math.min(96, 70 + tbrSlavic.length * 6 - readSlavic.length * 4);
      horizonCandidates.push({
        id: 'horizon-slavic-psychology',
        title: 'Slavic & Russian Existential Psychology',
        dimension: 'tradition',
        tbrCount: tbrSlavic.length,
        readCount: readSlavic.length,
        opportunityScore: oppScore,
        sampleTbrBooks,
        callToAdventure:
          "You love Kafka's existential claustrophobia and Dukaj's philosophical darkness—these monumental Russian explorations of guilt, spiritual inertia, and alienation are your shelf's most potent unmined vein.",
      });
    }
  }

  // Horizon 2: Classical Antiquity & Pre-Modern Foundations (era)
  {
    const tbrPreModern = classifiedTbr.filter(i => i.year !== null && i.year < 1800);
    const readPreModern = classifiedRead.filter(i => i.year !== null && i.year < 1800);

    if (tbrPreModern.length >= 1) {
      const sampleTbrBooks = tbrPreModern.slice(0, 3).map(i => i.book);
      const oppScore = Math.min(94, 68 + tbrPreModern.length * 5 - readPreModern.length * 3);
      horizonCandidates.push({
        id: 'horizon-classical-foundations',
        title: 'Classical Antiquity & Pre-Modern Archetypes',
        dimension: 'era',
        tbrCount: tbrPreModern.length,
        readCount: readPreModern.length,
        opportunityScore: oppScore,
        sampleTbrBooks,
        callToAdventure:
          'You rated Socrates 4★, yet Homer, Plato, and Cervantes sit patiently on your nightstand. Venturing into foundational archetypes will contextualize every satirical and modern work in your canon.',
      });
    }
  }

  // Horizon 3: Literary Theory & Narrative Architecture (subject)
  {
    const tbrTheory = classifiedTbr.filter(i => {
      const titleLower = (i.book.cleanTitle || i.book.title || '').toLowerCase();
      const auth = (i.book.author || '').toLowerCase();
      return (
        i.profile.format === 'academic-ref' ||
        auth.includes('auerbach') ||
        auth.includes('compagnon') ||
        auth.includes('göktürk') ||
        auth.includes('rousseau') ||
        titleLower.includes('mimesis') ||
        titleLower.includes('teorinin') ||
        titleLower.includes('çeviri')
      );
    });
    const readTheory = classifiedRead.filter(i => {
      const auth = (i.book.author || '').toLowerCase();
      return (
        i.profile.format === 'academic-ref' ||
        auth.includes('göktürk') ||
        auth.includes('compagnon') ||
        auth.includes('auerbach')
      );
    });

    if (tbrTheory.length >= 1) {
      const sampleTbrBooks = tbrTheory.slice(0, 3).map(i => i.book);
      const oppScore = Math.min(92, 65 + tbrTheory.length * 7 - readTheory.length * 5);
      horizonCandidates.push({
        id: 'horizon-literary-theory',
        title: 'Literary Theory & Narrative Architecture',
        dimension: 'subject',
        tbrCount: tbrTheory.length,
        readCount: readTheory.length,
        opportunityScore: oppScore,
        sampleTbrBooks,
        callToAdventure:
          'Given your acute sensitivity to narrative pacing and translation mechanics, exploring Auerbach and Compagnon turns the invisible craft of storytelling into conscious intellectual delight.',
      });
    }
  }

  // Horizon 4: Japanese Post-War & Graphic Existentialism (tradition)
  {
    const tbrJapan = classifiedTbr.filter(i => {
      const auth = (i.book.author || '').toLowerCase();
      return (
        i.profile.originalLanguage === 'JA' ||
        auth.includes('dazai') ||
        auth.includes('ito') ||
        auth.includes('mishima')
      );
    });
    const readJapan = classifiedRead.filter(i => i.profile.originalLanguage === 'JA');

    if (tbrJapan.length >= 1) {
      const sampleTbrBooks = tbrJapan.slice(0, 3).map(i => i.book);
      const oppScore = Math.min(90, 72 + tbrJapan.length * 6 - readJapan.length * 5);
      horizonCandidates.push({
        id: 'horizon-japanese-existentialism',
        title: 'Japanese Post-War & Graphic Existentialism',
        dimension: 'tradition',
        tbrCount: tbrJapan.length,
        readCount: readJapan.length,
        opportunityScore: oppScore,
        sampleTbrBooks,
        callToAdventure:
          'A striking confluence of graphic mastery and existential confession that bridges your passion for visual storytelling with unflinching psychological honesty.',
      });
    }
  }

  // Fallback horizons if library is small or has untagged TBR
  if (horizonCandidates.length === 0 && tbrBooks.length > 0) {
    const sample = tbrBooks.slice(0, 3);
    horizonCandidates.push({
      id: 'horizon-tbr-frontier',
      title: 'Uncharted TBR Frontiers',
      dimension: 'subject',
      tbrCount: tbrBooks.length,
      readCount: readBooks.length,
      opportunityScore: 75,
      sampleTbrBooks: sample,
      callToAdventure:
        'A waiting treasury of unread acquisitions ready to expand your active reading boundaries.',
    });
  }

  const unchartedHorizons = horizonCandidates
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 4);

  // 3. Construct 3 Frontier Expedition Pairs
  const expeditionPairs: FrontierExpeditionPair[] = [];
  const fourFiveStarRead = classifiedRead
    .filter(i => i.book.myRating !== null && i.book.myRating >= 4)
    .sort((a, b) => (b.book.myRating ?? 0) - (a.book.myRating ?? 0));

  // Pair 1: Cybernetics / Sci-Fi -> Existential Alienation / Theory
  {
    const anchor =
      fourFiveStarRead.find(
        i =>
          i.book.cleanTitle.toLowerCase().includes('axolotl') ||
          i.book.author.toLowerCase().includes('dukaj') ||
          i.profile.format === 'comic-manga' ||
          i.book.myRating === 5
      )?.book || fourFiveStarRead[0]?.book;

    const frontier =
      classifiedTbr.find(
        i =>
          i.book.title.toLowerCase().includes('longer human') ||
          i.book.title.toLowerCase().includes('no one knows') ||
          i.book.author.toLowerCase().includes('dazai') ||
          i.book.title.toLowerCase().includes('robot')
      )?.book || tbrBooks[0];

    if (anchor && frontier && anchor.id !== frontier.id) {
      const pages = frontier.pageCount || 250;
      expeditionPairs.push({
        id: 'expedition-cybernetics-existentialism',
        title: 'From Post-Human Hardware to Disqualified Humanity',
        anchorBook: anchor,
        frontierBook: frontier,
        bridgeRationale:
          'Dukaj explored human consciousness digitized into cold hardware; Dazai and Ito explore the inverse terror of being trapped in an alien social machine. Both confront what it means to be fundamentally alienated from humanity.',
        estimatedHours: Math.round((pages * 1.5) / 60) || 5,
        horizonTag: 'Japanese Post-War & Graphic Existentialism',
      });
    }
  }

  // Pair 2: Metafiction / History -> Critical Architecture / Mimesis
  {
    const anchor =
      fourFiveStarRead.find(
        i =>
          i.book.cleanTitle.toLowerCase().includes('hhhh') ||
          i.book.author.toLowerCase().includes('binet') ||
          i.book.author.toLowerCase().includes('atılgan') ||
          (i.book.myRating !== null &&
            i.book.myRating >= 4 &&
            !expeditionPairs.some(p => p.anchorBook.id === i.book.id))
      )?.book || fourFiveStarRead[1]?.book;

    const frontier =
      classifiedTbr.find(
        i =>
          i.book.title.toLowerCase().includes('mimesis') ||
          i.book.title.toLowerCase().includes('teorinin') ||
          i.book.title.toLowerCase().includes('quixote') ||
          (i.profile.format === 'academic-ref' &&
            !expeditionPairs.some(p => p.frontierBook.id === i.book.id))
      )?.book || tbrBooks.find(b => !expeditionPairs.some(p => p.frontierBook.id === b.id));

    if (anchor && frontier && anchor.id !== frontier.id) {
      const pages = frontier.pageCount || 300;
      expeditionPairs.push({
        id: 'expedition-metafiction-architecture',
        title: 'From Metafictional History to Critical Architecture',
        anchorBook: anchor,
        frontierBook: frontier,
        bridgeRationale:
          'Binet broke the fourth wall by obsessively analyzing how historical reality is reconstructed as he wrote; Auerbach gives you the master blueprint, tracing how Western literature has mirrored reality from Homer to the present.',
        estimatedHours: Math.round((pages * 1.5) / 60) || 8,
        horizonTag: 'Literary Theory & Narrative Architecture',
      });
    }
  }

  // Pair 3: Victorian Wit / Modernist Parable -> Russian Underground Psychology
  {
    const anchor =
      fourFiveStarRead.find(
        i =>
          (i.book.author.toLowerCase().includes('wilde') ||
            i.book.author.toLowerCase().includes('kafka')) &&
          !expeditionPairs.some(p => p.anchorBook.id === i.book.id)
      )?.book ||
      fourFiveStarRead.find(i => !expeditionPairs.some(p => p.anchorBook.id === i.book.id))?.book;

    const frontier =
      classifiedTbr.find(
        i =>
          (i.book.author.toLowerCase().includes('dostoevsky') ||
            i.book.title.toLowerCase().includes('underground') ||
            i.book.title.toLowerCase().includes('punishment') ||
            i.profile.originalLanguage === 'RU') &&
          !expeditionPairs.some(p => p.frontierBook.id === i.book.id)
      )?.book || tbrBooks.find(b => !expeditionPairs.some(p => p.frontierBook.id === b.id));

    if (anchor && frontier && anchor.id !== frontier.id) {
      const pages = frontier.pageCount || 280;
      expeditionPairs.push({
        id: 'expedition-aestheticism-underground',
        title: 'From Victorian Parlors to The Underground Cellar',
        anchorBook: anchor,
        frontierBook: frontier,
        bridgeRationale:
          'Wilde exposed moral rot and societal vanity in the sparkling salons of London; Dostoevsky takes that same psychological unraveling into the spiteful, claustrophobic cellar of the human soul.',
        estimatedHours: Math.round((pages * 1.5) / 60) || 6,
        horizonTag: 'Slavic & Russian Existential Psychology',
      });
    }
  }

  // 4. Compute Exploration Ratio (0-100)
  let explorationRatio = 0;
  if (readBooks.length > 0) {
    const uniqueLangs = new Set(classifiedRead.map(i => i.profile.originalLanguage));
    const uniqueFormats = new Set(classifiedRead.map(i => i.profile.format));
    const uniqueEras = new Set(
      classifiedRead
        .map(i => {
          const y = i.year;
          if (y === null) return 'unknown';
          if (y < 1800) return 'premodern';
          if (y < 1900) return '19th';
          if (y < 1960) return 'modern';
          if (y < 2000) return 'postmodern';
          return 'contemporary';
        })
        .filter(e => e !== 'unknown')
    );

    const langScore = Math.min(1, uniqueLangs.size / 4) * 35;
    const formatScore = Math.min(1, uniqueFormats.size / 3) * 30;
    const eraScore = Math.min(1, uniqueEras.size / 4) * 35;

    explorationRatio = Math.min(100, Math.max(15, Math.round(langScore + formatScore + eraScore)));
  }

  return {
    superpowers,
    unchartedHorizons,
    expeditionPairs,
    explorationRatio,
  };
}

/**
 * Calibrates external discovery recommendations ("Beyond Your Shelves"):
 * - Filters by engine ('author-backlist' | 'subject-dna' | 'dsar-graph' | 'all')
 * - Filters by sequelsOnly flag
 * - Filters by commitment ('sprint' <250p, 'deep' 250-500p, 'epic' >500p, allowing null page counts through)
 * - Applies gentle taste-affinity adjustment (boosting followed authors, 4★-5★ author loyalty, sequels, acclaim)
 * - Returns picks sorted by calibrated score descending.
 */
export function calibrateExternalDiscoveryPicks(
  picks: ExternalDiscoveryPick[],
  bundle: LibraryBundle,
  filters?: {
    commitment?: 'any' | 'sprint' | 'deep' | 'epic';
    sequelsOnly?: boolean;
    engine?: ExternalDiscoveryEngine | 'all';
  },
  userState?: UserLocalState
): ExternalDiscoveryPick[] {
  if (!picks || picks.length === 0) return [];

  // Build lookups from bundle
  const followedAuthors = new Set(
    (bundle.followedAuthors || [])
      .map(a => a.authorName?.trim().toLowerCase())
      .filter((n): n is string => Boolean(n))
  );

  const trustedAuthors = new Map<string, number>();
  for (const b of bundle.books || []) {
    if (b.exclusiveShelf === 'read' && b.author && b.myRating !== null && b.myRating >= 4) {
      const key = b.author.trim().toLowerCase();
      const curr = trustedAuthors.get(key) || 0;
      trustedAuthors.set(key, Math.max(curr, b.myRating));
    }
  }

  // 1. Filter picks
  const filtered = picks.filter(pick => {
    // Engine filter
    if (filters?.engine && filters.engine !== 'all') {
      if (pick.engine !== filters.engine) return false;
    }

    // Sequels only filter
    if (filters?.sequelsOnly) {
      if (!pick.isSequel) return false;
    }

    // Commitment filter
    if (filters?.commitment && filters.commitment !== 'any') {
      if (pick.pageCount !== null && pick.pageCount > 0) {
        if (filters.commitment === 'sprint' && pick.pageCount >= 250) return false;
        if (filters.commitment === 'deep' && (pick.pageCount < 250 || pick.pageCount > 500)) {
          return false;
        }
        if (filters.commitment === 'epic' && pick.pageCount <= 500) return false;
      }
    }

    return true;
  });

  // 2. Taste-Affinity Calibration
  const calibrated = filtered.map(pick => {
    let score = pick.score;
    const reasons = [...pick.reasons];
    const authorKey = pick.author ? pick.author.trim().toLowerCase() : '';

    // Author loyalty bonus
    if (authorKey && trustedAuthors.has(authorKey)) {
      const maxRate = trustedAuthors.get(authorKey)!;
      score += maxRate === 5 ? 20 : 15;
      if (
        !reasons.some(
          r => r.toLowerCase().includes('trusted master') || r.toLowerCase().includes('author')
        )
      ) {
        reasons.push(`By author ${pick.author} whom you rated ${maxRate}★`);
      }
    }

    // Followed author bonus
    if (authorKey && followedAuthors.has(authorKey)) {
      score += 12;
      if (!reasons.some(r => r.toLowerCase().includes('followed'))) {
        reasons.push(`From your followed author ${pick.author}`);
      }
    }

    // Sequel priority bonus
    if (pick.isSequel) {
      score += 18;
    }

    // Acclaim bonus
    if (pick.communityRating !== null) {
      if (pick.communityRating >= 4.2) {
        score += 10;
      } else if (pick.communityRating >= 4.0) {
        score += 5;
      }
    }

    // Anchor rating alignment
    if (pick.anchorRating && pick.anchorRating >= 4) {
      score += 10;
    }

    // Commitment sweet spot adjustment
    if (filters?.commitment && filters.commitment !== 'any') {
      if (pick.pageCount === null || pick.pageCount <= 0) {
        score -= 8; // Gentle penalty for unknown length when a specific budget is chosen
      } else {
        score += 6; // Confirmed page count alignment
      }
    }

    return {
      ...pick,
      score,
      reasons,
    };
  });

  return calibrated.sort((a, b) => b.score - a.score);
}

// ============================================================================
// Kindle Annotation Matrix & Reading Rhythm Analytics
// ============================================================================

export interface DayReadingActivity {
  date: string; // 'YYYY-MM-DD'
  highlightCount: number;
  booksFinishedCount: number;
  sessionsCount: number;
  wordsWrittenCount: number;
  intensityLevel: 0 | 1 | 2 | 3 | 4;
  writingIntensityLevel: 0 | 1 | 2 | 3 | 4;
  isDualMomentumDay: boolean;
  highlightedBooks: Array<{ title: string; count: number }>;
  finishedBooks: string[];
  // Letterboxd Cinema stream
  filmsWatchedCount: number;
  watchedFilms: LetterboxdFilmWatch[];
  cinemaIntensityLevel: 0 | 1 | 2 | 3 | 4;
  isCinemaDay: boolean;
}

export interface CalendarWeek {
  weekIndex: number;
  days: Array<DayReadingActivity | null>; // length 7 (0=Mon ... 6=Sun)
}

export interface YearCalendarGrid {
  year: number;
  weeks: CalendarWeek[];
  monthLabels: Array<{ monthIndex: number; name: string; weekIndex: number }>;
  totalHighlights: number;
  totalWordsWritten: number;
  totalFilmsWatched: number;
  activeReadingDaysCount: number;
  activeWritingDaysCount: number;
  activeCinemaDaysCount: number;
  dualMomentumDaysCount: number;
}

export interface TopAnnotatedBook {
  bookId?: string;
  title: string;
  author: string;
  highlightCount: number;
  notesCount: number;
  dateRange: { first: string; last: string } | null;
  locationRange: { min: number; max: number } | null;
  locations: number[];
}

export interface KindleHeatmapMetrics {
  totalHighlights: number;
  totalActiveDays: number;
  totalWordsWritten: number;
  totalWritingDays: number;
  totalFilmsWatched: number;
  totalCinemaDays: number;
  hasCinemaTelemetry: boolean;
  dualMomentumDaysCount: number;
  inspiredDaysCount: number;
  inspiredRatePct: number;
  maxHighlightsInSingleDay: number;
  maxWordsInSingleDay: number;
  mostActiveDay: { date: string; highlightCount: number; bookTitles: string[] } | null;
  longestStreakDays: number;
  currentStreakDays: number;
  availableYears: number[];
  allYearsGrids: Record<number, YearCalendarGrid>;
  hourlyDistribution: Array<{ hour: number; label: string; count: number; pct: number }>;
  writingHourlyDistribution: Array<{ hour: number; label: string; words: number; pct: number }>;
  peakHour: { hour: number; label: string; count: number };
  quietestHour: { hour: number; label: string; count: number };
  dayOfWeekDistribution: Array<{ dayIndex: number; name: string; shortName: string; count: number; pct: number }>;
  peakDayOfWeek: { dayIndex: number; name: string; count: number };
  topAnnotatedBooks: TopAnnotatedBook[];
  hasWritingTelemetry: boolean;
}

function createDefaultDayActivity(date: string): DayReadingActivity {
  return {
    date,
    highlightCount: 0,
    booksFinishedCount: 0,
    sessionsCount: 0,
    wordsWrittenCount: 0,
    intensityLevel: 0,
    writingIntensityLevel: 0,
    isDualMomentumDay: false,
    highlightedBooks: [],
    finishedBooks: [],
    filmsWatchedCount: 0,
    watchedFilms: [],
    cinemaIntensityLevel: 0,
    isCinemaDay: false,
  };
}

/**
 * Computes a comprehensive Kindle annotation matrix, GitHub-style reading calendar,
 * and circadian reading habits from Kindle clippings and finished books.
 */
export function computeKindleReadingHeatmap(
  userState?: UserLocalState,
  books: Book[] = []
): KindleHeatmapMetrics {
  const clippings = userState?.kindleClippings || [];
  const dayMap: Record<string, DayReadingActivity> = {};
  const hourlyCounts = Array(24).fill(0);
  const dayOfWeekCounts = Array(7).fill(0); // 0=Mon..6=Sun
  const bookMap = new Map<
    string,
    {
      bookId?: string;
      title: string;
      author: string;
      highlightCount: number;
      notesCount: number;
      firstDate: string | null;
      lastDate: string | null;
      locations: number[];
    }
  >();

  // Title-to-Book lookup cache
  const bookByTitle = new Map<string, Book>();
  const bookById = new Map<string, Book>();
  for (const b of books) {
    bookById.set(b.id, b);
    const ct = (b.cleanTitle || b.title || '').toLowerCase().trim();
    if (ct) bookByTitle.set(ct, b);
    const rt = (b.title || '').toLowerCase().trim();
    if (rt) bookByTitle.set(rt, b);
  }

  // 1. Process Kindle Clippings
  for (const clip of clippings) {
    if (!clip.addedAt) continue;
    const d = new Date(clip.addedAt);
    if (isNaN(d.getTime())) continue;

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${dayNum}`;

    // Circadian & Day of week
    const hour = d.getHours();
    hourlyCounts[hour]++;
    const monDayOfWeek = (d.getDay() + 6) % 7; // Mon=0, Tue=1 ... Sun=6
    dayOfWeekCounts[monDayOfWeek]++;

    // Book resolution
    const bookTitle = clip.cleanTitle || clip.rawTitle || 'Unknown Title';
    const cleanKey = bookTitle.toLowerCase().trim();
    const matchedBook =
      (clip.matchedBookId ? bookById.get(clip.matchedBookId) : null) ||
      bookByTitle.get(cleanKey);

    const bookAuthor = matchedBook?.author || clip.author || 'Unknown Author';
    const bookId = matchedBook?.id || clip.matchedBookId || undefined;

    // Day activity map
    if (!dayMap[dateKey]) {
      dayMap[dateKey] = createDefaultDayActivity(dateKey);
    }
    const dayEntry = dayMap[dateKey];
    dayEntry.highlightCount++;

    const existingBook = dayEntry.highlightedBooks.find((b) => b.title === bookTitle);
    if (existingBook) {
      existingBook.count++;
    } else {
      dayEntry.highlightedBooks.push({ title: bookTitle, count: 1 });
    }

    // Top annotated books aggregation
    const groupKey = bookId || cleanKey;
    if (!bookMap.has(groupKey)) {
      bookMap.set(groupKey, {
        bookId,
        title: matchedBook?.cleanTitle || matchedBook?.title || bookTitle,
        author: bookAuthor,
        highlightCount: 0,
        notesCount: 0,
        firstDate: dateKey,
        lastDate: dateKey,
        locations: [],
      });
    }
    const bEntry = bookMap.get(groupKey)!;
    bEntry.highlightCount++;
    if (clip.attachedNote && clip.attachedNote.trim().length > 0) {
      bEntry.notesCount++;
    }
    if (!bEntry.firstDate || dateKey < bEntry.firstDate) bEntry.firstDate = dateKey;
    if (!bEntry.lastDate || dateKey > bEntry.lastDate) bEntry.lastDate = dateKey;
    if (clip.locationStart) bEntry.locations.push(clip.locationStart);
    else if (clip.page) bEntry.locations.push(clip.page);
  }

  // 2. Interleave Finished Books (Goodreads dateRead)
  for (const b of books) {
    if (!b.dateRead) continue;
    const dr = b.dateRead.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dr)) {
      if (!dayMap[dr]) {
        dayMap[dr] = createDefaultDayActivity(dr);
      }
      dayMap[dr].booksFinishedCount++;
      dayMap[dr].finishedBooks.push(b.cleanTitle || b.title);
    }
  }

  // 3. Interleave Writing Telemetry (Obsidian Keep-the-Rhythm)
  const writingTelemetry = userState?.writingTelemetry;
  const writingDaily = writingTelemetry?.dailyTotals || {};
  let totalWordsWritten = writingTelemetry?.totalWords || 0;
  let writingActiveDays = 0;
  let maxWordsInDay = 0;

  for (const [dateStr, words] of Object.entries(writingDaily)) {
    if (words > 0) {
      writingActiveDays++;
      if (words > maxWordsInDay) maxWordsInDay = words;

      if (!dayMap[dateStr]) {
        dayMap[dateStr] = createDefaultDayActivity(dateStr);
      }
      dayMap[dateStr].wordsWrittenCount = words;

      if (words >= 751) dayMap[dateStr].writingIntensityLevel = 4;
      else if (words >= 301) dayMap[dateStr].writingIntensityLevel = 3;
      else if (words >= 151) dayMap[dateStr].writingIntensityLevel = 2;
      else if (words >= 1) dayMap[dateStr].writingIntensityLevel = 1;
    }
  }

  // 4. Interleave Letterboxd Cinema Stream
  const letterboxdWatches = userState?.letterboxdData?.watches || [];
  let totalFilmsWatched = 0;
  let totalCinemaDays = 0;

  for (const watch of letterboxdWatches) {
    const watchDate = (watch.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(watchDate)) continue;

    totalFilmsWatched++;
    if (!dayMap[watchDate]) {
      dayMap[watchDate] = createDefaultDayActivity(watchDate);
    }

    const dayEntry = dayMap[watchDate];
    dayEntry.filmsWatchedCount++;
    dayEntry.watchedFilms.push(watch);
    dayEntry.isCinemaDay = true;
  }

  for (const day of Object.values(dayMap)) {
    if (day.filmsWatchedCount > 0) {
      totalCinemaDays++;
      if (day.filmsWatchedCount >= 3) day.cinemaIntensityLevel = 4;
      else if (day.filmsWatchedCount === 2) day.cinemaIntensityLevel = 3;
      else if (day.filmsWatchedCount === 1) day.cinemaIntensityLevel = 2;
    }
  }

  // Dual Momentum & Inspired Drafting Lag
  let dualMomentumDaysCount = 0;
  let inspiredDaysCount = 0;

  for (const [dateStr, day] of Object.entries(dayMap)) {
    const hasRead = day.highlightCount > 0 || day.booksFinishedCount > 0;
    const hasWrote = day.wordsWrittenCount > 0;
    if (hasRead && hasWrote) {
      day.isDualMomentumDay = true;
      dualMomentumDaysCount++;
    }

    if (hasWrote) {
      const dObj = new Date(dateStr + 'T00:00:00');
      const prev1 = new Date(dObj);
      prev1.setDate(prev1.getDate() - 1);
      const prev2 = new Date(dObj);
      prev2.setDate(prev2.getDate() - 2);
      const p1 = prev1.toISOString().slice(0, 10);
      const p2 = prev2.toISOString().slice(0, 10);
      const d1 = dayMap[p1];
      const d2 = dayMap[p2];
      if (
        (d1 && (d1.highlightCount > 0 || d1.booksFinishedCount > 0)) ||
        (d2 && (d2.highlightCount > 0 || d2.booksFinishedCount > 0))
      ) {
        inspiredDaysCount++;
      }
    }
  }
  const inspiredRatePct =
    writingActiveDays > 0 ? Math.round((inspiredDaysCount / writingActiveDays) * 100) : 0;

  // 4. Assign Intensity Levels (0-4) for Reading
  for (const day of Object.values(dayMap)) {
    const totalScore = day.highlightCount + day.booksFinishedCount * 4;
    if (totalScore >= 11 || day.booksFinishedCount >= 2) {
      day.intensityLevel = 4;
    } else if (totalScore >= 6) {
      day.intensityLevel = 3;
    } else if (totalScore >= 3 || day.booksFinishedCount >= 1) {
      day.intensityLevel = 2;
    } else if (totalScore >= 1) {
      day.intensityLevel = 1;
    } else {
      day.intensityLevel = 0;
    }
  }

  // 4. Determine Active Days, Streaks & Most Prolific Day
  const sortedDates = Object.keys(dayMap).sort();
  let maxHighlights = 0;
  let mostActiveDay: { date: string; highlightCount: number; bookTitles: string[] } | null = null;
  let longestStreak = 0;
  let tempStreak = 0;

  for (let i = 0; i < sortedDates.length; i++) {
    const curDate = sortedDates[i];
    const item = dayMap[curDate];
    if (item.highlightCount > maxHighlights) {
      maxHighlights = item.highlightCount;
      mostActiveDay = {
        date: curDate,
        highlightCount: item.highlightCount,
        bookTitles: item.highlightedBooks.map((b) => b.title),
      };
    }

    if (i === 0) {
      tempStreak = 1;
    } else {
      const prevDateObj = new Date(sortedDates[i - 1]);
      const curDateObj = new Date(curDate);
      const diffMs = curDateObj.getTime() - prevDateObj.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    if (tempStreak > longestStreak) longestStreak = tempStreak;
  }

  // Calculate current streak
  let currentStreak = 0;
  if (sortedDates.length > 0) {
    const lastDateStr = sortedDates[sortedDates.length - 1];
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    if (lastDateStr === todayStr || lastDateStr === yesterdayStr) {
      currentStreak = tempStreak;
    }
  }

  // 5. Build Available Years & 52-Week Year Grids
  const yearsSet = new Set<number>();
  for (const dt of sortedDates) {
    const y = parseInt(dt.slice(0, 4), 10);
    if (!isNaN(y)) yearsSet.add(y);
  }
  // If no dates, at least add current year
  if (yearsSet.size === 0) yearsSet.add(new Date().getFullYear());

  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);
  const allYearsGrids: Record<number, YearCalendarGrid> = {};

  for (const yr of availableYears) {
    const weeks: CalendarWeek[] = [];
    let currentWeek: Array<DayReadingActivity | null> = Array(7).fill(null);
    const monthLabels: Array<{ monthIndex: number; name: string; weekIndex: number }> = [];
    let lastMonth = -1;
    let yrHighlights = 0;
    let yrWords = 0;
    let yrFilms = 0;
    let yrActiveReadDays = 0;
    let yrActiveWriteDays = 0;
    let yrActiveCinemaDays = 0;
    let yrDualDays = 0;

    const start = new Date(yr, 0, 1);
    const end = new Date(yr, 11, 31);
    let weekIdx = 0;

    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      const dayOfWeek = (cur.getDay() + 6) % 7; // Mon=0..Sun=6
      const m = cur.getMonth();
      if (m !== lastMonth) {
        monthLabels.push({
          monthIndex: m,
          name: cur.toLocaleString('en-US', { month: 'short' }),
          weekIndex: weekIdx,
        });
        lastMonth = m;
      }

      const yStr = cur.getFullYear();
      const mStr = String(cur.getMonth() + 1).padStart(2, '0');
      const dStr = String(cur.getDate()).padStart(2, '0');
      const dKey = `${yStr}-${mStr}-${dStr}`;

      const existingData = dayMap[dKey];
      if (existingData) {
        currentWeek[dayOfWeek] = existingData;
        yrHighlights += existingData.highlightCount;
        yrWords += existingData.wordsWrittenCount;
        yrFilms += existingData.filmsWatchedCount;
        if (existingData.highlightCount > 0 || existingData.booksFinishedCount > 0) {
          yrActiveReadDays++;
        }
        if (existingData.wordsWrittenCount > 0) {
          yrActiveWriteDays++;
        }
        if (existingData.filmsWatchedCount > 0) {
          yrActiveCinemaDays++;
        }
        if (existingData.isDualMomentumDay) {
          yrDualDays++;
        }
      } else {
        currentWeek[dayOfWeek] = createDefaultDayActivity(dKey);
      }

      if (dayOfWeek === 6 || cur.getTime() === end.getTime()) {
        weeks.push({ weekIndex: weekIdx, days: currentWeek });
        currentWeek = Array(7).fill(null);
        weekIdx++;
      }
    }

    allYearsGrids[yr] = {
      year: yr,
      weeks,
      monthLabels,
      totalHighlights: yrHighlights,
      totalWordsWritten: yrWords,
      totalFilmsWatched: yrFilms,
      activeReadingDaysCount: yrActiveReadDays,
      activeWritingDaysCount: yrActiveWriteDays,
      activeCinemaDaysCount: yrActiveCinemaDays,
      dualMomentumDaysCount: yrDualDays,
    };
  }

  // 6. Circadian 24-Hour Distribution
  const totalHourlyEvents = hourlyCounts.reduce((s, c) => s + c, 0) || 1;
  const hourlyDistribution = hourlyCounts.map((count, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    count,
    pct: Math.round((count / totalHourlyEvents) * 100),
  }));

  const writingHourly = writingTelemetry?.hourlyTotals || Array(24).fill(0);
  const totalWritingHourlyWords = writingHourly.reduce((s, w) => s + w, 0) || 1;
  const writingHourlyDistribution = writingHourly.map((words, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, '0')}:00`,
    words,
    pct: Math.round((words / totalWritingHourlyWords) * 100),
  }));

  let maxHourIdx = 0;
  let minHourIdx = 0;
  for (let h = 0; h < 24; h++) {
    if (hourlyCounts[h] > hourlyCounts[maxHourIdx]) maxHourIdx = h;
    if (hourlyCounts[h] < hourlyCounts[minHourIdx]) minHourIdx = h;
  }

  // 7. Day of Week Distribution
  const dayNames = [
    { name: 'Monday', short: 'Mon' },
    { name: 'Tuesday', short: 'Tue' },
    { name: 'Wednesday', short: 'Wed' },
    { name: 'Thursday', short: 'Thu' },
    { name: 'Friday', short: 'Fri' },
    { name: 'Saturday', short: 'Sat' },
    { name: 'Sunday', short: 'Sun' },
  ];
  const totalDayEvents = dayOfWeekCounts.reduce((s, c) => s + c, 0) || 1;
  const dayOfWeekDistribution = dayOfWeekCounts.map((count, idx) => ({
    dayIndex: idx,
    name: dayNames[idx].name,
    shortName: dayNames[idx].short,
    count,
    pct: Math.round((count / totalDayEvents) * 100),
  }));

  let peakDayIdx = 0;
  for (let d = 0; d < 7; d++) {
    if (dayOfWeekCounts[d] > dayOfWeekCounts[peakDayIdx]) peakDayIdx = d;
  }

  // 8. Top Annotated Books
  const topAnnotatedBooks: TopAnnotatedBook[] = Array.from(bookMap.values())
    .map((b) => {
      const sortedLocs = b.locations.sort((x, y) => x - y);
      return {
        bookId: b.bookId,
        title: b.title,
        author: b.author,
        highlightCount: b.highlightCount,
        notesCount: b.notesCount,
        dateRange: b.firstDate && b.lastDate ? { first: b.firstDate, last: b.lastDate } : null,
        locationRange:
          sortedLocs.length > 0
            ? { min: sortedLocs[0], max: sortedLocs[sortedLocs.length - 1] }
            : null,
        locations: sortedLocs,
      };
    })
    .sort((a, b) => b.highlightCount - a.highlightCount)
    .slice(0, 12);

  return {
    totalHighlights: clippings.length,
    totalActiveDays: sortedDates.length,
    totalWordsWritten,
    totalWritingDays: writingActiveDays,
    totalFilmsWatched,
    totalCinemaDays,
    hasCinemaTelemetry: Boolean(userState?.letterboxdData && totalFilmsWatched > 0),
    dualMomentumDaysCount,
    inspiredDaysCount,
    inspiredRatePct,
    maxHighlightsInSingleDay: maxHighlights,
    maxWordsInSingleDay: maxWordsInDay,
    mostActiveDay,
    longestStreakDays: longestStreak,
    currentStreakDays: currentStreak,
    availableYears,
    allYearsGrids,
    hourlyDistribution,
    writingHourlyDistribution,
    peakHour: {
      hour: maxHourIdx,
      label: `${maxHourIdx.toString().padStart(2, '0')}:00`,
      count: hourlyCounts[maxHourIdx],
    },
    quietestHour: {
      hour: minHourIdx,
      label: `${minHourIdx.toString().padStart(2, '0')}:00`,
      count: hourlyCounts[minHourIdx],
    },
    dayOfWeekDistribution,
    peakDayOfWeek: {
      dayIndex: peakDayIdx,
      name: dayNames[peakDayIdx].name,
      count: dayOfWeekCounts[peakDayIdx],
    },
    topAnnotatedBooks,
    hasWritingTelemetry: Boolean(writingTelemetry && writingTelemetry.totalWords > 0),
  };
}

// ============================================================================
// PACING ARCHETYPES & READING FRICTION INDEX (SPRINT DIRECTIVES)
// ============================================================================

export type PacingArchetypeType = 'blitz' | 'steady' | 'savor';

export interface PacingArchetype {
  type: PacingArchetypeType;
  label: string;
  icon: string;
  badgeClass: string;
  description: string;
  days: number;
  pagesPerDay: number | null;
  groundingSource: 'kindle' | 'goodreads' | 'estimated';
  dateRange: { start: string; finish: string } | null;
}

export type DnfDropOffArchetype = 'early-exit' | 'midpoint-drift' | 'late-exit';

export interface DnfBookAnalysis {
  book: Book;
  pagesRead: number;
  totalPages: number;
  pagesSaved: number;
  percentAtExit: number;
  dropOffArchetype: DnfDropOffArchetype;
  dropOffLabel: string;
  frictionTags: string[];
}

export interface ReadingFrictionMetrics {
  dnfCount: number;
  totalAbandonedPages: number;
  totalPagesSaved: number;
  dnfBooks: DnfBookAnalysis[];
  dropOffCounts: {
    earlyExit: number;
    midpointDrift: number;
    lateExit: number;
  };
  frictionPatternCounts: { label: string; count: number }[];
}

/**
 * Computes a qualitative pacing archetype for a completed book:
 * - Blitz Read: <= 4 days or >= 80 pages/day
 * - Deep Savor / Long Haul: >= 30 days or < 15 pages/day
 * - Steady Cadence: 5-29 days or 15-79 pages/day
 * Grounded in Kindle highlight timestamp deltas or Goodreads session / dateRead deltas.
 */
export function computeBookPacingArchetype(
  book: Book,
  clippings: KindleClipping[] = []
): PacingArchetype {
  const totalPages = book.pageCount && book.pageCount > 0 ? book.pageCount : 250;
  let days = 0;
  let groundingSource: 'kindle' | 'goodreads' | 'estimated' = 'estimated';
  let dateRange: { start: string; finish: string } | null = null;

  // 1. Try Kindle clippings matching this book
  const normTitle = (book.cleanTitle || book.title || '').toLowerCase().trim();
  const bookClippings = clippings
    .filter((c) => {
      if (c.matchedBookId && c.matchedBookId === book.id) return true;
      if (c.cleanTitle && normTitle && c.cleanTitle.toLowerCase().trim() === normTitle) return true;
      if (c.rawTitle && normTitle && normTitle.length >= 10 && c.rawTitle.toLowerCase().includes(normTitle)) return true;
      return false;
    })
    .filter((c) => Boolean(c.addedAt));

  if (bookClippings.length >= 2) {
    const sorted = [...bookClippings].sort(
      (a, b) => new Date(a.addedAt!).getTime() - new Date(b.addedAt!).getTime()
    );
    const firstTime = new Date(sorted[0].addedAt!).getTime();
    const lastTime = new Date(sorted[sorted.length - 1].addedAt!).getTime();
    if (!Number.isNaN(firstTime) && !Number.isNaN(lastTime)) {
      const deltaDays = Math.max(1, Math.round((lastTime - firstTime) / (1000 * 60 * 60 * 24)) + 1);
      days = deltaDays;
      groundingSource = 'kindle';
      dateRange = {
        start: sorted[0].addedAt!.slice(0, 10),
        finish: sorted[sorted.length - 1].addedAt!.slice(0, 10),
      };
    }
  }

  // 2. Fallback to Goodreads readingSessions
  if (days <= 0 && book.readingSessions && book.readingSessions.length > 0) {
    const sessionWithDur = book.readingSessions.find(
      (s) => s.durationDays !== null && s.durationDays > 0
    );
    if (sessionWithDur) {
      days = sessionWithDur.durationDays!;
      groundingSource = 'goodreads';
      if (sessionWithDur.startedAt && sessionWithDur.endedAt) {
        dateRange = {
          start: sessionWithDur.startedAt.slice(0, 10),
          finish: sessionWithDur.endedAt.slice(0, 10),
        };
      }
    } else {
      const sessionWithDates = book.readingSessions.find((s) => s.startedAt && s.endedAt);
      if (sessionWithDates) {
        const start = new Date(sessionWithDates.startedAt!).getTime();
        const end = new Date(sessionWithDates.endedAt!).getTime();
        if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
          days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
          groundingSource = 'goodreads';
          dateRange = {
            start: sessionWithDates.startedAt!.slice(0, 10),
            finish: sessionWithDates.endedAt!.slice(0, 10),
          };
        }
      }
    }
  }

  // 3. Fallback to dateRead vs dateAdded (if plausible delta <= 180 days)
  if (days <= 0 && book.dateRead && book.dateAdded) {
    const start = new Date(book.dateAdded).getTime();
    const finish = new Date(book.dateRead).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(finish) && finish >= start) {
      const diff = Math.round((finish - start) / (1000 * 60 * 60 * 24));
      if (diff > 0 && diff <= 180) {
        days = diff;
        groundingSource = 'goodreads';
        dateRange = {
          start: book.dateAdded.slice(0, 10),
          finish: book.dateRead.slice(0, 10),
        };
      }
    }
  }

  // 4. Default estimated duration
  if (days <= 0) {
    days = Math.max(3, Math.round(totalPages / 30));
    groundingSource = 'estimated';
    if (book.dateRead) {
      dateRange = {
        start: book.dateRead.slice(0, 10),
        finish: book.dateRead.slice(0, 10),
      };
    }
  }

  const pagesPerDay = Math.max(1, Math.round(totalPages / days));

  let type: PacingArchetypeType = 'steady';
  let label = 'Steady Cadence';
  let icon = '🚶';
  let badgeClass = 'bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)] border-[var(--accent-secondary)]/30';
  let description = 'Measured pacing across consistent sessions';

  if (days <= 4 || pagesPerDay >= 80) {
    type = 'blitz';
    label = 'Blitz Read';
    icon = '⚡';
    badgeClass = 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30';
    description = 'Completed in rapid flow · high page velocity / page-turner';
  } else if (days >= 30 || pagesPerDay < 15) {
    type = 'savor';
    label = 'Deep Savor';
    icon = '☕';
    badgeClass = 'bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30';
    description = 'Read deliberately over an extended arc · companion or philosophical read';
  }

  return {
    type,
    label,
    icon,
    badgeClass,
    description,
    days,
    pagesPerDay,
    groundingSource,
    dateRange,
  };
}

/**
 * Computes Reading Friction Metrics and Abandonment Post-Mortem.
 * Re-frames DNF as editorial discernment, calculating pages saved and drop-off archetypes.
 */
export function computeReadingFrictionMetrics(
  bundle: LibraryBundle,
  userState?: UserLocalState
): ReadingFrictionMetrics {
  const dnfRaw = (bundle.books || []).filter(
    (b) => b.exclusiveShelf === 'did-not-finish' || b.exclusiveShelf === 'dnf'
  );

  let totalAbandonedPages = 0;
  let totalPagesSaved = 0;

  let earlyExitCount = 0;
  let midpointDriftCount = 0;
  let lateExitCount = 0;

  const patternMap: Record<string, number> = {};

  const dnfBooks: DnfBookAnalysis[] = dnfRaw.map((b) => {
    const totalPages = b.pageCount && b.pageCount > 0 ? b.pageCount : 250;
    totalAbandonedPages += totalPages;

    // Estimate or retrieve exit point
    let pagesRead = 0;
    const override = userState?.bookOverrides?.[b.id];
    if (override?.currentPage && override.currentPage > 0) {
      pagesRead = Math.min(totalPages, override.currentPage);
    } else if (override?.progressLogs && override.progressLogs.length > 0) {
      const maxLog = override.progressLogs.reduce((m, l) => Math.max(m, l.page), 0);
      if (maxLog > 0) pagesRead = Math.min(totalPages, maxLog);
    } else {
      // Check Kindle clippings if any were made before dropping
      const maxClipPage = (userState?.kindleClippings || [])
        .filter((c) => c.matchedBookId === b.id || (c.cleanTitle && b.cleanTitle && c.cleanTitle.toLowerCase() === b.cleanTitle.toLowerCase()))
        .reduce((max, c) => Math.max(max, c.page || 0), 0);
      if (maxClipPage > 0) {
        pagesRead = Math.min(totalPages, maxClipPage);
      } else {
        // Default conservative exit point: ~15% for early drop
        pagesRead = Math.max(15, Math.round(totalPages * 0.15));
      }
    }

    const percentAtExit = Math.min(100, Math.max(1, Math.round((pagesRead / totalPages) * 100)));
    const pagesSaved = Math.max(0, totalPages - pagesRead);
    totalPagesSaved += pagesSaved;

    // Classify drop-off archetype
    let dropOffArchetype: DnfDropOffArchetype = 'early-exit';
    let dropOffLabel = 'Early Exit · Premise Mismatch';
    if (percentAtExit < 25) {
      dropOffArchetype = 'early-exit';
      dropOffLabel = 'Early Exit (< 25%) · Premise / Syntax Mismatch';
      earlyExitCount++;
    } else if (percentAtExit <= 60) {
      dropOffArchetype = 'midpoint-drift';
      dropOffLabel = 'Midpoint Drift (25%–60%) · Pacing Slump';
      midpointDriftCount++;
    } else {
      dropOffArchetype = 'late-exit';
      dropOffLabel = 'Late Exit (> 60%) · Narrative Fatigue';
      lateExitCount++;
    }

    // Determine friction tags
    const frictionTags: string[] = [];
    if (totalPages >= 450) {
      frictionTags.push('Doorstopper Bulk (> 450 pp)');
      patternMap['Doorstopper Bulk (> 450 pp)'] = (patternMap['Doorstopper Bulk (> 450 pp)'] || 0) + 1;
    }
    const shelves = (b.bookshelves || []).map((s) => s.toLowerCase());
    if (
      b.publisher?.toLowerCase().includes('academic') ||
      shelves.some((s) => s.includes('non-fiction') || s.includes('theory') || s.includes('science') || s.includes('philosophy') || s.includes('reference'))
    ) {
      frictionTags.push('Dense Reference / Theory');
      patternMap['Dense Reference / Theory'] = (patternMap['Dense Reference / Theory'] || 0) + 1;
    }
    if (b.seriesName) {
      frictionTags.push('Series Fatigue');
      patternMap['Series Fatigue'] = (patternMap['Series Fatigue'] || 0) + 1;
    }
    if (b.myRating === 1) {
      frictionTags.push('Critical Dissonance (1★)');
      patternMap['Critical Dissonance (1★)'] = (patternMap['Critical Dissonance (1★)'] || 0) + 1;
    } else if (b.myRating === 2) {
      frictionTags.push('Editorial Exit (2★)');
      patternMap['Editorial Exit (2★)'] = (patternMap['Editorial Exit (2★)'] || 0) + 1;
    }
    if (b.myReview && b.myReview.trim().length > 20) {
      frictionTags.push('Documented Exit Note');
    }

    return {
      book: b,
      pagesRead,
      totalPages,
      pagesSaved,
      percentAtExit,
      dropOffArchetype,
      dropOffLabel,
      frictionTags,
    };
  });

  const frictionPatternCounts = Object.entries(patternMap)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return {
    dnfCount: dnfBooks.length,
    totalAbandonedPages,
    totalPagesSaved,
    dnfBooks,
    dropOffCounts: {
      earlyExit: earlyExitCount,
      midpointDrift: midpointDriftCount,
      lateExit: lateExitCount,
    },
    frictionPatternCounts,
  };
}
