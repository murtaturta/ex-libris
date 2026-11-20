import { describe, it, expect } from 'vitest';
import {
  normalizeDateKey,
  buildDualTimelineIndex,
  buildDualTimelineViewModel,
  layoutReadingSpansForBuckets,
} from '../src/lib/analytics/dualTimeline';
import type { Book, UserLocalState, WritingTelemetryData } from '../src/types/library';

describe('Dual-Track Timeline Engine (Read Above · Spine · Written Below)', () => {
  const sampleBooks: Book[] = ([
    {
      id: 'b1',
      title: 'The Left Hand of Darkness',
      cleanTitle: 'The Left Hand of Darkness',
      author: 'Ursula K. Le Guin',
      additionalAuthors: [],
      myRating: 5,
      pageCount: 304,
      dateRead: '2026/08/14',
      dateAdded: '2026/08/01',
      exclusiveShelf: 'read',
      bookshelves: [],
      readCount: 1,
      ownedCopies: 1,
      readingSessions: [
        {
          startedAt: '2026-08-02 00:00:00 UTC',
          endedAt: '2026-08-14 00:00:00 UTC',
          state: 'COMPLETED',
          durationDays: 12,
        },
      ],
      kindleNotes: [],
      recommendations: [],
    },
    {
      id: 'b2',
      title: 'Solaris',
      cleanTitle: 'Solaris',
      author: 'Stanisław Lem',
      additionalAuthors: [],
      myRating: 5,
      pageCount: 204,
      dateRead: '2026-08-19',
      dateAdded: '2026-08-15',
      exclusiveShelf: 'read',
      bookshelves: [],
      readCount: 1,
      ownedCopies: 1,
      readingSessions: [],
      kindleNotes: [],
      recommendations: [],
    },
  ] as unknown) as Book[];

  const sampleTelemetry: WritingTelemetryData = {
    version: '1.0',
    updatedAt: '2026-08-20T10:00:00Z',
    source: 'scriptor',
    totalWords: 1250,
    totalChars: 7500,
    dailyGoal: 300,
    completedGoalDaysCount: 2,
    completedGoalDates: ['2026-08-14', '2026-08-18'],
    activeDaysCount: 3,
    dailyTotals: {
      '2026-08-14': 520,
      '2026-08-18': 480,
      '2026-08-19': 250,
    },
    hourlyTotals: new Array(24).fill(0),
    projects: [{ name: 'Ioren', words: 1250, filesCount: 2, activeDaysCount: 3 }],
    matchedReviews: {},
    dailyFiles: {
      '2026-08-14': [
        {
          filePath: 'Benim Yazılar/Ioren/Chapter 4.md',
          fileName: 'Chapter 4.md',
          folder: 'Benim Yazılar/Ioren',
          words: 520,
        },
      ],
      '2026-08-19': [
        {
          filePath: 'Benim Yazılar/Notes/Solaris Reflection.md',
          fileName: 'Solaris Reflection.md',
          folder: 'Benim Yazılar/Notes',
          words: 250,
        },
      ],
    },
  };

  const sampleUserState: UserLocalState = {
    version: '0.2.0',
    updatedAt: '2026-08-20T10:00:00Z',
    showCovers: false,
    bookOverrides: {
      b2: {
        progressLogs: [{ date: '2026-08-16', page: 95 }],
      },
    },
    kindleClippings: [
      {
        id: 'c1',
        rawTitle: 'The Left Hand of Darkness',
        cleanTitle: 'The Left Hand of Darkness',
        author: 'Ursula K. Le Guin',
        matchedBookId: 'b1',
        type: 'highlight',
        page: 120,
        locationStart: 1400,
        locationEnd: 1410,
        addedAt: '2026-08-14T12:00:00.000Z',
        content: 'Light is the left hand of darkness.',
      },
      {
        id: 'c2',
        rawTitle: 'Solaris',
        cleanTitle: 'Solaris',
        author: 'Stanisław Lem',
        matchedBookId: 'b2',
        type: 'highlight',
        page: 88,
        locationStart: 900,
        locationEnd: 912,
        addedAt: '2026-08-19T15:00:00.000Z',
        content: 'We do not want other worlds, we want mirrors.',
      },
    ],
    writingTelemetry: sampleTelemetry,
  };

  it('normalizes Goodreads slash dates, UTC strings, and rejects placeholders', () => {
    expect(normalizeDateKey('2026/08/14')).toBe('2026-08-14');
    expect(normalizeDateKey('2026-08-14 00:00:00 UTC')).toBe('2026-08-14');
    expect(normalizeDateKey('2026-08-19')).toBe('2026-08-19');
    expect(normalizeDateKey('')).toBeNull();
    expect(normalizeDateKey(null)).toBeNull();
    expect(normalizeDateKey('0000-01-01')).toBeNull();
  });

  it('deduplicates finished books when dateRead matches a COMPLETED reading session', () => {
    const index = buildDualTimelineIndex(sampleBooks, sampleUserState);
    const aug14 = index.days['2026-08-14'];
    expect(aug14).toBeDefined();
    expect(aug14.finishedBooks).toHaveLength(1);
    expect(aug14.finishedBooks[0].title).toBe('The Left Hand of Darkness');
    expect(aug14.highlightCount).toBe(1);
    expect(aug14.wordsWritten).toBe(520);
    expect(aug14.goalMet).toBe(true);
    expect(aug14.isDualMomentum).toBe(true);
  });

  it('renders Year view with 52-53 weekly buckets and all 12 month ticks', () => {
    const index = buildDualTimelineIndex(sampleBooks, sampleUserState);
    const vm = buildDualTimelineViewModel(index, 'year', '2026-08-14');

    expect(vm.granularity).toBe('year');
    expect(vm.periodLabel).toBe('2026');
    expect(vm.buckets.length).toBeGreaterThanOrEqual(52);
    expect(vm.buckets.length).toBeLessThanOrEqual(54);

    const monthTicks = vm.buckets.map((b) => b.tickLabel).filter(Boolean);
    expect(monthTicks).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);

    expect(vm.summary.booksFinishedCount).toBe(2);
    expect(vm.summary.totalHighlights).toBe(2);
    expect(vm.summary.totalWordsWritten).toBe(1250);
    expect(vm.summary.goalMetDays).toBe(2);
    expect(vm.summary.dualMomentumDays).toBe(2);
    expect(vm.prevAnchorDate).toBe('2025-01-01');
    expect(vm.nextAnchorDate).toBe('2027-01-01');
  });

  it('renders Month view with exact day count (including leap years) and separates read/written', () => {
    const index = buildDualTimelineIndex(sampleBooks, sampleUserState);
    const augVm = buildDualTimelineViewModel(index, 'month', '2026-08-19');

    expect(augVm.periodLabel).toBe('August 2026');
    expect(augVm.buckets).toHaveLength(31);
    expect(augVm.prevAnchorDate).toBe('2026-07-01');
    expect(augVm.nextAnchorDate).toBe('2026-09-01');

    const b14 = augVm.buckets.find((b) => b.id === '2026-08-14')!;
    expect(b14.finishedBooks).toHaveLength(1);
    expect(b14.readNormalized).toBeGreaterThan(0);
    expect(b14.wordsWritten).toBe(520);
    expect(b14.writeNormalized).toBe(1); // Max words day in period
    expect(b14.isDualMomentum).toBe(true);

    const b18 = augVm.buckets.find((b) => b.id === '2026-08-18')!;
    expect(b18.readScore).toBe(0);
    expect(b18.readNormalized).toBe(0);
    expect(b18.wordsWritten).toBe(480);
    expect(b18.isDualMomentum).toBe(false);

    // Leap year check: Feb 2024 has 29 days, Feb 2025 has 28 days
    expect(buildDualTimelineViewModel(index, 'month', '2024-02-10').buckets).toHaveLength(29);
    expect(buildDualTimelineViewModel(index, 'month', '2025-02-10').buckets).toHaveLength(28);
  });

  it('renders Week view as 7 Mon-Sun columns with cross-period navigation', () => {
    const index = buildDualTimelineIndex(sampleBooks, sampleUserState);
    // 2026-08-19 is a Wednesday; Monday is 2026-08-17, Sunday is 2026-08-23
    const weekVm = buildDualTimelineViewModel(index, 'week', '2026-08-19');

    expect(weekVm.buckets).toHaveLength(7);
    expect(weekVm.startDate).toBe('2026-08-17');
    expect(weekVm.endDate).toBe('2026-08-23');
    expect(weekVm.prevAnchorDate).toBe('2026-08-10');
    expect(weekVm.nextAnchorDate).toBe('2026-08-24');
    expect(weekVm.summary.booksFinishedCount).toBe(1);
    expect(weekVm.summary.totalWordsWritten).toBe(730); // 480 + 250

    const wed = weekVm.buckets[2];
    expect(wed.id).toBe('2026-08-19');
    expect(wed.finishedBooks[0].title).toBe('Solaris');
    expect(wed.draftedFiles[0].fileName).toBe('Solaris Reflection.md');
  });

  it('handles missing writing telemetry and empty datasets gracefully', () => {
    const emptyIndex = buildDualTimelineIndex([], undefined, new Date(2026, 10, 19));
    expect(emptyIndex.hasWritingTelemetry).toBe(false);
    expect(emptyIndex.availableYears).toContain(2026);

    const emptyVm = buildDualTimelineViewModel(emptyIndex, 'year', '2026-11-19');
    expect(emptyVm.summary.booksFinishedCount).toBe(0);
    expect(emptyVm.summary.totalWordsWritten).toBe(0);
    expect(emptyVm.buckets.every((b) => b.readNormalized === 0 && b.writeNormalized === 0)).toBe(
      true
    );

    const readOnlyIndex = buildDualTimelineIndex(sampleBooks, undefined);
    expect(readOnlyIndex.hasWritingTelemetry).toBe(false);
    const readOnlyVm = buildDualTimelineViewModel(readOnlyIndex, 'year', '2026-08-01');
    expect(readOnlyVm.summary.booksFinishedCount).toBe(2);
    expect(readOnlyVm.summary.totalWordsWritten).toBe(0);
  });

  it('ingests the real bundled Ex Libris + Scriptor dataset cleanly', () => {
    const fs = require('fs');
    const path = require('path');
    const bundlePath = path.resolve(__dirname, '../public/data/library_bundle.json');
    const telemPath = path.resolve(__dirname, '../public/data/writing_telemetry.json');
    if (!fs.existsSync(bundlePath) || !fs.existsSync(telemPath)) return;

    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
    const telemetry = JSON.parse(fs.readFileSync(telemPath, 'utf-8'));

    const index = buildDualTimelineIndex(bundle.books, {
      version: '0.2.0',
      updatedAt: telemetry.updatedAt,
      showCovers: false,
      bookOverrides: {},
      kindleClippings: [],
      writingTelemetry: telemetry,
    });

    const vm2026 = buildDualTimelineViewModel(index, 'year', '2026-01-01');
    expect(vm2026.summary.booksFinishedCount).toBeGreaterThan(0);
    expect(vm2026.summary.totalWordsWritten).toBeGreaterThan(0);
    expect(vm2026.summary.uniqueNotesTouched).toBeGreaterThan(0);
    expect(index.readingSpans.length).toBeGreaterThan(0);
  });

  it('extracts reading spans and packs overlapping horizontal brackets into lanes', () => {
    const spanBooks = ([
      {
        id: 's1',
        title: 'Book One',
        cleanTitle: 'Book One',
        author: 'Author A',
        pageCount: 250,
        myRating: 5,
        exclusiveShelf: 'read',
        dateRead: '2026/08/10',
        readingSessions: [
          { startedAt: '2026-08-03 00:00:00 UTC', endedAt: '2026-08-10 00:00:00 UTC', state: 'COMPLETED', durationDays: 7 },
        ],
      },
      {
        id: 's2',
        title: 'Book Two',
        cleanTitle: 'Book Two',
        author: 'Author B',
        pageCount: 300,
        myRating: 4,
        exclusiveShelf: 'read',
        dateRead: '2026/08/14',
        readingSessions: [
          { startedAt: '2026-08-07 00:00:00 UTC', endedAt: '2026-08-14 00:00:00 UTC', state: 'COMPLETED', durationDays: 7 },
        ],
      },
      {
        id: 's3',
        title: 'Ongoing Book',
        cleanTitle: 'Ongoing Book',
        author: 'Author C',
        pageCount: 400,
        myRating: 0,
        exclusiveShelf: 'currently-reading',
        dateRead: null,
        readingSessions: [
          { startedAt: '2026-08-12 00:00:00 UTC', endedAt: null, state: 'READING', durationDays: null },
        ],
      },
    ] as unknown) as Book[];

    const index = buildDualTimelineIndex(spanBooks, undefined);
    expect(index.readingSpans).toHaveLength(3);

    const augVm = buildDualTimelineViewModel(index, 'month', '2026-08-10');

    // Finished only: s1 and s2 overlap (Aug 3-10 vs Aug 6-14) -> 2 lanes
    const finishedLayout = layoutReadingSpansForBuckets(index.readingSpans, augVm.buckets, false);
    expect(finishedLayout.spans).toHaveLength(2);
    expect(finishedLayout.laneCount).toBe(2);
    expect(finishedLayout.spans[0].startIdx).toBe(2); // Aug 3 (0-based)
    expect(finishedLayout.spans[0].endIdx).toBe(9);   // Aug 10

    // Including ongoing: s3 starts Aug 12 (idx 11), overlaps s2 (Aug 6-14), can share lane 0 with s1 (ends idx 9)!
    const allLayout = layoutReadingSpansForBuckets(index.readingSpans, augVm.buckets, true, '2026-08-20');
    expect(allLayout.spans).toHaveLength(3);
    expect(allLayout.laneCount).toBe(2);
    const ongoing = allLayout.spans.find((s) => s.bookId === 's3')!;
    expect(ongoing.isOngoing).toBe(true);
    expect(ongoing.clippedRight).toBe(true);
    expect(ongoing.lane).toBe(0);
  });

  it('splits reading brackets when there is no activity for more than 7 days', () => {
    const gapBooks = ([
      {
        id: 'g1',
        title: 'Trust',
        cleanTitle: 'Trust',
        author: 'Hernan Diaz',
        pageCount: 400,
        myRating: 0,
        exclusiveShelf: 'currently-reading',
        dateRead: null,
        readingSessions: [
          { startedAt: '2026-08-01 00:00:00 UTC', endedAt: null, state: 'READING', durationDays: null },
        ],
      },
    ] as unknown) as Book[];

    const gapUserState: UserLocalState = {
      version: '0.2.0',
      updatedAt: '2026-08-25T00:00:00Z',
      showCovers: false,
      bookOverrides: {},
      kindleClippings: [
        {
          id: 'c1',
          rawTitle: 'Trust',
          cleanTitle: 'Trust',
          author: 'Hernan Diaz',
          matchedBookId: 'g1',
          type: 'highlight',
          page: 20,
          locationStart: 100,
          locationEnd: 110,
          addedAt: '2026-08-04T12:00:00Z',
          content: 'First burst quote.',
        },
        {
          id: 'c2',
          rawTitle: 'Trust',
          cleanTitle: 'Trust',
          author: 'Hernan Diaz',
          matchedBookId: 'g1',
          type: 'highlight',
          page: 150,
          locationStart: 800,
          locationEnd: 810,
          addedAt: '2026-08-20T12:00:00Z',
          content: 'Second burst quote after >7d pause.',
        },
        {
          id: 'c3',
          rawTitle: 'Trust',
          cleanTitle: 'Trust',
          author: 'Hernan Diaz',
          matchedBookId: 'g1',
          type: 'highlight',
          page: 170,
          locationStart: 900,
          locationEnd: 910,
          addedAt: '2026-08-22T12:00:00Z',
          content: 'Still reading in second burst.',
        },
      ],
    };

    const index = buildDualTimelineIndex(gapBooks, gapUserState);
    expect(index.readingSpans).toHaveLength(2);
    expect(index.readingSpans[0].startDate).toBe('2026-08-01');
    expect(index.readingSpans[0].endDate).toBe('2026-08-04');
    expect(index.readingSpans[0].durationDays).toBe(3);
    expect(index.readingSpans[0].isOngoing).toBe(false);

    expect(index.readingSpans[1].startDate).toBe('2026-08-20');
    expect(index.readingSpans[1].endDate).toBeNull();
    expect(index.readingSpans[1].durationDays).toBe(2);
    expect(index.readingSpans[1].isOngoing).toBe(true);
  });
});
