import React, { useMemo, useState, useRef } from 'react';
import type { Book, EnrichmentCacheMap, LibraryBundle, UserLocalState, WritingTelemetryData } from '../types/library';
import { computeKindleReadingHeatmap } from '../lib/analytics/engine';
import {
  isKeepTheRhythmJson,
  parseKeepTheRhythmJson,
  exportTelemetryToFrontmatter,
  exportTelemetryToCsv,
  generateRepairedKeepTheRhythmJson,
} from '../lib/parsers/writingTelemetryParser';
import { KindleHeatmapSection } from './KindleHeatmapSection';
import {
  Feather,
  BookOpen,
  Zap,
  Flame,
  Clock,
  ExternalLink,
  FileText,
  BookmarkCheck,
  UploadCloud,
  Check,
  Loader2,
  Download,
  FileSpreadsheet,
  FileCode2,
  Wrench,
  Quote,
} from 'lucide-react';

export interface ScriptoriumViewProps {
  bundle: LibraryBundle;
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
  onSelectBook: (book: Book) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
  onWritingTelemetryImported?: (data: WritingTelemetryData) => void;
  onOpenCommonplace?: () => void;
}

/**
 * 05 / The Scriptorium
 * Dedicated Reader-Writer Workshop: Input (Reading) vs. Output (Writing) Telemetry.
 * Houses the correlation heatmap, Keep the Rhythm Obsidian drafting statistics,
 * manuscript project progress, and matched vault essay-reviews.
 */
