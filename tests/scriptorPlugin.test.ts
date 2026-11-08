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

  it('implements Hero 7-Day Velocity Sparkline, Per-File Pruning Engine, and Project Horizon telemetry', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    expect(mainJs).toContain('getCurrentWeekData');
    expect(mainJs).toContain('scriptor-sparkline-bars');
    expect(mainJs).toContain('filesGross');
    expect(mainJs).toContain('scriptor-pruning-row');
    expect(mainJs).toContain('computeProjectAndCadenceMetrics');
    expect(mainJs).toContain('formatChapterMilestone');
    expect(styles).toContain('.scriptor-sparkline-bar');
    expect(styles).toContain('.scriptor-horizon-card');
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

    // Reads back manual edits to Writing_Log_YYYY-MM-DD.md via regex
    expect(mainJs).toContain('Writing_Log_');
    expect(mainJs).toContain('net_words|netWords');
  });

  it('detects YAML frontmatter dates (handles Date objects & regex) and prevents live inflation for past notes', () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');

    expect(mainJs).toContain('extractFrontmatterDate');
    expect(mainJs).toContain('instanceof Date');
    expect(mainJs).toContain('date written');
    expect(mainJs).toContain('date-written');
    expect(mainJs).toContain('frontmatterDate !== todayStr');
  });

  it("provides a prominent [Reset Today's Log] button in ScriptorPanelView and ScriptorSettingTab", () => {
    const mainJs = fs.readFileSync(path.join(pluginDir, 'main.js'), 'utf8');
    const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');

    expect(mainJs).toContain("[Reset Today's Log]");
    expect(mainJs).toContain('resetTodayLog');
    expect(mainJs).toContain('confirm');
    expect(styles).toContain('scriptor-btn.scriptor-btn-danger');
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
