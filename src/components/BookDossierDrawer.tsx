import React, { useState, useEffect, useMemo } from 'react';
import {
  Book,
  BookFormat,
  BookUserOverride,
  EnrichmentCacheMap,
  KindleNote,
  LanguageCode,
  UserLocalState,
} from '../types/library';
import {
  classifyBookLanguageAndFormat,
  FORMAT_LABELS,
  LANGUAGE_LABELS,
} from '../lib/classifiers/languageAndFormat';
import { computeBookPacingArchetype } from '../lib/analytics/engine';
import { formatPublicationYear, formatReviewHtml } from '../lib/formatters';
import { getGoodreadsBookUrl, getGoodreadsAuthorUrl } from '../lib/links/goodreadsLinks';
import { downloadSingleBookMarkdown } from '../lib/exporters/markdownNoteExporter';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  Feather,
  AlertTriangle,
  Eye,
  EyeOff,
  Clock,
  Hash,
  Quote,
  Globe,
  PauseCircle,
  PlayCircle,
  Sparkles,
  RefreshCw,
  BookmarkCheck,
  ExternalLink,
  FileDown,
  FolderArchive,
} from 'lucide-react';

interface BookDossierDrawerProps {
  book: Book | null;
  isOpen: boolean;
  onClose: () => void;
  onPrevBook: () => void;
  onNextBook: () => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
  allKindleNotes: KindleNote[];
  userState: UserLocalState;
  onUpdateBookOverride: (bookId: string, patch: Partial<BookUserOverride>) => void;
  enrichmentCache: EnrichmentCacheMap;
  onEnrichBook: (book: Book) => Promise<void>;
}

const ALL_LANGUAGES: LanguageCode[] = [
  'EN',
  'TR',
  'FR',
  'DE',
  'RU',
  'JA',
  'PL',
  'ZH',
  'IT',
  'ES',
  'PT',
  'GRC',
  'OTHER',
];

const ALL_FORMATS: BookFormat[] = ['prose', 'comic-manga', 'short-essay', 'academic-ref'];

