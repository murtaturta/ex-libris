import type {
  WritingTelemetryData,
  WritingProjectStat,
  DraftedFileRecord,
} from '../../types/library';

/**
 * Checks whether a raw string or parsed JSON object is an Obsidian Keep the Rhythm data.json
 * or writing telemetry payload.
 */
export function isKeepTheRhythmJson(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  try {
    const clean = raw.replace(/^\uFEFF/, '').trim();
    if (!clean.startsWith('{')) return false;
    const data = JSON.parse(clean);
    if (!data || typeof data !== 'object') return false;

    // Direct Keep the Rhythm plugin schema signatures
    if (data.stats && Array.isArray(data.stats.dailyActivity)) return true;
    if (Array.isArray(data.dailyActivity)) return true;
    if (data.source === 'keep-the-rhythm' || data.source === 'obsidian-vault') return true;

    // Pre-aggregated telemetry export format
    if (data.dailyTotals && typeof data.dailyTotals === 'object') return true;
    if (data.writingTelemetry && typeof data.writingTelemetry === 'object') return true;

    // Generic vault daily stats mapping (keys formatted as YYYY-MM-DD)
    const keys = Object.keys(data);
    const dateKeys = keys.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    if (dateKeys.length >= 2) return true;

    return false;
  } catch {
    // If it fails standard parse, check if it has Keep the Rhythm signatures in raw text
    return (
      raw.includes('dailyActivity') ||
      raw.includes('keep-the-rhythm') ||
      raw.includes('dailyTotals')
    );
  }
}

/**
 * Auto-Repair Engine: repairs malformed, truncated, or corrupted JSON strings
 * caused by Obsidian sync collisions, sudden power outages, or trailing comma syntax.
 */
export function repairBrokenJson(raw: string): {
  repaired: string;
  wasRepaired: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let clean = (raw || '').replace(/^\uFEFF/, '').trim();

  // Test if already valid
  try {
    JSON.parse(clean);
    return { repaired: clean, wasRepaired: false, warnings: [] };
  } catch (err: any) {
    warnings.push(`Initial parse failed: ${err?.message || 'Syntax error'}`);
  }

  let text = clean;

  // 1. Fix single quotes on keys and values
  text = text.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

  // 2. Remove trailing commas before object or array closers
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 3. Remove trailing comma at the very end of truncated input
  text = text.replace(/,\s*$/, '');

  // 4. Handle truncated endings by balancing unclosed braces and brackets
  // First strip any trailing incomplete key-value fragment like `"date":` or `"chan`
  text = text.replace(/,\s*"[^"]*":?\s*$/, '');
  text = text.replace(/:\s*"[^"]*$/, '');

  // Count open brackets
  const openStack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') openStack.push('}');
      else if (ch === '[') openStack.push(']');
      else if (ch === '}' || ch === ']') {
        if (openStack.length > 0 && openStack[openStack.length - 1] === ch) {
          openStack.pop();
        }
      }
    }
  }

  // If ended while in string, close it
  if (inString) {
    text += '"';
    warnings.push('Closed dangling string literal');
  }

  // Remove any trailing comma that was left before closing
  text = text.replace(/,\s*$/, '');

  // Close remaining open brackets in reverse order
  if (openStack.length > 0) {
    const closers = openStack.reverse().join('');
    text += closers;
    warnings.push(`Balanced and closed ${openStack.length} open bracket(s): ${closers}`);
  }

  // Final verification
  try {
    JSON.parse(text);
    return { repaired: text, wasRepaired: true, warnings };
  } catch (secondErr: any) {
    // Aggressive fallback: if still broken, attempt to salvage valid dailyActivity array
    const activityMatch = clean.match(/"dailyActivity"\s*:\s*(\[[\s\S]*)/);
    if (activityMatch) {
      let arrayText = activityMatch[1];
      arrayText = arrayText.replace(/,\s*([}\]])/g, '$1');
      const lastCloseObj = arrayText.lastIndexOf('}');
      if (lastCloseObj !== -1) {
        const salvagedArray = arrayText.slice(0, lastCloseObj + 1) + ']';
        const fallbackObj = `{"stats":{"dailyActivity":${salvagedArray}}}`;
        try {
          JSON.parse(fallbackObj);
          warnings.push('Aggressively salvaged dailyActivity array from truncated stream');
          return { repaired: fallbackObj, wasRepaired: true, warnings };
        } catch {
          // Continue to error
        }
      }
    }
    throw new Error(`Failed to auto-repair JSON: ${secondErr?.message || 'Unrecoverable syntax'}`);
  }
}

/**
 * Parses Obsidian Keep the Rhythm `data.json` or writing telemetry JSON into a unified `WritingTelemetryData` object.
 * Incorporates the Auto-Repair Engine for zero-friction recovery of sync-damaged files.
 */
