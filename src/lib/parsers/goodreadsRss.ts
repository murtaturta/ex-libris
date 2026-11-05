import type {
  Book,
  EnrichmentCacheMap,
  ExclusiveShelf,
  LibraryBundle,
} from '../../types/library';
import { extractSeriesFromTitle, sanitizeIsbn } from '../formatters';
import { calculateSummaryStats } from './goodreadsCsv';

/**
 * Extracts a numeric Goodreads User ID from raw input.
 * Supports:
 * - Pure numeric IDs: "137464693"
 * - Numeric ID with slug: "137464693-murat"
 * - User Profile URLs: "https://www.goodreads.com/user/show/137464693-murat"
 * - Review list URLs: "https://www.goodreads.com/review/list/137464693-murat?shelf=read"
 * - Review list RSS URLs: "https://www.goodreads.com/review/list_rss/137464693?shelf=read"
 */
export function extractGoodreadsUserId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Pure numeric ID or numeric ID with hyphen slug (e.g. "137464693" or "137464693-murat")
  const directMatch = trimmed.match(/^(\d+)(?:-[a-zA-Z0-9_-]*)?$/);
  if (directMatch) {
    return directMatch[1];
  }

  // 2. Standard Goodreads URLs with user/show, review/list, or review/list_rss
  const urlMatch = trimmed.match(
    /(?:\/user\/show\/|\/review\/list\/|\/review\/list_rss\/)(\d+)/i
  );
  if (urlMatch) {
    return urlMatch[1];
  }

  // 3. Fallback: Query parameter `user_id=\d+` or `id=\d+`
  const paramMatch = trimmed.match(/[?&](?:user_id|id)=(\d+)/i);
  if (paramMatch) {
    return paramMatch[1];
  }

  return null;
}

/**
 * Decodes standard XML / HTML entities without requiring a browser DOM environment.
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * Pure-TypeScript XML tag extractor.
 * Works uniformly in Node (tests/backend) and Browser (client) without DOMParser.
 * Handles CDATA wrappers (`<![CDATA[...]]>`), inner whitespace, and entity decoding.
 */
export function extractXmlTag(xmlBlock: string, tagName: string): string | null {
  if (!xmlBlock) return null;
  const regex = new RegExp(`<${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlBlock.match(regex);
  if (!match) return null;

  let content = match[1];

  // Unwrap CDATA if present
  content = content.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');

  // Decode standard XML entities
  content = decodeXmlEntities(content).trim();

  return content.length > 0 ? content : null;
}

/**
 * Parses RSS pubDate / RFC-2822 dates into standard ISO 'YYYY-MM-DD'.
 */
export function parseRssDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '(not provided)') return null;

  // 1. Direct date strings: YYYY/MM/DD or YYYY-MM-DD
  const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`;
  }

  const dashMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashMatch) {
    return `${dashMatch[1]}-${dashMatch[2].padStart(2, '0')}-${dashMatch[3].padStart(2, '0')}`;
  }

  // 2. Attempt RFC-2822 / full timestamp parsing via Date.parse
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) {
    const d = new Date(timestamp);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return null;
}

/**
 * Strips HTML formatting from Goodreads RSS description strings for a clean synopsis.
 */
function cleanRssDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');
  text = decodeXmlEntities(text);
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > 0 ? text : null;
}

/**
 * Selects the highest-resolution valid cover image URL, ignoring Goodreads placeholder graphics.
 */
function extractCoverUrl(itemBlock: string): string | null {
  const candidates = [
    extractXmlTag(itemBlock, 'book_large_image_url'),
    extractXmlTag(itemBlock, 'book_medium_image_url'),
    extractXmlTag(itemBlock, 'book_image_url'),
  ];

  for (const url of candidates) {
    if (!url) continue;
    const lower = url.toLowerCase();
    if (
      lower.includes('nophoto') ||
      lower.includes('no-photo') ||
      lower.includes('asset_missing')
    ) {
      continue;
    }
    return url;
  }

  return null;
}

