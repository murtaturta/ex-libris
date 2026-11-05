import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import type { Book, UserLocalState, EnrichedBookMetadata } from '../src/types/library';
import {
  sanitizeMarkdownFilename,
  generateBookMarkdownNote,
  bookHasAnnotations,
  exportBooksMarkdownZip,
} from '../src/lib/exporters/markdownNoteExporter';
import {
  extractGoodreadsUserId,
  extractXmlTag,
  parseRssDate,
  parseGoodreadsRssXml,
} from '../src/lib/parsers/goodreadsRss';

describe('Markdown Note Exporter (B-03)', () => {
  const sampleBook: Book = {
    id: '44767458',
    title: 'Dune (Dune, #1)',
    cleanTitle: 'Dune',
    seriesName: 'Dune',
    seriesNumber: '1',
    author: 'Frank Herbert',
    authorSort: 'Herbert, Frank',
    additionalAuthors: [],
    isbn: null,
    isbn13: '9780593099322',
    myRating: 5,
    averageRating: 4.27,
    publisher: 'Ace',
    binding: 'Hardcover',
    pageCount: 658,
    yearPublished: 2019,
    originalPublicationYear: 1965,
    dateRead: '2024-04-05',
    dateAdded: '2024-03-19',
    exclusiveShelf: 'read',
    bookshelves: ['favorites'],
    bookshelvesWithPositions: null,
    readCount: 1,
    ownedCopies: 0,
    myReview: 'A masterpiece of speculative ecology and feudal politics.<br/><br/>Fear is the mind-killer.',
    spoiler: false,
    privateNotes: 'Purchased 50th anniversary collector edition.',
    shelving: null,
    reviewDetails: null,
    readingSessions: [],
    kindleNotes: [
      {
        activity: 'highlight',
        product: 'Dune',
        noteText: 'Bless the Maker and His water.',
        createdAt: '2024-04-01T12:00:00Z',
      },
    ],
    recommendations: [],
  };

  const sampleEnrichment: EnrichedBookMetadata = {
    bookId: '44767458',
    fetchedAt: '2026-10-29T00:00:00Z',
    source: 'openlibrary',
    synopsis: 'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides...',
    communityRating: 4.27,
    ratingsCount: 1200000,
    subjects: ['Science Fiction', 'Space Opera'],
    coverUrl: 'https://images.gr-assets.com/books/dune.jpg',
  };

  const sampleUserState: UserLocalState = {
    version: '0.2.0',
    updatedAt: '2026-10-29T00:00:00Z',
    showCovers: true,
    bookOverrides: {
      '44767458': {
        localNotes: 'Reread in preparation for Messiah.',
      },
    },
    kindleClippings: [
      {
        id: 'clip-1',
        rawTitle: 'Dune',
        cleanTitle: 'Dune',
        author: 'Frank Herbert',
        matchedBookId: '44767458',
        type: 'highlight',
        page: 42,
        locationStart: 120,
        locationEnd: 125,
        addedAt: '2024-04-02T10:00:00Z',
        content: 'I must not fear. Fear is the mind-killer.',
        attachedNote: 'Core mantra for focus.',
      },
    ],
  };

  it('sanitizes titles into clean filesystem filenames', () => {
    expect(sanitizeMarkdownFilename('Dune (Dune, #1)')).toBe('Dune (Dune, #1).md');
    expect(sanitizeMarkdownFilename('What If?: Serious Answers...')).toBe('What If Serious Answers.md');
    expect(sanitizeMarkdownFilename('Et si c\'était vrai...')).toBe('Et si c\'était vrai.md');
    expect(sanitizeMarkdownFilename('Invalid/\\:*?"<>|Characters')).toBe('Invalid Characters.md');
    expect(sanitizeMarkdownFilename('')).toBe('untitled-book.md');
    expect(sanitizeMarkdownFilename('   ...   ')).toBe('untitled-book.md');
    expect(sanitizeMarkdownFilename(null)).toBe('untitled-book.md');
  });

  it('generates a full Markdown note with valid YAML frontmatter and body sections', () => {
    const { filename, content } = generateBookMarkdownNote(
      sampleBook,
      sampleUserState,
      sampleEnrichment
    );

    expect(filename).toBe('Dune.md');

    // YAML frontmatter checks
    expect(content).toContain('---');
    expect(content).toContain('title: "Dune"');
    expect(content).toContain('author: "Frank Herbert"');
    expect(content).toContain('series: "Dune #1"');
    expect(content).toContain('format: "prose"');
    expect(content).toContain('isbn13: "9780593099322"');
    expect(content).toContain('pages: 658');
    expect(content).toContain('published_year: 1965');
    expect(content).toContain('shelf: "read"');
    expect(content).toContain('my_rating: 5');
    expect(content).toContain('community_rating: 4.27');
    expect(content).toContain('goodreads_url: "https://www.goodreads.com/book/show/44767458"');

    // Body sections
    expect(content).toContain('# Dune');
    expect(content).toContain('*Dune #1*');
    expect(content).toContain('## Synopsis');
    expect(content).toContain('Set on the desert planet Arrakis');
    expect(content).toContain('## My Review');
    expect(content).toContain('A masterpiece of speculative ecology');
    expect(content).toContain('## Personal Notes');
    expect(content).toContain('Reread in preparation for Messiah.');
    expect(content).toContain('## Private Notes');
    expect(content).toContain('Purchased 50th anniversary collector edition.');
    expect(content).toContain('## Kindle Notes (DSAR)');
    expect(content).toContain('Bless the Maker and His water.');
    expect(content).toContain('## Kindle Highlights & Passages (1)');
    expect(content).toContain('Page 42');
    expect(content).toContain('I must not fear. Fear is the mind-killer.');
    expect(content).toContain('**Attached Note:** Core mantra for focus.');
  });

  it('omits optional body sections when metadata is absent', () => {
    const minimalBook: Book = {
      ...sampleBook,
      id: '999',
      title: 'Minimal Book',
      cleanTitle: 'Minimal Book',
      seriesName: null,
      seriesNumber: null,
      myReview: null,
      privateNotes: null,
      kindleNotes: [],
    };

    const { content } = generateBookMarkdownNote(minimalBook);

    expect(content).not.toContain('## Synopsis');
    expect(content).not.toContain('## My Review');
    expect(content).not.toContain('## Personal Notes');
    expect(content).not.toContain('## Private Notes');
    expect(content).not.toContain('## Kindle Notes (DSAR)');
    expect(content).not.toContain('## Kindle Highlights & Passages');
  });

  it('accurately identifies whether a book has annotations', () => {
    expect(bookHasAnnotations(sampleBook, sampleUserState)).toBe(true);

    const bareBook: Book = {
      ...sampleBook,
      id: 'bare-1',
      myReview: null,
      privateNotes: null,
      kindleNotes: [],
    };
    expect(bookHasAnnotations(bareBook)).toBe(false);
  });

  it('exports multiple individual per-book .md files inside a zip without merging', async () => {
    const bookA: Book = { ...sampleBook, id: '1', title: 'Solaris', cleanTitle: 'Solaris' };
    const bookB: Book = { ...sampleBook, id: '2', title: 'Solaris', cleanTitle: 'Solaris' }; // duplicate title
    const bookC: Book = { ...sampleBook, id: '3', title: 'Ice', cleanTitle: 'Ice' };

    const { count, blob, filename } = await exportBooksMarkdownZip([bookA, bookB, bookC]);

    expect(count).toBe(3);
    expect(filename).toMatch(/^exlibris-markdown-notes-\d{4}-\d{2}-\d{2}\.zip$/);

    // Verify zip contents using JSZip
    const buffer = await blob.arrayBuffer();
    const loadedZip = await JSZip.loadAsync(buffer);
    const filenames = Object.keys(loadedZip.files);

    expect(filenames).toContain('Solaris.md');
    expect(filenames).toContain('Solaris (2).md');
    expect(filenames).toContain('Ice.md');
    expect(filenames).toHaveLength(3);

    // Verify individual files have complete markdown note contents
    const solarisText = await loadedZip.file('Solaris.md')?.async('string');
    expect(solarisText).toContain('title: "Solaris"');
  });
});