export function parseKeepTheRhythmJson(
  raw: string,
  existingTelemetry?: WritingTelemetryData | null
): WritingTelemetryData {
  let clean = (raw || '').replace(/^\uFEFF/, '').trim();
  let parsed: any;

  try {
    parsed = JSON.parse(clean);
  } catch {
    // Invoke Auto-Repair Engine
    const { repaired } = repairBrokenJson(clean);
    parsed = JSON.parse(repaired);
  }

  const now = new Date().toISOString();

  // If parsed object is wrapped inside writingTelemetry
  const data = parsed.writingTelemetry || parsed;

  const dailyTotals: Record<string, number> = {};
  const hourlyTotals: number[] = Array(24).fill(0);
  const dailyFiles: Record<string, DraftedFileRecord[]> = {};
  const projectsMap = new Map<string, { words: number; files: Set<string>; days: Set<string> }>();

  let totalWords = 0;
  let totalChars = 0;

  // Case A: Standard Keep the Rhythm data.json with stats.dailyActivity
  const activities: Array<{
    date: string;
    filePath?: string;
    changes?: Array<{ w?: number; c?: number; timeKey?: string }>;
  }> = data.stats?.dailyActivity || data.dailyActivity || [];

  if (activities.length > 0) {
    for (const a of activities) {
      if (!a.date) continue;
      const dt = a.date;
      let dayWords = 0;

      for (const c of a.changes || []) {
        const w = Number(c.w) || 0;
        const charCount = Number(c.c) || 0;
        if (w > 0) {
          dayWords += w;
          totalWords += w;
          totalChars += charCount;

          if (c.timeKey && typeof c.timeKey === 'string') {
            const hr = parseInt(c.timeKey.split(':')[0], 10);
            if (!isNaN(hr) && hr >= 0 && hr < 24) {
              hourlyTotals[hr] += w;
            }
          }
        }
      }

      dailyTotals[dt] = (dailyTotals[dt] || 0) + dayWords;

      // Group project & file
      if (a.filePath) {
        const fp = a.filePath.replace(/\\/g, '/');
        const parts = fp.split('/');
        const fileName = parts.pop() || fp;
        const folder = parts.join('/') || 'Root';

        // Project identification
        let projectName = parts[0] || 'Vault Root';
        if (fp.includes('yenimegaproje2025')) projectName = 'yenimegaproje2025';
        else if (fp.includes('Warband')) projectName = 'Warband';
        else if (fp.includes('Ioren')) projectName = 'Ioren';
        else if (fp.includes('Les Citoyens')) projectName = 'Les Citoyens';
        else if (fp.includes('Kısa Hikayeler')) projectName = 'Kısa Hikayeler';
        else if (fp.includes('Starship Troopers')) projectName = 'Essays & Reviews';

        if (!projectsMap.has(projectName)) {
          projectsMap.set(projectName, { words: 0, files: new Set(), days: new Set() });
        }
        const proj = projectsMap.get(projectName)!;
        proj.words += dayWords;
        proj.files.add(fp);
        proj.days.add(dt);

        if (!dailyFiles[dt]) dailyFiles[dt] = [];
        const existingFile = dailyFiles[dt].find((f) => f.filePath === fp);
        if (existingFile) {
          existingFile.words += dayWords;
        } else {
          dailyFiles[dt].push({
            filePath: fp,
            fileName,
            folder,
            words: dayWords,
          });
        }
      }
    }

    // Sort files within each day (highest word count first, then alphabetical)
    for (const dt of Object.keys(dailyFiles)) {
      dailyFiles[dt].sort((a, b) => b.words - a.words || a.fileName.localeCompare(b.fileName));
    }
  } else if (data.dailyTotals && typeof data.dailyTotals === 'object') {
    // Case B: Pre-aggregated dailyTotals format
    for (const [dt, wordsVal] of Object.entries(data.dailyTotals)) {
      const w = Number(wordsVal) || 0;
      dailyTotals[dt] = w;
      totalWords += w;
    }
    totalChars = data.totalChars || totalWords * 6;
    if (Array.isArray(data.hourlyTotals) && data.hourlyTotals.length === 24) {
      data.hourlyTotals.forEach((v: number, i: number) => {
        hourlyTotals[i] = v;
      });
    }
    if (data.dailyFiles && typeof data.dailyFiles === 'object') {
      Object.assign(dailyFiles, data.dailyFiles);
    }
  } else {
    // Case C: Generic key-value dates or nested stats
    for (const [k, v] of Object.entries(data)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
        const w =
          typeof v === 'number'
            ? v
            : typeof v === 'object' && v !== null
            ? Number((v as any).words || (v as any).w || 0)
            : 0;
        dailyTotals[k] = w;
        totalWords += w;
      }
    }
    totalChars = totalWords * 6;
  }

  // Active days count: count of dates with words > 0
  const activeDaysCount = Object.values(dailyTotals).filter((w) => w > 0).length;

  // Daily goal: extract from settings or default to 300
  const dailyGoal =
    Number(data.settings?.dailyGoal) ||
    Number(data.dailyGoal) ||
    existingTelemetry?.dailyGoal ||
    300;

  // Completed goal days
  const completedGoalDates = Object.entries(dailyTotals)
    .filter(([_, w]) => w >= dailyGoal)
    .map(([dt]) => dt)
    .sort();
  const completedGoalDaysCount = completedGoalDates.length;

  // Format projects
  let projects: WritingProjectStat[] = [];
  if (projectsMap.size > 0) {
    projects = Array.from(projectsMap.entries())
      .map(([name, p]) => ({
        name,
        words: p.words,
        filesCount: p.files.size,
        activeDaysCount: p.days.size,
      }))
      .sort((a, b) => b.words - a.words);
  } else if (Array.isArray(data.projects)) {
    projects = data.projects;
  } else if (existingTelemetry?.projects) {
    projects = existingTelemetry.projects;
  }

  // Matched reviews: preserve existing or fallback
  const matchedReviews =
    data.matchedReviews && typeof data.matchedReviews === 'object'
      ? data.matchedReviews
      : existingTelemetry?.matchedReviews || {};

  return {
    version: '1.0',
    updatedAt: now,
    source: 'keep-the-rhythm',
    totalWords,
    totalChars,
    dailyGoal,
    completedGoalDaysCount,
    completedGoalDates,
    activeDaysCount,
    dailyTotals,
    hourlyTotals,
    projects,
    matchedReviews,
    dailyFiles,
  };
}

