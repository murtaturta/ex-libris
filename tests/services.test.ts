import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_USER_STATE,
  loadUserState,
  saveUserState,
  loadEnrichmentCache,
  saveEnrichmentBatch,
  persistLibraryBundle,
} from '../src/lib/storage/localStateClient';
import {
  enrichSingleBook,
  enrichBooksBatch,
} from '../src/lib/enrichment/metadataEnricher';
import type { Book, EnrichmentCacheMap, UserLocalState, LibraryBundle } from '../src/types/library';

describe('localStateClient storage service', () => {
  const originalFetch = globalThis.fetch;
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    // Mock localStorage for Node test runner
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('provides a valid DEFAULT_USER_STATE', () => {
    expect(DEFAULT_USER_STATE.version).toBe('0.2.0');
    expect(DEFAULT_USER_STATE.showCovers).toBe(false);
    expect(DEFAULT_USER_STATE.bookOverrides).toEqual({});
    expect(DEFAULT_USER_STATE.kindleClippings).toEqual([]);
  });

  it('loads user state from server if available', async () => {
    const serverState: UserLocalState = {
      version: '0.2.0',
      updatedAt: '2026-10-29T12:00:00.000Z',
      showCovers: true,
      bookOverrides: {
        'book-1': { nightstandState: 'active' },
      },
      kindleClippings: [],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => serverState,
    } as any);

    const loaded = await loadUserState();
    expect(loaded.showCovers).toBe(true);
    expect(loaded.bookOverrides['book-1']?.nightstandState).toBe('active');
    // Verifies it mirrored to localStorage
    expect(mockStorage['exlibris_user_state_v02']).toBeTruthy();
  });

  it('falls back to localStorage when server fetch fails', async () => {
    mockStorage['exlibris_user_state_v02'] = JSON.stringify({
      version: '0.2.0',
      updatedAt: '2026-10-29T10:00:00.000Z',
      showCovers: true,
      bookOverrides: { 'book-2': { localNotes: 'Fascinating read' } },
      kindleClippings: [],
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const loaded = await loadUserState();
    expect(loaded.showCovers).toBe(true);
    expect(loaded.bookOverrides['book-2']?.localNotes).toBe('Fascinating read');
  });

  it('saves user state to localStorage and posts to /api/user-state', async () => {
    const mockPost = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    globalThis.fetch = mockPost;

    const stateToSave: UserLocalState = {
      version: '0.2.0',
      updatedAt: '',
      showCovers: true,
      bookOverrides: {},
      kindleClippings: [],
    };

    await saveUserState(stateToSave);

    expect(mockPost).toHaveBeenCalledWith('/api/user-state', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(mockStorage['exlibris_user_state_v02']).toBeTruthy();
    const stored = JSON.parse(mockStorage['exlibris_user_state_v02']);
    expect(stored.showCovers).toBe(true);
    expect(stored.updatedAt).toBeTruthy();
  });

  it('loads and merges enrichment cache from disk and localStorage', async () => {
    mockStorage['exlibris_enrichment_cache_v02'] = JSON.stringify({
      'book-local': {
        bookId: 'book-local',
        fetchedAt: '2026-10-29',
        source: 'openlibrary',
        synopsis: 'Local synopsis',
        communityRating: 4.5,
        ratingsCount: 10,
        subjects: ['Sci-Fi'],
        coverUrl: null,
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        'book-disk': {
          bookId: 'book-disk',
          fetchedAt: '2026-10-29',
          source: 'googlebooks',
          synopsis: 'Disk synopsis',
          communityRating: 4.8,
          ratingsCount: 100,
          subjects: ['Drama'],
          coverUrl: null,
        },
      }),
    } as any);

    const merged = await loadEnrichmentCache();
    expect(merged['book-local']).toBeDefined();
    expect(merged['book-disk']).toBeDefined();
  });

  it('saves enrichment batch to localStorage and sends POST to server', async () => {
    const mockPost = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockPost;

    const batch: EnrichmentCacheMap = {
      'book-new': {
        bookId: 'book-new',
        fetchedAt: '2026-10-29',
        source: 'googlebooks',
        synopsis: 'Great book',
        communityRating: 4.2,
        ratingsCount: 50,
        subjects: ['Philosophy'],
        coverUrl: 'https://example.com/cover.jpg',
      },
    };

    await saveEnrichmentBatch(batch);
    expect(mockPost).toHaveBeenCalledWith('/api/enrichment-cache', expect.objectContaining({
      method: 'POST',
    }));
    expect(mockStorage['exlibris_enrichment_cache_v02']).toContain('book-new');
  });

  it('persists library bundle via /api/library-bundle', async () => {
    const mockPost = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = mockPost;

    const dummyBundle: LibraryBundle = {
      schemaVersion: '1.0.0',
      generatedAt: '2026-10-29',
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

    await persistLibraryBundle(dummyBundle);
    expect(mockPost).toHaveBeenCalledWith('/api/library-bundle', expect.objectContaining({
      method: 'POST',
    }));
  });
});

describe('metadataEnricher service', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const sampleBook: Book = {
    id: '12345',
    title: 'Dune (Dune, #1)',
    cleanTitle: 'Dune',
    seriesName: 'Dune',
    seriesNumber: '1',
    author: 'Frank Herbert',
    authorSort: 'Herbert, Frank',
    additionalAuthors: [],
    isbn: '0441172717',
    isbn13: '9780441172719',
    myRating: 5,
    averageRating: 4.25,
    publisher: 'Ace',
    binding: 'Paperback',
    pageCount: 658,
    yearPublished: 1990,
    originalPublicationYear: 1965,
    dateRead: '2022-01-01',
    dateAdded: '2021-01-01',
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
  };

  it('enriches book from Google Books with HTML stripping and upgraded https cover', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            totalItems: 1,
            items: [
              {
                volumeInfo: {
                  description: '<p>Set on the desert planet <i>Arrakis</i>.<br/>A masterpiece &amp; classic.</p>',
                  averageRating: 4.456,
                  ratingsCount: 15000,
                  categories: ['Fiction / Science Fiction / Space Opera'],
                  imageLinks: {
                    thumbnail: 'http://books.google.com/thumbnail.jpg',
                  },
                  language: 'en',
                },
              },
            ],
          }),
        };
      }
      return { ok: false };
    });

    const result = await enrichSingleBook(sampleBook);
    expect(result.bookId).toBe('12345');
    expect(result.source).toBe('googlebooks');
    expect(result.synopsis).toBe('Set on the desert planet Arrakis.\nA masterpiece & classic.');
    expect(result.communityRating).toBe(4.46);
    expect(result.ratingsCount).toBe(15000);
    expect(result.coverUrl).toBe('https://books.google.com/thumbnail.jpg');
    expect(result.subjects).toContain('Space Opera');
    expect(result.detectedOriginalLanguage).toBe('EN');
  });

  it('combines Google Books synopsis with OpenLibrary crowd rating in hybrid mode', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('googleapis.com')) {
        // Google has synopsis but no community rating
        return {
          ok: true,
          json: async () => ({
            totalItems: 1,
            items: [
              {
                volumeInfo: {
                  description: 'Detailed epic synopsis from Google Books.',
                  categories: ['Science Fiction'],
                },
              },
            ],
          }),
        };
      }
      if (url.includes('openlibrary.org')) {
        // OpenLibrary has rating and cover
        return {
          ok: true,
          json: async () => ({
            docs: [
              {
                ratings_average: 4.198,
                ratings_count: 520,
                cover_i: 889900,
                subject: ['Sand dunes', 'Protected DAISY', 'Interplanetary relations'],
              },
            ],
          }),
        };
      }
      return { ok: false };
    });

    const result = await enrichSingleBook(sampleBook);
    expect(result.source).toBe('hybrid');
    expect(result.synopsis).toBe('Detailed epic synopsis from Google Books.');
    expect(result.communityRating).toBe(4.2);
    expect(result.ratingsCount).toBe(520);
    expect(result.coverUrl).toBe('https://covers.openlibrary.org/b/id/889900-M.jpg');
    expect(result.subjects).toContain('Science Fiction');
    expect(result.subjects).toContain('Sand Dunes');
    expect(result.subjects).not.toContain('Protected Daisy');
  });

  it('gracefully handles complete network failure without throwing', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('DNS Failure'));

    const result = await enrichSingleBook(sampleBook);
    expect(result.bookId).toBe('12345');
    expect(result.source).toBe('none');
    expect(result.synopsis).toBeNull();
    expect(result.communityRating).toBeNull();
    expect(result.subjects).toEqual([]);
    expect(result.coverUrl).toBeNull();
  });

  it('enriches a batch of books with concurrency, skips existing, and flushes incremental batches', async () => {
    const books: Book[] = Array.from({ length: 10 }, (_, i) => ({
      ...sampleBook,
      id: `book-${i}`,
      title: `Book Title ${i}`,
      cleanTitle: `Book Title ${i}`,
    }));

    // Cache has book-0 already
    const existingCache: EnrichmentCacheMap = {
      'book-0': {
        bookId: 'book-0',
        fetchedAt: '2026-10-29',
        source: 'googlebooks',
        synopsis: 'Already cached synopsis',
        communityRating: 4.0,
        ratingsCount: 10,
        subjects: [],
        coverUrl: null,
      },
    };

    globalThis.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        totalItems: 1,
        items: [{ volumeInfo: { description: 'Batch synopsis', averageRating: 4.5 } }],
      }),
    }));

    const flushedBatches: EnrichmentCacheMap[] = [];
    const progressCalls: number[] = [];

    const result = await enrichBooksBatch(books, existingCache, {
      concurrency: 2,
      onProgress: (done) => progressCalls.push(done),
      onFlushBatch: async (batch) => {
        flushedBatches.push(batch);
      },
    });

    // book-0 was preserved without re-fetching
    expect(result['book-0'].synopsis).toBe('Already cached synopsis');
    // 9 books were processed
    expect(progressCalls.length).toBe(9);
    expect(progressCalls[progressCalls.length - 1]).toBe(9);
    // Batches of 8 + remainder flushed
    expect(flushedBatches.length).toBeGreaterThanOrEqual(1);
    const totalFlushedBooks = flushedBatches.reduce((acc, b) => acc + Object.keys(b).length, 0);
    expect(totalFlushedBooks).toBe(9);
  });
});
