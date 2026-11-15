import type {
  WritingTelemetryData,
  WritingProjectStat,
  DraftedFileRecord,
} from '../../types/library';

const DATE_KEY_RX = /^\d{4}-\d{2}-\d{2}$/;
const STRUCTURAL_FOLDER_RX =
  /^(chapters?|scenes?|drafts?|archives?|final|characters?.*|lore|maybe|manuscript\s*archive)$/i;
const SKIP_UMBRELLA_SUB_RX = /^(archive|archives|essays|eskiler|eski̇ler)$/i;

function isLegacyKeepTheRhythmPayload(data: Record<string, any>): boolean {
  return Boolean(
    data.source === 'keep-the-rhythm' ||
      (data.stats && Array.isArray(data.stats.dailyActivity)) ||
      Array.isArray(data.dailyActivity)
  );
}

function cleanProjectLabel(rawVal: unknown): string | null {
  if (!rawVal || typeof rawVal !== 'string') return null;
  let cleaned = rawVal.trim().replace(/^["']|["']$/g, '').trim();
  const wiki = cleaned.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
  if (wiki) cleaned = wiki[1].trim();
  if (!cleaned || /^(true|false|null|none)$/i.test(cleaned)) return null;
  return cleaned === 'Warband' ? 'Ioren' : cleaned;
}

/**
 * Checks whether a raw string or parsed JSON object is an Obsidian Scriptor
 * (`data.json` / `scriptor_telemetry_*.json`) or compatible writing telemetry payload.
 * Legacy Keep the Rhythm payloads are explicitly rejected.
 */
export function isScriptorJson(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const clean = raw.replace(/^\uFEFF/, '').trim();
  if (!clean.startsWith('{')) return false;

  try {
    const data = JSON.parse(clean);
    if (!data || typeof data !== 'object') return false;

    if (isLegacyKeepTheRhythmPayload(data)) return false;

    if (data.history && typeof data.history === 'object' && !Array.isArray(data.history)) {
      return true;
    }
    if (data.source === 'scriptor' || data.source === 'obsidian-vault') return true;
    if (data.dailyTotals && typeof data.dailyTotals === 'object') return true;
    if (data.writingTelemetry && typeof data.writingTelemetry === 'object') {
      return !isLegacyKeepTheRhythmPayload(data.writingTelemetry);
    }

    const dateKeys = Object.keys(data).filter((k) => DATE_KEY_RX.test(k));
    return dateKeys.length >= 2;
  } catch {
    if (raw.includes('dailyActivity') || raw.includes('keep-the-rhythm')) {
      return false;
    }
    return Boolean(
      (raw.includes('"history"') &&
        (raw.includes('"netWords"') ||
          raw.includes('"filesGross"') ||
          raw.includes('"hourlyCounts"'))) ||
        raw.includes('"dailyTotals"') ||
        raw.includes('"scriptor"')
    );
  }
}

function salvageTruncatedHistoryJson(clean: string): string | null {
  const match = clean.match(/"history"\s*:\s*\{/);
  if (!match || match.index === undefined) return null;

  const objStart = match.index + match[0].length - 1;
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompleteDayEnd = -1;

  for (let i = objStart; i < clean.length; i++) {
    const ch = clean[i];
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
    if (inString) continue;

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 1) {
        lastCompleteDayEnd = i;
      } else if (depth === 0) {
        break;
      }
    }
  }

  if (lastCompleteDayEnd === -1) return null;
  const salvagedHistory = clean.slice(objStart, lastCompleteDayEnd + 1) + '}';
  const candidate = `{"history":${salvagedHistory}}`;
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
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
  const clean = (raw || '').replace(/^\uFEFF/, '').trim();

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

  // 3. Remove trailing comma or incomplete key/value fragments at EOF
  text = text.replace(/,\s*$/, '');
  text = text.replace(/,\s*"[^"]*":?\s*$/, '');
  text = text.replace(/:\s*"[^"]*$/, '');

  // 4. Balance unclosed strings, braces, and brackets
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

  if (inString) {
    text += '"';
    warnings.push('Closed dangling string literal');
  }

  text = text.replace(/,\s*$/, '');

  if (openStack.length > 0) {
    const closers = openStack.reverse().join('');
    text += closers;
    warnings.push(`Balanced and closed ${openStack.length} open bracket(s): ${closers}`);
  }

  try {
    JSON.parse(text);
    return { repaired: text, wasRepaired: true, warnings };
  } catch (secondErr: any) {
    const salvaged = salvageTruncatedHistoryJson(clean);
    if (salvaged) {
      warnings.push('Salvaged complete Scriptor history entries from truncated JSON stream');
      return { repaired: salvaged, wasRepaired: true, warnings };
    }
    throw new Error(`Failed to auto-repair JSON: ${secondErr?.message || 'Unrecoverable syntax'}`);
  }
}

