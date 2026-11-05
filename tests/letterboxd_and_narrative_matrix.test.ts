import { describe, it, expect } from 'vitest';
import {
  parseLetterboxdCsv,
  formatStarRating,
  parseLetterboxdExport,
  isLetterboxdCsv,
  mergeSingleLetterboxdCsv,
} from '../src/lib/parsers/letterboxdParser';
import { computeKindleReadingHeatmap } from '../src/lib/analytics/engine';
import type { UserLocalState, Book } from '../src/types/library';

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
});
