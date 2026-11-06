import { describe, it, expect } from 'vitest';
import {
  normalizeTitleForMatching,
  computeTitleSimilarity,
  findCandidateBooksForClipping,
  reconcileClippingsWithBook,
} from '../src/lib/parsers/kindleFuzzyMatcher';
import { generateStandaloneLibraryHtml } from '../src/lib/exporters/standaloneHtmlExporter';
import type { Book, LibraryBundle, UserLocalState, KindleClipping } from '../src/types/library';

describe('Kindle Fuzzy Matcher & Reconciler', () => {
  describe('normalizeTitleForMatching', () => {
    it('strips subtitles after colons, hyphens, and dashes', () => {
      expect(normalizeTitleForMatching('The Martian: A Novel')).toBe('martian');
      expect(normalizeTitleForMatching('Dune – Deluxe Edition')).toBe('dune');
      expect(normalizeTitleForMatching('Ficciones - Edición Especial')).toBe('ficciones');
    });

    it('strips parenthetical edition tags and series indicators', () => {
      expect(normalizeTitleForMatching('Solaris (Polish Edition)')).toBe('solaris');
      expect(normalizeTitleForMatching('Hyperion (Hyperion Cantos #1)')).toBe('hyperion');
      expect(normalizeTitleForMatching('Karanlığın Sol Eli (Turkish Edition)')).toBe('karanlığın sol eli');
    });

    it('strips leading English articles', () => {
      expect(normalizeTitleForMatching('The Name of the Rose')).toBe('name of the rose');
      expect(normalizeTitleForMatching('A Canticle for Leibowitz')).toBe('canticle for leibowitz');
      expect(normalizeTitleForMatching('An Artist of the Floating World')).toBe('artist of the floating world');
    });
  });

  describe('computeTitleSimilarity', () => {
    it('returns 1.0 for identical titles', () => {
      expect(computeTitleSimilarity('Dune', 'Dune')).toBe(1.0);
    });

    it('returns high similarity (>= 0.8) for title with and without subtitle', () => {
      const score = computeTitleSimilarity('The Martian: A Novel', 'The Martian');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    it('returns 0 for completely unrelated titles', () => {
      const score = computeTitleSimilarity('The Great Gatsby', 'Neuromancer');
      expect(score).toBeLessThan(0.3);
    });
  });

  describe('findCandidateBooksForClipping', () => {
    const mockBooks: Book[] = [
      {
        id: 'book-1',
        title: 'The Martian',
        cleanTitle: 'The Martian',
        author: 'Andy Weir',
        authorSort: 'Weir, Andy',
        additionalAuthors: [],
        isbn: null,
        isbn13: null,
        myRating: 5,
        averageRating: 4.4,
        publisher: 'Crown',
        binding: 'Hardcover',
        pageCount: 369,
        yearPublished: 2014,
        originalPublicationYear: 2011,
        dateRead: '2023-05-10',
        dateAdded: '2023-01-01',
        bookshelves: ['favorites'],
        exclusiveShelf: 'read',
        myReview: '',
        readCount: 1,
        ownedCopies: 1,
      } as unknown as Book,
      {
        id: 'book-2',
        title: 'Dune',
        cleanTitle: 'Dune',
        author: 'Frank Herbert',
        authorSort: 'Herbert, Frank',
        additionalAuthors: [],
        isbn: null,
        isbn13: null,
        myRating: 5,
        averageRating: 4.25,
        publisher: 'Chilton',
        binding: 'Paperback',
        pageCount: 688,
        yearPublished: 1965,
        originalPublicationYear: 1965,
        dateRead: '2022-08-15',
        dateAdded: '2022-01-01',
        bookshelves: ['sci-fi'],
        exclusiveShelf: 'read',
        myReview: '',
        readCount: 1,
        ownedCopies: 1,
      } as unknown as Book,
      {
        id: 'book-3',
        title: 'Solaris',
        cleanTitle: 'Solaris',
        author: 'Stanisław Lem',
        authorSort: 'Lem, Stanisław',
        additionalAuthors: [],
        isbn: null,
        isbn13: null,
        myRating: 5,
        averageRating: 4.0,
        publisher: 'Wydawnictwo Literackie',
        binding: 'Paperback',
        pageCount: 204,
        yearPublished: 1961,
        originalPublicationYear: 1961,
        dateRead: '2024-02-12',
        dateAdded: '2024-01-01',
        bookshelves: ['canon'],
        exclusiveShelf: 'read',
        myReview: '',
        readCount: 1,
        ownedCopies: 1,
      } as unknown as Book,
    ];

    it('matches "The Martian: A Novel" by Andy Weir to book-1', () => {
      const candidates = findCandidateBooksForClipping(
        'The Martian: A Novel',
        'Andy Weir',
        mockBooks
      );
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].book.id).toBe('book-1');
      expect(candidates[0].score).toBeGreaterThanOrEqual(0.85);
    });

    it('ranks exact match highest', () => {
      const candidates = findCandidateBooksForClipping('Solaris', 'Lem', mockBooks);
      expect(candidates[0].book.id).toBe('book-3');
      expect(candidates[0].score).toBe(1.0);
      expect(candidates[0].matchReason).toBe('exact');
    });
  });

  describe('reconcileClippingsWithBook', () => {
    const mockClippings: KindleClipping[] = [
      {
        id: 'clip-1',
        rawTitle: 'The Martian: A Novel (Andy Weir)',
        cleanTitle: 'The Martian: A Novel',
        author: 'Andy Weir',
        type: 'highlight',
        page: 42,
        locationStart: 120,
        locationEnd: 125,
        addedAt: '2023-05-10T12:00:00Z',
        content: 'I guess you could say I’m fucked.',
        attachedNote: null,
        highlightColor: 'yellow',
        chapter: 'Chapter 1',
        matchedBookId: null,
      },
      {
        id: 'clip-2',
        rawTitle: 'The Martian: A Novel (Andy Weir)',
        cleanTitle: 'The Martian: A Novel',
        author: 'Andy Weir',
        type: 'highlight',
        page: 55,
        locationStart: 180,
        locationEnd: 185,
        addedAt: '2023-05-10T14:00:00Z',
        content: 'I’m going to have to science the shit out of this.',
        attachedNote: 'Classic quote',
        highlightColor: 'orange',
        chapter: 'Chapter 2',
        matchedBookId: null,
      },
      {
        id: 'clip-3',
        rawTitle: 'Dune (Frank Herbert)',
        cleanTitle: 'Dune',
        author: 'Frank Herbert',
        type: 'highlight',
        page: 12,
        locationStart: 30,
        locationEnd: 35,
        addedAt: '2022-08-15T10:00:00Z',
        content: 'Fear is the mind-killer.',
        attachedNote: null,
        highlightColor: 'yellow',
        chapter: 'Part 1',
        matchedBookId: 'book-2',
      },
    ];

    it('pairs all matching clippings with the target bookId', () => {
      const result = reconcileClippingsWithBook(
        mockClippings,
        'The Martian: A Novel',
        'book-1'
      );
      expect(result.reconciledCount).toBe(2);
      expect(result.updatedClippings[0].matchedBookId).toBe('book-1');
      expect(result.updatedClippings[1].matchedBookId).toBe('book-1');
      // Unrelated clipping remains intact
      expect(result.updatedClippings[2].matchedBookId).toBe('book-2');
    });
  });
});

