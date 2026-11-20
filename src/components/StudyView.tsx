import React, { useState, useMemo } from 'react';
import {
  Book,
  LibraryBundle,
  UserLocalState,
  EnrichmentCacheMap,
  BookUserOverride,
  KindleClipping,
} from '../types/library';
import { computeNightstandDiagnostics } from '../lib/analytics/engine';
import {
  classifyBookLanguageAndFormat,
  FORMAT_LABELS,
} from '../lib/classifiers/languageAndFormat';
import { getGoodreadsBookUrl } from '../lib/links/goodreadsLinks';
import {
  BookOpen,
  Bookmark,
  Sparkles,
  ArrowRight,
  Star,
  Layers,
  Clock,
  PauseCircle,
  PlayCircle,
  Globe,
  ExternalLink,
} from 'lucide-react';

export interface StudyViewProps {
  bundle: LibraryBundle;
  userState?: UserLocalState;
  enrichmentCache?: EnrichmentCacheMap;
  onUpdateBookOverride?: (bookId: string, patch: Partial<BookUserOverride>) => void;
  onSelectBook: (book: Book) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
  onGoToOracle: () => void;
  onGoToLibraryWithFilter?: (filter: { shelf?: string; rating?: number }) => void;
  onOpenImport?: () => void;
  onClippingsUpdated?: (updated: KindleClipping[]) => void;
}

