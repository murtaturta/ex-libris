import { describe, it, expect } from 'vitest';
import type { Book, LibraryBundle, RecommendationItem } from '../src/types/library';
import {
  isKindleNotebookHtml,
  parseKindleNotebookHtml,
} from '../src/lib/parsers/kindleHtml';
import {
  buildLibraryDedupeIndex,
  isTitleAlreadyInLibrary,
  isJunkEditionTitle,
  extractDsarCollaborativeDiscovery,
  loadCachedExternalDiscovery,
  saveCachedExternalDiscovery,
  MEGA_CANONICAL_BLOCKLIST,
} from '../src/lib/discovery/externalDiscovery';

describe('Kindle Notebook HTML Parser (Silas Upgrade)', () => {
  const libraryBooks: Book[] = [
    {
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
      myReview: null,
      spoiler: false,
      privateNotes: null,
      shelving: null,
      reviewDetails: null,
      readingSessions: [],
      kindleNotes: [],
      recommendations: [],
    },
  ];

  const sampleStandardHtml = `<!DOCTYPE html>
<html>
<head><title>Kindle Notebook</title></head>
<body>
<div class="bodyContainer">
  <div class="notebookFor">Notes and Highlights for</div>
  <div class="bookTitle">Dune (Dune, #1)</div>
  <div class="authors">Frank Herbert</div>
  <hr/>
  <div class="sectionHeading">Chapter 1: The Gom Jabbar</div>
  <div class="noteHeading">
    <span class="highlight_yellow">Highlight (yellow)</span> - Page 42 · Location 512
  </div>
  <div class="noteText">A beginning is the time for taking the most delicate care that the balances are correct.</div>
  <div class="noteHeading">
    Note - Page 42 · Location 513
  </div>
  <div class="noteText">Irulan's opening meditation.</div>

  <div class="sectionHeading">Chapter 2: Arrakis</div>
  <div class="noteHeading">
    <span class="highlight_blue">Highlight (blue)</span> - Location 1024
  </div>
  <div class="noteText">I must not fear. Fear is the mind-killer.</div>
</div>
</body>
</html>`;

  it('detects Kindle Notebook HTML exports accurately', () => {
    expect(isKindleNotebookHtml(sampleStandardHtml, 'Dune - Notebook.html')).toBe(true);
    expect(isKindleNotebookHtml(sampleStandardHtml)).toBe(true);
    expect(isKindleNotebookHtml('<html><body>Plain page</body></html>', 'index.html')).toBe(false);
    expect(isKindleNotebookHtml('', 'empty.html')).toBe(false);
  });

  it('parses standard Kindle HTML exports with chapter headings, color taxonomy, and paired notes', () => {
    const parsed = parseKindleNotebookHtml(sampleStandardHtml, libraryBooks);

    expect(parsed.matchedBooksCount).toBe(1);
    expect(parsed.chaptersFound).toBe(2);
    expect(parsed.colorCounts.yellow).toBe(1);
    expect(parsed.colorCounts.blue).toBe(1);

    // 2 highlights extracted (the note was paired onto the first highlight!)
    expect(parsed.clippings).toHaveLength(2);

    const first = parsed.clippings[0];
    expect(first.cleanTitle).toBe('Dune');
    expect(first.matchedBookId).toBe('44767458');
    expect(first.chapter).toBe('Chapter 1: The Gom Jabbar');
    expect(first.highlightColor).toBe('yellow');
    expect(first.page).toBe(42);
    expect(first.locationStart).toBe(512);
    expect(first.content).toBe(
      'A beginning is the time for taking the most delicate care that the balances are correct.'
    );
    expect(first.attachedNote).toBe("Irulan's opening meditation.");
    expect(first.sourceFormat).toBe('notebook-html');

    const second = parsed.clippings[1];
    expect(second.chapter).toBe('Chapter 2: Arrakis');
    expect(second.highlightColor).toBe('blue');
    expect(second.locationStart).toBe(1024);
    expect(second.content).toBe('I must not fear. Fear is the mind-killer.');
    expect(second.attachedNote).toBeUndefined();
  });

  it('parses Amazon Cloud Web Reader export markup (read.amazon.com/notebook)', () => {
    const webReaderHtml = `<div id="kp-notebook-annotations">
      <h2 id="kp-notebook-title">Dune</h2>
      <p id="kp-notebook-author">Frank Herbert</p>
      <div class="kp-notebook-section-heading">Introduction</div>
      <div class="kp-notebook-highlight">
        <span id="annotationHighlightHeader">Yellow highlight | Location: 200</span>
        <span id="highlight">Deep in the human unconscious is a pervasive need for a logical universe.</span>
      </div>
      <div class="kp-notebook-note">
        <span id="annotationNoteHeader">Note | Location: 201</span>
        <span id="note">Paul's internal realization.</span>
      </div>
    </div>`;

    const parsed = parseKindleNotebookHtml(webReaderHtml, libraryBooks);
    expect(parsed.matchedBooksCount).toBe(1);
    expect(parsed.clippings).toHaveLength(1);
    expect(parsed.clippings[0].chapter).toBe('Introduction');
    expect(parsed.clippings[0].highlightColor).toBe('yellow');
    expect(parsed.clippings[0].locationStart).toBe(200);
    expect(parsed.clippings[0].attachedNote).toBe("Paul's internal realization.");
  });
});

