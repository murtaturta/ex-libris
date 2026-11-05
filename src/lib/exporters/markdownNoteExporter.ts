import JSZip from 'jszip';
import type {
  Book,
  EnrichedBookMetadata,
  EnrichmentCacheMap,
  UserLocalState,
} from '../../types/library';
import {
  classifyBookLanguageAndFormat,
  FORMAT_LABELS,
} from '../classifiers/languageAndFormat';
import { formatPublicationYear, formatReviewHtml } from '../formatters';
import { getGoodreadsBookUrl } from '../links/goodreadsLinks';

/**
 * Sanitizes a book title for use as a filesystem filename.
 * Strips invalid characters (/\:*?"<>|), collapses whitespace, trims trailing dots,
 * and appends the `.md` extension.
 *
 * Guaranteed book-by-book naming scheme: `<Sanitized-Clean-Title>.md`.
 */
export function sanitizeMarkdownFilename(title: string | null | undefined): string {
  if (!title) return 'untitled-book.md';

  // Strip invalid filesystem characters across Windows/macOS/Linux
  let sanitized = title.replace(/[\\/:*?"<>|]/g, ' ');

  // Collapse consecutive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Strip trailing dots and trailing whitespace (invalid on Windows filesystems)
  sanitized = sanitized.replace(/[.\s]+$/, '');

  if (!sanitized) {
    return 'untitled-book.md';
  }

  return `${sanitized}.md`;
}

/**
 * Escapes strings for valid YAML double-quoted scalars in frontmatter.
 */
function yamlEscape(str: string): string {
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

/**
 * Checks whether a given book has any personal annotations, reviews, or marginalia.
 */
export function bookHasAnnotations(book: Book, userState?: UserLocalState): boolean {
  if (book.myReview && book.myReview.trim().length > 0) return true;
  if (book.privateNotes && book.privateNotes.trim().length > 0) return true;

  const override = userState?.bookOverrides?.[book.id];
  if (override?.localNotes && override.localNotes.trim().length > 0) return true;
  if (book.kindleNotes && book.kindleNotes.length > 0) return true;

  if (userState?.kindleClippings && userState.kindleClippings.length > 0) {
    const bookClean = (book.cleanTitle || book.title || '').toLowerCase().trim();
    const bookTitle = (book.title || '').toLowerCase().trim();

    const hasClip = userState.kindleClippings.some((c) => {
      if (c.matchedBookId && c.matchedBookId === book.id) return true;
      const clipClean = (c.cleanTitle || '').toLowerCase().trim();
      const clipRaw = (c.rawTitle || '').toLowerCase().trim();
      if (bookClean && clipClean && bookClean === clipClean) return true;
      if (bookTitle && clipRaw && bookTitle === clipRaw) return true;
      return false;
    });

    if (hasClip) return true;
  }

  return false;
}

/**
 * Generates an individual, book-by-book Obsidian / Markdown literature note.
 *
 * Structure:
 * 1. YAML frontmatter with full bibliographic and translation passport metadata.
 * 2. Bibliographic Summary Header.
 * 3. Enriched Synopsis (if available).
 * 4. Personal Review & Ratings.
 * 5. Private / Local Notes.
 * 6. Kindle DSAR Notes.
 * 7. Kindle `My Clippings.txt` highlights & paired notes.
 */
/**
 * Optional Obsidian vault link targets. When supplied, the note emits `[[wikilinks]]`
 * to the Author / Series hub notes (in both YAML properties and the body).
 */
export interface VaultLinkTargets {
  /** Note name (filename without `.md`) of the author hub note. */
  authorNote: string;
  /** Note name of the series hub note, or null when the book is standalone. */
  seriesNote?: string | null;
}

/** Builds an Obsidian wikilink, adding a `|display` alias only when needed. */
export function wikilink(noteName: string, display?: string): string {
  return display && display !== noteName ? `[[${noteName}|${display}]]` : `[[${noteName}]]`;
}

export function generateBookMarkdownNote(
  book: Book,
  userState?: UserLocalState,
  enrichment?: EnrichedBookMetadata,
  vaultLinks?: VaultLinkTargets
): { filename: string; content: string } {
  const profile = classifyBookLanguageAndFormat(
    book,
    userState?.bookOverrides?.[book.id],
    enrichment
  );

  const seriesString = book.seriesName
    ? `${book.seriesName}${book.seriesNumber ? ` #${book.seriesNumber}` : ''}`
    : null;

  const authorLink = vaultLinks ? wikilink(vaultLinks.authorNote, book.author || 'Unknown') : null;
  const seriesLink =
    vaultLinks?.seriesNote && book.seriesName
      ? wikilink(vaultLinks.seriesNote, book.seriesName.trim())
      : null;
  const seriesNumberNum = book.seriesNumber ? parseFloat(book.seriesNumber) : NaN;

  const goodreadsInfo = getGoodreadsBookUrl(book);
  const communityRating = book.averageRating ?? enrichment?.communityRating ?? null;
  const pubYear = book.originalPublicationYear || book.yearPublished || null;
  const override = userState?.bookOverrides?.[book.id];

  // ==========================================
  // 1. YAML Frontmatter (Obsidian / PKM standard)
  // ==========================================
  const frontmatterLines = [
    '---',
    `title: ${yamlEscape(book.cleanTitle || book.title || 'Untitled')}`,
    `author: ${yamlEscape(authorLink ?? (book.author || 'Unknown'))}`,
    book.additionalAuthors && book.additionalAuthors.length > 0
      ? `additional_authors:\n${book.additionalAuthors.map((a) => `  - ${yamlEscape(a)}`).join('\n')}`
      : '',
    seriesLink
      ? `series: ${yamlEscape(seriesLink)}`
      : `series: ${seriesString ? yamlEscape(seriesString) : 'null'}`,
    `series_number: ${Number.isFinite(seriesNumberNum) ? seriesNumberNum : 'null'}`,
    profile.translators.length > 0
      ? `translators:\n${profile.translators.map((t) => `  - ${yamlEscape(t)}`).join('\n')}`
      : 'translators: []',
    `original_language: ${yamlEscape(profile.originalLanguage)}`,
    `edition_language: ${yamlEscape(profile.editionLanguage)}`,
    `translation_flow: ${yamlEscape(profile.translationFlow)}`,
    `translated: ${profile.isTranslation ? 'true' : 'false'}`,
    `format: ${yamlEscape(profile.format)}`,
    `publisher: ${book.publisher ? yamlEscape(book.publisher) : 'null'}`,
    `isbn13: ${book.isbn13 ? yamlEscape(book.isbn13) : 'null'}`,
    `pages: ${book.pageCount !== null && book.pageCount !== undefined ? book.pageCount : 'null'}`,
    `published_year: ${pubYear !== null && pubYear !== undefined ? pubYear : 'null'}`,
    `shelf: ${yamlEscape(book.exclusiveShelf || 'to-read')}`,
    `my_rating: ${book.myRating !== null && book.myRating !== undefined ? book.myRating : 'null'}`,
    `community_rating: ${communityRating !== null && communityRating !== undefined ? Number(communityRating.toFixed(2)) : 'null'}`,
    `date_read: ${book.dateRead ? yamlEscape(book.dateRead) : 'null'}`,
    `date_added: ${book.dateAdded ? yamlEscape(book.dateAdded) : 'null'}`,
    `read_count: ${book.readCount ?? 0}`,
    `goodreads_url: ${yamlEscape(goodreadsInfo.url)}`,
    '---',
  ].filter(Boolean);

  // ==========================================
  // 2. Markdown Body Sections
  // ==========================================
  const bodyParts: string[] = [];

  // Header & Title
  bodyParts.push(`# ${book.cleanTitle || book.title || 'Untitled'}`);
  if (seriesLink) {
    bodyParts.push(`*${seriesLink}${book.seriesNumber ? ` #${book.seriesNumber}` : ''}*`);
  } else if (seriesString) {
    bodyParts.push(`*${seriesString}*`);
  }

  // Bibliographic summary callout block
  const summaryLines: string[] = [
    `> **Author:** ${authorLink ?? (book.author || 'Unknown')}`,
    book.publisher ? `> **Publisher:** ${book.publisher}` : '',
    pubYear ? `> **Published:** ${formatPublicationYear(pubYear)}` : '',
    `> **Format:** ${FORMAT_LABELS[profile.format]} (${profile.translationFlow})`,
    `> **Status:** ${book.exclusiveShelf}${book.myRating ? ` · **Rating:** ${'★'.repeat(Math.round(book.myRating))}` : ''}`,
    `> **Goodreads:** [${goodreadsInfo.label}](${goodreadsInfo.url})`,
  ].filter(Boolean);

  bodyParts.push(summaryLines.join('  \n'));

  // Enriched Synopsis
  if (enrichment?.synopsis && enrichment.synopsis.trim().length > 0) {
    bodyParts.push(`## Synopsis\n\n${enrichment.synopsis.trim()}`);
  }

  // My Review
  if (book.myReview && book.myReview.trim().length > 0) {
    const reviewParagraphs = formatReviewHtml(book.myReview);
    const spoilerBanner = book.spoiler ? '> [!WARNING] Contains Spoilers\n\n' : '';
    bodyParts.push(`## My Review\n\n${spoilerBanner}${reviewParagraphs.join('\n\n')}`);
  }

  // Local Notes (Personal Workspace Overrides)
  if (override?.localNotes && override.localNotes.trim().length > 0) {
    bodyParts.push(`## Personal Notes\n\n${override.localNotes.trim()}`);
  }

  // Private Notes (Goodreads Private Notes)
  if (book.privateNotes && book.privateNotes.trim().length > 0) {
    bodyParts.push(`## Private Notes\n\n${book.privateNotes.trim()}`);
  }

  // DSAR Kindle Notes
  if (book.kindleNotes && book.kindleNotes.length > 0) {
    const notesFormatted = book.kindleNotes
      .map((kn) => {
        const datePart = kn.createdAt ? kn.createdAt.slice(0, 10) : 'Note';
        return `- **${datePart}:** ${kn.noteText}`;
      })
      .join('\n\n');
    bodyParts.push(`## Kindle Notes (DSAR)\n\n${notesFormatted}`);
  }

  // Kindle Highlights & Clippings (`My Clippings.txt`)
  if (userState?.kindleClippings && userState.kindleClippings.length > 0) {
    const bookClean = (book.cleanTitle || book.title || '').toLowerCase().trim();
    const bookTitle = (book.title || '').toLowerCase().trim();

    const matchingClippings = userState.kindleClippings.filter((c) => {
      if (c.matchedBookId && c.matchedBookId === book.id) return true;
      const clipClean = (c.cleanTitle || '').toLowerCase().trim();
      const clipRaw = (c.rawTitle || '').toLowerCase().trim();
      if (bookClean && clipClean && bookClean === clipClean) return true;
      if (bookTitle && clipRaw && bookTitle === clipRaw) return true;
      return false;
    });

    if (matchingClippings.length > 0) {
      const clipsFormatted = matchingClippings
        .map((clip) => {
          const chapterPrefix = clip.chapter ? `${clip.chapter} · ` : '';
          const loc = clip.page
            ? `Page ${clip.page}`
            : clip.locationStart
            ? `Location ${clip.locationStart}${clip.locationEnd ? `–${clip.locationEnd}` : ''}`
            : 'Highlight';
          const colorBadge = clip.highlightColor ? ` · [${clip.highlightColor}]` : '';
          const dateStr = clip.addedAt ? ` · ${clip.addedAt.slice(0, 10)}` : '';
          const blockquote = `> ${clip.content.replace(/\r?\n/g, '\n> ')}`;
          const attached = clip.attachedNote
            ? `\n>\n> **Attached Note:** ${clip.attachedNote.replace(/\r?\n/g, '\n> ')}`
            : '';
          return `### ${chapterPrefix}${loc}${colorBadge}${dateStr}\n\n${blockquote}${attached}`;
        })
        .join('\n\n');

      bodyParts.push(
        `## Kindle Highlights & Passages (${matchingClippings.length})\n\n${clipsFormatted}`
      );
    }
  }

  const content = `${frontmatterLines.join('\n')}\n\n${bodyParts.join('\n\n')}\n`;
  const filename = sanitizeMarkdownFilename(book.cleanTitle || book.title || 'untitled-book');

  return { filename, content };
}

/**
 * Triggers a browser download for a single book's Markdown literature note.
 */
export function downloadSingleBookMarkdown(
  book: Book,
  userState?: UserLocalState,
  enrichment?: EnrichedBookMetadata
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const { filename, content } = generateBookMarkdownNote(book, userState, enrichment);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports multiple books as individual, per-book `.md` files packed into a `.zip` archive.
 * STRICT MURAT RULE: NEVER merges books into one monolithic file.
 * Handles filename collisions by appending ` (2).md`, ` (3).md`.
 */
export async function exportBooksMarkdownZip(
  books: Book[],
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): Promise<{ count: number; blob: Blob; filename: string }> {
  const zip = new JSZip();
  const seenFilenames = new Map<string, number>();

  for (const book of books) {
    const enrichment = enrichmentCache?.[book.id];
    const { filename: baseFilename, content } = generateBookMarkdownNote(
      book,
      userState,
      enrichment
    );

    // Collision handling: foo.md -> foo (2).md, foo (3).md
    let finalFilename = baseFilename;
    const nameWithoutExt = baseFilename.replace(/\.md$/i, '');

    const currentCount = seenFilenames.get(nameWithoutExt) || 0;
    if (currentCount > 0) {
      finalFilename = `${nameWithoutExt} (${currentCount + 1}).md`;
    }
    seenFilenames.set(nameWithoutExt, currentCount + 1);

    zip.file(finalFilename, content);
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    count: books.length,
    blob: zipBlob,
    filename: `exlibris-markdown-notes-${dateStr}.zip`,
  };
}

/**
 * Triggers a browser download of multiple individual book Markdown notes zipped together.
 */
export async function downloadBooksMarkdownZip(
  books: Book[],
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap,
  zipName?: string
): Promise<void> {
  const { blob, filename } = await exportBooksMarkdownZip(
    books,
    userState,
    enrichmentCache
  );
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName || filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
