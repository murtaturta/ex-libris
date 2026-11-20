import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { Book, FilmEnrichmentCacheMap, UserLocalState } from '../src/types/library';
import {
  importLetterboxdZip,
  parseLetterboxdExport,
  parseLetterboxdListCsv,
} from '../src/lib/parsers/letterboxdParser';
import {
  buildCombinedObsidianVaultFiles,
  buildLetterboxdVaultFiles,
  normalizeFilmRecords,
} from '../src/lib/exporters/letterboxdVaultExporter';

function makeBook(overrides: Partial<Book>): Book {
  return {
    id: 'b-1',
    title: 'Dune',
    cleanTitle: 'Dune',
    seriesName: null,
    seriesNumber: null,
    author: 'Frank Herbert',
    authorSort: null,
    additionalAuthors: [],
    isbn: null,
    isbn13: null,
    myRating: 5,
    averageRating: 4.3,
    publisher: null,
    binding: null,
    pageCount: 688,
    yearPublished: 1965,
    originalPublicationYear: 1965,
    dateRead: '2024-01-10',
    dateAdded: '2024-01-01',
    exclusiveShelf: 'read',
    bookshelves: ['read'],
    bookshelvesWithPositions: null,
    readCount: 1,
    ownedCopies: 1,
    myReview: null,
    spoiler: false,
    privateNotes: null,
    shelving: null,
    reviewDetails: null,
    readingSessions: [],
    kindleNotes: [],
    recommendations: [],
    ...overrides,
  };
}

describe('Letterboxd RFC-4180 parser & ZIP handling', () => {
  it('parses multi-line quoted reviews without corrupting into bogus film rows', () => {
    const reviewsCsv = [
      'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date',
      '2025-11-12,One Battle After Another,2025,https://boxd.it/abc,4,No,"Opening sequence works well\n\nonly for the first ten minutes.\nThen it slows down.",theater,2025-11-10',
    ].join('\n');

    const parsed = parseLetterboxdExport({ reviewsCsv });
    expect(parsed.watches).toHaveLength(1);
    expect(parsed.watches[0].name).toBe('One Battle After Another');
    expect(parsed.watches[0].review).toContain('only for the first ten minutes.');
    expect(parsed.watches[0].tags).toEqual(['theater']);
  });

  it('parses likes/films.csv and Letterboxd v7 lists/*.csv cleanly', () => {
    const watchedCsv = [
      'Date,Name,Year,Letterboxd URI',
      '2024-05-01,Dune,2021,https://boxd.it/dune21',
    ].join('\n');

    const likesFilmsCsv = [
      'Date,Name,Year,Letterboxd URI',
      '2024-05-01,Dune,2021,https://boxd.it/dune21',
    ].join('\n');

    const listCsv = [
      'Date,Name,Tags,URL,Description',
      '2025-01-01,The Gift of Prophecy,,https://boxd.it/list1,Prophecy anthology',
      '',
      'Position,Name,Year,URL,Description',
      '1,Dune,2021,https://boxd.it/dune21,',
    ].join('\n');

    const singleList = parseLetterboxdListCsv(listCsv);
    expect(singleList?.name).toBe('The Gift of Prophecy');
    expect(singleList?.films).toHaveLength(1);

    const parsed = parseLetterboxdExport({
      watchedCsv,
      likesFilmsCsv,
      listCsvs: [listCsv],
    });
    expect(parsed.watches[0].liked).toBe(true);
    expect(parsed.watches[0].lists).toEqual(['The Gift of Prophecy']);
    expect(parsed.likedFilms).toEqual(['dune (2021)']);
  });

  it('skips deleted/ and orphaned/ folders when importing a Letterboxd ZIP archive', async () => {
    const zip = new JSZip();
    zip.file(
      'watched.csv',
      'Date,Name,Year,Letterboxd URI\n2024-05-01,Interstellar,2014,https://boxd.it/inter\n'
    );
    zip.file(
      'deleted/diary.csv',
      'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2020-01-01,Deleted Movie,2019,https://boxd.it/del,1,No,,2020-01-01\n'
    );
    zip.file(
      'orphaned/reviews.csv',
      'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n2020-01-01,Orphaned Movie,2018,https://boxd.it/orp,2,No,Orphan note,,2020-01-01\n'
    );
    zip.file(
      'likes/films.csv',
      'Date,Name,Year,Letterboxd URI\n2024-05-01,Interstellar,2014,https://boxd.it/inter\n'
    );

    const blob = await zip.generateAsync({ type: 'blob' });
    const parsed = await importLetterboxdZip(blob as unknown as File);

    expect(parsed.watches.map((w) => w.name)).toEqual(['Interstellar']);
    expect(parsed.watches[0].liked).toBe(true);
  });
});

