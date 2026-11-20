import { describe, it, expect } from 'vitest';
import { parseKindleClippings } from '../src/lib/parsers/kindleClippings';
import { isKindleSyncJson, parseKindleSyncJson } from '../src/lib/parsers/kindleSyncJson';
import { computeClippingsImportDiff } from '../src/lib/parsers/importDiffAuditor';
import type { Book } from '../src/types/library';

function makeBook(overrides: Partial<Book>): Book {
  return {
    id: 'bk_default',
    title: 'Sample Book',
    cleanTitle: 'Sample Book',
    seriesName: null,
    seriesNumber: null,
    author: 'Author',
    authorSort: null,
    additionalAuthors: [],
    isbn: null,
    isbn13: null,
    myRating: null,
    averageRating: null,
    publisher: null,
    binding: null,
    pageCount: null,
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
    ...overrides,
  };
}

const SAMPLE_BOOKS: Book[] = [
  makeBook({
    id: 'bk_hunger',
    title: 'The Hunger Games (The Hunger Games, #1)',
    cleanTitle: 'The Hunger Games',
    seriesName: 'The Hunger Games',
    seriesNumber: '1',
    author: 'Suzanne Collins',
    myRating: 5,
    averageRating: 4.34,
    pageCount: 374,
    yearPublished: 2008,
    originalPublicationYear: 2008,
    exclusiveShelf: 'read',
    readCount: 1,
  }),
  makeBook({
    id: 'bk_wgt',
    title: 'Who Goes There?',
    cleanTitle: 'Who Goes There?',
    author: 'John W. Campbell Jr.',
    averageRating: 4.1,
    pageCount: 100,
    yearPublished: 1938,
    originalPublicationYear: 1938,
    exclusiveShelf: 'currently-reading',
    readCount: 0,
  }),
];

describe('Kindle Clippings Deduplication & KSDK Sync JSON Importer', () => {
  it('collapses Kindle keystroke typing bursts on notes down to the final note', () => {
    const raw = [
      'The Hunger Games (Suzanne Collins)',
      '- Your Highlight on page 55 | Location 680-681 | Added on Monday, December 8, 2025 11:57:00 AM',
      '',
      '“Yes, this is my first year in the Games,” says Cinna.',
      '==========',
      'The Hunger Games (Suzanne Collins)',
      '- Your Note on page 55 | Location 681 | Added on Monday, December 8, 2025 11:57:41 AM',
      '',
      'th',
      '==========',
      'The Hunger Games (Suzanne Collins)',
      '- Your Note on page 55 | Location 681 | Added on Monday, December 8, 2025 11:57:49 AM',
      '',
      'the opportunity wa',
      '==========',
      'The Hunger Games (Suzanne Collins)',
      '- Your Note on page 55 | Location 681 | Added on Monday, December 8, 2025 11:58:11 AM',
      '',
      '"Me too!" lmao',
      '==========',
    ].join('\n');

    const parsed = parseKindleClippings(raw, SAMPLE_BOOKS);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].matchedBookId).toBe('bk_hunger');
    expect(parsed[0].attachedNote).toBe('"Me too!" lmao');
  });

  it('handles single-line merged title + note header', () => {
    const raw = [
      'Ioren 26-11-02 - Your Note on page 10 | Location 104 | Added on Wednesday, February 11, 2026 5:43:51 AM',
      '',
      'Sharp pacing here.',
      '==========',
    ].join('\n');

    const parsed = parseKindleClippings(raw, SAMPLE_BOOKS);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].cleanTitle).toBe('Ioren 26-11-02');
    expect(parsed[0].type).toBe('note');
    expect(parsed[0].locationStart).toBe(104);
    expect(parsed[0].content).toBe('Sharp pacing here.');
  });

  it('detects, parses, matches, and diffs ex-libris-kindle-sync-v1 JSON bundles', () => {
    const syncJson = JSON.stringify({
      format: 'ex-libris-kindle-sync-v1',
      syncedAt: '2026-11-17T14:30:00.000Z',
      clippings: [
        {
          id: 'ksdk_T4ZV_98549_98678',
          rawTitle: 'Who Goes There',
          cleanTitle: 'Who Goes There?',
          author: 'John W. Campbell Jr.',
          type: 'highlight',
          page: null,
          locationStart: 98549,
          locationEnd: 98678,
          addedAt: '2026-11-17T07:18:16.000Z',
          content: "The flickers bulged and twisted on the back of Barclay's gray underwear.",
          attachedNote: 'xd',
          highlightColor: 'yellow',
          sourceFormat: 'ksdk-sync',
        },
      ],
    });

    expect(isKindleSyncJson(syncJson)).toBe(true);
    expect(isKindleSyncJson('{"history": {}}')).toBe(false);

    const clippings = parseKindleSyncJson(syncJson, SAMPLE_BOOKS);
    expect(clippings).toHaveLength(1);
    expect(clippings[0].matchedBookId).toBe('bk_wgt');
    expect(clippings[0].attachedNote).toBe('xd');
    expect(clippings[0].sourceFormat).toBe('ksdk-sync');

    const diff = computeClippingsImportDiff([], clippings);
    expect(diff.sourceFormat).toBe('ksdk-sync');
    expect(diff.newClippingsCount).toBe(1);
    expect(diff.matchedBooksCount).toBe(1);
  });
});
