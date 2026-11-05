import React, { useState, useMemo, useEffect, useRef } from 'react';
import type {
  LibraryBundle,
  EnrichmentCacheMap,
  UserLocalState,
  ExternalDiscoveryPick,
  ExternalWantListItem,
} from '../types/library';
import {
  DiscoveryProgress,
  extractDsarCollaborativeDiscovery,
  loadCachedExternalDiscovery,
  scoutExternalDiscovery,
} from '../lib/discovery/externalDiscovery';
import { getGoodreadsAuthorUrl } from '../lib/links/goodreadsLinks';
import { formatPublicationYear } from '../lib/formatters';
import {
  Compass,
  Sparkles,
  ExternalLink,
  BookPlus,
  Check,
  RefreshCw,
  Search,
  Filter,
  Bookmark,
  Layers,
  Award,
  BookOpen,
  ArrowRight,
  BookmarkCheck,
  AlertCircle,
  X,
  Clock,
  Loader2,
} from 'lucide-react';

export interface ExternalDiscoverySectionProps {
  bundle: LibraryBundle;
  enrichmentCache: EnrichmentCacheMap;
  userState: UserLocalState;
  showCovers?: boolean;
  onToggleWantList: (pick: ExternalDiscoveryPick) => void;
  onRemoveWantListItem?: (id: string) => void;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
}

type WingTab = 'all' | 'author-backlist' | 'subject-dna' | 'dsar-graph' | 'want-list';
type CommitmentFilter = 'any' | 'sprint' | 'standard' | 'epic';