export const StudyView: React.FC<StudyViewProps> = ({
  bundle,
  userState,
  enrichmentCache,
  onUpdateBookOverride,
  onSelectBook,
  onGoToOracle,
  onGoToLibraryWithFilter,
}) => {
  const stats = bundle.summaryStats;
  const books = bundle.books || [];

  const totalBooks = stats?.totalBooks ?? books.length;
  const readBooksCount =
    stats?.shelves?.read ?? books.filter((b) => b.exclusiveShelf === 'read').length;
  const pagesRead =
    stats?.pages?.totalPagesRead ??
    books
      .filter((b) => b.exclusiveShelf === 'read')
      .reduce((sum, b) => sum + (b.pageCount || 0), 0);

  const toReadCount =
    stats?.shelves?.toRead ?? books.filter((b) => b.exclusiveShelf === 'to-read').length;
  const dnfCount =
    stats?.shelves?.didNotFinish ??
    books.filter((b) => b.exclusiveShelf === 'did-not-finish').length;
  const meanRating = stats?.ratings?.averageRating ?? 4.01;

  // ------------------------------------------------------------------
  // 1. Nightstand Diagnostics & Split (Active This Week vs On Hold)
  // ------------------------------------------------------------------
  const nightstandDiagnostics = useMemo(
    () => computeNightstandDiagnostics(bundle, userState),
    [bundle, userState]
  );

  const [nightstandTab, setNightstandTab] = useState<'active' | 'on-hold'>('active');

  const activeDiagnostics = useMemo(
    () => nightstandDiagnostics.filter((d) => d.state === 'active'),
    [nightstandDiagnostics]
  );

  const onHoldDiagnostics = useMemo(
    () => nightstandDiagnostics.filter((d) => d.state === 'on-hold'),
    [nightstandDiagnostics]
  );

  const displayedDiagnostics =
    nightstandTab === 'active' ? activeDiagnostics : onHoldDiagnostics;

  // Handle page check-in change
  const handlePageChange = (bookId: string, newPage: number, totalPages: number | null) => {
    const clamped = Math.max(0, totalPages ? Math.min(totalPages, newPage) : newPage);
    onUpdateBookOverride?.(bookId, { currentPage: clamped });
  };

  const handlePageStep = (
    bookId: string,
    current: number,
    step: number,
    totalPages: number | null
  ) => {
    const newPage = (current || 0) + step;
    handlePageChange(bookId, newPage, totalPages);
  };

  return (
    <div className="space-y-10 pb-16">
      {/* 1. Archival KPI Strip */}
      <section aria-label="Archival Summary" className="pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Total Books */}
          <div
            onClick={() => onGoToLibraryWithFilter?.({})}
            className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs hover:border-[var(--accent-primary)]/40 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
              <span className="text-xs uppercase font-medium tracking-wider">Archive</span>
              <BookOpen className="w-3.5 h-3.5 group-hover:text-[var(--accent-primary)] transition-colors" />
            </div>
            <div className="font-serif-editorial text-2xl sm:text-3xl font-bold text-[var(--text-ink)]">
              {totalBooks.toLocaleString()}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">Total Volumes</div>
          </div>

          {/* Read & Pages */}
          <div
            onClick={() => onGoToLibraryWithFilter?.({ shelf: 'read' })}
            className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs hover:border-[var(--accent-secondary)]/40 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
              <span className="text-xs uppercase font-medium tracking-wider">Completed</span>
              <Layers className="w-3.5 h-3.5 group-hover:text-[var(--accent-secondary)] transition-colors" />
            </div>
            <div className="font-serif-editorial text-2xl sm:text-3xl font-bold text-[var(--text-ink)]">
              {readBooksCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono-tabular mt-0.5">
              {pagesRead.toLocaleString()} Pages Read
            </div>
          </div>

          {/* On Desk */}
          <div
            onClick={() => {
              setNightstandTab('active');
            }}
            className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs hover:border-[var(--accent-primary)]/40 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
              <span className="text-xs uppercase font-medium tracking-wider text-[var(--accent-primary)] font-semibold">
                On Desk
              </span>
              <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            </div>
            <div className="font-serif-editorial text-2xl sm:text-3xl font-bold text-[var(--accent-primary)]">
              {activeDiagnostics.length}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              Active Reads {onHoldDiagnostics.length > 0 && `(+${onHoldDiagnostics.length} on hold)`}
            </div>
          </div>

          {/* To-Read */}
          <div
            onClick={() => onGoToLibraryWithFilter?.({ shelf: 'to-read' })}
            className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs hover:border-[var(--accent-gold)]/40 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
              <span className="text-xs uppercase font-medium tracking-wider">Queue</span>
              <Bookmark className="w-3.5 h-3.5 group-hover:text-[var(--accent-gold)] transition-colors" />
            </div>
            <div className="font-serif-editorial text-2xl sm:text-3xl font-bold text-[var(--text-ink)]">
              {toReadCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">Waiting on TBR</div>
          </div>

          {/* DNF */}
          <div
            onClick={() => onGoToLibraryWithFilter?.({ shelf: 'did-not-finish' })}
            className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs hover:border-[var(--border-ledger)] transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
              <span className="text-xs uppercase font-medium tracking-wider">DNF Shelf</span>
              <span className="text-[10px] font-mono-tabular px-1.5 py-0.2 rounded bg-[var(--bg-surface)] text-[var(--text-muted)]">
                Relinquished
              </span>
            </div>
            <div className="font-serif-editorial text-2xl sm:text-3xl font-bold text-[var(--text-ink)]">
              {dnfCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">Abandoned Volumes</div>
          </div>

          {/* Mean Rating */}
          <div className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-1">
              <span className="text-xs uppercase font-medium tracking-wider">Mean Rating</span>
              <Star className="w-3.5 h-3.5 fill-[var(--accent-gold)] text-[var(--accent-gold)]" />
            </div>
            <div className="font-serif-editorial text-2xl sm:text-3xl font-bold text-[var(--text-ink)]">
              {meanRating.toFixed(2)}
              <span className="text-base text-[var(--accent-gold)] ml-1">★</span>
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono-tabular mt-0.5">
              Personal Critical Avg
            </div>
          </div>
        </div>
      </section>

      {/* 2. The Reading Desk with Nightstand Split & Live Page Check-In */}
      <section aria-labelledby="desk-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
            <h2
              id="desk-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              The Reading Desk
            </h2>
            <span className="text-xs font-mono-tabular px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-semibold">
              {activeDiagnostics.length} active
            </span>
          </div>

          {/* Active Reads vs On Hold Tab Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)]">
            <button
              onClick={() => setNightstandTab('active')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                nightstandTab === 'active'
                  ? 'bg-[var(--accent-primary)] text-white font-semibold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Active Reads ({activeDiagnostics.length})</span>
            </button>

            <button
              onClick={() => setNightstandTab('on-hold')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                nightstandTab === 'on-hold'
                  ? 'bg-[var(--accent-primary)] text-white font-semibold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
              }`}
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>On Hold ({onHoldDiagnostics.length})</span>
            </button>
          </div>
        </div>

        {displayedDiagnostics.length === 0 ? (
          <div className="p-8 rounded-lg border border-dashed border-[var(--border-ledger)] text-center bg-[var(--bg-card)]">
            <BookOpen className="w-8 h-8 text-[var(--text-muted)]/50 mx-auto mb-2" />
            <p className="font-serif-editorial text-lg text-[var(--text-ink)]">
              {nightstandTab === 'active'
                ? 'No active books on desk.'
                : 'No books currently on hold.'}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {nightstandTab === 'active'
                ? 'Draw a recommendation from The Oracle or resume a paused read from On Hold.'
                : 'Any book can be paused to keep your desk focused on active reading.'}
            </p>
            {nightstandTab === 'active' && (
              <button
                onClick={onGoToOracle}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent-primary)] text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Consult The Oracle</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayedDiagnostics.map((diagnostic) => {
              const {
                book,
                state,
                currentPage,
                totalPages,
                percentComplete,
                format,
              } = diagnostic;

              const profile = classifyBookLanguageAndFormat(
                book,
                userState?.bookOverrides?.[book.id],
                enrichmentCache?.[book.id]
              );

              const gr = getGoodreadsBookUrl(book);

              return (
                <div
                  key={book.id}
                  className={`group relative flex flex-col justify-between p-5 rounded-lg bg-[var(--bg-card)] border transition-all duration-200 shadow-2xs overflow-hidden ${
                    state === 'on-hold'
                      ? 'border-[var(--border-ledger)] opacity-85'
                      : 'border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/80 hover:shadow-md'
                  }`}
                >
                  {/* Top Accent Strip */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${
                      state === 'on-hold'
                        ? 'bg-[var(--text-muted)]/40'
                        : 'bg-[var(--accent-primary)]/80'
                    }`}
                  />

                  <div>
                    {/* Header: Format Badge, Language Flow, State Toggle */}
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Format Badge */}
                        <span className="text-[10px] font-mono-tabular uppercase px-1.5 py-0.5 rounded border border-[var(--border-ledger)] bg-[var(--bg-surface)] text-[var(--text-muted)] font-medium">
                          {FORMAT_LABELS[format] || format}
                        </span>

                        {/* Language Passport Badge */}
                        <span className="flex items-center gap-1 text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-ink)] border border-[var(--border-ledger)]">
                          <Globe className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                          <span>{profile.translationFlow}</span>
                        </span>
                      </div>

                      {/* State Toggle Button (Active <-> On Hold) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextState = state === 'active' ? 'on-hold' : 'active';
                          onUpdateBookOverride?.(book.id, { nightstandState: nextState });
                        }}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-ink)] px-2 py-0.5 rounded hover:bg-[var(--bg-surface)] border border-transparent hover:border-[var(--border-ledger)] transition-colors cursor-pointer"
                        title={state === 'active' ? 'Move to On Hold' : 'Resume to Active Reads'}
                      >
                        {state === 'active' ? 'Pause' : 'Resume'}
                      </button>
                    </div>

                    {/* Book Title & Author */}
                    <div
                      onClick={() => onSelectBook(book)}
                      className="cursor-pointer"
                    >
                      {book.seriesName && (
                        <div className="text-[11px] font-medium text-[var(--accent-secondary)] mb-0.5 truncate">
                          {book.seriesName} {book.seriesNumber ? `#${book.seriesNumber}` : ''}
                        </div>
                      )}

                      <h3 className="font-serif-editorial text-lg font-bold leading-snug text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors line-clamp-2">
                        {book.cleanTitle || book.title}
                      </h3>

                      <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">
                        by <span className="text-[var(--text-ink)]">{book.author}</span>
                      </p>
                    </div>

                    {/* Live Page Check-In & Progress Bar */}
                    <div className="mt-4 p-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--text-ink)]">Current Progress:</span>
                        <span className="font-mono-tabular text-[var(--text-muted)]">
                          {currentPage} / {totalPages ?? '—'} pp. ({percentComplete}%)
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-ledger)]">
                        <div
                          className="h-full bg-[var(--accent-primary)] transition-all duration-300"
                          style={{ width: `${percentComplete}%` }}
                        />
                      </div>

                      {/* Stepper Inputs */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] text-[var(--text-muted)]">Page:</label>
                          <input
                            type="number"
                            min="0"
                            max={totalPages ?? 9999}
                            value={currentPage}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              handlePageChange(book.id, Number.isNaN(val) ? 0 : val, totalPages);
                            }}
                            className="w-16 px-1.5 py-0.5 rounded text-xs font-mono-tabular bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[var(--text-ink)] focus:border-[var(--accent-primary)] outline-hidden text-center"
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handlePageStep(book.id, currentPage, 10, totalPages)}
                            className="px-2 py-0.5 rounded text-[11px] font-mono-tabular bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] text-[var(--text-muted)] transition-colors cursor-pointer"
                            title="Add 10 pages"
                          >
                            +10p
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePageStep(book.id, currentPage, 25, totalPages)}
                            className="px-2 py-0.5 rounded text-[11px] font-mono-tabular bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] text-[var(--text-muted)] transition-colors cursor-pointer"
                            title="Add 25 pages"
                          >
                            +25p
                          </button>
                        </div>
                      </div>

                      {(() => {
                        const kt = userState?.kindleTelemetry?.books?.[book.id];
                        const wpm = kt?.wpm ?? userState?.kindleTelemetry?.medianWpm ?? null;
                        const estHoursLeft =
                          wpm && totalPages && totalPages > currentPage
                            ? Math.round((((totalPages - currentPage) * 275) / wpm / 60) * 10) / 10
                            : null;
                        if (!kt && estHoursLeft === null) return null;
                        return (
                          <div className="pt-1.5 border-t border-[var(--border-ledger)]/60 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
                            <span>
                              {kt
                                ? `Kindle: ${kt.wpm ?? '—'} WPM · ${kt.hoursRead}h`
                                : `Est. @ ${wpm} WPM`}
                            </span>
                            {estHoursLeft !== null && (
                              <span className="text-[var(--text-ink)] font-semibold">
                                ~{estHoursLeft}h left
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Card Footer: Goodreads Link & Open Dossier */}
                  <div className="mt-4 pt-3 border-t border-[var(--border-ledger)]/70 flex items-center justify-between gap-2">
                    <a
                      href={gr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border-ledger)] hover:border-[var(--accent-gold)]/60 bg-[var(--bg-surface)] hover:bg-[var(--accent-gold)]/10 text-[10px] font-mono-tabular text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors"
                      title={gr.label}
                      aria-label={`Open ${book.cleanTitle || book.title} on Goodreads`}
                    >
                      <span>GR</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                    </a>

                    <button
                      type="button"
                      onClick={() => onSelectBook(book)}
                      className="inline-flex items-center gap-1 text-[11px] font-mono-tabular font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
                      title="Open full book dossier"
                    >
                      <span>Open Dossier</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default StudyView;
