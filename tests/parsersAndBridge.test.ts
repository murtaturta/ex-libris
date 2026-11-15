import { describe, it, expect } from 'vitest';
import {
  isScriptorJson,
  repairBrokenJson,
  parseScriptorJson,
  exportTelemetryToFrontmatter,
  exportTelemetryToCsv,
  generateRepairedScriptorJson,
} from '../src/lib/parsers/writingTelemetryParser';
import { computeAdaptationForensics } from '../src/lib/analytics/engine';
import type { LibraryBundle, UserLocalState, WritingTelemetryData } from '../src/types/library';

describe('Scriptorium Parsers, Telemetry Doctor & Adaptation Forensics', () => {
  describe('isScriptorJson', () => {
    it('detects valid Scriptor JSON with history entries', () => {
      const valid = JSON.stringify({
        version: '1.0.0',
        settings: { dailyGoal: 300, logFolder: 'scriptor-plugin' },
        history: {
          '2026-03-01': {
            date: '2026-03-01',
            netWords: 450,
            grossWordsAdded: 450,
            grossWordsRemoved: 0,
            goalMet: true,
            filesGross: {
              Chapter1: { added: 450, removed: 0, net: 450, filePath: 'Drafts/Chapter1.md' },
            },
            hourlyCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 450, 0, 0, 0, 0, 0],
          },
        },
      });
      expect(isScriptorJson(valid)).toBe(true);
    });

    it('detects pre-aggregated dailyTotals schema', () => {
      const valid = JSON.stringify({
        dailyTotals: {
          '2026-03-01': 500,
          '2026-03-02': 750,
        },
        totalWords: 1250,
      });
      expect(isScriptorJson(valid)).toBe(true);
    });

    it('detects broken JSON containing Scriptor signatures', () => {
      const broken =
        '{"settings": {"dailyGoal": 300}, "history": {"2026-03-01": {"netWords": 400, "filesGross": {"draft"';
      expect(isScriptorJson(broken)).toBe(true);
    });

    it('rejects legacy Keep the Rhythm JSON and unrelated formats', () => {
      const legacyKtr = JSON.stringify({
        stats: {
          dailyActivity: [{ date: '2026-03-01', filePath: 'draft.md', changes: [{ w: 300 }] }],
        },
      });
      const legacyTagged = JSON.stringify({ source: 'keep-the-rhythm', dailyTotals: { '2026-03-01': 300 } });

      expect(isScriptorJson(legacyKtr)).toBe(false);
      expect(isScriptorJson(legacyTagged)).toBe(false);
      expect(isScriptorJson('Book Id,Title,Author,My Rating')).toBe(false);
      expect(isScriptorJson('<!DOCTYPE html><html><body>Hello</body></html>')).toBe(false);
      expect(isScriptorJson('')).toBe(false);
      expect(isScriptorJson(null as any)).toBe(false);
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
      const input = "{\"history\": {'2026-03-01': {\"date\": '2026-03-01', \"netWords\": 300}";
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

  describe('parseScriptorJson', () => {
    const rawScriptor = JSON.stringify({
      version: '1.0.0',
      settings: {
        dailyGoal: 500,
        logFolder: 'scriptor-plugin',
      },
      history: {
        '2026-03-01': {
          date: '2026-03-01',
          netWords: 500,
          grossWordsAdded: 500,
          grossWordsRemoved: 0,
          goalMet: true,
          isRevision: false,
          filesGross: {
            'On Calvino': {
              added: 500,
              removed: 0,
              net: 500,
              filePath: 'Essays/On Calvino.md',
            },
          },
          hourlyCounts: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 200, 0, 0, 0, 0, 0,
          ],
        },
        '2026-03-02': {
          date: '2026-03-02',
          netWords: 600,
          grossWordsAdded: 650,
          grossWordsRemoved: 50,
          goalMet: true,
          isRevision: false,
          filesGross: {
            'Chapter One': {
              added: 450,
              removed: 20,
              net: 430,
              filePath: 'Benim Yazılar/Warband/Chapters/Chapter One.md',
            },
            'Prologue Draft': {
              added: 200,
              removed: 30,
              net: 170,
              filePath: 'Benim Yazılar/yenimegaproje2025/Drafts/Prologue Draft.md',
            },
          },
          hourlyCounts: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 650, 0, 0, 0, 0, 0,
          ],
        },
      },
    });

    it('computes total words, active days, hourly counts, and daily goal counts', () => {
      const telemetry = parseScriptorJson(rawScriptor);

      expect(telemetry.source).toBe('scriptor');
      expect(telemetry.totalWords).toBe(1150); // 500 + 650 grossWordsAdded
      expect(telemetry.activeDaysCount).toBe(2);
      expect(telemetry.dailyTotals['2026-03-01']).toBe(500);
      expect(telemetry.dailyTotals['2026-03-02']).toBe(650);
      expect(telemetry.dailyGoal).toBe(500);
      expect(telemetry.completedGoalDaysCount).toBe(2);
      expect(telemetry.hourlyTotals[17]).toBe(300);
      expect(telemetry.hourlyTotals[18]).toBe(850);
    });

    it('resolves umbrella projects and aggregates daily files accurately', () => {
      const telemetry = parseScriptorJson(rawScriptor);

      expect(telemetry.projects.length).toBe(3);
      const essaysProject = telemetry.projects.find((p) => p.name === 'Essays');
      expect(essaysProject?.words).toBe(500);

      const iorenProject = telemetry.projects.find((p) => p.name === 'Ioren');
      expect(iorenProject?.words).toBe(450);

      const megaProject = telemetry.projects.find((p) => p.name === 'yenimegaproje2025');
      expect(megaProject?.words).toBe(200);

      expect(telemetry.dailyFiles).toBeDefined();
      expect(telemetry.dailyFiles!['2026-03-01'].length).toBe(1);
      expect(telemetry.dailyFiles!['2026-03-01'][0].fileName).toBe('On Calvino.md');
      expect(telemetry.dailyFiles!['2026-03-01'][0].words).toBe(500);

      expect(telemetry.dailyFiles!['2026-03-02'].length).toBe(2);
      expect(telemetry.dailyFiles!['2026-03-02'][0].fileName).toBe('Chapter One.md');
      expect(telemetry.dailyFiles!['2026-03-02'][0].words).toBe(450);
    });

    it('handles truncated Scriptor JSON gracefully via auto-repair', () => {
      const truncated =
        '{"history": {"2026-03-01": {"date": "2026-03-01", "netWords": 400, "grossWordsAdded": 400, "filesGross": {"Notes": {"added": 400}}';
      const telemetry = parseScriptorJson(truncated);

      expect(telemetry.totalWords).toBe(400);
      expect(telemetry.activeDaysCount).toBe(1);
    });

    it('throws an explicit error when legacy Keep the Rhythm data is provided', () => {
      const legacy = JSON.stringify({
        stats: {
          dailyActivity: [{ date: '2026-03-01', filePath: 'Notes.md', changes: [{ w: 300 }] }],
        },
      });
      expect(() => parseScriptorJson(legacy)).toThrow(/no longer supported/i);
    });
  });

  describe('Exporters: Frontmatter YAML, CSV & Repaired Scriptor JSON', () => {
    const mockTelemetry: WritingTelemetryData = {
      version: '1.0',
      updatedAt: '2026-03-02T12:00:00Z',
      source: 'scriptor',
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

    it('generates pristine repaired Scriptor JSON schema', () => {
      const repairedStr = generateRepairedScriptorJson(mockTelemetry);
      expect(() => JSON.parse(repairedStr)).not.toThrow();
      const parsed = JSON.parse(repairedStr);
      expect(parsed.source).toBe('scriptor');
      expect(Object.keys(parsed.history).length).toBe(2);
      expect(parsed.history['2026-03-01'].grossWordsAdded).toBe(500);
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
