import type { Book, DraftedFileRecord, UserLocalState } from '../../types/library';

export type TimelineGranularity = 'year' | 'month' | 'week';

export interface TimelineFinishedBookEvent {
  bookId: string;
  title: string;
  author: string;
  pageCount: number | null;
  myRating: number | null;
  durationDays: number | null;
  date: string;
}

export interface TimelineStartedBookEvent {
  bookId: string;
  title: string;
  author: string;
  date: string;
}

export interface TimelineProgressEvent {
  bookId: string;
  title: string;
  page: number;
  date: string;
}

export interface TimelineHighlightedBook {
  bookId?: string;
  title: string;
  author: string;
  count: number;
}

export interface TimelineDraftedFileEvent extends DraftedFileRecord {
  date: string;
}

export interface TimelineReadingSpan {
  id: string;
  bookId: string;
  title: string;
  author: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  durationDays: number | null;
  pageCount: number | null;
  myRating: number | null;
}

export interface PositionedReadingSpan extends TimelineReadingSpan {
  startIdx: number;
  endIdx: number;
  lane: number;
  clippedLeft: boolean;
  clippedRight: boolean;
}

export interface DualTimelineDayRecord {
  date: string; // YYYY-MM-DD
  finishedBooks: TimelineFinishedBookEvent[];
  startedBooks: TimelineStartedBookEvent[];
  progressMilestones: TimelineProgressEvent[];
  highlightCount: number;
  highlightedBooks: TimelineHighlightedBook[];
  readScore: number;
  wordsWritten: number;
  goalMet: boolean;
  draftedFiles: TimelineDraftedFileEvent[];
  isDualMomentum: boolean;
}

export interface DualTimelineIndex {
  days: Record<string, DualTimelineDayRecord>;
  sortedDates: string[];
  availableYears: number[];
  latestActiveDate: string;
  dailyGoal: number;
  hasWritingTelemetry: boolean;
  readingSpans: TimelineReadingSpan[];
}

export interface TimelineBucket {
  id: string;
  granularity: TimelineGranularity;
  label: string;
  shortAxisLabel: string;
  tickLabel: string | null;
  startDate: string;
  endDate: string;
  isCurrentPeriod: boolean;
  isWeekend: boolean;
  // Read track (above axis)
  finishedBooks: TimelineFinishedBookEvent[];
  startedBooks: TimelineStartedBookEvent[];
  progressMilestones: TimelineProgressEvent[];
  highlightCount: number;
  highlightedBooks: TimelineHighlightedBook[];
  readScore: number;
  readNormalized: number; // 0..1
  // Written track (below axis)
  wordsWritten: number;
  goalMetDays: number;
  writingDaysCount: number;
  draftedFiles: TimelineDraftedFileEvent[];
  writeNormalized: number; // 0..1
  // Combined
  isDualMomentum: boolean;
  activeDays: DualTimelineDayRecord[];
}

export interface DualTimelineSummary {
  booksFinishedCount: number;
  booksStartedCount: number;
  totalHighlights: number;
  activeReadingDays: number;
  totalWordsWritten: number;
  activeWritingDays: number;
  goalMetDays: number;
  dualMomentumDays: number;
  uniqueNotesTouched: number;
}

export interface DualTimelineViewModel {
  granularity: TimelineGranularity;
  periodLabel: string;
  subLabel: string;
  anchorDate: string;
  startDate: string;
  endDate: string;
  prevAnchorDate: string;
  nextAnchorDate: string;
  latestAnchorDate: string;
  buckets: TimelineBucket[];
  maxReadScore: number;
  maxWordsWritten: number;
  summary: DualTimelineSummary;
}

const DATE_PREFIX_RX = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[\sT])/;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Formats a local Date instance into 'YYYY-MM-DD'.
 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a 'YYYY-MM-DD' string into a local Date (noon-safe to avoid DST edge shifts).
 */
