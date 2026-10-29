import React, { useState, useMemo } from 'react';
import {
  Book,
  BookFormat,
  EnrichmentCacheMap,
  LanguageCode,
  LibraryBundle,
  RecommendationItem,
  UserLocalState,
} from '../types/library';
import {
  OracleFilters,
  OracleCandidate,
  getOracleCandidates,
  getUnfinishedSeries,
  getTrustedAuthorPicks,
  computeFormatVelocity,
} from '../lib/analytics/engine';
import {
  classifyBookLanguageAndFormat,
  FORMAT_LABELS,
  LANGUAGE_LABELS,
} from '../lib/classifiers/languageAndFormat';
import { formatPublicationYear } from '../lib/formatters';
import {
  Sparkles,
  Shuffle,
  BookOpen,
  Star,
  Clock,
  Compass,
  ArrowRight,
  CheckCircle2,
  Layers,
  Users,
  Globe,
  Languages,
  Zap,
} from 'lucide-react';

interface OracleViewProps {
  bundle: LibraryBundle;
  onSelectBook: (book: Book) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
  onOpenEnrichModal: () => void;
}

export const OracleView: React.FC<OracleViewProps> = ({
  bundle,
  onSelectBook,
  onSelectBookById,
  userState,
  enrichmentCache,
  onOpenEnrichModal,
}) => {
  // Oracle Core Filters
  const [commitment, setCommitment] = useState<'any' | 'sprint' | 'deep' | 'epic'>('any');
  const [dust, setDust] = useState<'any' | 'forgotten' | 'recent'>('any');
  const [era, setEra] = useState<
    'any' | 'classical' | 'premodern' | 'nineteenth' | 'twentieth' | 'contemporary'
  >('any');

  // v0.2 Language & Format filters
  const [editionLanguage, setEditionLanguage] = useState<LanguageCode | 'any'>('any');
  const [originalLanguage, setOriginalLanguage] = useState<LanguageCode | 'any'>('any');
  const [translationMode, setTranslationMode] = useState<'any' | 'original' | 'translated'>('any');
  const [format, setFormat] = useState<BookFormat | 'any'>('any');

  const [isDealing, setIsDealing] = useState(false);
  const [dealSeed, setDealSeed] = useState(0);

  // Format velocity cache
  const velocityMap = useMemo(() => {
    const list = computeFormatVelocity(bundle, userState);
    const map: Record<BookFormat, (typeof list)[0]> = {} as any;
    for (const item of list) {
      map[item.format] = item;
    }
    return map;
  }, [bundle, userState]);

  // Scored candidates
  const candidates: OracleCandidate[] = useMemo(() => {
    try {
      const filters: OracleFilters = {
        commitment,
        dust,
        era,
        editionLanguage,
        originalLanguage,
        translationMode,
        format,
      };
      const list = getOracleCandidates(bundle, filters, userState, enrichmentCache);
      if (list && list.length > 0) return list.slice(0, 3);
    } catch (e) {
      console.warn('getOracleCandidates fallback:', e);
    }

    // Graceful fallback TBR matching
    const toRead = bundle.books.filter((b) => b.exclusiveShelf === 'to-read');
    return toRead.slice(0, 3).map((book) => ({
      book,
      score: 50,
      reasons: [
        'Top of your personal TBR queue',
        book.averageRating
          ? `Community consensus ${book.averageRating.toFixed(2)}★`
          : 'Awaiting your rating',
      ],
      estimatedHours: Math.round(((book.pageCount || 300) * 1.5) / 60),
    }));
  }, [
    bundle,
    commitment,
    dust,
    era,
    editionLanguage,
    originalLanguage,
    translationMode,
    format,
    userState,
    enrichmentCache,
    dealSeed,
  ]);

  // Unfinished series
  const unfinishedSeries = useMemo(() => {
    try {
      return getUnfinishedSeries(bundle) || [];
    } catch (e) {
      console.warn('getUnfinishedSeries fallback:', e);
      return [];
    }
  }, [bundle]);

  // Trusted author picks
  const trustedAuthorPicks = useMemo(() => {
    try {
      return getTrustedAuthorPicks(bundle) || [];
    } catch (e) {
      console.warn('getTrustedAuthorPicks fallback:', e);
      return [];
    }
  }, [bundle]);

  // Grouped recommendations
  const groupedRecommendations = useMemo(() => {
    const recs = bundle.recommendations || [];
    const map = new Map<
      string,
      { sourceBookTitle: string; sourceBookId: string | null; items: RecommendationItem[] }
    >();

    for (const rec of recs) {
      const key = rec.sourceBookTitle || 'Other Recommendations';
      if (!map.has(key)) {
        map.set(key, {
          sourceBookTitle: key,
          sourceBookId: rec.sourceBookId,
          items: [],
        });
      }
      map.get(key)!.items.push(rec);
    }

    return Array.from(map.values()).slice(0, 8);
  }, [bundle.recommendations]);

  const handleDeal = () => {
    setIsDealing(true);
    setTimeout(() => {
      setDealSeed((prev) => prev + 1);
      setIsDealing(false);
    }, 280);
  };

  return (
    <div className="space-y-12 pb-20">
      {/* 1. Header Banner & Filter Console */}
      <section className="relative p-6 sm:p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[var(--accent-primary)]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] border border-[var(--accent-gold)]/20 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Literary Divination &amp; TBR Engine</span>
          </div>

          <h1 className="font-serif-editorial text-2xl sm:text-4xl font-bold tracking-tight text-[var(--text-ink)]">
            The Oracle
          </h1>

          <p className="font-serif-editorial text-base sm:text-lg italic text-[var(--text-muted)] mt-2 leading-relaxed">
            “A library is a house of potential: an oracle waiting for the right question to unlock
            your next profound obsession.”
          </p>

          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-2">
            Configure your mood, time budget, reading language, and format constraints below. The
            Oracle consults your unread TBR catalog and deals 3 calibrated candidates with explicit
            bibliographic reasoning.
          </p>
        </div>

        {/* Filter Controls Row */}
        <div className="mt-6 pt-6 border-t border-[var(--border-ledger)]/80 space-y-4">
          {/* Row 1: Core constraints */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Commitment */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold shrink-0">
                Commitment:
              </span>
              <select
                value={commitment}
                onChange={(e) => setCommitment(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
              >
                <option value="any">Any Commitment</option>
                <option value="sprint">Brisk Sprint (&lt; 250 pp)</option>
                <option value="deep">Deep Immersion (250–500 pp)</option>
                <option value="epic">Monolithic Epic (500+ pp)</option>
              </select>
            </div>

            {/* Shelf Dust */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold shrink-0">
                Shelf Dust:
              </span>
              <select
                value={dust}
                onChange={(e) => setDust(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
              >
                <option value="any">Any Age on Shelf</option>
                <option value="forgotten">Forgotten Relics (&gt; 2 yrs ago)</option>
                <option value="recent">Recent Whims (Added recently)</option>
              </select>
            </div>

            {/* Era */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold shrink-0">
                Era:
              </span>
              <select
                value={era}
                onChange={(e) => setEra(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
              >
                <option value="any">Any Era</option>
                <option value="classical">Ancient &amp; Classical (&lt; 500)</option>
                <option value="premodern">Pre-Modern (500–1800)</option>
                <option value="nineteenth">19th Century (1801–1900)</option>
                <option value="twentieth">20th Century (1901–2000)</option>
                <option value="contemporary">Contemporary (21st C)</option>
              </select>
            </div>
          </div>

          {/* Row 2: v0.2 Language & Format Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Reading Language */}
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[var(--accent-secondary)] shrink-0" />
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold shrink-0">
                Reading In:
              </span>
              <select
                value={editionLanguage}
                onChange={(e) => setEditionLanguage(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
              >
                <option value="any">Any Language</option>
                <option value="EN">English (EN)</option>
                <option value="TR">Turkish (TR)</option>
                <option value="FR">French (FR)</option>
                <option value="DE">German (DE)</option>
                <option value="IT">Italian (IT)</option>
              </select>
            </div>

            {/* Original Work Language */}
            <div className="flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-[var(--accent-gold)] shrink-0" />
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold shrink-0">
                Original:
              </span>
              <select
                value={originalLanguage}
                onChange={(e) => setOriginalLanguage(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
              >
                <option value="any">Any Original</option>
                <option value="EN">English (EN)</option>
                <option value="TR">Turkish (TR)</option>
                <option value="FR">French (FR)</option>
                <option value="DE">German (DE)</option>
                <option value="RU">Russian (RU)</option>
                <option value="JA">Japanese (JA)</option>
                <option value="PL">Polish (PL)</option>
                <option value="ZH">Chinese (ZH)</option>
                <option value="GRC">Ancient Greek (GRC)</option>
                <option value="ES">Spanish (ES)</option>
                <option value="IT">Italian (IT)</option>
              </select>
            </div>

            {/* Translation Mode */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold shrink-0">
                Mode:
              </span>
              <select
                value={translationMode}
                onChange={(e) => setTranslationMode(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
              >
                <option value="any">Any Mode</option>
                <option value="original">Read in Original</option>
                <option value="translated">Read in Translation</option>
              </select>
            </div>

            {/* Format Selector */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono-tabular text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold shrink-0">
                Format:
              </span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] font-medium cursor-pointer"
              >
                <option value="any">Any Format</option>
                <option value="prose">Prose</option>
                <option value="comic-manga">Graphic Novel / Manga</option>
                <option value="short-essay">Short / Essay (&lt;80p)</option>
                <option value="academic-ref">Academic / Reference</option>
              </select>
            </div>
          </div>

          {/* Deal Button */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-[var(--text-muted)] italic">
              Example: &ldquo;Give me a book read in French under 250 pages&rdquo;
            </span>

            <button
              onClick={handleDeal}
              disabled={isDealing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent-primary)] hover:opacity-90 text-white text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-md active:scale-95"
            >
              <Shuffle className={`w-4 h-4 ${isDealing ? 'animate-spin' : ''}`} />
              <span>Deal 3 TBR Candidates</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Tactile 3-Card Deal Array */}
      <section aria-label="Oracle Candidates">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" />
            <h2 className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]">
              The Oracle&apos;s Hand
            </h2>
          </div>
          <span className="text-xs text-[var(--text-muted)] italic hidden sm:inline">
            Each candidate paired with format-calibrated reading pace &amp; enriched metadata
          </span>
        </div>

        {candidates.length === 0 ? (
          <div className="p-10 rounded-lg border border-dashed border-[var(--border-ledger)] text-center bg-[var(--bg-card)]">
            <Compass className="w-10 h-10 text-[var(--text-muted)]/50 mx-auto mb-2" />
            <p className="font-serif-editorial text-lg text-[var(--text-ink)]">
              No TBR candidates matched this exact combination.
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Try broadening your commitment, language, or format criteria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {candidates.map((cand, idx) => {
              const book: Book = cand.book;
              const reasons: string[] = cand.reasons || [];
              const pubYear = formatPublicationYear(
                book.originalPublicationYear || book.yearPublished
              );
              const override = userState?.bookOverrides?.[book.id];
              const enriched = enrichmentCache?.[book.id];
              const profile = classifyBookLanguageAndFormat(book, override, enriched);

              // Format-calibrated reading time calculation
              const pages = book.pageCount || 300;
              const vInfo = velocityMap[profile.format];
              const speedPagesPerDay = vInfo ? vInfo.avgPagesPerDay : 32;
              const estimatedDays = Math.max(1, Math.ceil(pages / speedPagesPerDay));
              const estimatedHours = Math.max(1, Math.round((pages * 1.5) / 60));

              const showCover = userState?.showCovers && enriched?.coverUrl;
              const communityRating =
                book.averageRating ?? enriched?.communityRating ?? null;

              return (
                <div
                  key={`${book.id}-${idx}-${dealSeed}`}
                  className={`animate-card-draw relative flex flex-col justify-between p-6 rounded-xl bg-[var(--bg-card)] border-2 border-[var(--border-ledger)] hover:border-[var(--accent-gold)] shadow-xs hover:shadow-lg transition-all duration-300 ${
                    idx === 1 ? 'md:-translate-y-2 border-[var(--accent-primary)]/40' : ''
                  }`}
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  {/* Top tarot badge & format-calibrated velocity */}
                  <div className="flex items-center justify-between text-xs font-mono-tabular mb-3">
                    <span className="px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] font-semibold border border-[var(--border-ledger)]">
                      Option 0{idx + 1}
                    </span>
                    <span
                      className="flex items-center gap-1 text-[var(--accent-primary)] font-medium"
                      title={`Based on your ${FORMAT_LABELS[profile.format]} velocity (~${speedPagesPerDay} pp/day)`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>
                        ~{estimatedDays}d ({estimatedHours}h)
                      </span>
                    </span>
                  </div>

                  <div>
                    {/* Series or Standalone */}
                    {book.seriesName ? (
                      <div className="text-xs font-semibold text-[var(--accent-secondary)] mb-1 truncate">
                        {book.seriesName} {book.seriesNumber ? `#${book.seriesNumber}` : ''}
                      </div>
                    ) : (
                      <div className="text-[11px] font-mono-tabular text-[var(--text-muted)] mb-1">
                        Standalone Work
                      </div>
                    )}

                    {/* Book Clean Title + Cover */}
                    <div className="flex gap-3 items-start mb-2">
                      {showCover && (
                        <img
                          src={enriched.coverUrl!}
                          alt={book.title}
                          className="w-12 h-18 object-cover rounded shadow-xs shrink-0 border border-[var(--border-ledger)]"
                          loading="lazy"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3
                          onClick={() => onSelectBook(book)}
                          className="font-serif-editorial text-lg sm:text-xl font-bold text-[var(--text-ink)] hover:text-[var(--accent-primary)] transition-colors leading-snug cursor-pointer line-clamp-2"
                        >
                          {book.cleanTitle || book.title}
                        </h3>

                        <p className="text-xs text-[var(--text-muted)] mt-1 font-medium truncate">
                          by <strong className="text-[var(--text-ink)]">{book.author}</strong>
                          {pubYear ? ` · ${pubYear}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Language Passport Pill & Format */}
                    <div className="flex flex-wrap items-center gap-1.5 my-3 text-[10px] font-mono-tabular">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          profile.isTranslation
                            ? 'bg-[var(--accent-gold)]/15 text-amber-900 dark:text-amber-200 border border-[var(--accent-gold)]/30'
                            : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-ledger)]'
                        }`}
                      >
                        {profile.translationFlow}
                        {profile.translators.length > 0
                          ? ` · tr. ${profile.translators[0]}`
                          : ''}
                      </span>

                      <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-ledger)]">
                        {FORMAT_LABELS[profile.format]}
                      </span>

                      {communityRating && (
                        <span className="flex items-center gap-0.5 text-[var(--accent-gold)] font-bold ml-auto">
                          <Star className="w-3 h-3 fill-[var(--accent-gold)]" />
                          <span>{communityRating.toFixed(2)}</span>
                        </span>
                      )}
                    </div>

                    {/* Enriched Synopsis (if present) */}
                    {enriched?.synopsis ? (
                      <div className="p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)]/70 text-xs text-[var(--text-ink)] font-serif-editorial italic leading-relaxed line-clamp-3 my-2">
                        &ldquo;{enriched.synopsis}&rdquo;
                      </div>
                    ) : (
                      <div className="my-2">
                        <button
                          onClick={onOpenEnrichModal}
                          className="text-[11px] font-mono-tabular text-[var(--accent-primary)] hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <span>+ Enrich TBR for synopsis archive</span>
                        </button>
                      </div>
                    )}

                    {/* Why This Match? Pills */}
                    <div className="mt-4 pt-3 border-t border-[var(--border-ledger)]/60">
                      <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--accent-primary)] font-bold mb-2">
                        Why This Match?
                      </div>
                      <div className="space-y-1.5">
                        {reasons.length > 0 ? (
                          reasons.map((reason, rIdx) => (
                            <div
                              key={rIdx}
                              className="flex items-start gap-1.5 text-xs text-[var(--text-muted)]"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-gold)] shrink-0 mt-0.5" />
                              <span className="leading-tight">{reason}</span>
                            </div>
                          ))
                        ) : (
                          <div className="flex items-start gap-1.5 text-xs text-[var(--text-muted)]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-gold)] shrink-0 mt-0.5" />
                            <span>Queued in your TBR library collection</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="mt-6 pt-4 border-t border-[var(--border-ledger)] flex items-center justify-between">
                    <div className="text-xs font-mono-tabular text-[var(--text-muted)]">
                      {book.pageCount ? `${book.pageCount} pp.` : 'Length unlisted'}
                    </div>

                    <button
                      onClick={() => onSelectBook(book)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--bg-surface)] hover:bg-[var(--accent-primary)] hover:text-white text-xs font-semibold text-[var(--text-ink)] border border-[var(--border-ledger)] transition-colors cursor-pointer"
                    >
                      <span>Inspect Dossier</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Unfinished Series on Your Shelf */}
      {unfinishedSeries.length > 0 && (
        <section aria-labelledby="unfinished-series-heading">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--accent-secondary)]" />
              <h2
                id="unfinished-series-heading"
                className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
              >
                Unfinished Series on Your Shelf
              </h2>
            </div>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
              Series where you have started the sequence and possess next volumes
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {unfinishedSeries.slice(0, 6).map((item, idx) => {
              const total = item.totalTracked || item.books?.length || 0;
              const read = item.readCount || 0;
              const progressPct = total > 0 ? Math.round((read / total) * 100) : 0;
              const nextBook =
                item.nextBook || item.books?.find((b) => b.exclusiveShelf === 'to-read');

              return (
                <div
                  key={idx}
                  className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)] truncate">
                        {item.seriesName}
                      </h3>
                      <span className="text-xs font-mono-tabular text-[var(--text-muted)] shrink-0">
                        {read} of {total} read
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden my-2">
                      <div
                        className="h-full bg-[var(--accent-secondary)] transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    {/* Next Book in Sequence */}
                    {nextBook ? (
                      <div
                        onClick={() => onSelectBook(nextBook)}
                        className="mt-3 p-2.5 rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-surface)]/80 border border-transparent hover:border-[var(--accent-secondary)]/40 transition-colors cursor-pointer group"
                      >
                        <div className="text-[10px] uppercase font-mono-tabular text-[var(--accent-secondary)] font-bold">
                          Next In Sequence Waiting on TBR:
                        </div>
                        <div className="font-serif-editorial text-sm font-semibold text-[var(--text-ink)] group-hover:text-[var(--accent-secondary)] transition-colors truncate">
                          {nextBook.cleanTitle || nextBook.title}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {nextBook.seriesNumber ? `Book #${nextBook.seriesNumber}` : ''}{' '}
                          {nextBook.pageCount ? `· ${nextBook.pageCount} pages` : ''}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)] italic mt-2">
                        All currently shelved volumes completed.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Trusted Author Lineup */}
      {trustedAuthorPicks.length > 0 && (
        <section aria-labelledby="trusted-authors-heading">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2
                id="trusted-authors-heading"
                className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
              >
                Trusted Author Lineup
              </h2>
            </div>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
              Authors you consistently rate 4★ or 5★ with unread works on your shelf
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trustedAuthorPicks.slice(0, 6).map((authorPick, idx) => (
              <div
                key={idx}
                className="p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                      {authorPick.author}
                    </h3>
                    <span className="flex items-center gap-1 text-xs font-mono-tabular font-bold text-[var(--accent-gold)]">
                      <Star className="w-3.5 h-3.5 fill-[var(--accent-gold)]" />
                      {authorPick.avgRating.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {authorPick.readCount} completed volume{authorPick.readCount > 1 ? 's' : ''} in
                    archive
                  </p>

                  {/* To-read books from this author */}
                  {authorPick.toReadBooks && authorPick.toReadBooks.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="text-[10px] uppercase font-mono-tabular text-[var(--text-muted)] font-semibold">
                        Waiting on TBR:
                      </div>
                      {authorPick.toReadBooks.slice(0, 2).map((b) => (
                        <div
                          key={b.id}
                          onClick={() => onSelectBook(b)}
                          className="p-2 rounded bg-[var(--bg-surface)] text-xs text-[var(--text-ink)] hover:text-[var(--accent-primary)] cursor-pointer truncate transition-colors"
                        >
                          → {b.cleanTitle || b.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Goodreads Recommendation Graph */}
      {groupedRecommendations.length > 0 && (
        <section aria-labelledby="recommendations-heading">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--border-ledger)]">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[var(--accent-gold)]" />
              <h2
                id="recommendations-heading"
                className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
              >
                Goodreads Recommendation Graph
              </h2>
            </div>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
              Recommendations anchored to your highest-rated read volumes
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {groupedRecommendations.map((group, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="text-[10px] uppercase font-mono-tabular text-[var(--text-muted)] font-semibold">
                    Because you read:
                  </div>
                  <div
                    onClick={() => onSelectBookById(group.sourceBookId, group.sourceBookTitle)}
                    className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer truncate mt-0.5"
                    title={group.sourceBookTitle}
                  >
                    {group.sourceBookTitle}
                  </div>

                  <div className="mt-3 pt-2 border-t border-[var(--border-ledger)]/60 space-y-2">
                    {group.items.slice(0, 3).map((item, itemIdx) => (
                      <div
                        key={itemIdx}
                        className="text-xs text-[var(--text-ink)] bg-[var(--bg-surface)] p-2 rounded"
                      >
                        <div className="font-medium truncate">{item.recommendedTitle}</div>
                        {item.shelf && (
                          <span className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                            Shelf: {item.shelf}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