/**
 * Exports writing telemetry as clean Obsidian Daily Notes frontmatter YAML snippets.
 */
export function exportTelemetryToFrontmatter(telemetry: WritingTelemetryData): string {
  const dates = Object.keys(telemetry.dailyTotals || {}).sort().reverse();
  const lines: string[] = [
    '# --- Ex Libris Scriptorium · Obsidian Daily Notes YAML Archive ---',
    `# Generated: ${new Date().toISOString()}`,
    `# Total Words: ${telemetry.totalWords.toLocaleString()} | Active Days: ${telemetry.activeDaysCount}`,
    '# Paste into the YAML frontmatter of your corresponding daily notes in Obsidian:',
    '',
  ];

  for (const dt of dates.slice(0, 100)) {
    const words = telemetry.dailyTotals[dt] || 0;
    const files = (telemetry.dailyFiles?.[dt] || []).map((f) => f.fileName).join(', ');
    lines.push(`--- # ${dt}.md`);
    lines.push(`date: ${dt}`);
    lines.push(`words_written: ${words}`);
    lines.push(`goal_achieved: ${words >= telemetry.dailyGoal}`);
    if (files) {
      lines.push(`drafted_files: [${files}]`);
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Exports writing telemetry as CSV for spreadsheets or external data analytics.
 */
export function exportTelemetryToCsv(telemetry: WritingTelemetryData): string {
  const dates = Object.keys(telemetry.dailyTotals || {}).sort();
  const rows: string[] = ['Date,Words Written,Goal Achieved,Files Touched Count,Top File Drafted'];

  for (const dt of dates) {
    const words = telemetry.dailyTotals[dt] || 0;
    const achieved = words >= telemetry.dailyGoal ? 'Yes' : 'No';
    const dayFiles = telemetry.dailyFiles?.[dt] || [];
    const filesCount = dayFiles.length;
    const topFile = dayFiles[0]?.fileName ? `"${dayFiles[0].fileName.replace(/"/g, '""')}"` : '';

    rows.push(`${dt},${words},${achieved},${filesCount},${topFile}`);
  }

  return rows.join('\n');
}

/**
 * Generates a clean, repaired Keep the Rhythm data.json ready to replace a corrupt file on disk.
 */
export function generateRepairedKeepTheRhythmJson(telemetry: WritingTelemetryData): string {
  const dailyActivity: Array<{
    date: string;
    filePath: string;
    changes: Array<{ w: number; c: number; timeKey: string }>;
  }> = [];

  for (const [dt, files] of Object.entries(telemetry.dailyFiles || {})) {
    for (const f of files) {
      dailyActivity.push({
        date: dt,
        filePath: f.filePath,
        changes: [{ w: f.words, c: f.words * 6, timeKey: '12:00' }],
      });
    }
  }

  const exportPayload = {
    settings: {
      dailyGoal: telemetry.dailyGoal,
      weeklyGoal: telemetry.dailyGoal * 7,
      monthlyGoal: telemetry.dailyGoal * 30,
    },
    stats: {
      dailyActivity,
      totalWords: telemetry.totalWords,
      totalChars: telemetry.totalChars,
    },
    exLibrisColophon: {
      repairedAt: new Date().toISOString(),
      engine: 'Ex Libris Telemetry Doctor',
    },
  };

  return JSON.stringify(exportPayload, null, 2);
}