function detectUmbrellaFolders(historyObj: Record<string, any>): Set<string> {
  const umbrellaCandidates: Record<string, Set<string>> = {};
  for (const rec of Object.values(historyObj)) {
    if (!rec || typeof rec !== 'object' || !rec.filesGross || typeof rec.filesGross !== 'object') {
      continue;
    }
    for (const fg of Object.values(rec.filesGross) as Array<any>) {
      const fp = String(fg?.filePath || '').replace(/\\/g, '/');
      if (!fp) continue;
      const parts = fp.split('/').filter(Boolean);
      if (parts.length >= 4 && STRUCTURAL_FOLDER_RX.test(parts[2])) {
        const top = parts[0];
        if (!umbrellaCandidates[top]) umbrellaCandidates[top] = new Set();
        umbrellaCandidates[top].add(parts[1]);
      }
    }
  }

  const umbrellas = new Set<string>();
  for (const [top, subs] of Object.entries(umbrellaCandidates)) {
    if (subs.size >= 2) umbrellas.add(top);
  }
  return umbrellas;
}

function resolveScriptorProjectName(name: string, fg: any, umbrellas: Set<string>): string {
  const stamped = cleanProjectLabel(fg?.project);
  if (stamped) return stamped;

  const rawPath = String(fg?.filePath || '').replace(/\\/g, '/');
  if (rawPath) {
    const parts = rawPath.split('/').filter(Boolean);
    if (parts.length > 1) {
      const top = parts[0];
      if (umbrellas.has(top)) {
        if (parts.length >= 3 && !SKIP_UMBRELLA_SUB_RX.test(parts[1])) {
          return parts[1] === 'Warband' ? 'Ioren' : parts[1];
        }
        if (parts.length === 2 && /review/i.test(parts[1])) {
          return 'Essays & Reviews';
        }
      }
      return top === 'Warband' ? 'Ioren' : top;
    }
  }

  return /review/i.test(name) ? 'Essays & Reviews' : 'Loose Notes';
}

function recordFileContribution(
  dt: string,
  name: string,
  words: number,
  rawFilePath: string | undefined,
  projectName: string,
  dailyFiles: Record<string, DraftedFileRecord[]>,
  projectsMap: Map<string, { words: number; files: Set<string>; days: Set<string> }>
): void {
  if (words <= 0) return;

  const normalized = (rawFilePath || name).replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const rawLeaf = parts.pop() || name;
  const fileName = rawLeaf.endsWith('.md') ? rawLeaf : `${rawLeaf}.md`;
  const folder = parts.join('/') || 'Root';
  const filePath = normalized.endsWith('.md') ? normalized : `${normalized}.md`;

  if (!projectsMap.has(projectName)) {
    projectsMap.set(projectName, { words: 0, files: new Set(), days: new Set() });
  }
  const proj = projectsMap.get(projectName)!;
  proj.words += words;
  proj.files.add(filePath);
  proj.days.add(dt);

  if (!dailyFiles[dt]) dailyFiles[dt] = [];
  const existingFile = dailyFiles[dt].find((f) => f.filePath === filePath);
  if (existingFile) {
    existingFile.words += words;
  } else {
    dailyFiles[dt].push({
      filePath,
      fileName,
      folder,
      words,
    });
  }
}

/**
 * Parses Obsidian Scriptor (`data.json` / `scriptor_telemetry_*.json`) or compatible
 * writing telemetry JSON into a unified `WritingTelemetryData` object.
 * Incorporates the Auto-Repair Engine for zero-friction recovery of sync-damaged files.
 */
