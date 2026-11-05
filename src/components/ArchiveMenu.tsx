import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  UploadCloud,
  Sparkles,
  FolderArchive,
  Feather,
  ImageIcon,
  ChevronDown,
  Check,
  Loader2,
} from 'lucide-react';
import type { Book, EnrichmentCacheMap, UserLocalState } from '../types/library';
import { bookHasAnnotations } from '../lib/exporters/markdownNoteExporter';
import {
  downloadObsidianVault,
  type ObsidianExportScope,
} from '../lib/exporters/obsidianVaultExporter';

export interface ArchiveMenuProps {
  books: Book[];
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
  onOpenImport: () => void;
  onOpenEnrichModal?: () => void;
  enrichedCount?: number;
  onOpenBookplate?: () => void;
  showCovers?: boolean;
  onToggleCovers?: () => void;
}

/**
 * Unified Archive & Cabinet dropdown menu.
 * Consolidates Import, Metadata Enrichment, Obsidian Vault Export,
 * Broadside Bookplate, and Cover display into a single tidy utility menu.
 */
export const ArchiveMenu: React.FC<ArchiveMenuProps> = ({
  books,
  userState,
  enrichmentCache,
  onOpenImport,
  onOpenEnrichModal,
  enrichedCount = 0,
  onOpenBookplate,
  showCovers = false,
  onToggleCovers,
}) => {
  const [open, setOpen] = useState(false);
  const [obsidianSubmenuOpen, setObsidianSubmenuOpen] = useState(false);
  const [busyExport, setBusyExport] = useState<ObsidianExportScope | null>(null);
  const [doneExport, setDoneExport] = useState<ObsidianExportScope | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const exportScopes = useMemo(() => {
    const read = books.filter((b) => b.exclusiveShelf === 'read');
    const annotated = books.filter((b) => bookHasAnnotations(b, userState));
    return [
      { id: 'all' as const, label: 'Entire Library', count: books.length, hint: 'all shelves & DNF' },
      { id: 'read' as const, label: 'Read Works Only', count: read.length, hint: 'completed volumes' },
      { id: 'annotated' as const, label: 'Annotated Only', count: annotated.length, hint: 'with notes or reviews' },
    ];
  }, [books, userState]);

  useEffect(() => {
    if (!open) {
      setObsidianSubmenuOpen(false);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleExport = async (scope: ObsidianExportScope) => {
    if (busyExport) return;
    const targetBooks =
      scope === 'read'
        ? books.filter((b) => b.exclusiveShelf === 'read')
        : scope === 'annotated'
        ? books.filter((b) => bookHasAnnotations(b, userState))
        : books;

    if (targetBooks.length === 0) return;

    setBusyExport(scope);
    try {
      await downloadObsidianVault(targetBooks, userState, enrichmentCache, scope);
      setDoneExport(scope);
      setTimeout(() => {
        setDoneExport(null);
        setOpen(false);
      }, 1500);
    } catch (err) {
      console.error('Obsidian vault export failed:', err);
    } finally {
      setBusyExport(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Archive and utilities menu"
        className={`flex items-center justify-center min-h-[40px] px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
          open
            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
            : 'border-[var(--border-ledger)] bg-[var(--bg-card)] text-[var(--text-ink)] hover:border-[var(--text-muted)]/50'
        }`}
        title="Archive tools, vault sync, exports, and display options"
      >
        <Archive className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
        <span className="hidden sm:inline ml-1.5 font-serif-editorial">Archive</span>
        <ChevronDown
          className={`w-3 h-3 ml-1 text-[var(--text-muted)] transition-transform duration-150 ${
            open ? 'rotate-180 text-[var(--accent-primary)]' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 sm:w-80 z-50 rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-card)] shadow-xl p-1.5 space-y-1 backdrop-blur-md"
        >
          {/* Header Tagline */}
          <div className="px-2.5 py-1.5 border-b border-[var(--border-ledger)]/70">
            <div className="text-[10px] font-mono-tabular uppercase tracking-wider font-bold text-[var(--text-muted)]">
              Cabinet &amp; Operations
            </div>
          </div>

          {/* Section 1: Ingest & Enrich */}
          <div className="space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenImport();
              }}
              className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-[var(--accent-primary)]/10 hover:text-[var(--accent-primary)] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <UploadCloud className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)]">
                    Import Archive
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    Goodreads .csv / .zip, Kindle .txt
                  </div>
                </div>
              </div>
            </button>

            {onOpenEnrichModal && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onOpenEnrichModal();
                }}
                className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-[var(--accent-gold)]/15 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-[var(--accent-gold)] shrink-0 group-hover:rotate-12 transition-transform" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-ink)]">
                      Metadata Enricher
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      OpenLibrary &amp; Google Books covers/data
                    </div>
                  </div>
                </div>
                {enrichedCount > 0 && (
                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-gold)]/20 text-[var(--text-ink)] font-bold">
                    {enrichedCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="border-t border-[var(--border-ledger)]/60 my-1" />

          {/* Section 2: Exports & Colophon */}
          <div className="space-y-0.5">
            {/* Obsidian Vault Export Accordion / Trigger */}
            <div>
              <button
                type="button"
                onClick={() => setObsidianSubmenuOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-[#7C5CFF]/10 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <FolderArchive className="w-4 h-4 text-[#7C5CFF] shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-ink)] group-hover:text-[#7C5CFF]">
                      Export Obsidian Vault
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Interlinked Books, Authors &amp; Series notes
                    </div>
                  </div>
                </div>
                <ChevronDown
                  className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-150 ${
                    obsidianSubmenuOpen ? 'rotate-180 text-[#7C5CFF]' : ''
                  }`}
                />
              </button>

              {obsidianSubmenuOpen && (
                <div className="mt-1 ml-6 mr-1 p-1 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] space-y-0.5">
                  {exportScopes.map((scope) => (
                    <button
                      key={scope.id}
                      type="button"
                      disabled={!!busyExport || scope.count === 0}
                      onClick={() => handleExport(scope.id)}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left text-xs hover:bg-[#7C5CFF]/15 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <div>
                        <span className="font-medium text-[var(--text-ink)]">{scope.label}</span>
                        <span className="block text-[9px] text-[var(--text-muted)]">{scope.hint}</span>
                      </div>
                      <span className="flex items-center gap-1 font-mono-tabular text-[10px] text-[var(--text-muted)]">
                        {busyExport === scope.id ? (
                          <Loader2 className="w-3 h-3 animate-spin text-[#7C5CFF]" />
                        ) : doneExport === scope.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          scope.count
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {onOpenBookplate && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onOpenBookplate();
                }}
                className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-[var(--accent-primary)]/10 hover:text-[var(--accent-primary)] transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Feather className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)]">
                      Broadside Bookplate
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      Woodcut seal &amp; broadside reading almanac
                    </div>
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Section 3: Display Preferences */}
          {onToggleCovers && (
            <>
              <div className="border-t border-[var(--border-ledger)]/60 my-1" />
              <button
                type="button"
                role="menuitem"
                onClick={onToggleCovers}
                className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-[var(--bg-surface)] transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <ImageIcon className="w-4 h-4 text-[var(--text-muted)] shrink-0 group-hover:text-[var(--text-ink)]" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-ink)]">
                      Book Covers Display
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {showCovers ? 'Currently On (showing cover art)' : 'Currently Off (spine / text-first)'}
                    </div>
                  </div>
                </div>
                <span
                  className={`font-mono-tabular text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    showCovers
                      ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                      : 'border-[var(--border-ledger)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                  }`}
                >
                  {showCovers ? 'ON' : 'OFF'}
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ArchiveMenu;
