import React, { useState, useMemo } from 'react';
import {
  KindleHeatmapMetrics,
  DayReadingActivity,
  TopAnnotatedBook,
} from '../lib/analytics/engine';
import { Book, UserLocalState, LetterboxdFilmWatch } from '../types/library';
import { formatStarRating } from '../lib/parsers/letterboxdParser';
import { DaySessionDrawer } from './DaySessionDrawer';
import {
  Flame,
  Calendar,
  Clock,
  Sparkles,
  BookOpen,
  Award,
  ChevronRight,
  BookmarkCheck,
  Zap,
  Feather,
  ArrowRightLeft,
  FileText,
  ExternalLink,
  Film,
} from 'lucide-react';

interface KindleHeatmapSectionProps {
  metrics: KindleHeatmapMetrics;
  books: Book[];
  onSelectBook: (book: Book) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
  userState?: UserLocalState;
}

export const KindleHeatmapSection: React.FC<KindleHeatmapSectionProps> = ({
  metrics,
  books,
  onSelectBook,
  onSelectBookById,
  userState,
}) => {
  // Mode toggle: Reading (Input) | Writing (Output) | Cinema (Screen) | Input vs Output (Correlation)
  const [heatmapMode, setHeatmapMode] = useState<'reading' | 'writing' | 'cinema' | 'correlation'>('reading');

  // Default to the first available year (most recent)
  const [selectedYear, setSelectedYear] = useState<number>(
    metrics.availableYears[0] || new Date().getFullYear()
  );

  // Hovered day for interactive tooltip
  const [hoveredDay, setHoveredDay] = useState<{
    day: DayReadingActivity;
    rect: DOMRect | null;
  } | null>(null);

  // Selected day for focused inspector window (Kindle notes on right + Obsidian files list with View buttons)
  const [selectedDay, setSelectedDay] = useState<DayReadingActivity | null>(null);

  // Filter clippings belonging to selectedDay
  const dayClippings = useMemo(() => {
    if (!selectedDay || !userState?.kindleClippings) return [];
    const targetDate = selectedDay.date;
    return userState.kindleClippings.filter((c) => {
      if (!c.addedAt) return false;
      if (c.addedAt.startsWith(targetDate)) return true;
      try {
        const d = new Date(c.addedAt);
        const localIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return localIso === targetDate;
      } catch {
        return false;
      }
    });
  }, [selectedDay, userState?.kindleClippings]);

  // Retrieve files drafted on selectedDay from telemetry
  const dayDraftedFiles = useMemo(() => {
    if (!selectedDay || !userState?.writingTelemetry?.dailyFiles) return [];
    return userState.writingTelemetry.dailyFiles[selectedDay.date] || [];
  }, [selectedDay, userState?.writingTelemetry?.dailyFiles]);

  // Retrieve files drafted on hoveredDay for instant tooltip display
  const hoveredDayDraftedFiles = useMemo(() => {
    if (!hoveredDay || !userState?.writingTelemetry?.dailyFiles) return [];
    return userState.writingTelemetry.dailyFiles[hoveredDay.day.date] || [];
  }, [hoveredDay, userState?.writingTelemetry?.dailyFiles]);

  const activeGrid = metrics.allYearsGrids[selectedYear] || metrics.allYearsGrids[metrics.availableYears[0]];

  // Quick lookup from book title to Book object
  const booksByTitle = useMemo(() => {
    const map = new Map<string, Book>();
    for (const b of books) {
      if (b.cleanTitle) map.set(b.cleanTitle.toLowerCase().trim(), b);
      if (b.title) map.set(b.title.toLowerCase().trim(), b);
    }
    return map;
  }, [books]);

  // Top Obsidian vault notes worked on in selectedYear (or all-time)
  const topDraftedFiles = useMemo(() => {
    if (!userState?.writingTelemetry?.dailyFiles) return [];
    const fileMap = new Map<
      string,
      {
        fileName: string;
        filePath: string;
        folder: string;
        totalWords: number;
        sessionsCount: number;
        lastDate: string;
      }
    >();

    for (const [date, files] of Object.entries(userState.writingTelemetry.dailyFiles)) {
      if (selectedYear && !date.startsWith(String(selectedYear))) continue;

      for (const f of files) {
        const existing = fileMap.get(f.filePath);
        if (existing) {
          existing.totalWords += f.words;
          existing.sessionsCount += 1;
          if (date > existing.lastDate) existing.lastDate = date;
        } else {
          fileMap.set(f.filePath, {
            fileName: f.fileName,
            filePath: f.filePath,
            folder: f.folder,
            totalWords: f.words,
            sessionsCount: 1,
            lastDate: date,
          });
        }
      }
    }

    return Array.from(fileMap.values())
      .sort((a, b) => b.totalWords - a.totalWords || b.sessionsCount - a.sessionsCount)
      .slice(0, 9);
  }, [userState?.writingTelemetry?.dailyFiles, selectedYear]);

  // Films watched in selectedYear from Letterboxd telemetry
  const yearWatchedFilms = useMemo(() => {
    const allWatches = userState?.letterboxdData?.watches || [];
    return allWatches.filter((w) => {
      if (!w.date) return false;
      return w.date.startsWith(String(selectedYear));
    });
  }, [userState?.letterboxdData?.watches, selectedYear]);

  // Color mapping for cells according to the active mode
  const getCellClasses = (day: DayReadingActivity) => {
    const hasFinished = day.booksFinishedCount > 0;

    if (heatmapMode === 'reading') {
      let bg = 'bg-[var(--bg-surface)] border-[var(--border-ledger)]/60';
      if (day.intensityLevel === 1) {
        bg = 'bg-[#F5C96B]/30 border-[#F5C96B]/50 hover:border-[#F5C96B]';
      } else if (day.intensityLevel === 2) {
        bg = 'bg-[#F5C96B]/70 border-[#D99A26] hover:border-amber-400';
      } else if (day.intensityLevel === 3) {
        bg = 'bg-[#D97706] border-[#B45309] hover:border-amber-600';
      } else if (day.intensityLevel === 4) {
        bg = 'bg-[#8E2B41] border-[#5A1726] hover:border-rose-400';
      }
      const ring = hasFinished ? 'ring-2 ring-[var(--accent-gold)] ring-offset-1 ring-offset-[var(--bg-card)]' : '';
      return `${bg} ${ring}`;
    }

    if (heatmapMode === 'writing') {
      let bg = 'bg-[var(--bg-surface)] border-[var(--border-ledger)]/60';
      if (day.writingIntensityLevel === 1) {
        bg = 'bg-emerald-400/25 border-emerald-400/40 hover:border-emerald-500';
      } else if (day.writingIntensityLevel === 2) {
        bg = 'bg-emerald-500/55 border-emerald-600 hover:border-emerald-500';
      } else if (day.writingIntensityLevel === 3) {
        bg = 'bg-emerald-600 border-emerald-700 hover:border-emerald-800 text-white';
      } else if (day.writingIntensityLevel === 4) {
        bg = 'bg-[#12a53e] border-[#0d7a2d] hover:border-emerald-400 text-white shadow-xs';
      }
      return bg;
    }

    if (heatmapMode === 'cinema') {
      let bg = 'bg-[var(--bg-surface)] border-[var(--border-ledger)]/60';
      if (day.cinemaIntensityLevel === 1) {
        bg = 'bg-purple-400/25 border-purple-400/40 hover:border-purple-500';
      } else if (day.cinemaIntensityLevel === 2) {
        bg = 'bg-purple-500/55 border-purple-600 hover:border-purple-500 text-white';
      } else if (day.cinemaIntensityLevel === 3) {
        bg = 'bg-purple-600 border-purple-700 hover:border-purple-800 text-white';
      } else if (day.cinemaIntensityLevel === 4) {
        bg = 'bg-purple-800 border-purple-900 hover:border-purple-400 text-white shadow-xs';
      }
      return bg;
    }

    // Narrative Intake Correlation Mode (Input vs Output)
    if (day.isDualMomentumDay || (day.wordsWrittenCount > 0 && (day.highlightCount > 0 || day.booksFinishedCount > 0 || day.filmsWatchedCount > 0))) {
      return 'bg-[#8E2B41] border-[#5A1726] ring-2 ring-[var(--accent-gold)] ring-offset-1 ring-offset-[var(--bg-card)] shadow-xs';
    }
    if (day.highlightCount > 0 || day.booksFinishedCount > 0) {
      return 'bg-[#F5C96B]/70 border-[#D99A26] hover:border-amber-400';
    }
    if (day.filmsWatchedCount > 0) {
      return 'bg-purple-500/60 border-purple-600 hover:border-purple-400 text-white';
    }
    if (day.wordsWrittenCount > 0) {
      return 'bg-emerald-500/60 border-emerald-600 hover:border-emerald-500';
    }
    return 'bg-[var(--bg-surface)] border-[var(--border-ledger)]/60';
  };

  const formatDayTooltip = (day: DayReadingActivity) => {
    const d = new Date(day.date + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <section aria-labelledby="kindle-heatmap-heading" className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-3 border-b border-[var(--border-ledger)] gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/30 flex items-center justify-center text-[var(--accent-gold)] shadow-2xs">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h2
              id="kindle-heatmap-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              {heatmapMode === 'reading'
                ? 'Kindle Annotation Matrix & Reading Cadence'
                : heatmapMode === 'writing'
                ? 'Obsidian Scriptorium & Drafting Velocity'
                : heatmapMode === 'cinema'
                ? 'Letterboxd Cinema Matrix & Screen Intake'
                : 'Narrative Intake Matrix · Reading, Writing & Cinema Correlation'}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {heatmapMode === 'reading'
                ? 'Intraday timestamps extracted from Kindle highlights and completed volume dates'
                : heatmapMode === 'writing'
                ? 'Writing output and drafting sprints tracked in Obsidian via Keep the Rhythm'
                : heatmapMode === 'cinema'
                ? 'Films watched, diary entries, and cinephile ratings cross-referenced from Letterboxd'
                : 'Cross-referencing Kindle reading intake, Letterboxd cinema stream, and Obsidian creative output'}
            </p>
          </div>
        </div>

        {/* Action Controls: Mode Switcher & Year Selector */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto font-mono-tabular">
          {/* Mode Switcher */}
          {(metrics.hasWritingTelemetry || metrics.hasCinemaTelemetry || (userState?.letterboxdData?.watches?.length || 0) > 0) && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <button
                type="button"
                onClick={() => setHeatmapMode('reading')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  heatmapMode === 'reading'
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                }`}
              >
                <BookOpen className="w-3 h-3" />
                <span>Reading</span>
              </button>
              {metrics.hasWritingTelemetry && (
                <button
                  type="button"
                  onClick={() => setHeatmapMode('writing')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    heatmapMode === 'writing'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  <Feather className="w-3 h-3" />
                  <span>Writing</span>
                </button>
              )}
              {(metrics.hasCinemaTelemetry || (userState?.letterboxdData?.watches?.length || 0) > 0) && (
                <button
                  type="button"
                  onClick={() => setHeatmapMode('cinema')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    heatmapMode === 'cinema'
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  <Film className="w-3 h-3" />
                  <span>Cinema</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setHeatmapMode('correlation')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  heatmapMode === 'correlation'
                    ? 'bg-[var(--accent-gold)] text-black shadow-2xs font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                }`}
              >
                <ArrowRightLeft className="w-3 h-3" />
                <span>Correlation</span>
              </button>
            </div>
          )}

          {/* Year Selector Pills */}
          {metrics.availableYears.length > 1 && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              {metrics.availableYears.map((yr) => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    selectedYear === yr
                      ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dynamic 4 Vital Metrics Cards depending on active mode */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {heatmapMode === 'reading' ? (
          <>
            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Kindle Highlights</span>
                <BookmarkCheck className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {metrics.totalHighlights.toLocaleString()}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Across {metrics.totalActiveDays} active days
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Longest Streak</span>
                <Flame className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {metrics.longestStreakDays}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">days</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Unbroken daily reading momentum
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Peak Day Flurry</span>
                <Zap className="w-3.5 h-3.5 text-rose-500" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {metrics.maxHighlightsInSingleDay}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">passages</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                {metrics.mostActiveDay?.date ? formatDayTooltip({ date: metrics.mostActiveDay.date } as any) : '—'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Prime Reading Hour</span>
                <Clock className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {metrics.peakHour.label}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {metrics.peakHour.count} passages highlighted
              </div>
            </div>
          </>
        ) : heatmapMode === 'writing' ? (
          <>
            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Total Words Drafted</span>
                <Feather className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {metrics.totalWordsWritten.toLocaleString()}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Across {metrics.totalWritingDays} drafting days
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Single-Day High Mark</span>
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {metrics.maxWordsInSingleDay.toLocaleString()}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">words</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Feb 11, 2026 (Warband / Ioren)
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Daily 300w Goal Hits</span>
                <Award className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                45 <span className="text-sm font-normal text-[var(--text-muted)]">days</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Target reached in Obsidian
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Prime Drafting Window</span>
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[var(--text-ink)]">
                17:00–19:00
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                + 02:00 night-owl burst (4.1k w)
              </div>
            </div>
          </>
        ) : heatmapMode === 'cinema' ? (
          <>
            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Total Films Screened</span>
                <Film className="w-3.5 h-3.5 text-purple-500" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {metrics.totalFilmsWatched.toLocaleString()}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Across {metrics.totalCinemaDays} active screening days
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Written Reviews</span>
                <Award className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {userState?.letterboxdData?.totalReviewsCount || 29}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">reviews</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {userState?.letterboxdData?.totalDiaryCount || 48} dated diary entries
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Queued in Watchlist</span>
                <BookmarkCheck className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {userState?.letterboxdData?.totalWatchlistCount || 69}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">films</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Awaiting upcoming screening
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Screenings in {selectedYear}</span>
                <Zap className="w-3.5 h-3.5 text-rose-500" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {activeGrid?.totalFilmsWatched || 0}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">films</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Across {activeGrid?.activeCinemaDaysCount || 0} screening days in {selectedYear}
              </div>
            </div>
          </>
        ) : (
          /* Correlation Mode */
          <>
            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Dual Momentum Days</span>
                <Flame className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--accent-primary)]">
                {metrics.dualMomentumDaysCount}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">days</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Combined narrative intake &amp; vault drafting
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Inspired Drafting Rate</span>
                <Zap className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--accent-gold)]">
                {metrics.inspiredRatePct}%
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {metrics.inspiredDaysCount} of {metrics.totalWritingDays} writing days preceded by reading
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Total Intake (Input)</span>
                <BookOpen className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {(metrics.totalHighlights + metrics.totalFilmsWatched).toLocaleString()}{' '}
                <span className="text-sm font-normal text-[var(--text-muted)]">events</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {metrics.totalHighlights.toLocaleString()} passages + {metrics.totalFilmsWatched} films
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between text-[var(--text-muted)] text-[11px] font-mono-tabular uppercase tracking-wider mb-1">
                <span>Total Output (Words)</span>
                <Feather className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[var(--text-ink)]">
                {metrics.totalWordsWritten.toLocaleString()}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                Across {metrics.totalWritingDays} drafting days
              </div>
            </div>
          </>
        )}
      </div>

      {/* Correlation Insights Callout Banner in Correlation Mode */}
      {heatmapMode === 'correlation' && (
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border-l-4 border-[var(--accent-primary)] border-t border-r border-b border-[var(--border-ledger)] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" />
              <span>Narrative Intake Finding: Narrative Ingestion Catalyzes Creative Drafting</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed">
              <strong>{metrics.inspiredRatePct}% of your drafting days</strong> occurred within 48 hours of an active reading or cinema screening session. Narrative consumption fuels creative output!
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-md bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-mono-tabular font-bold shrink-0 self-start sm:self-auto">
            {metrics.dualMomentumDaysCount} Dual Days
          </span>
        </div>
      )}

      {/* Matrix Box */}
      <div className="p-5 sm:p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono-tabular text-sm font-bold text-[var(--text-ink)]">
              {selectedYear}{' '}
              {heatmapMode === 'reading'
                ? 'Reading Matrix'
                : heatmapMode === 'writing'
                ? 'Drafting Matrix'
                : heatmapMode === 'cinema'
                ? 'Cinema Matrix'
                : 'Narrative Intake Matrix'}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono-tabular text-[var(--text-muted)]">
              {heatmapMode === 'reading'
                ? `${activeGrid?.totalHighlights.toLocaleString() || 0} highlights across ${activeGrid?.activeReadingDaysCount || 0} reading days`
                : heatmapMode === 'writing'
                ? `${activeGrid?.totalWordsWritten.toLocaleString() || 0} words across ${activeGrid?.activeWritingDaysCount || 0} drafting days`
                : heatmapMode === 'cinema'
                ? `${activeGrid?.totalFilmsWatched.toLocaleString() || 0} films screened across ${activeGrid?.activeCinemaDaysCount || 0} cinema days`
                : `${activeGrid?.dualMomentumDaysCount || 0} dual momentum days`}
            </span>
          </div>

          {/* Dynamic Legend */}
          <div className="flex items-center gap-1.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
            {heatmapMode === 'correlation' ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1 text-[var(--text-ink)]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#F5C96B]/80 border border-[#D99A26]" />
                  <span>Reading</span>
                </span>
                <span className="flex items-center gap-1 text-[var(--text-ink)]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-purple-500/80 border border-purple-600" />
                  <span>Cinema</span>
                </span>
                <span className="flex items-center gap-1 text-[var(--text-ink)]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500/80 border border-emerald-600" />
                  <span>Writing</span>
                </span>
                <span className="flex items-center gap-1 text-[var(--accent-primary)] font-bold">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#8E2B41] ring-2 ring-[var(--accent-gold)]" />
                  <span>Dual Momentum</span>
                </span>
              </div>
            ) : heatmapMode === 'writing' ? (
              <div className="flex items-center gap-1">
                <span>Fewer</span>
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <div
                    key={lvl}
                    className={`w-3 h-3 rounded-xs border ${
                      lvl === 0
                        ? 'bg-[var(--bg-surface)] border-[var(--border-ledger)]/60'
                        : lvl === 1
                        ? 'bg-emerald-400/25 border-emerald-400/40'
                        : lvl === 2
                        ? 'bg-emerald-500/55 border-emerald-600'
                        : lvl === 3
                        ? 'bg-emerald-600 border-emerald-700'
                        : 'bg-[#12a53e] border-[#0d7a2d]'
                    }`}
                  />
                ))}
                <span>More</span>
                <span className="ml-2 pl-2 border-l border-[var(--border-ledger)] text-emerald-500 font-semibold">
                  Goal: 300w
                </span>
              </div>
            ) : heatmapMode === 'cinema' ? (
              <div className="flex items-center gap-1">
                <span>Fewer</span>
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <div
                    key={lvl}
                    className={`w-3 h-3 rounded-xs border ${
                      lvl === 0
                        ? 'bg-[var(--bg-surface)] border-[var(--border-ledger)]/60'
                        : lvl === 1
                        ? 'bg-purple-400/25 border-purple-400/40'
                        : lvl === 2
                        ? 'bg-purple-500/55 border-purple-600'
                        : lvl === 3
                        ? 'bg-purple-600 border-purple-700'
                        : 'bg-purple-800 border-purple-900'
                    }`}
                  />
                ))}
                <span>More</span>
                <span className="ml-2 pl-2 border-l border-[var(--border-ledger)] text-purple-600 dark:text-purple-400 font-semibold">
                  Films / Day
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span>Fewer</span>
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <div
                    key={lvl}
                    className={`w-3 h-3 rounded-xs border ${
                      lvl === 0
                        ? 'bg-[var(--bg-surface)] border-[var(--border-ledger)]/60'
                        : lvl === 1
                        ? 'bg-[#F5C96B]/30 border-[#F5C96B]/50'
                        : lvl === 2
                        ? 'bg-[#F5C96B]/70 border-[#D99A26]'
                        : lvl === 3
                        ? 'bg-[#D97706] border-[#B45309]'
                        : 'bg-[#8E2B41] border-[#5A1726]'
                    }`}
                  />
                ))}
                <span>More</span>
                <span className="ml-2 pl-2 border-l border-[var(--border-ledger)] flex items-center gap-1 text-[var(--accent-gold)]">
                  <span className="w-2.5 h-2.5 rounded-xs ring-2 ring-[var(--accent-gold)] bg-transparent inline-block" />
                  <span>Volume Completed</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Matrix Grid Container */}
        <div className="overflow-x-auto pb-2 pt-1">
          <div className="inline-block min-w-[760px] select-none">
            {/* Month Headers */}
            <div className="flex text-[10px] font-mono-tabular text-[var(--text-muted)] mb-1 pl-8">
              {activeGrid?.monthLabels.map((m) => (
                <div
                  key={m.monthIndex}
                  style={{ width: `${(100 / 53) * 4.3}%` }}
                  className="truncate"
                >
                  {m.name}
                </div>
              ))}
            </div>

            {/* Week Columns & Day Rows */}
            <div className="flex gap-[3px]">
              <div className="flex flex-col gap-[3px] text-[10px] font-mono-tabular text-[var(--text-muted)] justify-between pr-2 w-6 shrink-0 py-0.5">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
                <span>Sun</span>
              </div>

              <div className="flex-1 flex gap-[3px]">
                {activeGrid?.weeks.map((week) => (
                  <div key={week.weekIndex} className="flex-1 flex flex-col gap-[3px]">
                    {week.days.map((day, dIdx) => {
                      if (!day) {
                        return (
                          <div
                            key={dIdx}
                            className="aspect-square w-full rounded-xs bg-transparent"
                          />
                        );
                      }

                      return (
                        <div
                          key={day.date}
                          role="button"
                          tabIndex={0}
                          title={`Click to inspect Kindle notes and Obsidian files for ${day.date}`}
                          onClick={() => setSelectedDay(day)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedDay(day);
                            }
                          }}
                          onMouseEnter={(e) => {
                            setHoveredDay({
                              day,
                              rect: e.currentTarget.getBoundingClientRect(),
                            });
                          }}
                          onMouseLeave={() => setHoveredDay(null)}
                          className={`aspect-square w-full rounded-xs border transition-all cursor-pointer hover:ring-2 hover:ring-[var(--accent-primary)] hover:scale-110 hover:z-10 ${getCellClasses(
                            day
                          )}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Floating Tooltip */}
        {hoveredDay && (
          <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-md text-xs space-y-1.5 animate-fadeIn">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-ledger)]/70 pb-1">
              <span className="font-mono-tabular font-bold text-[var(--text-ink)]">
                {formatDayTooltip(hoveredDay.day)}
              </span>
              <div className="flex items-center gap-2 font-mono-tabular text-[11px]">
                {hoveredDay.day.highlightCount > 0 && (
                  <span className="text-[var(--accent-gold)] font-semibold">
                    {hoveredDay.day.highlightCount} passages
                  </span>
                )}
                {hoveredDay.day.filmsWatchedCount > 0 && (
                  <span className="text-purple-600 dark:text-purple-400 font-semibold">
                    🎬 {hoveredDay.day.filmsWatchedCount} {hoveredDay.day.filmsWatchedCount === 1 ? 'film' : 'films'}
                  </span>
                )}
                {hoveredDay.day.wordsWrittenCount > 0 && (
                  <span className="text-emerald-500 font-semibold">
                    {hoveredDay.day.wordsWrittenCount.toLocaleString()} words
                  </span>
                )}
              </div>
            </div>

            {hoveredDay.day.isDualMomentumDay && (
              <div className="flex items-center gap-1.5 text-[var(--accent-primary)] font-bold text-[11px]">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                <span>Dual Momentum: Read on Kindle and drafted in Obsidian!</span>
              </div>
            )}

            {hoveredDay.day.booksFinishedCount > 0 && (
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
                <Award className="w-3.5 h-3.5" />
                <span>Finished: {hoveredDay.day.finishedBooks.join(', ')}</span>
              </div>
            )}

            {hoveredDay.day.highlightedBooks.length > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="text-[10px] uppercase font-mono-tabular tracking-wider text-[var(--text-muted)]">
                  Books Annotated:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hoveredDay.day.highlightedBooks.map((b) => (
                    <span
                      key={b.title}
                      className="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[11px] text-[var(--text-ink)] font-serif-editorial"
                    >
                      {b.title}{' '}
                      <strong className="text-[var(--accent-gold)] font-mono-tabular">
                        ({b.count})
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Letterboxd Screenings on This Day */}
            {hoveredDay.day.watchedFilms.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-[var(--border-ledger)]/60">
                <div className="text-[10px] uppercase font-mono-tabular tracking-wider text-purple-600 dark:text-purple-400 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Film className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                    <span>Films Screened ({hoveredDay.day.watchedFilms.length}):</span>
                  </span>
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  {hoveredDay.day.watchedFilms.map((w) => (
                    <div
                      key={w.id || w.name}
                      className="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-purple-500/30 text-[11px] text-[var(--text-ink)] font-serif-editorial flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        🎬 {w.name} {w.year ? `(${w.year})` : ''}
                      </span>
                      {w.rating && (
                        <span className="text-amber-500 font-mono-tabular shrink-0 text-xs">
                          {formatStarRating(w.rating)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Obsidian Vault Notes Drafted on This Day */}
            {hoveredDayDraftedFiles.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-[var(--border-ledger)]/60">
                <div className="text-[10px] uppercase font-mono-tabular tracking-wider text-[#7C5CFF] font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3 text-[#7C5CFF]" />
                    <span>Vault Files Worked On ({hoveredDayDraftedFiles.length}):</span>
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    +{hoveredDay.day.wordsWrittenCount.toLocaleString()} w
                  </span>
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  {hoveredDayDraftedFiles.slice(0, 5).map((f) => (
                    <div
                      key={f.filePath}
                      className="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[#7C5CFF]/30 text-[11px] text-[var(--text-ink)] font-mono-tabular flex items-center justify-between gap-2"
                    >
                      <span className="truncate font-medium" title={f.filePath}>
                        📄 {f.fileName}
                      </span>
                      {f.words > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                          +{f.words.toLocaleString()} w
                        </span>
                      )}
                    </div>
                  ))}
                  {hoveredDayDraftedFiles.length > 5 && (
                    <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] italic pl-1">
                      +{hoveredDayDraftedFiles.length - 5} more files... (click cell to open full inspector)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Click to inspect prompt */}
            <div className="pt-1.5 border-t border-[var(--border-ledger)]/60 text-[10px] font-mono-tabular text-[var(--accent-primary)] flex items-center justify-between font-semibold">
              <span>Click cell to open day notes &amp; Obsidian files</span>
              <span>→</span>
            </div>
          </div>
        )}
      </div>

      {/* Circadian 24-Hour Rhythm & Weekly Cadence side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 24-Hour Distribution (Adaptive based on Reading vs Writing mode) */}
        <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--accent-secondary)]" />
              <h3 className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                {heatmapMode === 'writing'
                  ? '24-Hour Obsidian Drafting Rhythm'
                  : '24-Hour Kindle Annotation Rhythm'}
              </h3>
            </div>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              Peak:{' '}
              <strong className="text-[var(--text-ink)]">
                {heatmapMode === 'writing' ? '17:00 (7,612 w)' : metrics.peakHour.label}
              </strong>
            </span>
          </div>

          <div className="flex items-end gap-1 h-32 pt-2">
            {(heatmapMode === 'writing' ? metrics.writingHourlyDistribution : metrics.hourlyDistribution).map((h: any) => {
              const countVal = heatmapMode === 'writing' ? (h.words || 0) : (h.count || 0);
              const maxCount = Math.max(
                ...(heatmapMode === 'writing'
                  ? metrics.writingHourlyDistribution.map((i) => i.words)
                  : metrics.hourlyDistribution.map((i) => i.count)),
                1
              );
              const heightPct = Math.round((countVal / maxCount) * 100);
              const isPeak = heatmapMode === 'writing' ? h.hour === 17 : h.hour === metrics.peakHour.hour;

              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full flex items-end justify-center h-24">
                    <div
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                      className={`w-full rounded-t transition-all ${
                        isPeak
                          ? 'bg-[var(--accent-primary)] shadow-2xs'
                          : countVal > 0
                          ? heatmapMode === 'writing'
                            ? 'bg-emerald-500/70 group-hover:bg-emerald-500'
                            : 'bg-[var(--accent-gold)]/60 group-hover:bg-[var(--accent-gold)]'
                          : 'bg-[var(--border-ledger)]/40'
                      }`}
                    />
                  </div>
                  <span className="text-[9px] font-mono-tabular text-[var(--text-muted)]">
                    {h.hour % 4 === 0 ? h.hour : ''}
                  </span>

                  <div className="absolute -top-7 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-surface)] border border-[var(--border-ledger)] px-1.5 py-0.5 rounded text-[10px] font-mono-tabular text-[var(--text-ink)] whitespace-nowrap z-10 shadow-xs">
                    {h.label}: {countVal.toLocaleString()}{' '}
                    {heatmapMode === 'writing' ? 'words' : 'highlights'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 7-Day Weekly Cadence */}
        <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent-gold)]" />
              <h3 className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                Weekly Reading Cadence
              </h3>
            </div>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              Peak: <strong className="text-[var(--text-ink)]">{metrics.peakDayOfWeek.name}</strong>
            </span>
          </div>

          <div className="space-y-2 pt-1">
            {metrics.dayOfWeekDistribution.map((d) => {
              const isPeak = d.name === metrics.peakDayOfWeek.name;
              return (
                <div key={d.dayIndex} className="flex items-center gap-3 text-xs font-mono-tabular">
                  <span className="w-8 text-[var(--text-muted)] font-medium">
                    {d.shortName}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-[var(--bg-surface)] overflow-hidden border border-[var(--border-ledger)]/60">
                    <div
                      style={{ width: `${d.pct}%` }}
                      className={`h-full rounded-full transition-all ${
                        isPeak ? 'bg-[var(--accent-primary)]' : 'bg-[var(--accent-gold)]/60'
                      }`}
                    />
                  </div>
                  <span className="w-12 text-right text-[var(--text-muted)]">
                    {d.count} ({d.pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Annotated Books Shelf (Shown in Reading or Correlation mode) */}
      {(heatmapMode === 'reading' || heatmapMode === 'correlation') && metrics.topAnnotatedBooks.length > 0 && (
        <div className="p-5 sm:p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" />
              <h3 className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)]">
                Most Heavily Annotated Works ({metrics.topAnnotatedBooks.length})
              </h3>
            </div>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              Ranked by total captured Kindle passages
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {metrics.topAnnotatedBooks.map((bookEntry, idx) => {
              const matched =
                (bookEntry.bookId ? books.find((b) => b.id === bookEntry.bookId) : null) ||
                booksByTitle.get(bookEntry.title.toLowerCase().trim());

              return (
                <div
                  key={bookEntry.title + idx}
                  onClick={() => {
                    if (matched) {
                      onSelectBook(matched);
                    } else {
                      onSelectBookById(bookEntry.bookId || null, bookEntry.title);
                    }
                  }}
                  className="group p-3 rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] transition-all cursor-pointer flex flex-col justify-between shadow-2xs space-y-2"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] mb-1">
                      <span className="font-bold text-[var(--accent-gold)]">#{idx + 1}</span>
                      <span>{bookEntry.highlightCount} passages</span>
                    </div>
                    <h4 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors line-clamp-2">
                      {bookEntry.title}
                    </h4>
                    <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                      {bookEntry.author}
                    </p>
                  </div>

                  {bookEntry.locations.length > 0 && bookEntry.locationRange && (
                    <div className="pt-2 border-t border-[var(--border-ledger)]/60">
                      <div className="flex items-center justify-between text-[10px] font-mono-tabular text-[var(--text-muted)] mb-1">
                        <span>Loc {bookEntry.locationRange.min}</span>
                        <span>Annotation Distribution</span>
                        <span>Loc {bookEntry.locationRange.max}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--bg-card)] border border-[var(--border-ledger)]/60 relative overflow-hidden">
                        {bookEntry.locations.map((loc, lIdx) => {
                          const min = bookEntry.locationRange!.min;
                          const max = Math.max(bookEntry.locationRange!.max, min + 1);
                          const pct = Math.round(((loc - min) / (max - min)) * 100);
                          return (
                            <div
                              key={lIdx}
                              style={{ left: `${pct}%` }}
                              className="absolute top-0 bottom-0 w-0.5 bg-[var(--accent-primary)]/80"
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {bookEntry.dateRange && (
                    <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] flex items-center justify-between">
                      <span>{bookEntry.dateRange.first} → {bookEntry.dateRange.last}</span>
                      <ChevronRight className="w-3 h-3 text-[var(--text-muted)] group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Most Active Obsidian Manuscript Notes Shelf (Shown in Writing or Correlation mode) */}
      {(heatmapMode === 'writing' || heatmapMode === 'correlation') && topDraftedFiles.length > 0 && (
        <div className="p-5 sm:p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#7C5CFF]" />
              <h3 className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)]">
                Most Active Vault Manuscript Notes ({selectedYear})
              </h3>
            </div>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              Ranked by words drafted &amp; active session count
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {topDraftedFiles.map((f, idx) => {
              const cleanPath = f.filePath.replace(/\.md$/, '');
              const obsidianUri = `obsidian://open?vault=obsidian2025&file=${encodeURIComponent(cleanPath)}`;

              return (
                <div
                  key={f.filePath + idx}
                  className="group p-3.5 rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)] hover:border-[#7C5CFF]/60 transition-all flex flex-col justify-between shadow-2xs space-y-2.5"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] mb-1">
                      <span className="font-bold text-[#7C5CFF]">#{idx + 1}</span>
                      {f.totalWords > 0 ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          +{f.totalWords.toLocaleString()} w
                        </span>
                      ) : (
                        <span>Touch logged</span>
                      )}
                    </div>
                    <h4 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[#7C5CFF] transition-colors line-clamp-2">
                      {f.fileName}
                    </h4>
                    {f.folder && (
                      <p className="text-[11px] font-mono-tabular text-[var(--text-muted)] truncate mt-0.5">
                        {f.folder}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--border-ledger)]/60 flex items-center justify-between text-[11px] font-mono-tabular">
                    <span className="text-[var(--text-muted)]">
                      {f.sessionsCount} {f.sessionsCount === 1 ? 'session' : 'sessions'}
                    </span>
                    <a
                      href={obsidianUri}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-[#7C5CFF]/10 text-[#7C5CFF] border border-[#7C5CFF]/30 hover:bg-[#7C5CFF]/20 hover:border-[#7C5CFF] transition-all cursor-pointer shadow-2xs"
                      title={`Open ${f.fileName} in Obsidian desktop`}
                    >
                      <span>View</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Films Screened Shelf (Shown in Cinema mode, or in Correlation mode when films are present in selectedYear) */}
      {(heatmapMode === 'cinema' || (heatmapMode === 'correlation' && yearWatchedFilms.length > 0)) && (
        <div className="p-5 sm:p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)]">
                Films Screened in {selectedYear} ({yearWatchedFilms.length})
              </h3>
            </div>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              Letterboxd diary watches &amp; reviews
            </span>
          </div>

          {yearWatchedFilms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {yearWatchedFilms.slice(0, 18).map((film, idx) => (
                <div
                  key={film.id || film.name + idx}
                  className="group p-3.5 rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)] hover:border-purple-500/60 transition-all flex flex-col justify-between shadow-2xs space-y-2.5"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] mb-1">
                      <span className="font-bold text-purple-600 dark:text-purple-400">
                        {film.date ? film.date.slice(5) : `#${idx + 1}`}
                      </span>
                      {film.rating && (
                        <span className="font-bold text-amber-500 text-xs">
                          {formatStarRating(film.rating)}
                        </span>
                      )}
                    </div>
                    <h4 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors line-clamp-2">
                      {film.name} {film.year ? <span className="text-xs font-normal font-mono-tabular text-[var(--text-muted)]">({film.year})</span> : null}
                    </h4>
                    {film.review && (
                      <p className="text-xs font-serif-editorial italic text-[var(--text-muted)] line-clamp-2 mt-1 pl-2 border-l-2 border-purple-400/60">
                        &ldquo;{film.review}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--border-ledger)]/60 flex items-center justify-between text-[11px] font-mono-tabular">
                    <span className="text-[var(--text-muted)]">
                      {film.rewatch ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">Rewatch</span>
                      ) : (
                        <span>First watch</span>
                      )}
                    </span>
                    {film.uri && (
                      <a
                        href={film.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500 transition-all cursor-pointer shadow-2xs"
                        title={`Open ${film.name} on Letterboxd`}
                      >
                        <span>Letterboxd</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] border-dashed text-center">
              <p className="font-serif-editorial text-sm italic text-[var(--text-muted)]">
                No Letterboxd film watches logged in {selectedYear}. Switch years above or drop Letterboxd CSVs in the cabinet.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Day Session Inspector Drawer (Kindle notes on right, Obsidian files with View in Obsidian buttons on left) */}
      <DaySessionDrawer
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        day={selectedDay}
        clippings={dayClippings}
        draftedFiles={dayDraftedFiles}
        books={books}
        onSelectBook={onSelectBook}
        onSelectBookById={onSelectBookById}
      />
    </section>
  );
};

export default KindleHeatmapSection;