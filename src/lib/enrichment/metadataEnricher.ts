import type {
  Book,
  EnrichedBookMetadata,
  EnrichmentCacheMap,
  LanguageCode,
} from '../../types/library';
import { sanitizeIsbn } from '../formatters';

/**
 * Options for batch metadata enrichment.
 */
export interface BatchEnrichOptions {
  concurrency?: number;
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number, currentTitle: string) => void;
  onFlushBatch?: (batch: EnrichmentCacheMap) => Promise<void>;
}

/**
 * OpenLibrary noisy tags and catalog metadata to discard.
 */
const IGNORED_SUBJECTS = new Set([
  'accessible book',
  'protected daisy',
  'in library',
  'borrowable',
  'lending library',
  'internet archive',
  'large type books',
  'open library staff picks',
  'reading level',
  'open syllabus project',
  'classic literature',
]);

/**
 * Decodes standard HTML entities into text characters.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Strips HTML formatting, normalizes spacing, and decodes HTML entities.
 */
function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > 0 ? text : null;
}

/**
 * Cleans, filters noise, deduplicates, and caps subject categories to top 6.
 */
function cleanAndCapSubjects(subjects: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of subjects) {
    if (!raw || typeof raw !== 'string') continue;

    // Split category trees like "Fiction / Science Fiction / Space Opera" or "Fiction -- Science Fiction"
    const fragments = raw.includes('/') ? raw.split('/') : raw.split(/--/);

    for (let part of fragments) {
      part = part.trim().replace(/^["'([{]+|["')\]}]+$/g, '').trim();
      if (!part || part.length < 3 || /^\d+$/.test(part)) continue;

      const lower = part.toLowerCase();
      if (IGNORED_SUBJECTS.has(lower)) continue;
      if (seen.has(lower)) continue;

      seen.add(lower);

      // Title case format
      const formatted = part
        .split(' ')
        .map(w => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');

      result.push(formatted);
      if (result.length >= 6) {
        return result;
      }
    }
  }

  return result;
}

/**
 * Maps common 2-letter and 3-letter language codes to the project's LanguageCode union.
 */
function mapToLanguageCode(code: string | null | undefined): LanguageCode | null {
  if (!code) return null;
  const c = code.toLowerCase().trim();
  switch (c) {
    case 'en':
    case 'eng':
      return 'EN';
    case 'tr':
    case 'tur':
      return 'TR';
    case 'fr':
    case 'fra':
    case 'fre':
      return 'FR';
    case 'de':
    case 'deu':
    case 'ger':
      return 'DE';
    case 'ru':
    case 'rus':
      return 'RU';
    case 'ja':
    case 'jpn':
      return 'JA';
    case 'pl':
    case 'pol':
      return 'PL';
    case 'zh':
    case 'zho':
    case 'chi':
      return 'ZH';
    case 'it':
    case 'ita':
      return 'IT';
    case 'es':
    case 'spa':
      return 'ES';
    case 'pt':
    case 'por':
      return 'PT';
    case 'grc':
      return 'GRC';
    case 'ky':
    case 'kir':
      return 'KY';
    case 'is':
    case 'isl':
    case 'ice':
      return 'IS';
    case 'no':
    case 'nor':
      return 'NO';
    default:
      return null;
  }
}

interface GoogleVolumeInfo {
  description?: string;
  averageRating?: number;
  ratingsCount?: number;
  categories?: string[];
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
  };
  language?: string;
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  ratings_average?: number;
  ratings_count?: number;
  subject?: string[];
  language?: string[];
  cover_i?: number;
  first_sentence?: string | string[] | { value?: string };
}

/**
 * Enriches a single book using a waterfall approach:
 * 1. Google Books Volumes API (by ISBN, falling back to title + author)
 * 2. OpenLibrary Search API (if synopsis, rating, or subjects are missing)
 * Combines best fields, normalizes ratings, and never throws on network failure.
 */
export async function enrichSingleBook(
  book: Book,
  signal?: AbortSignal
): Promise<EnrichedBookMetadata> {
  const fetchedAt = new Date().toISOString();
  const cleanIsbn = sanitizeIsbn(book.isbn13 || book.isbn);
  const cleanTitle = (book.cleanTitle || book.title || '').trim();
  const author = (book.author || '').trim();

  try {
    // -----------------------------------------------------------------
    // 1. Google Books Volumes API
    // -----------------------------------------------------------------
    let googleInfo: GoogleVolumeInfo | null = null;

    // 1a. Try by ISBN first
    if (cleanIsbn) {
      try {
        const isbnUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(cleanIsbn)}`;
        const res = await fetch(isbnUrl, { signal });
        if (res.ok) {
          const data = await res.json();
          if (data && data.totalItems > 0 && Array.isArray(data.items) && data.items.length > 0) {
            const candidate = data.items.find((item: any) => item.volumeInfo?.description || item.volumeInfo?.averageRating != null) || data.items[0];
            if (candidate?.volumeInfo) {
              googleInfo = candidate.volumeInfo;
            }
          }
        }
      } catch {
        // Fallback to title + author search
      }
    }

    // 1b. Fallback to title + author if ISBN yielded 0 items or no synopsis/rating
    const needsGoogleTitleFallback =
      !googleInfo ||
      (!googleInfo.description && googleInfo.averageRating == null);

    if (needsGoogleTitleFallback && cleanTitle) {
      try {
        const query = author
          ? `intitle:${encodeURIComponent(cleanTitle)}+inauthor:${encodeURIComponent(author)}`
          : `intitle:${encodeURIComponent(cleanTitle)}`;
        const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`;
        const res = await fetch(searchUrl, { signal });
        if (res.ok) {
          const data = await res.json();
          if (data && data.totalItems > 0 && Array.isArray(data.items) && data.items.length > 0) {
            const candidate = data.items.find((item: any) => item.volumeInfo?.description || item.volumeInfo?.averageRating != null) || data.items[0];
            if (candidate?.volumeInfo) {
              // Prefer richer info over existing minimal volume
              if (!googleInfo || candidate.volumeInfo.description || candidate.volumeInfo.averageRating != null) {
                googleInfo = candidate.volumeInfo;
              }
            }
          }
        }
      } catch {
        // Continue to OpenLibrary
      }
    }

    // Extract Google fields
    const googleSynopsis = cleanDescription(googleInfo?.description);
    const googleRating = typeof googleInfo?.averageRating === 'number' ? googleInfo.averageRating : null;
    const googleRatingsCount = typeof googleInfo?.ratingsCount === 'number' ? googleInfo.ratingsCount : null;
    const googleSubjects = Array.isArray(googleInfo?.categories) ? googleInfo.categories : [];
    let googleCover: string | null = googleInfo?.imageLinks?.thumbnail || googleInfo?.imageLinks?.smallThumbnail || null;
    if (googleCover && googleCover.startsWith('http://')) {
      googleCover = 'https://' + googleCover.slice(7);
    }
    const googleLang = googleInfo?.language || null;

    // -----------------------------------------------------------------
    // 2. OpenLibrary Search API (when Google is missing communityRating, synopsis, or subjects)
    // -----------------------------------------------------------------
    let olDoc: OpenLibraryDoc | null = null;
    const needsOpenLibrary =
      !googleInfo ||
      googleRating == null ||
      !googleSynopsis ||
      googleSubjects.length === 0 ||
      !googleCover;

    if (needsOpenLibrary && (cleanIsbn || cleanTitle)) {
      // 2a. Try ISBN search on OpenLibrary
      if (cleanIsbn) {
        try {
          const olUrl = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(cleanIsbn)}&fields=key,title,author_name,ratings_average,ratings_count,subject,language,cover_i,first_sentence&limit=3`;
          const res = await fetch(olUrl, { signal });
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.docs) && data.docs.length > 0) {
              olDoc = data.docs[0];
            }
          }
        } catch {
          // Fall through to title + author search
        }
      }

      // 2b. Try title + author search on OpenLibrary if no doc found yet
      if (!olDoc && cleanTitle) {
        try {
          const authorParam = author ? `&author=${encodeURIComponent(author)}` : '';
          const olSearchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}${authorParam}&fields=key,title,author_name,ratings_average,ratings_count,subject,language,cover_i,first_sentence&limit=3`;
          const res = await fetch(olSearchUrl, { signal });
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.docs) && data.docs.length > 0) {
              olDoc = data.docs[0];
            }
          }
        } catch {
          // OpenLibrary unreachable
        }
      }
    }

    // Extract OpenLibrary fields
    let olSynopsis: string | null = null;
    if (olDoc?.first_sentence) {
      if (typeof olDoc.first_sentence === 'string') {
        olSynopsis = olDoc.first_sentence;
      } else if (Array.isArray(olDoc.first_sentence) && olDoc.first_sentence.length > 0) {
        const item = olDoc.first_sentence[0];
        olSynopsis = typeof item === 'string' ? item : (item as any)?.value || null;
      } else if (typeof (olDoc.first_sentence as any)?.value === 'string') {
        olSynopsis = (olDoc.first_sentence as any).value;
      }
      olSynopsis = cleanDescription(olSynopsis);
    }

    const olRating = typeof olDoc?.ratings_average === 'number' ? olDoc.ratings_average : null;
    const olRatingsCount = typeof olDoc?.ratings_count === 'number' ? olDoc.ratings_count : null;
    const olSubjects = Array.isArray(olDoc?.subject) ? olDoc.subject : [];
    const olCover = typeof olDoc?.cover_i === 'number' ? `https://covers.openlibrary.org/b/id/${olDoc.cover_i}-M.jpg` : null;
    const olLang = Array.isArray(olDoc?.language) && olDoc.language.length > 0 ? olDoc.language[0] : null;

    // -----------------------------------------------------------------
    // 3. Combine Best Fields
    // -----------------------------------------------------------------
    const googleContributed = Boolean(
      googleSynopsis ||
      googleRating != null ||
      googleCover ||
      googleSubjects.length > 0
    );

    const olContributed = Boolean(
      olSynopsis ||
      olRating != null ||
      olCover ||
      olSubjects.length > 0
    );

    let source: 'hybrid' | 'googlebooks' | 'openlibrary' | 'none' = 'none';
    if (googleContributed && olContributed) {
      source = 'hybrid';
    } else if (googleContributed) {
      source = 'googlebooks';
    } else if (olContributed) {
      source = 'openlibrary';
    }

    // Preferred synopsis: Google description is usually a complete synopsis, OL first_sentence is a fallback
    const synopsis = googleSynopsis || olSynopsis || null;

    // Normalized communityRating: clamped between 1.00 and 5.00, rounded to 2 decimals
    let communityRating: number | null = null;
    let ratingsCount: number | null = null;

    if (googleRating != null && !Number.isNaN(googleRating) && googleRating > 0) {
      const clamped = Math.max(1, Math.min(5, googleRating));
      communityRating = Math.round(clamped * 100) / 100;
      ratingsCount = googleRatingsCount ?? olRatingsCount ?? null;
    } else if (olRating != null && !Number.isNaN(olRating) && olRating > 0) {
      const clamped = Math.max(1, Math.min(5, olRating));
      communityRating = Math.round(clamped * 100) / 100;
      ratingsCount = olRatingsCount ?? null;
    }

    // Combined subjects capped to top 6 clean strings
    const rawSubjects = [...googleSubjects, ...olSubjects];
    const subjects = cleanAndCapSubjects(rawSubjects);

    // Cover: prefer Google thumbnail, fallback to OpenLibrary medium cover
    const coverUrl = googleCover || olCover || null;

    // Detected language
    const detectedOriginalLanguage = mapToLanguageCode(googleLang) || mapToLanguageCode(olLang) || null;

    return {
      bookId: book.id,
      fetchedAt,
      source,
      synopsis,
      communityRating,
      ratingsCount,
      subjects,
      coverUrl,
      detectedOriginalLanguage,
    };
  } catch {
    // Return clean failure metadata on any unhandled error
    return {
      bookId: book.id,
      fetchedAt,
      source: 'none',
      synopsis: null,
      communityRating: null,
      ratingsCount: null,
      subjects: [],
      coverUrl: null,
    };
  }
}

