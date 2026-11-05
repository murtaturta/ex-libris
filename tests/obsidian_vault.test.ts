import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import type { Book } from '../src/types/library';
import {
  buildObsidianVaultFiles,
  exportObsidianVaultZip,
  sanitizeNoteName,
} from '../src/lib/exporters/obsidianVaultExporter';

const base: Book = {
  id: '0',
  title: 'x',
  cleanTitle: 'x',
  seriesName: null,
  seriesNumber: null,
  author: 'Frank Herbert',
  authorSort: null,
  additionalAuthors: [],
  isbn: null,
  isbn13: null,
  myRating: null,
  averageRating: null,
  publisher: null,
  binding: null,
  pageCount: 300,
  yearPublished: null,
  originalPublicationYear: null,
  dateRead: null,
  dateAdded: null,
  exclusiveShelf: 'read',
  bookshelves: [],
  bookshelvesWithPositions: null,
  readCount: 1,
  ownedCopies: 0,
  myReview: null,
  spoiler: false,
  privateNotes: null,
  shelving: null,
  reviewDetails: null,
  readingSessions: [],
  kindleNotes: [],
  recommendations: [],
};

const mk = (o: Partial<Book>): Book => ({ ...base, ...o });

const library: Book[] = [
  mk({ id: '1', title: 'Dune', cleanTitle: 'Dune', seriesName: 'Dune', seriesNumber: '1', myRating: 5, originalPublicationYear: 1965 }),
  mk({ id: '2', title: 'Dune Messiah', cleanTitle: 'Dune Messiah', seriesName: 'Dune', seriesNumber: '2', originalPublicationYear: 1969 }),
  mk({ id: '3', title: 'Solaris', cleanTitle: 'Solaris', author: 'Stanisław Lem', exclusiveShelf: 'to-read' }),
  mk({ id: '4', title: 'Solaris', cleanTitle: 'Solaris', author: 'Stanisław Lem' }),
  mk({ id: '5', title: 'What If?: Part #2 [Draft]', cleanTitle: 'What If?: Part #2 [Draft]', author: 'Randall Munroe' }),
];

describe('Obsidian Vault Exporter', () => {
  const files = buildObsidianVaultFiles(library);
  const paths = [...files.keys()];

  it('lays out Books / Authors / Series folders plus an Index', () => {
    expect(paths).toContain('Ex Libris/Ex Libris Index.md');
    expect(paths).toContain('Ex Libris/Books/Dune.md');
    expect(paths).toContain('Ex Libris/Books/Dune Messiah.md');
    expect(paths).toContain('Ex Libris/Authors/Frank Herbert.md');
    expect(paths).toContain('Ex Libris/Authors/Stanisław Lem.md');
    // one note per book, never merged
    expect(paths.filter((p) => p.startsWith('Ex Libris/Books/'))).toHaveLength(5);
  });

  it('renames hub notes that collide with a book title (Dune → Dune (Series))', () => {
    expect(paths).toContain('Ex Libris/Series/Dune (Series).md');
    const dune = files.get('Ex Libris/Books/Dune.md')!;
    expect(dune).toContain('author: "[[Frank Herbert]]"');
    expect(dune).toContain('series: "[[Dune (Series)|Dune]]"');
    expect(dune).toContain('series_number: 1');
    expect(dune).toContain('my_rating: 5');
    expect(dune).toContain('> **Author:** [[Frank Herbert]]');
  });

  it('suffixes duplicate book titles and strips link-breaking characters', () => {
    expect(paths).toContain('Ex Libris/Books/Solaris.md');
    expect(paths).toContain('Ex Libris/Books/Solaris (2).md');
    expect(sanitizeNoteName('What If?: Part #2 [Draft]')).toBe('What If Part 2 Draft');
    expect(paths).toContain('Ex Libris/Books/What If Part 2 Draft.md');
  });

  it('author & series hubs link back to books in correct order', () => {
    const author = files.get('Ex Libris/Authors/Frank Herbert.md')!;
    expect(author).toContain('type: author');
    expect(author).toContain('[[Dune]]');
    expect(author).toContain('[[Dune Messiah]]');
    expect(author).toContain('[[Dune (Series)|Dune]]');
    expect(author.indexOf('[[Dune]]')).toBeLessThan(author.indexOf('[[Dune Messiah]]'));

    const series = files.get('Ex Libris/Series/Dune (Series).md')!;
    expect(series).toContain('type: series');
    expect(series).toContain('#1 [[Dune]]');
    expect(series).toContain('#2 [[Dune Messiah]]');
    expect(series).toContain('Reading Order (2/2 read)');

    const lem = files.get('Ex Libris/Authors/Stanisław Lem.md')!;
    expect(lem).toContain('[[Solaris (2)|Solaris]]');
  });

  it('zips the vault', async () => {
    const { blob, fileCount } = await exportObsidianVaultZip(library);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(fileCount).toBe(files.size);
    expect(Object.keys(zip.files)).toContain('Ex Libris/Books/Dune.md');
  });
});
