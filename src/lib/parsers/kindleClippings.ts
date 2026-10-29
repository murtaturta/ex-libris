import type { Book, KindleClipping } from '../../types/library';
import { extractSeriesFromTitle } from '../formatters';

// Helper to normalize strings for comparison (lowercase, strip non-alphanumeric, trim)
function normalizeFuzzy(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts raw title, clean title, and author from Kindle clipping Line 1.
 * Kindle format is typically: "Title (Author)" or "Title (Series, #X) (Author)"
 */
function parseTitleAndAuthorLine(line: string): {
  rawTitle: string;
  cleanTitle: string;
  author: string | null;
} {
  const trimmed = line.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return { rawTitle: '', cleanTitle: '', author: null };
  }

  // Check for trailing (Author) parenthetical
  const trailingParenRegex = /\s*\(([^()]+)\)\s*$/;
  const match = trimmed.match(trailingParenRegex);

  if (match) {
    const candidateAuthor = match[1].trim();
    const titlePart = trimmed.slice(0, match.index).trim();

    // Ensure candidateAuthor isn't a series indicator like "Series, #1"
    if (!candidateAuthor.includes('#') && titlePart.length > 0) {
      const seriesInfo = extractSeriesFromTitle(titlePart);
      return {
        rawTitle: titlePart,
        cleanTitle: seriesInfo.cleanTitle || titlePart,
        author: candidateAuthor,
      };
    }
  }

  const seriesInfo = extractSeriesFromTitle(trimmed);
  return {
    rawTitle: trimmed,
    cleanTitle: seriesInfo.cleanTitle || trimmed,
    author: null,
  };
}

/**
 * Parses Kindle Line 2 metadata across English, Turkish, and French locales.
 */
