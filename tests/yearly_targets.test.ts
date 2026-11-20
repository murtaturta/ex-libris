import { describe, it, expect } from 'vitest';
import { computeYearlyTargetAnalytics } from '../src/lib/analytics/yearlyTargets';
import type { Book, LibraryBundle, UserLocalState } from '../src/types/library';

describe('Yearly Targets & Entire TBR Reading Time', () => {
  const sampleBundle = ({
    readingGoals: [
      { goalId: 'TITLES_READ_YEAR_2025', goalValue: 25, createDate: '2025-01-01', lastModifiedDate: '2025-01-01', hasBeenCongratulated: false },
      { goalId: 'TITLES_READ_YEAR_2026', goalValue: 50, createDate: '2026-01-01', lastModifiedDate: '2026-01-01', hasBeenCongratulated: false },
    ],
    books: [
      {
        id: 'r1',
        title: 'Dune',
        cleanTitle: 'Dune',
        author: 'Frank Herbert',
        pageCount: 600,
        exclusiveShelf: 'read',
        dateRead: '2026/02/15',
      },
      {
        id: 'r2',
        title: 'Solaris',
        cleanTitle: 'Solaris',
        author: 'Stanislaw Lem',
        pageCount: 220,
        exclusiveShelf: 'read',
        dateRead: '2026/04/10',
      },
      {
        id: 'r3',
        title: 'Prev Year Book',
        cleanTitle: 'Prev Year Book',
        author: 'Author X',
        pageCount: 300,
        exclusiveShelf: 'read',
        dateRead: '2025/09/01',
      },
      {
        id: 'cr1',
        title: 'Children of Dune',
        cleanTitle: 'Children of Dune',
        author: 'Frank Herbert',
        pageCount: 600,
        exclusiveShelf: 'currently-reading',
        dateRead: null,
      },
      {
        id: 't1',
        title: 'Short Novella',
        cleanTitle: 'Short Novella',
        author: 'Author Y',
        pageCount: 120,
        exclusiveShelf: 'to-read',
        dateRead: null,
      },
      {
        id: 't2',
        title: 'Unknown Length Book',
        cleanTitle: 'Unknown Length Book',
        author: 'Author Z',
        pageCount: null,
        exclusiveShelf: 'to-read',
        dateRead: null,
      },
      {
        id: 'dnf1',
        title: 'Abandoned Tome',
        cleanTitle: 'Abandoned Tome',
        author: 'Author D',
        pageCount: 500,
        exclusiveShelf: 'did-not-finish',
        dateRead: '2026/03/12',
      },
    ] as unknown as Book[],
  } as unknown) as LibraryBundle;

  const sampleUserState: UserLocalState = {
    version: '0.2.0',
    updatedAt: '2026-11-20T00:00:00Z',
    showCovers: false,
    bookOverrides: {
      cr1: { currentPage: 100 }, // 500 remaining pages
    },
    kindleClippings: [],
    kindleTelemetry: {
      updatedAt: '2026-11-20T00:00:00Z',
      medianWpm: 224,
      totalHoursRead: 77,
      totalWordsRead: 1000000,
      trackedBooksCount: 25,
      books: {},
    },
    yearlyPageGoal: 10000,
  };

  it('computes 2026 titles, pages, hours, year-over-year, and entire TBR duration', () => {
    const refDate = new Date(2026, 10, 20, 12, 0, 0, 0); // Nov 20, 2026
    const res = computeYearlyTargetAnalytics(sampleBundle, sampleUserState, refDate, 2026, 1.0);

    expect(res.targetYear).toBe(2026);
    expect(res.titlesCompleted).toBe(2);
    expect(res.dnfCount).toBe(1);
    expect(res.titlesGoal).toBe(50);
    expect(res.pagesCompleted).toBe(820); // 600 + 220
    expect(res.pagesGoal).toBe(10000);
    expect(res.effectiveWpm).toBe(224);
    expect(res.isKindleWpmCalibrated).toBe(true);
    expect(res.estimatedHoursRead).toBeGreaterThan(15);

    // TBR: cr1 (500 remaining) + t1 (120) + t2 (300 fallback) = 920 pages
    expect(res.tbrSummary.toReadCount).toBe(2);
    expect(res.tbrSummary.currentlyReadingCount).toBe(1);
    expect(res.tbrSummary.currentlyReadingRemainingPages).toBe(500);
    expect(res.tbrSummary.toReadPages).toBe(420);
    expect(res.tbrSummary.totalBacklogPages).toBe(920);
    expect(res.tbrSummary.missingPageCountBooks).toBe(1);
    expect(res.tbrSummary.totalEstimatedHours).toBeCloseTo((920 * 275) / 224 / 60, 0);

    // Finishable before Dec 31 (~41 days * 1h = 41h budget): all 3 fit individually
    expect(res.finishableCandidates).toHaveLength(3);
    expect(res.finishableCandidates[0].book.id).toBe('cr1'); // currently-reading first
    expect(res.finishableCandidates.every((c) => c.fitsBudget)).toBe(true);

    // Year-over-year includes 2026 and 2025
    expect(res.yearOverYear.find((y) => y.year === 2025)?.titlesCompleted).toBe(1);
    expect(res.yearOverYear.find((y) => y.year === 2025)?.titlesGoal).toBe(25);
  });
});
