import { describe, it, expect } from 'vitest';
import {
  parseLetterboxdCsv,
  formatStarRating,
  parseLetterboxdExport,
  isLetterboxdCsv,
  mergeSingleLetterboxdCsv,
} from '../src/lib/parsers/letterboxdParser';
import {
  computeKindleReadingHeatmap,
  titlesMatchAdaptation,
  computeAdaptationBridge,
  findFilmAdaptationForBook,
} from '../src/lib/analytics/engine';
import type { UserLocalState, Book, LibraryBundle } from '../src/types/library';

describe('Letterboxd Cinema Intake & Narrative Correlation Matrix', () => {
  describe('formatStarRating', () => {
    it('formats half and full stars correctly with letterpress typography', () => {
      expect(formatStarRating(0.5)).toBe('½');
      expect(formatStarRating(1.0)).toBe('★');
      expect(formatStarRating(2.5)).toBe('★★½');
      expect(formatStarRating(4.0)).toBe('★★★★');
      expect(formatStarRating(4.5)).toBe('★★★★½');
      expect(formatStarRating(5.0)).toBe('★★★★★');
      expect(formatStarRating(null)).toBe('—');
      expect(formatStarRating(undefined as any)).toBe('—');
      expect(formatStarRating(NaN)).toBe('—');
    });
  });

  describe('parseLetterboxdCsv & parseLetterboxdExport', () => {
    it('parses robust CSV strings with quotes, escaped characters and strips BOM', () => {
      const csv = '\uFEFFDate,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-03-27,"The Truman Show",1998,https://boxd.it/2aEw,4.5,Yes,"surveillance, existential",2026-03-27\n';
      const rows = parseLetterboxdCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]['Name']).toBe('The Truman Show');
      expect(rows[0]['Rating']).toBe('4.5');
      expect(rows[0]['Rewatch']).toBe('Yes');
      expect(rows[0]['Tags']).toBe('surveillance, existential');
    });

    it('merges diary, ratings, reviews, watched and watchlist into unified dataset', () => {
      const diaryCsv = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-01-15,"Arrival",2016,https://boxd.it/bW3g,5.0,No,"sci-fi",2026-01-15\n';
      const ratingsCsv = 'Date,Name,Year,Letterboxd URI,Rating\n2026-01-15,"Arrival",2016,https://boxd.it/bW3g,5.0\n2025-10-10,"Solaris",1972,https://boxd.it/1u1Y,4.5\n';
      const reviewsCsv = 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2026-01-15,"Arrival",2016,https://boxd.it/bW3g,5.0,No,"A masterpiece of nonlinear temporal epistemology.",,2026-01-15\n';
      const watchedCsv = 'Date,Name,Year,Letterboxd URI\n2026-01-15,"Arrival",2016,https://boxd.it/bW3g\n2025-10-10,"Solaris",1972,https://boxd.it/1u1Y\n';
      const watchlistCsv = 'Date,Name,Year,Letterboxd URI\n2026-02-01,"Stalker",1979,https://boxd.it/2916\n';

      const result = parseLetterboxdExport({
        diaryCsv,
        ratingsCsv,
        reviewsCsv,
        watchedCsv,
        watchlistCsv,
      });

      expect(result.watches).toHaveLength(2);
      expect(result.totalReviewsCount).toBe(1);
      expect(result.totalWatchlistCount).toBe(1);

      const arrival = result.watches.find((w) => w.name === 'Arrival');
      expect(arrival).toBeDefined();
      expect(arrival?.rating).toBe(5.0);
      expect(arrival?.review).toContain('nonlinear temporal epistemology');
      expect(arrival?.date).toBe('2026-01-15');

      const solaris = result.watches.find((w) => w.name === 'Solaris');
      expect(solaris).toBeDefined();
      expect(solaris?.rating).toBe(4.5);
    });

    it('identifies Letterboxd CSV files vs Goodreads exports', () => {
      expect(isLetterboxdCsv('diary.csv', 'Date,Name,Year')).toBe(true);
      expect(isLetterboxdCsv('watched.csv', 'Date,Name,Year')).toBe(true);
      expect(isLetterboxdCsv('export.csv', 'Date,Name,Year,Letterboxd URI')).toBe(true);
      expect(isLetterboxdCsv('goodreads_library_export.csv', 'Book Id,Title,Author')).toBe(false);
    });

    it('merges single Letterboxd CSV into existing state non-destructively', () => {
      const initial = parseLetterboxdExport({
        diaryCsv: 'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-01-15,"Arrival",2016,https://boxd.it/bW3g,5.0,No,,2026-01-15\n',
      });

      const newCsv = 'Date,Name,Year,Letterboxd URI,Rating\n2026-02-20,"Dune: Part Two",2024,https://boxd.it/sFde,4.5\n';
      const merged = mergeSingleLetterboxdCsv('ratings.csv', newCsv, initial);

      expect(merged.watches.length).toBeGreaterThanOrEqual(2);
      expect(merged.watches.some((w) => w.name === 'Arrival')).toBe(true);
      expect(merged.watches.some((w) => w.name === 'Dune: Part Two')).toBe(true);
    });
  });

  describe('Narrative Matrix Illumination with Letterboxd', () => {
    it('illuminates calendar cells when films are screened on days without reading highlights', () => {
      const userState: UserLocalState = {
        version: '1.0',
        updatedAt: '2026-11-04T00:00:00Z',
        showCovers: true,
        bookOverrides: {},
        kindleClippings: [], // 0 Kindle highlights
        letterboxdData: {
          version: '1.0',
          updatedAt: '2026-11-04T00:00:00Z',
          totalWatchedCount: 1,
          totalDiaryCount: 1,
          totalReviewsCount: 1,
          totalWatchlistCount: 0,
          watches: [
            {
              id: 'lb-1',
              name: 'The Martian',
              year: 2015,
              uri: 'https://boxd.it/7x7K',
              rating: 4.5,
              rewatch: false,
              date: '2026-03-10',
              review: 'Superb problem-solving narrative.',
              source: 'diary',
            },
          ],
          ratingsMap: { 'The Martian (2015)': 4.5 },
          reviewsMap: { 'The Martian (2015)': 'Superb problem-solving narrative.' },
          watchlist: [],
        },
      };

      const metrics = computeKindleReadingHeatmap(userState, []);

      expect(metrics.totalFilmsWatched).toBe(1);
      expect(metrics.totalCinemaDays).toBe(1);
      expect(metrics.hasCinemaTelemetry).toBe(true);

      const grid2026 = metrics.allYearsGrids[2026];
      expect(grid2026).toBeDefined();
      expect(grid2026.totalFilmsWatched).toBe(1);
      expect(grid2026.activeCinemaDaysCount).toBe(1);

      // Verify the specific day cell
      let foundDay: any = null;
      for (const week of grid2026.weeks) {
        for (const day of week.days) {
          if (day && day.date === '2026-03-10') {
            foundDay = day;
            break;
          }
        }
        if (foundDay) break;
      }

      expect(foundDay).toBeDefined();
      expect(foundDay.filmsWatchedCount).toBe(1);
      expect(foundDay.isCinemaDay).toBe(true);
      expect(foundDay.cinemaIntensityLevel).toBe(2);
      expect(foundDay.watchedFilms[0].name).toBe('The Martian');
      expect(foundDay.watchedFilms[0].rating).toBe(4.5);
    });

    it('marks isDualMomentumDay when drafting in Obsidian happens on the same day as cinema screening', () => {
      const userState: UserLocalState = {
        version: '1.0',
        updatedAt: '2026-11-04T00:00:00Z',
        showCovers: true,
        bookOverrides: {},
        kindleClippings: [],
        writingTelemetry: {
          version: '1.0',
          updatedAt: '2026-11-04T00:00:00Z',
          source: 'Keep the Rhythm',
          totalWords: 1200,
          totalChars: 6000,
          dailyGoal: 300,
          completedGoalDaysCount: 1,
          completedGoalDates: ['2026-03-10'],
          activeDaysCount: 1,
          dailyTotals: {
            '2026-03-10': 1200,
          },
          hourlyTotals: Array(24).fill(50),
          projects: [],
          matchedReviews: {},
          dailyFiles: {
            '2026-03-10': [
              {
                fileName: 'Ioren Chapter 4.md',
                filePath: 'Manuscripts/Ioren/Chapter 4.md',
                folder: 'Manuscripts/Ioren',
                words: 1200,
              },
            ],
          },
        },
        letterboxdData: {
          version: '1.0',
          updatedAt: '2026-11-04T00:00:00Z',
          totalWatchedCount: 1,
          totalDiaryCount: 1,
          totalReviewsCount: 0,
          totalWatchlistCount: 0,
          watches: [
            {
              id: 'lb-1',
              name: 'Blade Runner 2049',
              year: 2017,
              uri: 'https://boxd.it/bW3g',
              rating: 5.0,
              rewatch: true,
              date: '2026-03-10',
              source: 'diary',
            },
          ],
          ratingsMap: {},
          reviewsMap: {},
          watchlist: [],
        },
      };

      const metrics = computeKindleReadingHeatmap(userState, []);

      const grid2026 = metrics.allYearsGrids[2026];
      let foundDay: any = null;
      for (const week of grid2026.weeks) {
        for (const day of week.days) {
          if (day && day.date === '2026-03-10') {
            foundDay = day;
            break;
          }
        }
        if (foundDay) break;
      }

      expect(foundDay).toBeDefined();
      expect(foundDay.wordsWrittenCount).toBe(1200);
      expect(foundDay.filmsWatchedCount).toBe(1);
      expect(foundDay.watchedFilms[0].name).toBe('Blade Runner 2049');
    });
  });

  describe('The Adaptation Oracle (Codex ⇄ Screen Bridge)', () => {
    describe('titlesMatchAdaptation', () => {
      it('matches identical titles and normalizes case and articles', () => {
        expect(titlesMatchAdaptation('Solaris', 'Solaris')).toBe(true);
        expect(titlesMatchAdaptation('The Martian', 'Martian')).toBe(true);
        expect(titlesMatchAdaptation('A Scanner Darkly', 'Scanner Darkly')).toBe(true);
        expect(titlesMatchAdaptation('   Dune   ', 'DUNE')).toBe(true);
      });

      it('matches subtitle and sequel extensions with boundary delimiters', () => {
        expect(titlesMatchAdaptation('Dune', 'Dune: Part Two')).toBe(true);
        expect(titlesMatchAdaptation('Dune', 'Dune - Part One')).toBe(true);
        expect(titlesMatchAdaptation('Dune', 'Dune – Part Two')).toBe(true);
        expect(titlesMatchAdaptation('Mickey7', 'Mickey7: A Novel')).toBe(true);
        expect(titlesMatchAdaptation('2001: A Space Odyssey', '2001: A Space Odyssey')).toBe(true);
      });

      it('prevents false-positive substring matches without delimiters', () => {
        expect(titlesMatchAdaptation('Hunger', 'The Hunger Games')).toBe(false);
        expect(titlesMatchAdaptation('Brave', 'Brave New World')).toBe(false);
        expect(titlesMatchAdaptation('Mountain', 'The Mountain of Adventure')).toBe(false);
        expect(titlesMatchAdaptation('', 'Arrival')).toBe(false);
        expect(titlesMatchAdaptation('Solaris', '')).toBe(false);
      });
    });

    describe('computeAdaptationBridge', () => {
      const mockBundle = {
        meta: { exportDate: '2026-11-04', totalBooks: 4, readCount: 3, toReadCount: 1 },
        books: [
          {
            id: 'book-1',
            title: 'Do Androids Dream of Electric Sheep?',
            cleanTitle: 'Do Androids Dream of Electric Sheep?',
            seriesName: null,
            seriesNumber: null,
            author: 'Philip K. Dick',
            authorSort: 'Dick, Philip K.',
            additionalAuthors: [],
            isbn: null,
            isbn13: null,
            myRating: 5,
            averageRating: 4.1,
            publisher: null,
            binding: null,
            pageCount: 210,
            yearPublished: 1968,
            originalPublicationYear: 1968,
            dateRead: '2026-01-10',
            dateAdded: '2026-01-01',
            exclusiveShelf: 'read',
            bookshelves: ['sci-fi'],
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
          {
            id: 'book-2',
            title: 'Stories of Your Life and Others',
            cleanTitle: 'Stories of Your Life and Others',
            seriesName: null,
            seriesNumber: null,
            author: 'Ted Chiang',
            authorSort: 'Chiang, Ted',
            additionalAuthors: [],
            isbn: null,
            isbn13: null,
            myRating: 5,
            averageRating: 4.5,
            publisher: null,
            binding: null,
            pageCount: 280,
            yearPublished: 2002,
            originalPublicationYear: 2002,
            dateRead: '2026-01-15',
            dateAdded: '2026-01-01',
            exclusiveShelf: 'read',
            bookshelves: ['sci-fi'],
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
          {
            id: 'book-3',
            title: 'The Martian',
            cleanTitle: 'The Martian',
            seriesName: null,
            seriesNumber: null,
            author: 'Andy Weir',
            authorSort: 'Weir, Andy',
            additionalAuthors: [],
            isbn: null,
            isbn13: null,
            myRating: 4,
            averageRating: 4.4,
            publisher: null,
            binding: null,
            pageCount: 369,
            yearPublished: 2014,
            originalPublicationYear: 2014,
            dateRead: null,
            dateAdded: '2026-02-01',
            exclusiveShelf: 'to-read',
            bookshelves: ['sci-fi'],
            bookshelvesWithPositions: null,
            readCount: 0,
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
          {
            id: 'book-4',
            title: 'American Psycho',
            cleanTitle: 'American Psycho',
            seriesName: null,
            seriesNumber: null,
            author: 'Bret Easton Ellis',
            authorSort: 'Ellis, Bret Easton',
            additionalAuthors: [],
            isbn: null,
            isbn13: null,
            myRating: 4,
            averageRating: 3.8,
            publisher: null,
            binding: null,
            pageCount: 399,
            yearPublished: 1991,
            originalPublicationYear: 1991,
            dateRead: '2025-11-20',
            dateAdded: '2025-11-01',
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
          },
        ],
      } as unknown as LibraryBundle;

      const mockUserState: UserLocalState = {
        version: '1.0',
        updatedAt: '2026-11-04T00:00:00Z',
        showCovers: true,
        bookOverrides: {},
        kindleClippings: [],
        letterboxdData: {
          version: '1.0',
          updatedAt: '2026-11-04T00:00:00Z',
          totalWatchedCount: 2,
          totalDiaryCount: 2,
          totalReviewsCount: 2,
          totalWatchlistCount: 2,
          watches: [
            {
              id: 'watch-1',
              name: 'The Martian',
              year: 2015,
              uri: 'https://boxd.it/7i4W',
              rating: 4.5,
              rewatch: true,
              review: 'Yeah. Put some text over his face.',
              date: '2026-02-10',
              source: 'diary',
            },
            {
              id: 'watch-2',
              name: 'American Psycho',
              year: 2000,
              uri: 'https://boxd.it/2aEw',
              rating: 4.0,
              rewatch: false,
              review: 'Jared Leto acı içinde geberiyor 😎👍',
              date: '2025-12-05',
              source: 'diary',
            },
          ],
          ratingsMap: { 'The Martian': 4.5, 'American Psycho': 4.0 },
          reviewsMap: {
            'The Martian': 'Yeah. Put some text over his face.',
            'American Psycho': 'Jared Leto acı içinde geberiyor 😎👍',
          },
          watchlist: [
            {
              name: 'Blade Runner',
              year: 1982,
              uri: 'https://boxd.it/29B0',
              dateAdded: '2026-03-01',
            },
            {
              name: 'Arrival',
              year: 2016,
              uri: 'https://boxd.it/bW3g',
              dateAdded: '2026-03-05',
            },
          ],
        },
      };

      it('cross-references watchlist adaptations and recognizes bibliographic aliases', () => {
        const bridge = computeAdaptationBridge(mockBundle, mockUserState);

        expect(bridge.watchlistAdaptationsCount).toBe(2);
        expect(bridge.queuedOnWatchlist.some((l) => l.filmTitle === 'Blade Runner' && l.matchType === 'alias')).toBe(true);
        expect(bridge.queuedOnWatchlist.some((l) => l.filmTitle === 'Arrival' && l.matchType === 'alias')).toBe(true);

        const bladeRunnerLink = bridge.queuedOnWatchlist.find((l) => l.filmTitle === 'Blade Runner');
        expect(bladeRunnerLink?.bookTitle).toBe('Do Androids Dream of Electric Sheep?');
        expect(bladeRunnerLink?.direction).toBe('codex-to-screen');
      });

      it('extracts screen-to-nightstand recommendations with ratings and reviews', () => {
        const bridge = computeAdaptationBridge(mockBundle, mockUserState);

        expect(bridge.fromScreenToNightstand.length).toBe(2);
        const martianBridge = bridge.fromScreenToNightstand.find((l) => l.bookTitle === 'The Martian');
        expect(martianBridge).toBeDefined();
        expect(martianBridge?.filmRating).toBe(4.5);
        expect(martianBridge?.filmReview).toBe('Yeah. Put some text over his face.');
        expect(martianBridge?.bookShelf).toBe('to-read');
        expect(martianBridge?.direction).toBe('screen-to-codex');

        const psychoBridge = bridge.fromScreenToNightstand.find((l) => l.bookTitle === 'American Psycho');
        expect(psychoBridge?.filmReview).toContain('Jared Leto');
      });
    });

    describe('findFilmAdaptationForBook', () => {
      const mockUserState: UserLocalState = {
        version: '1.0',
        updatedAt: '2026-11-04T00:00:00Z',
        showCovers: true,
        bookOverrides: {},
        kindleClippings: [],
        letterboxdData: {
          version: '1.0',
          updatedAt: '2026-11-04T00:00:00Z',
          totalWatchedCount: 2,
          totalDiaryCount: 2,
          totalReviewsCount: 1,
          totalWatchlistCount: 0,
          watches: [
            {
              id: 'w-1',
              name: 'Arrival',
              year: 2016,
              uri: 'https://boxd.it/bW3g',
              rating: 5.0,
              rewatch: false,
              review: 'Nonlinear temporal masterpiece.',
              date: '2026-01-15',
              source: 'diary',
            },
            {
              id: 'w-2',
              name: 'Solaris',
              year: 1972,
              uri: 'https://boxd.it/1u1Y',
              rating: 4.5,
              rewatch: false,
              date: '2025-10-10',
              source: 'watched',
            },
          ],
          ratingsMap: {},
          reviewsMap: {},
          watchlist: [],
        },
      };

      it('finds film adaptation for book via alias', () => {
        const book: any = {
          id: 'b-chiang',
          title: 'Stories of Your Life and Others',
          cleanTitle: 'Stories of Your Life and Others',
        };
        const match = findFilmAdaptationForBook(book, mockUserState);
        expect(match).toBeDefined();
        expect(match?.name).toBe('Arrival');
        expect(match?.rating).toBe(5.0);
        expect(match?.review).toBe('Nonlinear temporal masterpiece.');
      });

      it('finds film adaptation for book via direct title match', () => {
        const book: any = {
          id: 'b-lem',
          title: 'Solaris',
          cleanTitle: 'Solaris',
        };
        const match = findFilmAdaptationForBook(book, mockUserState);
        expect(match).toBeDefined();
        expect(match?.name).toBe('Solaris');
        expect(match?.year).toBe(1972);
      });

      it('returns null when no adaptation exists in watched records', () => {
        const book: any = {
          id: 'b-none',
          title: 'The Design of Everyday Things',
          cleanTitle: 'The Design of Everyday Things',
        };
        const match = findFilmAdaptationForBook(book, mockUserState);
        expect(match).toBeNull();
      });
    });
  });
});