/**
 * Enriches a batch of books with polite concurrency (default 2 workers with 180ms spacing),
 * skipping already-enriched books unless `force` is set, and continuously flushing
 * batches of 8 books via `options.onFlushBatch`.
 */
export async function enrichBooksBatch(
  books: Book[],
  existingCache: EnrichmentCacheMap,
  options?: BatchEnrichOptions
): Promise<EnrichmentCacheMap> {
  const force = Boolean(options?.force);
  const concurrency = Math.max(1, options?.concurrency ?? 2);
  const signal = options?.signal;

  // Filter books to enrich: not in cache, or cache.source === 'none' when force is true
  const toEnrich = books.filter(b => {
    if (!b || !b.id) return false;
    const cached = existingCache[b.id];
    if (!cached) return true;
    if (force && cached.source === 'none') return true;
    return false;
  });

  const resultMap: EnrichmentCacheMap = { ...existingCache };
  if (toEnrich.length === 0) {
    return resultMap;
  }

  let nextIndex = 0;
  let completed = 0;
  const total = toEnrich.length;
  let pendingFlush: EnrichmentCacheMap = {};

  const flushCurrentPending = async () => {
    const keys = Object.keys(pendingFlush);
    if (keys.length === 0) return;
    const batchToFlush = { ...pendingFlush };
    pendingFlush = {};
    if (options?.onFlushBatch) {
      try {
        await options.onFlushBatch(batchToFlush);
      } catch (err) {
        console.warn('[metadataEnricher] Failed to flush enrichment batch:', err);
      }
    }
  };

  const worker = async (workerId: number) => {
    // Stagger worker start to avoid simultaneous initial requests
    if (workerId > 0) {
      await new Promise(resolve => setTimeout(resolve, workerId * 90));
    }

    while (nextIndex < toEnrich.length) {
      if (signal?.aborted) break;

      const index = nextIndex++;
      const book = toEnrich[index];
      if (!book) break;

      const enriched = await enrichSingleBook(book, signal);
      resultMap[book.id] = enriched;
      pendingFlush[book.id] = enriched;
      completed++;

      if (options?.onProgress) {
        try {
          options.onProgress(completed, total, book.cleanTitle || book.title);
        } catch {
          // Ignore callback errors
        }
      }

      // Flush incremental batches of 8 books
      if (Object.keys(pendingFlush).length >= 8) {
        await flushCurrentPending();
      }

      // Polite delay between subsequent requests
      if (!signal?.aborted) {
        await new Promise(resolve => setTimeout(resolve, 180));
      }
    }
  };

  const workerCount = Math.min(concurrency, toEnrich.length);
  const workers = Array.from({ length: workerCount }, (_, i) => worker(i));

  await Promise.all(workers);

  // Final flush for remaining items
  await flushCurrentPending();

  return resultMap;
}
