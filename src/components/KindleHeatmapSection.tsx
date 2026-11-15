import React, { useState, useMemo } from 'react';
import {
  KindleHeatmapMetrics,
  DayReadingActivity,
} from '../lib/analytics/engine';
import { Book, UserLocalState } from '../types/library';
import { DaySessionDrawer } from './DaySessionDrawer';
import {
  Flame,
  Calendar,
  Sparkles,
  BookOpen,
  Award,
  ChevronRight,
  Feather,
  ArrowRightLeft,
  FileText,
  ExternalLink,
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
  // Mode toggle: Reading (Input) | Writing (Output) | Input vs Output (Correlation)
  const [heatmapMode, setHeatmapMode] = useState<'reading' | 'writing' | 'correlation'>('reading');

  // Default to the first available year (most recent)
  const [selectedYear, setSelectedYear] = useState<number>(
    metrics.availableYears[0] || new Date().getFullYear()
  );

  // Hovered day for interactive tooltip
  const [hoveredDay, setHoveredDay] = useState<{
    day: DayReadingActivity;
    rect: DOMRect | null;
  } | null>(null);

  // Selected day for focused inspector window
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

  const activeGrid =
    metrics.allYearsGrids[selectedYear] || metrics.allYearsGrids[metrics.availableYears[0]];

  // Quick lookup from book title to Book object
  const booksByTitle = useMemo(() => {
    const map = new Map<string, Book>();
    for (const b of books) {
      if (b.cleanTitle) map.set(b.cleanTitle.toLowerCase().trim(), b);
      if (b.title) map.set(b.title.toLowerCase().trim(), b);
    }
    return map;
  }, [books]);

  // Top Obsidian vault notes worked on in selectedYear
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
      const ring = hasFinished
        ? 'ring-2 ring-[var(--accent-gold)] ring-offset-1 ring-offset-[var(--bg-card)]'
        : '';
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

    // Correlation Mode (Reading vs Writing)
    if (
      day.isDualMomentumDay ||
      (day.wordsWrittenCount > 0 && (day.highlightCount > 0 || day.booksFinishedCount > 0))
    ) {
      return 'bg-[#8E2B41] border-[#5A1726] ring-2 ring-[var(--accent-gold)] ring-offset-1 ring-offset-[var(--bg-card)] shadow-xs';
    }
    if (day.highlightCount > 0 || day.booksFinishedCount > 0) {
      return 'bg-[#F5C96B]/70 border-[#D99A26] hover:border-amber-400';
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
                ? 'Reading & Annotation Calendar'
                : heatmapMode === 'writing'
                ? 'Obsidian Drafting Velocity'
                : 'Reading & Writing Correlation Matrix'}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {heatmapMode === 'reading'
                ? 'Timestamps from Kindle highlights and completed volume dates'
                : heatmapMode === 'writing'
                ? 'Writing output and drafting sprints tracked via Scriptor'
                : 'Cross-referencing Kindle reading intake with Obsidian drafting output'}
            </p>
          </div>
        </div>

        {/* Action Controls: Mode Switcher & Year Selector */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto font-mono-tabular">
          {metrics.hasWritingTelemetry && (
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
                : 'Correlation Matrix'}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="font-mono-tabular text-[var(--text-muted)]">
              {heatmapMode === 'reading'
                ? `${activeGrid?.totalHighlights.toLocaleString() || 0} highlights across ${activeGrid?.activeReadingDaysCount || 0} reading days`
                : heatmapMode === 'writing'
                ? `${activeGrid?.totalWordsWritten.toLocaleString() || 0} words across ${activeGrid?.activeWritingDaysCount || 0} drafting days`
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
                <span>Dual Momentum: Read on Kindle and drafted in Obsidian</span>
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
                        {f.fileName}
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
                      +{hoveredDayDraftedFiles.length - 5} more files... (click cell to open inspector)
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="pt-1.5 border-t border-[var(--border-ledger)]/60 text-[10px] font-mono-tabular text-[var(--accent-primary)] flex items-center justify-between font-semibold">
              <span>Click cell to open day notes &amp; Obsidian files</span>
              <span>→</span>
            </div>
          </div>
        )}
      </div>

      {/* Top Annotated Books Shelf (Shown in Reading or Correlation mode) */}
      {(heatmapMode === 'reading' || heatmapMode === 'correlation') &&
        metrics.topAnnotatedBooks.length > 0 && (
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
                        <span>
                          {bookEntry.dateRange.first} → {bookEntry.dateRange.last}
                        </span>
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

      {/* Day Session Inspector Drawer */}
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
