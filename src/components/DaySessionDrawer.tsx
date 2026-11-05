import React, { useEffect } from 'react';
import {
  X,
  ExternalLink,
  BookOpen,
  Feather,
  FileText,
  Flame,
  Calendar,
  Clock,
  Sparkles,
  Quote,
  ChevronRight,
  Bookmark,
  Film,
} from 'lucide-react';
import type { Book, DraftedFileRecord, KindleClipping, LetterboxdFilmWatch } from '../types/library';
import type { DayReadingActivity } from '../lib/analytics/engine';
import { formatStarRating } from '../lib/parsers/letterboxdParser';

export interface DaySessionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  day: DayReadingActivity | null;
  clippings: KindleClipping[];
  draftedFiles: DraftedFileRecord[];
  books: Book[];
  onSelectBook: (book: Book) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
  letterboxdWatches?: LetterboxdFilmWatch[];
}

/**
 * Slide-over focused inspector window when clicking on any calendar day in the Reading/Writing Matrix.
 * Displays:
 *  - Left / Main: Obsidian Vault drafting files with 1-click [View in Obsidian ↗] native URI buttons.
 *  - Right: Kindle highlighted passages, quotes, book provenance, and dossier inspection links.
 */
export const DaySessionDrawer: React.FC<DaySessionDrawerProps> = ({
  isOpen,
  onClose,
  day,
  clippings,
  draftedFiles,
  books,
  onSelectBook,
  onSelectBookById,
  letterboxdWatches,
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !day) return null;

  // Format calendar date
  let formattedDate = day.date;
  try {
    const [y, m, d] = day.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    formattedDate = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(dateObj);
  } catch {
    // Fallback to raw string
  }

  // Calculate day totals
  const dayWatches = letterboxdWatches || day.watchedFilms || [];
  const totalWords = day.wordsWrittenCount || draftedFiles.reduce((s, f) => s + (f.words || 0), 0);
  const totalClips = day.highlightCount || clippings.length;
  const totalFilms = day.filmsWatchedCount || dayWatches.length;
  const isDual = day.isDualMomentumDay || (totalWords > 0 && (totalClips > 0 || totalFilms > 0));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Session notes for ${day.date}`}
      className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex justify-end animate-fadeIn"
    >
      {/* Click outside backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="relative w-full sm:max-w-3xl lg:max-w-4xl bg-[var(--bg-surface)] border-l border-[var(--border-ledger)] shadow-2xl flex flex-col h-full overflow-hidden text-[var(--text-ink)]">
        
        {/* 1. Masthead Header */}
        <div className="p-4 sm:p-6 border-b border-[var(--border-ledger)] bg-[var(--bg-card)] shrink-0 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono-tabular text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[var(--text-muted)] flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-[var(--accent-primary)]" />
                  <span>{day.date}</span>
                </span>
                {isDual && (
                  <span className="font-mono-tabular text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--accent-gold)]/20 border border-[var(--accent-gold)]/40 text-[var(--accent-gold)] flex items-center gap-1">
                    <Flame className="w-3 h-3" />
                    <span>Dual Momentum Day</span>
                  </span>
                )}
              </div>
              <h2 className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]">
                {formattedDate}
              </h2>
            </div>

            <button
              onClick={onClose}
              type="button"
              className="p-2 rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
              aria-label="Close inspector drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Day Metric Tally Badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono-tabular text-xs">
            <div className="px-3 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] flex items-center gap-1.5">
              <Feather className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>{totalWords.toLocaleString()}</strong> words drafted
              </span>
            </div>

            <div className="px-3 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#3b82f6]" />
              <span>
                <strong>{totalClips}</strong> Kindle highlights
              </span>
            </div>

            {dayWatches.length > 0 && (
              <div className="px-3 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5" />
                <span>
                  <strong>{dayWatches.length}</strong> {dayWatches.length === 1 ? 'film screened' : 'films screened'}
                </span>
              </div>
            )}

            {draftedFiles.length > 0 && (
              <div className="px-3 py-1 rounded-md bg-[#7C5CFF]/10 text-[#7C5CFF] border border-[#7C5CFF]/30 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>
                  <strong>{draftedFiles.length}</strong> vault files touched
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Scrollable Body: Split Columns (Obsidian on Left, Kindle on Right) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left Column: Obsidian Vault Files */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[#7C5CFF]/10 text-[#7C5CFF] flex items-center justify-center border border-[#7C5CFF]/20">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                    Obsidian Vault Notes
                  </h3>
                </div>
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  {draftedFiles.length} Files
                </span>
              </div>

              {draftedFiles.length > 0 ? (
                <div className="space-y-3">
                  {draftedFiles.map((file, idx) => {
                    const cleanPath = file.filePath.replace(/\.md$/, '');
                    const obsidianUri = `obsidian://open?vault=obsidian2025&file=${encodeURIComponent(cleanPath)}`;

                    return (
                      <div
                        key={file.filePath + idx}
                        className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[#7C5CFF]/40 transition-all space-y-2.5 shadow-2xs group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5 overflow-hidden">
                            <div className="font-serif-editorial font-bold text-sm text-[var(--text-ink)] group-hover:text-[#7C5CFF] transition-colors truncate">
                              {file.fileName}
                            </div>
                            {file.folder && (
                              <div className="font-mono-tabular text-[10px] text-[var(--text-muted)] truncate">
                                {file.folder}
                              </div>
                            )}
                          </div>

                          {file.words > 0 && (
                            <span className="font-mono-tabular text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                              +{file.words.toLocaleString()} w
                            </span>
                          )}
                        </div>

                        {/* Action Bar with Direct Obsidian Protocol Button */}
                        <div className="pt-2 border-t border-[var(--border-ledger)]/60 flex items-center justify-between">
                          <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                            Vault note · unbundled
                          </span>
                          <a
                            href={obsidianUri}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#7C5CFF]/10 text-[#7C5CFF] border border-[#7C5CFF]/30 hover:bg-[#7C5CFF]/20 hover:border-[#7C5CFF] transition-all cursor-pointer shadow-2xs group/btn"
                            title={`Open ${file.fileName} in Obsidian desktop`}
                          >
                            <span>View in Obsidian</span>
                            <ExternalLink className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 rounded-lg bg-[var(--bg-card)]/50 border border-[var(--border-ledger)] border-dashed text-center space-y-1">
                  <p className="font-serif-editorial text-xs italic text-[var(--text-muted)]">
                    No Obsidian manuscript drafting sessions logged on this calendar date.
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Kindle Notes Taken on This Date */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center border border-[var(--accent-primary)]/20">
                    <BookOpen className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                    Kindle Notes &amp; Highlights
                  </h3>
                </div>
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  {clippings.length} Passages
                </span>
              </div>

              {clippings.length > 0 ? (
                <div className="space-y-3">
                  {clippings.map((clip) => {
                    const matchedBook = books.find(
                      (b) =>
                        (clip.matchedBookId && b.id === clip.matchedBookId) ||
                        b.cleanTitle.toLowerCase() === (clip.cleanTitle || clip.rawTitle || '').toLowerCase()
                    );

                    return (
                      <div
                        key={clip.id}
                        className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/40 transition-all space-y-2.5 shadow-2xs"
                      >
                        {/* Book Metadata Line */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <h4 className="font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
                              {clip.cleanTitle || clip.rawTitle}
                            </h4>
                            <p className="text-[11px] font-serif-editorial text-[var(--text-muted)]">
                              by {clip.author || 'Unknown Author'}
                            </p>
                          </div>

                          {matchedBook && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onSelectBook(matchedBook);
                              }}
                              className="px-2 py-1 rounded text-[10px] font-mono-tabular bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] text-[var(--text-ink)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer shrink-0"
                              title="Inspect book in Ex Libris Dossier"
                            >
                              Dossier →
                            </button>
                          )}
                        </div>

                        {/* Quoted Text */}
                        <div className="relative pl-3 border-l-2 border-[var(--accent-gold)] text-xs text-[var(--text-ink)] font-serif-editorial italic leading-relaxed bg-[var(--bg-surface)]/60 p-2.5 rounded-r">
                          &ldquo;{clip.content}&rdquo;
                        </div>

                        {/* Footer Provenance */}
                        <div className="flex items-center justify-between text-[10px] font-mono-tabular text-[var(--text-muted)]">
                          <span>
                            {clip.page ? `Page ${clip.page}` : ''}
                            {clip.page && clip.locationStart ? ' · ' : ''}
                            {clip.locationStart ? (clip.locationEnd ? `Loc ${clip.locationStart}–${clip.locationEnd}` : `Loc ${clip.locationStart}`) : ''}
                          </span>

                          {clip.highlightColor && (
                            <span className="capitalize px-1.5 py-0.2 rounded border border-[var(--border-ledger)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
                              {clip.highlightColor}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 rounded-lg bg-[var(--bg-card)]/50 border border-[var(--border-ledger)] border-dashed text-center space-y-1">
                  <p className="font-serif-editorial text-xs italic text-[var(--text-muted)]">
                    No Kindle reading passages or highlights logged on this calendar date.
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Letterboxd Cinema & Screen Intake */}
          {dayWatches.length > 0 && (
            <div className="space-y-4 pt-6 border-t border-[var(--border-ledger)] mt-6">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
                    <Film className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                    Cinema &amp; Screen Intake (Letterboxd)
                  </h3>
                </div>
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  {dayWatches.length} {dayWatches.length === 1 ? 'Film' : 'Films'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dayWatches.map((watch) => (
                  <div
                    key={watch.id || watch.uri || watch.name}
                    className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-purple-500/40 transition-all space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
                          {watch.name}
                          {watch.year ? (
                            <span className="font-mono-tabular text-xs font-normal text-[var(--text-muted)] ml-1.5">
                              ({watch.year})
                            </span>
                          ) : null}
                        </h4>
                        {watch.rating && (
                          <div className="flex items-center gap-1.5 mt-1 font-mono-tabular text-xs">
                            <span className="text-amber-500 tracking-wider font-bold">
                              {formatStarRating(watch.rating)}
                            </span>
                            <span className="text-[var(--text-muted)] text-[11px]">
                              ({watch.rating.toFixed(1)} / 5)
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {watch.rewatch && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            Rewatch
                          </span>
                        )}
                        {watch.uri && (
                          <a
                            href={watch.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500 transition-all cursor-pointer"
                            title="Open on Letterboxd"
                          >
                            <span>Letterboxd</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {watch.review && (
                      <div className="relative pl-3 border-l-2 border-purple-400 text-xs text-[var(--text-ink)] font-serif-editorial italic leading-relaxed bg-[var(--bg-surface)]/60 p-2.5 rounded-r">
                        &ldquo;{watch.review}&rdquo;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. Drawer Footer Tag */}
        <div className="p-3 sm:p-4 border-t border-[var(--border-ledger)] bg-[var(--bg-card)] shrink-0 flex items-center justify-between text-xs font-mono-tabular text-[var(--text-muted)]">
          <span className="text-[11px]">
            Obsidian deep links launch natively via Windows <code className="text-[var(--text-ink)]">obsidian://</code> protocol
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--text-muted)] text-[var(--text-ink)] cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default DaySessionDrawer;