export function parseLocalDate(dateKey: string): Date {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

/**
 * Normalizes Goodreads CSV/DSAR dates, YYYY/MM/DD, UTC date strings, and ISO timestamps
 * into a local 'YYYY-MM-DD' key. Returns null for invalid or pre-1900 placeholder dates.
 */
export function normalizeDateKey(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Date-only or UTC-midnight Goodreads format (e.g. "2026/08/21" or "2026-08-21 00:00:00 UTC")
  const prefixMatch = trimmed.match(DATE_PREFIX_RX);
  if (prefixMatch && (!trimmed.includes('T') || trimmed.endsWith('00:00:00 UTC'))) {
    const y = Number(prefixMatch[1]);
    const m = Number(prefixMatch[2]);
    const d = Number(prefixMatch[3]);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  // Timestamp with time component (e.g. Kindle clipping "2025-11-07T16:50:44.000Z")
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  if (y < 1900 || y > 2100) return null;
  return formatDateKey(parsed);
}

/**
 * Returns the Monday (ISO week start) for a given local Date.
 */
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const monOffset = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - monOffset);
  return d;
}

function createEmptyDayRecord(date: string): DualTimelineDayRecord {
  return {
    date,
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
}

/**
 * Builds an indexed day-by-day chronology combining Ex Libris reading events
 * (finished books, sessions, progress logs, Kindle highlights) and Scriptor writing telemetry.
 */
export function buildDualTimelineIndex(
  books: Book[] = [],
  userState?: UserLocalState,
  referenceDate: Date = new Date()
): DualTimelineIndex {
  const days: Record<string, DualTimelineDayRecord> = {};
  const ensureDay = (dateKey: string): DualTimelineDayRecord => {
    if (!days[dateKey]) {
      days[dateKey] = createEmptyDayRecord(dateKey);
    }
    return days[dateKey];
  };

  const bookById = new Map<string, Book>();
  const bookByTitle = new Map<string, Book>();
  for (const b of books) {
    bookById.set(b.id, b);
    const ct = (b.cleanTitle || b.title || '').toLowerCase().trim();
    if (ct) bookByTitle.set(ct, b);
    const rt = (b.title || '').toLowerCase().trim();
    if (rt) bookByTitle.set(rt, b);
  }

  // Track (bookId::dateKey) to avoid double-counting dateRead + COMPLETED readingSession on the same day
  const finishedSeen = new Set<string>();
  const startedSeen = new Set<string>();
  const pendingSessions: Array<{
    bookId: string;
    title: string;
    author: string;
    startDate: string;
    endDate: string | null;
    durationDays: number | null;
    pageCount: number | null;
    myRating: number | null;
  }> = [];
  const activityDatesByBook = new Map<string, Set<string>>();
  const recordBookActivity = (bookId: string | undefined, dateKey: string | null) => {
    if (!bookId || !dateKey) return;
    let set = activityDatesByBook.get(bookId);
    if (!set) {
      set = new Set<string>();
      activityDatesByBook.set(bookId, set);
    }
    set.add(dateKey);
  };

  // 1. Finished books, reading sessions, and manual progress logs
  for (const book of books) {
    const title = book.cleanTitle || book.title;
    const author = book.author || 'Unknown Author';

    if (Array.isArray(book.readingSessions)) {
      for (const session of book.readingSessions) {
        const endKey =
          session.state === 'COMPLETED'
            ? normalizeDateKey(session.endedAt) || normalizeDateKey(book.dateRead)
            : null;
        if (endKey) {
          const dedupe = `${book.id}::${endKey}`;
          if (!finishedSeen.has(dedupe)) {
            finishedSeen.add(dedupe);
            ensureDay(endKey).finishedBooks.push({
              bookId: book.id,
              title,
              author,
              pageCount: book.pageCount ?? null,
              myRating: book.myRating ?? null,
              durationDays: session.durationDays ?? null,
              date: endKey,
            });
          }
        }

        const startKey = normalizeDateKey(session.startedAt);
        if (startKey) {
          pendingSessions.push({
            bookId: book.id,
            title,
            author,
            startDate: startKey,
            endDate: endKey,
            durationDays: session.durationDays ?? null,
            pageCount: book.pageCount ?? null,
            myRating: book.myRating ?? null,
          });
        }

        if (startKey && startKey !== endKey) {
          const dedupe = `${book.id}::${startKey}`;
          if (!startedSeen.has(dedupe)) {
            startedSeen.add(dedupe);
            ensureDay(startKey).startedBooks.push({
              bookId: book.id,
              title,
              author,
              date: startKey,
            });
          }
        }
      }
    }

    const dateReadKey = normalizeDateKey(book.dateRead);
    if (dateReadKey) {
      const dedupe = `${book.id}::${dateReadKey}`;
      if (!finishedSeen.has(dedupe)) {
        finishedSeen.add(dedupe);
        ensureDay(dateReadKey).finishedBooks.push({
          bookId: book.id,
          title,
          author,
          pageCount: book.pageCount ?? null,
          myRating: book.myRating ?? null,
          durationDays: null,
          date: dateReadKey,
        });
      }
    }

    const override = userState?.bookOverrides?.[book.id];
    if (override?.progressLogs) {
      for (const log of override.progressLogs) {
        const logKey = normalizeDateKey(log.date);
        if (!logKey || typeof log.page !== 'number') continue;
        recordBookActivity(book.id, logKey);
        ensureDay(logKey).progressMilestones.push({
          bookId: book.id,
          title,
          page: log.page,
          date: logKey,
        });
      }
    }
  }

  // 2. Kindle clippings / highlights
  const clippings = userState?.kindleClippings || [];
  for (const clip of clippings) {
    const clipKey = normalizeDateKey(clip.addedAt);
    if (!clipKey) continue;

    const rawTitle = clip.cleanTitle || clip.rawTitle || 'Untitled Volume';
    const matched =
      (clip.matchedBookId ? bookById.get(clip.matchedBookId) : undefined) ||
      bookByTitle.get(rawTitle.toLowerCase().trim());

    const resolvedTitle = matched?.cleanTitle || matched?.title || rawTitle;
    const resolvedAuthor = matched?.author || clip.author || 'Unknown Author';
    const resolvedBookId = matched?.id || clip.matchedBookId || undefined;

    const day = ensureDay(clipKey);
    day.highlightCount += 1;
    recordBookActivity(resolvedBookId, clipKey);

    const existing = day.highlightedBooks.find(
      (hb) =>
        (resolvedBookId && hb.bookId === resolvedBookId) ||
        hb.title.toLowerCase() === resolvedTitle.toLowerCase()
    );
    if (existing) {
      existing.count += 1;
    } else {
      day.highlightedBooks.push({
        bookId: resolvedBookId,
        title: resolvedTitle,
        author: resolvedAuthor,
        count: 1,
      });
    }
  }

  // 3. Scriptor writing telemetry
  const telemetry = userState?.writingTelemetry;
  const dailyGoal = telemetry?.dailyGoal || 300;
  const completedSet = new Set(telemetry?.completedGoalDates || []);
  const dailyTotals = telemetry?.dailyTotals || {};
  const dailyFiles = telemetry?.dailyFiles || {};

  for (const [rawDate, wordsVal] of Object.entries(dailyTotals)) {
    const dateKey = normalizeDateKey(rawDate);
    const words = Math.max(0, Number(wordsVal) || 0);
    if (!dateKey || words <= 0) continue;

    const day = ensureDay(dateKey);
    day.wordsWritten = words;
    day.goalMet = completedSet.has(dateKey) || words >= dailyGoal;
  }

  for (const [rawDate, files] of Object.entries(dailyFiles)) {
    const dateKey = normalizeDateKey(rawDate);
    if (!dateKey || !Array.isArray(files) || files.length === 0) continue;

    const day = ensureDay(dateKey);
    for (const f of files) {
      day.draftedFiles.push({
        ...f,
        date: dateKey,
      });
    }
  }

  // 4. Finalize per-day scores and dual-momentum flags
  for (const day of Object.values(days)) {
    day.highlightedBooks.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
    day.draftedFiles.sort((a, b) => b.words - a.words || a.fileName.localeCompare(b.fileName));
    day.readScore =
      day.finishedBooks.length * 6 +
      day.highlightCount +
      day.progressMilestones.length * 2 +
      day.startedBooks.length;

    const hasRead =
      day.finishedBooks.length > 0 ||
      day.highlightCount > 0 ||
      day.progressMilestones.length > 0;
    const hasWrite = day.wordsWritten > 0 || day.draftedFiles.length > 0;
    day.isDualMomentum = hasRead && hasWrite;
  }

  const sortedDates = Object.keys(days).sort();
  const yearsSet = new Set<number>();
  for (const dt of sortedDates) {
    const y = Number(dt.slice(0, 4));
    if (!Number.isNaN(y)) yearsSet.add(y);
  }
  const currentYear = referenceDate.getFullYear();
  if (!yearsSet.has(currentYear)) yearsSet.add(currentYear);

  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);
  const latestActiveDate =
    sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : formatDateKey(referenceDate);

  const hasWritingTelemetry = Boolean(
    telemetry &&
      (Object.values(dailyTotals).some((w) => w > 0) ||
        Object.keys(dailyFiles).length > 0 ||
        telemetry.totalWords > 0)
  );

  const MAX_SPAN_GAP_DAYS = 7;
  const diffDaysBetween = (a: string, b: string): number =>
    Math.round((parseLocalDate(a).getTime() - parseLocalDate(b).getTime()) / 86400000);

  const spanSeen = new Set<string>();
  const readingSpans: TimelineReadingSpan[] = [];

  for (const ps of pendingSessions) {
    const activitySet = new Set<string>([ps.startDate]);
    if (ps.endDate) activitySet.add(ps.endDate);

    const bookDates = activityDatesByBook.get(ps.bookId);
    if (bookDates) {
      for (const dt of bookDates) {
        const afterStart = diffDaysBetween(dt, ps.startDate) >= -2;
        const beforeEnd = !ps.endDate || dt <= ps.endDate;
        if (afterStart && beforeEnd) {
          activitySet.add(dt);
        }
      }
    }

    const sortedAct = Array.from(activitySet).sort();
    const bursts: Array<{ start: string; end: string }> = [];
    let curStart = sortedAct[0];
    let curEnd = sortedAct[0];

    for (let i = 1; i < sortedAct.length; i++) {
      const dt = sortedAct[i];
      if (diffDaysBetween(dt, curEnd) <= MAX_SPAN_GAP_DAYS) {
        curEnd = dt;
      } else {
        bursts.push({ start: curStart, end: curEnd });
        curStart = dt;
        curEnd = dt;
      }
    }
    bursts.push({ start: curStart, end: curEnd });

    bursts.forEach((burst, idx) => {
      const isLast = idx === bursts.length - 1;
      const isOngoing =
        ps.endDate === null &&
        isLast &&
        diffDaysBetween(latestActiveDate, burst.end) <= MAX_SPAN_GAP_DAYS;
      const endDate = isOngoing ? null : burst.end;
      const spanId = `${ps.bookId}::${burst.start}::${endDate ?? 'open'}`;
      if (spanSeen.has(spanId)) return;
      spanSeen.add(spanId);

      const durationDays =
        bursts.length === 1 && ps.durationDays != null && !isOngoing
          ? ps.durationDays
          : Math.max(1, diffDaysBetween(burst.end, burst.start));

      readingSpans.push({
        id: spanId,
        bookId: ps.bookId,
        title: ps.title,
        author: ps.author,
        startDate: burst.start,
        endDate,
        isOngoing,
        durationDays,
        pageCount: ps.pageCount,
        myRating: ps.myRating,
      });
    });
  }

  readingSpans.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      (b.durationDays ?? 0) - (a.durationDays ?? 0) ||
      a.title.localeCompare(b.title)
  );

  return {
    days,
    sortedDates,
    availableYears,
    latestActiveDate,
    dailyGoal,
    hasWritingTelemetry,
    readingSpans,
  };
}