describe('Goodreads Public RSS Lookup & Parser (B-02)', () => {
  it('extracts Goodreads user IDs from all supported input patterns', () => {
    expect(extractGoodreadsUserId('137464693')).toBe('137464693');
    expect(extractGoodreadsUserId('  137464693  ')).toBe('137464693');
    expect(extractGoodreadsUserId('137464693-murat')).toBe('137464693');
    expect(
      extractGoodreadsUserId('https://www.goodreads.com/user/show/137464693-murat')
    ).toBe('137464693');
    expect(
      extractGoodreadsUserId('https://www.goodreads.com/user/show/137464693?ref=nav_profile_l')
    ).toBe('137464693');
    expect(
      extractGoodreadsUserId('https://www.goodreads.com/review/list/137464693-murat?shelf=read')
    ).toBe('137464693');
    expect(
      extractGoodreadsUserId('https://www.goodreads.com/review/list_rss/137464693?shelf=read')
    ).toBe('137464693');
    expect(extractGoodreadsUserId('not-a-valid-url-or-id')).toBe(null);
    expect(extractGoodreadsUserId('')).toBe(null);
    expect(extractGoodreadsUserId(null)).toBe(null);
  });

  it('extracts XML tags and unescapes CDATA and HTML entities in pure Node environment', () => {
    const sampleXml = `
      <title><![CDATA[Dune &amp; Messiah &quot;Special&quot;]]></title>
      <user_rating>5</user_rating>
      <empty_tag></empty_tag>
    `;
    expect(extractXmlTag(sampleXml, 'title')).toBe('Dune & Messiah "Special"');
    expect(extractXmlTag(sampleXml, 'user_rating')).toBe('5');
    expect(extractXmlTag(sampleXml, 'empty_tag')).toBe(null);
    expect(extractXmlTag(sampleXml, 'missing_tag')).toBe(null);
  });

  it('parses RFC-2822 dates into standard ISO dates', () => {
    expect(parseRssDate('Fri, 02 Jan 2026 00:00:00 -0800')).toBe('2026-01-02');
    expect(parseRssDate('2025/12/22')).toBe('2025-12-22');
    expect(parseRssDate('2025-12-22')).toBe('2025-12-22');
    expect(parseRssDate('(not provided)')).toBe(null);
    expect(parseRssDate('')).toBe(null);
    expect(parseRssDate(null)).toBe(null);
  });

  it('parses Goodreads RSS XML into books, enrichment cache, and channel profile name', () => {
    const mockRssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[Murat's bookshelf: read]]></title>
    <link><![CDATA[https://www.goodreads.com/review/list/137464693]]></link>
    <item>
      <book_id><![CDATA[44767458]]></book_id>
      <title><![CDATA[Dune (Dune, #1)]]></title>
      <author_name><![CDATA[Frank Herbert]]></author_name>
      <isbn><![CDATA[059309932X]]></isbn>
      <num_pages><![CDATA[658]]></num_pages>
      <book_published><![CDATA[1965]]></book_published>
      <user_rating><![CDATA[5]]></user_rating>
      <average_rating><![CDATA[4.27]]></average_rating>
      <user_read_at><![CDATA[Fri, 02 Jan 2026 00:00:00 -0800]]></user_read_at>
      <user_date_added><![CDATA[Mon, 22 Dec 2025 00:00:00 -0800]]></user_date_added>
      <user_shelves><![CDATA[favorites, read]]></user_shelves>
      <user_review><![CDATA[Remarkable worldbuilding.]]></user_review>
      <book_large_image_url><![CDATA[https://images.gr-assets.com/books/1555447414l/44767458.jpg]]></book_large_image_url>
      <book_description><![CDATA[Set on the desert planet Arrakis...]]></book_description>
    </item>
    <item>
      <book_id><![CDATA[24832616]]></book_id>
      <title><![CDATA[Sil Baştan]]></title>
      <author_name><![CDATA[Ken Grimwood]]></author_name>
      <isbn13><![CDATA[9786054188239]]></isbn13>
      <num_pages><![CDATA[370]]></num_pages>
      <book_published><![CDATA[1987]]></book_published>
      <user_rating><![CDATA[0]]></user_rating>
      <average_rating><![CDATA[4.18]]></average_rating>
      <user_shelves><![CDATA[read]]></user_shelves>
      <book_large_image_url><![CDATA[https://s.gr-assets.com/assets/nophoto/book/111x148.png]]></book_large_image_url>
    </item>
  </channel>
</rss>`;

    const { books, enrichment, profileName } = parseGoodreadsRssXml(mockRssXml, 'read');

    expect(profileName).toBe('Murat');
    expect(books).toHaveLength(2);

    // Book 1 checks
    const dune = books[0];
    expect(dune.id).toBe('44767458');
    expect(dune.cleanTitle).toBe('Dune');
    expect(dune.seriesName).toBe('Dune');
    expect(dune.seriesNumber).toBe('1');
    expect(dune.author).toBe('Frank Herbert');
    expect(dune.isbn).toBe('059309932X');
    expect(dune.pageCount).toBe(658);
    expect(dune.yearPublished).toBe(1965);
    expect(dune.myRating).toBe(5);
    expect(dune.averageRating).toBe(4.27);
    expect(dune.dateRead).toBe('2026-01-02');
    expect(dune.dateAdded).toBe('2025-12-22');
    expect(dune.exclusiveShelf).toBe('read');
    expect(dune.bookshelves).toContain('favorites');
    expect(dune.myReview).toBe('Remarkable worldbuilding.');

    // Enrichment checks for Book 1
    const duneEnrichment = enrichment['44767458'];
    expect(duneEnrichment).toBeDefined();
    expect(duneEnrichment.communityRating).toBe(4.27);
    expect(duneEnrichment.coverUrl).toBe('https://images.gr-assets.com/books/1555447414l/44767458.jpg');
    expect(duneEnrichment.synopsis).toBe('Set on the desert planet Arrakis...');

    // Book 2 checks (user_rating = 0 -> maps to null; nophoto cover -> ignored)
    const sil = books[1];
    expect(sil.id).toBe('24832616');
    expect(sil.isbn13).toBe('9786054188239');
    expect(sil.myRating).toBe(null); // STRICT: 0 rating -> null
    expect(sil.averageRating).toBe(4.18);

    const silEnrichment = enrichment['24832616'];
    expect(silEnrichment).toBeDefined();
    expect(silEnrichment.coverUrl).toBe(null); // nophoto filtered out
    expect(silEnrichment.communityRating).toBe(4.18);
  });
});