export const BookDossierDrawer: React.FC<BookDossierDrawerProps> = ({
  book,
  isOpen,
  onClose,
  onPrevBook,
  onNextBook,
  allKindleNotes = [],
  userState,
  onUpdateBookOverride,
  enrichmentCache,
  onEnrichBook,
}) => {
  // Spoilers state
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);

  // Local state for current page editing
  const [localCurrentPage, setLocalCurrentPage] = useState<string>('');

  // Reset states when book changes
  useEffect(() => {
    setSpoilerRevealed(false);
    setIsEnriching(false);
    if (book) {
      const override = userState?.bookOverrides?.[book.id];
      const page = override?.currentPage ?? (book.exclusiveShelf === 'read' ? book.pageCount ?? '' : '');
      setLocalCurrentPage(page !== '' && page !== null ? String(page) : '');
    }
  }, [book?.id, userState?.bookOverrides]);

  // Global keyboard listener for Esc, Left, Right
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        if (e.key === 'Escape') onClose();
        return;
      }

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrevBook) {
        onPrevBook();
      } else if (e.key === 'ArrowRight' && onNextBook) {
        onNextBook();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onPrevBook, onNextBook]);

  // Reviews formatted paragraphs
  const reviewParagraphs = useMemo(() => {
    if (!book?.myReview) return [];
    try {
      const res = formatReviewHtml(book.myReview);
      if (Array.isArray(res) && res.length > 0) return res;
    } catch (e) {
      console.warn('formatReviewHtml fallback:', e);
    }
    return book.myReview
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [book?.myReview]);

  // Matched Obsidian Vault literature review / essay
  const vaultReview = useMemo(() => {
    if (!book) return null;
    return userState?.writingTelemetry?.matchedReviews?.[book.id] || null;
  }, [book, userState?.writingTelemetry]);

  // Combined DSAR Kindle notes
  const combinedKindleNotes = useMemo(() => {
    if (!book) return [];
    const fromBook = book.kindleNotes || [];
    const fromArchive = allKindleNotes.filter(
      (n) =>
        (n.bookId && n.bookId === book.id) ||
        (n.bookTitle && n.bookTitle.toLowerCase() === book.title.toLowerCase())
    );

    const seen = new Set<string>();
    const result: Array<{ noteText: string; activity?: string; createdAt?: string }> = [];

    for (const note of [...fromBook, ...fromArchive]) {
      const text = note.noteText || (note as any).activity;
      if (text && !seen.has(text.trim())) {
        seen.add(text.trim());
        result.push({
          noteText: text,
          activity: (note as any).activity,
          createdAt: note.createdAt,
        });
      }
    }

    return result;
  }, [book, allKindleNotes]);

  // Attached Kindle `My Clippings.txt` highlights & paired notes
  const matchingClippings = useMemo(() => {
    if (!book) return [];
    const clippings = userState?.kindleClippings || [];
    return clippings.filter(
      (c) =>
        c.matchedBookId === book.id ||
        (c.cleanTitle &&
          book.cleanTitle &&
          c.cleanTitle.toLowerCase() === book.cleanTitle.toLowerCase())
    );
  }, [book, userState?.kindleClippings]);

  const pacingArchetype = useMemo(() => {
    if (!book || book.exclusiveShelf !== 'read') return null;
    return computeBookPacingArchetype(book, userState?.kindleClippings || []);
  }, [book, userState?.kindleClippings]);

  if (!isOpen || !book) return null;

  const override = userState?.bookOverrides?.[book.id];
  const enriched = enrichmentCache?.[book.id];
  const profile = classifyBookLanguageAndFormat(book, override, enriched);

  const originalYear = formatPublicationYear(book.originalPublicationYear || book.yearPublished);
  const editionYear = formatPublicationYear(book.yearPublished);

  const communityRating = book.averageRating ?? enriched?.communityRating ?? null;

  // Active reading progress calculations
  const totalPages = book.pageCount || 0;
  const currentPageNum = override?.currentPage ?? (book.exclusiveShelf === 'read' ? totalPages : 0);
  const progressPct =
    totalPages > 0 ? Math.min(100, Math.round((currentPageNum / totalPages) * 100)) : 0;

  const isNightstandActive = (override?.nightstandState ?? 'active') === 'active';

  const handleEnrich = async () => {
    if (isEnriching) return;
    setIsEnriching(true);
    try {
      await onEnrichBook(book);
    } catch (e) {
      console.error('Failed to enrich book:', e);
    } finally {
      setIsEnriching(false);
    }
  };

  const handlePageCommit = () => {
    const parsed = parseInt(localCurrentPage, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const clamped = totalPages > 0 ? Math.min(totalPages, parsed) : parsed;
      onUpdateBookOverride(book.id, { currentPage: clamped });
      setLocalCurrentPage(String(clamped));
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="drawer-backdrop fixed inset-0 transition-opacity"
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        <div className="w-screen max-w-2xl bg-[var(--bg-canvas)] border-l border-[var(--border-ledger)] shadow-2xl flex flex-col justify-between overflow-y-auto">
          {/* 1. Header Toolbar */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-[var(--bg-surface)]/95 backdrop-blur-md border-b border-[var(--border-ledger)] gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              {onPrevBook && (
                <button
                  onClick={onPrevBook}
                  className="flex items-center justify-center min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] p-2 rounded-md hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-ledger)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
                  title="Previous Volume (←)"
                  aria-label="Previous Volume"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {onNextBook && (
                <button
                  onClick={onNextBook}
                  className="flex items-center justify-center min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] p-2 rounded-md hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-ledger)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
                  title="Next Volume (→)"
                  aria-label="Next Volume"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {(() => {
                const gr = getGoodreadsBookUrl(book);
                return (
                  <a
                    href={gr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10 text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors truncate shadow-2xs"
                    title={gr.label}
                  >
                    <span className="truncate font-semibold">
                      {gr.isDirectEdition ? `Dossier #${book.id}` : 'Goodreads'}
                    </span>
                    <ExternalLink className="w-3 h-3 text-[var(--accent-gold)] shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                );
              })()}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => downloadSingleBookMarkdown(book, userState, enriched)}
                type="button"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] hover:border-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 text-xs font-mono-tabular font-medium text-[var(--text-ink)] transition-colors cursor-pointer shadow-2xs min-h-[40px]"
                title={`Download ${book.cleanTitle || book.title}.md for Obsidian / literature notes`}
                aria-label="Export Markdown Note"
              >
                <FileDown className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span className="hidden sm:inline">Export .md</span>
                <span className="sm:hidden text-[11px]">.md</span>
              </button>

              <button
                onClick={onClose}
                className="flex items-center justify-center min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] p-2 rounded-md hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-ledger)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
                title="Close Dossier (Esc)"
                aria-label="Close Dossier"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 2. Main Content Body */}
          <div className="flex-1 px-6 sm:px-8 py-6 space-y-6">
            {/* Title, Cover & Author Hero */}
            <div className="flex gap-4 sm:gap-6 items-start">
              {userState?.showCovers && enriched?.coverUrl && (
                <img
                  src={enriched.coverUrl}
                  alt={book.title}
                  className="w-20 sm:w-28 h-28 sm:h-40 object-cover rounded-lg shadow-md shrink-0 border border-[var(--border-ledger)]"
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2 text-xs font-mono-tabular">
                  <span
                    className={`px-2.5 py-0.5 rounded uppercase font-semibold text-[10px] ${
                      book.exclusiveShelf === 'read'
                        ? 'bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]'
                        : book.exclusiveShelf === 'currently-reading'
                        ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                        : book.exclusiveShelf === 'did-not-finish'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                        : 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]'
                    }`}
                  >
                    {book.exclusiveShelf === 'currently-reading' ? 'On Desk' : book.exclusiveShelf}
                  </span>

                  {book.seriesName && (
                    <span className="px-2.5 py-0.5 rounded bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] font-semibold text-[10px]">
                      {book.seriesName} {book.seriesNumber ? `#${book.seriesNumber}` : ''}
                    </span>
                  )}

                  {originalYear && (
                    <span className="text-[var(--text-muted)]">Orig: {originalYear}</span>
                  )}
                </div>

                <h2 className="font-serif-editorial text-2xl sm:text-3xl font-bold text-[var(--text-ink)] leading-snug tracking-tight">
                  {book.cleanTitle || book.title}
                </h2>

                <div className="mt-2 text-sm text-[var(--text-muted)] font-medium">
                  by{' '}
                  <a
                    href={getGoodreadsAuthorUrl(book.author)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--text-ink)] font-semibold text-base hover:underline hover:text-[var(--accent-primary)] transition-colors inline-block"
                    title={`Search ${book.author} on Goodreads`}
                  >
                    {book.author}
                  </a>
                  {book.additionalAuthors && book.additionalAuthors.length > 0 && (
                    <span className="text-xs ml-1.5 text-[var(--text-muted)]">
                      with {book.additionalAuthors.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Reading History (Read) OR Reading Progress & Nightstand (Unread / On Desk) */}
            {book.exclusiveShelf === 'read' ? (
              <section
                aria-labelledby="reading-history-heading"
                className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--accent-secondary)]" />
                    <h3
                      id="reading-history-heading"
                      className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold"
                    >
                      Reading History
                    </h3>
                  </div>

                  <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                    {(book.readCount || 1)}× read
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-mono-tabular">
                  <div>
                    <span className="text-[10px] uppercase text-[var(--text-muted)] block">
                      Date Read
                    </span>
                    <span className="font-semibold text-[var(--text-ink)]">
                      {book.dateRead ? book.dateRead.slice(0, 10) : 'Recorded'}
                    </span>
                  </div>

                  {pacingArchetype?.days != null && (
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-muted)] block">
                        Duration
                      </span>
                      <span className="font-semibold text-[var(--text-ink)]">
                        {pacingArchetype.days} days
                      </span>
                    </div>
                  )}

                  {pacingArchetype?.pagesPerDay != null && (
                    <div>
                      <span className="text-[10px] uppercase text-[var(--text-muted)] block">
                        Average Pace
                      </span>
                      <span className="font-semibold text-[var(--accent-primary)]">
                        ~{pacingArchetype.pagesPerDay} pp/day
                      </span>
                    </div>
                  )}
                </div>

                {pacingArchetype?.dateRange && (
                  <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    Span: <strong className="text-[var(--text-ink)]">{pacingArchetype.dateRange.start}</strong>{' '}
                    → <strong className="text-[var(--text-ink)]">{pacingArchetype.dateRange.finish}</strong>
                  </div>
                )}

                {book.readingSessions && book.readingSessions.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[var(--border-ledger)]/60 font-mono-tabular text-xs">
                    {book.readingSessions.map((session, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-[11px] text-[var(--text-muted)]"
                      >
                        <span>
                          Session {idx + 1}:{' '}
                          {session.startedAt ? session.startedAt.slice(0, 10) : 'Started'}
                          {session.endedAt ? ` → ${session.endedAt.slice(0, 10)}` : ''}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[10px] text-[var(--text-ink)] border border-[var(--border-ledger)]">
                          {session.durationDays ? `${session.durationDays}d · ` : ''}
                          {session.state}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {userState?.kindleTelemetry?.books?.[book.id] && (
                  <div className="pt-2 border-t border-[var(--border-ledger)]/60 flex items-center justify-between text-xs font-mono-tabular text-[var(--text-muted)]">
                    <span>Kindle Timer Speed</span>
                    <span className="text-[var(--text-ink)] font-semibold">
                      {userState.kindleTelemetry.books[book.id].wpm ?? '—'} WPM ·{' '}
                      {userState.kindleTelemetry.books[book.id].hoursRead}h tracked
                    </span>
                  </div>
                )}
              </section>
            ) : (
              <section
                aria-labelledby="nightstand-studio-heading"
                className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--accent-primary)]" />
                    <h3
                      id="nightstand-studio-heading"
                      className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold"
                    >
                      Reading Progress &amp; Nightstand
                    </h3>
                  </div>

                  <button
                    onClick={() =>
                      onUpdateBookOverride(book.id, {
                        nightstandState: isNightstandActive ? 'on-hold' : 'active',
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono-tabular font-semibold transition-all cursor-pointer border ${
                      !isNightstandActive
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-xs'
                        : 'bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)] border-[var(--accent-secondary)]/30'
                    }`}
                    title="Toggle Nightstand Active vs On Hold state"
                  >
                    {!isNightstandActive ? (
                      <>
                        <PauseCircle className="w-3.5 h-3.5" />
                        <span>On Hold</span>
                      </>
                    ) : (
                      <>
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Active</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono-tabular">
                    <span className="text-[var(--text-muted)]">
                      Progress: <strong>{currentPageNum}</strong> of {totalPages || '—'} pages
                    </span>
                    <span className="font-bold text-[var(--accent-primary)]">{progressPct}%</span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent-primary)] transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  {(() => {
                    const kt = userState?.kindleTelemetry?.books?.[book.id];
                    const wpm = kt?.wpm ?? userState?.kindleTelemetry?.medianWpm ?? null;
                    const estHoursLeft =
                      wpm && totalPages > currentPageNum
                        ? Math.round((((totalPages - currentPageNum) * 275) / wpm / 60) * 10) / 10
                        : null;
                    if (!kt && estHoursLeft === null) return null;
                    return (
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] pt-0.5">
                        <span>
                          {kt
                            ? `Kindle: ${kt.wpm ?? '—'} WPM · ${kt.hoursRead}h`
                            : `Est. @ ${wpm} WPM`}
                        </span>
                        {estHoursLeft !== null && (
                          <span className="text-[var(--text-ink)] font-semibold">
                            ~{estHoursLeft}h remaining
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="pt-1 text-xs font-mono-tabular">
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
                    Log Current Page
                  </label>
                  <div className="flex items-center gap-2 max-w-xs">
                    <input
                      type="number"
                      min={0}
                      max={totalPages || 9999}
                      value={localCurrentPage}
                      onChange={(e) => setLocalCurrentPage(e.target.value)}
                      onBlur={handlePageCommit}
                      onKeyDown={(e) => e.key === 'Enter' && handlePageCommit()}
                      placeholder="0"
                      className="w-full py-1.5 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                    <button
                      onClick={handlePageCommit}
                      className="px-3 py-1.5 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--accent-primary)] hover:text-white border border-[var(--border-ledger)] text-xs font-semibold text-[var(--text-ink)] transition-colors cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Language & Format Passport */}
            <section
              aria-labelledby="language-passport-heading"
              className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[var(--accent-secondary)]" />
                  <h3
                    id="language-passport-heading"
                    className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold"
                  >
                    Language &amp; Format Passport
                  </h3>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-mono-tabular font-bold ${
                    profile.isTranslation
                      ? 'bg-[var(--accent-gold)]/15 text-amber-900 dark:text-amber-200 border border-[var(--accent-gold)]/30'
                      : 'bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)] border border-[var(--accent-secondary)]/30'
                  }`}
                >
                  {profile.translationFlow}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono-tabular">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
                    Reading Edition Lang
                  </label>
                  <select
                    value={override?.editionLanguageOverride || profile.editionLanguage}
                    onChange={(e) =>
                      onUpdateBookOverride(book.id, {
                        editionLanguageOverride: e.target.value as LanguageCode,
                      })
                    }
                    className="w-full py-1.5 px-2.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
                  >
                    {ALL_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l} — {LANGUAGE_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
                    Original Published Lang
                  </label>
                  <select
                    value={override?.originalLanguageOverride || profile.originalLanguage}
                    onChange={(e) =>
                      onUpdateBookOverride(book.id, {
                        originalLanguageOverride: e.target.value as LanguageCode,
                      })
                    }
                    className="w-full py-1.5 px-2.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
                  >
                    {ALL_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l} — {LANGUAGE_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
                    Format Category
                  </label>
                  <select
                    value={override?.formatOverride || profile.format}
                    onChange={(e) =>
                      onUpdateBookOverride(book.id, {
                        formatOverride: e.target.value as BookFormat,
                      })
                    }
                    className="w-full py-1.5 px-2.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
                  >
                    {ALL_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {FORMAT_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {profile.translators.length > 0 && (
                <div className="pt-2 border-t border-[var(--border-ledger)]/60 text-xs font-mono-tabular text-[var(--text-muted)]">
                  <span>Accredited Translators: </span>
                  <strong className="text-[var(--text-ink)]">{profile.translators.join(', ')}</strong>
                </div>
              )}
            </section>

            {/* Enriched Synopsis, Subjects & Community Rating */}
            <section
              aria-labelledby="enrichment-heading"
              className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" />
                  <h3
                    id="enrichment-heading"
                    className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold"
                  >
                    Synopsis &amp; Community Rating
                  </h3>
                </div>

                <button
                  onClick={handleEnrich}
                  disabled={isEnriching}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[var(--accent-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  title="Query Open Library and Google Books for synopsis and community rating"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isEnriching ? 'animate-spin' : ''}`} />
                  <span>{isEnriching ? 'Fetching...' : 'Fetch Synopsis & Crowd Rating'}</span>
                </button>
              </div>

              <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] grid grid-cols-2 gap-4 font-mono-tabular text-xs">
                <div>
                  <span className="text-[10px] uppercase text-[var(--text-muted)] block font-semibold">
                    Personal Rating
                  </span>
                  <div className="flex items-center gap-1 text-[var(--accent-gold)] font-bold text-base mt-0.5">
                    <Star className="w-4 h-4 fill-[var(--accent-gold)]" />
                    <span>{book.myRating ? `${book.myRating}.0★` : 'Unrated'}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase text-[var(--text-muted)] block font-semibold">
                    Community Consensus
                  </span>
                  <div className="flex items-center gap-1 text-[var(--text-ink)] font-bold text-base mt-0.5">
                    <Star className="w-4 h-4 text-[var(--accent-gold)] fill-[var(--accent-gold)]" />
                    <span>{communityRating ? `${communityRating.toFixed(2)}★` : '—'}</span>
                  </div>
                </div>
              </div>

              {enriched?.synopsis ? (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                    Synopsis
                  </span>
                  <p className="font-serif-editorial text-sm leading-relaxed text-[var(--text-ink)] italic p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                    &ldquo;{enriched.synopsis}&rdquo;
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">
                  No synopsis cached yet. Click &ldquo;Fetch Synopsis &amp; Crowd Rating&rdquo; above
                  to retrieve metadata.
                </p>
              )}

              {enriched?.subjects && enriched.subjects.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                    Subjects
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {enriched.subjects.map((s, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded text-[11px] bg-[var(--bg-surface)] text-[var(--text-ink)] border border-[var(--border-ledger)] font-mono-tabular"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Personal Review (With Spoiler Shield) */}
            {book.myReview && (
              <section aria-labelledby="review-heading">
                <div className="flex items-center justify-between mb-3">
                  <h3
                    id="review-heading"
                    className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-bold flex items-center gap-1.5"
                  >
                    <Feather className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>Personal Review &amp; Critique</span>
                  </h3>

                  {book.spoiler && (
                    <button
                      onClick={() => setSpoilerRevealed(!spoilerRevealed)}
                      className="flex items-center gap-1 text-xs text-[var(--accent-primary)] hover:underline cursor-pointer font-medium"
                    >
                      {spoilerRevealed ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>{spoilerRevealed ? 'Hide Spoiler' : 'Reveal Spoiler'}</span>
                    </button>
                  )}
                </div>

                <div className="relative p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
                  {book.spoiler && !spoilerRevealed ? (
                    <div className="text-center py-6">
                      <AlertTriangle className="w-8 h-8 text-[var(--accent-primary)] mx-auto mb-2" />
                      <p className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                        This review contains plot spoilers.
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
                        Content is shielded to protect initial reading discoveries.
                      </p>
                      <button
                        onClick={() => setSpoilerRevealed(true)}
                        className="px-4 py-1.5 rounded-md bg-[var(--accent-primary)] text-white text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity"
                      >
                        Reveal Full Review
                      </button>
                    </div>
                  ) : (
                    <div className="font-serif-editorial text-sm sm:text-base leading-relaxed text-[var(--text-ink)] space-y-3">
                      {reviewParagraphs.map((para, pIdx) => (
                        <p key={pIdx}>{para}</p>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Obsidian Vault Literature Essay */}
            {vaultReview && (
              <section aria-labelledby="vault-review-heading" className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3
                    id="vault-review-heading"
                    className="text-xs font-mono-tabular uppercase tracking-wider text-[#7C5CFF] font-bold flex items-center gap-1.5"
                  >
                    <FolderArchive className="w-3.5 h-3.5 text-[#7C5CFF]" />
                    <span>Obsidian Vault Literature Essay</span>
                  </h3>
                  <a
                    href={vaultReview.obsidianUri}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono-tabular font-semibold text-[#7C5CFF] bg-[#7C5CFF]/10 hover:bg-[#7C5CFF]/20 border border-[#7C5CFF]/30 transition-colors shadow-2xs"
                    title="Open directly in your Obsidian vault"
                  >
                    <span>Open in Obsidian</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[#7C5CFF]/35 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] border-b border-[var(--border-ledger)]/60 pb-2">
                    <span className="truncate max-w-[240px] font-medium text-[var(--text-ink)]">
                      {vaultReview.vaultFilePath}
                    </span>
                    <span>{vaultReview.wordsCount.toLocaleString()} words</span>
                  </div>
                  <div className="font-serif-editorial text-sm sm:text-base leading-relaxed text-[var(--text-ink)] whitespace-pre-line space-y-2">
                    {vaultReview.content}
                  </div>
                </div>
              </section>
            )}

            {/* Archival Private Notes */}
            {book.privateNotes && (
              <section aria-labelledby="notes-heading">
                <h3
                  id="notes-heading"
                  className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-bold mb-2"
                >
                  Archival Private Notes
                </h3>
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-muted)] font-mono-tabular whitespace-pre-wrap">
                  {book.privateNotes}
                </div>
              </section>
            )}

            {/* Consolidated Marginalia & Kindle Passages */}
            {(matchingClippings.length > 0 || combinedKindleNotes.length > 0) && (
              <section aria-labelledby="marginalia-heading" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3
                    id="marginalia-heading"
                    className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-secondary)] font-bold flex items-center gap-1.5"
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    <span>
                      Marginalia &amp; Kindle Passages (
                      {matchingClippings.length + combinedKindleNotes.length})
                    </span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {matchingClippings.map((clip) => (
                    <div
                      key={clip.id}
                      className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] text-xs shadow-2xs space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tabular text-[var(--text-muted)]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {clip.highlightColor && (
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-black/15"
                              style={{
                                backgroundColor:
                                  clip.highlightColor === 'pink'
                                    ? '#e879a0'
                                    : clip.highlightColor === 'blue'
                                    ? '#60a5fa'
                                    : clip.highlightColor === 'orange'
                                    ? '#fb923c'
                                    : '#facc15',
                              }}
                              title={`${clip.highlightColor} highlight`}
                            />
                          )}
                          {clip.chapter && (
                            <span className="font-medium text-[var(--text-ink)] truncate max-w-[200px]">
                              {clip.chapter} ·
                            </span>
                          )}
                          <span className="font-semibold text-[var(--accent-secondary)] shrink-0">
                            {clip.page
                              ? `Page ${clip.page}`
                              : clip.locationStart
                              ? `Location ${clip.locationStart}${clip.locationEnd ? `–${clip.locationEnd}` : ''}`
                              : 'Highlight'}
                          </span>
                        </div>
                        {clip.addedAt && <span>{clip.addedAt.slice(0, 10)}</span>}
                      </div>

                      <blockquote className="font-serif-editorial text-sm italic text-[var(--text-ink)] leading-relaxed border-l-2 border-[var(--accent-secondary)]/50 pl-3">
                        &ldquo;{clip.content}&rdquo;
                      </blockquote>

                      {clip.attachedNote && (
                        <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] flex items-start gap-2">
                          <Feather className="w-3.5 h-3.5 text-[var(--accent-gold)] shrink-0 mt-0.5" />
                          <div className="font-sans-ui text-xs text-[var(--text-ink)]">
                            <span className="font-semibold text-[var(--accent-gold)] mr-1">
                              Your Note:
                            </span>
                            {clip.attachedNote}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {combinedKindleNotes.map((note, nIdx) => (
                    <div
                      key={`dsar-note-${nIdx}`}
                      className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--accent-gold)] font-semibold mb-1.5">
                        <Quote className="w-3 h-3" />
                        <span>Kindle Reading Note</span>
                      </div>
                      <blockquote className="font-serif-editorial text-sm italic text-[var(--text-ink)] leading-relaxed">
                        &ldquo;{note.noteText}&rdquo;
                      </blockquote>
                      {note.createdAt && (
                        <div className="mt-2 text-[11px] font-mono-tabular text-[var(--text-muted)] text-right">
                          Logged on {note.createdAt.slice(0, 10)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Compact 6-Cell Bibliographic Strip */}
            <section aria-labelledby="colophon-heading">
              <h3
                id="colophon-heading"
                className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-bold mb-3 flex items-center gap-1.5"
              >
                <Hash className="w-3.5 h-3.5" />
                <span>Bibliographic Details</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] text-xs font-mono-tabular">
                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Publisher
                  </span>
                  <span className="font-medium text-[var(--text-ink)] truncate block">
                    {book.publisher || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Binding
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">{book.binding || '—'}</span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Page Count
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">
                    {book.pageCount ? `${book.pageCount} pp.` : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Orig. Pub Year
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">{originalYear || '—'}</span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Edition Year
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">{editionYear || '—'}</span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    ISBN-13
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">{book.isbn13 || '—'}</span>
                </div>
              </div>
            </section>
          </div>

          {/* 3. Footer Bar */}
          <div className="sticky bottom-0 z-10 px-6 py-3.5 bg-[var(--bg-surface)]/95 backdrop-blur-md border-t border-[var(--border-ledger)] flex items-center justify-between text-xs font-mono-tabular text-[var(--text-muted)]">
            <span>Use ← and → arrow keys to flip through library</span>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[var(--text-ink)] font-semibold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