function aggregateDaysIntoBucket(
  id: string,
  granularity: TimelineGranularity,
  label: string,
  shortAxisLabel: string,
  tickLabel: string | null,
  startDate: string,
  endDate: string,
  todayKey: string,
  isWeekend: boolean,
  dayKeys: string[],
  index: DualTimelineIndex
): TimelineBucket {
  const finishedBooks: TimelineFinishedBookEvent[] = [];
  const startedBooks: TimelineStartedBookEvent[] = [];
  const progressMilestones: TimelineProgressEvent[] = [];
  const highlightedMap = new Map<string, TimelineHighlightedBook>();
  const draftedMap = new Map<string, TimelineDraftedFileEvent>();
  const activeDays: DualTimelineDayRecord[] = [];

  let highlightCount = 0;
  let readScore = 0;
  let wordsWritten = 0;
  let goalMetDays = 0;
  let writingDaysCount = 0;
  let anyDualDay = false;

  for (const dt of dayKeys) {
    const day = index.days[dt];
    if (!day) continue;

    activeDays.push(day);
    finishedBooks.push(...day.finishedBooks);
    startedBooks.push(...day.startedBooks);
    progressMilestones.push(...day.progressMilestones);
    highlightCount += day.highlightCount;
    readScore += day.readScore;
    wordsWritten += day.wordsWritten;
    if (day.goalMet) goalMetDays += 1;
    if (day.wordsWritten > 0 || day.draftedFiles.length > 0) writingDaysCount += 1;
    if (day.isDualMomentum) anyDualDay = true;

    for (const hb of day.highlightedBooks) {
      const key = hb.bookId || hb.title.toLowerCase();
      const prev = highlightedMap.get(key);
      if (prev) {
        prev.count += hb.count;
      } else {
        highlightedMap.set(key, { ...hb });
      }
    }

    for (const df of day.draftedFiles) {
      const prev = draftedMap.get(df.filePath);
      if (prev) {
        prev.words += df.words;
        if (df.date > prev.date) prev.date = df.date;
      } else {
        draftedMap.set(df.filePath, { ...df });
      }
    }
  }

  const highlightedBooks = Array.from(highlightedMap.values()).sort(
    (a, b) => b.count - a.count || a.title.localeCompare(b.title)
  );
  const draftedFiles = Array.from(draftedMap.values()).sort(
    (a, b) => b.words - a.words || a.fileName.localeCompare(b.fileName)
  );

  const hasRead =
    finishedBooks.length > 0 || highlightCount > 0 || progressMilestones.length > 0;
  const hasWrite = wordsWritten > 0 || draftedFiles.length > 0;

  return {
    id,
    granularity,
    label,
    shortAxisLabel,
    tickLabel,
    startDate,
    endDate,
    isCurrentPeriod: todayKey >= startDate && todayKey <= endDate,
    isWeekend,
    finishedBooks,
    startedBooks,
    progressMilestones,
    highlightCount,
    highlightedBooks,
    readScore,
    readNormalized: 0,
    wordsWritten,
    goalMetDays,
    writingDaysCount,
    draftedFiles,
    writeNormalized: 0,
    isDualMomentum: anyDualDay || (hasRead && hasWrite),
    activeDays,
  };
}

