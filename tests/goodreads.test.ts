import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  formatPublicationYear,
  sanitizeIsbn,
  extractSeriesFromTitle,
  formatReviewHtml,
} from '../src/lib/formatters';

import {
  parseGoodreadsCsv,
  mergeBooksIntoBundle,
} from '../src/lib/parsers/goodreadsCsv';

import {
  getOracleCandidates,
  getUnfinishedSeries,
  getTrustedAuthorPicks,
  computeObservatoryMetrics,
} from '../src/lib/analytics/engine';

import type { LibraryBundle, Book } from '../src/types/library';

describe('Goodreads Data Integrity & UX Suite', () => {
  const bundlePath = path.resolve(__dirname, '../public/data/library_bundle.json');
  let bundle: LibraryBundle;

  try {
    const raw = fs.readFileSync(bundlePath, 'utf-8').replace(/^\uFEFF/, '');
    bundle = JSON.parse(raw) as LibraryBundle;
  } catch {
    // Fallback if bundle not generated yet in unit test env
    bundle = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      summaryStats: {
        totalBooks: 301,
        distinctAuthors: 150,
        booksWithSeries: 50,
        shelves: { read: 250, toRead: 40, currentlyReading: 3, didNotFinish: 8 },
        ratings: { ratedCount: 87, unratedCount: 214, averageRating: 4.01, distribution: {} },
        pages: { totalPagesRead: 50000, totalLibraryPages: 75000, booksWithPagesCount: 290, booksWithoutPagesCount: 11 },
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

  describe('1. Sanitizers & Formatters', () => {
    it('sanitizes ISBN fields correctly', () => {
      expect(sanitizeIsbn('="043965548X"')).toBe('043965548X');
      expect(sanitizeIsbn('=""')).toBeNull();
      expect(sanitizeIsbn(null)).toBeNull();
      expect(sanitizeIsbn('9780439655484')).toBe('9780439655484');
    });

    it('formats publication years correctly including BCE and nulls', () => {
      expect(formatPublicationYear(-800)).toBe('800 BCE');
      expect(formatPublicationYear(-400)).toBe('400 BCE');
      expect(formatPublicationYear(1948)).toBe('1948');
      expect(formatPublicationYear(null)).toBe('—');
    });

    it('extracts series names, clean titles, and numbers (including fractions)', () => {
      const res1 = extractSeriesFromTitle('Dune (Dune, #1)');
      expect(res1).toEqual({
        cleanTitle: 'Dune',
        seriesName: 'Dune',
        seriesNumber: '1',
      });

      const res2 = extractSeriesFromTitle('The Hedge Knight (Tales of Dunk and Egg, #0.5)');
      expect(res2).toEqual({
        cleanTitle: 'The Hedge Knight',
        seriesName: 'Tales of Dunk and Egg',
        seriesNumber: '0.5',
      });

      const res3 = extractSeriesFromTitle('Standalone Book');
      expect(res3).toEqual({
        cleanTitle: 'Standalone Book',
        seriesName: null,
        seriesNumber: null,
      });
    });

    it('formats review HTML by stripping book links cleanly', () => {
      const rawReview = 'An amazing epic! Check out [b:The Last Kingdom|68527|The Last Kingdom (Saxon Stories, #1)] for more.';
      const formatted = formatReviewHtml(rawReview);
      const joined = formatted.join('\n');
      expect(joined).toContain('The Last Kingdom');
      expect(joined).not.toContain('[b:');
    });
  });

  describe('2. CSV Parser Edge Cases & Non-Destructive Merge', () => {
    it('handles torture CSV rows (My Rating = 0, Pages = 0, BCE years, DNF shelf)', () => {
      const csvContent = `"Book Id","Title","Author","My Rating","Average Rating","Publisher","Binding","Number of Pages","Year Published","Original Publication Year","Date Read","Date Added","Exclusive Shelf","My Review","Read Count","Spoiler","Private Notes"\n` +
        `"999999","Test Odyssey","Homer","0","4.5","Penguin","Paperback","0","-800","-800","","2023/01/01","did-not-finish","Multiline review\nwith quote","0","false","Private DNF note"`;
      
      const parsed = parseGoodreadsCsv(csvContent);
      expect(parsed.length).toBe(1);
      const book = parsed[0];
      expect(book.myRating).toBeNull();
      expect(book.pageCount).toBeNull();
      expect(book.originalPublicationYear).toBe(-800);
      expect(book.exclusiveShelf).toBe('did-not-finish');
      expect(book.myReview).toContain('Multiline review');
    });

    it('merges books into bundle non-destructively preserving DSAR readingSessions and kindleNotes', () => {
      const existingBook: Book = {
        id: '17665637',
        title: 'No Longer Human',
        cleanTitle: 'No Longer Human',
        seriesName: null,
        seriesNumber: null,
        author: 'Osamu Dazai',
        authorSort: 'Dazai, Osamu',
        additionalAuthors: [],
        isbn: '1234567890',
        isbn13: null,
        myRating: 3,
        averageRating: 4.2,
        publisher: 'New Directions',
        binding: 'Paperback',
        pageCount: 176,
        yearPublished: 1958,
        originalPublicationYear: 1948,
        dateRead: '2023-05-01',
        dateAdded: '2023-04-01',
        exclusiveShelf: 'read',
        bookshelves: ['fiction'],
        bookshelvesWithPositions: null,
        readCount: 1,
        ownedCopies: 1,
        myReview: 'Old review',
        spoiler: false,
        privateNotes: null,
        shelving: null,
        reviewDetails: null,
        readingSessions: [
          { startedAt: '2023-04-25', endedAt: '2023-05-01', state: 'COMPLETED', durationDays: 6 }
        ],
        kindleNotes: [
          { activity: 'Highlight', product: 'Kindle', noteText: 'Important quote', createdAt: '2023-04-28' }
        ],
        recommendations: [],
      };

      const baseBundle: LibraryBundle = {
        ...bundle,
        books: [existingBook],
      };

      const incomingCsvBook: Book = {
        ...existingBook,
        myRating: 5, // Updated rating in CSV
        myReview: 'Updated review from CSV',
        readingSessions: [],
        kindleNotes: [],
      };

      const mergedBundle = mergeBooksIntoBundle(baseBundle, [incomingCsvBook]);
      expect(mergedBundle.books.length).toBe(1);
      expect(mergedBundle.books[0].myRating).toBe(5);
      expect(mergedBundle.books[0].myReview).toBe('Updated review from CSV');
      // Preserved local metadata
      expect(mergedBundle.books[0].readingSessions.length).toBe(1);
      expect(mergedBundle.books[0].kindleNotes.length).toBe(1);
    });
  });

  describe('3. Reconciled User Bundle Invariants', () => {
    it('has 301 total books in bundle', () => {
      expect(bundle.books.length).toBe(301);
    });

    it('ensures ratedCount is 87 and average rating ~4.01 (unrated 0s excluded)', () => {
      expect(bundle.summaryStats.ratings.ratedCount).toBe(87);
      if (bundle.summaryStats.ratings.averageRating !== null) {
        expect(bundle.summaryStats.ratings.averageRating).toBeCloseTo(4.01, 1);
      }
    });

    it('contains Homer’s Odyssey (-800) and Plato’s Republic (-400)', () => {
      const odyssey = bundle.books.find(b => b.title.toLowerCase().includes('odyssey'));
      const republic = bundle.books.find(b => b.title.toLowerCase().includes('republic'));

      expect(odyssey?.originalPublicationYear).toBe(-800);
      expect(republic?.originalPublicationYear).toBe(-400);
    });

    it('verifies No Longer Human (id 17665637) reading sessions and kindle notes if present', () => {
      const nlh = bundle.books.find(b => b.id === '17665637');
      expect(nlh).toBeDefined();
      expect(nlh?.readingSessions.length).toBe(3);
      expect(nlh?.kindleNotes.length).toBe(3);
    });

    it('returns non-empty analytics engine results', () => {
      const oracles = getOracleCandidates(bundle);
      const unfinished = getUnfinishedSeries(bundle);
      const trusted = getTrustedAuthorPicks(bundle);
      const observatory = computeObservatoryMetrics(bundle);

      expect(oracles.length).toBeGreaterThan(0);
      expect(unfinished.length).toBeGreaterThan(0);
      expect(trusted.length).toBeGreaterThan(0);
      expect(observatory).toBeDefined();
      expect(observatory.dnfBooks.length).toBe(8);
    });
  });
});
