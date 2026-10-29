import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

import {
  classifyBookLanguageAndFormat,
  LANGUAGE_LABELS,
  FORMAT_LABELS,
} from '../src/lib/classifiers/languageAndFormat';

import {
  parseKindleClippings,
  SAMPLE_KINDLE_CLIPPINGS_TXT,
} from '../src/lib/parsers/kindleClippings';

import {
  getOracleCandidates,
  computeFormatVelocity,
  computeNightstandDiagnostics,
  computeLanguagePassportMetrics,
  computeContrarianMetrics,
} from '../src/lib/analytics/engine';

import type { Book, LibraryBundle, UserLocalState, EnrichmentCacheMap } from '../src/types/library';

describe('v0.2 Pipeline Suite', () => {
  const bundlePath = path.resolve(__dirname, '../public/data/library_bundle.json');
  let bundle: LibraryBundle;

  try {
    const raw = fs.readFileSync(bundlePath, 'utf-8').replace(/^\uFEFF/, '');
    bundle = JSON.parse(raw) as LibraryBundle;
  } catch {
    bundle = {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      summaryStats: {} as any,
      books: [],
      quotes: [],
      kindleNotes: [],
      recommendations: [],
      readingGoals: [],
      achievements: [],
      followedAuthors: [],
      favoriteGenres: null,
      reviewDrafts: [],
      activityByHour: null,
      suggestedLists: [],
    };
  }

  const baseBook: Book = {
    id: 'test-1',
    title: 'Test Book',
    cleanTitle: 'Test Book',
    seriesName: null,
    seriesNumber: null,
    author: 'Unknown Author',
    authorSort: null,
    additionalAuthors: [],
    isbn: null,
    isbn13: null,
    myRating: null,
    averageRating: null,
    publisher: null,
    binding: 'Paperback',
    pageCount: 250,
    yearPublished: 2020,
    originalPublicationYear: 2020,
    dateRead: null,
    dateAdded: '2023-01-01',
    exclusiveShelf: 'to-read',
    bookshelves: [],
    bookshelvesWithPositions: null,
    readCount: 0,
    ownedCopies: 1,
    myReview: null,
    spoiler: false,
    privateNotes: null,
    shelving: null,
    reviewDetails: null,
    readingSessions: [],
    kindleNotes: [],
    recommendations: [],
  };

  describe('1. Language & Format Classifier', () => {
    it('exports complete label maps for all LanguageCodes and BookFormats', () => {
      expect(LANGUAGE_LABELS.EN).toBe('English');
      expect(LANGUAGE_LABELS.TR).toBe('Turkish');
      expect(LANGUAGE_LABELS.FR).toBe('French');
      expect(LANGUAGE_LABELS.JA).toBe('Japanese');
      expect(FORMAT_LABELS.prose).toBe('Prose');
      expect(FORMAT_LABELS['comic-manga']).toBe('Comic / Manga');
      expect(FORMAT_LABELS['short-essay']).toBe('Short / Essay');
      expect(FORMAT_LABELS['academic-ref']).toBe('Academic / Reference');
    });

    it('classifies editionLanguage correctly by ISBN and publisher signals', () => {
      // Turkish ISBN
      const trBook: Book = { ...baseBook, isbn13: '9786051234567' };
      expect(classifyBookLanguageAndFormat(trBook).editionLanguage).toBe('TR');

      // French ISBN
      const frBook: Book = { ...baseBook, isbn13: '9782070360024', publisher: 'Gallimard' };
      expect(classifyBookLanguageAndFormat(frBook).editionLanguage).toBe('FR');

      // Edge cases: Metro 2034 with German Heyne publisher
      const deBook: Book = { ...baseBook, isbn13: '9783453533011', publisher: 'Heyne' };
      expect(classifyBookLanguageAndFormat(deBook).editionLanguage).toBe('DE');

      // Edge case: Death Stranding 2 with Edizioni BD
      const itBook: Book = { ...baseBook, isbn13: '9788834938287', publisher: 'Edizioni BD' };
      expect(classifyBookLanguageAndFormat(itBook).editionLanguage).toBe('IT');

      // Turkish publisher without ISBN
      const trPubBook: Book = { ...baseBook, isbn13: null, publisher: 'Yapı Kredi Yayınları' };
      expect(classifyBookLanguageAndFormat(trPubBook).editionLanguage).toBe('TR');

      // French title marker without ISBN
      const frTitleBook: Book = { ...baseBook, isbn13: null, title: 'La syntaxe du français' };
      expect(classifyBookLanguageAndFormat(frTitleBook).editionLanguage).toBe('FR');
    });

    it('classifies originalLanguage using the world literature author lookup map', () => {
      // Osamu Dazai -> JA
      const dazai: Book = { ...baseBook, author: 'Osamu Dazai' };
      const resDazai = classifyBookLanguageAndFormat(dazai);
      expect(resDazai.originalLanguage).toBe('JA');
      expect(resDazai.editionLanguage).toBe('EN');
      expect(resDazai.isTranslation).toBe(true);
      expect(resDazai.translationFlow).toBe('JA → EN');

      // Fyodor Dostoevsky -> RU
      const dostoevsky: Book = { ...baseBook, author: 'Fyodor Dostoevsky' };
      expect(classifyBookLanguageAndFormat(dostoevsky).originalLanguage).toBe('RU');

      // Franz Kafka -> DE
      const kafka: Book = { ...baseBook, author: 'Franz Kafka' };
      expect(classifyBookLanguageAndFormat(kafka).originalLanguage).toBe('DE');

      // Albert Camus -> FR
      const camus: Book = { ...baseBook, author: 'Albert Camus' };
      expect(classifyBookLanguageAndFormat(camus).originalLanguage).toBe('FR');

      // Plato -> GRC
      const plato: Book = { ...baseBook, author: 'Plato' };
      expect(classifyBookLanguageAndFormat(plato).originalLanguage).toBe('GRC');

      // Federico García Lorca -> ES
      const lorca: Book = { ...baseBook, author: 'Federico García Lorca' };
      expect(classifyBookLanguageAndFormat(lorca).originalLanguage).toBe('ES');

      // Ahmet Hamdi Tanpınar -> TR
      const tanpinar: Book = { ...baseBook, author: 'Ahmet Hamdi Tanpınar' };
      expect(classifyBookLanguageAndFormat(tanpinar).originalLanguage).toBe('TR');

      // Frank Herbert -> EN
      const herbert: Book = { ...baseBook, author: 'Frank Herbert' };
      const resHerbert = classifyBookLanguageAndFormat(herbert);
      expect(resHerbert.originalLanguage).toBe('EN');
      expect(resHerbert.editionLanguage).toBe('EN');
      expect(resHerbert.isTranslation).toBe(false);
      expect(resHerbert.translationFlow).toBe('EN · Original');
    });

    it('filters out illustrators and co-creators from translators list', () => {
      const bookWithTeam: Book = {
        ...baseBook,
        author: 'Osamu Dazai',
        additionalAuthors: ['Takeshi Obata', 'Donald Keene', 'Mary GrandPré'],
      };
      const res = classifyBookLanguageAndFormat(bookWithTeam);
      expect(res.isTranslation).toBe(true);
      expect(res.translators).toEqual(['Donald Keene']);
      expect(res.translators).not.toContain('Takeshi Obata');
      expect(res.translators).not.toContain('Mary GrandPré');
    });

    it('classifies book format based on keywords, bindings, and page count', () => {
      // Comic / Manga by publisher
      const manga: Book = { ...baseBook, title: 'Attack on Titan, Vol. 1', publisher: 'Kodansha' };
      expect(classifyBookLanguageAndFormat(manga).format).toBe('comic-manga');

      // Comic by binding
      const comic: Book = { ...baseBook, title: 'Watchmen', binding: 'Comic Book' };
      expect(classifyBookLanguageAndFormat(comic).format).toBe('comic-manga');

      // Academic / reference
      const academic: Book = { ...baseBook, title: 'Dilbilim ve Göstergebilim', publisher: 'YKY' };
      expect(classifyBookLanguageAndFormat(academic).format).toBe('academic-ref');

      // Short essay / story (<= 80 pages)
      const shortEssay: Book = { ...baseBook, title: 'The Tell-Tale Heart', pageCount: 48 };
      expect(classifyBookLanguageAndFormat(shortEssay).format).toBe('short-essay');

      // Standard prose
      const standardProse: Book = { ...baseBook, title: 'Dune', pageCount: 658 };
      expect(classifyBookLanguageAndFormat(standardProse).format).toBe('prose');
    });

    it('honors user overrides for editionLanguage, originalLanguage, and format', () => {
      const overrideBook: Book = { ...baseBook, author: 'Frank Herbert', pageCount: 500 };
      const res = classifyBookLanguageAndFormat(overrideBook, {
        editionLanguageOverride: 'TR',
        originalLanguageOverride: 'DE',
        formatOverride: 'academic-ref',
      });

      expect(res.editionLanguage).toBe('TR');
      expect(res.originalLanguage).toBe('DE');
      expect(res.isTranslation).toBe(true);
      expect(res.translationFlow).toBe('DE → TR');
      expect(res.format).toBe('academic-ref');
    });
  });

  describe('2. Kindle Clippings Parser', () => {
    it('parses SAMPLE_KINDLE_CLIPPINGS_TXT deduplicating resized highlights and pairing notes', () => {
      const clippings = parseKindleClippings(SAMPLE_KINDLE_CLIPPINGS_TXT, bundle.books);

      // Raw sample has 5 entries:
      // Entry 1: No Longer Human shorter highlight
      // Entry 2: No Longer Human longer resized highlight
      // Entry 3: No Longer Human note paired to Entry 2
      // Entry 4: Dune highlight
      // Entry 5: Anayurt Oteli Turkish highlight
      //
      // Resulting list should have exactly 3 clippings (Entry 1 dropped, Entry 3 paired to Entry 2)
      expect(clippings.length).toBe(3);

      const nlh = clippings.find(c => c.cleanTitle.toLowerCase().includes('no longer human'));
      expect(nlh).toBeDefined();
      expect(nlh?.type).toBe('highlight');
      expect(nlh?.content).toContain("I can't even guess myself what it must be to live");
      expect(nlh?.attachedNote).toBe('Central existential thesis of Oba Yozo.');
      expect(nlh?.matchedBookId).toBe('17665637'); // Osamu Dazai version

      const dune = clippings.find(c => c.cleanTitle.toLowerCase() === 'dune');
      expect(dune).toBeDefined();
      expect(dune?.type).toBe('highlight');
      expect(dune?.content).toContain('Fear is the mind-killer');
      expect(dune?.matchedBookId).toBe('44767458');

      const anayurt = clippings.find(c => c.cleanTitle.toLowerCase().includes('anayurt'));
      expect(anayurt).toBeDefined();
      expect(anayurt?.page).toBe(32);
      expect(anayurt?.locationStart).toBe(410);
      expect(anayurt?.locationEnd).toBe(415);
      expect(anayurt?.matchedBookId).toBe('30851529');
    });
  });

  describe('3. Extended Analytics Engine', () => {
    it('filters Oracle candidates by editionLanguage, originalLanguage, translationMode, and format', () => {
      // Test format filter: short-essay
      const shortCandidates = getOracleCandidates(bundle, { format: 'short-essay' });
      for (const c of shortCandidates) {
        expect(c.book.pageCount).toBeLessThanOrEqual(80);
      }

      // Test editionLanguage filter: TR
      const trCandidates = getOracleCandidates(bundle, { editionLanguage: 'TR' });
      for (const c of trCandidates) {
        const prof = classifyBookLanguageAndFormat(c.book);
        expect(prof.editionLanguage).toBe('TR');
      }

      // Test translationMode: translated
      const transCandidates = getOracleCandidates(bundle, { translationMode: 'translated' });
      for (const c of transCandidates) {
        const prof = classifyBookLanguageAndFormat(c.book);
        expect(prof.isTranslation).toBe(true);
      }
    });

    it('computes reading velocity per format with realistic averages and fallbacks', () => {
      const velocities = computeFormatVelocity(bundle);
      expect(velocities.length).toBe(4);

      const proseVel = velocities.find(v => v.format === 'prose');
      expect(proseVel).toBeDefined();
      expect(proseVel?.booksCompleted).toBeGreaterThan(0);
      expect(proseVel?.avgPagesPerDay).toBeGreaterThan(10);
      expect(proseVel?.medianDaysToFinish).toBeGreaterThan(0);

      const comicVel = velocities.find(v => v.format === 'comic-manga');
      expect(comicVel).toBeDefined();
      expect(comicVel?.avgPagesPerDay).toBeGreaterThanOrEqual(50);
    });

    it('computes nightstand diagnostics for currently reading books', () => {
      const userState: UserLocalState = {
        version: '0.2.0',
        updatedAt: '2026-10-29',
        showCovers: false,
        bookOverrides: {
          '32862868': {
            currentPage: 94,
            targetFinishDate: '2026-12-31',
          },
        },
        kindleClippings: [],
      };

      const diagnostics = computeNightstandDiagnostics(bundle, userState);
      expect(diagnostics.length).toBeGreaterThan(0);

      const sicakKafa = diagnostics.find(d => d.book.id === '32862868');
      if (sicakKafa) {
        expect(sicakKafa.currentPage).toBe(94);
        expect(sicakKafa.percentComplete).toBe(50); // 94 / 188 pages = 50%
        expect(sicakKafa.targetFinishDate).toBe('2026-12-31');
        expect(sicakKafa.pagesPerDayForTarget).toBeGreaterThan(0);
        expect(sicakKafa.projectedFinishDate).toBeTruthy();
      }
    });

    it('computes Language Passport metrics covering flows, distribution, and translators', () => {
      const passport = computeLanguagePassportMetrics(bundle);

      expect(passport.byEditionLanguage.length).toBeGreaterThan(0);
      expect(passport.byOriginalLanguage.length).toBeGreaterThan(0);
      expect(passport.translationFlows.length).toBeGreaterThan(0);

      // Verify originalVsTranslated volume counts
      expect(passport.originalVsTranslated.originalRead).toBeGreaterThan(0);
      expect(passport.originalVsTranslated.translatedRead).toBeGreaterThan(0);
      expect(passport.originalVsTranslated.originalTBR).toBeGreaterThanOrEqual(0);
    });

    it('computes Contrarian metrics identifying Sacred Cows Slain and Hidden Champions', () => {
      const dummyEnrichment: EnrichmentCacheMap = {
        '17665637': {
          bookId: '17665637',
          fetchedAt: '2026-10-29',
          source: 'openlibrary',
          synopsis: 'Masterpiece',
          communityRating: 4.1,
          ratingsCount: 50000,
          subjects: [],
          coverUrl: null,
        },
        '12345': {
          bookId: '12345',
          fetchedAt: '2026-10-29',
          source: 'openlibrary',
          synopsis: null,
          communityRating: 4.5,
          ratingsCount: 20000,
          subjects: [],
          coverUrl: null,
        },
      };

      const contrarian = computeContrarianMetrics(bundle, dummyEnrichment);
      expect(contrarian).toBeDefined();
      expect(contrarian.enrichedRatedCount).toBeGreaterThanOrEqual(1);
      expect(contrarian.allPoints.length).toBe(contrarian.enrichedRatedCount);
    });
  });
});
