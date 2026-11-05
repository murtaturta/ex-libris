import type { Book, KindleClipping } from '../../types/library';
import { extractSeriesFromTitle } from '../formatters';

/**
 * Normalizes strings for fuzzy title and author matching.
 */
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
 * Decodes standard HTML entities without requiring a DOM environment.
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
 * Strips HTML tags, trims whitespace, and decodes HTML entities.
 */
function stripHtml(raw: string): string {
  return decodeHtmlEntities(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

/**
 * Checks whether an uploaded file or content string represents a Kindle Notebook HTML export.
 */
export function isKindleNotebookHtml(content: string, fileName?: string): boolean {
  if (fileName && !/\.(html?)$/i.test(fileName)) {
    return false;
  }
  if (!content) return false;

  const signatures = [
    'class="bookTitle"',
    "class='bookTitle'",
    'class="noteHeading"',
    'class="noteText"',
    'class="sectionHeading"',
    'class="notebookFor"',
    'id="kp-notebook-annotations"',
    'id="kp-notebook-title"',
    'id="annotationHighlightHeader"',
    'kp-notebook-highlight',
    'highlight_yellow',
    'highlight_blue',
    'highlight_pink',
    'highlight_orange',
  ];

  return signatures.some((sig) => content.includes(sig));
}

/**
 * Matches a Kindle book title and author to an existing volume in the Ex Libris library.
 */
function matchBookToLibrary(
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
    const exactMatch = books.find((b) => {
      const bTitle = normalizeFuzzy(b.cleanTitle);
      const bAuthor = normalizeFuzzy(b.author);
      return (
        (bTitle === normTitle || bTitle === normRaw) &&
        (bAuthor.includes(normAuthor) || normAuthor.includes(bAuthor))
      );
    });
    if (exactMatch) return exactMatch;
  }

  // 2. Substring match on title with matching author
  if (normAuthor) {
    const subMatch = books.find((b) => {
      const bTitle = normalizeFuzzy(b.cleanTitle);
      const bAuthor = normalizeFuzzy(b.author);
      const titleOverlap =
        bTitle.includes(normTitle) ||
        normTitle.includes(bTitle) ||
        bTitle.includes(normRaw) ||
        normRaw.includes(bTitle);
      const authorOverlap = bAuthor.includes(normAuthor) || normAuthor.includes(bAuthor);
      return titleOverlap && authorOverlap;
    });
    if (subMatch) return subMatch;
  }

  // 3. Fallback: match by cleanTitle alone
  const titleOnlyMatch = books.find((b) => {
    const bTitle = normalizeFuzzy(b.cleanTitle);
    return bTitle === normTitle || bTitle === normRaw;
  });

  return titleOnlyMatch || null;
}

/**
 * Generates a deterministic hash string for clipping IDs.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

interface RawExtractedItem {
  type: 'highlight' | 'note' | 'bookmark';
  chapter: string | null;
  highlightColor: string | null;
  page: number | null;
  locationStart: number | null;
  locationEnd: number | null;
  content: string;
}

/**
 * Parses Kindle Notebook HTML exports (from Kindle iOS, Android, Desktop, or read.amazon.com/notebook).
 *
 * Guaranteed zero DOM / browser dependency — runs seamlessly in both Node and Browser.
 */
export function parseKindleNotebookHtml(
  htmlContent: string,
  libraryBooks: Book[] = []
): {
  clippings: KindleClipping[];
  matchedBooksCount: number;
  unmatchedTitles: string[];
  chaptersFound: number;
  colorCounts: Record<string, number>;
} {
  const result: KindleClipping[] = [];
  const colorCounts: Record<string, number> = {};
  const unmatchedTitlesSet = new Set<string>();
  let chaptersFound = 0;

  if (!htmlContent) {
    return {
      clippings: [],
      matchedBooksCount: 0,
      unmatchedTitles: [],
      chaptersFound: 0,
      colorCounts: {},
    };
  }

  // 1. Extract Book Title & Author
  let rawTitle = '';
  let author: string | null = null;

  // Pattern A: Standard Kindle App HTML (<div class="bookTitle">...</div>, <div class="authors">...</div>)
  const bookTitleMatch =
    htmlContent.match(/<[^>]*class=["'][^"']*bookTitle[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ||
    htmlContent.match(/<h[1-4][^>]*id=["']kp-notebook-title["'][^>]*>([\s\S]*?)<\/h[1-4]>/i) ||
    htmlContent.match(/<title>([\s\S]*?)<\/title>/i);

  if (bookTitleMatch) {
    rawTitle = stripHtml(bookTitleMatch[1]);
  }

  const authorsMatch =
    htmlContent.match(/<[^>]*class=["'][^"']*authors[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ||
    htmlContent.match(/<[^>]*id=["']kp-notebook-author["'][^>]*>([\s\S]*?)<\/[^>]+>/i);

  if (authorsMatch) {
    author = stripHtml(authorsMatch[1]);
  }

  const { cleanTitle } = extractSeriesFromTitle(rawTitle);
  const effectiveCleanTitle = cleanTitle || rawTitle || 'Untitled Notebook';

  // Match against user's library
  const matchedBook = matchBookToLibrary(effectiveCleanTitle, rawTitle, author, libraryBooks);
  if (!matchedBook && effectiveCleanTitle) {
    unmatchedTitlesSet.add(effectiveCleanTitle);
  }

  // 2. Scan through document sequentially for Chapters, Highlights, and Notes
  // We match chapter headers and note blocks using a unified sequential regex scanner
  const itemTagRegex =
    /<(?:div|h[1-6]|span)[^>]*(?:class=["']([^"']+)["']|id=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/(?:div|h[1-6]|span)>/gi;

  let currentChapter: string | null = null;
  const rawItems: RawExtractedItem[] = [];

  // Match all noteHeading + noteText pairs or Web Notebook entries
  // Pattern 1: Standard Kindle App: noteHeading followed by noteText
  const standardPairRegex =
    /<div[^>]*class=["'][^"']*noteHeading[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*noteText[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;

  // Pattern 2: Web reader entries: annotationHighlightHeader / annotationNoteHeader
  const webPairRegex =
    /<span[^>]*id=["']annotation(?:Highlight|Note)Header["'][^>]*>([\s\S]*?)<\/span>\s*<span[^>]*id=["'](?:highlight|note)["'][^>]*>([\s\S]*?)<\/span>/gi;

  // First pass: collect chapter milestones by position
  const chapterMilestones: { index: number; chapterName: string }[] = [];
  const chapterHeaderRegex =
    /<(?:h[1-6]|div)[^>]*class=["'][^"']*(?:sectionHeading|kp-notebook-section-heading)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h[1-6]|div)>/gi;

  let chMatch: RegExpExecArray | null;
  while ((chMatch = chapterHeaderRegex.exec(htmlContent)) !== null) {
    const chName = stripHtml(chMatch[1]);
    if (chName) {
      chaptersFound++;
      chapterMilestones.push({ index: chMatch.index, chapterName: chName });
    }
  }

  function getChapterForIndex(idx: number): string | null {
    let activeChapter: string | null = null;
    for (const m of chapterMilestones) {
      if (m.index <= idx) {
        activeChapter = m.chapterName;
      } else {
        break;
      }
    }
    return activeChapter;
  }

  // Process standard Kindle App export format
  let pairMatch: RegExpExecArray | null;
  while ((pairMatch = standardPairRegex.exec(htmlContent)) !== null) {
    const headingHtml = pairMatch[1];
    const textHtml = pairMatch[2];
    const content = stripHtml(textHtml);
    if (!content) continue;

    const headingText = stripHtml(headingHtml);
    const headingLower = headingText.toLowerCase();

    // Type detection
    let type: 'highlight' | 'note' | 'bookmark' = 'highlight';
    if (headingLower.includes('note') || headingLower.includes('not ')) {
      type = 'note';
    } else if (headingLower.includes('bookmark') || headingLower.includes('signet')) {
      type = 'bookmark';
    }

    // Color detection: from class="highlight_yellow" or text "(yellow)"
    let color: string | null = null;
    const colorClassMatch = headingHtml.match(/highlight_(yellow|pink|blue|orange)/i);
    if (colorClassMatch) {
      color = colorClassMatch[1].toLowerCase();
    } else {
      const colorTextMatch = headingLower.match(/\b(yellow|pink|blue|orange)\b/);
      if (colorTextMatch) {
        color = colorTextMatch[1];
      }
    }

    if (color && type === 'highlight') {
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    }

    // Location & Page detection
    let page: number | null = null;
    const pageMatch = headingText.match(/page\s*(\d+)/i) || headingText.match(/sayfa\s*(\d+)/i);
    if (pageMatch) {
      const p = parseInt(pageMatch[1], 10);
      if (!Number.isNaN(p)) page = p;
    }

    let locationStart: number | null = null;
    let locationEnd: number | null = null;
    const locMatch = headingText.match(/location\s*(\d+)(?:[–-](\d+))?/i);
    if (locMatch) {
      const start = parseInt(locMatch[1], 10);
      if (!Number.isNaN(start)) {
        locationStart = start;
        locationEnd = locMatch[2] ? parseInt(locMatch[2], 10) : start;
      }
    }

    const chapter = getChapterForIndex(pairMatch.index);

    rawItems.push({
      type,
      chapter,
      highlightColor: color,
      page,
      locationStart,
      locationEnd,
      content,
    });
  }

  // If standard didn't match, attempt Web reader format
  if (rawItems.length === 0) {
    while ((pairMatch = webPairRegex.exec(htmlContent)) !== null) {
      const headingHtml = pairMatch[1];
      const textHtml = pairMatch[2];
      const content = stripHtml(textHtml);
      if (!content) continue;

      const headingText = stripHtml(headingHtml);
      const headingLower = headingText.toLowerCase();

      let type: 'highlight' | 'note' = 'highlight';
      if (headingLower.includes('note')) {
        type = 'note';
      }

      let color: string | null = null;
      const colorMatch = headingLower.match(/\b(yellow|pink|blue|orange)\b/);
      if (colorMatch) {
        color = colorMatch[1];
        if (type === 'highlight') {
          colorCounts[color] = (colorCounts[color] || 0) + 1;
        }
      }

      let locationStart: number | null = null;
      let locationEnd: number | null = null;
      const locMatch = headingText.match(/location:?\s*(\d+)(?:[–-](\d+))?/i);
      if (locMatch) {
        const start = parseInt(locMatch[1], 10);
        if (!Number.isNaN(start)) {
          locationStart = start;
          locationEnd = locMatch[2] ? parseInt(locMatch[2], 10) : start;
        }
      }

      const chapter = getChapterForIndex(pairMatch.index);

      rawItems.push({
        type,
        chapter,
        highlightColor: color,
        page: null,
        locationStart,
        locationEnd,
        content,
      });
    }
  }

  // 3. Highlight & Attached Note Stitching (Pairing immediately adjacent notes)
  let lastHighlight: KindleClipping | null = null;

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];

    if (item.type === 'note' && lastHighlight) {
      // Check if note is immediately following the highlight at matching/adjacent location
      const sameChapter = !item.chapter || !lastHighlight.chapter || item.chapter === lastHighlight.chapter;
      const sameLocation =
        item.locationStart === null ||
        lastHighlight.locationStart === null ||
        Math.abs((item.locationStart || 0) - (lastHighlight.locationStart || 0)) <= 2;

      if (sameChapter && sameLocation && !lastHighlight.attachedNote) {
        lastHighlight.attachedNote = item.content;
        continue;
      }
    }

    // Otherwise, create a new clipping entry
    const idKey = `${effectiveCleanTitle}-${item.chapter || ''}-${item.locationStart || item.page || i}-${item.content.slice(0, 32)}`;
    const clipId = `kh-${hashString(idKey)}`;

    const clipping: KindleClipping = {
      id: clipId,
      rawTitle: rawTitle || effectiveCleanTitle,
      cleanTitle: effectiveCleanTitle,
      author: author || matchedBook?.author || null,
      matchedBookId: matchedBook ? matchedBook.id : null,
      type: item.type,
      page: item.page,
      locationStart: item.locationStart,
      locationEnd: item.locationEnd,
      addedAt: null,
      content: item.content,
      chapter: item.chapter,
      highlightColor: item.highlightColor,
      sourceFormat: 'notebook-html',
    };

    result.push(clipping);

    if (item.type === 'highlight') {
      lastHighlight = clipping;
    }
  }

  return {
    clippings: result,
    matchedBooksCount: matchedBook ? 1 : 0,
    unmatchedTitles: Array.from(unmatchedTitlesSet),
    chaptersFound,
    colorCounts,
  };
}
