import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderArchive, ChevronDown, Loader2, Check } from 'lucide-react';
import type { Book, EnrichmentCacheMap, UserLocalState } from '../types/library';
import { bookHasAnnotations } from '../lib/exporters/markdownNoteExporter';
import {
  downloadObsidianVault,
  type ObsidianExportScope,
} from '../lib/exporters/obsidianVaultExporter';

interface ObsidianExportMenuProps {
  books: Book[];
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
}

/**
 * Header-level "Obsidian" button with a scope dropdown (All / Read / Annotated).
 * Downloads a ready-to-drop `Ex Libris/` vault folder (Books, Authors, Series, Index).
 */
export const ObsidianExportMenu: React.FC<ObsidianExportMenuProps> = ({
  books,
  userState,
  enrichmentCache,
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ObsidianExportScope | null>(null);
  const [done, setDone] = useState<ObsidianExportScope | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const scopes = useMemo(() => {
    const read = books.filter((b) => b.exclusiveShelf === 'read');
    const annotated = books.filter((b) => bookHasAnnotations(b, userState));
    return [
      { id: 'all' as const, label: 'Entire Library', hint: 'every shelf incl. to-read & DNF', books },
      { id: 'read' as const, label: 'Read Books', hint: 'finished volumes only', books: read },
      { id: 'annotated' as const, label: 'Annotated Books', hint: 'reviews, notes or highlights', books: annotated },
    ];
  }, [books, userState]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleExport = async (scope: ObsidianExportScope, list: Book[]) => {
    if (busy || list.length === 0) return;
    setBusy(scope);
    try {
      await downloadObsidianVault(list, userState, enrichmentCache, scope);
      setDone(scope);
      setTimeout(() => setDone(null), 2500);
    } catch (err) {
      console.error('Obsidian vault export failed:', err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export to Obsidian"
        title="Export your library as an Obsidian vault (Books · Authors · Series · Index)"
        className="flex items-center justify-center min-h-[40px] px-2 sm:px-2.5 py-1.5 rounded-md border border-[#7C5CFF]/45 bg-[#7C5CFF]/10 text-xs font-semibold text-[var(--text-ink)] hover:bg-[#7C5CFF]/20 hover:border-[#7C5CFF] transition-colors cursor-pointer shadow-2xs"
      >
        <FolderArchive className="w-3.5 h-3.5 text-[#7C5CFF]" />
        <span className="hidden md:inline ml-1">Obsidian</span>
        <ChevronDown className="w-3 h-3 ml-0.5 text-[var(--text-muted)]" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 z-50 rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-card)] shadow-lg p-2 space-y-1"
        >
          <div className="px-2 pt-1 pb-2 border-b border-[var(--border-ledger)]/70">
            <div className="text-[11px] font-mono-tabular uppercase tracking-wider font-bold text-[var(--text-ink)]">
              Export Obsidian Vault
            </div>
            <div className="text-[10px] text-[var(--text-muted)] leading-snug mt-0.5">
              One note per book, linked to Author &amp; Series hub notes, plus an Index. Unzip into your vault.
            </div>
          </div>
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              disabled={!!busy || s.books.length === 0}
              onClick={() => handleExport(s.id, s.books)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left hover:bg-[#7C5CFF]/10 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <div>
                <div className="text-xs font-semibold text-[var(--text-ink)]">{s.label}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{s.hint}</div>
              </div>
              <span className="flex items-center gap-1.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                {busy === s.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7C5CFF]" />
                ) : done === s.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : null}
                {s.books.length}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ObsidianExportMenu;
