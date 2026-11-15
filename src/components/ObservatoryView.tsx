import React, { useMemo, useState } from 'react';
import { Book, EnrichmentCacheMap, LibraryBundle, UserLocalState } from '../types/library';
import {
  computeLanguagePassportMetrics,
  computeFormatVelocity,
  computeContrarianMetrics,
  computeTranslatorLoyalty,
  computeAnnualReadingReviews,
} from '../lib/analytics/engine';
import { getGoodreadsBookUrl, getGoodreadsAuthorUrl } from '../lib/links/goodreadsLinks';
import {
  Compass,
  Star,
  Award,
  Clock,
  Calendar,
  Zap,
  Flame,
  Trophy,
  Globe,
  Languages,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ExternalLink,
  CalendarDays,
} from 'lucide-react';

interface ObservatoryViewProps {
  bundle: LibraryBundle;
  onSelectBook: (book: Book) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
  onOpenEnrichModal: () => void;
  onOpenBookplate?: () => void;
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

  // 1. Annual Reading Reviews & Multi-Year Trends
  const [selectedReviewYear, setSelectedReviewYear] = useState<number>(2026);

  const annualReviews = useMemo(() => {
    try {
      return computeAnnualReadingReviews(bundle, userState, enrichmentCache);
    } catch (e) {
      console.warn('computeAnnualReadingReviews fallback:', e);
      return [];
    }
  }, [bundle, userState, enrichmentCache]);

  const activeReview = useMemo(
    () => annualReviews.find((r) => r.year === selectedReviewYear) || annualReviews[0],
    [annualReviews, selectedReviewYear]
  );

  // 2. Rating Distribution & 5-Star Canon
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

