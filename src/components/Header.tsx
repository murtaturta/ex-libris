import React from 'react';
import {
  BookOpen,
  Search,
  Sun,
  Moon,
  Compass,
  Library,
  Sparkles,
  Coffee,
  Feather,
} from 'lucide-react';
import { ArchiveMenu } from './ArchiveMenu';
import type { Book, EnrichmentCacheMap, UserLocalState } from '../types/library';
import { DEFAULT_USER_STATE } from '../lib/storage/localStateClient';

export type TabId = 'study' | 'library' | 'oracle' | 'observatory' | 'scriptorium';

export interface HeaderProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  onOpenSearch: () => void;
  onOpenImport: () => void;
  onOpenEnrichModal?: () => void;
  onOpenBookplate?: () => void;
  showCovers?: boolean;
  onToggleCovers?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  totalBooks?: number;
  enrichedCount?: number;
  books?: Book[];
  userState?: UserLocalState;
  enrichmentCache?: EnrichmentCacheMap;
  /** Legacy slot for backwards compatibility */
  obsidianExportSlot?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenSearch,
  onOpenImport,
  onOpenEnrichModal,
  onOpenBookplate,
  showCovers = false,
  onToggleCovers,
  theme,
  onToggleTheme,
  totalBooks,
  enrichedCount = 0,
  books = [],
  userState = DEFAULT_USER_STATE,
  enrichmentCache = {},
}) => {
  const tabs: Array<{ id: TabId; num: string; label: string; shortLabel: string; icon: React.ReactNode }> = [
    { id: 'study', num: '01', label: 'The Study', shortLabel: 'Study', icon: <Coffee className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'library', num: '02', label: 'The Library', shortLabel: 'Library', icon: <Library className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'oracle', num: '03', label: 'The Oracle', shortLabel: 'Oracle', icon: <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'observatory', num: '04', label: 'The Observatory', shortLabel: 'Observatory', icon: <Compass className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'scriptorium', num: '05', label: 'The Scriptorium', shortLabel: 'Scriptorium', icon: <Feather className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-ledger)] bg-[var(--bg-surface)]/95 backdrop-blur-md transition-colors duration-200">
      {/* 1. Masthead Tier: Centered Logo Above with Balanced Utilities */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[50px] sm:min-h-[58px] py-1.5 sm:py-2 gap-2">
          
          {/* Left Wing: Subtle Archival Status / Ledger Badge (Keeps Center Perfectly Balanced) */}
          <div className="flex items-center gap-2 flex-1 justify-start">
            <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[var(--border-ledger)] text-[10px] sm:text-[11px] font-mono-tabular text-[var(--text-muted)] bg-[var(--bg-card)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Local-First Archive</span>
            </span>
          </div>

          {/* Center: Resized Archival Logo (In the Middle Above) */}
          <div
            onClick={() => onSelectTab('study')}
            className="flex flex-col items-center justify-center shrink-0 text-center px-2 cursor-pointer group select-none"
            title="EX LIBRIS · Return to The Study"
          >
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center border border-[var(--accent-primary)]/20 shadow-2xs group-hover:scale-105 transition-transform duration-150">
                <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span className="font-serif-editorial text-lg sm:text-2xl font-bold tracking-[0.15em] text-[var(--text-ink)] leading-none">
                EX LIBRIS
              </span>
              {totalBooks ? (
                <span className="text-[9px] sm:text-[11px] font-mono-tabular px-1.5 py-0.5 rounded border border-[var(--border-ledger)] text-[var(--text-muted)] bg-[var(--bg-card)] leading-none">
                  {totalBooks.toLocaleString()} VOL.
                </span>
              ) : null}
            </div>
            <p className="hidden sm:block text-[9px] sm:text-[10px] uppercase tracking-[0.25em] text-[var(--text-muted)] font-medium mt-1">
              Reading Archive &amp; Literary Observatory
            </p>
          </div>

          {/* Right Wing: Compact 3-Item Utility Bar (Search · Archive ▾ · Theme) */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 flex-1">
            {/* Quick Search Button (⌘K) */}
            <button
              onClick={onOpenSearch}
              type="button"
              className="flex items-center justify-center min-h-[36px] sm:min-h-[38px] px-2 sm:px-2.5 py-1 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] text-xs text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:border-[var(--text-muted)]/50 transition-colors cursor-pointer shadow-2xs"
              title="Quick Search (Ctrl+K)"
              aria-label="Quick Search"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline ml-1.5 text-xs">Search</span>
              <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 text-[9px] font-mono-tabular font-medium bg-[var(--bg-surface)] border border-[var(--border-ledger)] rounded text-[var(--text-muted)]">
                ⌘K
              </kbd>
            </button>

            {/* Unified Archive & Operations Dropdown (Import, Enrich, Obsidian Vault, Bookplate, Covers) */}
            <ArchiveMenu
              books={books}
              userState={userState}
              enrichmentCache={enrichmentCache}
              onOpenImport={onOpenImport}
              onOpenEnrichModal={onOpenEnrichModal}
              enrichedCount={enrichedCount}
              onOpenBookplate={onOpenBookplate}
              showCovers={showCovers}
              onToggleCovers={onToggleCovers}
            />

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              type="button"
              aria-label="Toggle parchment / library lamp mode"
              className="flex items-center justify-center min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] p-1.5 sm:p-2 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--accent-gold)] hover:border-[var(--accent-gold)]/40 transition-colors cursor-pointer shadow-2xs"
              title={theme === 'dark' ? 'Switch to Parchment Light' : 'Switch to Library Lamp Dark'}
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent-gold)]" />
              ) : (
                <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </button>
          </div>

        </div>
      </div>

      {/* 2. Navigation Rooms Tier: Centered Below Logo with Generous Room to Breathe */}
      <div className="border-t border-[var(--border-ledger)]/70 bg-[var(--bg-surface)]/80 px-2 sm:px-4 py-1">
        {/* Desktop & Tablet: Centered 5 Numbered Navigation Rooms */}
        <nav className="hidden md:flex items-center justify-center space-x-1 sm:space-x-2 md:space-x-3 overflow-x-auto max-w-7xl mx-auto" aria-label="Desktop Navigation Rooms">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group relative flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-150 whitespace-nowrap cursor-pointer ${
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
                <span className="text-xs text-[var(--text-muted)]/40">/</span>
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

        {/* Mobile: 5-Column Navigation Grid */}
        <nav className="md:hidden grid grid-cols-5 gap-0.5 sm:gap-1 w-full" aria-label="Mobile Navigation Rooms">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`group relative flex flex-col items-center justify-center py-1 px-0.5 rounded-md min-h-[40px] transition-all cursor-pointer ${
                  isActive
                    ? 'text-[var(--text-ink)] bg-[var(--bg-card)] shadow-xs font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-card)]/40'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <div className="flex items-center gap-1">
                  <span className={isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-ink)]'}>
                    {tab.icon}
                  </span>
                  <span
                    className={`font-mono-tabular text-[9px] sm:text-[10px] transition-colors ${
                      isActive ? 'text-[var(--accent-primary)] font-bold' : 'text-[var(--text-muted)]/70'
                    }`}
                  >
                    {tab.num}
                  </span>
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium tracking-tight truncate max-w-full mt-0.5">
                  {tab.shortLabel}
                </span>

                {/* Active Ledger Underline Bar */}
                {isActive && (
                  <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-[var(--accent-primary)] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

export default Header;
