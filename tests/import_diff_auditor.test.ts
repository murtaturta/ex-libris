import { describe, it, expect } from 'vitest';
import {
  computeLibraryImportDiff,
  computeClippingsImportDiff,
  mergeLibraryBundlesNonDestructive,
} from '../src/lib/parsers/importDiffAuditor';
import { generateBookMarkdownNote, sanitizeMarkdownFilename } from '../src/lib/exporters/markdownNoteExporter';
import type { LibraryBundle, Book, UserLocalState, KindleClipping } from '../src/types/library';

describe('Import Diff Auditor & Non-Destructive Sync (Wave 3 QA)', () => {
  const mockExistingBook: Book = {
    id: '12345',
    title: 'Dune',
    cleanTitle: 'Dune',
    seriesName: 'Dune',
    seriesNumber: '1',
    author: 'Frank Herbert',
    authorSort: 'Herbert, Frank',
    additionalAuthors: [],
    isbn: '0441172717',
    isbn13: '9780441172719',
    myRating: 4,
    averageRating: 4.25,
    publisher: 'Ace Books',
    binding: 'Paperback',
    pageCount: 412,
    yearPublished: 1990,
    originalPublicationYear: 1965,
    dateRead: '2026-01-10',
    dateAdded: '2026-01-01',
    exclusiveShelf: 'to-read', // Will transition
    bookshelves: ['sci-fi'],
    bookshelvesWithPositions: null,
    readCount: 1,
    ownedCopies: 1,
    myReview: 'Masterpiece of worldbuilding.',
    spoiler: false,
    privateNotes: 'Must re-read.',
    shelving: null,
    reviewDetails: null,
    readingSessions: [
      { startedAt: '2026-01-01', endedAt: '2026-01-10', state: 'COMPLETED', durationDays: 9 },
    ],
    kindleNotes: [
      { activity: 'highlight', product: 'Dune', noteText: 'I must not fear.', createdAt: '2026-01-05' },
    ],
    recommendations: [],
  };

  const mockExistingBundle: LibraryBundle = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-10-29T00:00:00.000Z',
    summaryStats: {
      totalBooks: 1,
      distinctAuthors: 1,
      booksWithSeries: 1,
      shelves: { read: 0, toRead: 1, currentlyReading: 0, didNotFinish: 0 },
      ratings: { ratedCount: 1, unratedCount: 0, averageRating: 4, distribution: { '4': 1 } },
      pages: { totalPagesRead: 0, totalLibraryPages: 412, booksWithPagesCount: 1, booksWithoutPagesCount: 0 },
    },
    books: [mockExistingBook],
    quotes: [{ quote: 'Fear is the mind-killer.', liked: true, origin: 'Dune', quotePosition: 1, createdAt: '2026-01-02' }],
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

  it('computeLibraryImportDiff tracks added books, shelf transitions, rating changes, and preserves overrides', () => {
    const incomingBook: Book = {
      ...mockExistingBook,
      exclusiveShelf: 'read', // Transition: to-read -> read
      myRating: 5, // Rating change: 4 -> 5
      myReview: 'Updated review text.',
    };

    const incomingBundle: LibraryBundle = {
      ...mockExistingBundle,
      books: [incomingBook, {
        ...mockExistingBook,
        id: '67890',
        title: 'Neuromancer',
        cleanTitle: 'Neuromancer',
        author: 'William Gibson',
        exclusiveShelf: 'to-read',
      }],
    };

    const userState: UserLocalState = {
      version: '0.2.0',
      updatedAt: new Date().toISOString(),
      showCovers: true,
      bookOverrides: {
        '12345': {
          originalLanguageOverride: 'EN',
          localNotes: 'Checked against hardback edition.',
          progressLogs: [{ date: '2026-01-05', page: 200 }],
        },
      },
      kindleClippings: [],
    };

    const diff = computeLibraryImportDiff(mockExistingBundle, incomingBundle, userState);

    expect(diff.incomingTotal).toBe(2);
    expect(diff.existingTotal).toBe(1);
    expect(diff.addedBooks.length).toBe(1);
    expect(diff.addedBooks[0].title).toBe('Neuromancer');
    expect(diff.shelfTransitions.length).toBe(1);
    expect(diff.shelfTransitions[0].fromShelf).toBe('to-read');
    expect(diff.shelfTransitions[0].toShelf).toBe('read');
    expect(diff.ratingChanges.length).toBe(1);
    expect(diff.ratingChanges[0].fromRating).toBe(4);
    expect(diff.ratingChanges[0].toRating).toBe(5);
    expect(diff.preservedOverridesCount).toBe(1);
    expect(diff.preservedOverrideDetails[0].preservedFields).toContain('originalLanguageOverride');
    expect(diff.preservedOverrideDetails[0].preservedFields).toContain('localNotes');
    expect(diff.preservedOverrideDetails[0].preservedFields).toContain('progressLogs');
  });

  it('mergeLibraryBundlesNonDestructive prevents wiping DSAR-only fields or dropping missing volumes', () => {
    // Incoming partial CSV export only contains Dune with updated shelf, missing Neuromancer entirely
    const partialIncomingBook: Book = {
      ...mockExistingBook,
      exclusiveShelf: 'read',
      readingSessions: [], // Empty incoming sessions
      kindleNotes: [], // Empty incoming notes
    };

    const incomingBundle: LibraryBundle = {
      ...mockExistingBundle,
      books: [partialIncomingBook],
    };

    const merged = mergeLibraryBundlesNonDestructive(mockExistingBundle, incomingBundle);

    // Verify existing readingSessions and kindleNotes were preserved non-destructively
    const mergedDune = merged.books.find(b => b.id === '12345');
    expect(mergedDune?.exclusiveShelf).toBe('read');
    expect(mergedDune?.readingSessions.length).toBe(1);
    expect(mergedDune?.kindleNotes.length).toBe(1);
    expect(merged.quotes.length).toBe(1); // Quotes preserved
  });

  it('computeClippingsImportDiff deduplicates highlights and counts color breakdowns', () => {
    const existingClippings: KindleClipping[] = [
      {
        id: 'c1',
        rawTitle: 'Dune',
        cleanTitle: 'Dune',
        author: 'Frank Herbert',
        matchedBookId: '12345',
        type: 'highlight',
        page: 12,
        locationStart: 100,
        locationEnd: 110,
        addedAt: null,
        content: 'Fear is the mind-killer.',
      },
    ];

    const incomingClippings: KindleClipping[] = [
      ...existingClippings,
      {
        id: 'c2',
        rawTitle: 'Dune',
        cleanTitle: 'Dune',
        author: 'Frank Herbert',
        matchedBookId: '12345',
        type: 'highlight',
        page: 15,
        locationStart: 120,
        locationEnd: 135,
        addedAt: null,
        content: 'I must not fear. Fear is the little-death.',
      },
    ];

    const report = computeClippingsImportDiff(existingClippings, incomingClippings);
    expect(report.incomingTotal).toBe(2);
    expect(report.existingTotal).toBe(1);
    expect(report.newClippingsCount).toBe(1);
    expect(report.duplicateSkippedCount).toBe(1);
    expect(report.sampleNewTitles).toContain('Dune');
  });

  it('generateBookMarkdownNote formats clean markdown notes without duplicate files', () => {
    const note = generateBookMarkdownNote(mockExistingBook, undefined, {
      bookId: '12345',
      fetchedAt: new Date().toISOString(),
      source: 'openlibrary',
      synopsis: 'A stunning sci-fi epic on Arrakis.',
      communityRating: 4.5,
      ratingsCount: 1000,
      subjects: ['Science Fiction'],
      coverUrl: null,
    });

    expect(note.filename).toBe('Dune.md');
    expect(note.content).toContain('Dune');
    expect(note.content).toContain('Frank Herbert');
    expect(note.content).toContain('A stunning sci-fi epic on Arrakis.');
    expect(sanitizeMarkdownFilename('Dune: Deluxe Edition')).toBe('Dune Deluxe Edition.md');
  });
});