function parseMetadataLine(line: string): {
  type: 'highlight' | 'note' | 'bookmark';
  page: number | null;
  locationStart: number | null;
  locationEnd: number | null;
  addedAt: string | null;
} {
  const lower = line.toLowerCase();

  // 1. Clipping type
  let type: 'highlight' | 'note' | 'bookmark' = 'highlight';
  if (
    lower.includes('bookmark') ||
    lower.includes('yer işareti') ||
    lower.includes('yer isareti') ||
    lower.includes('signet')
  ) {
    type = 'bookmark';
  } else if (
    lower.includes('note') ||
    lower.includes('not ') ||
    lower.includes('bir not') ||
    lower.endsWith('not')
  ) {
    type = 'note';
  } else {
    type = 'highlight';
  }

  // 2. Page number
  let page: number | null = null;
  const pageMatch =
    line.match(/page\s*(\d+)/i) ||
    line.match(/sayfa\s*(\d+)/i) ||
    line.match(/la page\s*(\d+)/i);
  if (pageMatch) {
    const parsedPage = parseInt(pageMatch[1], 10);
    if (!Number.isNaN(parsedPage)) {
      page = parsedPage;
    }
  }

  // 3. Location range
  let locationStart: number | null = null;
  let locationEnd: number | null = null;
  const locMatch =
    line.match(/location\s*(\d+)(?:-(\d+))?/i) ||
    line.match(/konum\s*(\d+)(?:-(\d+))?/i) ||
    line.match(/emplacement\s*(\d+)(?:-(\d+))?/i) ||
    line.match(/point d'insertion\s*(\d+)(?:-(\d+))?/i);

  if (locMatch) {
    const start = parseInt(locMatch[1], 10);
    if (!Number.isNaN(start)) {
      locationStart = start;
      if (locMatch[2]) {
        const end = parseInt(locMatch[2], 10);
        locationEnd = Number.isNaN(end) ? start : end;
      } else {
        locationEnd = start;
      }
    }
  }

  // 4. Added date
  let addedAt: string | null = null;
  const dateMatch =
    line.match(/added on\s*(.+)$/i) ||
    line.match(/eklendiği tarih:\s*(.+)$/i) ||
    line.match(/eklendiği tarih\s*:\s*(.+)$/i) ||
    line.match(/eklendi:\s*(.+)$/i) ||
    line.match(/ajouté le\s*(.+)$/i);

  if (dateMatch) {
    const rawDate = dateMatch[1].trim();
    const parsedTimestamp = Date.parse(rawDate);
    if (!Number.isNaN(parsedTimestamp)) {
      addedAt = new Date(parsedTimestamp).toISOString();
    } else {
      addedAt = rawDate;
    }
  }

  return { type, page, locationStart, locationEnd, addedAt };
}

/**
 * Matches a clipping to a book in the library bundle by title & author.
 */
function findMatchingBook(
  cleanTitle: string,
  rawTitle: string,
  author: string | null,
  books: Book[]
): Book | null {
  const normTitle = normalizeFuzzy(cleanTitle);
  const normRaw = normalizeFuzzy(rawTitle);
  const normAuthor = author ? normalizeFuzzy(author) : '';

  // 1. Exact match on cleanTitle and author
  if (normAuthor) {
    const exactAuthorMatch = books.find(b => {
      const bTitle = normalizeFuzzy(b.cleanTitle);
      const bAuthor = normalizeFuzzy(b.author);
      return (
        (bTitle === normTitle || bTitle === normRaw) &&
        (bAuthor.includes(normAuthor) || normAuthor.includes(bAuthor))
      );
    });
    if (exactAuthorMatch) return exactAuthorMatch;
  }

  // 2. Substring match on title with matching author
  if (normAuthor) {
    const subMatch = books.find(b => {
      const bTitle = normalizeFuzzy(b.cleanTitle);
      const bAuthor = normalizeFuzzy(b.author);
      const titleOverlap =
        bTitle.includes(normTitle) ||
        normTitle.includes(bTitle) ||
        bTitle.includes(normRaw) ||
        normRaw.includes(bTitle);
      const authorOverlap =
        bAuthor.includes(normAuthor) || normAuthor.includes(bAuthor);
      return titleOverlap && authorOverlap;
    });
    if (subMatch) return subMatch;
  }

  // 3. Fallback: match by title alone if no author conflict
  const titleOnlyMatch = books.find(b => {
    const bTitle = normalizeFuzzy(b.cleanTitle);
    return bTitle === normTitle || bTitle === normRaw;
  });

  return titleOnlyMatch || null;
}

/**
 * Checks whether two highlights on the same book overlap in location.
 */
function highlightsOverlap(a: KindleClipping, b: KindleClipping): boolean {
  if (
    a.locationStart !== null &&
    a.locationEnd !== null &&
    b.locationStart !== null &&
    b.locationEnd !== null
  ) {
    const startA = a.locationStart;
    const endA = a.locationEnd;
    const startB = b.locationStart;
    const endB = b.locationEnd;

    // Overlap with a small 5-unit grace tolerance
    return Math.max(startA, startB) <= Math.min(endA, endB) + 5;
  }

  if (a.page !== null && b.page !== null) {
    return a.page === b.page;
  }

  return false;
}

/**
 * Parses Kindle `My Clippings.txt` exports into structured, deduplicated,
 * and note-paired KindleClipping objects.
 */
export function parseKindleClippings(
  rawText: string,
  books: Book[] = []
): KindleClipping[] {
  if (!rawText) return [];

  // Split by the Kindle clipping delimiter
  const rawBlocks = rawText
    .replace(/^\uFEFF/, '')
    .split(/={8,}/g)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  const initialClippings: KindleClipping[] = [];

  for (let idx = 0; idx < rawBlocks.length; idx++) {
    const block = rawBlocks[idx].replace(/^\uFEFF/, '').trim();
    const lines = block
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length < 2) continue;

    const line1 = lines[0];
    const line2 = lines[1];
    const contentLines = lines.slice(2);
    const content = contentLines.join('\n').trim();

    const { rawTitle, cleanTitle, author } = parseTitleAndAuthorLine(line1);
    const metadata = parseMetadataLine(line2);

    const matchedBook = findMatchingBook(cleanTitle, rawTitle, author, books);

    const clippingId = `clip_${idx + 1}_${(metadata.locationStart ?? metadata.page ?? idx).toString()}`;

    initialClippings.push({
      id: clippingId,
      rawTitle,
      cleanTitle,
      author,
      matchedBookId: matchedBook ? matchedBook.id : null,
      type: metadata.type,
      page: metadata.page,
      locationStart: metadata.locationStart,
      locationEnd: metadata.locationEnd,
      addedAt: metadata.addedAt,
      content,
      attachedNote: null,
    });
  }

  // ========================================================
  // 1. Deduplicate overlapping resized highlights
  // ========================================================
  const deduped: KindleClipping[] = [];
  const supersededIds = new Set<string>();

  const highlights = initialClippings.filter(c => c.type === 'highlight');

  for (let i = 0; i < highlights.length; i++) {
    for (let j = i + 1; j < highlights.length; j++) {
      const h1 = highlights[i];
      const h2 = highlights[j];

      // Must be same book
      const sameBook =
        (h1.matchedBookId && h1.matchedBookId === h2.matchedBookId) ||
        normalizeFuzzy(h1.cleanTitle) === normalizeFuzzy(h2.cleanTitle);

      if (!sameBook) continue;

      if (highlightsOverlap(h1, h2)) {
        const text1 = h1.content.trim().toLowerCase();
        const text2 = h2.content.trim().toLowerCase();

        if (text1.length > 0 && text2.length > 0) {
          if (text2.includes(text1) || text2.startsWith(text1)) {
            // h1 is shorter and subset of h2 -> h1 is superseded
            supersededIds.add(h1.id);
          } else if (text1.includes(text2) || text1.startsWith(text2)) {
            // h2 is shorter and subset of h1 -> h2 is superseded
            supersededIds.add(h2.id);
          }
        }
      }
    }
  }

  for (const c of initialClippings) {
    if (!supersededIds.has(c.id)) {
      deduped.push({ ...c });
    }
  }

  // ========================================================
  // 2. Pair Kindle Notes with nearby Highlights (±8 locations or same page)
  // ========================================================
  const pairedNoteIds = new Set<string>();
  const activeHighlights = deduped.filter(c => c.type === 'highlight');

  for (const item of deduped) {
    if (item.type !== 'note' || !item.content) continue;

    // Find the best matching highlight on the same book within ±8 units
    let bestHighlight: KindleClipping | null = null;
    let minDistance = Infinity;

    for (const h of activeHighlights) {
      const sameBook =
        (item.matchedBookId && item.matchedBookId === h.matchedBookId) ||
        normalizeFuzzy(item.cleanTitle) === normalizeFuzzy(h.cleanTitle);

      if (!sameBook) continue;

      // Check location distance
      if (
        item.locationStart !== null &&
        h.locationStart !== null &&
        h.locationEnd !== null
      ) {
        let dist = 0;
        if (item.locationStart < h.locationStart) {
          dist = h.locationStart - item.locationStart;
        } else if (item.locationStart > h.locationEnd) {
          dist = item.locationStart - h.locationEnd;
        }

        if (dist <= 8 && dist < minDistance) {
          minDistance = dist;
          bestHighlight = h;
        }
      } else if (item.page !== null && h.page !== null && item.page === h.page) {
        if (minDistance > 0) {
          minDistance = 0;
          bestHighlight = h;
        }
      }
    }

    if (bestHighlight) {
      bestHighlight.attachedNote = bestHighlight.attachedNote
        ? `${bestHighlight.attachedNote}\n${item.content}`
        : item.content;
      pairedNoteIds.add(item.id);
    }
  }

  // Return list with duplicate notes omitted
  return deduped.filter(c => !pairedNoteIds.has(c.id));
}

