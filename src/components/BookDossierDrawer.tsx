import React, { useState, useEffect, useMemo } from 'react';
import {
  Book,
  BookFormat,
  BookUserOverride,
  EnrichmentCacheMap,
  KindleNote,
  LanguageCode,
  NightstandState,
  UserLocalState,
} from '../types/library';
import {
  classifyBookLanguageAndFormat,
  FORMAT_LABELS,
  LANGUAGE_LABELS,
} from '../lib/classifiers/languageAndFormat';
import { formatPublicationYear, formatReviewHtml } from '../lib/formatters';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  BookOpen,
  Calendar,
  Layers,
  Feather,
  AlertTriangle,
  Eye,
  EyeOff,
  Clock,
  Compass,
  Hash,
  Quote,
  Globe,
  Languages,
  PauseCircle,
  PlayCircle,
  Sparkles,
  RefreshCw,
  BookmarkCheck,
  CheckCircle2,
  Tag,
  Zap,
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
  onSelectBookById,
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
      // Don't intercept if user is typing inside an input/select
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

  if (!isOpen || !book) return null;

  const override = userState?.bookOverrides?.[book.id];
  const enriched = enrichmentCache?.[book.id];
  const profile = classifyBookLanguageAndFormat(book, override, enriched);

  const originalYear = formatPublicationYear(book.originalPublicationYear || book.yearPublished);
  const editionYear = formatPublicationYear(book.yearPublished);

  // Rating comparison
  const communityRating = book.averageRating ?? enriched?.communityRating ?? null;
  const ratingDelta =
    book.myRating && communityRating ? Number((book.myRating - communityRating).toFixed(2)) : null;

  // Active reading & pacing calculations
  const totalPages = book.pageCount || 0;
  const currentPageNum = override?.currentPage ?? (book.exclusiveShelf === 'read' ? totalPages : 0);
  const remainingPages = Math.max(0, totalPages - currentPageNum);
  const progressPct =
    totalPages > 0 ? Math.min(100, Math.round((currentPageNum / totalPages) * 100)) : 0;

  // Pace baseline
  const formatVelocityMap: Record<BookFormat, number> = {
    prose: 32,
    'comic-manga': 140,
    'short-essay': 45,
    'academic-ref': 18,
  };
  const formatPace = formatVelocityMap[profile.format] || 32;
  const daysToFinishAtPace = remainingPages > 0 ? Math.ceil(remainingPages / formatPace) : 0;
  const projectedFinishDate =
    remainingPages > 0
      ? new Date(Date.now() + daysToFinishAtPace * 24 * 3600 * 1000).toISOString().split('T')[0]
      : null;

  // Target deadline pages/day
  let pagesPerDayNeeded: number | null = null;
  if (override?.targetFinishDate && remainingPages > 0) {
    const targetTime = new Date(override.targetFinishDate).getTime();
    const nowTime = Date.now();
    const diffDays = Math.ceil((targetTime - nowTime) / (1000 * 3600 * 24));
    if (diffDays > 0) {
      pagesPerDayNeeded = Math.ceil(remainingPages / diffDays);
    } else {
      pagesPerDayNeeded = remainingPages;
    }
  }

  const isNightstandActive = (override?.nightstandState ?? 'active') === 'active';

  // Enrich trigger
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

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-[var(--bg-canvas)] border-l border-[var(--border-ledger)] shadow-2xl flex flex-col justify-between overflow-y-auto">
          {/* 1. Header Toolbar */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[var(--bg-surface)]/95 backdrop-blur-md border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              {/* Prev Book Button */}
              {onPrevBook && (
                <button
                  onClick={onPrevBook}
                  className="p-1.5 rounded-md hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-ledger)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
                  title="Previous Volume (←)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {/* Next Book Button */}
              {onNextBook && (
                <button
                  onClick={onNextBook}
                  className="p-1.5 rounded-md hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-ledger)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
                  title="Next Volume (→)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              <span className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold ml-2">
                Dossier #{book.id}
              </span>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[var(--bg-card)] border border-transparent hover:border-[var(--border-ledger)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
              title="Close Dossier (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2. Main Content Body */}
          <div className="flex-1 px-6 sm:px-8 py-6 space-y-8">
            {/* Title, Cover & Author Header */}
            <div className="flex gap-4 sm:gap-6 items-start">
              {/* Cover Image (if showCovers is enabled and coverUrl exists) */}
              {userState?.showCovers && enriched?.coverUrl && (
                <img
                  src={enriched.coverUrl}
                  alt={book.title}
                  className="w-20 sm:w-28 h-28 sm:h-40 object-cover rounded-lg shadow-md shrink-0 border border-[var(--border-ledger)]"
                />
              )}

              <div className="flex-1 min-w-0">
                {/* Shelf & Series Badge */}
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

                {/* Title */}
                <h2 className="font-serif-editorial text-2xl sm:text-3xl font-bold text-[var(--text-ink)] leading-snug tracking-tight">
                  {book.cleanTitle || book.title}
                </h2>

                {/* Author & Translators */}
                <div className="mt-2 text-sm text-[var(--text-muted)] font-medium">
                  by{' '}
                  <span className="text-[var(--text-ink)] font-semibold text-base">
                    {book.author}
                  </span>
                  {book.additionalAuthors && book.additionalAuthors.length > 0 && (
                    <span className="text-xs ml-1.5 text-[var(--text-muted)]">
                      with {book.additionalAuthors.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* UPGRADE 1: Active Reading, Nightstand Status & Target Pace Studio */}
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
                    Active Reading, Nightstand &amp; Target Pace Studio
                  </h3>
                </div>

                {/* Toggle Active ⇄ On Hold */}
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

              {/* Progress Bar & Page logger */}
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
              </div>

              {/* Current Page logger + Target Finish Date inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs font-mono-tabular">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
                    Log Current Page
                  </label>
                  <div className="flex items-center gap-2">
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

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1">
                    Target Finish Date
                  </label>
                  <input
                    type="date"
                    value={override?.targetFinishDate || ''}
                    onChange={(e) =>
                      onUpdateBookOverride(book.id, {
                        targetFinishDate: e.target.value || null,
                      })
                    }
                    className="w-full py-1.5 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-[var(--accent-primary)] cursor-pointer"
                  />
                </div>
              </div>

              {/* Dynamic Velocity & Target Velocity Feedback Banner */}
              <div className="pt-2 border-t border-[var(--border-ledger)]/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono-tabular">
                <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                  <Zap className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                  <span>
                    Format Velocity ({FORMAT_LABELS[profile.format]}):{' '}
                    <strong className="text-[var(--text-ink)]">~{formatPace} pp/day</strong>
                  </span>
                  {projectedFinishDate && (
                    <span className="text-[11px]">
                      (ETA: <strong>{projectedFinishDate}</strong>)
                    </span>
                  )}
                </div>

                {pagesPerDayNeeded !== null && (
                  <div className="px-2.5 py-1 rounded bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-semibold text-xs border border-[var(--accent-primary)]/20">
                    Need <strong>{pagesPerDayNeeded} pp/day</strong> to hit deadline
                  </div>
                )}
              </div>
            </section>

            {/* UPGRADE 2: Separate Language & Format Passport Panel */}
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

                {/* Translation Flow Badge */}
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
                {/* Reading Edition Language Override */}
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

                {/* Original Published Language Override */}
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

                {/* Format Override */}
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

            {/* UPGRADE 3: Enriched Synopsis, Subjects & Crowd Rating */}
            <section
              aria-labelledby="enrichment-heading"
              className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" />
                  <h3
                    id="enrichment-heading"
                    className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold"
                  >
                    Enriched Synopsis, Subjects &amp; Crowd Consensus
                  </h3>
                </div>

                {/* 1-click Fetch Synopsis & Rating button */}
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

              {/* Rating Comparison with Contrarian Delta */}
              <div className="p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] flex flex-wrap items-center justify-between gap-4 font-mono-tabular text-xs">
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

                {ratingDelta !== null && (
                  <div>
                    <span className="text-[10px] uppercase text-[var(--text-muted)] block font-semibold">
                      Contrarian Divergence
                    </span>
                    <span
                      className={`inline-block font-bold text-xs px-2 py-0.5 rounded mt-0.5 ${
                        ratingDelta >= 0
                          ? 'bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)]'
                          : 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                      }`}
                    >
                      {ratingDelta > 0 ? `+${ratingDelta}` : ratingDelta}★ vs Crowd
                    </span>
                  </div>
                )}
              </div>

              {/* Synopsis Box */}
              {enriched?.synopsis ? (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                    Verified Synopsis Archive
                  </span>
                  <p className="font-serif-editorial text-sm leading-relaxed text-[var(--text-ink)] italic p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                    &ldquo;{enriched.synopsis}&rdquo;
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">
                  No verified synopsis cached yet. Click &ldquo;Fetch Synopsis &amp; Crowd Rating&rdquo;
                  above to retrieve metadata.
                </p>
              )}

              {/* Subjects / Genre Pills */}
              {enriched?.subjects && enriched.subjects.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                    Enriched Subjects &amp; Classifications
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

            {/* UPGRADE 4: Attached Kindle `My Clippings.txt` Highlights & Paired Notes */}
            {matchingClippings.length > 0 && (
              <section aria-labelledby="clippings-heading" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookmarkCheck className="w-4 h-4 text-[var(--accent-secondary)]" />
                    <h3
                      id="clippings-heading"
                      className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold"
                    >
                      Kindle `My Clippings.txt` Passages ({matchingClippings.length})
                    </h3>
                  </div>
                  <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                    Local e-reader marginalia
                  </span>
                </div>

                <div className="space-y-3">
                  {matchingClippings.map((clip) => (
                    <div
                      key={clip.id}
                      className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] text-xs shadow-2xs space-y-2"
                    >
                      {/* Clipping location & date header */}
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
                        <span className="font-semibold text-[var(--accent-secondary)]">
                          {clip.page
                            ? `Page ${clip.page}`
                            : clip.locationStart
                            ? `Location ${clip.locationStart}${clip.locationEnd ? `–${clip.locationEnd}` : ''}`
                            : 'Highlight'}
                        </span>
                        {clip.addedAt && <span>{clip.addedAt.slice(0, 10)}</span>}
                      </div>

                      {/* Passage */}
                      <blockquote className="font-serif-editorial text-sm italic text-[var(--text-ink)] leading-relaxed border-l-2 border-[var(--accent-secondary)]/50 pl-3">
                        &ldquo;{clip.content}&rdquo;
                      </blockquote>

                      {/* Attached paired note */}
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
                </div>
              </section>
            )}

            {/* Colophon Grid (Scholarly Bibliographic Metadata) */}
            <section aria-labelledby="colophon-heading">
              <h3
                id="colophon-heading"
                className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-bold mb-3 flex items-center gap-1.5"
              >
                <Hash className="w-3.5 h-3.5" />
                <span>Colophon &amp; Bibliographic Details</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] text-xs font-mono-tabular">
                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Book ID
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">{book.id}</span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    ISBN13
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">{book.isbn13 || '—'}</span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    ISBN
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">{book.isbn || '—'}</span>
                </div>

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
                    Date Added
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">
                    {book.dateAdded ? book.dateAdded.slice(0, 10) : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Date Read
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">
                    {book.dateRead ? book.dateRead.slice(0, 10) : '—'}
                  </span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Read Count
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">{book.readCount || 1}</span>
                </div>

                <div>
                  <span className="text-[var(--text-muted)] block text-[10px] uppercase">
                    Owned Copies
                  </span>
                  <span className="font-medium text-[var(--text-ink)]">
                    {book.ownedCopies || 0}
                  </span>
                </div>
              </div>
            </section>

            {/* Reading Sessions Timeline */}
            {book.readingSessions && book.readingSessions.length > 0 && (
              <section aria-labelledby="sessions-heading">
                <h3
                  id="sessions-heading"
                  className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-bold mb-3 flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                  <span>Reading Sessions Timeline</span>
                </h3>

                <div className="space-y-2 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] font-mono-tabular text-xs">
                  {book.readingSessions.map((session, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]/60 last:border-0 last:pb-0"
                    >
                      <div>
                        <span className="font-semibold text-[var(--text-ink)]">
                          Session 0{idx + 1}
                        </span>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {session.startedAt
                            ? `Started: ${session.startedAt.slice(0, 10)}`
                            : 'In progress'}
                          {session.endedAt ? ` · Completed: ${session.endedAt.slice(0, 10)}` : ''}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[10px] font-semibold text-[var(--text-ink)]">
                          {session.state}
                        </span>
                        {session.durationDays && (
                          <div className="text-[11px] text-[var(--accent-secondary)] font-semibold mt-0.5">
                            {session.durationDays} days duration
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

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

            {/* Private Notes */}
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

            {/* DSAR Kindle Marginalia Highlights */}
            {combinedKindleNotes.length > 0 && (
              <section aria-labelledby="marginalia-heading">
                <h3
                  id="marginalia-heading"
                  className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-gold)] font-bold mb-3 flex items-center gap-1.5"
                >
                  <Quote className="w-3.5 h-3.5" />
                  <span>Kindle Reading Activity Notes ({combinedKindleNotes.length})</span>
                </h3>

                <div className="space-y-3">
                  {combinedKindleNotes.map((note, nIdx) => (
                    <div
                      key={nIdx}
                      className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] text-xs shadow-2xs"
                    >
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

            {/* Related Recommendations */}
            {book.recommendations && book.recommendations.length > 0 && (
              <section aria-labelledby="related-heading">
                <h3
                  id="related-heading"
                  className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-bold mb-3 flex items-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                  <span>Goodreads Graph: Recommended Next Reads</span>
                </h3>

                <div className="space-y-2">
                  {book.recommendations.map((rec, rIdx) => (
                    <div
                      key={rIdx}
                      className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] flex items-center justify-between text-xs"
                    >
                      <span className="font-serif-editorial font-bold text-[var(--text-ink)]">
                        {rec.recommendedTitle}
                      </span>
                      {rec.shelf && (
                        <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
                          Shelf: {rec.shelf}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
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
