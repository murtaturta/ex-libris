import JSZip from 'jszip';
import type { Book, EnrichmentCacheMap, UserLocalState } from '../../types/library';
import { generateBookMarkdownNote, wikilink } from './markdownNoteExporter';

/**
 * Obsidian Vault Exporter
 * -----------------------
 * Packs the library into a drop-in Obsidian folder:
 *
 *   Ex Libris/
 *     Books/<Title>.md            ← one literature note per book (never merged)
 *     Authors/<Author>.md         ← hub note linking every book by that author
 *
 * Designed for organic Obsidian Graph View visualization without artificial
 * series or index MOC gravity wells. Book notes link to Author hubs via `[[wikilinks]]`.
 * Author hubs link back to books. Obsidian resolves links by note name across the whole vault,
 * so every note name is made globally unique: books colliding with each other get ` (2)`,
 * and author notes that collide with a book title get ` (Author)`.
 */

export const VAULT_ROOT = 'Ex Libris';

/** Note-name sanitizer: filesystem-invalid chars + Obsidian link-breaking chars (# ^ [ ] |). */
export function sanitizeNoteName(raw: string | null | undefined, fallback = 'Untitled'): string {
  let s = (raw || '').replace(/[\\/:*?"<>|#^[\]]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  return s || fallback;
}

export type ObsidianExportScope = 'all' | 'read' | 'annotated';

const authorKeyOf = (b: Book) => (b.author || 'Unknown').trim().toLowerCase();
const yearOf = (b: Book) => b.originalPublicationYear || b.yearPublished || null;

function yamlStr(str: string): string {
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function stars(rating: number | null): string {
  return rating ? '★'.repeat(Math.round(rating)) : '';
}

function shelfLabel(shelf: string): string {
  switch (shelf) {
    case 'read':
      return 'Read';
    case 'currently-reading':
      return 'Currently Reading';
    case 'to-read':
      return 'To-Read';
    case 'did-not-finish':
    case 'dnf':
      return 'Did Not Finish';
    default:
      return shelf;
  }
}

/** Builds the full vault as an in-memory map of `path → content` (pure, testable). */
export function buildObsidianVaultFiles(
  books: Book[],
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): Map<string, string> {
  const files = new Map<string, string>();
  const usedNames = new Set<string>(); // case-insensitive global note-name registry

  const claim = (base: string, suffix: string): string => {
    let name = base;
    if (usedNames.has(name.toLowerCase())) name = `${base} ${suffix}`;
    let n = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `${base} ${suffix} ${n}`;
      n++;
    }
    usedNames.add(name.toLowerCase());
    return name;
  };

  // 1. Book note names first (books keep their clean titles; duplicates → " (2)")
  const bookNoteName = new Map<string, string>();
  for (const book of books) {
    const base = sanitizeNoteName(book.cleanTitle || book.title, 'Untitled Book');
    let name = base;
    let n = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `${base} (${n})`;
      n++;
    }
    usedNames.add(name.toLowerCase());
    bookNoteName.set(book.id, name);
  }

  // 2. Author buckets & note names
  const authors = new Map<string, { displayName: string; books: Book[] }>();
  for (const book of books) {
    const key = authorKeyOf(book);
    if (!authors.has(key)) authors.set(key, { displayName: (book.author || 'Unknown').trim(), books: [] });
    authors.get(key)!.books.push(book);
  }
  const authorNoteName = new Map<string, string>();
  for (const [key, a] of authors) {
    authorNoteName.set(key, claim(sanitizeNoteName(a.displayName, 'Unknown Author'), '(Author)'));
  }

  const bookLink = (b: Book) => wikilink(bookNoteName.get(b.id)!, b.cleanTitle || b.title);
  const bookLine = (b: Book) => {
    const seriesPart = b.seriesName
      ? `(${b.seriesName}${b.seriesNumber ? ` #${b.seriesNumber}` : ''})`
      : null;
    const meta = [
      seriesPart,
      yearOf(b) ? String(yearOf(b)) : null,
      b.myRating ? stars(b.myRating) : shelfLabel(b.exclusiveShelf),
      b.pageCount ? `${b.pageCount}p` : null,
    ].filter(Boolean);
    return `- ${bookLink(b)}${meta.length ? ` · ${meta.join(' · ')}` : ''}`;
  };

  // 3. Book notes
  for (const book of books) {
    const { content } = generateBookMarkdownNote(book, userState, enrichmentCache?.[book.id], {
      authorNote: authorNoteName.get(authorKeyOf(book))!,
    });
    files.set(`${VAULT_ROOT}/Books/${bookNoteName.get(book.id)}.md`, content);
  }

  // 4. Author hub notes
  for (const [key, a] of authors) {
    const sorted = [...a.books].sort((x, y) => (yearOf(x) ?? 99999) - (yearOf(y) ?? 99999));
    const rated = a.books.filter((b) => b.myRating && b.myRating > 0);
    const avg = rated.length ? rated.reduce((s, b) => s + (b.myRating || 0), 0) / rated.length : null;
    const pagesRead = a.books
      .filter((b) => b.exclusiveShelf === 'read')
      .reduce((s, b) => s + (b.pageCount || 0), 0);

    const lines = [
      '---',
      'type: author',
      `name: ${yamlStr(a.displayName)}`,
      `books: ${a.books.length}`,
      `books_read: ${a.books.filter((b) => b.exclusiveShelf === 'read').length}`,
      `avg_my_rating: ${avg !== null ? Number(avg.toFixed(2)) : 'null'}`,
      `pages_read: ${pagesRead}`,
      '---',
      '',
      `# ${a.displayName}`,
      '',
      `## Books (${a.books.length})`,
      '',
      ...sorted.map((b) => bookLine(b)),
      '',
    ];
    files.set(`${VAULT_ROOT}/Authors/${authorNoteName.get(key)}.md`, lines.join('\n'));
  }

  return files;
}

/** Zips the vault. */
export async function exportObsidianVaultZip(
  books: Book[],
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): Promise<{ blob: Blob; fileCount: number }> {
  const files = buildObsidianVaultFiles(books, userState, enrichmentCache);
  const zip = new JSZip();
  for (const [path, content] of files) zip.file(path, content);
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { blob, fileCount: files.size };
}

/** Triggers a browser download of the vault `.zip`. */
export async function downloadObsidianVault(
  books: Book[],
  userState?: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap,
  scope: ObsidianExportScope = 'all'
): Promise<void> {
  const { blob } = await exportObsidianVaultZip(books, userState, enrichmentCache);
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `exlibris-obsidian-vault-${scope}-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
