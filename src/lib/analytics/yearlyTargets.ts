import type { Book, LibraryBundle, ReadingGoal, UserLocalState } from '../../types/library';

const WORDS_PER_PAGE = 275;
const FALLBACK_PAGE_COUNT = 300;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface YearlyGoalRow {
  year: number;
  titlesGoal: number | null;
  titlesCompleted: number;
  pagesCompleted: number;
  pctOfGoal: number | null;
}

export interface MonthlyTargetPoint {
  month: number; // 1..12
  label: string;
  booksFinished: number;
  cumulativeBooks: number;
  pagesRead: number;
  cumulativePages: number;
  idealCumulativeBooks: number;
  idealCumulativePages: number;
}

export interface TbrLengthBucket {
  key: 'short' | 'medium' | 'long' | 'tomes';
  label: string;
  count: number;
  pages: number;
  hours: number;
}

export interface TbrTimeSummary {
  toReadCount: number;
  currentlyReadingCount: number;
  toReadPages: number;
  currentlyReadingRemainingPages: number;
  totalBacklogPages: number;
  missingPageCountBooks: number;
  effectiveWpm: number;
  totalEstimatedHours: number;
  daysAt60Min: number;
  yearsAt30MinDay: number;
  yearsAt60MinDay: number;
  yearsAtCurrentPace: number | null;
  buckets: TbrLengthBucket[];
}

export interface FinishableCandidate {
  book: Book;
  shelf: 'currently-reading' | 'to-read';
  remainingPages: number;
  totalPages: number;
  estimatedHours: number;
  fitsBudget: boolean;
}

export interface YearlyTargetAnalytics {
  targetYear: number;
  effectiveWpm: number;
  isKindleWpmCalibrated: boolean;
  titlesCompleted: number;
  dnfCount: number;
  titlesGoal: number;
  titlesPct: number;
  pagesCompleted: number;
  pagesGoal: number;
  pagesPct: number;
  estimatedHoursRead: number;
  daysElapsedInYear: number;
  daysInYear: number;
  daysRemainingInYear: number;
  idealPacePct: number;
  paceDeltaBooks: number;
  projectedYearEndTitles: number;
  projectedYearEndPages: number;
  neededPagesPerDay: number;
  neededBooksPerWeek: number;
  monthlyCumulative: MonthlyTargetPoint[];
  yearOverYear: YearlyGoalRow[];
  tbrSummary: TbrTimeSummary;
  finishableCandidates: FinishableCandidate[];
}

function getEffectiveShelf(book: Book): string {
  return book.exclusiveShelf;
}

