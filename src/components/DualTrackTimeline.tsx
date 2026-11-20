import React, { useMemo, useState, useEffect } from 'react';
import {
  BookOpen,
  Feather,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Award,
  Flame,
  FileText,
  ExternalLink,
  ZoomIn,
  RotateCcw,
  Star,
  Sparkles,
  PanelRightOpen,
} from 'lucide-react';
import type { Book, ReadingGoal, UserLocalState } from '../types/library';
import type { DayReadingActivity } from '../lib/analytics/engine';
import {
  buildDualTimelineIndex,
  buildDualTimelineViewModel,
  layoutReadingSpansForBuckets,
  type DualTimelineDayRecord,
  type PositionedReadingSpan,
  type TimelineBucket,
  type TimelineGranularity,
} from '../lib/analytics/dualTimeline';
import { DaySessionDrawer } from './DaySessionDrawer';

export interface DualTrackTimelineProps {
  books: Book[];
  userState: UserLocalState;
  readingGoals?: ReadingGoal[];
  onSelectBook: (book: Book) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
}

function toDayReadingActivity(
  day: DualTimelineDayRecord,
  userState: UserLocalState
): DayReadingActivity {
  const dayWatches = (userState.letterboxdData?.watches || []).filter(
    (w) => (w.date || '').slice(0, 10) === day.date
  );
  const words = day.wordsWritten;
  let writingLevel: 0 | 1 | 2 | 3 | 4 = 0;
  if (words >= 751) writingLevel = 4;
  else if (words >= 301) writingLevel = 3;
  else if (words >= 151) writingLevel = 2;
  else if (words >= 1) writingLevel = 1;

  const readTotal = day.highlightCount + day.finishedBooks.length * 4;
  let readLevel: 0 | 1 | 2 | 3 | 4 = 0;
  if (readTotal >= 11 || day.finishedBooks.length >= 2) readLevel = 4;
  else if (readTotal >= 6) readLevel = 3;
  else if (readTotal >= 3 || day.finishedBooks.length >= 1) readLevel = 2;
  else if (readTotal >= 1) readLevel = 1;

  return {
    date: day.date,
    highlightCount: day.highlightCount,
    booksFinishedCount: day.finishedBooks.length,
    sessionsCount: day.startedBooks.length,
    wordsWrittenCount: words,
    intensityLevel: readLevel,
    writingIntensityLevel: writingLevel,
    isDualMomentumDay: day.isDualMomentum,
    highlightedBooks: day.highlightedBooks.map((hb) => ({ title: hb.title, count: hb.count })),
    finishedBooks: day.finishedBooks.map((fb) => fb.title),
    filmsWatchedCount: dayWatches.length,
    watchedFilms: dayWatches,
    cinemaIntensityLevel:
      dayWatches.length >= 3 ? 4 : dayWatches.length === 2 ? 3 : dayWatches.length === 1 ? 2 : 0,
    isCinemaDay: dayWatches.length > 0,
  };
}

function formatFullDate(dateKey: string): string {
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(dt);
  } catch {
    return dateKey;
  }
}