/**
 * 5-entry Kindle clippings sample featuring No Longer Human, Dune, and Anayurt Oteli.
 * Includes a resized highlight pair and a nearby note attachment.
 */
export const SAMPLE_KINDLE_CLIPPINGS_TXT = `No Longer Human (Osamu Dazai)
- Your Highlight on page 14 | Location 180-185 | Added on Friday, April 28, 2023 10:15:30 PM

Mine has been a life of much shame.
==========
No Longer Human (Osamu Dazai)
- Your Highlight on page 14 | Location 180-192 | Added on Friday, April 28, 2023 10:16:45 PM

Mine has been a life of much shame. I can't even guess myself what it must be to live the life of a human being.
==========
No Longer Human (Osamu Dazai)
- Your Note on page 14 | Location 190 | Added on Friday, April 28, 2023 10:18:00 PM

Central existential thesis of Oba Yozo.
==========
Dune (Dune, #1) (Frank Herbert)
- Your Highlight on page 10 | Location 210-215 | Added on Saturday, May 6, 2023 2:40:12 PM

I must not fear. Fear is the mind-killer. Fear is the little-death that brings total obliteration.
==========
Anayurt Oteli (Yusuf Atılgan)
- Sayfa 32 | Konum 410-415'de bir Vurgu | Eklendiği Tarih: 15 Haziran 2023 Perşembe 18:22:45

Kendi içine çekilmişti; kimseyle konuşmak, kimseyi görmek istemiyordu.
==========`;
