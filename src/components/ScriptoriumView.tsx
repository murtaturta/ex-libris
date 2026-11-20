import React, { useMemo, useState, useRef } from 'react';
import type { Book, EnrichmentCacheMap, LibraryBundle, UserLocalState, WritingTelemetryData } from '../types/library';
import { computeKindleReadingHeatmap } from '../lib/analytics/engine';
import {
  isScriptorJson,
  parseScriptorJson,
} from '../lib/parsers/writingTelemetryParser';
import { KindleHeatmapSection } from './KindleHeatmapSection';
import { DualTrackTimeline } from './DualTrackTimeline';
import {
  Feather,
  BookOpen,
  Zap,
  Flame,
  ExternalLink,
  FileText,
  BookmarkCheck,
  UploadCloud,
  Check,
  Quote,
  Search,
  Shuffle,
  Star,
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

interface VaultPassage {
  id: string;
  content: string;
  attachedNote?: string | null;
  bookTitle: string;
  author: string;
  matchedBook: Book | null;
  bookId: string | null;
  bookRating: number | null;
  locationLabel: string | null;
  addedAt?: string | null;
}

/**
 * 05 / The Scriptorium
 * Dedicated Reader-Writer Workshop: Marginalia & Clippings Vault, Input vs. Output
 * calendar heatmap, Obsidian drafting statistics, manuscript projects, and vault reviews.
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

  // Marginalia Vault search/filter/shuffle state
  const [marginaliaSearch, setMarginaliaSearch] = useState('');
  const [marginaliaFilter, setMarginaliaFilter] = useState<'all' | 'notes' | 'canon'>('all');
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const handleSyncFile = async (file: File) => {
    setSyncError(null);
    try {
      const text = await file.text();
      if (!isScriptorJson(text)) {
        throw new Error('File does not match Scriptor .json format.');
      }
      const parsed = parseScriptorJson(text, userState?.writingTelemetry);
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

  // Book lookup for linking marginalia passages directly to Dossier
  const bookLookup = useMemo(() => {
    const byId = new Map<string, Book>();
    const byTitle = new Map<string, Book>();
    for (const b of books) {
      byId.set(b.id, b);
      if (b.cleanTitle) byTitle.set(b.cleanTitle.toLowerCase().trim(), b);
      if (b.title) byTitle.set(b.title.toLowerCase().trim(), b);
    }
    return { byId, byTitle };
  }, [books]);

  // Aggregate Marginalia Vault (userState.kindleClippings + book.kindleNotes fallback)
  const allPassages = useMemo<VaultPassage[]>(() => {
    const list: VaultPassage[] = [];
    const seen = new Set<string>();

    const clippings = userState?.kindleClippings || [];
    for (const c of clippings) {
      const content = c.content?.trim();
      if (!content || content.length < 12) continue;

      const title = c.cleanTitle || c.rawTitle || 'Untitled Volume';
      const dedupeKey = `${title.toLowerCase()}::${content.slice(0, 48).toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const matched =
        (c.matchedBookId ? bookLookup.byId.get(c.matchedBookId) : undefined) ||
        bookLookup.byTitle.get(title.toLowerCase().trim()) ||
        null;

      const locLabel = c.page
        ? `p. ${c.page}`
        : c.locationStart != null
        ? `Loc ${c.locationStart}${c.locationEnd != null && c.locationEnd !== c.locationStart ? `–${c.locationEnd}` : ''}`
        : null;

      list.push({
        id: c.id,
        content,
        attachedNote: c.attachedNote || null,
        bookTitle: matched?.cleanTitle || title,
        author: matched?.author || c.author || 'Unknown Author',
        matchedBook: matched,
        bookId: matched?.id || c.matchedBookId || null,
        bookRating: matched?.myRating ?? null,
        locationLabel: locLabel,
        addedAt: c.addedAt || null,
      });
    }

    // Fallback: include DSAR Kindle reading notes from book records not already represented
    for (const b of books) {
      const notes = b.kindleNotes || [];
      for (let i = 0; i < notes.length; i++) {
        const noteText = notes[i].noteText?.trim();
        if (!noteText || noteText.length < 12) continue;

        const title = b.cleanTitle || b.title;
        const dedupeKey = `${title.toLowerCase()}::${noteText.slice(0, 48).toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        list.push({
          id: `dsar-${b.id}-${i}`,
          content: noteText,
          attachedNote: null,
          bookTitle: title,
          author: b.author || 'Unknown Author',
          matchedBook: b,
          bookId: b.id,
          bookRating: b.myRating ?? null,
          locationLabel: notes[i].createdAt ? notes[i].createdAt.slice(0, 10) : 'Kindle Note',
          addedAt: notes[i].createdAt || null,
        });
      }
    }

    return list.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  }, [userState?.kindleClippings, books, bookLookup]);

  const filteredPassages = useMemo(() => {
    const q = marginaliaSearch.trim().toLowerCase();
    return allPassages.filter((p) => {
      if (marginaliaFilter === 'notes' && !p.attachedNote) return false;
      if (marginaliaFilter === 'canon' && p.bookRating !== 5) return false;

      if (!q) return true;
      return (
        p.content.toLowerCase().includes(q) ||
        p.bookTitle.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        (p.attachedNote ? p.attachedNote.toLowerCase().includes(q) : false)
      );
    });
  }, [allPassages, marginaliaSearch, marginaliaFilter]);

  const visiblePassages = useMemo(() => {
    if (filteredPassages.length <= 6) return filteredPassages;
    if (shuffleSeed === 0) return filteredPassages.slice(0, 6);

    const indexed = filteredPassages.map((item, idx) => {
      const hash = (((idx + 1) * 2654435761) ^ (shuffleSeed * 1597334677)) >>> 0;
      return { item, hash };
    });
    indexed.sort((a, b) => a.hash - b.hash);
    return indexed.slice(0, 6).map((x) => x.item);
  }, [filteredPassages, shuffleSeed]);

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
    : 0;

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* 1. Scholarly Room Header Banner & KPIs */}
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
              Tracking collected Kindle marginalia alongside drafted prose and Obsidian manuscripts.
            </p>
          </div>

          {/* Live Sync Dropzone + Commonplace Book Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {onOpenCommonplace && (
              <button
                type="button"
                onClick={onOpenCommonplace}
                className="px-4 py-2.5 rounded-xl bg-[var(--accent-gold)]/10 hover:bg-[var(--accent-gold)]/20 border border-[var(--accent-gold)]/35 text-xs font-serif-editorial font-bold text-[var(--accent-gold)] flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs"
              >
                <Quote className="w-4 h-4 shrink-0" />
                <span>Open Commonplace Book</span>
              </button>
            )}

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
              title="Click or drag and drop your Obsidian Scriptor .json (data.json or scriptor_telemetry_*.json) here to live-sync writing progress"
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
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      Drop Scriptor .json
                    </span>
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
          <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span className="uppercase font-mono-tabular text-[10px] tracking-wider">
                Output Drafted
              </span>
              <Feather className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[var(--text-ink)]">
              {(telemetry?.totalWords ?? 0).toLocaleString()}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">words</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              {telemetry?.activeDaysCount ?? 0} active sessions · {avgWpd} w/day
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span className="uppercase font-mono-tabular text-[10px] tracking-wider">
                Goal Streaks
              </span>
              <Flame className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[var(--accent-gold)]">
              {telemetry?.completedGoalDaysCount ?? 0}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">days</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              {telemetry?.dailyGoal ?? 300}w target hit
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span className="uppercase font-mono-tabular text-[10px] tracking-wider">
                Reading Input
              </span>
              <BookOpen className="w-3.5 h-3.5 text-[#3b82f6]" />
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[var(--text-ink)]">
              {kindleHeatmap?.totalHighlights ?? allPassages.length}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">highlights</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              Across {kindleHeatmap?.totalActiveDays || 0} days · Longest:{' '}
              {kindleHeatmap?.longestStreakDays || 0}d
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
              <span className="uppercase font-mono-tabular text-[10px] tracking-wider">
                Dual Momentum
              </span>
              <Zap className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
              {kindleHeatmap?.dualMomentumDaysCount || 0}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">days</span>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
              {kindleHeatmap?.inspiredRatePct || 0}% writing within 48h of reading
            </div>
          </div>
        </div>
      </div>

      {/* 3. Marginalia & Clippings Vault */}
      <section
        aria-labelledby="marginalia-vault-heading"
        className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2.5">
            <Quote className="w-4 h-4 text-[var(--accent-gold)] shrink-0" />
            <div>
              <h2
                id="marginalia-vault-heading"
                className="font-serif-editorial text-lg sm:text-xl font-bold text-[var(--text-ink)]"
              >
                Marginalia &amp; Clippings Vault
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                Showing {visiblePassages.length} of {filteredPassages.length} captured passages
                {allPassages.length !== filteredPassages.length
                  ? ` (${allPassages.length} total)`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShuffleSeed((s) => s + 1)}
              disabled={filteredPassages.length <= 6}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-ledger)] border border-[var(--border-ledger)] text-xs font-mono-tabular font-semibold text-[var(--text-ink)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Surface 6 different passages from your clippings vault"
            >
              <Shuffle className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Shuffle</span>
            </button>

            {onOpenCommonplace && (
              <button
                type="button"
                onClick={onOpenCommonplace}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-gold)]/10 hover:bg-[var(--accent-gold)]/20 border border-[var(--accent-gold)]/30 text-xs font-mono-tabular font-bold text-[var(--accent-gold)] transition-colors cursor-pointer"
              >
                <span>Open Full Commonplace Book</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter Strip */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={marginaliaSearch}
              onChange={(e) => {
                setMarginaliaSearch(e.target.value);
                setShuffleSeed(0);
              }}
              placeholder="Search passages, notes, titles, or authors..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] font-mono-tabular text-xs self-start sm:self-auto">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'notes', label: 'With Notes' },
                { id: 'canon', label: '5★ Canon' },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setMarginaliaFilter(pill.id);
                  setShuffleSeed(0);
                }}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  marginaliaFilter === pill.id
                    ? 'bg-[var(--accent-primary)] text-white font-semibold shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Passages Grid */}
        {visiblePassages.length === 0 ? (
          <div className="p-8 rounded-lg bg-[var(--bg-surface)] border border-dashed border-[var(--border-ledger)] text-center">
            <p className="font-serif-editorial text-sm italic text-[var(--text-muted)]">
              {allPassages.length === 0
                ? 'No Kindle clippings or highlights loaded yet. Import My Clippings.txt via the Archive menu to populate your vault.'
                : 'No passages matched your current search or filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visiblePassages.map((p) => (
              <article
                key={p.id}
                className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)]/60 transition-all flex flex-col justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (p.matchedBook) {
                          onSelectBook(p.matchedBook);
                        } else {
                          onSelectBookById(p.bookId, p.bookTitle);
                        }
                      }}
                      className="text-left group cursor-pointer min-w-0"
                    >
                      <h3 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors line-clamp-1">
                        {p.bookTitle}
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] font-mono-tabular truncate">
                        by {p.author}
                      </p>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular text-[10px]">
                      {p.bookRating === 5 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] font-bold border border-[var(--accent-gold)]/30">
                          <Star className="w-2.5 h-2.5 fill-[var(--accent-gold)]" />
                          <span>5★</span>
                        </span>
                      )}
                      {p.locationLabel && (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[var(--text-muted)]">
                          {p.locationLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <blockquote className="font-serif-editorial text-sm italic text-[var(--text-ink)] leading-relaxed border-l-2 border-[var(--accent-gold)]/60 pl-3 line-clamp-4">
                    &ldquo;{p.content}&rdquo;
                  </blockquote>

                  {p.attachedNote && (
                    <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] flex items-start gap-2 text-xs">
                      <Feather className="w-3.5 h-3.5 text-[var(--accent-gold)] shrink-0 mt-0.5" />
                      <div className="text-[var(--text-ink)] font-sans-ui leading-snug">
                        <span className="font-semibold text-[var(--accent-gold)] mr-1">Note:</span>
                        {p.attachedNote}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 4. Alternate Dual-Track Timeline View (Read Above · Spine · Written Below) */}
      <DualTrackTimeline
        books={books}
        userState={userState}
        readingGoals={bundle.readingGoals}
        onSelectBook={onSelectBook}
        onSelectBookById={onSelectBookById}
      />

      {/* 5. Primary Heatmap & Cadence Matrix */}
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

      {/* 5. Manuscripts Breakdown & Matched Vault Reviews */}
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
                        {proj.words.toLocaleString()}{' '}
                        <span className="font-normal text-[var(--text-muted)]">words</span> ({pct}%)
                      </span>
                    </div>

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
              {telemetry?.matchedReviews ? Object.keys(telemetry.matchedReviews).length : 0} Reviews
              Linked
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

                    <p className="text-xs text-[var(--text-muted)] font-serif-editorial italic line-clamp-3 bg-[var(--bg-card)]/50 p-2 rounded border border-[var(--border-ledger)]/50">
                      &ldquo;{snippet}&hellip;&rdquo;
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic font-serif-editorial">
                No matching vault essays found. Add Markdown notes to your Obsidian vault under your
                essays or book review folders to link them automatically.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ScriptoriumView;
