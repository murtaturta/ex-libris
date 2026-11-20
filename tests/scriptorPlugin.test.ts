import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Scriptor Obsidian Plugin Verification Suite', () => {
  const vaultPluginDir = fs.existsSync('C:/Users/Murat/Desktop/Obsidian Notes/.obsidian/plugins/scriptor')
    ? 'C:/Users/Murat/Desktop/Obsidian Notes/.obsidian/plugins/scriptor'
    : "G:/Drive'ım/obsidian2025/.obsidian/plugins/scriptor";
  const pluginDir = fs.existsSync('C:/Users/Murat/Desktop/scriptor-plugin')
    ? 'C:/Users/Murat/Desktop/scriptor-plugin'
    : vaultPluginDir;

  it('contains all required plugin files in desktop folder and vault plugin folder', () => {
    expect(fs.existsSync(pluginDir)).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'main.js'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'styles.css'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'README.md'))).toBe(true);

    if (fs.existsSync(vaultPluginDir)) {
      expect(fs.existsSync(path.join(vaultPluginDir, 'main.js'))).toBe(true);
      expect(fs.existsSync(path.join(vaultPluginDir, 'styles.css'))).toBe(true);
      expect(fs.readFileSync(path.join(vaultPluginDir, 'main.js'), 'utf8')).toBe(
        fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8')
      );
      expect(fs.readFileSync(path.join(vaultPluginDir, 'styles.css'), 'utf8')).toBe(
        fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8')
      );
    }

    const mobilePluginDir = 'C:/Users/Murat/Desktop/Obsidian Notes/.obsidian.mobile/plugins/scriptor';
    if (fs.existsSync(mobilePluginDir)) {
      expect(fs.readFileSync(path.join(mobilePluginDir, 'main.js'), 'utf8')).toBe(
        fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8')
      );
      expect(fs.readFileSync(path.join(mobilePluginDir, 'styles.css'), 'utf8')).toBe(
        fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8')
      );
    }
  });

  it('has a valid manifest.json with matching plugin metadata', () => {
    const raw = fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw);
    expect(manifest.id).toBe('scriptor');
    expect(manifest.name).toBe('Scriptor');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.minAppVersion).toBe('0.15.0');
    expect(manifest.isDesktopOnly).toBe(false);
  });

  it('enforces the STRICT ZERO-EMOJI RULE across main.js and styles.css', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    // Emoji regex checking standard unicode emoji ranges
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/u;

    expect(emojiRegex.test(mainJs)).toBe(false);
    expect(emojiRegex.test(styles)).toBe(false);

    // Verify presence of minimalist bracketed labels
    expect(mainJs).toContain('[Goal Met]');
    expect(mainJs).toContain('[Revision Day]');
    expect(mainJs).toContain('[In Progress]');
  });

  it('implements Right Sidebar ItemView, Status Bar Ticker, session delimiters, vault create hook, and atomic saves', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    expect(mainJs).toContain('VIEW_TYPE_SCRIPTOR');
    expect(mainJs).toContain('ScriptorPanelView');
    expect(mainJs).toContain('ScriptorSettingTab');
    expect(mainJs).toContain('scriptor-panel-view');
    expect(mainJs).toContain('pen-tool');

    // Status bar ticker with click-to-toggle
    expect(mainJs).toContain('addStatusBarItem');
    expect(mainJs).toContain('scriptor-status-bar-ticker');
    expect(mainJs).toContain('toggleView');
    expect(mainJs).toContain('updateStatusBar');
    expect(styles).toContain('.scriptor-status-bar-ticker');

    // Event hooks: modify, create, active-leaf-change, blur
    expect(mainJs).toContain("this.app.vault.on('modify'");
    expect(mainJs).toContain("this.app.vault.on('create'");
    expect(mainJs).toContain('active-leaf-change');
    expect(mainJs).toContain('blur');
    expect(mainJs).toContain('saveTelemetryToDisk');

    // Wikilink draft integration
    expect(mainJs).toContain('[[');
    expect(mainJs).toContain(']]');
  });

  it('renders the Continuous Vertical Matrix, normalized Month Brackets, and Circadian Golden Hours ribbon', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    expect(mainJs).toContain('renderPureContinuousMatrix');
    expect(mainJs).toContain('scriptor-matrix-wrapper');
    expect(mainJs).toContain('scriptor-weekday-bar');
    expect(mainJs).toContain('scriptor-matrix-grid');
    expect(mainJs).toContain('scriptor-matrix-cell');
    expect(mainJs).toContain('cell-tier-goal');
    expect(mainJs).toContain('cell-tier-revision');
    expect(mainJs).toContain('openDateLog');

    // Zero month headers in continuous matrix
    expect(mainJs).not.toContain('scriptor-month-divider');
    expect(styles).not.toContain('.scriptor-month-divider');

    // Fluid responsive styles: 100% width, repeat(7, 1fr), aspect-ratio: 1 / 1
    expect(styles).toContain('grid-template-columns: repeat(7, 1fr)');
    expect(styles).toContain('aspect-ratio: 1 / 1');
    expect(styles).toContain('width: 100%');
    expect(styles).toContain('.scriptor-matrix-cell.cell-tier-revision');
    expect(styles).toContain('repeating-linear-gradient');

    // Right-hand month brackets with normalized pseudo-element geometry (zero negative margins)
    expect(mainJs).toContain('scriptor-week-row');
    expect(mainJs).toContain('scriptor-week-bracket');
    expect(mainJs).toContain('scriptor-bracket-label');
    expect(mainJs).toContain('scriptor-year-divider');
    expect(styles).toContain('.scriptor-week-bracket::before');
    expect(styles).toContain('.scriptor-week-bracket.bracket-bot::before');
    expect(styles).not.toContain('margin-top: -2px');

    // Circadian Golden Hours Ribbon & Month Bracket filter linkage
    expect(mainJs).toContain('computeCircadianMetrics');
    expect(mainJs).toContain('renderCircadianBox');
    expect(mainJs).toContain('selectedMonthYm');
    expect(styles).toContain('grid-template-columns: repeat(24, 1fr)');

    // Dynamic accent color sync via color-mix() and var(--interactive-accent)
    expect(styles).toContain('color-mix(in srgb, var(--interactive-accent) 25%, var(--background-modifier-border))');
    expect(styles).toContain('color-mix(in srgb, var(--interactive-accent) 60%, var(--background-modifier-border))');
    expect(styles).toContain('var(--interactive-accent)');
  });

  it('implements Hero 7-Day Velocity Sparkline, Per-File Pruning Engine, and dynamic Project Horizon telemetry', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    expect(mainJs).toContain('getCurrentWeekData');
    expect(mainJs).toContain('scriptor-sparkline-bars');
    expect(mainJs).toContain('filesGross');
    expect(mainJs).toContain('scriptor-pruning-row');
    expect(mainJs).toContain('computeProjectAndCadenceMetrics');
    expect(mainJs).toContain('extractNoteProject');
    expect(mainJs).toContain('cleanProjectValue');
    expect(mainJs).toContain('seg-rank-');
    expect(mainJs).toContain('formatChapterMilestone');
    expect(styles).toContain('.scriptor-sparkline-bar');
    expect(styles).toContain('.scriptor-horizon-card');
    expect(styles).toContain('.scriptor-alloc-seg.seg-rank-1');
    expect(styles).toContain('.scriptor-alloc-seg.seg-rank-5');
  });

  it('uses local timezone date keys and persists active sessions without closing on disk sync', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');

    expect(mainJs).toContain('getLocalDateStr');
    expect(mainJs).not.toContain('toISOString().slice(0, 10)');
    expect(mainJs).toContain('syncActiveSessionToRecord');

    const saveMatch = mainJs.match(/async saveTelemetryToDisk\(\)\s*\{[\s\S]*?\}/);
    expect(saveMatch).not.toBeNull();
    expect(saveMatch![0]).toContain('syncActiveSessionToRecord');
    expect(saveMatch![0]).not.toContain('closeActiveSession');
  });

  it('implements lightweight real-time live matrix shading updates on active typing', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');

    expect(mainJs).toContain('notifyViewsLive');
    expect(mainJs).toContain('updateLiveMetrics');
    expect(mainJs).toContain('todayCellEl');
    expect(mainJs).toContain('cell-tier-goal');
    expect(mainJs).toContain('cell-tier-revision');
  });

  it('supports transparent two-way manual YAML frontmatter editing and year subfolder resolution', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');

    // Generates structured YAML frontmatter in daily logs inside year subfolders
    expect(mainJs).toContain("const yearFolder = logFolder + '/' + year;");
    expect(mainJs).toContain('net_words: ');
    expect(mainJs).toContain('gross_added: ');
    expect(mainJs).toContain('drafts_touched:');

    // Reads back manual edits to scriptor-log YYYY.MM.DD.md via regex
    expect(mainJs).toContain('scriptor-log ');
    expect(mainJs).toContain('net_words|netWords');
  });

  it('detects explicit YAML backfill dates (handles Date objects & regex) and ignores generic creation dates', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');

    expect(mainJs).toContain('extractFrontmatterDate');
    expect(mainJs).toContain('instanceof Date');
    expect(mainJs).toContain('date written');
    expect(mainJs).toContain('date-written');
    expect(mainJs).toContain('frontmatterDate !== todayStr');
    expect(mainJs).not.toContain('date_written|date-written|date)');
  });

  it('provides cut-and-paste guard, session rehydration across restarts, inline day drawer, range toggle, and refreshing daily logs', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    expect(mainJs).toContain('applyGrossDeltaWithCutGuard');
    expect(mainJs).toContain('rehydrateRecentSession');
    expect(mainJs).toContain('getActiveFile');
    expect(mainJs).toContain('matrixRangeMode');
    expect(mainJs).toContain('[2Y]');
    expect(mainJs).toContain('[ACTIVE]');
    expect(mainJs).toContain('renderDayDrawer');
    expect(mainJs).toContain('[Open Log Note]');
    expect(mainJs).toContain('*Generated by Scriptor.*');

    expect(styles).toContain('.scriptor-day-drawer');
    expect(styles).toContain('.scriptor-range-toggle');
    expect(styles).toContain('.scriptor-matrix-cell.cell-selected');
    expect(styles).toContain('.scriptor-matrix-cell.cell-dimmed');
    expect(styles).toContain('grid-template-columns: repeat(4, 1fr)');
  });

  it('supports vault rename continuity, scoped Project Horizon ([7D]/[30D]/[ALL]), project cross-filtering, and active-note status bar readout', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    expect(mainJs).toContain("this.app.vault.on('rename'");
    expect(mainJs).toContain('handleFileRenamed');
    expect(mainJs).toContain('buildProjectResolver');
    expect(mainJs).toContain('getDateProjectWords');
    expect(mainJs).toContain('horizonScope');
    expect(mainJs).toContain('selectedProjectFilter');
    expect(mainJs).toContain('cell-dimmed');
    expect(mainJs).toContain('is-clickable');
    expect(styles).toContain('.scriptor-horizon-header');
    expect(styles).toContain('.scriptor-alloc-row.is-clickable');
    expect(styles).toContain('.scriptor-alloc-row.is-active');
  });

  it("provides a prominent [Reset Today's Log] button in ScriptorPanelView and ScriptorSettingTab", () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    expect(mainJs).toContain("[Reset Today's Log]");
    expect(mainJs).toContain('resetTodayLog');
    expect(mainJs).toContain('confirm');
    expect(styles).toContain('scriptor-btn.scriptor-btn-danger');
  });

  it('resolves scriptor-log YYYY.MM.DD.md paths in openDateLog without Writing_Log_ fallback or CRLF/reconstructed duplication', async () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const vm = await import('vm');

    const openDateLogMatch = mainJs.match(/async openDateLog\(dateStr\)\s*\{[\s\S]*?this\.app\.workspace\.openLinkText\(logPath, ''\);\s*\}/);
    expect(openDateLogMatch).not.toBeNull();
    expect(openDateLogMatch![0]).not.toContain('Writing_Log_');
    expect(openDateLogMatch![0]).toContain("const logPath = yearFolder + '/scriptor-log ' + dotDate + '.md';");

    const stubModule: { exports: any } = { exports: {} };
    const obsidianStub = {
      Plugin: class {},
      ItemView: class {},
      PluginSettingTab: class {},
      Setting: class {},
      TFile: class {},
      Notice: class {},
    };
    const sandbox = {
      module: stubModule,
      exports: stubModule.exports,
      require: (id: string) => (id === 'obsidian' ? obsidianStub : {}),
      console,
      Map,
      Set,
      Date,
      Math,
      JSON,
      Object,
      Array,
      String,
      Number,
      Boolean,
      RegExp,
      parseInt,
      isNaN,
      setTimeout,
      clearTimeout,
    };
    vm.runInNewContext(mainJs, sandbox);
    const ScriptorPlugin = stubModule.exports;

    const files = new Map<string, string>();
    const existingLogPath = 'scriptor-plugin/2026/scriptor-log 2026.08.06.md';
    files.set(
      existingLogPath,
      '---\r\ndate: 2026-08-06\r\nnet_words: 663\r\n---\r\n\r\n# Writing Log — 2026-08-06\r\n\r\n---\r\n*Reconstructed by Scriptor from historical telemetry.*\r\n\r\nMy manual note'
    );

    const openedLinks: string[] = [];
    const createdFolders: string[] = [];
    const plugin = new ScriptorPlugin();
    plugin.app = {
      vault: {
        adapter: {
          exists: async (p: string) => files.has(p) || createdFolders.includes(p),
          read: async (p: string) => files.get(p) ?? '',
          write: async (p: string, data: string) => {
            files.set(p, data);
          },
        },
        createFolder: async (p: string) => {
          createdFolders.push(p);
        },
      },
      workspace: {
        openLinkText: (link: string) => {
          openedLinks.push(link);
        },
      },
    };
    plugin.loadData = async () => ({
      version: '1.0.0',
      settings: { logFolder: 'scriptor-plugin/', dailyGoal: 300 },
      days: { '2026-11-08': { netWords: 520 } },
      history: {
        '2026-08-06': {
          date: '2026-08-06',
          netWords: 663,
          grossWordsAdded: 884,
          grossWordsRemoved: 221,
          goalMet: true,
          isRevision: false,
          filesTouched: { "ioren's story": 134 },
          filesGross: { "ioren's story": { added: 355, removed: 221, net: 134 } },
          sessions: [],
          hourlyCounts: new Array(24).fill(0),
        },
      },
    });

    await plugin.loadTelemetry();
    expect(plugin.data.days).toBeUndefined();
    expect(plugin.data.settings.logFolder).toBe('scriptor-plugin');
    expect(plugin.data.settings.idleTimeoutMinutes).toBe(30);

    await plugin.openDateLog('2026-08-06');
    expect(openedLinks).toEqual([existingLogPath]);
    expect(files.has('scriptor-plugin/2026/Writing_Log_2026-08-06.md')).toBe(false);

    const updated = files.get(existingLogPath)!;
    expect(updated.match(/^date: 2026-08-06$/gm)?.length).toBe(1);
    expect(updated).toContain('My manual note');
    expect(updated).toContain('*Generated by Scriptor.*');
  });

  it("pre-seeds Murat's full 101-day historical telemetry with sessions, filesGross, and hourlyCounts", () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    expect(mainJs).toContain('SEEDED_HISTORY');
    expect(mainJs).toContain('2026-11-07');
    expect(mainJs).toContain('2026-03-06');

    const match = mainJs.match(/const SEEDED_HISTORY = ({[\s\S]*?});\r?\n\r?\nconst DEFAULT_SETTINGS/);
    expect(match).not.toBeNull();
    const history = JSON.parse(match![1]);
    const keys = Object.keys(history);
    expect(keys.length).toBe(101);

    const mar06 = history['2026-03-06'];
    expect(mar06.grossWordsAdded).toBe(2226);
    expect(mar06.grossWordsRemoved).toBe(384);
    expect(mar06.netWords).toBe(1842);
    expect(Array.isArray(mar06.hourlyCounts)).toBe(true);
    expect(mar06.hourlyCounts.length).toBe(24);
    expect(mar06.filesGross['2 Heraldry'].added).toBe(1157);
    expect(mar06.filesGross['2 Heraldry'].removed).toBe(262);
  });
});