describe('Letterboxd Cinema Obsidian Vault Exporter', () => {
  const sampleData = parseLetterboxdExport({
    diaryCsv: [
      'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date',
      '2024-02-01,Interstellar,2014,https://boxd.it/inter,4.5,No,imax,2024-02-01',
      '2025-10-15,Interstellar,2014,https://boxd.it/inter,5,Yes,imax,2025-10-15',
      '2024-06-01,The Tell-Tale Heart,2008,https://boxd.it/tth08,3.5,No,,2024-06-01',
      '2025-01-12,Dune,2021,https://boxd.it/dune21,4.5,No,,2025-01-12',
    ].join('\n'),
    reviewsCsv: [
      'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date',
      '2025-10-16,Interstellar,2014,https://boxd.it/inter,5,Yes,"Docking scene holds up.",imax,2025-10-15',
    ].join('\n'),
    watchlistCsv: [
      'Date,Name,Year,Letterboxd URI',
      '2025-08-01,The Tell-Tale Heart,2022,https://boxd.it/tth22',
      '2025-09-01,Arrival,2016,https://boxd.it/arr',
    ].join('\n'),
    likesFilmsCsv: [
      'Date,Name,Year,Letterboxd URI',
      '2025-10-15,Interstellar,2014,https://boxd.it/inter',
    ].join('\n'),
  });

  const filmCache: FilmEnrichmentCacheMap = {
    'interstellar (2014)': {
      key: 'interstellar (2014)',
      title: 'Interstellar',
      year: 2014,
      directors: ['Christopher Nolan'],
      imdbId: 'tt0816692',
      source: 'wikidata',
      fetchedAt: '2026-11-19T00:00:00Z',
    },
    'dune (2021)': {
      key: 'dune (2021)',
      title: 'Dune',
      year: 2021,
      directors: ['Denis Villeneuve'],
      imdbId: 'tt1160419',
      source: 'wikidata',
      fetchedAt: '2026-11-19T00:00:00Z',
    },
    'arrival (2016)': {
      key: 'arrival (2016)',
      title: 'Arrival',
      year: 2016,
      directors: ['Denis Villeneuve'],
      imdbId: 'tt2543164',
      source: 'wikidata',
      fetchedAt: '2026-11-19T00:00:00Z',
    },
  };

  it('consolidates rewatches into 1 unique Year-stamped film note & differentiates remakes', () => {
    const normalized = normalizeFilmRecords(sampleData, filmCache);
    expect(normalized).toHaveLength(5);

    const files = buildLetterboxdVaultFiles(sampleData, {
      scope: 'all',
      includeDirectors: true,
      filmEnrichmentCache: filmCache,
    });

    // Multi-watch consolidation
    const interstellarMd = files.get('Cinema/Films/Interstellar (2014).md');
    expect(interstellarMd).toBeTruthy();
    expect(interstellarMd).toContain('### 2025-10-15 (Rewatch · ★★★★★)');
    expect(interstellarMd).toContain('Docking scene holds up.');
    expect(interstellarMd).toContain('**2024-02-01** — Watched · ★★★★½');

    // Remakes kept distinct
    expect(files.has('Cinema/Films/The Tell-Tale Heart (2008).md')).toBe(true);
    expect(files.has('Cinema/Films/The Tell-Tale Heart (2022).md')).toBe(true);

    // Director hub links films chronologically & omits Unknown Director catch-all
    const villeneuveMd = files.get('Cinema/Directors/Denis Villeneuve.md');
    expect(villeneuveMd).toBeTruthy();
    expect(villeneuveMd).toContain('[[Arrival (2016)|Arrival]]');
    expect(villeneuveMd).toContain('[[Dune (2021)|Dune]]');
    expect(villeneuveMd!.indexOf('Arrival (2016)')).toBeLessThan(villeneuveMd!.indexOf('Dune (2021)'));

    expect(Array.from(files.keys()).some((k) => k.toLowerCase().includes('unknown'))).toBe(false);
    expect(Array.from(files.keys()).some((k) => k.endsWith('Index.md'))).toBe(false);
  });

  it('respects watched and annotated scope filters plus includeDirectors: false', () => {
    const watchedOnly = buildLetterboxdVaultFiles(sampleData, {
      scope: 'watched',
      includeDirectors: true,
      filmEnrichmentCache: filmCache,
    });
    expect(watchedOnly.has('Cinema/Films/Arrival (2016).md')).toBe(false);
    expect(watchedOnly.get('Cinema/Directors/Denis Villeneuve.md')).not.toContain('Arrival (2016)');

    const annotatedOnly = buildLetterboxdVaultFiles(sampleData, {
      scope: 'annotated',
      includeDirectors: false,
      filmEnrichmentCache: filmCache,
    });
    expect(Array.from(annotatedOnly.keys())).toEqual(['Cinema/Films/Interstellar (2014).md']);
    // When includeDirectors is false, no Directors folder and no dangling [[Christopher Nolan]] links
    expect(annotatedOnly.get('Cinema/Films/Interstellar (2014).md')).not.toContain('[[Christopher Nolan]]');
    expect(annotatedOnly.get('Cinema/Films/Interstellar (2014).md')).toContain('Christopher Nolan');
  });

  it('exports combined Books + Cinema vault with collision-free director/author hubs and Book <-> Film wikilinks', () => {
    const books: Book[] = [
      makeBook({ id: 'b-dune', title: 'Dune', cleanTitle: 'Dune', author: 'Frank Herbert' }),
      makeBook({ id: 'b-antkind', title: 'Antkind', cleanTitle: 'Antkind', author: 'Charlie Kaufman' }),
    ];

    const hybridData = parseLetterboxdExport({
      watchedCsv: [
        'Date,Name,Year,Letterboxd URI',
        '2025-01-12,Dune,2021,https://boxd.it/dune21',
        "2024-04-10,I'm Thinking of Ending Things,2020,https://boxd.it/itoe",
      ].join('\n'),
    });

    const userState: UserLocalState = {
      version: '0.2.0',
      updatedAt: '2026-11-19T00:00:00Z',
      showCovers: false,
      bookOverrides: {},
      kindleClippings: [],
      letterboxdData: hybridData,
    };

    const cacheWithAuthorDirector: FilmEnrichmentCacheMap = {
      'dune (2021)': filmCache['dune (2021)'],
      "i'm thinking of ending things (2020)": {
        key: "i'm thinking of ending things (2020)",
        title: "I'm Thinking of Ending Things",
        year: 2020,
        directors: ['Charlie Kaufman'],
        source: 'wikidata',
        fetchedAt: '2026-11-19T00:00:00Z',
      },
    };

    const combined = buildCombinedObsidianVaultFiles(books, userState, {}, {
      bookScope: 'all',
      cinemaScope: 'all',
      includeDirectors: true,
      filmEnrichmentCache: cacheWithAuthorDirector,
    });

    // Book author & film director collide -> Director gets disambiguated hub
    expect(combined.has('Ex Libris/Authors/Charlie Kaufman.md')).toBe(true);
    expect(combined.has('Cinema/Directors/Charlie Kaufman (Director).md')).toBe(true);
    expect(combined.get("Cinema/Films/I'm Thinking of Ending Things (2020).md")).toContain(
      '[[Charlie Kaufman (Director)|Charlie Kaufman]]'
    );

    // Adaptation wikilink between Dune (2021) film note and Dune book note
    const duneFilm = combined.get('Cinema/Films/Dune (2021).md');
    expect(duneFilm).toContain('[[Dune]]');
    expect(duneFilm).toContain('## Literary Source');
  });
});