    const avg = totalRated > 0 ? (sumRating / totalRated).toFixed(2) : '—';
    return { dist, totalRated, avg };
  }, [books]);

  const fiveStarCanon = useMemo(() => {
    return books.filter((b) => b.myRating === 5);
  }, [books]);

  // 3. The Contrarian Index
  const contrarianMetrics = useMemo(() => {
    try {
      return computeContrarianMetrics(bundle, enrichmentCache);
    } catch (e) {
      console.warn('computeContrarianMetrics fallback:', e);
      return null;
    }
  }, [bundle, enrichmentCache]);

  // 4. Translation & Language Passport Matrix
  const languageMetrics = useMemo(() => {
    try {
      return computeLanguagePassportMetrics(bundle, userState, enrichmentCache);
    } catch (e) {
      console.warn('computeLanguagePassportMetrics fallback:', e);
      return null;
    }
  }, [bundle, userState, enrichmentCache]);

  const translatorLoyalty = useMemo(() => {
    try {
      return computeTranslatorLoyalty(bundle, userState);
    } catch (e) {
      console.warn('computeTranslatorLoyalty fallback:', e);
      return [];
    }
  }, [bundle, userState]);

  // 5. Format-Calibrated Reading Velocity & Session Forensics
  const formatVelocityList = useMemo(() => {
    try {
      return computeFormatVelocity(bundle, userState);
    } catch (e) {
      console.warn('computeFormatVelocity fallback:', e);
      return [];
    }
  }, [bundle, userState]);

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

  // 6. Author Loyalty Leaderboard
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

    return Array.from(authorMap.values())
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
  }, [books, bundle.followedAuthors]);

  const totalBookDenom = Math.max(1, books.length);

  return (
    <div className="space-y-12 pb-20">
      {/* Header Banner */}
      <section className="relative p-6 sm:p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent-secondary)]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] border border-[var(--accent-secondary)]/20 text-xs font-semibold mb-3">
            <Compass className="w-3.5 h-3.5" />
            <span>Reading Analytics</span>
          </div>

          <h1 className="font-serif-editorial text-2xl sm:text-4xl font-bold tracking-tight text-[var(--text-ink)]">
            The Observatory
          </h1>

          <p className="font-serif-editorial text-base sm:text-lg italic text-[var(--text-muted)] mt-2 leading-relaxed">
            Annual cadence, rating tendencies, translation flows, reading velocity, and author
            depth across your archive.
          </p>
        </div>
      </section>

      {/* SECTION 1: Annual Reading Reviews (Multi-Year Horizons) */}
      {annualReviews.length > 0 && activeReview && (
        <section aria-labelledby="annual-reviews-heading" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[var(--accent-primary)]" />
              <div>
                <h2
                  id="annual-reviews-heading"
                  className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
                >
                  Annual Reading Reviews
                </h2>
                <p className="text-xs text-[var(--text-muted)] font-serif-editorial">
                  Year-by-year volume, page intake, pacing extremes, and 5-star favorites
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] self-start sm:self-auto">
              {annualReviews.map((rev) => (
                <button
                  key={rev.year}
                  type="button"
                  onClick={() => setSelectedReviewYear(rev.year)}
                  className={`px-3 py-1 rounded text-xs font-mono-tabular transition-all cursor-pointer ${
                    activeReview.year === rev.year
                      ? 'bg-[var(--accent-primary)] text-white font-bold shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  {rev.year}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-1">
                <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)]">
                  Volumes Read
                </div>
                <div className="text-2xl font-bold font-serif-editorial text-[var(--text-ink)]">
                  {activeReview.volumesRead}
                </div>
                <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  in {activeReview.year}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-1">
                <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)]">
                  Pages Read
                </div>
                <div className="text-2xl font-bold font-serif-editorial text-[var(--text-ink)]">
                  {activeReview.pagesRead.toLocaleString()}
                </div>
                <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  {activeReview.medianDaysPerBook
                    ? `~${activeReview.medianDaysPerBook} days/vol`
                    : 'Steady intake'}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-1">
                <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)]">
                  Average Rating
                </div>
                <div className="text-2xl font-bold font-serif-editorial text-[var(--accent-gold)] flex items-center gap-1">
                  <Star className="w-5 h-5 fill-[var(--accent-gold)]" />
                  {activeReview.averageRating ? `${activeReview.averageRating}★` : '—'}
                </div>
                <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  {activeReview.canon5StarBooks.length} titles in 5★ canon
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-1">
                <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)]">
                  Median Pace
                </div>
                <div className="text-2xl font-bold font-serif-editorial text-[var(--text-ink)]">
                  {activeReview.medianDaysPerBook
                    ? `~${activeReview.medianDaysPerBook} days`
                    : '—'}
                </div>
                <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  {activeReview.volumesRead > 0
                    ? `${Math.round(activeReview.pagesRead / activeReview.volumesRead)} pp / book avg`
                    : 'Per volume'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pacing Extremes */}
              <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] space-y-3">
                <h3 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] uppercase tracking-wide">
                  Pacing Extremes · {activeReview.year}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono-tabular">
                  {activeReview.fastestSprintBook ? (
                    <div
                      onClick={() =>
                        onSelectBookById(
                          activeReview.fastestSprintBook!.id,
                          activeReview.fastestSprintBook!.title
                        )
                      }
                      className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] transition-all cursor-pointer space-y-1"
                    >
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                        Quickest Read
                      </div>
                      <div className="font-serif-editorial font-bold text-[var(--text-ink)] truncate">
                        {activeReview.fastestSprintBook.title}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {activeReview.fastestSprintBook.author} · {activeReview.fastestSprintBook.pageCount} pp
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[var(--text-muted)] italic text-xs">
                      No sprint recorded
                    </div>
                  )}

                  {activeReview.deepestSavorBook ? (
                    <div
                      onClick={() =>
                        onSelectBookById(
                          activeReview.deepestSavorBook!.id,
                          activeReview.deepestSavorBook!.title
                        )
                      }
                      className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] transition-all cursor-pointer space-y-1"
                    >
                      <div className="text-[10px] text-[var(--accent-primary)] font-bold uppercase tracking-wider">
                        Deepest Savor
                      </div>
                      <div className="font-serif-editorial font-bold text-[var(--text-ink)] truncate">
                        {activeReview.deepestSavorBook.title}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {activeReview.deepestSavorBook.author} · {activeReview.deepestSavorBook.pageCount} pp
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[var(--text-muted)] italic text-xs">
                      No savor recorded
                    </div>
                  )}
                </div>
              </div>

              {/* 5-Star Canon of Year */}
              <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] uppercase tracking-wide">
                    5★ Canon of {activeReview.year}
                  </h3>
                  <span className="text-xs font-mono-tabular text-[var(--accent-gold)] font-bold">
                    {activeReview.canon5StarBooks.length} works
                  </span>
                </div>

                {activeReview.canon5StarBooks.length > 0 ? (
                  <div className="space-y-1.5">
                    {activeReview.canon5StarBooks.slice(0, 4).map((book) => (
                      <div
                        key={book.id}
                        onClick={() => onSelectBookById(book.id, book.title)}
                        className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)] transition-all cursor-pointer flex items-center justify-between gap-2 group"
                      >
                        <div className="min-w-0">
                          <div className="font-serif-editorial font-bold text-xs text-[var(--text-ink)] group-hover:text-[var(--accent-gold)] truncate transition-colors">
                            {book.title}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-serif-editorial truncate">
                            {book.author}
                          </div>
                        </div>
                        <span className="text-xs font-mono-tabular text-[var(--accent-gold)] font-bold shrink-0">
                          ★★★★★
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] italic font-serif-editorial">
                    No 5-star ratings recorded in {activeReview.year}.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 2: Personal Critical Distribution, 5-Star Canon & The Contrarian Index */}
      <section aria-labelledby="ratings-heading" className="space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[var(--accent-gold)]" />
            <h2
              id="ratings-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              Critical Distribution &amp; The Contrarian Index
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

          {/* 5-Star Canon Chips */}
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
                {fiveStarCanon.map((book) => {
                  const grLink = getGoodreadsBookUrl(book);
                  return (
                    <div
                      key={book.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectBook(book)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectBook(book);
                        }
                      }}
                      className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--accent-gold)]/15 border border-[var(--border-ledger)] hover:border-[var(--accent-gold)] transition-all cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)]"
                    >
                      <span className="font-serif-editorial text-xs font-semibold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors">
                        {book.cleanTitle || book.title}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                        · {book.author.split(' ').pop()}
                      </span>
                      <a
                        href={grLink.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={`Open ${grLink.label} on Goodreads`}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-opacity"
                        aria-label={`Open ${book.cleanTitle || book.title} on Goodreads`}
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border-ledger)] text-xs text-[var(--text-muted)] italic">
              These {fiveStarCanon.length} works represent your highest personal standard.
            </div>
          </div>
        </div>

        {/* Contrarian Index Sub-block */}
        {!contrarianMetrics || contrarianMetrics.enrichedRatedCount === 0 ? (
          <div className="p-8 rounded-xl bg-[var(--bg-card)] border border-dashed border-[var(--border-ledger)] text-center space-y-3">
            <Scale className="w-10 h-10 text-[var(--accent-primary)]/60 mx-auto" />
            <h3 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
              Enrich Library to Unlock Contrarian Analytics
            </h3>
            <p className="text-xs text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed">
              Discover how your critical evaluations diverge from Goodreads &amp; Open Library
              consensus: Sacred Cows Slain vs. Hidden Champions.
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
            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-wrap items-center justify-between gap-4 text-xs font-mono-tabular">
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                  Contrarian Divergence ({contrarianMetrics.enrichedRatedCount} compared):
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
                  ? 'Generally more demanding and rigorous than community consensus'
                  : 'Generally more generous and appreciative than community consensus'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sacred Cows Slain */}
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
                    Highly acclaimed books where your personal rating was sharply harsher.
                  </p>

                  <div className="space-y-2.5">
                    {contrarianMetrics.sacredCowsSlain.slice(0, 5).map((item, idx) => {
                      const grLink = getGoodreadsBookUrl(item.book);
                      return (
                        <div
                          key={idx}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectBook(item.book)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectBook(item.book);
                            }
                          }}
                          className="p-3 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--accent-primary)]/40 transition-colors cursor-pointer group flex items-center justify-between gap-3 focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] truncate">
                                {item.book.cleanTitle || item.book.title}
                              </h4>
                              <a
                                href={grLink.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={`Open ${grLink.label} on Goodreads`}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-opacity shrink-0"
                                aria-label={`Open ${item.book.cleanTitle || item.book.title} on Goodreads`}
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
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
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Hidden Champions */}
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
                    Personal favorites you rated significantly higher than the crowd.
                  </p>

                  <div className="space-y-2.5">
                    {contrarianMetrics.hiddenChampions.slice(0, 5).map((item, idx) => {
                      const grLink = getGoodreadsBookUrl(item.book);
                      return (
                        <div
                          key={idx}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectBook(item.book)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectBook(item.book);
                            }
                          }}
                          className="p-3 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--accent-secondary)]/40 transition-colors cursor-pointer group flex items-center justify-between gap-3 focus:outline-none focus:ring-1 focus:ring-[var(--accent-secondary)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-serif-editorial text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-secondary)] truncate">
                                {item.book.cleanTitle || item.book.title}
                              </h4>
                              <a
                                href={grLink.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title={`Open ${grLink.label} on Goodreads`}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--text-muted)] hover:text-[var(--accent-secondary)] transition-opacity shrink-0"
                                aria-label={`Open ${item.book.cleanTitle || item.book.title} on Goodreads`}
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
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
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: Translation & Language Passport Matrix */}
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

            {/* Side-by-side Language Comparison */}
            <div className="lg:col-span-2 p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                            width: `${Math.min(100, Math.round((ed.totalCount / totalBookDenom) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

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
                            width: `${Math.min(100, Math.round((orig.totalCount / totalBookDenom) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

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

            {/* Translator Loyalty & Conduits */}
            <div className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-gold)] font-bold flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5" />
                  <span>Translator Loyalty &amp; Conduits</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] italic">
                  Trusted Voices Across Tongues
                </span>
              </div>
              {translatorLoyalty.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] italic">
                  Translator data appears when foreign works include accredited contributors.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {translatorLoyalty.slice(0, 5).map((trans, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <a
                            href={getGoodreadsAuthorUrl(trans.translator)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-serif-editorial font-bold text-sm text-[var(--text-ink)] hover:text-[var(--accent-primary)] transition-colors truncate inline-flex items-center gap-1 group"
                            title={`Search ${trans.translator} on Goodreads`}
                          >
                            <span>{trans.translator}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                          </a>
                          {trans.translationFlows.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono-tabular bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] shrink-0">
                              {trans.translationFlows.slice(0, 2).join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="text-right font-mono-tabular shrink-0 text-xs">
                          <span className="font-bold text-[var(--text-ink)]">
                            {trans.readCount} read
                          </span>
                          {trans.toReadCount > 0 && (
                            <span className="text-[10px] text-[var(--accent-secondary)] ml-1">
                              (+{trans.toReadCount} TBR)
                            </span>
                          )}
                          {trans.avgRating !== null && (
                            <span className="text-[var(--accent-gold)] font-bold ml-1.5">
                              · {trans.avgRating.toFixed(2)} ★
                            </span>
                          )}
                        </div>
                      </div>
                      {trans.sampleTitles.length > 0 && (
                        <div className="text-[11px] text-[var(--text-muted)] italic truncate">
                          &ldquo;{trans.sampleTitles.slice(0, 2).join('”, “')}&rdquo;
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 4: Format-Calibrated Reading Velocity & 2,800-Year Temporal Horizons */}
      <section aria-labelledby="format-velocity-heading" className="space-y-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2
                id="format-velocity-heading"
                className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
              >
                Reading Velocity &amp; Pacing
              </h2>
            </div>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
              Comparative reading speeds across distinct formats
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
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        </div>

        {/* 2,800-Year Publication Era Timeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--accent-gold)]" />
              <h3 className="font-serif-editorial text-lg sm:text-xl font-bold tracking-tight text-[var(--text-ink)]">
                2,800-Year Temporal Horizons
              </h3>
            </div>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
              Completed works vs. queued TBR across classical to modern eras
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
        </div>
      </section>

      {/* SECTION 5: Author Loyalty Leaderboard */}
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
                      ? '01'
                      : idx === 1
                      ? '02'
                      : idx === 2
                      ? '03'
                      : idx < 9
                      ? `0${idx + 1}`
                      : `${idx + 1}`}
                  </td>
                  <td className="py-3 px-4 font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
                    <a
                      href={getGoodreadsAuthorUrl(auth.author)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline hover:text-[var(--accent-primary)] transition-colors"
                    >
                      {auth.author}
                    </a>
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
    </div>
  );
};
