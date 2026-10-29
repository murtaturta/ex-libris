import type { Book } from '../types/library';

/**
 * Formats a publication year with proper BCE notation and missing value indicators.
 * - null/undefined/0/NaN -> '—'
 * - Negative years -> '400 BCE' (for -400)
 * - Positive years -> '2021'
 */
export function formatPublicationYear(year: number | null | undefined): string {
  if (year === null || year === undefined || Number.isNaN(year) || year === 0) {
    return '—';
  }
  if (year < 0) {
    return `${Math.abs(year)} BCE`;
  }
  return `${year}`;
}

/**
 * Sanitizes Excel-formula-wrapped ISBNs (e.g. `="0140283293"` or `="9780140283297"`).
 * Strips `="`, trailing quotes, and surrounding whitespace.
 * Returns null for empty strings or `=""`.
 */
export function sanitizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  if (!cleaned) return null;

  // Strip Excel wrapper: ="..." or =...
  if (cleaned.startsWith('="') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(2, -1).trim();
  } else if (cleaned.startsWith('=')) {
    cleaned = cleaned.slice(1).trim();
  }

  // Strip leading/trailing double quotes
  cleaned = cleaned.replace(/^"+|"+$/g, '').trim();

  if (!cleaned) return null;

  // Normalize by stripping internal hyphens and spaces
  const normalized = cleaned.replace(/[-\s]/g, '');

  // ISBN-10 (9 digits + digit/X) or ISBN-13 (13 digits)
  if (/^[0-9]{9}[0-9Xx]$/.test(normalized) || /^[0-9]{13}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Extracts series information from Goodreads title parentheticals.
 * Handles patterns such as:
 * - "Dune (Dune, #1)" -> cleanTitle: "Dune", seriesName: "Dune", seriesNumber: "1"
 * - "The Last Wish (The Witcher, #0.5)" -> cleanTitle: "The Last Wish", seriesName: "The Witcher", seriesNumber: "0.5"
 * - "Diary of an AssCan (The Martian #0.5)" -> cleanTitle: "Diary of an AssCan", seriesName: "The Martian", seriesNumber: "0.5"
 * Avoids false positives on plain subtitles without '#' like "Cyclonopedia: Complicity with Anonymous Materials (Anomaly)".
 */
export function extractSeriesFromTitle(rawTitle: string): {
  cleanTitle: string;
  seriesName: string | null;
  seriesNumber: string | null;
} {
  if (!rawTitle) {
    return { cleanTitle: '', seriesName: null, seriesNumber: null };
  }

  const trimmed = rawTitle.trim();

  // Match a trailing parenthetical containing a '#' symbol
  const seriesRegex = /\s*\(([^()]*?#\s*[^()]*?)\)\s*$/;
  const match = trimmed.match(seriesRegex);

  if (!match) {
    return {
      cleanTitle: trimmed,
      seriesName: null,
      seriesNumber: null,
    };
  }

  const inside = match[1].trim();
  const hashIndex = inside.indexOf('#');
  if (hashIndex === -1) {
    return {
      cleanTitle: trimmed,
      seriesName: null,
      seriesNumber: null,
    };
  }

  // Text preceding the '#' is the series name (strip trailing comma/whitespace)
  const seriesNamePart = inside.slice(0, hashIndex).replace(/[,\s]+$/, '').trim();
  // Text succeeding the '#' is the series position/number
  const seriesNumPart = inside.slice(hashIndex + 1).replace(/[,\s]+$/, '').trim();

  const cleanTitle = trimmed.slice(0, match.index).trim() || trimmed;

  return {
    cleanTitle,
    seriesName: seriesNamePart.length > 0 ? seriesNamePart : null,
    seriesNumber: seriesNumPart.length > 0 ? seriesNumPart : null,
  };
}

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
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * Formats a Goodreads HTML review:
 * - Replaces `[b:Title|Id|...]` and `[a:Author|Id]` tags with just `Title` or `Author`
 * - Splits `<br/>`, `<br>`, or double newlines into clean paragraph strings
 * - Decodes basic HTML entities (&quot;, &amp;, etc.)
 */
export function formatReviewHtml(rawReview: string | null | undefined): string[] {
  if (!rawReview) return [];
  const trimmed = rawReview.trim();
  if (!trimmed) return [];

  // Replace Goodreads [b:Title|Id|...] tags with Title
  const processed = trimmed.replace(/\[(?:b|book|a|author):([^|\]]+)(?:\|[^\]]*)?\]/g, '$1');

  // Split by consecutive <br> tags or double newlines
  const paragraphs = processed
    .split(/(?:<br\s*\/?>\s*)+|\r?\n\s*\r?\n/gi)
    .map(p => decodeHtmlEntities(p.trim()))
    .filter(p => p.length > 0);

  return paragraphs;
}

/**
 * Calculates physical spine geometry and semantic styling for bookshelf views:
 * - Width: proportional to page count: Math.max(24, Math.min(72, Math.round((pageCount ?? 240) * 0.058)))
 * - Height: subtle deterministic variation in range 196..226 px
 * - Accent: semantic color classes by reading shelf status and star rating
 */
export function getSpineStyle(book: Book): {
  widthPx: number;
  heightPx: number;
  accentClass: string;
} {
  // Proportional spine width based on page count
  const widthPx = Math.max(24, Math.min(72, Math.round((book.pageCount ?? 240) * 0.058)));

  // Subtle deterministic height variation (196..226 px)
  const key = book.id || book.cleanTitle || book.title || '';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  const heightPx = 196 + (hash % 31);

  // Semantic color class by shelf and personal rating
  let accentClass = 'spine-read bg-zinc-800 text-zinc-200 border-zinc-700';

  if (book.exclusiveShelf === 'currently-reading') {
    accentClass = 'spine-reading bg-amber-800 text-amber-100 border-amber-600';
  } else if (book.exclusiveShelf === 'did-not-finish' || book.exclusiveShelf === 'dnf') {
    accentClass = 'spine-dnf bg-zinc-800 text-zinc-400 border-zinc-700';
  } else if (book.exclusiveShelf === 'to-read') {
    accentClass = 'spine-to-read bg-stone-800 text-stone-300 border-stone-700';
  } else {
    // Read shelf / rated
    if (book.myRating === 5) {
      accentClass = 'spine-star-5 bg-amber-700 text-amber-100 border-amber-500';
    } else if (book.myRating === 4) {
      accentClass = 'spine-star-4 bg-emerald-800 text-emerald-100 border-emerald-600';
    } else if (book.myRating === 3) {
      accentClass = 'spine-star-3 bg-blue-900 text-blue-100 border-blue-700';
    } else if (book.myRating === 2) {
      accentClass = 'spine-star-2 bg-stone-700 text-stone-200 border-stone-600';
    } else if (book.myRating === 1) {
      accentClass = 'spine-star-1 bg-red-950 text-red-200 border-red-800';
    }
  }

  return { widthPx, heightPx, accentClass };
}