/**
 * Builds the ViewModel for the Dual-Track Timeline at Year, Month, or Week granularity.
 */
export function buildDualTimelineViewModel(
  index: DualTimelineIndex,
  granularity: TimelineGranularity,
  anchorDateKey?: string,
  referenceDate: Date = new Date()
): DualTimelineViewModel {
  const todayKey = formatDateKey(referenceDate);
  const effectiveAnchorKey = normalizeDateKey(anchorDateKey) || index.latestActiveDate || todayKey;
  const anchor = parseLocalDate(effectiveAnchorKey);

  const buckets: TimelineBucket[] = [];
  let periodLabel = '';
  let subLabel = '';
  let startDate = '';
  let endDate = '';
  let prevAnchorDate = '';
  let nextAnchorDate = '';

  if (granularity === 'year') {
    const year = anchor.getFullYear();
    const jan1 = new Date(year, 0, 1, 12, 0, 0, 0);
    const dec31 = new Date(year, 11, 31, 12, 0, 0, 0);

    startDate = formatDateKey(jan1);
    endDate = formatDateKey(dec31);
    periodLabel = `${year}`;
    prevAnchorDate = `${year - 1}-01-01`;
    nextAnchorDate = `${year + 1}-01-01`;

    let weekDayKeys: string[] = [];
    let weekStartKey = '';
    let weekTick: string | null = null;
    let weekIdx = 1;

    for (let cur = new Date(jan1); cur <= dec31; cur.setDate(cur.getDate() + 1)) {
      const dtKey = formatDateKey(cur);
      const dayOfWeek = (cur.getDay() + 6) % 7; // Mon=0..Sun=6
      if (weekDayKeys.length === 0) {
        weekStartKey = dtKey;
        weekTick = null;
      }
      if (cur.getDate() === 1) {
        weekTick = SHORT_MONTHS[cur.getMonth()];
      }
      weekDayKeys.push(dtKey);

      if (dayOfWeek === 6 || cur.getTime() === dec31.getTime()) {
        const wStart = parseLocalDate(weekStartKey);
        const wEnd = parseLocalDate(dtKey);
        const rangeLabel = `${SHORT_MONTHS[wStart.getMonth()]} ${wStart.getDate()} – ${
          wStart.getMonth() !== wEnd.getMonth() ? `${SHORT_MONTHS[wEnd.getMonth()]} ` : ''
        }${wEnd.getDate()}`;

        buckets.push(
          aggregateDaysIntoBucket(
            `${year}-W${String(weekIdx).padStart(2, '0')}`,
            'year',
            `Week ${weekIdx} · ${rangeLabel}`,
            `W${weekIdx}`,
            weekTick,
            weekStartKey,
            dtKey,
            todayKey,
            false,
            weekDayKeys,
            index
          )
        );
        weekDayKeys = [];
        weekIdx += 1;
      }
    }

    subLabel = `${buckets.length} weekly spans · Jan–Dec ${year}`;
  } else if (granularity === 'month') {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0, 12, 0, 0, 0).getDate();

    const firstDay = new Date(year, month, 1, 12, 0, 0, 0);
    const lastDay = new Date(year, month, daysInMonth, 12, 0, 0, 0);
    startDate = formatDateKey(firstDay);
    endDate = formatDateKey(lastDay);
    periodLabel = `${firstDay.toLocaleString('en-US', { month: 'long' })} ${year}`;
    subLabel = `${daysInMonth} days · ${SHORT_MONTHS[month]} 1–${daysInMonth}, ${year}`;
    prevAnchorDate = formatDateKey(new Date(year, month - 1, 1, 12, 0, 0, 0));
    nextAnchorDate = formatDateKey(new Date(year, month + 1, 1, 12, 0, 0, 0));

    for (let d = 1; d <= daysInMonth; d++) {
      const cur = new Date(year, month, d, 12, 0, 0, 0);
      const dtKey = formatDateKey(cur);
      const monDay = (cur.getDay() + 6) % 7;
      const isWeekend = monDay >= 5;
      const showTick = d === 1 || d % 5 === 0 || d === daysInMonth;

      buckets.push(
        aggregateDaysIntoBucket(
          dtKey,
          'month',
          `${SHORT_DAYS[monDay]}, ${SHORT_MONTHS[month]} ${d}, ${year}`,
          String(d),
          showTick ? String(d) : null,
          dtKey,
          dtKey,
          todayKey,
          isWeekend,
          [dtKey],
          index
        )
      );
    }
  } else {
    // Week granularity (7 days Mon..Sun)
    const monday = getMondayOfWeek(anchor);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    startDate = formatDateKey(monday);
    endDate = formatDateKey(sunday);

    const sameMonth = monday.getMonth() === sunday.getMonth();
    const sameYear = monday.getFullYear() === sunday.getFullYear();
    if (sameMonth) {
      periodLabel = `${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()} – ${sunday.getDate()}, ${sunday.getFullYear()}`;
    } else if (sameYear) {
      periodLabel = `${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()} – ${SHORT_MONTHS[sunday.getMonth()]} ${sunday.getDate()}, ${sunday.getFullYear()}`;
    } else {
      periodLabel = `${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()}, ${monday.getFullYear()} – ${SHORT_MONTHS[sunday.getMonth()]} ${sunday.getDate()}, ${sunday.getFullYear()}`;
    }
    subLabel = '7 daily columns · Mon–Sun';

    const prevMon = new Date(monday);
    prevMon.setDate(monday.getDate() - 7);
    const nextMon = new Date(monday);
    nextMon.setDate(monday.getDate() + 7);
    prevAnchorDate = formatDateKey(prevMon);
    nextAnchorDate = formatDateKey(nextMon);

    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const dtKey = formatDateKey(cur);
      const isWeekend = i >= 5;
      const shortLabel = `${SHORT_DAYS[i]} ${cur.getDate()}`;

      buckets.push(
        aggregateDaysIntoBucket(
          dtKey,
          'week',
          `${SHORT_DAYS[i]}, ${SHORT_MONTHS[cur.getMonth()]} ${cur.getDate()}, ${cur.getFullYear()}`,
          shortLabel,
          shortLabel,
          dtKey,
          dtKey,
          todayKey,
          isWeekend,
          [dtKey],
          index
        )
      );
    }
  }

  // Normalize heights & compute summary metrics across the visible period
  const maxReadScore = Math.max(1, ...buckets.map((b) => b.readScore));
  const maxWordsWritten = Math.max(1, ...buckets.map((b) => b.wordsWritten));

  let booksFinishedCount = 0;
  let booksStartedCount = 0;
  let totalHighlights = 0;
  let activeReadingDays = 0;
  let totalWordsWritten = 0;
  let activeWritingDays = 0;
  let goalMetDays = 0;
  let dualMomentumDays = 0;
  const uniqueNotesSet = new Set<string>();

  for (const b of buckets) {
    b.readNormalized = b.readScore > 0 ? Math.max(0.14, b.readScore / maxReadScore) : 0;
    b.writeNormalized = b.wordsWritten > 0 ? Math.max(0.14, b.wordsWritten / maxWordsWritten) : 0;

    booksFinishedCount += b.finishedBooks.length;
    booksStartedCount += b.startedBooks.length;
    totalHighlights += b.highlightCount;
    totalWordsWritten += b.wordsWritten;
    goalMetDays += b.goalMetDays;

    for (const df of b.draftedFiles) {
      uniqueNotesSet.add(df.filePath);
    }

    for (const day of b.activeDays) {
      if (
        day.finishedBooks.length > 0 ||
        day.highlightCount > 0 ||
        day.progressMilestones.length > 0
      ) {
        activeReadingDays += 1;
      }
      if (day.wordsWritten > 0 || day.draftedFiles.length > 0) {
        activeWritingDays += 1;
      }
      if (day.isDualMomentum) {
        dualMomentumDays += 1;
      }
    }
  }

  return {
    granularity,
    periodLabel,
    subLabel,
    anchorDate: effectiveAnchorKey,
    startDate,
    endDate,
    prevAnchorDate,
    nextAnchorDate,
    latestAnchorDate: index.latestActiveDate || todayKey,
    buckets,
    maxReadScore,
    maxWordsWritten,
    summary: {
      booksFinishedCount,
      booksStartedCount,
      totalHighlights,
      activeReadingDays,
      totalWordsWritten,
      activeWritingDays,
      goalMetDays,
      dualMomentumDays,
      uniqueNotesTouched: uniqueNotesSet.size,
    },
  };
}