export function parseScriptorJson(
  raw: string,
  existingTelemetry?: WritingTelemetryData | null
): WritingTelemetryData {
  const clean = (raw || '').replace(/^\uFEFF/, '').trim();
  let parsed: any;

  try {
    parsed = JSON.parse(clean);
  } catch {
    if (clean.includes('dailyActivity') || clean.includes('keep-the-rhythm')) {
      throw new Error(
        'Keep the Rhythm format is no longer supported. Please import a Scriptor .json file.'
      );
    }
    const { repaired } = repairBrokenJson(clean);
    parsed = JSON.parse(repaired);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid Scriptor JSON payload.');
  }

  const data = parsed.writingTelemetry || parsed;
  if (isLegacyKeepTheRhythmPayload(parsed) || isLegacyKeepTheRhythmPayload(data)) {
    throw new Error(
      'Keep the Rhythm format is no longer supported. Please import a Scriptor .json file.'
    );
  }

  const now = new Date().toISOString();
  const dailyTotals: Record<string, number> = {};
  const hourlyTotals: number[] = Array(24).fill(0);
  const dailyFiles: Record<string, DraftedFileRecord[]> = {};
  const projectsMap = new Map<string, { words: number; files: Set<string>; days: Set<string> }>();

  let totalWords = 0;
  let totalChars = 0;

  const historyObj: Record<string, any> | null =
    data.history && typeof data.history === 'object' && !Array.isArray(data.history)
      ? data.history
      : null;

  if (historyObj) {
    const umbrellas = detectUmbrellaFolders(historyObj);

    for (const [dt, rec] of Object.entries(historyObj)) {
      if (!DATE_KEY_RX.test(dt) || !rec || typeof rec !== 'object') continue;

      const grossAdded = Number(rec.grossWordsAdded) || 0;
      const netWords = Number(rec.netWords) || 0;
      const fallbackWords = Number(rec.words) || Number(rec.w) || 0;
      const dayWords =
        grossAdded > 0 ? grossAdded : netWords > 0 ? netWords : Math.max(0, fallbackWords);

      dailyTotals[dt] = dayWords;
      totalWords += dayWords;

      if (Array.isArray(rec.hourlyCounts) && rec.hourlyCounts.length === 24) {
        for (let h = 0; h < 24; h++) {
          hourlyTotals[h] += Math.max(0, Number(rec.hourlyCounts[h]) || 0);
        }
      } else if (Array.isArray(rec.sessions)) {
        for (const s of rec.sessions) {
          const hr = parseInt(String(s?.startTime || '').split(':')[0], 10);
          const sessionWords = Math.max(0, Number(s?.grossAdded) || Number(s?.words) || 0);
          if (!isNaN(hr) && hr >= 0 && hr < 24 && sessionWords > 0) {
            hourlyTotals[hr] += sessionWords;
          }
        }
      }

      const filesGrossEntries =
        rec.filesGross && typeof rec.filesGross === 'object' ? Object.entries(rec.filesGross) : [];
      if (filesGrossEntries.length > 0) {
        for (const [name, fg] of filesGrossEntries as Array<[string, any]>) {
          const w = Math.max(0, Number(fg?.added) || Number(fg?.net) || 0);
          if (w <= 0) continue;
          const projName = resolveScriptorProjectName(name, fg, umbrellas);
          recordFileContribution(dt, name, w, fg?.filePath, projName, dailyFiles, projectsMap);
        }
      } else if (rec.filesTouched && typeof rec.filesTouched === 'object') {
        for (const [name, wVal] of Object.entries(rec.filesTouched)) {
          const w = Math.max(0, Number(wVal) || 0);
          if (w <= 0) continue;
          const projName = resolveScriptorProjectName(name, null, umbrellas);
          recordFileContribution(dt, name, w, undefined, projName, dailyFiles, projectsMap);
        }
      }

      if (dailyFiles[dt]) {
        dailyFiles[dt].sort((a, b) => b.words - a.words || a.fileName.localeCompare(b.fileName));
      }
    }

    totalChars = Number(data.totalChars) || totalWords * 6;
  } else if (data.dailyTotals && typeof data.dailyTotals === 'object') {
    for (const [dt, wordsVal] of Object.entries(data.dailyTotals)) {
      const w = Math.max(0, Number(wordsVal) || 0);
      dailyTotals[dt] = w;
      totalWords += w;
    }
    totalChars = Number(data.totalChars) || totalWords * 6;
    if (Array.isArray(data.hourlyTotals) && data.hourlyTotals.length === 24) {
      data.hourlyTotals.forEach((v: number, i: number) => {
        hourlyTotals[i] = Math.max(0, Number(v) || 0);
      });
    }
    if (data.dailyFiles && typeof data.dailyFiles === 'object') {
      Object.assign(dailyFiles, data.dailyFiles);
    }
  } else {
    for (const [k, v] of Object.entries(data)) {
      if (!DATE_KEY_RX.test(k)) continue;
      let w = 0;
      if (typeof v === 'number') {
        w = Math.max(0, v);
      } else if (v && typeof v === 'object') {
        const rec = v as Record<string, any>;
        const gross = Number(rec.grossWordsAdded) || 0;
        const net = Number(rec.netWords) || 0;
        const fallback = Number(rec.words) || Number(rec.w) || 0;
        w = gross > 0 ? gross : net > 0 ? net : Math.max(0, fallback);
      }
      dailyTotals[k] = w;
      totalWords += w;
    }
    totalChars = totalWords * 6;
  }

  const activeDaysCount = Object.values(dailyTotals).filter((w) => w > 0).length;

  const dailyGoal =
    Number(data.settings?.dailyGoal) ||
    Number(data.dailyGoal) ||
    existingTelemetry?.dailyGoal ||
    300;

  const completedGoalDates = Object.entries(dailyTotals)
    .filter(([dt, w]) => {
      if (historyObj && typeof historyObj[dt]?.goalMet === 'boolean') {
        return historyObj[dt].goalMet;
      }
      return w >= dailyGoal;
    })
    .map(([dt]) => dt)
    .sort();
  const completedGoalDaysCount = completedGoalDates.length;

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

  const matchedReviews =
    data.matchedReviews && typeof data.matchedReviews === 'object'
      ? data.matchedReviews
      : existingTelemetry?.matchedReviews || {};

  return {
    version: '1.0',
    updatedAt: now,
    source: 'scriptor',
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
 * Generates a clean, repaired Scriptor telemetry JSON ready to replace a corrupt file on disk.
 */
export function generateRepairedScriptorJson(telemetry: WritingTelemetryData): string {
  const history: Record<string, Record<string, any>> = {};
  const sortedDates = Array.from(
    new Set([
      ...Object.keys(telemetry.dailyTotals || {}),
      ...Object.keys(telemetry.dailyFiles || {}),
    ])
  ).sort();

  for (const dt of sortedDates) {
    const dayWords = telemetry.dailyTotals?.[dt] || 0;
    const files = telemetry.dailyFiles?.[dt] || [];
    const filesTouched: Record<string, number> = {};
    const filesGross: Record<string, Record<string, any>> = {};

    for (const f of files) {
      const baseName = f.fileName.replace(/\.md$/, '');
      filesTouched[baseName] = (filesTouched[baseName] || 0) + f.words;
      filesGross[baseName] = {
        added: f.words,
        removed: 0,
        net: f.words,
        filePath: f.filePath,
      };
    }

    history[dt] = {
      date: dt,
      netWords: dayWords,
      grossWordsAdded: dayWords,
      grossWordsRemoved: 0,
      goalMet: dayWords >= telemetry.dailyGoal,
      isRevision: false,
      filesTouched,
      filesGross,
      hourlyCounts: Array(24).fill(0),
    };
  }

  const exportPayload = {
    version: '1.0.0',
    source: 'scriptor',
    settings: {
      dailyGoal: telemetry.dailyGoal,
      logFolder: 'scriptor-plugin',
    },
    history,
    exLibrisColophon: {
      repairedAt: new Date().toISOString(),
      engine: 'Ex Libris Telemetry Doctor',
    },
  };

  return JSON.stringify(exportPayload, null, 2);
}
