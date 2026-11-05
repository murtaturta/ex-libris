import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isNumericGoodreadsId,
  getGoodreadsBookUrl,
  getGoodreadsAuthorUrl,
} from '../src/lib/links/goodreadsLinks';
import {
  getStorageHealth,
  saveUserState,
  loadUserState,
  DEFAULT_USER_STATE,
} from '../src/lib/storage/localStateClient';

describe('Goodreads Link Resolution (B-01 / #1)', () => {
  it('correctly validates numeric Goodreads IDs', () => {
    expect(isNumericGoodreadsId('24832616')).toBe(true);
    expect(isNumericGoodreadsId('1')).toBe(true);
    expect(isNumericGoodreadsId('  12345  ')).toBe(true);
    expect(isNumericGoodreadsId('zip-123')).toBe(false);
    expect(isNumericGoodreadsId('clip-45')).toBe(false);
    expect(isNumericGoodreadsId('abc')).toBe(false);
    expect(isNumericGoodreadsId('-123')).toBe(false);
    expect(isNumericGoodreadsId(null)).toBe(false);
    expect(isNumericGoodreadsId(undefined)).toBe(false);
    expect(isNumericGoodreadsId('')).toBe(false);
  });

  it('generates direct edition URL when valid numeric ID is present', () => {
    const book = {
      id: '24832616',
      isbn13: '9786054188239',
      isbn: '6054188232',
      cleanTitle: 'Sil Baştan',
      title: 'Sil Baştan',
      author: 'Ken Grimwood',
    };
    const info = getGoodreadsBookUrl(book);
    expect(info.isDirectEdition).toBe(true);
    expect(info.url).toBe('https://www.goodreads.com/book/show/24832616');
    expect(info.label).toContain('24832616');
  });

  it('falls back to ISBN search when numeric ID is synthetic (e.g. zip-XXX) or missing', () => {
    const book = {
      id: 'zip-99',
      isbn13: '9789756006054',
      isbn: '9756006056',
      cleanTitle: 'Olasılıksız',
      title: 'Olasılıksız',
      author: 'Adam Fawer',
    };
    const info = getGoodreadsBookUrl(book);
    expect(info.isDirectEdition).toBe(false);
    expect(info.url).toContain('9789756006054');
  });

  it('falls back to title and author search when ISBNs are missing', () => {
    const book = {
      id: '',
      isbn13: null as any,
      isbn: null as any,
      cleanTitle: 'Cyclonopedia',
      title: 'Cyclonopedia',
      author: 'Reza Negarestani',
    };
    const info = getGoodreadsBookUrl(book);
    expect(info.isDirectEdition).toBe(false);
    expect(info.url).toContain(encodeURIComponent('Cyclonopedia Reza Negarestani'));
  });

  it('generates proper author search URLs', () => {
    const url = getGoodreadsAuthorUrl('Ken Grimwood');
    expect(url).toContain('Ken%20Grimwood');
    expect(url).toContain('search_type=books');

    const emptyUrl = getGoodreadsAuthorUrl(null);
    expect(emptyUrl).toBe('https://www.goodreads.com/');
  });
});

describe('Storage Health & Quota Safeguards (B-09)', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
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
      key: (index: number) => Object.keys(mockStorage)[index] || null,
      get length() {
        return Object.keys(mockStorage).length;
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates storage health and detects quota usage', () => {
    mockStorage['exlibris_user_state_v02'] = JSON.stringify(DEFAULT_USER_STATE);
    const health = getStorageHealth();
    expect(health.available).toBe(true);
    expect(health.usedBytes).toBeGreaterThan(0);
    expect(health.quotaWarning).toBe(false);
  });

  it('gracefully handles QuotaExceededError by evicting bulky bundle cache and retrying', async () => {
    // Populate bulky library bundle cache
    mockStorage['exlibris_library_bundle_v02'] = 'X'.repeat(5000);

    let setCallCount = 0;
    const originalSetItem = localStorage.setItem;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, val) => {
      setCallCount++;
      if (setCallCount === 1) {
        const err: any = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      originalSetItem.call(localStorage, key, val);
    });

    const testState = { ...DEFAULT_USER_STATE, showCovers: true };
    // This will trigger QuotaExceededError on first attempt, evict bundle cache, and succeed on retry
    await saveUserState(testState);

    expect(mockStorage['exlibris_library_bundle_v02']).toBeUndefined();
    expect(mockStorage['exlibris_user_state_v02']).toBeTruthy();
  });
});
