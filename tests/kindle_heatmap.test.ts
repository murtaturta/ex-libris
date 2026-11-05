import { describe, it, expect } from 'vitest';
import { computeKindleReadingHeatmap } from '../src/lib/analytics/engine';
import type { Book, UserLocalState, KindleClipping } from '../src/types/library';

describe('Kindle Reading Matrix & Heatmap Engine', () => {
  const mockBooks: Book[] = [
    {
      id: 'book-1',
      title: 'Trust',
      cleanTitle: 'Trust',
      seriesName: null,
      seriesNumber: null,
      author: 'Hernan Diaz',
      authorSort: null,
      additionalAuthors: [],
      isbn: null,
      isbn13: null,
      myRating: 5,
      averageRating: 4.1,
      publisher: null,
      binding: null,
      pageCount: 416,
      yearPublished: 2022,
      originalPublicationYear: 2022,
      dateRead: '2026-03-27',
      dateAdded: '2026-01-10',
      exclusiveShelf: 'read',
      bookshelves: ['favorites'],
      bookshelvesWithPositions: null,
      readCount: 1,
      ownedCopies: 1,
      myReview: 'Exceptional nested structure.',
      spoiler: false,
      privateNotes: null,
      shelving: null,
      reviewDetails: null,
      readingSessions: [],
      kindleNotes: [],
      recommendations: [],
    },
    {
      id: 'book-2',
      title: 'No Longer Human',
      cleanTitle: 'No Longer Human',
      seriesName: null,
      seriesNumber: null,
      author: 'Osamu Dazai',
      authorSort: null,
      additionalAuthors: [],
      isbn: null,
      isbn13: null,
      myRating: 5,
      averageRating: 4.15,
      publisher: null,
      binding: null,
      pageCount: 176,
      yearPublished: 1948,
      originalPublicationYear: 1948,
      dateRead: '2025-11-18',
      dateAdded: '2025-10-01',
      exclusiveShelf: 'read',
      bookshelves: [],
      bookshelvesWithPositions: null,
      readCount: 1,
      ownedCopies: 1,
      myReview: null,
      spoiler: false,
      privateNotes: null,
      shelving: null,
      reviewDetails: null,
      readingSessions: [],
      kindleNotes: [],
      recommendations: [],
    },
  ];

  const mockClippings: KindleClipping[] = [
    {
      id: 'clip-1',
      type: 'highlight',
      rawTitle: 'Trust',
      cleanTitle: 'Trust',
      author: 'Hernan Diaz',
      matchedBookId: 'book-1',
      content: 'First passage in Trust',
      page: null,
      locationStart: 120,
      locationEnd: 125,
      addedAt: '2026-03-22T10:15:00.000Z',
      highlightColor: 'yellow',
      attachedNote: null,
    },
    {
      id: 'clip-2',
      type: 'highlight',
      rawTitle: 'Trust',
      cleanTitle: 'Trust',
      author: 'Hernan Diaz',
      matchedBookId: 'book-1',
      content: 'Second passage in Trust',
      page: null,
      locationStart: 450,
      locationEnd: 455,
      addedAt: '2026-03-22T12:40:00.000Z',
      highlightColor: 'yellow',
      attachedNote: 'Crucial turning point',
    },
    {
      id: 'clip-3',
      type: 'highlight',
      rawTitle: 'Trust',
      cleanTitle: 'Trust',
      author: 'Hernan Diaz',
      matchedBookId: 'book-1',
      content: 'Third passage in Trust',
      page: null,
      locationStart: 1200,
      locationEnd: 1210,
      addedAt: '2026-03-23T10:30:00.000Z', // consecutive day
      highlightColor: 'pink',
      attachedNote: null,
    },
    {
      id: 'clip-4',
      type: 'highlight',
      rawTitle: 'No Longer Human',
      cleanTitle: 'No Longer Human',
      author: 'Osamu Dazai',
      matchedBookId: 'book-2',
      content: 'Mine has been a life of much shame.',
      page: 15,
      locationStart: 45,
      locationEnd: 48,
      addedAt: '2025-11-16T12:10:00.000Z',
      highlightColor: 'yellow',
      attachedNote: null,
    },
  ];

  const mockUserState: UserLocalState = {
    version: '1.0',
    updatedAt: '2026-03-22T00:00:00.000Z',
    bookOverrides: {},
    kindleClippings: mockClippings,
    showCovers: false,
    externalWantList: [],
  };

  it('handles empty or missing user state gracefully', () => {
    const emptyResult = computeKindleReadingHeatmap(undefined, []);
    expect(emptyResult.totalHighlights).toBe(0);
    expect(emptyResult.totalActiveDays).toBe(0);
    expect(emptyResult.maxHighlightsInSingleDay).toBe(0);
    expect(emptyResult.longestStreakDays).toBe(0);
    expect(emptyResult.topAnnotatedBooks).toHaveLength(0);
    expect(emptyResult.hourlyDistribution).toHaveLength(24);
    expect(emptyResult.dayOfWeekDistribution).toHaveLength(7);
  });

  it('aggregates total highlights, active days, and streak correctly', () => {
    const result = computeKindleReadingHeatmap(mockUserState, mockBooks);

    expect(result.totalHighlights).toBe(4);
    // 2026-03-22, 2026-03-23, 2025-11-16 + finished book dates (2026-03-27, 2025-11-18)
    expect(result.totalActiveDays).toBeGreaterThanOrEqual(3);
    // 2026-03-22 has 2 highlights
    expect(result.maxHighlightsInSingleDay).toBe(2);
    // 2026-03-22 to 2026-03-23 is 2 consecutive days
    expect(result.longestStreakDays).toBeGreaterThanOrEqual(2);
  });

  it('generates accurate 52-week calendar grids by year', () => {
    const result = computeKindleReadingHeatmap(mockUserState, mockBooks);

    expect(result.availableYears).toContain(2026);
    expect(result.availableYears).toContain(2025);

    const grid2026 = result.allYearsGrids[2026];
    expect(grid2026).toBeDefined();
    expect(grid2026.weeks.length).toBeGreaterThanOrEqual(52);
    expect(grid2026.monthLabels.length).toBe(12);

    // Verify 2026-03-22 entry exists with 2 highlights
    let foundMarch22 = false;
    for (const week of grid2026.weeks) {
      for (const day of week.days) {
        if (day && day.date === '2026-03-22') {
          foundMarch22 = true;
          expect(day.highlightCount).toBe(2);
          expect(day.intensityLevel).toBeGreaterThanOrEqual(1);
          expect(day.highlightedBooks[0].title).toBe('Trust');
        }
      }
    }
    expect(foundMarch22).toBe(true);
  });

  it('interleaves completed volume dates from Goodreads into the matrix', () => {
    const result = computeKindleReadingHeatmap(mockUserState, mockBooks);

    const grid2026 = result.allYearsGrids[2026];
    let foundFinishDate = false;
    for (const week of grid2026.weeks) {
      for (const day of week.days) {
        if (day && day.date === '2026-03-27') {
          foundFinishDate = true;
          expect(day.booksFinishedCount).toBe(1);
          expect(day.finishedBooks).toContain('Trust');
          expect(day.intensityLevel).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(foundFinishDate).toBe(true);
  });

  it('ranks top annotated books and calculates passage location ranges', () => {
    const result = computeKindleReadingHeatmap(mockUserState, mockBooks);

    expect(result.topAnnotatedBooks.length).toBe(2);
    const topBook = result.topAnnotatedBooks[0];
    expect(topBook.title).toBe('Trust');
    expect(topBook.highlightCount).toBe(3);
    expect(topBook.notesCount).toBe(1);
    expect(topBook.locationRange).toEqual({ min: 120, max: 1200 });
    expect(topBook.locations).toEqual([120, 450, 1200]);
  });

  it('computes 24-hour and day-of-week circadian metrics without distortion', () => {
    const result = computeKindleReadingHeatmap(mockUserState, mockBooks);

    const totalHourlyCount = result.hourlyDistribution.reduce((s, h) => s + h.count, 0);
    expect(totalHourlyCount).toBe(4);

    const totalDayCount = result.dayOfWeekDistribution.reduce((s, d) => s + d.count, 0);
    expect(totalDayCount).toBe(4);

    expect(result.peakHour).toBeDefined();
    expect(result.peakDayOfWeek).toBeDefined();
  });

  it('integrates writing telemetry and calculates dual momentum & inspiration lag', () => {
    const userStateWithWriting: UserLocalState = {
      ...mockUserState,
      writingTelemetry: {
        version: '1.0',
        updatedAt: '2026-03-23T15:00:00.000Z',
        source: 'keep-the-rhythm',
        totalWords: 1500,
        totalChars: 8500,
        dailyGoal: 300,
        completedGoalDaysCount: 2,
        completedGoalDates: ['2026-03-22', '2026-03-24'],
        activeDaysCount: 2,
        dailyTotals: {
          '2026-03-22': 500, // Simultaneous reading (clip-1, clip-2) & writing day!
          '2026-03-24': 1000, // Inspired day (within 48h after 2026-03-23 clip-3)
        },
        hourlyTotals: Array(24).fill(0),
        projects: [
          { name: 'Ioren', words: 1000, filesCount: 3, activeDaysCount: 1 },
          { name: 'yenimegaproje2025', words: 500, filesCount: 2, activeDaysCount: 1 },
        ],
        matchedReviews: {
          'book-1': {
            bookId: 'book-1',
            bookTitle: 'Trust',
            vaultFilePath: 'Benim Yazılar/Trust Review.md',
            wordsCount: 500,
            content: 'Brilliant multi-layered perspective on American finance.',
            obsidianUri: 'obsidian://open?vault=obsidian2025&file=Trust%20Review',
          },
        },
      },
    };

    const result = computeKindleReadingHeatmap(userStateWithWriting, mockBooks);

    expect(result.hasWritingTelemetry).toBe(true);
    expect(result.totalWordsWritten).toBe(1500);
    // 2026-03-22 has both highlights and words
    expect(result.dualMomentumDaysCount).toBeGreaterThanOrEqual(1);
    // 2026-03-24 is within 48h of 2026-03-23 reading
    expect(result.inspiredDaysCount).toBeGreaterThanOrEqual(1);
    expect(result.inspiredRatePct).toBeGreaterThan(0);

    // Verify 2026-03-22 day entry in grid has both reading and writing properties
    const grid2026 = result.allYearsGrids[2026];
    let foundDualDay = false;
    for (const week of grid2026.weeks) {
      for (const day of week.days) {
        if (day && day.date === '2026-03-22') {
          foundDualDay = true;
          expect(day.highlightCount).toBe(2);
          expect(day.wordsWrittenCount).toBe(500);
          expect(day.writingIntensityLevel).toBe(3); // 301-750 words
          expect(day.isDualMomentumDay).toBe(true);
        }
      }
    }
    expect(foundDualDay).toBe(true);

    // Verify matched review is accessible
    expect(userStateWithWriting.writingTelemetry?.matchedReviews['book-1']?.vaultFilePath).toBe(
      'Benim Yazılar/Trust Review.md'
    );
  });
});
