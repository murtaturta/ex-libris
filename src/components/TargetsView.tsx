import React, { useMemo, useState } from 'react';
import type { Book, LibraryBundle, UserLocalState } from '../types/library';
import { computeYearlyTargetAnalytics } from '../lib/analytics/yearlyTargets';
import {
  Target,
  BookOpen,
  Clock,
  TrendingUp,
  Layers,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

export interface TargetsViewProps {
  bundle: LibraryBundle;
  userState: UserLocalState;
  onSelectBook: (book: Book) => void;
  onUpdateGoals?: (updates: { yearlyPageGoal?: number; yearlyTitleGoal?: number }) => void;
}

export const TargetsView: React.FC<TargetsViewProps> = ({
  bundle,
  userState,
  onSelectBook,
  onUpdateGoals,
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [dailyMinutes, setDailyMinutes] = useState<number>(60);
  const [shelfFilter, setShelfFilter] = useState<'all' | 'currently-reading' | 'to-read'>('all');

  const analytics = useMemo(
    () =>
      computeYearlyTargetAnalytics(
        bundle,
        userState,
        new Date(),
        selectedYear,
        dailyMinutes / 60
      ),
    [bundle, userState, selectedYear, dailyMinutes]
  );

  const [titleGoalDraft, setTitleGoalDraft] = useState<string>(() =>
    String(analytics.titlesGoal)
  );
  const [pageGoalDraft, setPageGoalDraft] = useState<string>(() =>
    String(analytics.pagesGoal)
  );

  const handleCommitGoals = () => {
    const tVal = parseInt(titleGoalDraft, 10);
    const pVal = parseInt(pageGoalDraft, 10);
    const updates: { yearlyTitleGoal?: number; yearlyPageGoal?: number } = {};
    if (!Number.isNaN(tVal) && tVal > 0) updates.yearlyTitleGoal = tVal;
    if (!Number.isNaN(pVal) && pVal > 0) updates.yearlyPageGoal = pVal;
    if (Object.keys(updates).length > 0) {
      onUpdateGoals?.(updates);
    }
  };

  const dailyHours = dailyMinutes / 60;
  const tbrHours = analytics.tbrSummary.totalEstimatedHours;
  const tbrDaysAtSlider = dailyHours > 0 ? Math.round(tbrHours / dailyHours) : 0;
  const tbrYearsAtSlider =
    dailyHours > 0 ? Math.round((tbrHours / (dailyHours * 365)) * 10) / 10 : 0;

  const yearEndHoursBudget = Math.round(analytics.daysRemainingInYear * dailyHours * 10) / 10;

  // Greedy count of shortest books that fit cumulatively inside yearEndHoursBudget
  const { cumulativeFitIds, maxBooksFitInBudget } = useMemo(() => {
    let rem = yearEndHoursBudget;
    const ids = new Set<string>();
    for (const c of analytics.finishableCandidates) {
      if (c.estimatedHours <= rem) {
        ids.add(c.book.id);
        rem -= c.estimatedHours;
      }
    }
    return { cumulativeFitIds: ids, maxBooksFitInBudget: ids.size };
  }, [analytics.finishableCandidates, yearEndHoursBudget]);

  const visibleCandidates = useMemo(() => {
    return analytics.finishableCandidates
      .filter((c) => (shelfFilter === 'all' ? true : c.shelf === shelfFilter))
      .slice(0, 24);
  }, [analytics.finishableCandidates, shelfFilter]);

  const availableYears = useMemo(() => {
    const yrs = analytics.yearOverYear.map((y) => y.year);
    return yrs.length > 0 ? yrs : [currentYear];
  }, [analytics.yearOverYear, currentYear]);

  return (
    <div className="space-y-8 pb-16 animate-fadeIn">
      {/* 1. Room Header & Editable Goal Controls */}
      <section className="p-6 sm:p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]">
                ROOM 06
              </span>
              <span className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)]">
                Annual Targets &amp; TBR Horizon
              </span>
            </div>

            <h1 className="font-serif-editorial text-2xl sm:text-4xl font-bold tracking-tight text-[var(--text-ink)]">
              Yearly Targets
            </h1>

            <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-2xl font-serif-editorial italic leading-relaxed">
              Multi-metric annual pacing across titles, pages, and hours — calibrated to your{' '}
              <strong className="not-italic text-[var(--text-ink)] font-mono-tabular">
                {analytics.effectiveWpm} WPM
              </strong>{' '}
              {analytics.isKindleWpmCalibrated ? 'Kindle timer median' : 'baseline speed'}.
            </p>
          </div>

          {/* Year Selector & Inline Target Inputs */}
          <div className="flex flex-wrap items-end gap-3 font-mono-tabular text-xs">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[var(--text-ink)] font-semibold cursor-pointer"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {selectedYear === currentYear && (
              <>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Title Goal
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={titleGoalDraft}
                    onChange={(e) => setTitleGoalDraft(e.target.value)}
                    onBlur={handleCommitGoals}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommitGoals()}
                    className="w-20 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[var(--text-ink)] text-center"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                    Page Goal
                  </label>
                  <input
                    type="number"
                    min={100}
                    step={500}
                    max={200000}
                    value={pageGoalDraft}
                    onChange={(e) => setPageGoalDraft(e.target.value)}
                    onBlur={handleCommitGoals}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommitGoals()}
                    className="w-24 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[var(--text-ink)] text-center"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* 2. Multi-Metric Annual Cards (Titles, Pages, Hours) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-[var(--border-ledger)]">
          {/* Titles Card */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-ledger)] space-y-3">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <span className="uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Titles ({analytics.targetYear})</span>
              </span>
              <span className="font-bold text-[var(--accent-primary)]">{analytics.titlesPct}%</span>
            </div>

            <div className="flex items-baseline gap-1.5 font-mono-tabular">
              <span className="text-3xl font-bold text-[var(--text-ink)]">
                {analytics.titlesCompleted}
              </span>
              <span className="text-sm text-[var(--text-muted)]">/ {analytics.titlesGoal} books</span>
            </div>

            <div className="relative w-full h-2 rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-ledger)]">
              <div
                className="h-full bg-[var(--accent-primary)] transition-all"
                style={{ width: `${Math.min(100, analytics.titlesPct)}%` }}
              />
              {selectedYear === currentYear && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[var(--text-ink)]/60"
                  style={{ left: `${analytics.idealPacePct}%` }}
                  title={`Ideal pace: ${analytics.idealPacePct}%`}
                />
              )}
            </div>

            <div className="text-[11px] font-mono-tabular text-[var(--text-muted)] flex justify-between">
              <span>
                {selectedYear === currentYear
                  ? `Proj: ~${analytics.projectedYearEndTitles} books`
                  : `${analytics.titlesCompleted} finished`}
              </span>
              {selectedYear === currentYear && analytics.daysRemainingInYear > 0 && (
                <span>{analytics.neededBooksPerWeek} / wk needed</span>
              )}
            </div>
          </div>

          {/* Pages Card */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-ledger)] space-y-3">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <span className="uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                <span>Pages ({analytics.targetYear})</span>
              </span>
              <span className="font-bold text-[var(--accent-gold)]">{analytics.pagesPct}%</span>
            </div>

            <div className="flex items-baseline gap-1.5 font-mono-tabular">
              <span className="text-3xl font-bold text-[var(--text-ink)]">
                {analytics.pagesCompleted.toLocaleString()}
              </span>
              <span className="text-sm text-[var(--text-muted)]">
                / {analytics.pagesGoal.toLocaleString()} pp
              </span>
            </div>

            <div className="relative w-full h-2 rounded-full bg-[var(--bg-card)] overflow-hidden border border-[var(--border-ledger)]">
              <div
                className="h-full bg-[var(--accent-gold)] transition-all"
                style={{ width: `${Math.min(100, analytics.pagesPct)}%` }}
              />
              {selectedYear === currentYear && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[var(--text-ink)]/60"
                  style={{ left: `${analytics.idealPacePct}%` }}
                  title={`Ideal pace: ${analytics.idealPacePct}%`}
                />
              )}
            </div>

            <div className="text-[11px] font-mono-tabular text-[var(--text-muted)] flex justify-between">
              <span>
                {selectedYear === currentYear
                  ? `Proj: ~${analytics.projectedYearEndPages.toLocaleString()} pp`
                  : `${analytics.pagesCompleted.toLocaleString()} pages`}
              </span>
              {selectedYear === currentYear && analytics.daysRemainingInYear > 0 && (
                <span>{analytics.neededPagesPerDay} pp/day needed</span>
              )}
            </div>
          </div>

          {/* Hours Read Card */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-ledger)] space-y-3">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <span className="uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Reading Time ({analytics.targetYear})</span>
              </span>
              <span className="text-[var(--text-muted)]">{analytics.effectiveWpm} WPM</span>
            </div>

            <div className="flex items-baseline gap-1.5 font-mono-tabular">
              <span className="text-3xl font-bold text-[var(--text-ink)]">
                {analytics.estimatedHoursRead}h
              </span>
              <span className="text-sm text-[var(--text-muted)]">est. read</span>
            </div>

            <div className="text-[11px] font-mono-tabular text-[var(--text-muted)] pt-2 border-t border-[var(--border-ledger)]/60 space-y-1">
              <div className="flex justify-between">
                <span>Calendar progress:</span>
                <strong className="text-[var(--text-ink)]">
                  Day {analytics.daysElapsedInYear} / {analytics.daysInYear}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Days left in {analytics.targetYear}:</span>
                <strong className="text-[var(--text-ink)]">
                  {analytics.daysRemainingInYear}d
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Entire TBR Reading Time Calculator */}
      <section className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <div>
              <h2 className="font-serif-editorial text-xl font-bold text-[var(--text-ink)]">
                How Long to Read the Entire TBR?
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                {analytics.tbrSummary.toReadCount} to-read books +{' '}
                {analytics.tbrSummary.currentlyReadingCount} in-progress ={' '}
                <strong>{analytics.tbrSummary.totalBacklogPages.toLocaleString()}</strong> remaining pages
                {analytics.tbrSummary.missingPageCountBooks > 0
                  ? ` (${analytics.tbrSummary.missingPageCountBooks} est. @ 300 pp)`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono-tabular text-xs bg-[var(--bg-surface)] px-3 py-2 rounded-lg border border-[var(--border-ledger)]">
            <label className="text-[var(--text-muted)] whitespace-nowrap">
              Daily Pace: <strong className="text-[var(--text-ink)]">{dailyMinutes} min/day</strong>
            </label>
            <input
              type="range"
              min={15}
              max={180}
              step={15}
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
              className="w-28 accent-[var(--accent-primary)] cursor-pointer"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 font-mono-tabular">
          <div className="p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Total TBR Reading Time
            </div>
            <div className="text-2xl font-bold text-[var(--accent-primary)] mt-1">
              {tbrHours.toLocaleString()} hrs
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              @ {analytics.effectiveWpm} WPM (~275 words/p)
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              At {dailyMinutes} min / day
            </div>
            <div className="text-2xl font-bold text-[var(--text-ink)] mt-1">
              {tbrYearsAtSlider} yrs
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {tbrDaysAtSlider.toLocaleString()} reading days
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              At 30m / 1h per day
            </div>
            <div className="text-2xl font-bold text-[var(--text-ink)] mt-1">
              {analytics.tbrSummary.yearsAt30MinDay} / {analytics.tbrSummary.yearsAt60MinDay} yrs
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Zero new books added
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              At {analytics.targetYear} Page Pace
            </div>
            <div className="text-2xl font-bold text-[var(--accent-gold)] mt-1">
              {analytics.tbrSummary.yearsAtCurrentPace !== null
                ? `${analytics.tbrSummary.yearsAtCurrentPace} yrs`
                : '—'}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Based on {analytics.pagesCompleted.toLocaleString()} pp YTD
            </div>
          </div>
        </div>

        {/* Breakdown by Book Length */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {analytics.tbrSummary.buckets.map((bk) => (
            <div
              key={bk.key}
              className="p-3 rounded-lg bg-[var(--bg-surface)]/70 border border-[var(--border-ledger)] text-xs font-mono-tabular flex flex-col gap-1"
            >
              <span className="text-[var(--text-muted)]">{bk.label}</span>
              <div className="flex items-baseline justify-between">
                <strong className="text-sm text-[var(--text-ink)]">{bk.count} books</strong>
                <span className="text-[var(--accent-primary)] font-semibold">{bk.hours}h</span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                {bk.pages.toLocaleString()} pages
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Year-over-Year Target Ledger & Monthly Pace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
                Year-over-Year Goals
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              Titles &amp; Pages
            </span>
          </div>

          <div className="space-y-3">
            {analytics.yearOverYear.map((row) => {
              const barPct =
                row.titlesGoal && row.titlesGoal > 0
                  ? Math.min(100, Math.round((row.titlesCompleted / row.titlesGoal) * 100))
                  : Math.min(100, row.titlesCompleted * 4);
              const isSelected = row.year === analytics.targetYear;
              return (
                <div
                  key={row.year}
                  onClick={() => setSelectedYear(row.year)}
                  className={`p-3 rounded-lg border transition-colors cursor-pointer space-y-1.5 ${
                    isSelected
                      ? 'bg-[var(--accent-primary)]/8 border-[var(--accent-primary)]/40'
                      : 'bg-[var(--bg-surface)] border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono-tabular">
                    <span className="font-bold text-[var(--text-ink)]">{row.year}</span>
                    <span className="text-[var(--text-muted)]">
                      <strong className="text-[var(--text-ink)]">{row.titlesCompleted}</strong>
                      {row.titlesGoal ? ` / ${row.titlesGoal} books` : ' books'} ·{' '}
                      {row.pagesCompleted.toLocaleString()} pp
                      {row.pctOfGoal !== null ? ` (${row.pctOfGoal}%)` : ''}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[var(--bg-card)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        row.pctOfGoal !== null && row.pctOfGoal >= 100
                          ? 'bg-emerald-500'
                          : 'bg-[var(--accent-primary)]'
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Finishable Before Dec 31 Budget */}
        <section className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent-gold)]" />
              <div>
                <h2 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
                  Finishable Before Dec 31
                </h2>
                <p className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  {yearEndHoursBudget}h budget ({analytics.daysRemainingInYear}d × {dailyMinutes}m) ·
                  Fits up to <strong>{maxBooksFitInBudget}</strong> shortest books
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] font-mono-tabular text-[11px] self-start">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'currently-reading', label: 'Reading' },
                  { id: 'to-read', label: 'TBR' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setShelfFilter(tab.id)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    shelfFilter === tab.id
                      ? 'bg-[var(--accent-primary)] text-white font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {visibleCandidates.map((c) => {
              const fitsPack = cumulativeFitIds.has(c.book.id);
              return (
                <button
                  key={c.book.id}
                  type="button"
                  onClick={() => onSelectBook(c.book)}
                  className="w-full p-3 rounded-lg bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/50 border border-[var(--border-ledger)] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] truncate">
                        {c.book.cleanTitle || c.book.title}
                      </span>
                      {c.shelf === 'currently-reading' && (
                        <span className="text-[9px] font-mono-tabular uppercase px-1.5 py-0.5 rounded bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30 shrink-0">
                          Reading
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] font-mono-tabular truncate">
                      {c.book.author} · {c.remainingPages} pp left
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 font-mono-tabular text-xs">
                    <span className="font-semibold text-[var(--text-ink)]">
                      ~{c.estimatedHours}h
                    </span>
                    {fitsPack && (
                      <span title="Fits in remaining year-end budget">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default TargetsView;