export const DualTrackTimeline: React.FC<DualTrackTimelineProps> = ({
  books,
  userState,
  readingGoals = [],
  onSelectBook,
  onSelectBookById,
}) => {
  const index = useMemo(
    () => buildDualTimelineIndex(books, userState),
    [books, userState]
  );

  const [granularity, setGranularity] = useState<TimelineGranularity>('year');
  const [anchorDate, setAnchorDate] = useState<string>(() => index.latestActiveDate);
  const [hoveredBucketId, setHoveredBucketId] = useState<string | null>(null);
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);
  const [drawerDay, setDrawerDay] = useState<DualTimelineDayRecord | null>(null);
  const [includeOngoingSpans, setIncludeOngoingSpans] = useState(false);
  const [hoveredSpan, setHoveredSpan] = useState<PositionedReadingSpan | null>(null);

  // Keep anchor valid if underlying telemetry loads asynchronously
  useEffect(() => {
    setAnchorDate((prev) => prev || index.latestActiveDate);
  }, [index.latestActiveDate]);

  const viewModel = useMemo(
    () => buildDualTimelineViewModel(index, granularity, anchorDate),
    [index, granularity, anchorDate]
  );

  const bracketLayout = useMemo(
    () =>
      layoutReadingSpansForBuckets(
        index.readingSpans,
        viewModel.buckets,
        includeOngoingSpans,
        index.latestActiveDate
      ),
    [index.readingSpans, viewModel.buckets, includeOngoingSpans, index.latestActiveDate]
  );

  const booksById = useMemo(() => {
    const map = new Map<string, Book>();
    for (const b of books) map.set(b.id, b);
    return map;
  }, [books]);

  const activeBucket: TimelineBucket | null = useMemo(() => {
    if (hoveredBucketId) {
      const hovered = viewModel.buckets.find((b) => b.id === hoveredBucketId);
      if (hovered) return hovered;
    }
    if (selectedBucketId) {
      const selected = viewModel.buckets.find((b) => b.id === selectedBucketId);
      if (selected) return selected;
    }
    return null;
  }, [hoveredBucketId, selectedBucketId, viewModel.buckets]);

  const pinnedBucket: TimelineBucket | null = useMemo(() => {
    if (!selectedBucketId) return null;
    return viewModel.buckets.find((b) => b.id === selectedBucketId) || null;
  }, [selectedBucketId, viewModel.buckets]);

  // Clear stale selection on period change
  const changePeriod = (nextAnchor: string, nextGranularity?: TimelineGranularity) => {
    if (nextGranularity) setGranularity(nextGranularity);
    setAnchorDate(nextAnchor);
    setHoveredBucketId(null);
    setSelectedBucketId(null);
  };

  const handleGranularityChange = (nextGran: TimelineGranularity) => {
    // If a bucket is currently pinned, zoom straight into its startDate!
    const targetAnchor = pinnedBucket ? pinnedBucket.startDate : anchorDate;
    changePeriod(targetAnchor, nextGran);
  };

  const handleBucketDoubleClick = (bucket: TimelineBucket) => {
    if (granularity === 'year') {
      changePeriod(bucket.startDate, 'month');
    } else if (granularity === 'month') {
      changePeriod(bucket.startDate, 'week');
    } else {
      const dayRec = bucket.activeDays[0] || index.days[bucket.startDate] || null;
      if (dayRec) setDrawerDay(dayRec);
    }
  };

  const isAtLatestPeriod =
    viewModel.latestAnchorDate >= viewModel.startDate &&
    viewModel.latestAnchorDate <= viewModel.endDate;

  const hasPeriodActivity =
    viewModel.summary.booksFinishedCount > 0 ||
    viewModel.summary.totalHighlights > 0 ||
    viewModel.summary.totalWordsWritten > 0 ||
    viewModel.summary.uniqueNotesTouched > 0;

  // Clippings & files for DaySessionDrawer
  const drawerClippings = useMemo(() => {
    if (!drawerDay || !userState?.kindleClippings) return [];
    const targetDate = drawerDay.date;
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
  }, [drawerDay, userState?.kindleClippings]);

  const drawerDraftedFiles = useMemo(() => {
    if (!drawerDay || !userState?.writingTelemetry?.dailyFiles) return [];
    return userState.writingTelemetry.dailyFiles[drawerDay.date] || [];
  }, [drawerDay, userState?.writingTelemetry?.dailyFiles]);

  const drawerDayActivity = useMemo(
    () => (drawerDay ? toDayReadingActivity(drawerDay, userState) : null),
    [drawerDay, userState]
  );

  const openBookRef = (bookId?: string | null, fallbackTitle?: string) => {
    if (bookId && booksById.has(bookId)) {
      onSelectBook(booksById.get(bookId)!);
    } else {
      onSelectBookById(bookId || null, fallbackTitle);
    }
  };

  const currentYearNum = Number(viewModel.startDate.slice(0, 4));
  const quickYears = index.availableYears.slice(0, 5);

  return (
    <section
      aria-labelledby="dual-track-timeline-heading"
      className="space-y-5"
    >
      {/* Section Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between pb-3 border-b border-[var(--border-ledger)] gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/25 flex items-center justify-center text-[var(--accent-primary)] shadow-2xs shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2
              id="dual-track-timeline-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              Dual-Track Chronology
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Reading milestones &amp; annotations above the spine · Scriptor writing output below
            </p>
          </div>
        </div>

        {/* Granularity & Period Controls */}
        <div className="flex flex-wrap items-center gap-2 font-mono-tabular">
          {/* Year / Month / Week Switcher */}
          <div
            role="group"
            aria-label="Timeline granularity"
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs"
          >
            {(['year', 'month', 'week'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => handleGranularityChange(g)}
                className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  granularity === g
                    ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Prev / Period Label / Next Navigator */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
            <button
              type="button"
              onClick={() => changePeriod(viewModel.prevAnchorDate)}
              className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              aria-label={`Previous ${granularity}`}
              title={`Previous ${granularity}`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="px-2.5 py-0.5 text-xs font-bold text-[var(--text-ink)] min-w-[110px] text-center">
              {viewModel.periodLabel}
            </span>

            <button
              type="button"
              onClick={() => changePeriod(viewModel.nextAnchorDate)}
              className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              aria-label={`Next ${granularity}`}
              title={`Next ${granularity}`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Jump to Latest Activity */}
          {!isAtLatestPeriod && (
            <button
              type="button"
              onClick={() => changePeriod(viewModel.latestAnchorDate)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)] text-[11px] font-semibold text-[var(--text-ink)] cursor-pointer transition-colors shadow-2xs"
              title={`Jump to latest activity (${viewModel.latestAnchorDate})`}
            >
              <RotateCcw className="w-3 h-3 text-[var(--accent-gold)]" />
              <span>Latest</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Timeline Card */}
      <div className="p-5 sm:p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-5">
        {/* Top Meta & Legend Strip */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--border-ledger)]/70">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono-tabular">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/25 text-[var(--accent-primary)] font-semibold">
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                {viewModel.summary.booksFinishedCount}{' '}
                {viewModel.summary.booksFinishedCount === 1 ? 'book' : 'books'} finished
              </span>
              {viewModel.summary.totalHighlights > 0 && (
                <span className="text-[var(--text-muted)] font-normal">
                  · {viewModel.summary.totalHighlights.toLocaleString()} highlights
                </span>
              )}
            </span>

            {granularity === 'year' &&
              (() => {
                const yr = Number(viewModel.startDate.slice(0, 4));
                const nowYear = new Date().getFullYear();
                const goalObj = readingGoals.find((g) => g.goalId?.endsWith(String(yr)));
                const titleGoal =
                  yr === nowYear && userState?.yearlyTitleGoal
                    ? userState.yearlyTitleGoal
                    : goalObj?.goalValue ?? null;
                if (!titleGoal) return null;
                const finished = viewModel.summary.booksFinishedCount;
                let paceText = `${finished}/${titleGoal} goal`;
                if (yr === nowYear) {
                  const jan1 = new Date(yr, 0, 1, 12, 0, 0, 0);
                  const today = new Date();
                  const elapsed = Math.max(
                    1,
                    Math.round((today.getTime() - jan1.getTime()) / 86400000) + 1
                  );
                  const expected = Math.round(((titleGoal * elapsed) / 365) * 10) / 10;
                  const delta = Math.round((finished - expected) * 10) / 10;
                  paceText = `${finished}/${titleGoal} goal (${delta >= 0 ? `+${delta}` : delta} vs pace)`;
                }
                return (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[var(--text-muted)] font-medium">
                    <span>{paceText}</span>
                  </span>
                );
              })()}

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 font-semibold">
              <Feather className="w-3.5 h-3.5" />
              <span>{viewModel.summary.totalWordsWritten.toLocaleString()} words</span>
              {viewModel.summary.activeWritingDays > 0 && (
                <span className="text-[var(--text-muted)] font-normal">
                  · {viewModel.summary.activeWritingDays}d · {viewModel.summary.uniqueNotesTouched} notes
                </span>
              )}
            </span>

            {viewModel.summary.dualMomentumDays > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/35 text-[var(--accent-gold)] font-bold">
                <Flame className="w-3 h-3" />
                <span>{viewModel.summary.dualMomentumDays} dual days</span>
              </span>
            )}
          </div>

          {/* Quick Year Pills in Year View + Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-tabular text-[var(--text-muted)]">
            {granularity === 'year' && quickYears.length > 1 && (
              <div className="flex items-center gap-1 pr-2 border-r border-[var(--border-ledger)]">
                {quickYears.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => changePeriod(`${yr}-01-01`)}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      currentYearNum === yr
                        ? 'bg-[var(--text-ink)] text-[var(--bg-canvas)]'
                        : 'hover:text-[var(--text-ink)]'
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            )}

            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent-primary)] inline-block" />
              <span>Book Finished</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[var(--accent-gold)] inline-block" />
              <span>Highlights</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-500 inline-block" />
              <span>Scriptor Words</span>
            </span>
          </div>
        </div>

        {/* Dual-Track Horizontal Visualization */}
        {!hasPeriodActivity && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3.5 py-2 rounded-lg bg-[var(--bg-surface)] border border-dashed border-[var(--border-ledger)] text-xs font-mono-tabular text-[var(--text-muted)]">
            <span>
              No reading milestones or Scriptor logs recorded for {viewModel.periodLabel}.
            </span>
            <button
              type="button"
              onClick={() => changePeriod(viewModel.latestAnchorDate)}
              className="text-[var(--accent-primary)] hover:underline font-semibold cursor-pointer"
            >
              Jump to latest activity ({viewModel.latestAnchorDate}) →
            </button>
          </div>
        )}

        <div className="overflow-x-auto pb-1">
          <div
            className={
              granularity === 'year'
                ? 'min-w-[720px] select-none'
                : granularity === 'month'
                ? 'min-w-[660px] select-none'
                : 'min-w-[640px] select-none'
            }
          >
            {/* Track Side Labels */}
            <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] mb-1.5 px-0.5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1 text-[var(--accent-primary)] font-semibold">
                  <BookOpen className="w-3 h-3" />
                  <span>Read Above Axis</span>
                </span>
                {index.readingSpans.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIncludeOngoingSpans((v) => !v)}
                    className={`px-2 py-0.5 rounded border text-[9px] font-semibold transition-colors cursor-pointer ${
                      includeOngoingSpans
                        ? 'bg-[var(--accent-primary)]/12 border-[var(--accent-primary)]/40 text-[var(--accent-primary)]'
                        : 'bg-[var(--bg-surface)] border-[var(--border-ledger)] text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                    }`}
                    title="Toggle ongoing / unclosed reading spans in the bracket lanes"
                  >
                    {includeOngoingSpans ? 'Spans: Finished + Ongoing' : 'Spans: Finished Only'}
                  </button>
                )}
              </div>
              <span>
                {hoveredSpan
                  ? `${hoveredSpan.title} · ${hoveredSpan.startDate} → ${hoveredSpan.endDate ?? 'ongoing'}${hoveredSpan.durationDays != null ? ` (${hoveredSpan.durationDays}d)` : ''}`
                  : viewModel.subLabel}
              </span>
            </div>

            {/* Horizontal Reading-Duration Brackets Swimlane */}
            {bracketLayout.laneCount > 0 && (
              <div
                className="relative mb-1.5 px-0.5 space-y-1"
                aria-label="Reading duration brackets"
              >
                {Array.from({ length: bracketLayout.laneCount }, (_, laneIdx) => {
                  const laneSpans = bracketLayout.spans.filter((s) => s.lane === laneIdx);
                  const totalCols = Math.max(1, viewModel.buckets.length);

                  return (
                    <div key={`lane-${laneIdx}`} className="relative h-5 w-full">
                      {laneSpans.map((span) => {
                        const leftPct = (span.startIdx / totalCols) * 100;
                        const widthPct = ((span.endIdx - span.startIdx + 1) / totalCols) * 100;
                        const isSpanHovered = hoveredSpan?.id === span.id;
                        const durLabel =
                          span.durationDays != null
                            ? `${span.durationDays}d`
                            : span.isOngoing
                            ? 'ongoing'
                            : '';

                        return (
                          <button
                            key={span.id}
                            type="button"
                            onMouseEnter={() => setHoveredSpan(span)}
                            onMouseLeave={() => setHoveredSpan(null)}
                            onClick={() => openBookRef(span.bookId, span.title)}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                            title={`${span.title} by ${span.author}\n${span.startDate} → ${span.endDate ?? 'ongoing'}${durLabel ? ` · ${durLabel}` : ''}${span.pageCount ? ` · ${span.pageCount} pp.` : ''}`}
                            className={`group absolute top-0 h-5 px-0.5 flex flex-col justify-start text-left cursor-pointer transition-opacity ${
                              hoveredSpan && !isSpanHovered ? 'opacity-45' : 'opacity-100'
                            }`}
                          >
                            {/* Bracket Top Line + End-Cap Ticks */}
                            <div className="relative w-full flex items-center h-2">
                              {span.clippedLeft ? (
                                <span className="text-[8px] font-mono-tabular leading-none text-[var(--accent-primary)] pr-0.5 shrink-0">
                                  ‹
                                </span>
                              ) : (
                                <span
                                  className={`w-[2px] h-2 shrink-0 transition-colors ${
                                    isSpanHovered
                                      ? 'bg-[var(--accent-primary)]'
                                      : span.isOngoing
                                      ? 'bg-[var(--accent-gold)]'
                                      : 'bg-[var(--accent-primary)]/80'
                                  }`}
                                />
                              )}

                              <span
                                className={`flex-1 h-[2px] transition-colors ${
                                  span.isOngoing
                                    ? 'border-t-2 border-dashed border-[var(--accent-gold)]/75 bg-transparent'
                                    : isSpanHovered
                                    ? 'bg-[var(--accent-primary)]'
                                    : 'bg-[var(--accent-primary)]/70 group-hover:bg-[var(--accent-primary)]'
                                }`}
                              />

                              {span.clippedRight ? (
                                <span className="text-[8px] font-mono-tabular leading-none text-[var(--accent-gold)] pl-0.5 shrink-0">
                                  ›
                                </span>
                              ) : (
                                <span
                                  className={`w-[2px] h-2 shrink-0 transition-colors ${
                                    isSpanHovered
                                      ? 'bg-[var(--accent-primary)]'
                                      : 'bg-[var(--accent-primary)]/80'
                                  }`}
                                />
                              )}
                            </div>

                            {/* Compact Title + Duration Label */}
                            <div className="w-full flex items-center gap-1 px-1 -mt-0.5 overflow-hidden">
                              <span
                                className={`truncate text-[9.5px] leading-tight font-serif-editorial transition-colors ${
                                  isSpanHovered
                                    ? 'font-bold text-[var(--accent-primary)]'
                                    : 'font-medium text-[var(--text-ink)]/85'
                                }`}
                              >
                                {span.title}
                              </span>
                              {durLabel && (
                                <span className="shrink-0 text-[8.5px] font-mono-tabular text-[var(--text-muted)]">
                                  {durLabel}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {granularity === 'week' ? (
              /* ==============================================================
                 WEEK VIEW: 7 Spacious Daily Columns with Inline Books & Notes
                 ============================================================== */
              <div className="grid grid-cols-7 gap-1.5">
                {viewModel.buckets.map((bucket) => {
                  const isHovered = hoveredBucketId === bucket.id;
                  const isPinned = selectedBucketId === bucket.id;
                  const hasRead =
                    bucket.finishedBooks.length > 0 ||
                    bucket.highlightCount > 0 ||
                    bucket.progressMilestones.length > 0;
                  const hasWrite = bucket.wordsWritten > 0 || bucket.draftedFiles.length > 0;

                  return (
                    <div
                      key={bucket.id}
                      role="button"
                      tabIndex={0}
                      onMouseEnter={() => setHoveredBucketId(bucket.id)}
                      onMouseLeave={() => setHoveredBucketId(null)}
                      onClick={() =>
                        setSelectedBucketId((prev) => (prev === bucket.id ? null : bucket.id))
                      }
                      onDoubleClick={() => handleBucketDoubleClick(bucket)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedBucketId((prev) => (prev === bucket.id ? null : bucket.id));
                        }
                      }}
                      className={`group flex flex-col rounded-lg transition-all cursor-pointer p-1 ${
                        isPinned
                          ? 'bg-[var(--accent-gold)]/12 ring-2 ring-[var(--accent-primary)]'
                          : isHovered
                          ? 'bg-[var(--bg-surface)] ring-1 ring-[var(--border-ledger)]'
                          : bucket.isWeekend
                          ? 'bg-[var(--bg-surface)]/45'
                          : ''
                      }`}
                    >
                      {/* UPPER READ ZONE */}
                      <div className="h-36 flex flex-col justify-end gap-1 pb-1.5 px-0.5">
                        {bucket.finishedBooks.slice(0, 2).map((fb, idx) => (
                          <button
                            key={`${fb.bookId}-${idx}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBookRef(fb.bookId, fb.title);
                            }}
                            className="w-full text-left px-1.5 py-1 rounded bg-[var(--accent-primary)]/12 hover:bg-[var(--accent-primary)]/22 border border-[var(--accent-primary)]/35 text-[10px] leading-tight transition-colors cursor-pointer"
                            title={`Finished: ${fb.title} by ${fb.author}`}
                          >
                            <div className="font-serif-editorial font-bold text-[var(--accent-primary)] truncate">
                              {fb.title}
                            </div>
                            <div className="font-mono-tabular text-[9px] text-[var(--text-muted)] flex items-center justify-between">
                              <span>Finished</span>
                              {fb.myRating ? <span>{fb.myRating}★</span> : null}
                            </div>
                          </button>
                        ))}

                        {bucket.highlightedBooks.slice(0, 1).map((hb, idx) => (
                          <button
                            key={`${hb.title}-${idx}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBookRef(hb.bookId, hb.title);
                            }}
                            className="w-full text-left px-1.5 py-0.5 rounded bg-[var(--accent-gold)]/12 hover:bg-[var(--accent-gold)]/22 border border-[var(--accent-gold)]/35 text-[10px] leading-tight transition-colors cursor-pointer"
                            title={`${hb.count} Kindle highlights in ${hb.title}`}
                          >
                            <div className="font-serif-editorial font-semibold text-[var(--text-ink)] truncate">
                              {hb.title}
                            </div>
                            <div className="font-mono-tabular text-[9px] text-[var(--accent-gold)]">
                              {bucket.highlightCount} highlights
                            </div>
                          </button>
                        ))}

                        {hasRead && (
                          <div className="w-full flex justify-center pt-0.5">
                            <div
                              style={{
                                height: `${Math.max(6, Math.round(bucket.readNormalized * 34))}px`,
                              }}
                              className={`w-3 rounded-t-sm transition-all ${
                                bucket.finishedBooks.length > 0
                                  ? 'bg-[var(--accent-primary)]'
                                  : 'bg-[var(--accent-gold)]'
                              }`}
                            />
                          </div>
                        )}
                      </div>

                      {/* SPLIT CENTER BAR */}
                      <div className="flex flex-col">
                        <div
                          className={`h-2.5 rounded-t-sm border-x border-t border-[var(--border-ledger)]/70 transition-colors ${
                            bucket.finishedBooks.length > 0
                              ? 'bg-[var(--accent-primary)]'
                              : bucket.highlightCount > 0 || bucket.progressMilestones.length > 0
                              ? 'bg-[var(--accent-gold)]/75'
                              : 'bg-[var(--bg-surface)]'
                          }`}
                        />
                        <div className="relative flex items-center justify-center py-1 border-y border-[var(--border-ledger)] bg-[var(--bg-card)] text-[10px] font-mono-tabular font-semibold text-[var(--text-ink)]">
                          <span>{bucket.shortAxisLabel}</span>
                          {bucket.isDualMomentum && (
                            <span
                              className="ml-1 w-1.5 h-1.5 rotate-45 bg-[var(--accent-gold)] inline-block"
                              title="Dual Momentum Day"
                            />
                          )}
                        </div>
                        <div
                          className={`h-2.5 rounded-b-sm border-x border-b border-[var(--border-ledger)]/70 transition-colors ${
                            bucket.goalMetDays > 0
                              ? 'bg-emerald-600 dark:bg-emerald-500'
                              : hasWrite
                              ? 'bg-emerald-500/50'
                              : 'bg-[var(--bg-surface)]'
                          }`}
                        />
                      </div>

                      {/* LOWER WRITTEN ZONE */}
                      <div className="h-36 flex flex-col justify-start gap-1 pt-1.5 px-0.5">
                        {hasWrite && (
                          <div className="w-full flex justify-center pb-0.5">
                            <div
                              style={{
                                height: `${Math.max(6, Math.round(bucket.writeNormalized * 34))}px`,
                              }}
                              className={`w-3 rounded-b-sm transition-all ${
                                bucket.goalMetDays > 0
                                  ? 'bg-emerald-600 dark:bg-emerald-500'
                                  : 'bg-emerald-500/65'
                              }`}
                            />
                          </div>
                        )}

                        {bucket.wordsWritten > 0 && (
                          <div className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 font-mono-tabular text-[10px] flex items-center justify-between">
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              +{bucket.wordsWritten.toLocaleString()} w
                            </span>
                            {bucket.goalMetDays > 0 && (
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-300 font-bold">
                                ✓
                              </span>
                            )}
                          </div>
                        )}

                        {bucket.draftedFiles.slice(0, 2).map((df) => {
                          const cleanPath = df.filePath.replace(/\.md$/, '');
                          const obsidianUri = `obsidian://open?vault=obsidian2025&file=${encodeURIComponent(cleanPath)}`;
                          return (
                            <a
                              key={df.filePath}
                              href={obsidianUri}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-1.5 py-0.5 rounded bg-[#7C5CFF]/10 hover:bg-[#7C5CFF]/20 border border-[#7C5CFF]/30 text-[10px] font-mono-tabular text-[var(--text-ink)] flex items-center justify-between gap-1 transition-colors"
                              title={`Open ${df.fileName} in Obsidian (${df.words} words)`}
                            >
                              <span className="truncate">{df.fileName.replace(/\.md$/, '')}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-[#7C5CFF] shrink-0" />
                            </a>
                          );
                        })}

                        {bucket.draftedFiles.length > 2 && (
                          <span className="text-[9px] font-mono-tabular text-[var(--text-muted)] text-center">
                            +{bucket.draftedFiles.length - 2} more notes
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ==============================================================
                 YEAR (52–53 weeks) & MONTH (28–31 days) COMPACT DUAL-TRACK BAR
                 ============================================================== */
              <div className="space-y-0">
                {/* 1. UPPER READ TRACK (Above the Split Bar) */}
                <div className="flex items-end gap-[2px] h-28 sm:h-32 px-0.5">
                  {viewModel.buckets.map((bucket, bucketIdx) => {
                    const isHovered = hoveredBucketId === bucket.id;
                    const isPinned = selectedBucketId === bucket.id;
                    const inHoveredSpan =
                      hoveredSpan !== null &&
                      bucketIdx >= hoveredSpan.startIdx &&
                      bucketIdx <= hoveredSpan.endIdx;
                    const hasFinished = bucket.finishedBooks.length > 0;
                    const hasRead = bucket.readScore > 0;
                    const barHeightPct = hasRead ? Math.round(bucket.readNormalized * 82) : 0;

                    return (
                      <div
                        key={`read-${bucket.id}`}
                        onMouseEnter={() => setHoveredBucketId(bucket.id)}
                        onMouseLeave={() => setHoveredBucketId(null)}
                        onClick={() =>
                          setSelectedBucketId((prev) => (prev === bucket.id ? null : bucket.id))
                        }
                        onDoubleClick={() => handleBucketDoubleClick(bucket)}
                        className={`flex-1 h-full flex flex-col items-center justify-end cursor-pointer rounded-t-xs transition-colors ${
                          isPinned
                            ? 'bg-[var(--accent-gold)]/15'
                            : inHoveredSpan
                            ? 'bg-[var(--accent-primary)]/10'
                            : isHovered
                            ? 'bg-[var(--bg-surface)]'
                            : ''
                        }`}
                        title={`${bucket.label} · ${bucket.finishedBooks.length} finished, ${bucket.highlightCount} highlights`}
                      >
                        {hasFinished && (
                          <div
                            className="mb-1 flex flex-col items-center"
                            aria-label={`${bucket.finishedBooks.length} book finished`}
                          >
                            <span
                              className={`inline-flex items-center justify-center rounded-full border border-[var(--bg-card)] shadow-2xs ${
                                granularity === 'month'
                                  ? 'w-4 h-4 text-[9px] font-mono-tabular font-bold bg-[var(--accent-primary)] text-white'
                                  : 'w-2.5 h-2.5 bg-[var(--accent-primary)]'
                              }`}
                            >
                              {granularity === 'month' ? bucket.finishedBooks.length : ''}
                            </span>
                          </div>
                        )}

                        {hasRead && (
                          <div
                            style={{ height: `${Math.max(8, barHeightPct)}%` }}
                            className={`w-full max-w-[14px] rounded-t-xs transition-all duration-200 ${
                              hasFinished
                                ? 'bg-[var(--accent-primary)]'
                                : 'bg-[var(--accent-gold)]/85'
                            } ${isHovered || isPinned ? 'ring-1 ring-[var(--text-ink)]/40' : ''}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 2. SPLIT HORIZONTAL TIME-AXIS BAR (Read Channel | Spine Ticks | Written Channel) */}
                <div className="rounded-md border border-[var(--border-ledger)] bg-[var(--bg-surface)]/60 overflow-hidden shadow-2xs">
                  {/* Upper Channel of Bar: READ */}
                  <div className="flex gap-[2px] px-0.5 pt-0.5 bg-[var(--bg-surface)]">
                    {viewModel.buckets.map((bucket) => {
                      const hasFinished = bucket.finishedBooks.length > 0;
                      const hasHighlights =
                        bucket.highlightCount > 0 || bucket.progressMilestones.length > 0;
                      const isActive =
                        hoveredBucketId === bucket.id || selectedBucketId === bucket.id;

                      return (
                        <div
                          key={`bar-read-${bucket.id}`}
                          onMouseEnter={() => setHoveredBucketId(bucket.id)}
                          onMouseLeave={() => setHoveredBucketId(null)}
                          onClick={() =>
                            setSelectedBucketId((prev) => (prev === bucket.id ? null : bucket.id))
                          }
                          onDoubleClick={() => handleBucketDoubleClick(bucket)}
                          className={`flex-1 h-2.5 rounded-t-[2px] cursor-pointer transition-all ${
                            hasFinished
                              ? 'bg-[var(--accent-primary)]'
                              : hasHighlights
                              ? 'bg-[var(--accent-gold)]/75'
                              : 'bg-[var(--bg-card)]/70'
                          } ${isActive ? 'brightness-110 ring-1 ring-[var(--text-ink)]/40' : ''}`}
                        />
                      );
                    })}
                  </div>

                  {/* Center Spine Divider with Chronological Ticks */}
                  <div className="flex gap-[2px] px-0.5 py-0.5 border-y border-[var(--border-ledger)] bg-[var(--bg-card)]">
                    {viewModel.buckets.map((bucket) => {
                      const isActive =
                        hoveredBucketId === bucket.id || selectedBucketId === bucket.id;
                      const hasMonthTick = granularity === 'year' && Boolean(bucket.tickLabel);

                      return (
                        <div
                          key={`spine-${bucket.id}`}
                          onMouseEnter={() => setHoveredBucketId(bucket.id)}
                          onMouseLeave={() => setHoveredBucketId(null)}
                          onClick={() =>
                            setSelectedBucketId((prev) => (prev === bucket.id ? null : bucket.id))
                          }
                          onDoubleClick={() => handleBucketDoubleClick(bucket)}
                          className={`relative flex-1 h-5 flex items-center justify-center cursor-pointer font-mono-tabular text-[9px] sm:text-[10px] ${
                            hasMonthTick ? 'border-l border-[var(--border-ledger)]' : ''
                          } ${
                            isActive
                              ? 'text-[var(--accent-primary)] font-bold'
                              : bucket.isCurrentPeriod
                              ? 'text-[var(--accent-gold)] font-bold'
                              : 'text-[var(--text-muted)]'
                          }`}
                        >
                          {granularity === 'year' ? (
                            bucket.tickLabel ? (
                              <span className="absolute left-1 top-1/2 -translate-y-1/2 whitespace-nowrap font-semibold text-[var(--text-ink)] pointer-events-none z-10">
                                {bucket.tickLabel}
                              </span>
                            ) : null
                          ) : (
                            <span
                              className={
                                bucket.activeDays.length > 0
                                  ? 'font-semibold text-[var(--text-ink)]'
                                  : ''
                              }
                            >
                              {bucket.shortAxisLabel}
                            </span>
                          )}

                          {bucket.isDualMomentum && (
                            <span
                              className="absolute -top-[3px] right-0.5 w-1.5 h-1.5 rotate-45 bg-[var(--accent-gold)] ring-1 ring-[var(--bg-card)]"
                              title="Dual Momentum (Read & Written)"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Lower Channel of Bar: WRITTEN */}
                  <div className="flex gap-[2px] px-0.5 pb-0.5 bg-[var(--bg-surface)]">
                    {viewModel.buckets.map((bucket) => {
                      const hasGoal = bucket.goalMetDays > 0;
                      const hasWrite =
                        bucket.wordsWritten > 0 || bucket.draftedFiles.length > 0;
                      const isActive =
                        hoveredBucketId === bucket.id || selectedBucketId === bucket.id;

                      return (
                        <div
                          key={`bar-write-${bucket.id}`}
                          onMouseEnter={() => setHoveredBucketId(bucket.id)}
                          onMouseLeave={() => setHoveredBucketId(null)}
                          onClick={() =>
                            setSelectedBucketId((prev) => (prev === bucket.id ? null : bucket.id))
                          }
                          onDoubleClick={() => handleBucketDoubleClick(bucket)}
                          className={`flex-1 h-2.5 rounded-b-[2px] cursor-pointer transition-all ${
                            hasGoal
                              ? 'bg-emerald-600 dark:bg-emerald-500'
                              : hasWrite
                              ? 'bg-emerald-500/50'
                              : 'bg-[var(--bg-card)]/70'
                          } ${isActive ? 'brightness-110 ring-1 ring-[var(--text-ink)]/40' : ''}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* 3. LOWER WRITTEN TRACK (Below the Split Bar) */}
                <div className="flex items-start gap-[2px] h-28 sm:h-32 px-0.5">
                  {viewModel.buckets.map((bucket) => {
                    const isHovered = hoveredBucketId === bucket.id;
                    const isPinned = selectedBucketId === bucket.id;
                    const hasWrite = bucket.wordsWritten > 0;
                    const hasFiles = bucket.draftedFiles.length > 0;
                    const barHeightPct = hasWrite ? Math.round(bucket.writeNormalized * 82) : 0;

                    return (
                      <div
                        key={`write-${bucket.id}`}
                        onMouseEnter={() => setHoveredBucketId(bucket.id)}
                        onMouseLeave={() => setHoveredBucketId(null)}
                        onClick={() =>
                          setSelectedBucketId((prev) => (prev === bucket.id ? null : bucket.id))
                        }
                        onDoubleClick={() => handleBucketDoubleClick(bucket)}
                        className={`flex-1 h-full flex flex-col items-center justify-start cursor-pointer rounded-b-xs transition-colors ${
                          isPinned
                            ? 'bg-[var(--accent-gold)]/15'
                            : isHovered
                            ? 'bg-[var(--bg-surface)]'
                            : ''
                        }`}
                        title={`${bucket.label} · ${bucket.wordsWritten.toLocaleString()} words across ${bucket.draftedFiles.length} notes`}
                      >
                        {hasWrite && (
                          <div
                            style={{ height: `${Math.max(8, barHeightPct)}%` }}
                            className={`w-full max-w-[14px] rounded-b-xs transition-all duration-200 ${
                              bucket.goalMetDays > 0
                                ? 'bg-emerald-600 dark:bg-emerald-500'
                                : 'bg-emerald-500/60'
                            } ${isHovered || isPinned ? 'ring-1 ring-[var(--text-ink)]/40' : ''}`}
                          />
                        )}

                        {hasFiles && (
                          <span
                            className="mt-1 w-2 h-2 rounded-full bg-[#7C5CFF] border border-[var(--bg-card)]"
                            title={`${bucket.draftedFiles.length} Obsidian notes`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Axis Footer Label */}
            <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] mt-1.5 px-0.5">
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                <Feather className="w-3 h-3" />
                <span>Written Below Axis (Scriptor)</span>
              </span>
              <span>Click any column to inspect · Double-click or zoom to drill down</span>
            </div>
          </div>
        </div>

        {/* Live Hover Scrubbing Readout (Zero Layout Shift) */}
        <div className="min-h-[44px] px-3.5 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono-tabular">
          {activeBucket ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[var(--text-ink)]">{activeBucket.label}</span>
                {activeBucket.isDualMomentum && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--accent-gold)]/20 text-[var(--accent-gold)] text-[10px] font-bold">
                    Dual Momentum
                  </span>
                )}
                {activeBucket.finishedBooks.length > 0 && (
                  <span className="text-[var(--accent-primary)] font-semibold">
                    Finished: {activeBucket.finishedBooks.map((b) => b.title).join(', ')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="text-[var(--accent-gold)] font-semibold">
                  {activeBucket.highlightCount} highlights
                </span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {activeBucket.wordsWritten.toLocaleString()} words
                </span>
                {activeBucket.draftedFiles.length > 0 && (
                  <span className="text-[#7C5CFF] font-semibold">
                    {activeBucket.draftedFiles.length} notes
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full text-[var(--text-muted)] text-[11px]">
              <span>Hover any segment along the bar for a live readout, or click to pin books &amp; notes.</span>
              {!index.hasWritingTelemetry && (
                <span className="italic">No Scriptor writing logs loaded yet</span>
              )}
            </div>
          )}
        </div>

        {/* Pinned Bucket Inspection Ledger */}
        {pinnedBucket && (
          <div className="p-4 sm:p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-primary)]/40 shadow-xs space-y-4 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-ledger)]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--accent-primary)]" />
                  <h3 className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)]">
                    {pinnedBucket.label}
                  </h3>
                  {pinnedBucket.isDualMomentum && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/30 text-[10px] font-mono-tabular font-bold text-[var(--accent-gold)]">
                      <Flame className="w-3 h-3" />
                      <span>Dual Momentum</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  {pinnedBucket.startDate === pinnedBucket.endDate
                    ? formatFullDate(pinnedBucket.startDate)
                    : `${pinnedBucket.startDate} → ${pinnedBucket.endDate}`}
                </p>
              </div>

              {/* Drill-down / Drawer Actions */}
              <div className="flex flex-wrap items-center gap-2 font-mono-tabular text-xs">
                {granularity === 'year' && (
                  <>
                    <button
                      type="button"
                      onClick={() => changePeriod(pinnedBucket.startDate, 'month')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] text-[var(--text-ink)] cursor-pointer transition-colors"
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>Month View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => changePeriod(pinnedBucket.startDate, 'week')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] text-[var(--text-ink)] cursor-pointer transition-colors"
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>Week View</span>
                    </button>
                  </>
                )}

                {granularity === 'month' && (
                  <button
                    type="button"
                    onClick={() => changePeriod(pinnedBucket.startDate, 'week')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] text-[var(--text-ink)] cursor-pointer transition-colors"
                  >
                    <ZoomIn className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>Week View</span>
                  </button>
                )}

                {granularity !== 'year' && (
                  <button
                    type="button"
                    onClick={() => {
                      const dayRec =
                        pinnedBucket.activeDays[0] ||
                        index.days[pinnedBucket.startDate] || {
                          date: pinnedBucket.startDate,
                          finishedBooks: [],
                          startedBooks: [],
                          progressMilestones: [],
                          highlightCount: 0,
                          highlightedBooks: [],
                          readScore: 0,
                          wordsWritten: 0,
                          goalMet: false,
                          draftedFiles: [],
                          isDualMomentum: false,
                        };
                      setDrawerDay(dayRec);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--accent-primary)] text-white font-semibold hover:opacity-90 cursor-pointer transition-opacity"
                  >
                    <PanelRightOpen className="w-3.5 h-3.5" />
                    <span>Open Day Drawer</span>
                  </button>
                )}
              </div>
            </div>

            {/* Two-Column Detail Split: Read Above vs Written Below */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: Read Track Details */}
              <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]/70">
                  <span className="flex items-center gap-1.5 text-xs font-mono-tabular font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Read Track (Above)</span>
                  </span>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    {pinnedBucket.finishedBooks.length} finished · {pinnedBucket.highlightCount}{' '}
                    highlights
                  </span>
                </div>

                {pinnedBucket.finishedBooks.length === 0 &&
                pinnedBucket.highlightedBooks.length === 0 &&
                pinnedBucket.progressMilestones.length === 0 ? (
                  <p className="text-xs italic font-serif-editorial text-[var(--text-muted)]">
                    No reading completions or Kindle highlights logged in this span.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pinnedBucket.finishedBooks.map((fb, idx) => (
                      <div
                        key={`${fb.bookId}-${fb.date}-${idx}`}
                        onClick={() => openBookRef(fb.bookId, fb.title)}
                        className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--accent-primary)]/30 hover:border-[var(--accent-primary)] transition-colors cursor-pointer flex items-center justify-between gap-2 group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                            <span className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] truncate">
                              {fb.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] font-mono-tabular pl-5">
                            {fb.author} · Finished {fb.date}
                            {fb.pageCount ? ` · ${fb.pageCount} pp` : ''}
                          </p>
                        </div>
                        {fb.myRating ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] font-mono-tabular text-[11px] font-bold shrink-0">
                            <Star className="w-3 h-3 fill-[var(--accent-gold)]" />
                            <span>{fb.myRating}</span>
                          </span>
                        ) : null}
                      </div>
                    ))}

                    {pinnedBucket.highlightedBooks.map((hb, idx) => (
                      <div
                        key={`${hb.title}-${idx}`}
                        onClick={() => openBookRef(hb.bookId, hb.title)}
                        className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)] transition-colors cursor-pointer flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-serif-editorial font-semibold text-[var(--text-ink)] truncate block">
                            {hb.title}
                          </span>
                          <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                            {hb.author}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] font-mono-tabular text-[11px] font-bold shrink-0">
                          {hb.count} {hb.count === 1 ? 'highlight' : 'highlights'}
                        </span>
                      </div>
                    ))}

                    {pinnedBucket.progressMilestones.map((pm, idx) => (
                      <div
                        key={`${pm.bookId}-${pm.date}-${idx}`}
                        onClick={() => openBookRef(pm.bookId, pm.title)}
                        className="px-2.5 py-1.5 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[11px] font-mono-tabular flex items-center justify-between cursor-pointer hover:border-[var(--accent-gold)]"
                      >
                        <span className="truncate font-serif-editorial font-semibold text-[var(--text-ink)]">
                          {pm.title}
                        </span>
                        <span className="text-[var(--text-muted)] shrink-0">
                          p. {pm.page} ({pm.date})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Written Track Details */}
              <div className="p-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]/70">
                  <span className="flex items-center gap-1.5 text-xs font-mono-tabular font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    <Feather className="w-3.5 h-3.5" />
                    <span>Written Track (Below)</span>
                  </span>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    {pinnedBucket.wordsWritten.toLocaleString()} words ·{' '}
                    {pinnedBucket.draftedFiles.length} notes
                  </span>
                </div>

                {pinnedBucket.wordsWritten === 0 && pinnedBucket.draftedFiles.length === 0 ? (
                  <p className="text-xs italic font-serif-editorial text-[var(--text-muted)]">
                    No Scriptor writing sessions logged in this span.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
                      <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold">
                        +{pinnedBucket.wordsWritten.toLocaleString()} words
                      </span>
                      {pinnedBucket.goalMetDays > 0 && (
                        <span className="px-2 py-1 rounded bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/30 text-[var(--accent-gold)] font-semibold">
                          Goal met on {pinnedBucket.goalMetDays}{' '}
                          {pinnedBucket.goalMetDays === 1 ? 'day' : 'days'}
                        </span>
                      )}
                    </div>

                    {pinnedBucket.draftedFiles.slice(0, 6).map((df) => {
                      const cleanPath = df.filePath.replace(/\.md$/, '');
                      const obsidianUri = `obsidian://open?vault=obsidian2025&file=${encodeURIComponent(cleanPath)}`;

                      return (
                        <div
                          key={df.filePath}
                          className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[#7C5CFF]/50 transition-colors flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-[#7C5CFF] shrink-0" />
                              <span className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] truncate">
                                {df.fileName}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono-tabular text-[var(--text-muted)] pl-5 truncate">
                              {df.folder}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 font-mono-tabular">
                            {df.words > 0 && (
                              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                +{df.words.toLocaleString()} w
                              </span>
                            )}
                            <a
                              href={obsidianUri}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#7C5CFF]/10 text-[#7C5CFF] border border-[#7C5CFF]/30 hover:bg-[#7C5CFF]/20 transition-colors"
                              title={`Open ${df.fileName} in Obsidian`}
                            >
                              <span>Obsidian</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}

                    {pinnedBucket.draftedFiles.length > 6 && (
                      <p className="text-[11px] font-mono-tabular text-[var(--text-muted)] italic">
                        +{pinnedBucket.draftedFiles.length - 6} additional notes — zoom to Month or
                        Week to inspect every day.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Active Days quick-inspect pills inside Year week-buckets */}
            {granularity === 'year' && pinnedBucket.activeDays.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-ledger)]/70 flex flex-wrap items-center gap-1.5 font-mono-tabular text-[11px]">
                <span className="text-[var(--text-muted)] mr-1">Inspect day:</span>
                {pinnedBucket.activeDays.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setDrawerDay(d)}
                    className="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] text-[var(--text-ink)] cursor-pointer transition-colors"
                  >
                    {d.date.slice(5)}
                    {d.finishedBooks.length > 0 ? ' · ★' : ''}
                    {d.wordsWritten > 0 ? ` · ${d.wordsWritten}w` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Day Session Inspector Drawer */}
      <DaySessionDrawer
        isOpen={!!drawerDay}
        onClose={() => setDrawerDay(null)}
        day={drawerDayActivity}
        clippings={drawerClippings}
        draftedFiles={drawerDraftedFiles}
        books={books}
        onSelectBook={onSelectBook}
        onSelectBookById={onSelectBookById}
      />
    </section>
  );
};

export default DualTrackTimeline;