/**
 * Parses a Goodreads bookshelf RSS XML feed text.
 * Zero DOM dependency — guaranteed safe in both Node and Browser environments.
 */
export function parseGoodreadsRssXml(
  xmlText: string,
  defaultShelf: ExclusiveShelf = 'read'
): {
  books: Book[];
  enrichment: EnrichmentCacheMap;
  profileName: string | null;
} {
  const books: Book[] = [];
  const enrichment: EnrichmentCacheMap = {};
  let profileName: string | null = null;

  if (!xmlText) {
    return { books, enrichment, profileName };
  }

  // 1. Extract Profile / Channel Name
  const channelMatch = xmlText.match(/<channel[\s>]([\s\S]*?)<\/channel>/i);
  if (channelMatch) {
    const channelTitle = extractXmlTag(channelMatch[1], 'title');
    if (channelTitle) {
      const nameMatch = channelTitle.match(/^(.+?)(?:'s|’s)\s+bookshelf/i);
      if (nameMatch) {
        profileName = nameMatch[1].trim();
      }
    }
  }

  // 2. Parse all <item> elements
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
    const itemBlock = itemMatch[1];

    // Book ID: from <book_id> or fallback to regex on <link>
    let bookId = extractXmlTag(itemBlock, 'book_id');
    if (!bookId) {
      const link = extractXmlTag(itemBlock, 'link');
      const linkMatch = link?.match(/\/book\/show\/(\d+)/i);
      if (linkMatch) {
        bookId = linkMatch[1];
      }
    }

    if (!bookId || !/^\d+$/.test(bookId.trim())) {
      continue;
    }
    bookId = bookId.trim();

    const rawTitle = extractXmlTag(itemBlock, 'title') || 'Untitled';
    const { cleanTitle, seriesName, seriesNumber } = extractSeriesFromTitle(rawTitle);

    const authorName =
      extractXmlTag(itemBlock, 'author_name') ||
      extractXmlTag(itemBlock, 'name') ||
      'Unknown Author';

    const rawIsbn = extractXmlTag(itemBlock, 'isbn');
    const rawIsbn13 = extractXmlTag(itemBlock, 'isbn13');
    const sanitizedIsbn = sanitizeIsbn(rawIsbn);
    const sanitizedIsbn13 = sanitizeIsbn(rawIsbn13);

    let isbn10: string | null = null;
    let isbn13: string | null = null;

    if (sanitizedIsbn13 && /^[0-9]{13}$/.test(sanitizedIsbn13)) {
      isbn13 = sanitizedIsbn13;
    }

    if (sanitizedIsbn) {
      if (/^[0-9]{13}$/.test(sanitizedIsbn)) {
        isbn13 = sanitizedIsbn;
      } else if (/^[0-9]{9}[0-9Xx]$/.test(sanitizedIsbn)) {
        isbn10 = sanitizedIsbn;
      }
    }

    const rawPages = extractXmlTag(itemBlock, 'num_pages');
    let pageCount: number | null = null;
    if (rawPages) {
      const parsed = parseInt(rawPages, 10);
      if (!Number.isNaN(parsed) && parsed > 0) pageCount = parsed;
    }

    const rawPub = extractXmlTag(itemBlock, 'book_published');
    let pubYear: number | null = null;
    if (rawPub) {
      const parsed = parseInt(rawPub, 10);
      if (!Number.isNaN(parsed) && parsed !== 0) pubYear = parsed;
    }

    // STRICT: User rating: 0 means unrated -> map to null
    const rawUserRating = extractXmlTag(itemBlock, 'user_rating');
    let userRating: number | null = null;
    if (rawUserRating) {
      const parsed = parseFloat(rawUserRating);
      if (!Number.isNaN(parsed) && parsed > 0) userRating = parsed;
    }

    // Average community rating: populate BOTH book.averageRating AND enrichment.communityRating
    const rawAvgRating = extractXmlTag(itemBlock, 'average_rating');
    let averageRating: number | null = null;
    if (rawAvgRating) {
      const parsed = parseFloat(rawAvgRating);
      if (!Number.isNaN(parsed) && parsed > 0) averageRating = parsed;
    }

    const dateRead = parseRssDate(extractXmlTag(itemBlock, 'user_read_at'));
    const dateAdded =
      parseRssDate(extractXmlTag(itemBlock, 'user_date_added')) ||
      parseRssDate(extractXmlTag(itemBlock, 'pubDate'));

    const rawShelves = extractXmlTag(itemBlock, 'user_shelves') || '';
    const bookshelves = rawShelves
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    let exclusiveShelf: ExclusiveShelf = defaultShelf;
    if (bookshelves.includes('currently-reading')) {
      exclusiveShelf = 'currently-reading';
    } else if (
      bookshelves.includes('did-not-finish') ||
      bookshelves.includes('dnf') ||
      bookshelves.includes('abandoned')
    ) {
      exclusiveShelf = 'did-not-finish';
    } else if (bookshelves.includes('read')) {
      exclusiveShelf = 'read';
    } else if (bookshelves.includes('to-read')) {
      exclusiveShelf = 'to-read';
    }

    const userReview = extractXmlTag(itemBlock, 'user_review');
    const coverUrl = extractCoverUrl(itemBlock);
    const synopsis = cleanRssDescription(extractXmlTag(itemBlock, 'book_description'));

    const book: Book = {
      id: bookId,
      title: rawTitle,
      cleanTitle: cleanTitle || rawTitle,
      seriesName,
      seriesNumber,
      author: authorName,
      authorSort: null,
      additionalAuthors: [],
      isbn: isbn10,
      isbn13,
      myRating: userRating,
      averageRating,
      publisher: null,
      binding: null,
      pageCount,
      yearPublished: pubYear,
      originalPublicationYear: pubYear,
      dateRead,
      dateAdded,
      exclusiveShelf,
      bookshelves,
      bookshelvesWithPositions: null,
      readCount: exclusiveShelf === 'read' ? 1 : 0,
      ownedCopies: 0,
      myReview: userReview,
      spoiler: false,
      privateNotes: null,
      shelving: null,
      reviewDetails: null,
      readingSessions: [],
      kindleNotes: [],
      recommendations: [],
    };

    books.push(book);

    // Populate enrichment cache record
    if (coverUrl || synopsis || averageRating !== null) {
      enrichment[bookId] = {
        bookId,
        fetchedAt: new Date().toISOString(),
        source: 'hybrid',
        synopsis,
        communityRating: averageRating,
        ratingsCount: null,
        subjects: [],
        coverUrl,
      };
    }
  }

  return { books, enrichment, profileName };
}

export interface RssFetchProgress {
  shelf: string;
  page: number;
  loadedBooks: number;
  statusText: string;
}

/**
 * Transport waterfall for fetching a target Goodreads RSS URL across environments.
 */
async function fetchRssXml(
  rssUrl: string,
  userId: string,
  shelf: string,
  page: number
): Promise<string> {
  const proxyBase =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOODREADS_PROXY_URL;

  // 1. Dedicated Cloudflare Worker / Custom proxy if configured
  if (proxyBase && typeof proxyBase === 'string') {
    try {
      const fullUrl = `${proxyBase.replace(/\/+$/, '')}?url=${encodeURIComponent(rssUrl)}`;
      const res = await fetch(fullUrl);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('<rss') || text.includes('<?xml')) {
          return text;
        }
      }
    } catch {
      // Fall through
    }
  }

  // 2. Local Vite dev middleware
  try {
    const localUrl = `/api/goodreads-rss?userId=${encodeURIComponent(userId)}&shelf=${encodeURIComponent(shelf)}&page=${page}`;
    const res = await fetch(localUrl);
    if (res.ok) {
      const text = await res.text();
      if (text.includes('<rss') || text.includes('<?xml')) {
        return text;
      }
    }
  } catch {
    // In node test environment or static production, local /api might not exist
  }

  // 3. Static CORS relay waterfall
  const relays = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`,
  ];

  for (const relayUrl of relays) {
    try {
      const res = await fetch(relayUrl);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('<rss') || text.includes('<?xml')) {
          return text;
        }
      }
    } catch {
      // Try next relay
    }
  }

  throw new Error(
    `Failed to fetch Goodreads RSS feed for shelf '${shelf}' (page ${page}) via all network gateways.`
  );
}

/**
 * Fetches and aggregates a complete public Goodreads library via public RSS feeds.
 *
 * Iterates through `currently-reading`, `read`, and `to-read` shelves,
 * paginating until complete with polite delays between requests.
 */
export async function fetchGoodreadsPublicLibrary(
  profileInput: string,
  onProgress?: (p: RssFetchProgress) => void
): Promise<{
  bundle: LibraryBundle;
  enrichment: EnrichmentCacheMap;
  userId: string;
  profileName: string | null;
}> {
  const userId = extractGoodreadsUserId(profileInput);
  if (!userId) {
    throw new Error(
      'Invalid Goodreads Profile URL or User ID. Please provide a numeric ID or URL like https://www.goodreads.com/user/show/137464693'
    );
  }

  const SHELVES: ExclusiveShelf[] = ['currently-reading', 'read', 'to-read'];
  const booksMap = new Map<string, Book>();
  const enrichmentMap: EnrichmentCacheMap = {};
  let detectedProfileName: string | null = null;
  let totalLoadedCount = 0;

  for (const shelf of SHELVES) {
    let page = 1;
    const maxPages = 30; // Safety guard against runaway loops

    while (page <= maxPages) {
      onProgress?.({
        shelf,
        page,
        loadedBooks: totalLoadedCount,
        statusText: `Loading '${shelf}' shelf (page ${page})… ${totalLoadedCount} books loaded — large libraries take ~15–25s, please wait…`,
      });

      const rssUrl = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${shelf}&page=${page}&per_page=200`;
      const xmlText = await fetchRssXml(rssUrl, userId, shelf, page);

      const { books: pageBooks, enrichment: pageEnrichment, profileName } = parseGoodreadsRssXml(
        xmlText,
        shelf
      );

      if (profileName && !detectedProfileName) {
        detectedProfileName = profileName;
      }

      for (const book of pageBooks) {
        if (!booksMap.has(book.id)) {
          booksMap.set(book.id, book);
          totalLoadedCount++;
        } else {
          // Merge details if book is present on multiple shelves
          const existing = booksMap.get(book.id)!;
          if (
            book.exclusiveShelf === 'currently-reading' &&
            existing.exclusiveShelf !== 'currently-reading'
          ) {
            existing.exclusiveShelf = 'currently-reading';
          }
          if (book.myRating !== null && existing.myRating === null) {
            existing.myRating = book.myRating;
          }
          if (book.myReview && !existing.myReview) {
            existing.myReview = book.myReview;
          }
        }
      }

      for (const [id, enr] of Object.entries(pageEnrichment)) {
        enrichmentMap[id] = {
          ...(enrichmentMap[id] || {}),
          ...enr,
        };
      }

      // If page returned fewer than 200 items, shelf pagination is complete
      if (pageBooks.length < 200) {
        break;
      }

      page++;

      // Polite pacing delay between pagination requests
      await new Promise((r) => setTimeout(r, 1100));
    }

    // Polite delay between shelves
    await new Promise((r) => setTimeout(r, 500));
  }

  const allBooks = Array.from(booksMap.values());
  if (allBooks.length === 0) {
    throw new Error(
      'This Goodreads profile appears to be Private or empty. Try uploading a .csv or .zip export instead.'
    );
  }

  const summaryStats = calculateSummaryStats(allBooks);

  const bundle: LibraryBundle = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    summaryStats,
    books: allBooks,
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

  return {
    bundle,
    enrichment: enrichmentMap,
    userId,
    profileName: detectedProfileName,
  };
}
