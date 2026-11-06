import { describe, it, expect } from 'vitest';
import { classifyBookLanguageAndFormat } from '../src/lib/classifiers/languageAndFormat';
import {
  computeWorldShelf,
  computePredictiveTargets,
  computeAnnualReadingReviews,
} from '../src/lib/analytics/engine';
import type { Book, EnrichedBookMetadata, LibraryBundle, UserLocalState } from '../src/types/library';

describe('Sprint Mandate #4: World Shelf, Predictive Targets & Language Engine Repair', () => {
  describe('Root-Cause Fix: Original Language Classifier', () => {
    const mockBook = (author: string, title = 'Sample Work'): Book => ({
      id: 'test-1',
      title,
      cleanTitle: title,
      seriesName: null,
      seriesNumber: null,
      author,
      authorSort: author,
      additionalAuthors: [],
      isbn: null,
      isbn13: null,
      myRating: 5,
      averageRating: 4.2,
      publisher: null,
      binding: 'Paperback',
      pageCount: 320,
      yearPublished: 2020,
      originalPublicationYear: 2020,
      dateRead: '2026-02-01',
      dateAdded: '2026-01-01',
      exclusiveShelf: 'read',
      bookshelves: ['fiction'],
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
    });

    it('classifies George R.R. Martin as EN even if OpenLibrary enrichment cache returns IT', () => {
      const book = mockBook('George R.R. Martin', 'A Game of Thrones');
      const enriched = {
        bookId: 'test-1',
        detectedOriginalLanguage: 'IT', // Corrupted external OpenLibrary scan
      } as unknown as EnrichedBookMetadata;

      const profile = classifyBookLanguageAndFormat(book, undefined, enriched);
      expect(profile.originalLanguage).toBe('EN');
      expect(profile.translationFlow).toBe('EN · Original');
    });

    it('classifies Douglas Adams as EN even if OpenLibrary returns IT', () => {
      const book = mockBook('Douglas Adams', "The Hitchhiker's Guide to the Galaxy");
      const enriched = {
        bookId: 'test-1',
        detectedOriginalLanguage: 'IT',
      } as unknown as EnrichedBookMetadata;

      const profile = classifyBookLanguageAndFormat(book, undefined, enriched);
      expect(profile.originalLanguage).toBe('EN');
      expect(profile.translationFlow).toBe('EN · Original');
    });

    it('classifies J.K. Rowling as EN even if OpenLibrary returns ZH', () => {
      const book = mockBook('J.K. Rowling', 'Harry Potter and the Half-Blood Prince');
      const enriched = {
        bookId: 'test-1',
        detectedOriginalLanguage: 'ZH',
      } as unknown as EnrichedBookMetadata;

      const profile = classifyBookLanguageAndFormat(book, undefined, enriched);
      expect(profile.originalLanguage).toBe('EN');
      expect(profile.translationFlow).toBe('EN · Original');
    });

    it('classifies Ken Grimwood as EN via seed catalog', () => {
      const book = mockBook('Ken Grimwood', 'Replay');
      const profile = classifyBookLanguageAndFormat(book);
      expect(profile.originalLanguage).toBe('EN');
    });

    it('preserves user manual override over both author seed and enrichment cache', () => {
      const book = mockBook('George R.R. Martin', 'Foreign Special Edition');
      const profile = classifyBookLanguageAndFormat(
        book,
        { originalLanguageOverride: 'FR' },
        { bookId: 'test-1', detectedOriginalLanguage: 'IT' } as unknown as EnrichedBookMetadata
      );
      expect(profile.originalLanguage).toBe('FR');
    });
  });

  describe('The Literary Map: The World Shelf Geo-Cartography', () => {
    const mockBundle = {
      books: [
        {
          id: 'b-1',
          title: 'Saatleri Ayarlama Enstitüsü',
          cleanTitle: 'Saatleri Ayarlama Enstitüsü',
          author: 'Ahmet Hamdi Tanpınar',
          myRating: 5,
          pageCount: 380,
          dateRead: '2026-01-10',
          exclusiveShelf: 'read',
        },
        {
          id: 'b-2',
          title: "L'Étranger",
          cleanTitle: "L'Étranger",
          author: 'Albert Camus',
          myRating: 4,
          pageCount: 160,
          dateRead: '2025-05-15',
          exclusiveShelf: 'read',
        },
        {
          id: 'b-3',
          title: 'Solaris',
          cleanTitle: 'Solaris',
          author: 'Stanisław Lem',
          myRating: 5,
          pageCount: 224,
          dateRead: '2025-08-20',
          exclusiveShelf: 'read',
        },
        {
          id: 'b-4',
          title: 'Dune',
          cleanTitle: 'Dune',
          author: 'Frank Herbert',
          myRating: 5,
          pageCount: 680,
          dateRead: '2024-03-12',
          exclusiveShelf: 'read',
        },
        {
          id: 'b-5',
          title: 'No Longer Human',
          cleanTitle: 'No Longer Human',
          author: 'Osamu Dazai',
          myRating: 4,
          pageCount: 176,
          dateRead: '2026-02-14',
          exclusiveShelf: 'read',
        },
      ],
    } as unknown as LibraryBundle;

    it('aggregates cultural hubs and attributes signature works', () => {
      const worldShelf = computeWorldShelf(mockBundle, null, null);

      expect(worldShelf.totalVolumes).toBe(5);
      expect(worldShelf.totalHubsWithBooks).toBeGreaterThanOrEqual(4);

      const anatolian = worldShelf.hubs.find((h) => h.id === 'anatolian');
      expect(anatolian?.volumeCount).toBe(1);
      expect(anatolian?.totalPages).toBe(380);
      expect(anatolian?.signatureWorks[0].title).toBe('Saatleri Ayarlama Enstitüsü');

      const continental = worldShelf.hubs.find((h) => h.id === 'continental-europe');
      expect(continental?.volumeCount).toBeGreaterThanOrEqual(1);

      const eastAsian = worldShelf.hubs.find((h) => h.id === 'east-asian');
      expect(eastAsian?.volumeCount).toBe(1);
      expect(eastAsian?.signatureWorks[0].title).toBe('No Longer Human');

      const anglo = worldShelf.hubs.find((h) => h.id === 'anglo-american');
      expect(anglo?.volumeCount).toBe(1);
      expect(anglo?.signatureWorks[0].title).toBe('Dune');
    });
  });

  describe('Smart Reading Targets & Predictive Pace Forecaster', () => {
    it('computes projected finish and pace deltas for current year', () => {
      const currentYear = new Date().getFullYear();
      const mockBundle = {
        readingGoals: [
          {
            goalId: 'g1',
            goalValue: 20,
            createDate: `${currentYear}-01-01`,
          },
        ],
        books: [
          {
            id: 'b-1',
            title: 'Book One',
            cleanTitle: 'Book One',
            author: 'Author A',
            pageCount: 300,
            dateRead: `${currentYear}-01-15`,
            exclusiveShelf: 'read',
          },
          {
            id: 'b-2',
            title: 'Book Two',
            cleanTitle: 'Book Two',
            author: 'Author B',
            pageCount: 350,
            dateRead: `${currentYear}-02-10`,
            exclusiveShelf: 'read',
          },
          // Short TBR sprint candidate
          {
            id: 'tbr-1',
            title: 'Short Sprint Novella',
            cleanTitle: 'Short Sprint Novella',
            author: 'Novella Author',
            pageCount: 120,
            averageRating: 4.5,
            exclusiveShelf: 'to-read',
          },
        ],
      } as unknown as LibraryBundle;

      const targets = computePredictiveTargets(mockBundle, null, null);

      expect(targets.targetYear).toBe(currentYear);
      expect(targets.goalTarget).toBe(20);
      expect(targets.completedCount).toBe(2);
      expect(targets.percentComplete).toBe(10);
      expect(targets.sprintSuggestions.length).toBe(1);
      expect(targets.sprintSuggestions[0].title).toBe('Short Sprint Novella');
      expect(targets.sprintSuggestions[0].pageCount).toBe(120);
    });

    it('handles goal achieved state gracefully', () => {
      const currentYear = new Date().getFullYear();
      const mockBundle = {
        readingGoals: [
          {
            goalId: 'g1',
            goalValue: 1,
            createDate: `${currentYear}-01-01`,
          },
        ],
        books: [
          {
            id: 'b-1',
            title: 'Done Book',
            cleanTitle: 'Done Book',
            author: 'Author A',
            pageCount: 200,
            dateRead: `${currentYear}-01-10`,
            exclusiveShelf: 'read',
          },
        ],
      } as unknown as LibraryBundle;

      const targets = computePredictiveTargets(mockBundle, null, null);
      expect(targets.completedCount).toBe(1);
      expect(targets.isAheadOfPace).toBe(true);
      expect(targets.projectedTargetAchievedDate).toBe('Target Achieved!');
    });
  });

  describe('Annual Reading Reviews & Multi-Year Trends', () => {
    const mockBundle = {
      books: [
        {
          id: 'b-26-1',
          title: '2026 Masterpiece',
          cleanTitle: '2026 Masterpiece',
          author: 'Author X',
          myRating: 5,
          pageCount: 450,
          dateRead: '2026-02-10',
          exclusiveShelf: 'read',
        },
        {
          id: 'b-25-1',
          title: '2025 Sprint',
          cleanTitle: '2025 Sprint',
          author: 'Author Y',
          myRating: 4,
          pageCount: 110,
          dateRead: '2025-06-15',
          exclusiveShelf: 'read',
        },
        {
          id: 'b-25-2',
          title: '2025 Epic Savor',
          cleanTitle: '2025 Epic Savor',
          author: 'Author Z',
          myRating: 5,
          pageCount: 890,
          dateRead: '2025-11-20',
          exclusiveShelf: 'read',
        },
      ],
    } as unknown as LibraryBundle;

    const mockUserState = {
      letterboxdData: {
        watches: [
          {
            id: 'w-1',
            name: 'Cinema 2026',
            year: 2026,
            uri: 'https://boxd.it/1',
            date: '2026-02-15',
          },
        ],
      },
    } as unknown as UserLocalState;

    it('breaks down reading volume, canon, and pacing by year', () => {
      const reviews = computeAnnualReadingReviews(mockBundle, mockUserState, null);

      expect(reviews.length).toBe(3); // 2026, 2025, 2024

      const rev2026 = reviews.find((r) => r.year === 2026);
      expect(rev2026?.volumesRead).toBe(1);
      expect(rev2026?.pagesRead).toBe(450);
      expect(rev2026?.canon5StarBooks.length).toBe(1);
      expect(rev2026?.narrativeDiet.booksRead).toBe(1);
      expect(rev2026?.narrativeDiet.filmsWatched).toBe(1);

      const rev2025 = reviews.find((r) => r.year === 2025);
      expect(rev2025?.volumesRead).toBe(2);
      expect(rev2025?.pagesRead).toBe(1000); // 110 + 890
      expect(rev2025?.fastestSprintBook?.title).toBe('2025 Sprint');
      expect(rev2025?.deepestSavorBook?.title).toBe('2025 Epic Savor');
      expect(rev2025?.canon5StarBooks.length).toBe(1);
    });
  });
});
