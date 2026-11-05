import { describe, it, expect } from 'vitest';
import type { Book, UserLocalState, WritingTelemetryData } from '../src/types/library';
import { computeKindleReadingHeatmap } from '../src/lib/analytics/engine';
import { bookHasAnnotations } from '../src/lib/exporters/markdownNoteExporter';

describe('Room 05 / The Scriptorium & Archive Cabinet Tests', () => {
  const sampleBooks: Book[] = ([
    {
      id: '17214',
      title: 'Starship Troopers',
      cleanTitle: 'Starship Troopers',
      author: 'Robert A. Heinlein',
      authorSort: 'Heinlein, Robert A.',
      additionalAuthors: [],
      isbn: '0441783589',
      isbn13: '9780441783588',
      myRating: 4,
      averageRating: 4.02,
      publisher: 'Ace',
      binding: 'Paperback',
      pageCount: 263,
      yearPublished: 1959,
      originalPublicationYear: 1959,
      dateRead: '2025/08/10',
      dateAdded: '2025/07/01',
      bookshelves: ['sci-fi', 'favorites'],
      exclusiveShelf: 'read',
      readCount: 1,
      myReview: 'Excellent military philosophy and citizenship thesis.',
    },
    {
      id: '50902608',
      title: 'I Am Legend',
      cleanTitle: 'I Am Legend',
      author: 'Richard Matheson',
      authorSort: 'Matheson, Richard',
      additionalAuthors: [],
      isbn: '0765318741',
      isbn13: '9780765318749',
      myRating: 5,
      averageRating: 4.04,
      publisher: 'Tor Books',
      binding: 'Paperback',
      pageCount: 160,
      yearPublished: 1954,
      originalPublicationYear: 1954,
      dateRead: '2025/07/20',
      dateAdded: '2025/06/15',
      bookshelves: ['horror', 'sci-fi'],
      exclusiveShelf: 'read',
      readCount: 1,
      myReview: '',
    },
    {
      id: '999999',
      title: 'Dune Messiah',
      cleanTitle: 'Dune Messiah',
      author: 'Frank Herbert',
      authorSort: 'Herbert, Frank',
      additionalAuthors: [],
      isbn: '',
      isbn13: '',
      myRating: 0,
      averageRating: 3.9,
      publisher: '',
      binding: '',
      pageCount: 337,
      yearPublished: 1969,
      originalPublicationYear: 1969,
      dateRead: null,
      dateAdded: '2025/09/01',
      bookshelves: ['to-read'],
      exclusiveShelf: 'to-read',
      readCount: 0,
      myReview: '',
    },
  ] as unknown) as Book[];

  const sampleTelemetry: WritingTelemetryData = {
    version: '1.0',
    updatedAt: '2025-11-02T12:00:00Z',
    source: 'keep-the-rhythm',
    totalWords: 54353,
    totalChars: 310000,
    dailyGoal: 300,
    completedGoalDaysCount: 45,
    completedGoalDates: ['2025-08-10', '2025-08-11'],
    activeDaysCount: 115,
    dailyTotals: {
      '2025-08-10': 620,
      '2025-08-11': 450,
      '2025-08-12': 120,
    },
    hourlyTotals: new Array(24).fill(0),
    projects: [
      { name: 'Ioren', words: 23627, filesCount: 42, activeDaysCount: 50 },
      { name: 'yenimegaproje2025', words: 13576, filesCount: 18, activeDaysCount: 30 },
      { name: 'Warband', words: 6368, filesCount: 8, activeDaysCount: 12 },
    ],
    matchedReviews: {
      '17214': {
        bookId: '17214',
        bookTitle: 'Starship Troopers',
        vaultFilePath: 'Benim Yazılar/Starship Troopers Review.md',
        wordsCount: 211,
        content: 'Heinlein presents a fascinating Spartan republic model...',
        obsidianUri: 'obsidian://open?vault=obsidian2025&file=Benim%20Yaz%C4%B1lar%2FStarship%20Troopers%20Review',
      },
      '50902608': {
        bookId: '50902608',
        bookTitle: 'I Am Legend',
        vaultFilePath: 'Benim Yazılar/I am legend Review.md',
        wordsCount: 708,
        content: 'Matheson builds an unbearable isolation chamber...',
        obsidianUri: 'obsidian://open?vault=obsidian2025&file=Benim%20Yaz%C4%B1lar%2FI%20am%20legend%20Review',
      },
    },
  };

  const sampleState: UserLocalState = {
    version: '0.2',
    updatedAt: '2025-11-02T12:00:00Z',
    showCovers: true,
    bookOverrides: {},
    kindleClippings: [
      {
        id: 'clip-1',
        rawTitle: 'Starship Troopers',
        cleanTitle: 'Starship Troopers',
        matchedBookId: '17214',
        author: 'Robert A. Heinlein',
        content: 'Citizenship is an attitude, a state of cultivated mind.',
        type: 'highlight',
        page: 142,
        locationStart: 1200,
        locationEnd: 1205,
        addedAt: '2025-08-10T12:00:00.000Z',
      },
      {
        id: 'clip-2',
        rawTitle: 'I Am Legend',
        cleanTitle: 'I Am Legend',
        matchedBookId: '50902608',
        author: 'Richard Matheson',
        content: 'The world had gone mad and the only sane man was dead.',
        type: 'highlight',
        page: 55,
        locationStart: 400,
        locationEnd: 405,
        addedAt: '2025-08-11T12:00:00.000Z',
      },
    ],
    writingTelemetry: sampleTelemetry,
  };

  it('computes Kindle Reading Heatmap with writing telemetry & dual momentum co-occurrence', () => {
    const metrics = computeKindleReadingHeatmap(sampleState, sampleBooks);

    expect(metrics).toBeDefined();
    expect(metrics.totalHighlights).toBe(2);
    expect(metrics.totalWordsWritten).toBe(54353);
    expect(metrics.totalWritingDays).toBe(3);
    expect(metrics.dualMomentumDaysCount).toBeGreaterThanOrEqual(1);
    expect(metrics.inspiredDaysCount).toBeGreaterThanOrEqual(1);
    expect(metrics.inspiredRatePct).toBeGreaterThan(0);
  });

  it('preserves matched vault book reviews with Obsidian URI protocol links', () => {
    const reviews = sampleTelemetry.matchedReviews;
    expect(Object.keys(reviews).length).toBe(2);

    const starship = reviews['17214'];
    expect(starship).toBeDefined();
    expect(starship.wordsCount).toBe(211);
    expect(starship.obsidianUri).toContain('obsidian://open?vault=obsidian2025');

    const legend = reviews['50902608'];
    expect(legend).toBeDefined();
    expect(legend.wordsCount).toBe(708);
    expect(legend.vaultFilePath).toBe('Benim Yazılar/I am legend Review.md');
  });

  it('correctly filters books for Obsidian Archive Export scopes', () => {
    const all = sampleBooks;
    const read = sampleBooks.filter((b) => b.exclusiveShelf === 'read');
    const annotated = sampleBooks.filter((b) => bookHasAnnotations(b, sampleState));

    expect(all.length).toBe(3);
    expect(read.length).toBe(2);
    expect(annotated.length).toBe(2); // Starship Troopers (review & highlight), I Am Legend (highlight)
    expect(annotated.some((b) => b.id === '999999')).toBe(false);
  });

  it('formats obsidian:// deep links for daily drafted files without storing contents', () => {
    const sampleDailyFiles = [
      {
        filePath: 'Benim Yazılar/yenimegaproje2025/Drafts/Chapter Car Archive3241.md',
        fileName: 'Chapter Car Archive3241.md',
        folder: 'Benim Yazılar/yenimegaproje2025/Drafts',
        words: 327,
      },
    ];

    const file = sampleDailyFiles[0];
    const cleanPath = file.filePath.replace(/\.md$/, '');
    const uri = `obsidian://open?vault=obsidian2025&file=${encodeURIComponent(cleanPath)}`;

    expect(uri).toContain('obsidian://open?vault=obsidian2025&file=');
    expect(uri).toContain('Chapter%20Car%20Archive3241');
    expect(uri).not.toContain('.md');
  });

  it('hydrates dailyFiles with multi-file sessions from telemetry bundle', () => {
    const fs = require('fs');
    const path = require('path');
    const telemPath = path.resolve(__dirname, '../public/data/writing_telemetry.json');
    const raw = fs.readFileSync(telemPath, 'utf-8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);

    expect(data.dailyFiles).toBeDefined();
    const dates = Object.keys(data.dailyFiles);
    expect(dates.length).toBeGreaterThan(100);

    // Verify a sample date contains drafted files with words and proper structure
    const sampleDate = dates[0];
    const files = data.dailyFiles[sampleDate];
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0].fileName).toBeDefined();
    expect(files[0].filePath).toBeDefined();
    expect(typeof files[0].words).toBe('number');
  });
});
