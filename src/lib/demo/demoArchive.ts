import type {
  LibraryBundle,
  KindleClipping,
  WritingTelemetryData,
  BookUserOverride,
} from '../../types/library';
import { parseGoodreadsCsv, mergeBooksIntoBundle } from '../parsers/goodreadsCsv';
import { parseKindleClippings } from '../parsers/kindleClippings';

/**
 * Creates a clean, empty LibraryBundle for fresh static visits.
 */
export function createEmptyLibraryBundle(): LibraryBundle {
  return {
    schemaVersion: '0.2.0',
    generatedAt: new Date().toISOString(),
    summaryStats: {
      totalBooks: 0,
      distinctAuthors: 0,
      booksWithSeries: 0,
      shelves: { read: 0, toRead: 0, currentlyReading: 0, didNotFinish: 0 },
      ratings: { ratedCount: 0, unratedCount: 0, averageRating: null, distribution: {} },
      pages: {
        totalPagesRead: 0,
        totalLibraryPages: 0,
        booksWithPagesCount: 0,
        booksWithoutPagesCount: 0,
      },
    },
    books: [],
    quotes: [],
    kindleNotes: [],
    recommendations: [],
    readingGoals: [],
    achievements: [],
    followedAuthors: [],
    favoriteGenres: null,
    reviewDrafts: [],
    activityByHour: null,
    suggestedLists: [],
  };
}

export interface DemoArchivePayload {
  bundle: LibraryBundle;
  clippings: KindleClipping[];
  bookOverrides: Record<string, BookUserOverride>;
  writingTelemetry: WritingTelemetryData;
}

/**
 * Fetches the made-up demo files from `public/demo/` and runs them through
 * the real Ex Libris Goodreads CSV + Kindle Clippings parsers.
 */
export async function loadDemoArchive(): Promise<DemoArchivePayload> {
  const [csvRes, clippingsRes] = await Promise.all([
    fetch('./demo/demo_goodreads_library.csv'),
    fetch('./demo/demo_my_clippings.txt'),
  ]);

  if (!csvRes.ok) {
    throw new Error(`Failed to fetch demo library CSV (HTTP ${csvRes.status})`);
  }

  const csvText = await csvRes.text();
  const clippingsText = clippingsRes.ok ? await clippingsRes.text() : '';

  const parsedBooks = parseGoodreadsCsv(csvText);
  const baseBundle = createEmptyLibraryBundle();
  const merged = mergeBooksIntoBundle(baseBundle, parsedBooks);

  // Add realistic readingGoals for 2025 & 2026 so Targets & Observatory light up
  const bundle: LibraryBundle = {
    ...merged,
    readingGoals: [
      {
        goalId: 'TITLES_READ_YEAR_2026',
        goalValue: 24,
        createDate: '2026-01-01T09:00:00Z',
        lastModifiedDate: '2026-01-01T09:00:00Z',
        hasBeenCongratulated: false,
      },
      {
        goalId: 'TITLES_READ_YEAR_2025',
        goalValue: 15,
        createDate: '2025-01-01T09:00:00Z',
        lastModifiedDate: '2025-12-31T09:00:00Z',
        hasBeenCongratulated: false,
      },
    ],
  };

  // Add active page-progress overrides for the two currently-reading demo titles
  const bookOverrides: Record<string, BookUserOverride> = {};
  for (const b of bundle.books) {
    if (b.exclusiveShelf === 'currently-reading') {
      if (b.title.includes('Dispossessed')) {
        bookOverrides[b.id] = {
          nightstandState: 'active',
          currentPage: 164,
          progressLogs: [
            { date: '2026-11-05', page: 48 },
            { date: '2026-11-12', page: 112 },
            { date: '2026-11-18', page: 164 },
          ],
        };
      } else if (b.title.includes('Piranesi')) {
        bookOverrides[b.id] = {
          nightstandState: 'active',
          currentPage: 92,
          progressLogs: [
            { date: '2026-11-11', page: 35 },
            { date: '2026-11-19', page: 92 },
          ],
        };
      }
    }
  }

  const clippings = clippingsText ? parseKindleClippings(clippingsText, bundle.books) : [];

  const writingTelemetry: WritingTelemetryData = {
    version: '1.0',
    updatedAt: new Date().toISOString(),
    source: 'demo-scriptor',
    totalWords: 12480,
    totalChars: 74880,
    dailyGoal: 300,
    completedGoalDaysCount: 19,
    completedGoalDates: [
      '2026-02-12',
      '2026-02-14',
      '2026-03-22',
      '2026-04-15',
      '2026-06-08',
      '2026-08-04',
      '2026-09-16',
      '2026-11-14',
      '2026-11-17',
      '2026-11-19',
    ],
    activeDaysCount: 28,
    dailyTotals: {
      '2026-02-12': 420,
      '2026-02-14': 580,
      '2026-03-22': 640,
      '2026-04-15': 390,
      '2026-06-08': 510,
      '2026-08-04': 460,
      '2026-09-16': 530,
      '2026-11-14': 490,
      '2026-11-17': 610,
      '2026-11-19': 440,
    },
    hourlyTotals: [
      0, 0, 0, 0, 0, 0, 0, 120, 480, 960, 1420, 1180, 740, 520, 680, 890, 1120, 940, 810, 720, 980,
      620, 240, 60,
    ],
    projects: [
      {
        name: 'Marginalia & Translation Notes',
        words: 7820,
        filesCount: 6,
        activeDaysCount: 18,
      },
      {
        name: 'Calvino & Spatial Cities',
        words: 4660,
        filesCount: 3,
        activeDaysCount: 10,
      },
    ],
    matchedReviews: {},
  };

  return {
    bundle,
    clippings,
    bookOverrides,
    writingTelemetry,
  };
}