describe('3-Engine External Discovery Pipeline (Core Build)', () => {
  const sampleBooks: Book[] = [
    {
      id: '24832616',
      title: 'Sil Baştan',
      cleanTitle: 'Sil Baştan',
      seriesName: null,
      seriesNumber: null,
      author: 'Ken Grimwood',
      authorSort: 'Grimwood, Ken',
      additionalAuthors: [],
      isbn: '6054188232',
      isbn13: '9786054188239',
      myRating: 5,
      averageRating: 4.15,
      publisher: 'Koridor',
      binding: 'Paperback',
      pageCount: 370,
      yearPublished: 2010,
      originalPublicationYear: 1987,
      dateRead: '2026-10-25',
      dateAdded: '2026-10-25',
      exclusiveShelf: 'read',
      bookshelves: ['favorites'],
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
    },
    {
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
      myReview: null,
      spoiler: false,
      privateNotes: null,
      shelving: null,
      reviewDetails: null,
      readingSessions: [],
      kindleNotes: [],
      recommendations: [],
    },
  ];

  const sampleRecs: RecommendationItem[] = [
    {
      source: 'goodreads',
      sourceBookId: '44767458',
      sourceBookTitle: 'Dune',
      recommendedTitle: 'Hyperion',
      shelf: 'read',
      status: 'active',
      rank: 1,
      updatedAt: '2026-10-29',
    },
    {
      source: 'goodreads',
      sourceBookId: '24832616',
      sourceBookTitle: 'Sil Baştan',
      recommendedTitle: 'Hyperion', // Co-recommended by both Dune & Sil Baştan!
      shelf: 'read',
      status: 'active',
      rank: 2,
      updatedAt: '2026-10-29',
    },
    {
      source: 'goodreads',
      sourceBookId: '44767458',
      sourceBookTitle: 'Dune',
      recommendedTitle: 'Dune (Dune, #1)', // Already on shelf -> must be filtered out!
      shelf: 'read',
      status: 'active',
      rank: 3,
      updatedAt: '2026-10-29',
    },
    {
      source: 'goodreads',
      sourceBookId: '44767458',
      sourceBookTitle: 'Dune',
      recommendedTitle: 'Dune 3-Book Box Set', // Junk edition -> must be filtered out!
      shelf: 'read',
      status: 'active',
      rank: 4,
      updatedAt: '2026-10-29',
    },
  ];

  const bundle: LibraryBundle = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-10-29',
    summaryStats: {} as any,
    books: sampleBooks,
    quotes: [],
    kindleNotes: [],
    recommendations: sampleRecs,
    readingGoals: [],
    achievements: [],
    followedAuthors: [],
    favoriteGenres: null,
    reviewDrafts: [],
    activityByHour: null,
    suggestedLists: [],
  };

  it('builds library deduplication index and prevents recommending already-read books', () => {
    const index = buildLibraryDedupeIndex(bundle);

    // Direct library matches
    expect(isTitleAlreadyInLibrary('Dune', 'Frank Herbert', index)).toBe(true);
    expect(isTitleAlreadyInLibrary('Dune: Special Collector Edition', 'Frank Herbert', index)).toBe(
      true
    );

    // Cross-lingual canonical translation: Sil Baştan is Ken Grimwood's Replay!
    expect(isTitleAlreadyInLibrary('Replay', 'Ken Grimwood', index)).toBe(true);

    // Unread book
    expect(isTitleAlreadyInLibrary('Children of Dune', 'Frank Herbert', index)).toBe(false);
    expect(isTitleAlreadyInLibrary('Hyperion', 'Dan Simmons', index)).toBe(false);
  });

  it('filters out catalog junk editions (box sets, study guides, sparknotes)', () => {
    expect(isJunkEditionTitle('Dune 3-Book Box Set')).toBe(true);
    expect(isJunkEditionTitle('Frank Herbert: Omnibus Collection')).toBe(true);
    expect(isJunkEditionTitle('Dune: A Study Guide for Literature Students')).toBe(true);
    expect(isJunkEditionTitle('SparkNotes: Dune')).toBe(true);
    expect(isJunkEditionTitle('Dune Coloring Book')).toBe(true);
    expect(isJunkEditionTitle('Dune Messiah')).toBe(false);
    expect(isJunkEditionTitle('Children of Dune')).toBe(false);
  });

  it('extracts, deduplicates, and stacks collaborative DSAR graph recommendations (Engine 3)', () => {
    const picks = extractDsarCollaborativeDiscovery(bundle);

    // Hyperion should be the single top pick (co-recommended by 2 books)
    expect(picks).toHaveLength(1);
    const hyperion = picks[0];
    expect(hyperion.title).toBe('Hyperion');
    expect(hyperion.engine).toBe('dsar-graph');
    expect(hyperion.provenance).toContain('Dune');
    expect(hyperion.provenance).toContain('+ 1 other');
    expect(hyperion.score).toBeGreaterThan(100); // boosted by 2x active 5★ sources
  });

  it('suppresses mega-canonical high-school staples in Subject DNA blocklist', () => {
    expect(MEGA_CANONICAL_BLOCKLIST.has('1984')).toBe(true);
    expect(MEGA_CANONICAL_BLOCKLIST.has('animal farm')).toBe(true);
    expect(MEGA_CANONICAL_BLOCKLIST.has('brave new world')).toBe(true);
    expect(MEGA_CANONICAL_BLOCKLIST.has('the great gatsby')).toBe(true);
    expect(MEGA_CANONICAL_BLOCKLIST.has('hyperion')).toBe(false);
    expect(MEGA_CANONICAL_BLOCKLIST.has('neuromancer')).toBe(false);
  });

  it('persists and restores external discovery state to localStorage', () => {
    const samplePicks = [
      {
        id: 'pick-1',
        engine: 'author-backlist' as const,
        title: 'Children of Dune',
        author: 'Frank Herbert',
        yearPublished: 1976,
        pageCount: 444,
        communityRating: 4.12,
        ratingsCount: 200000,
        subjects: ['Science Fiction'],
        synopsis: 'Third book of the Dune Chronicles...',
        coverUrl: null,
        provenance: 'Missing Sequel · Dune #3',
        reasons: ['Sequel to Dune (5★)'],
        score: 85,
      },
    ];

    saveCachedExternalDiscovery({
      authorBacklist: samplePicks,
      subjectDna: [],
    });

    const loaded = loadCachedExternalDiscovery();
    expect(loaded.fetchedAt).toBeDefined();
    expect(loaded.authorBacklist).toHaveLength(1);
    expect(loaded.authorBacklist[0].title).toBe('Children of Dune');
  });
});
