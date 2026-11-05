import JSZip from 'jszip';
import type { Book, EnrichmentCacheMap, UserLocalState } from '../../types/library';
import { generateBookMarkdownNote, wikilink } from './markdownNoteExporter';

/**
 * Obsidian Vault Exporter
 * -----------------------
 * Packs the library into a drop-in Obsidian folder:
 *
 *   Ex Libris/
 *     Ex Libris Index.md          ← map of content (every book, author & series)
 *     Books/<Title>.md            ← one literature note per book (never merged)
 *     Authors/<Author>.md         ← hub note linking every book by that author
 *     Series/<Series>.md          ← hub note listing volumes in series order
 *
 * Book notes link to hubs via `[[wikilinks]]` (YAML properties + body). Hubs link back.
 * Obsidian resolves links by note name across the whole vault, so every note name is
 * made globally unique: books colliding with each other get ` (2)`, and hub notes that
 * collide with a book title get ` (Author)` / ` (Series)` (e.g. Dune → `Dune (Series)`).
 */

export const VAULT_ROOT = 'Ex Libris';

/** Note-name sanitizer: filesystem-invalid chars + Obsidian link-breaking chars (# ^ [ ] |). */
export function sanitizeNoteName(raw: string | null | undefined, fallback = 'Untitled'): string {
  let s = (raw || '').replace(/[\\/:*?"<>|#^[\]]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
  return s || fallback;
}

export type ObsidianExportScope = 'all' | 'read' | 'annotated';

interface SeriesBucket {
  displayName: string;
  books: Book[];
}

const seriesKeyOf = (b: Book) => (b.seriesName ? b.seriesName.trim().toLowerCase() : null);
const authorKeyOf = (b: Book) => (b.author || 'Unknown').trim().toLowerCase();
const yearOf = (b: Book) => b.originalPublicationYear || b.yearPublished || null;
const seriesNum = (b: Book) => {
  const n = parseFloat(b.seriesNumber ?? '');
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

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
  const usedNames = new Set<string>([`${VAULT_ROOT} Index`.toLowerCase()]); // case-insensitive global note-name registry

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

  // 3. Series buckets & note names (every named series gets a hub, even with one volume)
  const series = new Map<string, SeriesBucket>();
  for (const book of books) {
    const key = seriesKeyOf(book);
    if (!key) continue;
    if (!series.has(key)) series.set(key, { displayName: book.seriesName!.trim(), books: [] });
    series.get(key)!.books.push(book);
  }
  const seriesNoteName = new Map<string, string>();
  for (const [key, s] of series) {
    seriesNoteName.set(key, claim(sanitizeNoteName(s.displayName, 'Untitled Series'), '(Series)'));
  }

  const bookLink = (b: Book) => wikilink(bookNoteName.get(b.id)!, b.cleanTitle || b.title);
  const bookLine = (b: Book, prefix = '') => {
    const meta = [
      yearOf(b) ? String(yearOf(b)) : null,
      b.myRating ? stars(b.myRating) : shelfLabel(b.exclusiveShelf),
      b.pageCount ? `${b.pageCount}p` : null,
    ].filter(Boolean);
    return `- ${prefix}${bookLink(b)}${meta.length ? ` · ${meta.join(' · ')}` : ''}`;
  };

  // 4. Book notes
  for (const book of books) {
    const sKey = seriesKeyOf(book);
    const { content } = generateBookMarkdownNote(book, userState, enrichmentCache?.[book.id], {
      authorNote: authorNoteName.get(authorKeyOf(book))!,
      seriesNote: sKey ? seriesNoteName.get(sKey)! : null,
    });
    files.set(`${VAULT_ROOT}/Books/${bookNoteName.get(book.id)}.md`, content);
  }

  // 5. Author hub notes
  for (const [key, a] of authors) {
    const sorted = [...a.books].sort((x, y) => (yearOf(x) ?? 99999) - (yearOf(y) ?? 99999));
    const rated = a.books.filter((b) => b.myRating && b.myRating > 0);
    const avg = rated.length ? rated.reduce((s, b) => s + (b.myRating || 0), 0) / rated.length : null;
    const pagesRead = a.books
      .filter((b) => b.exclusiveShelf === 'read')
      .reduce((s, b) => s + (b.pageCount || 0), 0);
    const authorSeries = [...new Set(a.books.map(seriesKeyOf).filter((k): k is string => !!k))];

    const lines = [
      '---',
      'type: author',
      `name: ${yamlStr(a.displayName)}`,
      `books: ${a.books.length}`,
      `books_read: ${a.books.filter((b) => b.exclusiveShelf === 'read').length}`,
      `avg_my_rating: ${avg !== null ? Number(avg.toFixed(2)) : 'null'}`,
      `pages_read: ${pagesRead}`,
      authorSeries.length
        ? `series:\n${authorSeries.map((k) => `  - ${yamlStr(wikilink(seriesNoteName.get(k)!, series.get(k)!.displayName))}`).join('\n')}`
        : 'series: []',
      '---',
      '',
      `# ${a.displayName}`,
      '',
      `## Books (${a.books.length})`,
      '',
      ...sorted.map((b) => bookLine(b)),
    ];
    if (authorSeries.length) {
      lines.push(
        '',
        '## Series',
        '',
        ...authorSeries.map((k) => `- ${wikilink(seriesNoteName.get(k)!, series.get(k)!.displayName)}`)
      );
    }
    lines.push('', `[[${VAULT_ROOT} Index|← Ex Libris Index]]`, '');
    files.set(`${VAULT_ROOT}/Authors/${authorNoteName.get(key)}.md`, lines.join('\n'));
  }

  // 6. Series hub notes (ordered by series number; unnumbered last, by publication year)
  for (const [key, s] of series) {
    const ordered = [...s.books].sort((x, y) => {
      const nx = seriesNum(x);
      const ny = seriesNum(y);
      if (nx !== ny) return nx < ny ? -1 : 1;
      return (yearOf(x) ?? 99999) - (yearOf(y) ?? 99999);
    });
    const seriesAuthors = [...new Set(s.books.map(authorKeyOf))];
    const readCount = s.books.filter((b) => b.exclusiveShelf === 'read').length;

    const lines = [
      '---',
      'type: series',
      `name: ${yamlStr(s.displayName)}`,
      `authors:\n${seriesAuthors.map((k) => `  - ${yamlStr(wikilink(authorNoteName.get(k)!, authors.get(k)!.displayName))}`).join('\n')}`,
      `volumes_in_library: ${s.books.length}`,
      `volumes_read: ${readCount}`,
      '---',
      '',
      `# ${s.displayName}`,
      '',
      `By ${seriesAuthors.map((k) => wikilink(authorNoteName.get(k)!, authors.get(k)!.displayName)).join(', ')}`,
      '',
      `## Reading Order (${readCount}/${s.books.length} read)`,
      '',
      ...ordered.map((b) => bookLine(b, b.seriesNumber ? `#${b.seriesNumber} ` : '')),
      '',
      `[[${VAULT_ROOT} Index|← Ex Libris Index]]`,
      '',
    ];
    files.set(`${VAULT_ROOT}/Series/${seriesNoteName.get(key)}.md`, lines.join('\n'));
  }

  // 7. Index (Map of Content)
  const shelfOrder = ['currently-reading', 'read', 'to-read', 'did-not-finish'];
  const byShelf = new Map<string, Book[]>();
  for (const b of books) {
    const shelf = b.exclusiveShelf === 'dnf' ? 'did-not-finish' : b.exclusiveShelf;
    if (!byShelf.has(shelf)) byShelf.set(shelf, []);
    byShelf.get(shelf)!.push(b);
  }
  const shelves = [
    ...shelfOrder.filter((s) => byShelf.has(s)),
    ...[...byShelf.keys()].filter((s) => !shelfOrder.includes(s)),
  ];
  const titleSort = (x: Book, y: Book) =>
    (x.cleanTitle || x.title).localeCompare(y.cleanTitle || y.title);

  const indexLines = [
    '---',
    'type: index',
    `books: ${books.length}`,
    `authors: ${authors.size}`,
    `series: ${series.size}`,
    `exported: ${yamlStr(new Date().toISOString().slice(0, 10))}`,
    '---',
    '',
    '# Ex Libris Index',
    '',
    `${books.length} books · ${authors.size} authors · ${series.size} series`,
    '',
  ];
  for (const shelf of shelves) {
    const list = [...byShelf.get(shelf)!].sort(titleSort);
    indexLines.push(`## ${shelfLabel(shelf)} (${list.length})`, '', ...list.map((b) => bookLine(b)), '');
  }
  indexLines.push(
    `## Authors (${authors.size})`,
    '',
    ...[...authors.entries()]
      .sort((x, y) => x[1].displayName.localeCompare(y[1].displayName))
      .map(([k, a]) => `- ${wikilink(authorNoteName.get(k)!, a.displayName)} (${a.books.length})`),
    ''
  );
  if (series.size) {
    indexLines.push(
      `## Series (${series.size})`,
      '',
      ...[...series.entries()]
        .sort((x, y) => x[1].displayName.localeCompare(y[1].displayName))
        .map(([k, s]) => `- ${wikilink(seriesNoteName.get(k)!, s.displayName)} (${s.books.length})`),
      ''
    );
  }
  files.set(`${VAULT_ROOT}/${VAULT_ROOT} Index.md`, indexLines.join('\n'));

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
