import React, { useState, useMemo } from 'react';
import {
  Book,
  LibraryBundle,
  UserLocalState,
  EnrichmentCacheMap,
  BookUserOverride,
  KindleClipping,
} from '../types/library';
import {
  computeNightstandDiagnostics,
  NightstandBookDiagnostic,
} from '../lib/analytics/engine';
import {
  classifyBookLanguageAndFormat,
  FORMAT_LABELS,
} from '../lib/classifiers/languageAndFormat';
import {
  BookOpen,
  Bookmark,
  Calendar,
  Sparkles,
  Quote,
  Feather,
  Shuffle,
  ArrowRight,
  Star,
  Layers,
  Clock,
  Compass,
  Search,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  UploadCloud,
  Check,
  Globe,
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
}

export const StudyView: React.FC<StudyViewProps> = ({
  bundle,
  userState,
  enrichmentCache,
  onUpdateBookOverride,
  onSelectBook,
  onSelectBookById,
  onGoToOracle,
  onGoToLibraryWithFilter,
  onOpenImport,
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

  // ------------------------------------------------------------------
  // 2. Kindle My Clippings.txt Highlights Vault
  // ------------------------------------------------------------------
  const kindleClippings = useMemo(
    () => userState?.kindleClippings || [],
    [userState?.kindleClippings]
  );

  const [clippingSearch, setClippingSearch] = useState('');
  const [clippingFilter, setClippingFilter] = useState<'all' | 'matched' | 'unshelved'>('all');
  const [visibleClippingsCount, setVisibleClippingsCount] = useState(6);

  const filteredClippings = useMemo(() => {
    let list = kindleClippings;

    if (clippingFilter === 'matched') {
      list = list.filter((c) => Boolean(c.matchedBookId));
    } else if (clippingFilter === 'unshelved') {
      list = list.filter((c) => !c.matchedBookId);
    }

    if (clippingSearch.trim()) {
      const q = clippingSearch.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.content.toLowerCase().includes(q) ||
          c.cleanTitle.toLowerCase().includes(q) ||
          (c.author && c.author.toLowerCase().includes(q)) ||
          (c.attachedNote && c.attachedNote.toLowerCase().includes(q))
      );
    }

    return list;
  }, [kindleClippings, clippingFilter, clippingSearch]);

  const matchedClippingsCount = useMemo(
    () => kindleClippings.filter((c) => Boolean(c.matchedBookId)).length,
    [kindleClippings]
  );
  const unshelvedClippingsCount = kindleClippings.length - matchedClippingsCount;

  // ------------------------------------------------------------------
  // 3. TBR Roulette
  // ------------------------------------------------------------------
  const toReadBooks = useMemo(
    () => books.filter((b) => b.exclusiveShelf === 'to-read'),
    [books]
  );
  const [rouletteBook, setRouletteBook] = useState<Book | null>(() => {
    return toReadBooks.length > 0
      ? toReadBooks[Math.floor(Math.random() * toReadBooks.length)]
      : null;
  });
  const [isSpinning, setIsSpinning] = useState(false);

  const handleSpinRoulette = () => {
    if (toReadBooks.length === 0) return;
    setIsSpinning(true);
    setTimeout(() => {
      const pick = toReadBooks[Math.floor(Math.random() * toReadBooks.length)];
      setRouletteBook(pick);
      setIsSpinning(false);
    }, 300);
  };

  // ------------------------------------------------------------------
  // 4. Marginalia, Drafts & Quotes visibility
  // ------------------------------------------------------------------
  const [visibleNotesCount, setVisibleNotesCount] = useState(4);
  const [visibleQuotesCount, setVisibleQuotesCount] = useState(3);

  const kindleNotes = bundle.kindleNotes || [];
  const quotes = bundle.quotes || [];
  const reviewDrafts = bundle.reviewDrafts || [];

  // Handle page check-in change
  const handlePageChange = (bookId: string, newPage: number, totalPages: number | null) => {
    const clamped = Math.max(0, totalPages ? Math.min(totalPages, newPage) : newPage);
    onUpdateBookOverride?.(bookId, { currentPage: clamped });
  };

  const handlePageStep = (bookId: string, current: number, step: number, totalPages: number | null) => {
    const newPage = (current || 0) + step;
    handlePageChange(bookId, newPage, totalPages);
  };

  return (
    <div className="space-y-12 pb-16">
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
                idleDays,
                isHibernatingCandidate,
                currentPage,
                totalPages,
                percentComplete,
                format,
                pacePagesPerDay,
                projectedFinishDate,
                targetFinishDate,
                pagesPerDayForTarget,
              } = diagnostic;

              const profile = classifyBookLanguageAndFormat(
                book,
                userState?.bookOverrides?.[book.id],
                enrichmentCache?.[book.id]
              );

              const daysRemaining =
                totalPages !== null && pacePagesPerDay > 0
                  ? Math.max(0, Math.ceil((totalPages - currentPage) / pacePagesPerDay))
                  : null;

              return (
                <div
                  key={book.id}
                  className={`group relative flex flex-col justify-between p-5 rounded-lg bg-[var(--bg-card)] border transition-all duration-200 shadow-2xs ${
                    state === 'on-hold'
                      ? 'border-[var(--border-ledger)] opacity-85'
                      : isHibernatingCandidate
                      ? 'border-[var(--accent-gold)] shadow-sm'
                      : 'border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/80 hover:shadow-md'
                  }`}
                >
                  {/* Top Accent Strip */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${
                      state === 'on-hold'
                        ? 'bg-[var(--text-muted)]/40'
                        : isHibernatingCandidate
                        ? 'bg-[var(--accent-gold)]'
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

                    {/* Hibernating Candidate Editorial Callout */}
                    {isHibernatingCandidate && (
                      <div className="mt-3 p-3 rounded-md bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/40 text-xs">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-[var(--accent-gold)] shrink-0 mt-0.5" />
                          <div className="space-y-1.5">
                            <p className="text-[var(--text-ink)] font-serif-editorial italic leading-tight">
                              Idle for {idleDays} days — Still actively reading or pause on hold?
                            </p>
                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateBookOverride?.(book.id, { nightstandState: 'active' });
                                }}
                                className="px-2 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[11px] font-medium text-[var(--text-ink)] hover:border-[var(--accent-gold)] cursor-pointer shadow-2xs"
                              >
                                Keep Active
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateBookOverride?.(book.id, { nightstandState: 'on-hold' });
                                }}
                                className="px-2 py-1 rounded bg-[var(--accent-primary)] text-white text-[11px] font-semibold hover:opacity-90 cursor-pointer shadow-xs"
                              >
                                Move to On Hold
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

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
                    </div>
                  </div>

                  {/* Format-Calibrated ETA Footer */}
                  <div className="mt-4 pt-3 border-t border-[var(--border-ledger)]/70 text-[11px] font-mono-tabular text-[var(--text-muted)] flex items-center justify-between">
                    {targetFinishDate && pagesPerDayForTarget !== null ? (
                      <span className="text-[var(--accent-primary)] font-semibold truncate">
                        🎯 Target: {pagesPerDayForTarget}p/day to finish by {targetFinishDate}
                      </span>
                    ) : projectedFinishDate ? (
                      <span className="truncate">
                        At {pacePagesPerDay}p/day ({FORMAT_LABELS[format]}), ~{daysRemaining ?? '?'}d left →{' '}
                        <strong className="text-[var(--text-ink)]">{projectedFinishDate}</strong>
                      </span>
                    ) : (
                      <span>Pace: {pacePagesPerDay}p/day calibrated</span>
                    )}

                    <span
                      onClick={() => onSelectBook(book)}
                      className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--accent-primary)] shrink-0 ml-1"
                      title="Open full book dossier"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Kindle `My Clippings.txt` Highlights Vault */}
      <section aria-labelledby="clippings-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Feather className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2
              id="clippings-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              Kindle Marginalia Vault
            </h2>
            <span className="text-xs font-mono-tabular px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[var(--text-muted)]">
              {kindleClippings.length} passages
            </span>
          </div>

          {kindleClippings.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Search Highlights */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search highlights & notes..."
                  value={clippingSearch}
                  onChange={(e) => setClippingSearch(e.target.value)}
                  className="pl-8 pr-3 py-1 rounded-md text-xs bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:border-[var(--accent-primary)] outline-hidden w-48 sm:w-56"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center p-0.5 rounded-md bg-[var(--bg-card)] border border-[var(--border-ledger)] text-xs">
                <button
                  onClick={() => setClippingFilter('all')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    clippingFilter === 'all'
                      ? 'bg-[var(--accent-primary)] text-white font-semibold shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  All ({kindleClippings.length})
                </button>
                <button
                  onClick={() => setClippingFilter('matched')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    clippingFilter === 'matched'
                      ? 'bg-[var(--accent-primary)] text-white font-semibold shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  Matched ({matchedClippingsCount})
                </button>
                <button
                  onClick={() => setClippingFilter('unshelved')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    clippingFilter === 'unshelved'
                      ? 'bg-[var(--accent-primary)] text-white font-semibold shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  Unshelved ({unshelvedClippingsCount})
                </button>
              </div>
            </div>
          )}
        </div>

        {kindleClippings.length === 0 ? (
          /* Empty State CTA */
          <div className="p-8 rounded-xl bg-[var(--bg-card)] border border-dashed border-[var(--border-ledger)] text-center max-w-lg mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] flex items-center justify-center mx-auto border border-[var(--accent-gold)]/20 shadow-xs">
              <Feather className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
                The Marginalia Vault is Empty
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto leading-relaxed">
                Plug your Kindle into your computer via USB and drop your{' '}
                <strong className="text-[var(--text-ink)]">My Clippings.txt</strong> file into the importer to view all your highlights, bookmarks, and reader notes paired with your library.
              </p>
            </div>
            <button
              onClick={onOpenImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent-primary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Import Kindle My Clippings.txt</span>
            </button>
          </div>
        ) : filteredClippings.length === 0 ? (
          <div className="p-6 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] text-center text-xs text-[var(--text-muted)]">
            No highlights match your current search or filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClippings.slice(0, visibleClippingsCount).map((clipping) => {
              const locationStamp =
                clipping.locationStart !== null
                  ? `Loc ${clipping.locationStart}${
                      clipping.locationEnd && clipping.locationEnd !== clipping.locationStart
                        ? `-${clipping.locationEnd}`
                        : ''
                    }`
                  : null;

              return (
                <div
                  key={clipping.id}
                  className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)]/50 transition-all shadow-2xs flex flex-col justify-between group"
                >
                  <div>
                    {/* Header: Title, Author, Matched Link */}
                    <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-[var(--border-ledger)]/60">
                      <div className="min-w-0">
                        <h4
                          onClick={() => {
                            if (clipping.matchedBookId) {
                              onSelectBookById(clipping.matchedBookId, clipping.cleanTitle);
                            }
                          }}
                          className={`font-serif-editorial text-sm font-bold text-[var(--text-ink)] line-clamp-1 ${
                            clipping.matchedBookId
                              ? 'group-hover:text-[var(--accent-primary)] cursor-pointer hover:underline'
                              : ''
                          }`}
                        >
                          {clipping.cleanTitle}
                        </h4>
                        {clipping.author && (
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {clipping.author}
                          </p>
                        )}
                      </div>

                      {clipping.matchedBookId ? (
                        <span className="shrink-0 text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] font-medium">
                          Library Matched
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)]">
                          Kindle Only
                        </span>
                      )}
                    </div>

                    {/* Highlight Passage */}
                    <blockquote className="font-serif-editorial text-sm italic leading-relaxed text-[var(--text-ink)] my-3">
                      “{clipping.content}”
                    </blockquote>

                    {/* Paired Reader's Note */}
                    {clipping.attachedNote && (
                      <div className="mt-3 p-3 rounded-md bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30 text-xs">
                        <div className="flex items-start gap-1.5 text-[var(--accent-gold)] font-semibold text-[11px] uppercase tracking-wider mb-1">
                          <Feather className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>Reader's Marginal Note</span>
                        </div>
                        <p className="text-[var(--text-ink)] italic leading-relaxed font-serif-editorial">
                          {clipping.attachedNote}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Stamp Footer */}
                  <div className="mt-4 pt-3 border-t border-[var(--border-ledger)]/60 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    <span>
                      {clipping.page ? `p. ${clipping.page}` : ''}
                      {clipping.page && locationStamp ? ' · ' : ''}
                      {locationStamp || ''}
                    </span>
                    {clipping.addedAt && <span>{clipping.addedAt.slice(0, 10)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredClippings.length > visibleClippingsCount && (
          <div className="text-center pt-2">
            <button
              onClick={() => setVisibleClippingsCount((prev) => prev + 6)}
              className="px-4 py-2 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
            >
              Show More Highlights ({filteredClippings.length - visibleClippingsCount} remaining)
            </button>
          </div>
        )}
      </section>

      {/* 4. Split Grid: Live DSAR Kindle Marginalia & Quick TBR Divination */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Left Column (2/3): Live DSAR Kindle Notes Stream */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Quote className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="font-serif-editorial text-xl font-bold tracking-tight text-[var(--text-ink)]">
                Status Marginalia Stream
              </h2>
              <span className="text-xs font-mono-tabular px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[var(--text-muted)]">
                {kindleNotes.length} entries
              </span>
            </div>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
              Extracted from Goodreads reading logs
            </span>
          </div>

          {kindleNotes.length === 0 ? (
            <div className="p-6 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] text-center text-xs text-[var(--text-muted)]">
              No status marginalia imported yet.
            </div>
          ) : (
            <div className="space-y-3">
              {kindleNotes.slice(0, visibleNotesCount).map((note, idx) => (
                <div
                  key={`${note.bookTitle}-${idx}`}
                  onClick={() => onSelectBookById(note.bookId, note.bookTitle)}
                  className="group p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/50 transition-colors shadow-2xs cursor-pointer relative"
                >
                  <div className="flex items-start gap-3">
                    <Quote className="w-5 h-5 text-[var(--accent-gold)] shrink-0 mt-0.5 opacity-80" />
                    <div className="flex-1 min-w-0">
                      <blockquote className="font-serif-editorial text-sm sm:text-base italic text-[var(--text-ink)] leading-relaxed">
                        “{note.noteText || note.activity}”
                      </blockquote>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="font-medium text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors underline decoration-dotted">
                          {note.bookTitle}
                        </span>
                        {note.createdAt && (
                          <>
                            <span>·</span>
                            <span className="font-mono-tabular text-[11px]">
                              {note.createdAt.slice(0, 10)}
                            </span>
                          </>
                        )}
                        {note.noteActivityType && (
                          <span className="px-1.5 py-0.2 rounded bg-[var(--bg-surface)] text-[10px] font-mono-tabular">
                            {note.noteActivityType}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {kindleNotes.length > visibleNotesCount && (
                <button
                  onClick={() => setVisibleNotesCount((prev) => prev + 5)}
                  className="w-full py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-ink)] border border-dashed border-[var(--border-ledger)] rounded-md hover:bg-[var(--bg-card)] transition-colors cursor-pointer"
                >
                  Show More Marginalia ({kindleNotes.length - visibleNotesCount} remaining)
                </button>
              )}
            </div>
          )}
        </section>

        {/* Right Column (1/3): Quick Oracle Roulette Widget & Review Drafts */}
        <div className="space-y-6">
          {/* Quick Oracle Roulette Card */}
          <section className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--accent-gold)]/40 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[var(--accent-gold)]/5 rounded-full blur-xl pointer-events-none" />

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent-gold)]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Desk Divination</span>
              </div>
              <button
                onClick={handleSpinRoulette}
                disabled={isSpinning || toReadBooks.length === 0}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--text-ink)] bg-[var(--bg-surface)] hover:bg-[var(--accent-gold)]/20 transition-colors cursor-pointer border border-[var(--border-ledger)]"
                title="Deal a fresh book from your TBR pile"
              >
                <Shuffle className={`w-3 h-3 ${isSpinning ? 'animate-spin' : ''}`} />
                <span>Deal Next</span>
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] mb-3 leading-relaxed">
              Stuck on what to read next? The desk roulette draws a candidate from your {toReadCount} TBR volumes:
            </p>

            {rouletteBook ? (
              <div
                onClick={() => onSelectBook(rouletteBook)}
                className={`p-3.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)] transition-all cursor-pointer group ${
                  isSpinning ? 'opacity-40 scale-98' : 'opacity-100 scale-100'
                }`}
              >
                <div className="text-[10px] uppercase font-mono-tabular text-[var(--accent-primary)] font-semibold mb-1">
                  Selected Candidate
                </div>
                <h4 className="font-serif-editorial text-base font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] line-clamp-2 transition-colors">
                  {rouletteBook.cleanTitle || rouletteBook.title}
                </h4>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  by <span className="text-[var(--text-ink)]">{rouletteBook.author}</span>
                </p>
                <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  <span>
                    {rouletteBook.pageCount ? `${rouletteBook.pageCount} pages` : 'Length unlisted'}
                  </span>
                  {rouletteBook.averageRating && (
                    <span className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-[var(--accent-gold)] text-[var(--accent-gold)]" />
                      {rouletteBook.averageRating.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic">
                No TBR volumes found in library.
              </p>
            )}

            <button
              onClick={onGoToOracle}
              className="mt-3.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-[var(--accent-primary)] text-white text-xs font-semibold hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Full Oracle Matcher &amp; Divination</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </section>

          {/* Unfinished Review Drafts */}
          {reviewDrafts.length > 0 && (
            <section className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-[var(--border-ledger)]">
                <Feather className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                <h3 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)]">
                  Unfinished Review Drafts
                </h3>
                <span className="text-[10px] font-mono-tabular px-1.5 py-0.2 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] ml-auto">
                  {reviewDrafts.length}
                </span>
              </div>
              <div className="space-y-2">
                {reviewDrafts.slice(0, 3).map((draft, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectBookById(draft.bookId, draft.bookTitle)}
                    className="p-2.5 rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--border-ledger)] transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-bold text-[var(--text-ink)] truncate">
                      {draft.bookTitle}
                    </div>
                    {draft.review && (
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mt-0.5 italic">
                        “{draft.review.replace(/<[^>]+>/g, '')}”
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 5. Commonplace Liked Quotes */}
      {quotes.length > 0 && (
        <section aria-labelledby="quotes-heading">
          <div className="flex items-center justify-between pb-2 mb-4 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Quote className="w-4 h-4 text-[var(--accent-secondary)]" />
              <h2
                id="quotes-heading"
                className="font-serif-editorial text-xl font-bold tracking-tight text-[var(--text-ink)]"
              >
                Commonplace Book: Liked Quotes
              </h2>
              <span className="text-xs font-mono-tabular px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[var(--text-muted)]">
                {quotes.length} passages
              </span>
            </div>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
              Culled from personal Goodreads reading archives
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quotes.slice(0, visibleQuotesCount).map((quote, idx) => (
              <div
                key={idx}
                className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-col justify-between hover:border-[var(--accent-secondary)]/40 transition-colors"
              >
                <blockquote className="font-serif-editorial text-sm sm:text-base italic leading-relaxed text-[var(--text-ink)]">
                  “{quote.quote}”
                </blockquote>
                <div className="mt-4 pt-3 border-t border-[var(--border-ledger)]/60 flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text-ink)] truncate max-w-[200px]">
                    {quote.origin || 'Unknown Source'}
                  </span>
                  {quote.createdAt && (
                    <span className="font-mono-tabular text-[11px]">
                      {quote.createdAt.slice(0, 10)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {quotes.length > visibleQuotesCount && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setVisibleQuotesCount((prev) => prev + 6)}
                className="px-4 py-2 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
              >
                Display More Commonplace Passages ({quotes.length - visibleQuotesCount} more)
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default StudyView;