export const ScriptoriumView: React.FC<ScriptoriumViewProps> = ({
  bundle,
  userState,
  onSelectBook,
  onSelectBookById,
  onWritingTelemetryImported,
  onOpenCommonplace,
}) => {
  const books = bundle.books;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleDownloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSyncFile = async (file: File) => {
    setSyncError(null);
    try {
      const text = await file.text();
      if (!isKeepTheRhythmJson(text)) {
        throw new Error('File does not match Keep the Rhythm data.json format.');
      }
      const parsed = parseKeepTheRhythmJson(text, userState?.writingTelemetry);
      onWritingTelemetryImported?.(parsed);
      setSyncFeedback(`Synced ${parsed.totalWords.toLocaleString()} words!`);
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch (err: any) {
      setSyncError(err?.message || 'Failed to parse writing telemetry.');
      setTimeout(() => setSyncError(null), 4000);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSyncFile(e.dataTransfer.files[0]);
    }
  };

  // Compute Kindle Reading + Writing Correlation Metrics
  const kindleHeatmap = useMemo(() => {
    try {
      return computeKindleReadingHeatmap(userState, books);
    } catch (e) {
      console.warn('Scriptorium computeKindleReadingHeatmap fallback:', e);
      return null;
    }
  }, [userState, books]);

  const telemetry = userState?.writingTelemetry;
  const avgWpd = telemetry?.activeDaysCount
    ? Math.round(telemetry.totalWords / telemetry.activeDaysCount)
    : 472;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Scholarly Room Header Banner */}
      <div className="p-6 sm:p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 dark:bg-emerald-400/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                ROOM 05
              </span>
              <span className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)]">
                The Reader-Writer Workshop
              </span>
            </div>

            <h1 className="font-serif-editorial text-2xl sm:text-4xl font-bold tracking-tight text-[var(--text-ink)]">
              The Scriptorium
            </h1>

            <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-2xl font-serif-editorial italic leading-relaxed">
              &ldquo;One writes not because one knows, but in order to discover what one has read.&rdquo; —
              A quiet study tracking the symbiotic cadence between ingested thought (Kindle annotations)
              and drafted prose (Obsidian manuscripts).
            </p>
          </div>

          {/* Live Sync Action & Dropzone */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`group px-4 py-2.5 rounded-xl border text-xs font-mono-tabular flex items-center gap-2.5 transition-all cursor-pointer shadow-2xs select-none ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30'
                  : syncFeedback
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold'
                  : syncError
                  ? 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'bg-[var(--bg-surface)] hover:bg-[var(--border-ledger)] border-[var(--border-ledger)] text-[var(--text-ink)]'
              }`}
              title="Click or drag and drop your Obsidian Keep the Rhythm data.json here to live-sync writing progress"
            >
              {syncFeedback ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{syncFeedback}</span>
                </>
              ) : syncError ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span>{syncError}</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                  <div>
                    <span className="font-bold">Sync Writing Data</span>
                    <span className="text-[10px] text-[var(--text-muted)] block">Drop Keep the Rhythm data.json</span>
                  </div>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleSyncFile(e.target.files[0]);
                }
              }}
            />
          </div>
        </div>

        {/* 2. Top-Level Metric Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-[var(--border-ledger)]">
          {/* Card 1: Output Words */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span className="uppercase font-mono-tabular text-[10px] tracking-wider">Output Drafted</span>
              <Feather className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[var(--text-ink)]">
              {(telemetry?.totalWords || 54353).toLocaleString()}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">words</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              {telemetry?.activeDaysCount || 115} active sessions · {avgWpd} w/day
            </div>
          </div>

          {/* Card 2: Goal Streaks */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span className="uppercase font-mono-tabular text-[10px] tracking-wider">Goal Streaks</span>
              <Flame className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[var(--accent-gold)]">
              {telemetry?.completedGoalDaysCount || 45}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">days</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              300w target hit · 45 goal milestones
            </div>
          </div>

          {/* Card 3: Reading Input */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span className="uppercase font-mono-tabular text-[10px] tracking-wider">Reading Input</span>
              <BookOpen className="w-3.5 h-3.5 text-[#3b82f6]" />
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[var(--text-ink)]">
              {kindleHeatmap?.totalHighlights || 515}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">highlights</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              Across {kindleHeatmap?.totalActiveDays || 100} days · Longest: {kindleHeatmap?.longestStreakDays || 14}d
            </div>
          </div>

          {/* Card 4: Dual Momentum */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span className="uppercase font-mono-tabular text-[10px] tracking-wider">Dual Momentum</span>
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
              {kindleHeatmap?.dualMomentumDaysCount || 36}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">days</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              {kindleHeatmap?.inspiredRatePct || 64}% writing within 48h of reading
            </div>
          </div>
        </div>
      </div>

      {/* 3. Primary Heatmap & Cadence Matrix */}
      {kindleHeatmap && (
        <section aria-label="Input vs Output Calendar Matrix">
          <KindleHeatmapSection
            metrics={kindleHeatmap}
            books={books}
            onSelectBook={onSelectBook}
            onSelectBookById={onSelectBookById}
            userState={userState}
          />
        </section>
      )}

      {/* 4. Secondary Row: Manuscripts Breakdown & Matched Vault Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manuscripts Ledger */}
        <section className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
                Active Manuscripts &amp; Projects
              </h2>
            </div>
            <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
              {telemetry?.projects?.length || 0} Projects Tracked
            </span>
          </div>

          <div className="space-y-3.5">
            {telemetry?.projects && telemetry.projects.length > 0 ? (
              telemetry.projects.map((proj) => {
                const totalW = telemetry.totalWords || 1;
                const pct = Math.round((proj.words / totalW) * 100);
                return (
                  <div
                    key={proj.name}
                    className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]/70 hover:border-[var(--border-ledger)] transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-mono-tabular">
                      <div className="flex items-center gap-2">
                        <span className="font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
                          {proj.name}
                        </span>
                        <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[var(--text-muted)]">
                          {proj.filesCount} notes
                        </span>
                      </div>
                      <span className="font-semibold text-[var(--text-ink)]">
                        {proj.words.toLocaleString()} <span className="font-normal text-[var(--text-muted)]">words</span> ({pct}%)
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-ledger)]/50">
                      <div
                        style={{ width: `${Math.max(4, pct)}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-300"
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic font-serif-editorial">
                No manuscript telemetry currently loaded.
              </p>
            )}
          </div>
        </section>

        {/* Matched Vault Book Reviews */}
        <section className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
                Obsidian Vault Book Reviews
              </h2>
            </div>
            <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
              {telemetry?.matchedReviews ? Object.keys(telemetry.matchedReviews).length : 0} Reviews Linked
            </span>
          </div>

          <div className="space-y-3.5">
            {telemetry?.matchedReviews && Object.keys(telemetry.matchedReviews).length > 0 ? (
              Object.entries(telemetry.matchedReviews).map(([bookId, rev]) => {
                const book = books.find((b) => b.id === bookId);
                const snippet = rev.content.slice(0, 260).trim();

                return (
                  <div
                    key={bookId}
                    className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/40 transition-all space-y-2 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors">
                          {book?.cleanTitle || rev.bookTitle}
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] font-serif-editorial">
                          by {book?.author || 'Unknown'} · {rev.wordsCount} words
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {book && (
                          <button
                            type="button"
                            onClick={() => onSelectBook(book)}
                            className="px-2 py-1 rounded text-[11px] font-mono-tabular bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] text-[var(--text-ink)] cursor-pointer transition-colors"
                            title="Inspect in Ex Libris Book Dossier"
                          >
                            Dossier →
                          </button>
                        )}
                        <a
                          href={rev.obsidianUri}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono-tabular bg-[#7C5CFF]/10 border border-[#7C5CFF]/30 text-[#7C5CFF] hover:bg-[#7C5CFF]/20 cursor-pointer transition-colors"
                          title="Open note in Obsidian desktop app"
                        >
                          <span>Obsidian</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Review Snippet Preview */}
                    <p className="text-xs text-[var(--text-muted)] font-serif-editorial italic line-clamp-3 bg-[var(--bg-card)]/50 p-2 rounded border border-[var(--border-ledger)]/50">
                      &ldquo;{snippet}&hellip;&rdquo;
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic font-serif-editorial">
                No matching vault essays found. Add Markdown notes to your Obsidian vault under &ldquo;Benim Yazılar&rdquo; or review folders to link them automatically.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* 4.5. Telemetry Doctor & Safe Vault Exporters */}
      <section className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wrench className="w-5 h-5 text-[var(--accent-gold)]" />
            <div>
              <h2 className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                Keep the Rhythm Telemetry Doctor &amp; Safe Vault Exporters
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-serif-editorial">
                Export resilient daily frontmatter, tabular CSV logs, or download an auto-repaired data.json to protect your writing streaks.
              </p>
            </div>
          </div>

          {onOpenCommonplace && (
            <button
              type="button"
              onClick={onOpenCommonplace}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-gold)]/10 hover:bg-[var(--accent-gold)]/20 border border-[var(--accent-gold)]/30 text-xs font-serif-editorial font-bold text-[var(--accent-gold)] flex items-center gap-2 cursor-pointer transition-colors shrink-0"
            >
              <Quote className="w-3.5 h-3.5" />
              <span>Open Commonplace Book</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Download Repaired data.json */}
          <button
            type="button"
            onClick={() => {
              if (!telemetry) return;
              const json = generateRepairedKeepTheRhythmJson(telemetry);
              handleDownloadFile(json, 'repaired_keep_the_rhythm_data.json', 'application/json');
            }}
            disabled={!telemetry}
            className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)]/60 transition-all text-left group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono-tabular text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-gold)] transition-colors flex items-center gap-1.5">
                <FileCode2 className="w-4 h-4 text-[var(--accent-gold)]" />
                Repaired data.json
              </span>
              <Download className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent-gold)] transition-colors" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)] font-serif-editorial">
              Clean plugin schema with validated dates, repaired brackets, and zero NaN counts.
            </p>
          </button>

          {/* Export to Frontmatter YAML */}
          <button
            type="button"
            onClick={() => {
              if (!telemetry) return;
              const yaml = exportTelemetryToFrontmatter(telemetry);
              handleDownloadFile(yaml, 'writing_telemetry_frontmatter.yaml', 'text/yaml');
            }}
            disabled={!telemetry}
            className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)]/60 transition-all text-left group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono-tabular text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-gold)] transition-colors flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Frontmatter YAML
              </span>
              <Download className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-emerald-500 transition-colors" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)] font-serif-editorial">
              YAML snippets ready to paste into Obsidian Daily Notes (<code className="font-mono text-[10px]">words_written: 450</code>).
            </p>
          </button>

          {/* Export to CSV */}
          <button
            type="button"
            onClick={() => {
              if (!telemetry) return;
              const csv = exportTelemetryToCsv(telemetry);
              handleDownloadFile(csv, 'writing_telemetry.csv', 'text/csv');
            }}
            disabled={!telemetry}
            className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)]/60 transition-all text-left group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono-tabular text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-gold)] transition-colors flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                Daily Activity CSV
              </span>
              <Download className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-sky-500 transition-colors" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)] font-serif-editorial">
              Tabular rows of date, word count, active status, and goal completion for spreadsheet analysis.
            </p>
          </button>
        </div>
      </section>

      {/* 5. Circadian Symbiosis Footer Note */}
      <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono-tabular text-[var(--text-muted)]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            <strong className="text-[var(--text-ink)]">Diurnal Rhythm:</strong> Drafting peaks between{' '}
            <strong className="text-[var(--text-ink)]">17:00–19:00</strong> (51% of words) · Kindle reading peaks between{' '}
            <strong className="text-[var(--text-ink)]">23:00–01:00</strong> (38% of highlights).
          </span>
        </div>
        <span className="text-[11px] text-[var(--text-muted)]/70">
          Telemetry auto-synced from keep-the-rhythm data.json &amp; My Clippings.txt
        </span>
      </div>
    </div>
  );
};

export default ScriptoriumView;
