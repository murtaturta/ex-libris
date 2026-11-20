import React, { useMemo, useState } from 'react';
import { Check, Clapperboard, Film, Layers, Loader2, Sparkles } from 'lucide-react';
import type {
  Book,
  EnrichmentCacheMap,
  FilmEnrichmentCacheMap,
  UserLocalState,
} from '../types/library';
import {
  collectUniqueFilmsForEnrichment,
  countUnenrichedFilms,
  enrichFilmDirectors,
  type FilmEnrichmentProgress,
} from '../lib/enrichment/filmDirectorEnricher';
import {
  computeLetterboxdVaultStats,
  downloadCombinedObsidianVault,
  downloadLetterboxdVault,
  type LetterboxdObsidianScope,
} from '../lib/exporters/letterboxdVaultExporter';

interface CinemaObsidianExportSectionProps {
  books: Book[];
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
  filmEnrichmentCache: FilmEnrichmentCacheMap;
  onFilmEnrichmentUpdated?: (updatedCache: FilmEnrichmentCacheMap) => void;
  onCloseParentMenu?: () => void;
}

export const CinemaObsidianExportSection: React.FC<CinemaObsidianExportSectionProps> = ({
  books,
  userState,
  enrichmentCache,
  filmEnrichmentCache,
  onFilmEnrichmentUpdated,
  onCloseParentMenu,
}) => {
  const [includeDirectors, setIncludeDirectors] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [doneAction, setDoneAction] = useState<string | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<FilmEnrichmentProgress | null>(null);
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);

  const letterboxdData = userState.letterboxdData;

  const stats = useMemo(
    () => computeLetterboxdVaultStats(letterboxdData, filmEnrichmentCache),
    [letterboxdData, filmEnrichmentCache]
  );

  const missingDirectorsCount = useMemo(
    () => countUnenrichedFilms(letterboxdData, filmEnrichmentCache),
    [letterboxdData, filmEnrichmentCache]
  );

  const handleEnrichDirectors = async () => {
    if (!letterboxdData || busyAction) return;
    const uniqueFilms = collectUniqueFilmsForEnrichment(letterboxdData);
    setBusyAction('enrich');
    setEnrichStatus(null);
    setEnrichProgress({ completed: 0, total: missingDirectorsCount || uniqueFilms.length, enrichedCount: 0 });
    try {
      const res = await enrichFilmDirectors(uniqueFilms, filmEnrichmentCache, (prog) => {
        setEnrichProgress(prog);
      });
      onFilmEnrichmentUpdated?.(res.updatedCache);
      setEnrichStatus(`Resolved ${res.enriched} / ${res.totalMissing} films`);
      setDoneAction('enrich');
      setTimeout(() => setDoneAction((d) => (d === 'enrich' ? null : d)), 2500);
    } catch (err) {
      console.error('Film director enrichment error:', err);
      setEnrichStatus('Director lookup failed');
    } finally {
      setBusyAction(null);
      setEnrichProgress(null);
    }
  };

  const handleCinemaExport = async (scope: LetterboxdObsidianScope) => {
    if (!letterboxdData || busyAction) return;
    setBusyAction(scope);
    try {
      await downloadLetterboxdVault(letterboxdData, {
        scope,
        includeDirectors,
        filmEnrichmentCache,
        books,
      });
      setDoneAction(scope);
      setTimeout(() => {
        setDoneAction(null);
        onCloseParentMenu?.();
      }, 900);
    } catch (err) {
      console.error('Letterboxd Obsidian export failed:', err);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCombinedExport = async () => {
    if (busyAction) return;
    setBusyAction('combined');
    try {
      await downloadCombinedObsidianVault(books, userState, enrichmentCache, {
        bookScope: 'all',
        cinemaScope: 'all',
        includeDirectors,
        filmEnrichmentCache,
      });
      setDoneAction('combined');
      setTimeout(() => {
        setDoneAction(null);
        onCloseParentMenu?.();
      }, 900);
    } catch (err) {
      console.error('Combined Obsidian export failed:', err);
    } finally {
      setBusyAction(null);
    }
  };

  if (stats.totalCount === 0) {
    return (
      <div className="mt-1.5 pt-1.5 border-t border-[var(--border-ledger)] px-2 py-1 text-[10px] text-[var(--text-muted)]">
        Cinema export ready once Letterboxd data is imported.
      </div>
    );
  }

  const cinemaScopes: Array<{
    id: LetterboxdObsidianScope;
    label: string;
    subtitle: string;
    count: number;
  }> = [
    {
      id: 'all',
      label: 'Watched + Watchlist',
      subtitle: 'Full Cinema/ vault',
      count: stats.totalCount,
    },
    {
      id: 'watched',
      label: 'Watched Films Only',
      subtitle: 'Logged & rated entries',
      count: stats.watchedCount,
    },
    {
      id: 'annotated',
      label: 'Annotated Films',
      subtitle: 'Reviews, tags & lists',
      count: stats.annotatedCount,
    },
  ];

  return (
    <div className="mt-1.5 pt-1.5 border-t border-[var(--border-ledger)] space-y-1">
      <div className="px-2 pt-0.5 flex items-center justify-between text-[9px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1 font-bold text-[var(--text-ink)]">
          <Film className="w-3 h-3 text-[#7C5CFF]" />
          Cinema (Letterboxd)
        </span>
        <span>{stats.totalCount} films</span>
      </div>

      {/* Include Directors Option Toggle */}
      <button
        type="button"
        onClick={() => setIncludeDirectors((v) => !v)}
        aria-pressed={includeDirectors}
        className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] hover:bg-[#7C5CFF]/10 transition-colors cursor-pointer"
      >
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-ink)]">
          <Clapperboard className="w-3 h-3 text-[var(--text-muted)]" />
          Include Directors
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-mono-tabular font-semibold border ${
            includeDirectors
              ? 'bg-[#7C5CFF]/15 border-[#7C5CFF]/40 text-[#7C5CFF]'
              : 'bg-[var(--bg-card)] border-[var(--border-ledger)] text-[var(--text-muted)]'
          }`}
        >
          {includeDirectors ? `ON · ${stats.directorsCount}` : 'OFF'}
        </span>
      </button>

      {/* Director Lookup / Enrichment Action */}
      {missingDirectorsCount > 0 && (
        <button
          type="button"
          onClick={handleEnrichDirectors}
          disabled={Boolean(busyAction)}
          className="w-full flex items-center justify-between px-2 py-1 rounded bg-[#7C5CFF]/10 hover:bg-[#7C5CFF]/15 border border-[#7C5CFF]/25 text-[11px] font-medium text-[#7C5CFF] transition-colors cursor-pointer disabled:opacity-60"
        >
          <span className="inline-flex items-center gap-1.5">
            {busyAction === 'enrich' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {busyAction === 'enrich' && enrichProgress
              ? `Looking up directors (${enrichProgress.completed}/${enrichProgress.total})`
              : `Enrich Directors (${missingDirectorsCount} new)`}
          </span>
        </button>
      )}

      {enrichStatus && (
        <div className="px-2 text-[10px] font-mono-tabular text-[var(--text-muted)]">
          {enrichStatus}
        </div>
      )}

      {/* Cinema Scope Export Options */}
      {cinemaScopes.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => handleCinemaExport(opt.id)}
          disabled={Boolean(busyAction)}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-[11px] font-medium text-[var(--text-ink)] hover:bg-[#7C5CFF]/10 hover:text-[#7C5CFF] transition-colors cursor-pointer disabled:opacity-50"
          title={opt.subtitle}
        >
          <span className="flex flex-col leading-tight">
            <span>{opt.label}</span>
            <span className="text-[9px] text-[var(--text-muted)]">{opt.subtitle}</span>
          </span>
          <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] ml-2 shrink-0">
            {busyAction === opt.id ? (
              <Loader2 className="w-3 h-3 animate-spin inline" />
            ) : doneAction === opt.id ? (
              <Check className="w-3 h-3 text-emerald-500 inline" />
            ) : (
              opt.count
            )}
          </span>
        </button>
      ))}

      {/* Combined Books + Cinema Vault */}
      {books.length > 0 && (
        <button
          type="button"
          onClick={handleCombinedExport}
          disabled={Boolean(busyAction)}
          className="w-full mt-1 flex items-center justify-between px-2 py-1.5 rounded border border-[#7C5CFF]/30 bg-[#7C5CFF]/8 hover:bg-[#7C5CFF]/15 text-left text-[11px] font-semibold text-[#7C5CFF] transition-colors cursor-pointer disabled:opacity-50"
          title="Export Ex Libris/ and Cinema/ together in one collision-free Obsidian vault with Book <-> Film wikilinks"
        >
          <span className="inline-flex items-center gap-1.5">
            <Layers className="w-3 h-3 shrink-0" />
            <span>Combined Books + Cinema</span>
          </span>
          <span className="text-[10px] font-mono-tabular ml-2 shrink-0">
            {busyAction === 'combined' ? (
              <Loader2 className="w-3 h-3 animate-spin inline" />
            ) : doneAction === 'combined' ? (
              <Check className="w-3 h-3 text-emerald-500 inline" />
            ) : (
              books.length + stats.totalCount
            )}
          </span>
        </button>
      )}
    </div>
  );
};
