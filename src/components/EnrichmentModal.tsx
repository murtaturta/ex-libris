import React, { useState, useRef, useMemo } from 'react';
import { Book, EnrichmentCacheMap, UserLocalState } from '../types/library';
import { enrichBooksBatch } from '../lib/enrichment/metadataEnricher';
import {
  Sparkles,
  X,
  CheckCircle2,
  StopCircle,
  Database,
  BookOpen,
  Bookmark,
  Star,
  ImageIcon,
  Compass,
  Layers,
  RotateCw,
} from 'lucide-react';

export interface EnrichmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  enrichmentCache: EnrichmentCacheMap;
  userState: UserLocalState;
  onToggleCovers: () => void;
  onBatchFlushed: (batch: EnrichmentCacheMap) => Promise<void>;
}

type EnrichmentScope = 'rated' | 'tbr' | 'all';

export const EnrichmentModal: React.FC<EnrichmentModalProps> = ({
  isOpen,
  onClose,
  books,
  enrichmentCache,
  userState,
  onToggleCovers,
  onBatchFlushed,
}) => {
  const [activeScope, setActiveScope] = useState<EnrichmentScope>('rated');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    currentTitle: string;
  }>({ completed: 0, total: 0, currentTitle: '' });
  const [forceRecheck, setForceRecheck] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Filter book subsets
  const ratedBooks = useMemo(
    () => books.filter((b) => b.myRating !== null && b.myRating >= 1),
    [books]
  );
  const tbrBooks = useMemo(
    () => books.filter((b) => b.exclusiveShelf === 'to-read'),
    [books]
  );

  // Cache stats
  const cachedEntries = useMemo(() => Object.values(enrichmentCache), [enrichmentCache]);
  const totalCachedCount = cachedEntries.length;
  const synopsesCount = cachedEntries.filter((e) => Boolean(e.synopsis)).length;
  const ratingsCount = cachedEntries.filter((e) => e.communityRating != null).length;
  const coversCount = cachedEntries.filter((e) => Boolean(e.coverUrl)).length;

  // Uncached counts per scope
  const getUncachedCount = (bookList: Book[]) => {
    return bookList.filter((b) => {
      const cached = enrichmentCache[b.id];
      if (!cached) return true;
      if (forceRecheck && cached.source === 'none') return true;
      return false;
    }).length;
  };

  const uncachedRated = getUncachedCount(ratedBooks);
  const uncachedTbr = getUncachedCount(tbrBooks);
  const uncachedAll = getUncachedCount(books);

  if (!isOpen) return null;

  const handleStartEnrichment = async (scope: EnrichmentScope) => {
    setActiveScope(scope);
    setIsRunning(true);
    setStatusMessage(null);

    const targetBooks =
      scope === 'rated' ? ratedBooks : scope === 'tbr' ? tbrBooks : books;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      await enrichBooksBatch(targetBooks, enrichmentCache, {
        force: forceRecheck,
        signal,
        onProgress: (completed, total, currentTitle) => {
          setProgress({ completed, total, currentTitle });
        },
        onFlushBatch: async (batch) => {
          await onBatchFlushed(batch);
        },
      });

      if (!signal.aborted) {
        setStatusMessage('Enrichment batch completed successfully!');
      }
    } catch (err: any) {
      if (signal.aborted) {
        setStatusMessage('Enrichment paused.');
      } else {
        console.error('Batch enrichment error:', err);
        setStatusMessage(err?.message || 'Error occurred during metadata fetch.');
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
    setStatusMessage('Enrichment halted by reader.');
  };

  const percentComplete =
    progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        onClick={() => {
          if (!isRunning) onClose();
        }}
        className="drawer-backdrop fixed inset-0 transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-ledger)] shadow-2xl p-6 sm:p-7 overflow-hidden animate-card-draw">
        {/* Subtle decorative background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-[var(--accent-gold)]/5 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] flex items-center justify-center border border-[var(--accent-gold)]/30 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif-editorial text-xl font-bold text-[var(--text-ink)]">
                  Archive Metadata Enricher
                </h2>
                <span className="text-[10px] font-mono-tabular uppercase px-1.5 py-0.5 rounded border border-[var(--border-ledger)] text-[var(--text-muted)] bg-[var(--bg-card)]">
                  v0.2
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                1-Click OpenLibrary + Google Books Volume Reconciler
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (isRunning) handleStop();
              onClose();
            }}
            className="p-1.5 rounded-md hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
            title="Close enricher"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Disk Cache Overview */}
        <div className="mt-5 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-ink)]">
              <Database className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Local Disk Cache Status</span>
            </div>
            <span className="font-mono-tabular text-xs font-bold text-[var(--text-ink)]">
              {totalCachedCount} / {books.length} Books Cached (
              {books.length > 0 ? Math.round((totalCachedCount / books.length) * 100) : 0}%)
            </span>
          </div>

          {/* Progress Bar of Overall Cache Coverage */}
          <div className="w-full h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden border border-[var(--border-ledger)] mb-3">
            <div
              className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-gold)] transition-all duration-300"
              style={{
                width: `${books.length > 0 ? (totalCachedCount / books.length) * 100 : 0}%`,
              }}
            />
          </div>

          {/* Sub-metrics Strip */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
              <div className="font-mono-tabular font-bold text-sm text-[var(--text-ink)]">
                {synopsesCount}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">
                Synopses (Oracle)
              </div>
            </div>
            <div className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
              <div className="font-mono-tabular font-bold text-sm text-[var(--accent-gold)]">
                {ratingsCount}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">
                Community Ratings
              </div>
            </div>
            <div className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
              <div className="font-mono-tabular font-bold text-sm text-[var(--accent-secondary)]">
                {coversCount}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5">
                Book Covers
              </div>
            </div>
          </div>
        </div>

        {/* Live Running Progress Card */}
        {isRunning && (
          <div className="mt-4 p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--accent-gold)]/60 shadow-md animate-pulse-gentle">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-[var(--accent-gold)] animate-spin" />
                <span className="font-serif-editorial text-sm font-bold text-[var(--text-ink)]">
                  Enriching {activeScope.toUpperCase()} Catalog...
                </span>
              </div>
              <button
                onClick={handleStop}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--accent-primary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            </div>

            <div className="w-full h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden border border-[var(--border-ledger)] my-2">
              <div
                className="h-full bg-[var(--accent-gold)] transition-all duration-200"
                style={{ width: `${percentComplete}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono-tabular text-[var(--text-muted)]">
              <span className="truncate max-w-[340px] italic text-[var(--text-ink)]">
                {progress.currentTitle ? `“${progress.currentTitle}”` : 'Querying APIs...'}
              </span>
              <span>
                {progress.completed} / {progress.total} ({percentComplete}%)
              </span>
            </div>
          </div>
        )}

        {/* Status Message (if completed or paused) */}
        {!isRunning && statusMessage && (
          <div className="mt-4 p-3 rounded-md bg-[var(--bg-card)] border border-[var(--accent-secondary)]/50 text-xs text-[var(--text-ink)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* 3 Convenient 1-Click Scopes */}
        <div className="mt-5 space-y-2.5">
          <div className="text-xs uppercase font-semibold tracking-wider text-[var(--text-muted)] mb-1">
            Choose Enrichment Scope:
          </div>

          {/* Scope 1: Enrich Rated Books */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)]/60 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] flex items-center justify-center shrink-0 mt-0.5">
                <Star className="w-4 h-4 fill-[var(--accent-gold)]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-gold)] transition-colors">
                    Enrich Rated Books ({ratedBooks.length})
                  </h3>
                  <span className="text-[10px] font-mono-tabular px-1.5 py-0.2 rounded bg-[var(--accent-gold)]/20 text-[var(--accent-gold)] font-bold">
                    RECOMMENDED
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Fastest way (~25s) to unlock <strong>The Contrarian Index</strong> &amp; scatter plot in The Observatory!
                </p>
              </div>
            </div>

            <button
              onClick={() => handleStartEnrichment('rated')}
              disabled={isRunning || uncachedRated === 0}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer shadow-xs transition-all ${
                uncachedRated === 0
                  ? 'bg-[var(--bg-surface)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border-ledger)]'
                  : 'bg-[var(--accent-gold)] text-black hover:opacity-90'
              }`}
            >
              {uncachedRated === 0 ? 'Fully Enriched' : `Enrich ${uncachedRated} Books`}
            </button>
          </div>

          {/* Scope 2: Enrich TBR Queue */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-secondary)]/60 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] flex items-center justify-center shrink-0 mt-0.5">
                <Bookmark className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-secondary)] transition-colors">
                  Enrich TBR Queue ({tbrBooks.length})
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Populates rich synopses &amp; genres for <strong>The Oracle</strong> TBR discovery matcher!
                </p>
              </div>
            </div>

            <button
              onClick={() => handleStartEnrichment('tbr')}
              disabled={isRunning || uncachedTbr === 0}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer shadow-xs transition-all ${
                uncachedTbr === 0
                  ? 'bg-[var(--bg-surface)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border-ledger)]'
                  : 'bg-[var(--accent-secondary)] text-white hover:opacity-90'
              }`}
            >
              {uncachedTbr === 0 ? 'Fully Enriched' : `Enrich ${uncachedTbr} Books`}
            </button>
          </div>

          {/* Scope 3: Enrich Entire Library */}
          <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/60 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center shrink-0 mt-0.5">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors">
                  Enrich Entire Library ({books.length})
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Complete catalog sync across all shelves with polite API concurrency.
                </p>
              </div>
            </div>

            <button
              onClick={() => handleStartEnrichment('all')}
              disabled={isRunning || uncachedAll === 0}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer shadow-xs transition-all ${
                uncachedAll === 0
                  ? 'bg-[var(--bg-surface)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border-ledger)]'
                  : 'bg-[var(--accent-primary)] text-white hover:opacity-90'
              }`}
            >
              {uncachedAll === 0 ? 'Fully Enriched' : `Enrich ${uncachedAll} Books`}
            </button>
          </div>
        </div>

        {/* Options & Cover Art Setting */}
        <div className="mt-5 pt-4 border-t border-[var(--border-ledger)] space-y-3">
          {/* Show Covers Toggle */}
          <div className="flex items-center justify-between p-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
            <div className="flex items-center gap-2.5">
              <ImageIcon className="w-4 h-4 text-[var(--accent-primary)]" />
              <div>
                <div className="text-xs font-semibold text-[var(--text-ink)]">
                  Show Book Covers in Cards &amp; Dossier
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Defaults to Off for a distraction-free editorial layout. Toggle On anytime.
                </div>
              </div>
            </div>

            <button
              onClick={onToggleCovers}
              type="button"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                userState.showCovers ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-ledger)]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  userState.showCovers ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Force Re-enrich Toggle */}
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceRecheck}
              onChange={(e) => setForceRecheck(e.target.checked)}
              className="rounded border-[var(--border-ledger)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
            />
            <span>Re-query books that yielded no metadata in previous runs</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default EnrichmentModal;