export const ExternalDiscoverySection: React.FC<ExternalDiscoverySectionProps> = ({
  bundle,
  enrichmentCache,
  userState,
  showCovers = false,
  onToggleWantList,
  onRemoveWantListItem,
  onSelectBookById,
}) => {
  // Wing tab & sub-filters
  const [activeTab, setActiveTab] = useState<WingTab>('all');
  const [commitment, setCommitment] = useState<CommitmentFilter>('any');
  const [sequelsOnly, setSequelsOnly] = useState<boolean>(false);

  // Live scouting state
  const [isScouting, setIsScouting] = useState<boolean>(false);
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cached scouted picks (Engines 1 & 2)
  const [scoutedPicks, setScoutedPicks] = useState<{
    authorBacklist: ExternalDiscoveryPick[];
    subjectDna: ExternalDiscoveryPick[];
  }>({
    authorBacklist: [],
    subjectDna: [],
  });

  // Engine 3: Instant DSAR Archive Collaborative Graph Picks (0ms mount compute)
  const dsarPicks = useMemo(() => {
    try {
      return extractDsarCollaborativeDiscovery(bundle, enrichmentCache);
    } catch (e) {
      console.warn('[ExternalDiscovery] extractDsarCollaborativeDiscovery fallback:', e);
      return [];
    }
  }, [bundle, enrichmentCache]);

  // Load cached scouting on mount
  useEffect(() => {
    try {
      const cached = loadCachedExternalDiscovery();
      if (
        cached &&
        ((cached.authorBacklist && cached.authorBacklist.length > 0) ||
          (cached.subjectDna && cached.subjectDna.length > 0))
      ) {
        setScoutedPicks({
          authorBacklist: cached.authorBacklist || [],
          subjectDna: cached.subjectDna || [],
        });
      }
    } catch {
      // Fallback cleanly
    }
  }, []);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Scouting handler
  const handleStartScout = async () => {
    if (isScouting) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsScouting(true);
    setProgress({
      step: 'author-backlist',
      detail: 'Surveying 4★–5★ author lineages & subject intersections...',
      completedSteps: 1,
      totalSteps: 4,
    });

    try {
      const res = await scoutExternalDiscovery(
        bundle,
        enrichmentCache,
        (p: DiscoveryProgress) => setProgress(p),
        controller.signal
      );
      if (res) {
        setScoutedPicks({
          authorBacklist: res.authorBacklist || [],
          subjectDna: res.subjectDna || [],
        });
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[ExternalDiscovery] Scouting failed:', err);
      }
    } finally {
      setIsScouting(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancelScout = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsScouting(false);
    setProgress(null);
  };

  // Want-list lookup helper
  const isPickOnWantList = (pickId: string, title: string, author: string | null) => {
    const list = userState.externalWantList || [];
    return list.some(
      (item) =>
        item.id === pickId ||
        (item.title.toLowerCase() === title.toLowerCase() &&
          (!item.author || !author || item.author.toLowerCase() === author.toLowerCase()))
    );
  };

  // Convert want-list items into ExternalDiscoveryPick-compatible cards for the want-list tab
  const wantListPicks = useMemo<ExternalDiscoveryPick[]>(() => {
    const list = userState.externalWantList || [];
    // Cross-reference with all known picks
    const allKnown = [
      ...scoutedPicks.authorBacklist,
      ...scoutedPicks.subjectDna,
      ...dsarPicks,
    ];
    const knownMap = new Map<string, ExternalDiscoveryPick>();
    for (const p of allKnown) {
      knownMap.set(p.id, p);
      knownMap.set(p.title.toLowerCase(), p);
    }

    return list.map((item) => {
      const match = knownMap.get(item.id) || knownMap.get(item.title.toLowerCase());
      if (match) return match;

      return {
        id: item.id,
        engine: item.engine,
        title: item.title,
        author: item.author,
        yearPublished: item.yearPublished || null,
        pageCount: null,
        communityRating: null,
        ratingsCount: null,
        subjects: [],
        synopsis: null,
        coverUrl: item.coverUrl || null,
        provenance: item.provenance || 'Saved from Horizons Want-List',
        reasons: ['Saved to your local Want-List'],
        score: 100,
      };
    });
  }, [userState.externalWantList, scoutedPicks, dsarPicks]);

  // Combined Blended Horizon Pool
  const blendedAllPicks = useMemo(() => {
    const seen = new Set<string>();
    const combined: ExternalDiscoveryPick[] = [];

    // Blend: Author backlist (high weight) -> Subject DNA -> DSAR collaborative graph
    const pools = [
      scoutedPicks.authorBacklist,
      scoutedPicks.subjectDna,
      dsarPicks,
    ];

    for (const pool of pools) {
      for (const pick of pool) {
        const key = `${pick.title.toLowerCase()}::${(pick.author || '').toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(pick);
        }
      }
    }

    return combined.sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [scoutedPicks, dsarPicks]);

  // Active pool by tab
  const activePool = useMemo(() => {
    switch (activeTab) {
      case 'author-backlist':
        return scoutedPicks.authorBacklist;
      case 'subject-dna':
        return scoutedPicks.subjectDna;
      case 'dsar-graph':
        return dsarPicks;
      case 'want-list':
        return wantListPicks;
      case 'all':
      default:
        return blendedAllPicks;
    }
  }, [activeTab, scoutedPicks, dsarPicks, wantListPicks, blendedAllPicks]);

  // Filter pool by commitment & sequels
  const filteredPicks = useMemo(() => {
    return activePool.filter((pick: ExternalDiscoveryPick) => {
      // Sequels filter
      if (sequelsOnly && !pick.isSequel) {
        return false;
      }

      // Commitment filter
      if (commitment === 'sprint') {
        if (!pick.pageCount || pick.pageCount > 250) return false;
      } else if (commitment === 'standard') {
        if (!pick.pageCount || pick.pageCount < 250 || pick.pageCount > 500) return false;
      } else if (commitment === 'epic') {
        if (!pick.pageCount || pick.pageCount < 500) return false;
      }

      return true;
    });
  }, [activePool, sequelsOnly, commitment]);

  const hasAnyScouted =
    scoutedPicks.authorBacklist.length > 0 || scoutedPicks.subjectDna.length > 0;
  const wantListCount = (userState.externalWantList || []).length;

  return (
    <section
      aria-labelledby="external-discovery-heading"
      className="space-y-6 pt-6 border-t border-[var(--border-ledger)]"
    >
      {/* Section Masthead */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-ledger)]">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-[var(--accent-secondary)]" />
            <h2
              id="external-discovery-heading"
              className="font-serif-editorial text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-ink)]"
            >
              The Acquisitions Desk · Beyond Your Shelves
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            External discovery beyond your owned catalog: Missing sequels, author lineages &amp; DNA intersections
          </p>
        </div>

        {/* Scout Live Action / Status */}
        <div className="flex items-center gap-2">
          {isScouting ? (
            <button
              type="button"
              onClick={handleCancelScout}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-ledger)] border border-[var(--border-ledger)] text-xs font-mono-tabular text-[var(--text-muted)] hover:text-[var(--text-ink)] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel Scouting</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartScout}
              className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-secondary)] hover:brightness-105 text-white font-serif-editorial font-bold text-xs flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
              title="Scout live recommendations from OpenLibrary & Google Books based on your 4★–5★ catalog"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{hasAnyScouted ? 'Refresh Live Horizons' : 'Scout Live Horizons'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Progress Bar Banner */}
      {isScouting && progress && (
        <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--accent-secondary)]/40 shadow-sm space-y-2 animate-card-draw">
          <div className="flex items-center justify-between text-xs font-mono-tabular">
            <span className="flex items-center gap-2 text-[var(--accent-secondary)] font-bold">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Scouting External Literary Horizons...</span>
            </span>
            <span className="text-[var(--text-muted)]">
              Step {progress.completedSteps} of {progress.totalSteps}
            </span>
          </div>

          <div className="w-full h-1.5 bg-[var(--bg-surface)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-secondary)] transition-all duration-300"
              style={{
                width: `${Math.max(12, (progress.completedSteps / progress.totalSteps) * 100)}%`,
              }}
            />
          </div>

          <p className="text-[11px] text-[var(--text-muted)] italic truncate">
            {progress.detail}
          </p>
        </div>
      )}

      {/* Empty State Callout: Invitation to Scout if no live results yet */}
      {!hasAnyScouted && !isScouting && (
        <div className="p-5 rounded-xl bg-[var(--bg-surface)]/60 border border-dashed border-[var(--accent-secondary)]/45 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--accent-secondary)] font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Uncharted Literary Horizons</span>
            </div>
            <p className="text-xs text-[var(--text-ink)] font-serif-editorial">
              Your 4★ &amp; 5★ ratings hold rich lineages of missing sequels and unread backlists.
              Tap <strong>“Scout Live Horizons”</strong> to survey OpenLibrary and Google Books for personalized external acquisitions.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartScout}
            className="px-4 py-2 rounded-lg bg-[var(--accent-secondary)] text-white font-serif-editorial font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-2xs hover:brightness-105 transition-all cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>Scout in ~4 Seconds</span>
          </button>
        </div>
      )}

      {/* Segmented Wing Tabs Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Horizontal Scrollable Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          {[
            { id: 'all', label: 'All Horizons', count: blendedAllPicks.length },
            {
              id: 'author-backlist',
              label: '4★–5★ Author Backlist & Sequels',
              count: scoutedPicks.authorBacklist.length,
            },
            {
              id: 'subject-dna',
              label: 'Literary DNA Intersections',
              count: scoutedPicks.subjectDna.length,
            },
            {
              id: 'dsar-graph',
              label: 'Archive Collaborative Graph',
              count: dsarPicks.length,
            },
            {
              id: 'want-list',
              label: 'Saved Want-List',
              count: wantListCount,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as WingTab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-serif-editorial transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-[var(--accent-secondary)] text-white font-bold shadow-2xs'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] border border-[var(--border-ledger)]'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono-tabular ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--border-ledger)] text-[var(--text-muted)]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Quick Filter Controls: Commitment & Sequels Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sequels Toggle */}
          <button
            type="button"
            onClick={() => setSequelsOnly(!sequelsOnly)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono-tabular border transition-all cursor-pointer flex items-center gap-1 ${
              sequelsOnly
                ? 'bg-[var(--accent-gold)]/20 border-[var(--accent-gold)] text-[var(--text-ink)] font-bold'
                : 'bg-[var(--bg-surface)] border-[var(--border-ledger)] text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
          >
            <span>Sequels Only</span>
            {sequelsOnly && <Check className="w-3 h-3 text-[var(--accent-gold)]" />}
          </button>

          {/* Commitment Dropdown/Pills */}
          <div className="flex items-center gap-1 text-[11px] font-mono-tabular bg-[var(--bg-surface)] p-0.5 rounded-lg border border-[var(--border-ledger)]">
            {[
              { id: 'any', label: 'Any' },
              { id: 'sprint', label: '<250p' },
              { id: 'standard', label: '250–500p' },
              { id: 'epic', label: '500p+' },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCommitment(c.id as CommitmentFilter)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  commitment === c.id
                    ? 'bg-[var(--bg-card)] text-[var(--text-ink)] font-bold shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pick Cards Grid */}
      {filteredPicks.length === 0 ? (
        <div className="p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] text-center space-y-2">
          <BookOpen className="w-6 h-6 text-[var(--text-muted)] mx-auto opacity-50" />
          <p className="font-serif-editorial text-sm font-semibold text-[var(--text-ink)]">
            No recommendations match the current filters.
          </p>
          <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
            Try adjusting commitment or toggle off “Sequels Only”.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPicks.map((pick: ExternalDiscoveryPick) => {
            const onWantList = isPickOnWantList(pick.id, pick.title, pick.author);
            const goodreadsSearchUrl = `https://www.goodreads.com/search?q=${encodeURIComponent(
              pick.author ? `${pick.title} ${pick.author}` : pick.title
            )}`;

            return (
              <div
                key={pick.id}
                className="group relative rounded-xl bg-[var(--bg-card)] border border-dashed border-[var(--accent-secondary)]/45 hover:border-[var(--accent-secondary)] p-4 sm:p-5 transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between"
              >
                {/* Card Top: Engine Stamp & Year/Page metadata */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    {/* Stamp Badge */}
                    <div className="flex items-center gap-1.5">
                      {pick.isSequel ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular uppercase font-bold tracking-wider bg-[var(--accent-gold)]/20 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30">
                          Missing Sequel
                        </span>
                      ) : pick.engine === 'author-backlist' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular uppercase font-bold tracking-wider bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] border border-[var(--accent-gold)]/20">
                          Author Lineage
                        </span>
                      ) : pick.engine === 'subject-dna' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular uppercase font-bold tracking-wider bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)] border border-[var(--accent-secondary)]/30">
                          Literary DNA
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular uppercase font-bold tracking-wider bg-[var(--text-muted)]/10 text-[var(--text-muted)] border border-[var(--border-ledger)]">
                          Archive Graph
                        </span>
                      )}
                    </div>

                    {/* Metadata: Year & Page Count */}
                    <div className="text-[10px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                      {pick.yearPublished && (
                        <span>{formatPublicationYear(pick.yearPublished)}</span>
                      )}
                      {pick.yearPublished && pick.pageCount && <span> · </span>}
                      {pick.pageCount && <span>{pick.pageCount} pp</span>}
                    </div>
                  </div>

                  {/* Title & Author with Cover Option */}
                  <div className="flex gap-3 items-start">
                    {showCovers && pick.coverUrl && (
                      <div className="w-12 h-18 rounded bg-[var(--bg-surface)] shrink-0 overflow-hidden shadow-2xs border border-[var(--border-ledger)]">
                        <img
                          src={pick.coverUrl}
                          alt={pick.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h3 className="font-serif-editorial text-sm sm:text-base font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors leading-snug">
                        {pick.title}
                      </h3>

                      {pick.author && (
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">
                          by{' '}
                          <a
                            href={getGoodreadsAuthorUrl(pick.author)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-[var(--accent-primary)] hover:underline transition-colors"
                          >
                            {pick.author}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Community Assessment Rating */}
                  {pick.communityRating !== null && pick.communityRating > 0 && (
                    <div className="flex items-center gap-2 mt-2 text-[11px] font-mono-tabular text-[var(--text-muted)]">
                      <span className="text-[var(--accent-gold)] font-bold">
                        ★ {pick.communityRating.toFixed(2)}
                      </span>
                      {pick.ratingsCount !== null && pick.ratingsCount > 0 && (
                        <span>({pick.ratingsCount.toLocaleString()} ratings)</span>
                      )}
                    </div>
                  )}

                  {/* Provenance Banner (Clickable to anchor book if available) */}
                  {pick.provenance && (
                    <div
                      onClick={() => {
                        if (pick.anchorBookId || pick.anchorBookTitle) {
                          onSelectBookById(
                            pick.anchorBookId || null,
                            pick.anchorBookTitle || undefined
                          );
                        }
                      }}
                      className={`mt-2.5 p-2 rounded-lg text-[11px] font-serif-editorial italic border transition-colors ${
                        pick.anchorBookId || pick.anchorBookTitle
                          ? 'bg-[var(--bg-surface)] border-[var(--border-ledger)] hover:border-[var(--accent-secondary)] cursor-pointer text-[var(--text-ink)]'
                          : 'bg-[var(--bg-surface)]/40 border-transparent text-[var(--text-muted)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate">{pick.provenance}</span>
                        {(pick.anchorBookId || pick.anchorBookTitle) && (
                          <ArrowRight className="w-3 h-3 text-[var(--accent-secondary)] shrink-0" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Synopsis / Subject Pills */}
                  {pick.subjects && pick.subjects.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {pick.subjects.slice(0, 3).map((subj: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[10px] font-mono-tabular bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-ledger)]"
                        >
                          {subj}
                        </span>
                      ))}
                    </div>
                  )}

                  {pick.synopsis && (
                    <p className="text-xs font-serif-editorial text-[var(--text-muted)] mt-2 line-clamp-2 italic">
                      “{pick.synopsis}”
                    </p>
                  )}
                </div>

                {/* Card Action Footer */}
                <div className="mt-4 pt-3 border-t border-[var(--border-ledger)] flex items-center justify-between gap-2">
                  {/* Want-List Toggle Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (onWantList && onRemoveWantListItem) {
                        onRemoveWantListItem(pick.id);
                      } else {
                        onToggleWantList(pick);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-serif-editorial transition-all cursor-pointer flex items-center gap-1.5 ${
                      onWantList
                        ? 'bg-emerald-900/15 border border-emerald-600/40 text-emerald-800 dark:text-emerald-300 font-bold'
                        : 'bg-[var(--bg-surface)] hover:bg-[var(--border-ledger)] border border-[var(--border-ledger)] text-[var(--text-ink)] font-semibold'
                    }`}
                  >
                    {onWantList ? (
                      <>
                        <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>On Want-List</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <span>+ Want-List</span>
                      </>
                    )}
                  </button>

                  {/* Letterpress Goodreads Direct Search Link */}
                  <a
                    href={goodreadsSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono-tabular text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-surface)] border border-transparent hover:border-[var(--border-ledger)] transition-all cursor-pointer"
                    title={`Search “${pick.title}” on Goodreads`}
                  >
                    <span>Goodreads</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
