import { describe, it, expect } from 'vitest';
import {
  isKeepTheRhythmJson,
  repairBrokenJson,
  parseKeepTheRhythmJson,
  exportTelemetryToFrontmatter,
  exportTelemetryToCsv,
  generateRepairedKeepTheRhythmJson,
} from '../src/lib/parsers/writingTelemetryParser';
import { computeAdaptationForensics } from '../src/lib/analytics/engine';
import type { LibraryBundle, UserLocalState, WritingTelemetryData } from '../src/types/library';

describe('Scriptorium Parsers, Telemetry Doctor & Adaptation Forensics', () => {
  describe('isKeepTheRhythmJson', () => {
    it('detects valid Keep the Rhythm JSON with stats.dailyActivity', () => {
      const valid = JSON.stringify({
        stats: {
          dailyActivity: [
            {
              date: '2026-03-01',
              filePath: 'Vault/Drafts/Chapter1.md',
              changes: [{ w: 450, c: 2200, timeKey: '18:00' }],
            },
          ],
        },
      });
      expect(isKeepTheRhythmJson(valid)).toBe(true);
    });

    it('detects pre-aggregated dailyTotals schema', () => {
      const valid = JSON.stringify({
        dailyTotals: {
          '2026-03-01': 500,
          '2026-03-02': 750,
        },
        totalWords: 1250,
      });
      expect(isKeepTheRhythmJson(valid)).toBe(true);
    });

    it('detects broken JSON containing Keep the Rhythm signatures', () => {
      const broken = '{"stats": {"dailyActivity": [{"date": "2026-03-01", "filePath": "draft.md"';
      expect(isKeepTheRhythmJson(broken)).toBe(true);
    });

    it('returns false for unrelated CSV, text, or HTML', () => {
      expect(isKeepTheRhythmJson('Book Id,Title,Author,My Rating')).toBe(false);
      expect(isKeepTheRhythmJson('<!DOCTYPE html><html><body>Hello</body></html>')).toBe(false);
      expect(isKeepTheRhythmJson('')).toBe(false);
      expect(isKeepTheRhythmJson(null as any)).toBe(false);
    });
  });

  describe('repairBrokenJson', () => {
    it('repairs trailing commas in objects and arrays', () => {
      const input = '{"a": 1, "b": [1, 2, ], }';
      const result = repairBrokenJson(input);
      expect(result.wasRepaired).toBe(true);
      expect(() => JSON.parse(result.repaired)).not.toThrow();
      const parsed = JSON.parse(result.repaired);
      expect(parsed.a).toBe(1);
      expect(parsed.b).toEqual([1, 2]);
    });

    it('repairs single-quoted keys and unclosed braces at EOF', () => {
      const input = "{\"stats\": {'dailyActivity': [{\"date\": '2026-03-01', \"w\": 300}";
      const result = repairBrokenJson(input);
      expect(result.wasRepaired).toBe(true);
      expect(() => JSON.parse(result.repaired)).not.toThrow();
    });

    it('leaves already valid JSON untouched', () => {
      const input = '{"valid": true, "count": 42}';
      const result = repairBrokenJson(input);
      expect(result.wasRepaired).toBe(false);
      expect(JSON.parse(result.repaired)).toEqual({ valid: true, count: 42 });
    });
  });

  describe('parseKeepTheRhythmJson', () => {
    const rawKeepTheRhythm = JSON.stringify({
      stats: {
        dailyActivity: [
          {
            date: '2026-03-01',
            filePath: 'Essays/On Calvino.md',
            changes: [
              { w: 300, c: 1500, timeKey: '17:30' },
              { w: 200, c: 1000, timeKey: '18:15' },
            ],
          },
          {
            date: '2026-03-02',
            filePath: 'Novels/Borges Cipher.md',
            changes: [{ w: 650, c: 3200, timeKey: '18:45' }],
          },
        ],
      },
      settings: {
        dailyGoal: 500,
      },
    });

    it('computes total words, active days, and daily goal counts', () => {
      const telemetry = parseKeepTheRhythmJson(rawKeepTheRhythm);

      expect(telemetry.source).toBe('keep-the-rhythm');
      expect(telemetry.totalWords).toBe(1150); // 500 + 650
      expect(telemetry.activeDaysCount).toBe(2);
      expect(telemetry.dailyTotals['2026-03-01']).toBe(500);
      expect(telemetry.dailyTotals['2026-03-02']).toBe(650);
      expect(telemetry.dailyGoal).toBe(500);
      expect(telemetry.completedGoalDaysCount).toBe(2);
    });

    it('aggregates projects and daily files accurately', () => {
      const telemetry = parseKeepTheRhythmJson(rawKeepTheRhythm);

      expect(telemetry.projects.length).toBe(2);
      const essaysProject = telemetry.projects.find((p) => p.name === 'Essays');
      expect(essaysProject?.words).toBe(500);

      const novelsProject = telemetry.projects.find((p) => p.name === 'Novels');
      expect(novelsProject?.words).toBe(650);

      expect(telemetry.dailyFiles).toBeDefined();
      expect(telemetry.dailyFiles!['2026-03-01'].length).toBe(1);
      expect(telemetry.dailyFiles!['2026-03-01'][0].fileName).toBe('On Calvino.md');
      expect(telemetry.dailyFiles!['2026-03-01'][0].words).toBe(500);

      expect(telemetry.dailyFiles!['2026-03-02'].length).toBe(1);
      expect(telemetry.dailyFiles!['2026-03-02'][0].fileName).toBe('Borges Cipher.md');
      expect(telemetry.dailyFiles!['2026-03-02'][0].words).toBe(650);
    });

    it('handles truncated JSON gracefully via auto-repair', () => {
      const truncated = '{"stats": {"dailyActivity": [{"date": "2026-03-01", "filePath": "Notes.md", "changes": [{"w": 400}]';
      const telemetry = parseKeepTheRhythmJson(truncated);

      expect(telemetry.totalWords).toBe(400);
      expect(telemetry.activeDaysCount).toBe(1);
    });
  });

  describe('Exporters: Frontmatter YAML, CSV & Repaired JSON', () => {
    const mockTelemetry: WritingTelemetryData = {
      version: '1.0',
      updatedAt: '2026-03-02T12:00:00Z',
      source: 'keep-the-rhythm',
      dailyTotals: {
        '2026-03-01': 500,
        '2026-03-02': 650,
      },
      totalWords: 1150,
      totalChars: 6900,
      activeDaysCount: 2,
      dailyGoal: 500,
      completedGoalDaysCount: 2,
      completedGoalDates: ['2026-03-01', '2026-03-02'],
      projects: [{ name: 'Novels', words: 650, filesCount: 1, activeDaysCount: 1 }],
      dailyFiles: {
        '2026-03-01': [
          { filePath: 'Essays/Calvino.md', fileName: 'Calvino.md', folder: 'Essays', words: 500 },
        ],
        '2026-03-02': [
          { filePath: 'Novels/Draft.md', fileName: 'Draft.md', folder: 'Novels', words: 650 },
        ],
      },
      hourlyTotals: Array(24).fill(0),
      matchedReviews: {},
    };

    it('generates valid Frontmatter YAML with words_written snippets', () => {
      const yaml = exportTelemetryToFrontmatter(mockTelemetry);
      expect(yaml).toContain(`Total Words: ${mockTelemetry.totalWords.toLocaleString()}`);
      expect(yaml).toContain('words_written: 500');
      expect(yaml).toContain('words_written: 650');
      expect(yaml).toContain('date: 2026-03-01');
      expect(yaml).toContain('date: 2026-03-02');
      expect(yaml).toContain('drafted_files: [Calvino.md]');
    });

    it('generates tabular CSV with headers', () => {
      const csv = exportTelemetryToCsv(mockTelemetry);
      const lines = csv.split('\n');
      expect(lines[0].trim()).toBe('Date,Words Written,Goal Achieved,Files Touched Count,Top File Drafted');
      expect(csv).toContain('2026-03-01,500,Yes,1,"Calvino.md"');
      expect(csv).toContain('2026-03-02,650,Yes,1,"Draft.md"');
    });

    it('generates pristine repaired Keep the Rhythm JSON schema', () => {
      const repairedStr = generateRepairedKeepTheRhythmJson(mockTelemetry);
      expect(() => JSON.parse(repairedStr)).not.toThrow();
      const parsed = JSON.parse(repairedStr);
      expect(parsed.stats.dailyActivity.length).toBe(2);
      expect(parsed.settings.dailyGoal).toBe(500);
      expect(parsed.exLibrisColophon.engine).toBe('Ex Libris Telemetry Doctor');
    });
  });

  describe('computeAdaptationForensics', () => {
    const mockBundle = {
      books: [
        {
          id: 'b-martian',
          title: 'The Martian',
          cleanTitle: 'The Martian',
          author: 'Andy Weir',
          myRating: 5,
          pageCount: 369,
          dateRead: '2026-01-20',
          exclusiveShelf: 'read',
        },
        {
          id: 'b-psycho',
          title: 'American Psycho',
          cleanTitle: 'American Psycho',
          author: 'Bret Easton Ellis',
          myRating: 3,
          pageCount: 399,
          dateRead: '2025-11-15',
          exclusiveShelf: 'read',
        },
      ],
    } as unknown as LibraryBundle;

    const mockUserState: UserLocalState = {
      version: '1.0',
      updatedAt: '2026-11-04T00:00:00Z',
      showCovers: true,
      bookOverrides: {},
      kindleClippings: [],
      letterboxdData: {
        version: '1.0',
        updatedAt: '2026-11-04T00:00:00Z',
        totalWatchedCount: 2,
        totalDiaryCount: 2,
        totalReviewsCount: 2,
        totalWatchlistCount: 0,
        watches: [
          {
            id: 'w-martian',
            name: 'The Martian',
            year: 2015,
            uri: 'https://boxd.it/7i4W',
            rating: 4.0, // Book: 5, Film: 4 => delta = +1.0
            rewatch: false,
            date: '2026-01-25',
            source: 'diary',
            review: 'Great sci-fi adaptation.',
          },
          {
            id: 'w-psycho',
            name: 'American Psycho',
            year: 2000,
            uri: 'https://boxd.it/2aEw',
            rating: 4.5, // Book: 3, Film: 4.5 => delta = -1.5
            rewatch: true,
            date: '2025-11-20',
            source: 'diary',
            review: 'Classic Bale.',
          },
        ],
        ratingsMap: { 'The Martian': 4.0, 'American Psycho': 4.5 },
        reviewsMap: {
          'The Martian': 'Great sci-fi adaptation.',
          'American Psycho': 'Classic Bale.',
        },
        watchlist: [],
      },
    };

    it('computes divergence items with deltas and badges', () => {
      const forensics = computeAdaptationForensics(mockBundle, mockUserState, {});

      expect(forensics.divergenceItems.length).toBe(2);

      const martian = forensics.divergenceItems.find((d) => d.filmTitle === 'The Martian');
      expect(martian?.bookRating).toBe(5);
      expect(martian?.filmRating).toBe(4);
      expect(martian?.delta).toBe(1.0);
      expect(martian?.verdict).toBe('favors-book');

      const psycho = forensics.divergenceItems.find((d) => d.filmTitle === 'American Psycho');
      expect(psycho?.bookRating).toBe(3);
      expect(psycho?.filmRating).toBe(4.5);
      expect(psycho?.delta).toBe(-1.5);
      expect(psycho?.verdict).toBe('favors-film');

      expect(forensics.ratedPairsCount).toBe(2);
      expect(forensics.favorsBookCount).toBe(1);
      expect(forensics.favorsFilmCount).toBe(1);
      expect(forensics.parityCount).toBe(0);
      expect(forensics.averageDelta).toBe(-0.25); // (+1.0 + -1.5) / 2 = -0.25
    });

    it('generates a continuous monthly Narrative Diet timeline', () => {
      const forensics = computeAdaptationForensics(mockBundle, mockUserState, {});

      expect(forensics.dietTimeline.length).toBeGreaterThanOrEqual(2);
      expect(forensics.totalDietPages).toBe(768); // 369 + 399
      expect(forensics.totalDietFilms).toBe(2);
    });
  });
});