function getReadYearAndMonth(book: Book): { year: number; month: number } | null {
  const raw =
    book.dateRead ||
    book.readingSessions?.find((s) => s.state === 'COMPLETED' && s.endedAt)?.endedAt ||
    null;
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

function parseGoalYear(goal: ReadingGoal): number | null {
  const m = String(goal.goalId || '').match(/(\d{4})$/);
  return m ? Number(m[1]) : null;
}

export function estimateHoursForPages(pages: number, wpm: number): number {
  if (pages <= 0 || wpm <= 0) return 0;
  return Math.round(((pages * WORDS_PER_PAGE) / wpm / 60) * 10) / 10;
}

export function computeYearlyTargetAnalytics(
  bundle: LibraryBundle,
  userState?: UserLocalState,
  referenceDate: Date = new Date(),
  selectedYear?: number,
  dailyHoursBudget: number = 1.0
): YearlyTargetAnalytics {
  const books = bundle.books || [];
  const currentYear = referenceDate.getFullYear();
  const targetYear = selectedYear ?? currentYear;

  const effectiveWpm = userState?.kindleTelemetry?.medianWpm || 224;
  const isKindleWpmCalibrated = Boolean(userState?.kindleTelemetry?.medianWpm);

  // Build year-over-year map from readingGoals + completed books
  const goalByYear = new Map<number, number>();
  for (const g of bundle.readingGoals || []) {
    const yr = parseGoalYear(g);
    if (yr && g.goalValue > 0) goalByYear.set(yr, g.goalValue);
  }

  const readByYear = new Map<number, { titles: number; pages: number }>();
  const monthlyBooks = Array(12).fill(0) as number[];
  const monthlyPages = Array(12).fill(0) as number[];
  let dnfCount = 0;

  for (const book of books) {
    const shelf = getEffectiveShelf(book);
    if (shelf === 'did-not-finish') {
      const ym = getReadYearAndMonth(book);
      if (ym && ym.year === targetYear) {
        dnfCount += 1;
      }
      continue;
    }
    if (shelf !== 'read') continue;
    const ym = getReadYearAndMonth(book);
    if (!ym) continue;
    const pages = book.pageCount || 0;

    const entry = readByYear.get(ym.year) || { titles: 0, pages: 0 };
    entry.titles += 1;
    entry.pages += pages;
    readByYear.set(ym.year, entry);

    if (ym.year === targetYear) {
      monthlyBooks[ym.month - 1] += 1;
      monthlyPages[ym.month - 1] += pages;
    }
  }

  const allYears = Array.from(new Set([...goalByYear.keys(), ...readByYear.keys(), targetYear])).sort(
    (a, b) => b - a
  );

  const titlesGoal =
    targetYear === currentYear && typeof userState?.yearlyTitleGoal === 'number' && userState.yearlyTitleGoal > 0
      ? userState.yearlyTitleGoal
      : goalByYear.get(targetYear) ?? 50;

  const pagesGoal =
    typeof userState?.yearlyPageGoal === 'number' && userState.yearlyPageGoal > 0
      ? userState.yearlyPageGoal
      : 12000;

  const targetStats = readByYear.get(targetYear) || { titles: 0, pages: 0 };
  const titlesCompleted = targetStats.titles;
  const pagesCompleted = targetStats.pages;

  const titlesPct = titlesGoal > 0 ? Math.min(999, Math.round((titlesCompleted / titlesGoal) * 100)) : 0;
  const pagesPct = pagesGoal > 0 ? Math.min(999, Math.round((pagesCompleted / pagesGoal) * 100)) : 0;
  const estimatedHoursRead = estimateHoursForPages(pagesCompleted, effectiveWpm);

  // Calendar math for targetYear
  const jan1 = new Date(targetYear, 0, 1, 12, 0, 0, 0);
  const dec31 = new Date(targetYear, 11, 31, 12, 0, 0, 0);
  const daysInYear = Math.round((dec31.getTime() - jan1.getTime()) / 86400000) + 1;

  let daysElapsedInYear = daysInYear;
  if (targetYear === currentYear) {
    const todayNoon = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
      12,
      0,
      0,
      0
    );
    daysElapsedInYear = Math.max(
      1,
      Math.min(daysInYear, Math.round((todayNoon.getTime() - jan1.getTime()) / 86400000) + 1)
    );
  } else if (targetYear > currentYear) {
    daysElapsedInYear = 0;
  }

  const daysRemainingInYear = Math.max(0, daysInYear - daysElapsedInYear);
  const idealPacePct = Math.round((daysElapsedInYear / daysInYear) * 100);

  const idealTitlesToDate = (titlesGoal * daysElapsedInYear) / daysInYear;
  const paceDeltaBooks = Math.round((titlesCompleted - idealTitlesToDate) * 10) / 10;

  const projectedYearEndTitles =
    daysElapsedInYear > 0 ? Math.round((titlesCompleted / daysElapsedInYear) * daysInYear) : 0;
  const projectedYearEndPages =
    daysElapsedInYear > 0 ? Math.round((pagesCompleted / daysElapsedInYear) * daysInYear) : 0;

  const remainingPagesGoal = Math.max(0, pagesGoal - pagesCompleted);
  const remainingTitlesGoal = Math.max(0, titlesGoal - titlesCompleted);
  const neededPagesPerDay =
    daysRemainingInYear > 0 ? Math.round((remainingPagesGoal / daysRemainingInYear) * 10) / 10 : 0;
  const neededBooksPerWeek =
    daysRemainingInYear > 0
      ? Math.round((remainingTitlesGoal / (daysRemainingInYear / 7)) * 10) / 10
      : 0;

  // Monthly cumulative points
  let cumBooks = 0;
  let cumPages = 0;
  const monthlyCumulative: MonthlyTargetPoint[] = MONTH_LABELS.map((label, idx) => {
    cumBooks += monthlyBooks[idx];
    cumPages += monthlyPages[idx];
    return {
      month: idx + 1,
      label,
      booksFinished: monthlyBooks[idx],
      cumulativeBooks: cumBooks,
      pagesRead: monthlyPages[idx],
      cumulativePages: cumPages,
      idealCumulativeBooks: Math.round(((titlesGoal * (idx + 1)) / 12) * 10) / 10,
      idealCumulativePages: Math.round((pagesGoal * (idx + 1)) / 12),
    };
  });

  const yearOverYear: YearlyGoalRow[] = allYears.map((year) => {
    const g =
      year === currentYear && typeof userState?.yearlyTitleGoal === 'number' && userState.yearlyTitleGoal > 0
        ? userState.yearlyTitleGoal
        : goalByYear.get(year) ?? null;
    const st = readByYear.get(year) || { titles: 0, pages: 0 };
    return {
      year,
      titlesGoal: g,
      titlesCompleted: st.titles,
      pagesCompleted: st.pages,
      pctOfGoal: g && g > 0 ? Math.round((st.titles / g) * 100) : null,
    };
  });

  // Entire TBR reading time & finishable-this-year candidates
  const bucketMap: Record<TbrLengthBucket['key'], TbrLengthBucket> = {
    short: { key: 'short', label: 'Short (< 200 pp)', count: 0, pages: 0, hours: 0 },
    medium: { key: 'medium', label: 'Medium (200–400 pp)', count: 0, pages: 0, hours: 0 },
    long: { key: 'long', label: 'Long (400–700 pp)', count: 0, pages: 0, hours: 0 },
    tomes: { key: 'tomes', label: 'Tomes (700+ pp)', count: 0, pages: 0, hours: 0 },
  };

  let toReadCount = 0;
  let currentlyReadingCount = 0;
  let toReadPages = 0;
  let currentlyReadingRemainingPages = 0;
  let missingPageCountBooks = 0;

  const yearEndHoursBudget = Math.max(0, daysRemainingInYear * dailyHoursBudget);
  const finishableCandidates: FinishableCandidate[] = [];

  for (const book of books) {
    const shelf = getEffectiveShelf(book);
    if (shelf !== 'to-read' && shelf !== 'currently-reading') continue;

    const hasKnownPages = typeof book.pageCount === 'number' && book.pageCount > 0;
    const totalPages = hasKnownPages ? book.pageCount! : FALLBACK_PAGE_COUNT;
    if (!hasKnownPages) missingPageCountBooks += 1;

    const currentPage = userState?.bookOverrides?.[book.id]?.currentPage ?? 0;
    const remainingPages =
      shelf === 'currently-reading' ? Math.max(0, totalPages - currentPage) : totalPages;

    if (shelf === 'to-read') {
      toReadCount += 1;
      toReadPages += totalPages;
    } else {
      currentlyReadingCount += 1;
      currentlyReadingRemainingPages += remainingPages;
    }

    const bucketKey: TbrLengthBucket['key'] =
      totalPages < 200
        ? 'short'
        : totalPages < 400
        ? 'medium'
        : totalPages < 700
        ? 'long'
        : 'tomes';

    bucketMap[bucketKey].count += 1;
    bucketMap[bucketKey].pages += remainingPages;

    const estHours = estimateHoursForPages(remainingPages, effectiveWpm);
    finishableCandidates.push({
      book,
      shelf,
      remainingPages,
      totalPages,
      estimatedHours: estHours,
      fitsBudget: estHours <= yearEndHoursBudget,
    });
  }

  for (const b of Object.values(bucketMap)) {
    b.hours = estimateHoursForPages(b.pages, effectiveWpm);
  }

  const totalBacklogPages = toReadPages + currentlyReadingRemainingPages;
  const totalEstimatedHours = estimateHoursForPages(totalBacklogPages, effectiveWpm);
  const daysAt60Min = Math.round(totalEstimatedHours);
  const yearsAt30MinDay = Math.round((totalEstimatedHours / (0.5 * 365)) * 10) / 10;
  const yearsAt60MinDay = Math.round((totalEstimatedHours / 365) * 10) / 10;

  const annualizedPagesPace =
    targetYear === currentYear && daysElapsedInYear > 0 && pagesCompleted > 0
      ? (pagesCompleted / daysElapsedInYear) * 365
      : pagesCompleted > 0
      ? pagesCompleted
      : 0;
  const yearsAtCurrentPace =
    annualizedPagesPace > 0
      ? Math.round((totalBacklogPages / annualizedPagesPace) * 10) / 10
      : null;

  finishableCandidates.sort((a, b) => {
    if (a.shelf !== b.shelf) return a.shelf === 'currently-reading' ? -1 : 1;
    return a.estimatedHours - b.estimatedHours;
  });

  return {
    targetYear,
    effectiveWpm,
    isKindleWpmCalibrated,
    titlesCompleted,
    dnfCount,
    titlesGoal,
    titlesPct,
    pagesCompleted,
    pagesGoal,
    pagesPct,
    estimatedHoursRead,
    daysElapsedInYear,
    daysInYear,
    daysRemainingInYear,
    idealPacePct,
    paceDeltaBooks,
    projectedYearEndTitles,
    projectedYearEndPages,
    neededPagesPerDay,
    neededBooksPerWeek,
    monthlyCumulative,
    yearOverYear,
    tbrSummary: {
      toReadCount,
      currentlyReadingCount,
      toReadPages,
      currentlyReadingRemainingPages,
      totalBacklogPages,
      missingPageCountBooks,
      effectiveWpm,
      totalEstimatedHours,
      daysAt60Min,
      yearsAt30MinDay,
      yearsAt60MinDay,
      yearsAtCurrentPace,
      buckets: [bucketMap.short, bucketMap.medium, bucketMap.long, bucketMap.tomes],
    },
    finishableCandidates,
  };
}
