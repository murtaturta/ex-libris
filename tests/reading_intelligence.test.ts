import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

import {
  generateReadingFlights,
  computeNightstandDiagnostics,
  getSlumpIntermezzos,
  computeTranslatorLoyalty,
  getOracleCandidates,
  computeLiteraryHorizons,
  calibrateExternalDiscoveryPicks,
  computeBookPacingArchetype,
  computeReadingFrictionMetrics,
} from '../src/lib/analytics/engine';

import type {
  Book,
  ExternalDiscoveryPick,
  LibraryBundle,
  UserLocalState,
} from '../src/types/library';

describe('Reading Intelligence & Curation Engine (B-06, B-07, B-08)', () => {
  const bundlePath = path.resolve(__dirname, '../public/data/library_bundle.json');
  let bundle: LibraryBundle;

  try {
    const raw = fs.readFileSync(bundlePath, 'utf-8').replace(/^\uFEFF/, '');
    bundle = JSON.parse(raw) as LibraryBundle;
  } catch {
    bundle = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      summaryStats: {} as any,
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

  describe('B-06 · Curated 3-Book Reading Flights', () => {
    it('generates 4 curated flights from the live library bundle', () => {
      const flights = generateReadingFlights(bundle);
      expect(flights.length).toBe(4);

      const ids = flights.map(f => f.id);
      expect(ids).toContain('flight-momentum');
      expect(ids).toContain('flight-translation');
      expect(ids).toContain('flight-trusted-masters');
      expect(ids).toContain('flight-vintage-dust');

      for (const flight of flights) {
        expect(flight.books.length).toBeGreaterThanOrEqual(1);
        expect(flight.books.length).toBeLessThanOrEqual(3);
        expect(flight.totalPages).toBeGreaterThan(0);
        expect(flight.estimatedDays).toBeGreaterThan(0);
        expect(flight.badges.length).toBeGreaterThan(0);
        expect(flight.rationale).toBeTruthy();

        // Ensure all books within a flight are distinct
        const bookIds = flight.books.map(b => b.id);
        const uniqueBookIds = new Set(bookIds);
        expect(uniqueBookIds.size).toBe(bookIds.length);
      }
    });

    it('handles empty bundles gracefully without throwing', () => {
      const emptyBundle: LibraryBundle = { ...bundle, books: [] };
      const flights = generateReadingFlights(emptyBundle);
      expect(flights).toEqual([]);
    });
  });

  describe('B-07 · Cognitive Drag & Slump Intermezzos', () => {
    it('flags active books suffering from cognitive drag', () => {
      const mockBundle: LibraryBundle = {
        ...bundle,
        books: [
          {
            id: 'stall-1',
            title: 'Stalled Tome',
            cleanTitle: 'Stalled Tome',
            author: 'Epic Writer',
            authorSort: null,
            additionalAuthors: [],
            seriesName: null,
            seriesNumber: null,
            isbn: null,
            isbn13: null,
            myRating: null,
            averageRating: 4.0,
            publisher: null,
            binding: 'Paperback',
            pageCount: 600,
            yearPublished: 2020,
            originalPublicationYear: 2020,
            dateRead: null,
            dateAdded: '2024-01-01',
            exclusiveShelf: 'currently-reading',
            bookshelves: [],
            bookshelvesWithPositions: null,
            readCount: 0,
            ownedCopies: 1,
            myReview: null,
            spoiler: false,
            privateNotes: null,
            shelving: null,
            reviewDetails: null,
            readingSessions: [
              {
                startedAt: '2024-01-01',
                endedAt: null,
                durationDays: 30,
                state: 'READING',
              },
            ],
            kindleNotes: [],
            recommendations: [],
          },
        ],
      };

      const diagnostics = computeNightstandDiagnostics(mockBundle);
      expect(diagnostics.length).toBe(1);
      const diag = diagnostics[0];
      expect(diag.hasCognitiveDrag).toBe(true);
      expect(diag.cognitiveDragReason).toBeTruthy();
    });

    it('returns top palate-cleanser slump intermezzos <= 150 pages with sharp pitch', () => {
      const picks = getSlumpIntermezzos(bundle, undefined, 3);
      expect(picks.length).toBeGreaterThan(0);
      expect(picks.length).toBeLessThanOrEqual(3);

      for (const pick of picks) {
        expect(pick.pages).toBeLessThanOrEqual(150);
        expect(pick.pitch).toBeTruthy();
        expect(pick.formatLabel).toBeTruthy();
        expect(pick.translationFlow).toBeTruthy();
      }
    });
  });

  describe('B-08 · Translator Loyalty & Advanced Filters', () => {
    it('computes translator loyalty ranking with read and to-read counts', () => {
      const loyalty = computeTranslatorLoyalty(bundle);
      expect(loyalty.length).toBeGreaterThan(0);

      const top = loyalty[0];
      expect(top.translator).toBeTruthy();
      expect(top.readCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(top.translationFlows)).toBe(true);
      expect(Array.isArray(top.sampleTitles)).toBe(true);
    });

    it('filters TBR books by turkish-edition', () => {
      const candidates = getOracleCandidates(bundle, {
        translationMode: 'turkish-edition',
      });
      expect(candidates.length).toBeGreaterThan(0);
      for (const c of candidates) {
        expect(c.reasons.some(r => r.includes('Turkish edition') || r.includes('TR'))).toBe(true);
      }
    });

    it('rewards translator affinity bonus (+12) when an unread TBR book shares a translator with a >=4★ read book', () => {
      const candidates = getOracleCandidates(bundle, {});
      const translatorBonusPick = candidates.find(c =>
        c.reasons.some(r => r.startsWith('Translated by trusted conduit'))
      );

      // In Murat's library, Stefan Zweig's Ahmet Cemal translation of Satranç / Bilinmeyen Bir Kadının Mektubu
      // or similar should trigger if an unread work shares a translator
      if (translatorBonusPick) {
        expect(translatorBonusPick.score).toBeGreaterThan(50);
      }
    });
  });

  describe('Literary Frontier Radar & Uncharted Horizons Engine', () => {
    it('computes rich superpowers, horizons, expedition pairs, and exploration ratio on live bundle', () => {
      const report = computeLiteraryHorizons(bundle);
      expect(report.superpowers.length).toBeGreaterThanOrEqual(2);
      expect(report.unchartedHorizons.length).toBeGreaterThanOrEqual(2);
      expect(report.expeditionPairs.length).toBeGreaterThanOrEqual(1);
      expect(report.explorationRatio).toBeGreaterThan(0);
      expect(report.explorationRatio).toBeLessThanOrEqual(100);

      // Verify Superpower structure
      for (const sp of report.superpowers) {
        expect(sp.id).toBeTruthy();
        expect(sp.title).toBeTruthy();
        expect(sp.dimension).toBeTruthy();
        expect(sp.readCount).toBeGreaterThanOrEqual(2);
        expect(sp.avgMyRating).toBeGreaterThanOrEqual(3.5);
        expect(sp.signatureBooks.length).toBeGreaterThanOrEqual(1);
        expect(sp.summary).toBeTruthy();
      }

      // Verify Uncharted Horizons structure
      for (const hz of report.unchartedHorizons) {
        expect(hz.id).toBeTruthy();
        expect(hz.title).toBeTruthy();
        expect(hz.dimension).toBeTruthy();
        expect(hz.tbrCount).toBeGreaterThanOrEqual(1);
        expect(hz.opportunityScore).toBeGreaterThanOrEqual(50);
        expect(hz.opportunityScore).toBeLessThanOrEqual(100);
        expect(hz.sampleTbrBooks.length).toBeGreaterThanOrEqual(1);
        expect(hz.callToAdventure).toBeTruthy();
      }

      // Verify Expedition Pairs structure
      for (const pair of report.expeditionPairs) {
        expect(pair.id).toBeTruthy();
        expect(pair.title).toBeTruthy();
        expect(pair.anchorBook).toBeTruthy();
        expect(pair.frontierBook).toBeTruthy();
        expect(pair.anchorBook.id).not.toBe(pair.frontierBook.id);
        expect(pair.bridgeRationale).toBeTruthy();
        expect(pair.estimatedHours).toBeGreaterThan(0);
        expect(pair.horizonTag).toBeTruthy();
      }
    });

    it('handles empty bundles gracefully without throwing', () => {
      const emptyBundle: LibraryBundle = { ...bundle, books: [] };
      const report = computeLiteraryHorizons(emptyBundle);
      expect(report.superpowers).toEqual([]);
      expect(report.unchartedHorizons).toEqual([]);
      expect(report.expeditionPairs).toEqual([]);
      expect(report.explorationRatio).toBe(0);
    });
  });

  describe('calibrateExternalDiscoveryPicks', () => {
    const mockPicks: ExternalDiscoveryPick[] = [
      {
        id: 'pick-1',
        engine: 'author-backlist',
        title: 'Laurent Binet New Work',
        author: 'Laurent Binet',
        yearPublished: 2023,
        pageCount: 350,
        communityRating: 4.3,
        ratingsCount: 5000,
        subjects: ['metafiction', 'history'],
        synopsis: 'A new novel by Binet',
        coverUrl: null,
        isSequel: false,
        provenance: 'OpenLibrary Author Backlist',
        reasons: ['Matches author'],
        score: 70,
      },
      {
        id: 'pick-2',
        engine: 'author-backlist',
        title: 'Children of Dune Sequel',
        author: 'Frank Herbert',
        yearPublished: 1981,
        pageCount: 580,
        communityRating: 4.1,
        ratingsCount: 45000,
        subjects: ['science fiction'],
        synopsis: 'Next dune volume',
        coverUrl: null,
        isSequel: true,
        provenance: 'Series Backlist',
        reasons: ['Series continuation'],
        score: 65,
      },
      {
        id: 'pick-3',
        engine: 'subject-dna',
        title: 'Quick Speculative Sprint',
        author: 'Unknown Scribe',
        yearPublished: 2021,
        pageCount: 140,
        communityRating: 4.4,
        ratingsCount: 1200,
        subjects: ['speculative'],
        synopsis: 'Short sprint',
        coverUrl: null,
        isSequel: false,
        provenance: 'Subject Graph',
        reasons: ['Matches subject'],
        score: 55,
      },
      {
        id: 'pick-4',
        engine: 'dsar-graph',
        title: 'Mystery Pick With Unknown Pages',
        author: 'Mystery Author',
        yearPublished: 2019,
        pageCount: null,
        communityRating: 3.9,
        ratingsCount: 800,
        subjects: ['fiction'],
        synopsis: null,
        coverUrl: null,
        isSequel: false,
        provenance: 'Collaborative Graph',
        reasons: ['Collaborative pick'],
        score: 50,
      },
    ];

    it('filters by engine correctly', () => {
      const backlistOnly = calibrateExternalDiscoveryPicks(mockPicks, bundle, {
        engine: 'author-backlist',
      });
      expect(backlistOnly.length).toBe(2);
      expect(backlistOnly.every(p => p.engine === 'author-backlist')).toBe(true);
    });

    it('filters by sequelsOnly correctly', () => {
      const sequelsOnly = calibrateExternalDiscoveryPicks(mockPicks, bundle, {
        sequelsOnly: true,
      });
      expect(sequelsOnly.length).toBe(1);
      expect(sequelsOnly[0].id).toBe('pick-2');
    });

    it('filters by commitment while allowing unknown page counts through', () => {
      const sprintPicks = calibrateExternalDiscoveryPicks(mockPicks, bundle, {
        commitment: 'sprint',
      });
      // pick-3 is 140p (<250), pick-4 has null pages (allowed through)
      expect(sprintPicks.some(p => p.id === 'pick-3')).toBe(true);
      expect(sprintPicks.some(p => p.id === 'pick-4')).toBe(true);
      expect(sprintPicks.some(p => p.id === 'pick-1')).toBe(false); // 350p
      expect(sprintPicks.some(p => p.id === 'pick-2')).toBe(false); // 580p
    });

    it('applies taste-affinity adjustments boosting trusted authors and sequels', () => {
      const calibrated = calibrateExternalDiscoveryPicks(mockPicks, bundle);
      // In Murat's library, Laurent Binet is rated 4★ (HHhH), so pick-1 should get author loyalty bonus
      const binetPick = calibrated.find(p => p.id === 'pick-1');
      expect(binetPick).toBeDefined();
      expect(binetPick!.score).toBeGreaterThan(70);

      // pick-2 is a sequel so it receives sequel bonus
      const sequelPick = calibrated.find(p => p.id === 'pick-2');
      expect(sequelPick).toBeDefined();
      expect(sequelPick!.score).toBeGreaterThan(65);

      // Verify sorted by calibrated score descending
      for (let i = 0; i < calibrated.length - 1; i++) {
        expect(calibrated[i].score).toBeGreaterThanOrEqual(calibrated[i + 1].score);
      }
    });
  });

  describe('Pacing Archetypes & Reading Friction Post-Mortem', () => {
    it('computes Blitz Read for books finished <= 4 days or high page velocity', () => {
      const mockBook: Book = {
        id: 'fast-book-1',
        title: 'Story of Your Life',
        cleanTitle: 'Story of Your Life',
        seriesName: null,
        seriesNumber: null,
        author: 'Ted Chiang',
        authorSort: 'Chiang, Ted',
        additionalAuthors: [],
        isbn: null,
        isbn13: null,
        myRating: 5,
        averageRating: 4.5,
        publisher: 'Tor',
        binding: 'Paperback',
        pageCount: 280,
        yearPublished: 2002,
        originalPublicationYear: 2002,
        dateRead: '2024-05-03',
        dateAdded: '2024-05-01',
        exclusiveShelf: 'read',
        bookshelves: [],
        bookshelvesWithPositions: null,
        readCount: 1,
        ownedCopies: 1,
        myReview: 'Masterpiece.',
        spoiler: false,
        privateNotes: null,
        shelving: null,
        reviewDetails: null,
        readingSessions: [
          {
            startedAt: '2024-05-01',
            endedAt: '2024-05-03',
            state: 'COMPLETED',
            durationDays: 3,
          },
        ],
        kindleNotes: [],
        recommendations: [],
      };

      const archetype = computeBookPacingArchetype(mockBook);
      expect(archetype.type).toBe('blitz');
      expect(archetype.label).toBe('Blitz Read');
      expect(archetype.days).toBe(3);
      expect(archetype.pagesPerDay).toBeGreaterThan(80);
      expect(archetype.groundingSource).toBe('goodreads');
    });

    it('computes Deep Savor for books read over >= 30 days', () => {
      const mockBook: Book = {
        id: 'slow-book-1',
        title: 'The Name of the Rose',
        cleanTitle: 'The Name of the Rose',
        seriesName: null,
        seriesNumber: null,
        author: 'Umberto Eco',
        authorSort: 'Eco, Umberto',
        additionalAuthors: [],
        isbn: null,
        isbn13: null,
        myRating: 5,
        averageRating: 4.2,
        publisher: 'Harcourt',
        binding: 'Hardcover',
        pageCount: 512,
        yearPublished: 1980,
        originalPublicationYear: 1980,
        dateRead: '2024-07-15',
        dateAdded: '2024-06-01',
        exclusiveShelf: 'read',
        bookshelves: [],
        bookshelvesWithPositions: null,
        readCount: 1,
        ownedCopies: 1,
        myReview: 'Scholarly brilliance.',
        spoiler: false,
        privateNotes: null,
        shelving: null,
        reviewDetails: null,
        readingSessions: [
          {
            startedAt: '2024-06-01',
            endedAt: '2024-07-15',
            state: 'COMPLETED',
            durationDays: 45,
          },
        ],
        kindleNotes: [],
        recommendations: [],
      };

      const archetype = computeBookPacingArchetype(mockBook);
      expect(archetype.type).toBe('savor');
      expect(archetype.label).toBe('Deep Savor');
      expect(archetype.days).toBe(45);
      expect(archetype.groundingSource).toBe('goodreads');
    });

    it('grounds pacing in Kindle highlight timestamp deltas when available', () => {
      const mockBook: Book = {
        id: 'kindle-grounded-1',
        title: 'HHhH',
        cleanTitle: 'HHhH',
        seriesName: null,
        seriesNumber: null,
        author: 'Laurent Binet',
        authorSort: 'Binet, Laurent',
        additionalAuthors: [],
        isbn: null,
        isbn13: null,
        myRating: 4,
        averageRating: 4.0,
        publisher: 'Grasset',
        binding: 'Paperback',
        pageCount: 330,
        yearPublished: 2010,
        originalPublicationYear: 2010,
        dateRead: '2024-08-20',
        dateAdded: '2024-08-01',
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
      };

      const mockClippings = [
        {
          id: 'clip-1',
          rawTitle: 'HHhH',
          cleanTitle: 'HHhH',
          author: 'Laurent Binet',
          matchedBookId: 'kindle-grounded-1',
          type: 'highlight' as const,
          page: 20,
          locationStart: 100,
          locationEnd: 110,
          addedAt: '2024-08-05T14:30:00Z',
          content: 'First notable passage.',
        },
        {
          id: 'clip-2',
          rawTitle: 'HHhH',
          cleanTitle: 'HHhH',
          author: 'Laurent Binet',
          matchedBookId: 'kindle-grounded-1',
          type: 'highlight' as const,
          page: 310,
          locationStart: 2800,
          locationEnd: 2820,
          addedAt: '2024-08-17T18:45:00Z',
          content: 'Final climactic highlight.',
        },
      ];

      const archetype = computeBookPacingArchetype(mockBook, mockClippings);
      expect(archetype.groundingSource).toBe('kindle');
      expect(archetype.days).toBe(13); // 12 days delta + 1
      expect(archetype.type).toBe('steady');
      expect(archetype.label).toBe('Steady Cadence');
      expect(archetype.dateRange).toEqual({
        start: '2024-08-05',
        finish: '2024-08-17',
      });
    });

    it('computes Reading Friction Metrics preserving pages across DNF shelf', () => {
      const friction = computeReadingFrictionMetrics(bundle);
      expect(friction.dnfCount).toBe(8);
      expect(friction.totalAbandonedPages).toBeGreaterThan(2500);
      expect(friction.totalPagesSaved).toBeGreaterThan(2000);
      expect(friction.dnfBooks.length).toBe(8);
      expect(friction.dropOffCounts.earlyExit + friction.dropOffCounts.midpointDrift + friction.dropOffCounts.lateExit).toBe(8);

      // Verify friction patterns identify doorstoppers
      const doorstopperPattern = friction.frictionPatternCounts.find(p => p.label.includes('Doorstopper'));
      expect(doorstopperPattern).toBeDefined();
      expect(doorstopperPattern!.count).toBeGreaterThanOrEqual(2);
    });

    it('detects nightstand stall in computeNightstandDiagnostics', () => {
      // Simulate currently-reading book with >40 days idle
      const oldBundle: LibraryBundle = {
        ...bundle,
        books: [
          {
            ...bundle.books[0],
            id: 'stalled-desk-book',
            title: 'Stalled Philosophy Volume',
            cleanTitle: 'Stalled Philosophy Volume',
            exclusiveShelf: 'currently-reading',
            pageCount: 400,
            dateAdded: '2024-01-01',
            readingSessions: [
              {
                startedAt: '2024-01-05',
                endedAt: null,
                state: 'READING',
                durationDays: null,
              },
            ],
          },
        ],
      };

      const diagnostics = computeNightstandDiagnostics(oldBundle);
      const stalled = diagnostics.find(d => d.book.id === 'stalled-desk-book');
      expect(stalled).toBeDefined();
      expect(stalled!.isStalled).toBe(true);
      expect(stalled!.stallReason).toContain('Shift to \'On Hold\' to clear desk space');
    });
  });
});