/**
 * Projects reading spans onto the visible buckets and packs overlapping intervals
 * into compact horizontal bracket lanes.
 */
export function layoutReadingSpansForBuckets(
  spans: TimelineReadingSpan[],
  buckets: TimelineBucket[],
  includeOngoing: boolean,
  fallbackEndDate?: string
): { spans: PositionedReadingSpan[]; laneCount: number } {
  if (buckets.length === 0 || spans.length === 0) {
    return { spans: [], laneCount: 0 };
  }

  const windowStart = buckets[0].startDate;
  const windowEnd = buckets[buckets.length - 1].endDate;
  const openEnd = fallbackEndDate || windowEnd;

  const candidates: Array<Omit<PositionedReadingSpan, 'lane'>> = [];

  for (const s of spans) {
    if (!includeOngoing && s.isOngoing) continue;
    const effectiveEnd = s.endDate ?? openEnd;
    if (s.startDate > windowEnd || effectiveEnd < windowStart) continue;

    let startIdx = 0;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].endDate >= s.startDate) {
        startIdx = i;
        break;
      }
    }

    let endIdx = buckets.length - 1;
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (buckets[i].startDate <= effectiveEnd) {
        endIdx = i;
        break;
      }
    }
    if (endIdx < startIdx) endIdx = startIdx;

    candidates.push({
      ...s,
      startIdx,
      endIdx,
      clippedLeft: s.startDate < windowStart,
      clippedRight: s.isOngoing || effectiveEnd > windowEnd,
    });
  }

  candidates.sort(
    (a, b) =>
      a.startIdx - b.startIdx ||
      b.endIdx - b.startIdx - (a.endIdx - a.startIdx) ||
      a.title.localeCompare(b.title)
  );

  const laneEnds: number[] = [];
  const positioned: PositionedReadingSpan[] = [];

  for (const item of candidates) {
    let assigned = -1;
    for (let l = 0; l < laneEnds.length; l++) {
      if (laneEnds[l] < item.startIdx) {
        assigned = l;
        laneEnds[l] = item.endIdx;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnds.length;
      laneEnds.push(item.endIdx);
    }
    positioned.push({ ...item, lane: assigned });
  }

  return { spans: positioned, laneCount: laneEnds.length };
}
