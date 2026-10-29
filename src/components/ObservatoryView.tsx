import React, { useMemo } from 'react';
import { Book, EnrichmentCacheMap, LibraryBundle, UserLocalState } from '../types/library';
import {
  computeObservatoryMetrics,
  computeLanguagePassportMetrics,
  computeFormatVelocity,
  computeContrarianMetrics,
} from '../lib/analytics/engine';
import { FORMAT_LABELS, LANGUAGE_LABELS } from '../lib/classifiers/languageAndFormat';
import { formatPublicationYear } from '../lib/formatters';
import {
  Compass,
  Star,
  Award,
  Clock,
  Calendar,
  Zap,
  Flame,
  AlertTriangle,
  Trophy,
  Activity,
  Globe,
  Languages,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Layers,
  BookOpen,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface ObservatoryViewProps {
  bundle: LibraryBundle;
  onSelectBook: (book: Book) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
  onOpenEnrichModal: () => void;
}

export const ObservatoryView: React.FC<ObservatoryViewProps> = ({
  bundle,
  onSelectBook,
  onSelectBookById,
  userState,
  enrichmentCache,
  onOpenEnrichModal,
}) => {
  const books = bundle.books || [];

  // 1. Core observatory metrics
  const engineMetrics = useMemo(() => {
    try {
      return computeObservatoryMetrics(bundle);
    } catch (e) {
      console.warn('computeObservatoryMetrics fallback:', e);
      return null;
    }
  }, [bundle]);

  // Rating Distribution & 5-Star Canon
  const ratingDistribution = useMemo(() => {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRated = 0;
    let sumRating = 0;

    for (const b of books) {
      if (b.myRating && b.myRating >= 1 && b.myRating <= 5) {
        dist[b.myRating] = (dist[b.myRating] || 0) + 1;
        totalRated++;
        sumRating += b.myRating;
      }
    }

    const avg = totalRated > 0 ? (sumRating / totalRated).toFixed(2) : '4.01';
    return { dist, totalRated, avg };
  }, [books]);

  const fiveStarCanon = useMemo(() => {
    return books.filter((b) => b.myRating === 5);
  }, [books]);

  // 2. v0.2 Flagship A: Translation & Language Passport Matrix
  const languageMetrics = useMemo(() => {
    try {
      return computeLanguagePassportMetrics(bundle, userState, enrichmentCache);
    } catch (e) {
      console.warn('computeLanguagePassportMetrics fallback:', e);
      return null;
    }
  }, [bundle, userState, enrichmentCache]);

  // 3. v0.2 Flagship B: Format-Calibrated Reading Velocity
  const formatVelocityList = useMemo(() => {
    try {
      return computeFormatVelocity(bundle, userState);
    } catch (e) {
      console.warn('computeFormatVelocity fallback:', e);
      return [];
    }
  }, [bundle, userState]);

  // 4. v0.2 Flagship C: The Contrarian Index
  const contrarianMetrics = useMemo(() => {
    try {
      return computeContrarianMetrics(bundle, enrichmentCache);
    } catch (e) {
      console.warn('computeContrarianMetrics fallback:', e);
      return null;
    }
  }, [bundle, enrichmentCache]);

  // Session Forensics (Fastest Sprints, Longest Burns, Re-Reads)
  const { fastestSprints, longestBurns, reReadHallOfFame } = useMemo(() => {
    const readBooks = books.filter((b) => b.exclusiveShelf === 'read');
    const sessionList: Array<{ book: Book; durationDays: number; pagesPerDay: number }> = [];

    for (const b of readBooks) {
      if (b.readingSessions && b.readingSessions.length > 0) {
        for (const s of b.readingSessions) {
          if (s.durationDays && s.durationDays > 0) {
            const pages = b.pageCount || 300;
            sessionList.push({
              book: b,
              durationDays: s.durationDays,
              pagesPerDay: Math.round(pages / s.durationDays),
            });
          }
        }
      } else if (b.dateAdded && b.dateRead) {
        const d1 = new Date(b.dateAdded).getTime();
        const d2 = new Date(b.dateRead).getTime();
        const diff = Math.round((d2 - d1) / (1000 * 3600 * 24));
        if (diff > 0 && diff < 3650) {
          const pages = b.pageCount || 300;
          sessionList.push({
            book: b,
            durationDays: diff,
            pagesPerDay: Math.round(pages / diff),
          });
        }
      }
    }

    const sortedFastest = [...sessionList]
      .filter((s) => s.durationDays >= 1)
      .sort((a, b) => a.durationDays - b.durationDays)
      .slice(0, 4);

    const sortedSlowest = [...sessionList]
      .sort((a, b) => b.durationDays - a.durationDays)
      .slice(0, 4);

    const reReads = books.filter(
      (b) => b.readCount > 1 || (b.readingSessions && b.readingSessions.length > 1)
    );

    return {
      fastestSprints: sortedFastest,
      longestBurns: sortedSlowest,
      reReadHallOfFame: reReads,
    };
  }, [books]);

  // 2,800-Year Publication Timeline
  const eraTimeline = useMemo(() => {
    const eras = [
      { id: 'classical', label: 'Classical / Antiquity (Pre-500 CE)', min: -800, max: 500 },
      { id: 'medieval', label: 'Medieval & Renaissance (501–1700)', min: 501, max: 1700 },
      { id: 'enlightenment', label: 'Enlightenment & 19th C (1701–1900)', min: 1701, max: 1900 },
      { id: 'twentieth_early', label: 'Modernist Era (1901–1960)', min: 1901, max: 1960 },
      { id: 'twentieth_late', label: 'Postmodern Era (1961–2000)', min: 1961, max: 2000 },
      { id: 'contemporary', label: 'Contemporary (2001–Present)', min: 2001, max: 2030 },
    ];

    return eras.map((era) => {
      const eraBooks = books.filter((b) => {
        const y = b.originalPublicationYear || b.yearPublished;
        return y !== null && y >= era.min && y <= era.max;
      });

      const readCount = eraBooks.filter((b) => b.exclusiveShelf === 'read').length;
      const toReadCount = eraBooks.filter((b) => b.exclusiveShelf === 'to-read').length;
      const total = eraBooks.length;

      return {
        ...era,
        readCount,
        toReadCount,
        total,
      };
    });
  }, [books]);

  // Author Loyalty Leaderboard
  const authorLeaderboard = useMemo(() => {
    const authorMap = new Map<
      string,
      { author: string; booksRead: number; pagesRead: number; avgRating: number; ratings: number[] }
    >();
    const followedSet = new Set(
      (bundle.followedAuthors || []).map((a) => a.authorName?.toLowerCase().trim())
    );

    for (const b of books) {
      if (!b.author) continue;
      const auth = b.author;
      if (!authorMap.has(auth)) {
        authorMap.set(auth, { author: auth, booksRead: 0, pagesRead: 0, avgRating: 0, ratings: [] });
      }
      const entry = authorMap.get(auth)!;
      if (b.exclusiveShelf === 'read') {
        entry.booksRead++;
        entry.pagesRead += b.pageCount || 0;
        if (b.myRating) entry.ratings.push(b.myRating);
      }
    }

    const list = Array.from(authorMap.values())
      .filter((a) => a.booksRead > 0)
      .map((a) => ({
        ...a,
        avgRating:
          a.ratings.length > 0
            ? a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length
            : 0,
        isFollowed: followedSet.has(a.author.toLowerCase().trim()),
      }))
      .sort((a, b) => b.pagesRead - a.pagesRead || b.booksRead - a.booksRead)
      .slice(0, 10);

    return list;
  }, [books, bundle.followedAuthors]);

  // DNF Forensics Table
  const dnfBooks = useMemo(() => {
    return books.filter((b) => b.exclusiveShelf === 'did-not-finish');
  }, [books]);

  // Circadian rhythm & trophy data
  const circadian = bundle.activityByHour;
  const achievements = bundle.achievements || [];
  const goals = bundle.readingGoals || [];
  const favoriteGenres = bundle.favoriteGenres;

  return (
    <div className="space-y-12 pb-20">
      {/* 1. Header Banner */}
      <section className="relative p-6 sm:p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent-secondary)]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] border border-[var(--accent-secondary)]/20 text-xs font-semibold mb-3">
            <Compass className="w-3.5 h-3.5" />
            <span>Forensic Reading Analytics</span>
          </div>

          <h1 className="font-serif-editorial text-2xl sm:text-4xl font-bold tracking-tight text-[var(--text-ink)]">
            The Observatory
          </h1>

          <p className="font-serif-editorial text-base sm:text-lg italic text-[var(--text-muted)] mt-2 leading-relaxed">
            “Data is the shadow cast by curiosity: chronometry, velocity, translation bridges, and the
            divergent contours of personal judgment against the crowd.”
          </p>
        </div>
      </section>

      {/* 2. Rating Distribution & 5-Star Canon */}
      <section aria-labelledby="ratings-heading" className="space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[var(--accent-gold)]" />
            <h2
              id="ratings-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              Personal Critical Distribution
            </h2>
          </div>
          <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
            {ratingDistribution.totalRated} rated books · {ratingDistribution.avg}★ Personal Mean
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Rating Bars Card */}
          <div className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-4">
              Rating Spectrum (1★ to 5★)
            </div>

            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = ratingDistribution.dist[star] || 0;
                const pct =
                  ratingDistribution.totalRated > 0
                    ? Math.round((count / ratingDistribution.totalRated) * 100)
                    : 0;

                return (
                  <div key={star} className="flex items-center gap-3 text-xs font-mono-tabular">
                    <span className="w-8 flex items-center font-bold text-[var(--accent-gold)]">
                      {star}★
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          star === 5
                            ? 'bg-[var(--accent-gold)]'
                            : star === 4
                            ? 'bg-[var(--accent-secondary)]'
                            : star === 3
                            ? 'bg-[var(--accent-primary)]/70'
                            : 'bg-[var(--text-muted)]/50'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-[var(--text-muted)]">
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--border-ledger)] flex items-center justify-between text-xs text-[var(--text-muted)] font-mono-tabular">
              <span>Mean Personal Rating:</span>
              <span className="text-sm font-bold text-[var(--accent-gold)]">
                {ratingDistribution.avg} ★
              </span>
            </div>
          </div>

          {/* 5-Star Canon Chips (Clickable) */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-gold)] font-bold flex items-center gap-1.5">
                  <Award className="w-4 h-4" />
                  <span>The 5-Star Canon ({fiveStarCanon.length} Masterpieces)</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] italic">
                  Click any volume to inspect Dossier
                </span>
              </div>

              <div className="flex flex-wrap gap-2 max-h-[220px] overflow-y-auto pr-1">
                {fiveStarCanon.map((book) => (
                  <button
                    key={book.id}
                    onClick={() => onSelectBook(book)}
                    className="group px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--accent-gold)]/15 border border-[var(--border-ledger)] hover:border-[var(--accent-gold)] transition-all cursor-pointer text-left"
                  >
                    <span className="font-serif-editorial text-xs font-semibold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors">
                      {book.cleanTitle || book.title}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] ml-1.5 font-mono-tabular">
                      · {book.author.split(' ').pop()}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border-ledger)] text-xs text-[var(--text-muted)] italic">
              These {fiveStarCanon.length} works represent your highest personal standard of literary achievement.
            </div>
          </div>
        </div>
      </section>

      {/* 3. v0.2 Flagship C: The Contrarian Index */}
      <section aria-labelledby="contrarian-heading" className="space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2
              id="contrarian-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              The Contrarian Index: You vs. The Crowd
            </h2>
          </div>
          {contrarianMetrics && contrarianMetrics.enrichedRatedCount > 0 && (
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              {contrarianMetrics.enrichedRatedCount} compared volumes · Mean Divergence:{' '}
              <strong
                className={
                  contrarianMetrics.meanDelta >= 0
                    ? 'text-[var(--accent-secondary)]'
                    : 'text-[var(--accent-primary)]'
                }
              >
                {contrarianMetrics.meanDelta > 0 ? `+${contrarianMetrics.meanDelta}` : contrarianMetrics.meanDelta}★
              </strong>
            </span>
          )}
        </div>

        {!contrarianMetrics || contrarianMetrics.enrichedRatedCount === 0 ? (
          <div className="p-8 rounded-xl bg-[var(--bg-card)] border border-dashed border-[var(--border-ledger)] text-center space-y-3">
            <Scale className="w-10 h-10 text-[var(--accent-primary)]/60 mx-auto" />
            <h3 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
              Enrich Library to Unlock Contrarian Analytics
            </h3>
            <p className="text-xs text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed">
              Discover how your critical evaluations diverge from Goodreads &amp; Open Library
              consensus. Detect your Sacred Cows Slain and Hidden Champions.
            </p>
            <div className="pt-2">
              <button
                onClick={onOpenEnrichModal}
                className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:opacity-90 text-white text-xs font-semibold shadow-xs transition-opacity cursor-pointer inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Fetch Community Ratings (Enrich)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Divergence Summary Bar */}
            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-wrap items-center justify-between gap-4 text-xs font-mono-tabular">
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                  Overall Divergence:
                </span>
                <span
                  className={`text-sm font-bold px-2 py-0.5 rounded ${
                    contrarianMetrics.meanDelta >= 0
                      ? 'bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)]'
                      : 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                  }`}
                >
                  {contrarianMetrics.meanDelta > 0
                    ? `+${contrarianMetrics.meanDelta}`
                    : contrarianMetrics.meanDelta}
                  ★ vs Community
                </span>
              </div>
              <span className="text-[var(--text-muted)] italic">
                {contrarianMetrics.meanDelta < 0
                  ? 'You are generally more demanding and rigorous than the consensus'
                  : 'You are generally more generous and appreciative than the consensus'}
              </span>
            </div>

            {/* Sacred Cows Slain vs. Hidden Champions Side-by-Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sacred Cows Slain (My Rating << Community) */}
              <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-primary)] font-bold">
                      <TrendingDown className="w-4 h-4" />
                      <span>Sacred Cows Slain</span>
                    </div>
                    <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                      Δ ≤ −0.80★
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Books highly acclaimed by the community where your personal critique was sharply
                    harsher.
                  </p>

                  <div className="space-y-2.5">
                    {contrarianMetrics.sacredCowsSlain.slice(0, 5).map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectBook(item.book)}
                        className="p-3 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--accent-primary)]/40 transition-colors cursor-pointer group flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <h4 className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] truncate">
                            {item.book.cleanTitle || item.book.title}
                          </h4>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            by {item.book.author}
                          </p>
                        </div>
                        <div className="text-right shrink-0 font-mono-tabular">
                          <div className="text-xs font-bold text-[var(--accent-primary)]">
                            {item.delta}★
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            You: {item.myRating}★ · Avg: {item.communityRating}★
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Hidden Champions (My Rating >> Community) */}
              <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-secondary)] font-bold">
                      <TrendingUp className="w-4 h-4" />
                      <span>Hidden Champions</span>
                    </div>
                    <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                      Δ ≥ +0.60★
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Personal masterpieces you found profound, but the crowd undervalued or rated
                    modestly.
                  </p>

                  <div className="space-y-2.5">
                    {contrarianMetrics.hiddenChampions.slice(0, 5).map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectBook(item.book)}
                        className="p-3 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--accent-secondary)]/40 transition-colors cursor-pointer group flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <h4 className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-secondary)] truncate">
                            {item.book.cleanTitle || item.book.title}
                          </h4>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            by {item.book.author}
                          </p>
                        </div>
                        <div className="text-right shrink-0 font-mono-tabular">
                          <div className="text-xs font-bold text-[var(--accent-secondary)]">
                            +{item.delta}★
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            You: {item.myRating}★ · Avg: {item.communityRating}★
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 4. v0.2 Flagship A: Translation & Language Passport Matrix */}
      {languageMetrics && (
        <section aria-labelledby="languages-heading" className="space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-[var(--accent-secondary)]" />
              <h2
                id="languages-heading"
                className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
              >
                Translation &amp; Language Passport Matrix
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)] hidden sm:inline">
              Reading edition languages vs. original world literature origins
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Split Card: Original vs Translated Read */}
            <div className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4">
              <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                Original vs. Translation Split
              </div>

              {(() => {
                const totalRead =
                  languageMetrics.originalVsTranslated.originalRead +
                  languageMetrics.originalVsTranslated.translatedRead;
                const origPct =
                  totalRead > 0
                    ? Math.round(
                        (languageMetrics.originalVsTranslated.originalRead / totalRead) * 100
                      )
                    : 0;
                const transPct = totalRead > 0 ? 100 - origPct : 0;

                return (
                  <div className="space-y-3">
                    <div className="flex h-4 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                      <div
                        className="bg-[var(--accent-secondary)] transition-all duration-500"
                        style={{ width: `${origPct}%` }}
                        title={`${languageMetrics.originalVsTranslated.originalRead} Read in Original`}
                      />
                      <div
                        className="bg-[var(--accent-gold)] transition-all duration-500"
                        style={{ width: `${transPct}%` }}
                        title={`${languageMetrics.originalVsTranslated.translatedRead} Read in Translation`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-mono-tabular">
                      <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                          Read in Original
                        </span>
                        <div className="text-lg font-bold text-[var(--text-ink)] mt-0.5">
                          {languageMetrics.originalVsTranslated.originalRead}
                        </div>
                        <span className="text-[11px] text-[var(--accent-secondary)] font-semibold">
                          {origPct}% of read
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase block">
                          In Translation
                        </span>
                        <div className="text-lg font-bold text-[var(--text-ink)] mt-0.5">
                          {languageMetrics.originalVsTranslated.translatedRead}
                        </div>
                        <span className="text-[11px] text-[var(--accent-gold)] font-semibold">
                          {transPct}% of read
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 text-[11px] text-[var(--text-muted)] font-mono-tabular">
                      On TBR:{' '}
                      <strong>{languageMetrics.originalVsTranslated.originalTBR}</strong> originals ·{' '}
                      <strong>{languageMetrics.originalVsTranslated.translatedTBR}</strong> translations
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Side-by-side Language Comparison: Reading In vs. Original Works */}
            <div className="lg:col-span-2 p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Reading Languages */}
              <div>
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-secondary)] font-bold mb-3 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Languages You Read In</span>
                </div>
                <div className="space-y-2.5">
                  {languageMetrics.byEditionLanguage.slice(0, 5).map((ed) => (
                    <div key={ed.lang} className="text-xs font-mono-tabular">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[var(--text-ink)]">{ed.label}</span>
                        <span className="text-[var(--text-muted)]">
                          {ed.readCount} read / {ed.totalCount} total
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent-secondary)] rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (ed.totalCount / books.length) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Original Languages of Works */}
              <div>
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-gold)] font-bold mb-3 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" />
                  <span>Original Work Origins</span>
                </div>
                <div className="space-y-2.5">
                  {languageMetrics.byOriginalLanguage.slice(0, 6).map((orig) => (
                    <div key={orig.lang} className="text-xs font-mono-tabular">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[var(--text-ink)]">{orig.label}</span>
                        <span className="text-[var(--text-muted)]">
                          {orig.readCount} read / {orig.totalCount} total
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent-gold)] rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (orig.totalCount / books.length) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Translation Bridges & Translators Leaderboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Translation Bridges */}
            <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-secondary)] font-bold mb-3">
                Top Translation Bridges
              </div>
              <div className="space-y-2.5">
                {languageMetrics.translationFlows
                  .filter((f) => f.isTranslation)
                  .slice(0, 5)
                  .map((flow, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-mono-tabular font-bold text-sm text-[var(--text-ink)]">
                          {flow.flow}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] italic truncate max-w-xs mt-0.5">
                          {flow.examples.join(', ')}
                        </div>
                      </div>
                      <div className="text-right font-mono-tabular shrink-0">
                        <span className="font-bold text-[var(--text-ink)]">{flow.count}</span>{' '}
                        <span className="text-[10px] text-[var(--text-muted)]">
                          works ({flow.readCount} read)
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Most-Read Translators Leaderboard */}
            <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-gold)] font-bold mb-3">
                Most-Read Translators Leaderboard
              </div>
              {languageMetrics.topTranslators.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic">
                  Translator data is inferred when foreign works include accredited contributors.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {languageMetrics.topTranslators.slice(0, 5).map((trans, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
                          {trans.name}
                        </span>
                        <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] mt-0.5">
                          {trans.languages.slice(0, 2).join(' · ')}
                        </div>
                      </div>
                      <div className="font-mono-tabular font-bold text-xs text-[var(--accent-gold)]">
                        {trans.count} volume{trans.count > 1 ? 's' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 5. v0.2 Flagship B: Format-Calibrated Reading Velocity */}
      <section aria-labelledby="format-velocity-heading" className="space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2
              id="format-velocity-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              Format-Calibrated Reading Velocity
            </h2>
          </div>
          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
            Comparative reading speeds calibrated across distinct literary media
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {formatVelocityList.map((fv) => (
            <div
              key={fv.format}
              className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-primary)] font-bold">
                    {fv.label}
                  </span>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    {fv.booksCompleted} read
                  </span>
                </div>

                <div className="my-2">
                  <div className="font-mono-tabular font-bold text-3xl text-[var(--text-ink)]">
                    {fv.avgPagesPerDay}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    pages / day average
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--border-ledger)]/60 text-xs font-mono-tabular text-[var(--text-muted)] space-y-1">
                  <div className="flex justify-between">
                    <span>Median finish:</span>
                    <strong className="text-[var(--text-ink)]">{fv.medianDaysToFinish} days</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total read pages:</span>
                    <strong className="text-[var(--text-ink)]">
                      {fv.totalPages.toLocaleString()} pp
                    </strong>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 text-[10px] text-[var(--text-muted)] italic">
                {fv.format === 'comic-manga'
                  ? 'Visual pacing allows swift compendium reading'
                  : fv.format === 'academic-ref'
                  ? 'Dense notation & conceptual analysis requires deliberate pacing'
                  : fv.format === 'short-essay'
                  ? 'Brisk standalone essays & short fictions completed in sprint sessions'
                  : 'Standard narrative immersion across long-form fiction and memoirs'}
              </div>
            </div>
          ))}
        </div>

        {/* Fastest Sprints, Longest Burns & Re-Reads */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {/* Fastest Sprints */}
          <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-primary)] font-bold mb-3">
              <Zap className="w-3.5 h-3.5" />
              <span>Fastest Sprints</span>
            </div>
            <div className="space-y-3">
              {fastestSprints.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectBook(item.book)}
                  className="p-2.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--accent-primary)]/40 transition-colors cursor-pointer group"
                >
                  <div className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] truncate">
                    {item.book.cleanTitle || item.book.title}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] mt-1">
                    <span>{item.durationDays} day{item.durationDays > 1 ? 's' : ''}</span>
                    <span className="text-[var(--accent-primary)] font-semibold">
                      ~{item.pagesPerDay} pp/day
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Longest Slow Burns */}
          <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-secondary)] font-bold mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>Longest Slow Burns</span>
            </div>
            <div className="space-y-3">
              {longestBurns.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectBook(item.book)}
                  className="p-2.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--accent-secondary)]/40 transition-colors cursor-pointer group"
                >
                  <div className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-secondary)] truncate">
                    {item.book.cleanTitle || item.book.title}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] mt-1">
                    <span>{item.durationDays} days under study</span>
                    <span>{item.book.pageCount} pp</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Re-Read Hall of Fame */}
          <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-gold)] font-bold mb-3">
              <Flame className="w-3.5 h-3.5" />
              <span>Re-Read Hall of Fame</span>
            </div>
            {reReadHallOfFame.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">
                No explicit re-read volumes recorded.
              </p>
            ) : (
              <div className="space-y-3">
                {reReadHallOfFame.slice(0, 4).map((book) => (
                  <div
                    key={book.id}
                    onClick={() => onSelectBook(book)}
                    className="p-2.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--accent-gold)]/40 transition-colors cursor-pointer group"
                  >
                    <div className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-gold)] truncate">
                      {book.cleanTitle || book.title}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] mt-1">
                      <span>{book.author}</span>
                      <span className="font-semibold text-[var(--accent-gold)]">
                        {book.readCount || 2}× Read
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. 2,800-Year Publication Era Timeline */}
      <section aria-labelledby="timeline-heading" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--accent-gold)]" />
            <h2
              id="timeline-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              2,800-Year Temporal Horizons
            </h2>
          </div>
          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
            Comparing completed works vs. queued TBR across classical to modern eras
          </span>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4">
          <div className="flex items-center gap-4 text-xs font-mono-tabular mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[var(--accent-secondary)]" />
              <span className="text-[var(--text-ink)]">Completed (Read)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[var(--accent-gold)]/60" />
              <span className="text-[var(--text-ink)]">Queued (To-Read)</span>
            </div>
          </div>

          <div className="space-y-4">
            {eraTimeline.map((era) => {
              const maxTotal = Math.max(...eraTimeline.map((e) => e.total), 1);
              const readPct = (era.readCount / maxTotal) * 100;
              const toReadPct = (era.toReadCount / maxTotal) * 100;

              return (
                <div key={era.id} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-mono-tabular">
                    <span className="font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
                      {era.label}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {era.readCount} read · {era.toReadCount} to-read ({era.total} total)
                    </span>
                  </div>

                  <div className="flex h-3 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                    <div
                      className="bg-[var(--accent-secondary)] transition-all duration-500"
                      style={{ width: `${readPct}%` }}
                      title={`${era.readCount} Read`}
                    />
                    <div
                      className="bg-[var(--accent-gold)]/60 transition-all duration-500"
                      style={{ width: `${toReadPct}%` }}
                      title={`${era.toReadCount} To-Read`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. Author Loyalty Leaderboard */}
      <section aria-labelledby="authors-heading" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[var(--accent-gold)]" />
            <h2
              id="authors-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              Author Loyalty Leaderboard
            </h2>
          </div>
          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
            Ranked by total page volume and completed works
          </span>
        </div>

        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs font-sans-ui">
            <thead className="bg-[var(--bg-surface)] border-b border-[var(--border-ledger)] uppercase tracking-wider text-[11px] font-mono-tabular text-[var(--text-muted)]">
              <tr>
                <th className="py-3 px-4">Rank</th>
                <th className="py-3 px-4">Author</th>
                <th className="py-3 px-3 text-right">Volumes Read</th>
                <th className="py-3 px-4 text-right">Pages Read</th>
                <th className="py-3 px-3 text-center">Avg Rating</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-ledger)]/60">
              {authorLeaderboard.map((auth, idx) => (
                <tr key={idx} className="hover:bg-[var(--bg-surface)]/60 transition-colors">
                  <td className="py-3 px-4 font-mono-tabular font-bold text-[var(--text-muted)]">
                    {idx === 0
                      ? '🥇 01'
                      : idx === 1
                      ? '🥈 02'
                      : idx === 2
                      ? '🥉 03'
                      : `0${idx + 1}`}
                  </td>
                  <td className="py-3 px-4 font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
                    {auth.author}
                  </td>
                  <td className="py-3 px-3 text-right font-mono-tabular text-[var(--text-ink)] font-semibold">
                    {auth.booksRead}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-[var(--text-ink)]">
                    {auth.pagesRead.toLocaleString()} pp
                  </td>
                  <td className="py-3 px-3 text-center font-mono-tabular text-[var(--accent-gold)] font-bold">
                    {auth.avgRating > 0 ? `${auth.avgRating.toFixed(2)}★` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {auth.isFollowed && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-semibold">
                        Followed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 8. DNF Forensics Table (The Abandoned Shelf) */}
      <section aria-labelledby="dnf-heading" className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2
              id="dnf-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              DNF Forensics: The Abandoned Shelf
            </h2>
            <span className="text-xs font-mono-tabular px-2 py-0.5 rounded bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-semibold">
              {dnfBooks.length} volumes
            </span>
          </div>
          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
            Volumes consciously relinquished with exit notes
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dnfBooks.map((book) => (
            <div
              key={book.id}
              onClick={() => onSelectBook(book)}
              className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs hover:border-[var(--accent-primary)] transition-colors cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-serif-editorial text-base font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] truncate">
                    {book.cleanTitle || book.title}
                  </h3>
                  <span className="text-xs font-mono-tabular text-[var(--text-muted)] shrink-0">
                    {book.pageCount ? `${book.pageCount} pp.` : ''}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] font-medium">by {book.author}</p>

                {book.myReview ? (
                  <p className="mt-3 text-xs text-[var(--text-muted)] italic border-l-2 border-[var(--accent-primary)]/40 pl-2.5 line-clamp-3">
                    “{book.myReview.replace(/<[^>]+>/g, '')}”
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--text-muted)]/60 italic">
                    Relinquished without written exit statement.
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-ledger)]/60 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
                <span>
                  Abandoned {book.dateRead ? book.dateRead.slice(0, 10) : 'Date unrecorded'}
                </span>
                <span className="text-[var(--accent-primary)] font-semibold group-hover:underline">
                  Inspect Dossier →
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 9. Circadian Reading Rhythm & Platform Split */}
      {circadian && (
        <section aria-labelledby="circadian-heading" className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--accent-secondary)]" />
              <h2
                id="circadian-heading"
                className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
              >
                Circadian Reading Rhythm
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              Peak: {circadian.peakHour}:00 · Quietest: {circadian.quietestHour}:00
            </span>
          </div>

          <div className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-6">
            {/* 24-Hour Bar Chart */}
            <div>
              <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-3">
                24-Hour Reading &amp; Login Event Distribution (00:00 – 23:00)
              </div>
              <div className="flex items-end gap-1.5 h-36 pt-4">
                {circadian.hourlyDistribution.map((bucket) => {
                  const maxCount = Math.max(
                    ...circadian.hourlyDistribution.map((b) => b.count),
                    1
                  );
                  const heightPct = Math.round((bucket.count / maxCount) * 100);
                  const isPeak = bucket.hour === circadian.peakHour;

                  return (
                    <div
                      key={bucket.hour}
                      className="flex-1 flex flex-col items-center gap-1 group relative"
                    >
                      <div className="w-full flex items-end justify-center h-28">
                        <div
                          style={{ height: `${Math.max(4, heightPct)}%` }}
                          className={`w-full rounded-t transition-all ${
                            isPeak
                              ? 'bg-[var(--accent-primary)]'
                              : 'bg-[var(--accent-secondary)]/50 group-hover:bg-[var(--accent-secondary)]'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                        {bucket.hour % 3 === 0 ? bucket.hour : ''}
                      </span>

                      {/* Tooltip */}
                      <div className="absolute -top-7 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-surface)] border border-[var(--border-ledger)] px-1.5 py-0.5 rounded text-[10px] font-mono-tabular text-[var(--text-ink)] whitespace-nowrap z-10 shadow-xs">
                        {bucket.hour}:00 — {bucket.count} events
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Platform breakdown */}
            {circadian.platformBreakdown && (
              <div className="pt-4 border-t border-[var(--border-ledger)] flex flex-wrap items-center gap-4 text-xs font-mono-tabular">
                <span className="text-[var(--text-muted)] font-semibold uppercase">
                  Platform Split:
                </span>
                {Object.entries(circadian.platformBreakdown).map(([platform, count]) => (
                  <div
                    key={platform}
                    className="px-2.5 py-1 rounded bg-[var(--bg-surface)] text-[var(--text-ink)] border border-[var(--border-ledger)]"
                  >
                    <strong>{platform}:</strong> {count.toLocaleString()} sessions
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 10. Annual Goals, 12 Challenge Badges Trophy Case, & Favorite Genres */}
      <section aria-labelledby="trophy-heading" className="space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[var(--accent-gold)]" />
            <h2
              id="trophy-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              Trophy Case &amp; Reading Milestones
            </h2>
          </div>
          <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
            Official reading goals &amp; challenge achievement badges
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Achievement Badges */}
          <div className="lg:col-span-2 p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
            <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-gold)] font-bold mb-4 flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              <span>Challenge Badges ({achievements.length} Medallions Earned)</span>
            </div>

            {achievements.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">
                No challenge badges in imported archive.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {achievements.map((badge, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-center flex flex-col items-center justify-center hover:border-[var(--accent-gold)] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] flex items-center justify-center mb-2 border border-[var(--accent-gold)]/30 shadow-xs">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] line-clamp-2">
                      {badge.achievementName}
                    </div>
                    <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] mt-1">
                      {badge.earnDate ? badge.earnDate.slice(0, 10) : 'Earned'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Goals & Favorite Genres */}
          <div className="space-y-6">
            {goals.length > 0 && (
              <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-secondary)] font-bold mb-3">
                  Annual Reading Challenge
                </div>
                {goals.map((goal, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-serif-editorial font-bold text-base text-[var(--text-ink)]">
                        Target: {goal.goalValue} Volumes
                      </span>
                      {goal.hasBeenCongratulated && (
                        <span className="px-2 py-0.5 rounded bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] text-[10px] font-mono-tabular font-bold">
                          ✓ Achieved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                      Logged {goal.createDate.slice(0, 10)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {favoriteGenres && (
              <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-3">
                  Affinity Genres &amp; Subjects
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {favoriteGenres.genres?.map((g, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-md bg-[var(--bg-surface)] text-xs text-[var(--text-ink)] border border-[var(--border-ledger)] font-medium"
                    >
                      {g}
                    </span>
                  ))}
                  {favoriteGenres.additionalGenres?.map((g, idx) => (
                    <span
                      key={`add-${idx}`}
                      className="px-2.5 py-1 rounded-md bg-[var(--bg-surface)]/60 text-xs text-[var(--text-muted)] border border-[var(--border-ledger)]"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
