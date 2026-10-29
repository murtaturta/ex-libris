import React from 'react';
import {
  BookOpen,
  Search,
  UploadCloud,
  Sun,
  Moon,
  Compass,
  Library,
  Sparkles,
  Coffee,
  ImageIcon,
} from 'lucide-react';

export type TabId = 'study' | 'library' | 'oracle' | 'observatory';

export interface HeaderProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onOpenSearch: () => void;
  onOpenImport: () => void;
  onOpenEnrichModal?: () => void;
  showCovers?: boolean;
  onToggleCovers?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  totalBooks?: number;
  enrichedCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenSearch,
  onOpenImport,
  onOpenEnrichModal,
  showCovers = false,
  onToggleCovers,
  theme,
  onToggleTheme,
  totalBooks,
  enrichedCount,
}) => {
  const tabs: Array<{ id: TabId; num: string; label: string; icon: React.ReactNode }> = [
    { id: 'study', num: '01', label: 'The Study', icon: <Coffee className="w-4 h-4" /> },
    { id: 'library', num: '02', label: 'The Library', icon: <Library className="w-4 h-4" /> },
    { id: 'oracle', num: '03', label: 'The Oracle', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'observatory', num: '04', label: 'The Observatory', icon: <Compass className="w-4 h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-ledger)] bg-[var(--bg-surface)]/90 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3 lg:gap-4">
          
          {/* Brand & Archival Stamp */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-md bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center border border-[var(--accent-primary)]/20 shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif-editorial text-lg sm:text-xl font-bold tracking-tight text-[var(--text-ink)]">
                  EX LIBRIS
                </span>
                <span className="hidden md:inline-block text-xs font-mono-tabular px-1.5 py-0.5 rounded border border-[var(--border-ledger)] text-[var(--text-muted)] bg-[var(--bg-card)]">
                  {totalBooks ? `${totalBooks.toLocaleString()} VOLUMES` : 'ARCHIVE'}
                </span>
              </div>
              <p className="hidden sm:block text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium -mt-1">
                Reading Archive &amp; Observatory
              </p>
            </div>
          </div>

          {/* Numbered Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2 md:space-x-3 overflow-x-auto py-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-150 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'text-[var(--text-ink)] bg-[var(--bg-card)] shadow-xs font-semibold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-card)]/50'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span
                    className={`font-mono-tabular text-[10px] sm:text-xs transition-colors ${
                      isActive ? 'text-[var(--accent-primary)] font-bold' : 'text-[var(--text-muted)]/70'
                    }`}
                  >
                    {tab.num}
                  </span>
                  <span className="hidden sm:inline text-xs text-[var(--text-muted)]/40">/</span>
                  <span className="flex items-center gap-1.5">
                    <span className={isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-ink)]'}>
                      {tab.icon}
                    </span>
                    <span>{tab.label.replace(/^\d+\s*\/\s*/, '')}</span>
                  </span>

                  {/* Active Ledger Underline Bar */}
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[var(--accent-primary)] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Utility Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Search Button */}
            <button
              onClick={onOpenSearch}
              type="button"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] text-xs text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:border-[var(--text-muted)]/50 transition-colors cursor-pointer shadow-2xs"
              title="Quick Search (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono-tabular font-medium bg-[var(--bg-surface)] border border-[var(--border-ledger)] rounded text-[var(--text-muted)]">
                ⌘K
              </kbd>
            </button>

            {/* Covers: Off / On Pill Toggle */}
            {onToggleCovers && (
              <button
                onClick={onToggleCovers}
                type="button"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-mono-tabular transition-all cursor-pointer shadow-2xs ${
                  showCovers
                    ? 'border-[var(--accent-primary)]/50 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-semibold'
                    : 'border-[var(--border-ledger)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:border-[var(--text-muted)]/40'
                }`}
                title={showCovers ? 'Covers enabled (click to return to text-first mode)' : 'Covers disabled (click to display book covers)'}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Covers:</span>
                <span className={showCovers ? 'text-[var(--accent-primary)] font-bold' : 'text-[var(--text-muted)]'}>
                  {showCovers ? 'On' : 'Off'}
                </span>
              </button>
            )}

            {/* 1-Click Metadata Enricher Button */}
            {onOpenEnrichModal && (
              <button
                onClick={onOpenEnrichModal}
                type="button"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--accent-gold)]/40 bg-[var(--bg-card)] text-xs font-medium text-[var(--text-ink)] hover:bg-[var(--accent-gold)]/15 hover:border-[var(--accent-gold)] transition-all cursor-pointer shadow-2xs group"
                title="1-Click OpenLibrary + Google Books Metadata Enricher"
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-gold)] group-hover:rotate-12 transition-transform" />
                <span className="font-serif-editorial hidden sm:inline">Enrich</span>
                {enrichedCount !== undefined && enrichedCount > 0 ? (
                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--accent-gold)]/20 text-[var(--text-ink)] font-semibold">
                    {enrichedCount}{totalBooks ? `/${totalBooks}` : ''}
                  </span>
                ) : (
                  <span className="font-mono-tabular text-[10px] sm:hidden">Enrich</span>
                )}
              </button>
            )}

            {/* Import Archive Button */}
            <button
              onClick={onOpenImport}
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-ink)] hover:bg-[var(--accent-secondary)]/10 hover:border-[var(--accent-secondary)]/30 hover:text-[var(--accent-secondary)] transition-colors cursor-pointer shadow-2xs"
              title="Import Goodreads .csv, full .zip, or Kindle Clippings .txt"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Import</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              type="button"
              aria-label="Toggle parchment / library lamp mode"
              className="p-1.5 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--accent-gold)] hover:border-[var(--accent-gold)]/40 transition-colors cursor-pointer shadow-2xs"
              title={theme === 'dark' ? 'Switch to Parchment Light' : 'Switch to Library Lamp Dark'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-[var(--accent-gold)]" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};

export default Header;