describe('Standalone Portable HTML Exporter', () => {
  const bundle = {
    books: [
      {
        id: 'b-101',
        title: 'Ficciones',
        cleanTitle: 'Ficciones',
        author: 'Jorge Luis Borges',
        authorSort: 'Borges, Jorge Luis',
        additionalAuthors: [],
        isbn: null,
        isbn13: null,
        myRating: 5,
        averageRating: 4.45,
        publisher: 'Sur',
        binding: 'Paperback',
        pageCount: 174,
        yearPublished: 1944,
        originalPublicationYear: 1944,
        dateRead: '2024-01-10',
        dateAdded: '2024-01-01',
        bookshelves: ['canon'],
        exclusiveShelf: 'read',
        myReview: 'Masterpiece of labyrinthine metaphysical fiction.',
        readCount: 1,
        ownedCopies: 1,
      },
    ],
    readingGoals: [],
    customShelves: ['canon'],
    summaryStats: {
      totalBooks: 1,
      totalPagesRead: 174,
      averageRating: 5.0,
      shelves: { read: 1, currentlyReading: 0, toRead: 0, didNotFinish: 0 },
      ratings: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0, unrated: 0, averageRating: 5.0 },
      pages: { totalPagesRead: 174, averageBookLength: 174 },
    },
  } as unknown as LibraryBundle;

  const userState = {
    updatedAt: new Date().toISOString(),
    bookOverrides: {},
    kindleClippings: [
      {
        id: 'clip-101',
        rawTitle: 'Ficciones (Jorge Luis Borges)',
        cleanTitle: 'Ficciones',
        author: 'Jorge Luis Borges',
        type: 'highlight',
        page: 25,
        locationStart: 50,
        locationEnd: 55,
        addedAt: '2024-01-10T15:00:00Z',
        content: 'The universe (which others call the Library) is composed of an indefinite sphere...',
        attachedNote: 'Borges on infinity',
        highlightColor: 'yellow',
        chapter: 'The Library of Babel',
        matchedBookId: 'b-101',
      },
    ],
    discoveryPicks: [],
    wantList: [],
    bookplateConfig: {
      motto: 'Ex Libris',
      colophonText: 'Archived with care',
      showTotalVolumes: true,
      showTotalPages: true,
      showCanonList: true,
      themeColor: '#8C2D19',
    },
    showCovers: false,
    letterboxdData: null,
    writingTelemetry: null,
  } as unknown as UserLocalState;

  it('generates a valid, self-contained HTML document with embedded JSON payload', () => {
    const html = generateStandaloneLibraryHtml(bundle, userState);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Ex Libris — Standalone Reading Archive (1 Volumes)</title>');
    expect(html).toContain('<script id="exLibrisPayload" type="application/json">');
    expect(html).toContain('Jorge Luis Borges');
    expect(html).toContain('Ficciones');
    expect(html).toContain('The universe (which others call the Library)');
    expect(html).toContain('searchInput');
  });
});
