import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Book,
  LibraryBundle,
  UserLocalState,
  EnrichmentCacheMap,
  BookUserOverride,
  KindleClipping,
} from './types/library';
import {
  DEFAULT_USER_STATE,
  loadUserState,
  saveUserState,
  loadEnrichmentCache,
  saveEnrichmentBatch,
} from './lib/storage/localStateClient';
import { enrichSingleBook } from './lib/enrichment/metadataEnricher';
import { Header, TabId } from './components/Header';
import { StudyView } from './components/StudyView';
import { LibraryView } from './components/LibraryView';
import { OracleView } from './components/OracleView';
import { ObservatoryView } from './components/ObservatoryView';
import { BookDossierDrawer } from './components/BookDossierDrawer';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { ImportModal } from './components/ImportModal';
import { EnrichmentModal } from './components/EnrichmentModal';
import { BookOpen, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  // Theme state with safe localStorage persistence (works in file:// and sandboxed iframes)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('exlibris_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // Sandboxed iframe or restricted storage
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try {
      localStorage.setItem('exlibris_theme', theme);
    } catch {
      // Sandboxed iframe or restricted storage
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Bundle loading state
  const [bundle, setBundle] = useState<LibraryBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // User Local State (overrides, clippings, cover settings)
  const [userState, setUserState] = useState<UserLocalState>(DEFAULT_USER_STATE);

  // Enrichment Metadata Cache Map
  const [enrichmentCache, setEnrichmentCache] = useState<EnrichmentCacheMap>({});

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<TabId>('study');

  // Selected book for dossier drawer
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState(false);

  // Modals state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEnrichOpen, setIsEnrichOpen] = useState(false);

  // Initial filter passed to LibraryView if navigated from another tab
  const [libraryFilter, setLibraryFilter] = useState<{ shelf?: string; rating?: number } | undefined>(
    undefined
  );

  // Fetch initial library bundle + user state + enrichment cache
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const inlineBundle = (
        window as unknown as { __EXLIBRIS_INLINE_BUNDLE__?: LibraryBundle }
      ).__EXLIBRIS_INLINE_BUNDLE__;

      const loadBundle = async (): Promise<LibraryBundle> => {
        if (inlineBundle) {
          try {
            const cachedRaw = window.localStorage?.getItem('exlibris_library_bundle_v02');
            if (cachedRaw) {
              return JSON.parse(cachedRaw) as LibraryBundle;
            }
          } catch {
            // Ignore localStorage parse/access issues in file:// contexts
          }
          return inlineBundle;
        }
        const bundleRes = await fetch('./data/library_bundle.json');
        if (!bundleRes.ok) {
          throw new Error(
            `Failed to load archive dataset: HTTP ${bundleRes.status} ${bundleRes.statusText}`
          );
        }
        return (await bundleRes.json()) as LibraryBundle;
      };

      const [bundleData, loadedUserState, loadedEnrichmentCache] = await Promise.all([
        loadBundle(),
        loadUserState(),
        loadEnrichmentCache(),
      ]);

      setBundle(bundleData);
      setUserState(loadedUserState);
      setEnrichmentCache(loadedEnrichmentCache);
    } catch (err: any) {
      console.error('Error loading library data:', err);
      setLoadError(err?.message || 'Could not load library bundle.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Global keyboard shortcuts (Cmd/Ctrl+K, Esc, 1-4 tabs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
        return;
      }

      if (!isInput) {
        if (e.key === '1') setActiveTab('study');
        if (e.key === '2') setActiveTab('library');
        if (e.key === '3') setActiveTab('oracle');
        if (e.key === '4') setActiveTab('observatory');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update book user override handler (persists via saveUserState)
  const handleUpdateBookOverride = useCallback(
    (bookId: string, patch: Partial<BookUserOverride>) => {
      setUserState((prev) => {
        const existing = prev.bookOverrides[bookId] || {};
        const updatedOverride: BookUserOverride = { ...existing, ...patch };
        const nextState: UserLocalState = {
          ...prev,
          updatedAt: new Date().toISOString(),
          bookOverrides: {
            ...prev.bookOverrides,
            [bookId]: updatedOverride,
          },
        };
        saveUserState(nextState);
        return nextState;
      });
    },
    []
  );

  // Toggle book cover visibility in cards & dossier
  const handleToggleCovers = useCallback(() => {
    setUserState((prev) => {
      const nextState: UserLocalState = {
        ...prev,
        showCovers: !prev.showCovers,
        updatedAt: new Date().toISOString(),
      };
      saveUserState(nextState);
      return nextState;
    });
  }, []);

  // Handle incoming Kindle clippings (merges deduplicated by id)
  const handleClippingsImported = useCallback((incoming: KindleClipping[]) => {
    setUserState((prev) => {
      const existingMap = new Map<string, KindleClipping>();
      for (const clip of prev.kindleClippings) {
        existingMap.set(clip.id, clip);
      }
      for (const clip of incoming) {
        existingMap.set(clip.id, clip);
      }
      const mergedClippings = Array.from(existingMap.values());
      const nextState: UserLocalState = {
        ...prev,
        updatedAt: new Date().toISOString(),
        kindleClippings: mergedClippings,
      };
      saveUserState(nextState);
      return nextState;
    });
  }, []);

  // Handle batch of enriched books flushed from modal
  const handleEnrichmentBatch = useCallback(async (batch: EnrichmentCacheMap) => {
    setEnrichmentCache((prev) => {
      const merged = { ...prev, ...batch };
      return merged;
    });
    await saveEnrichmentBatch(batch);
  }, []);

  // Enrich a single book on demand from dossier drawer
  const handleEnrichSingleBook = useCallback(async (book: Book) => {
    const enriched = await enrichSingleBook(book);
    const batch: EnrichmentCacheMap = { [book.id]: enriched };
    setEnrichmentCache((prev) => ({ ...prev, ...batch }));
    await saveEnrichmentBatch(batch);
  }, []);

  // Open dossier for a specific book
  const handleSelectBook = useCallback((book: Book) => {
    setSelectedBook(book);
    setIsDossierOpen(true);
  }, []);

  // Open dossier by ID or title lookup
  const handleSelectBookById = useCallback(
    (bookId: string | null, fallbackTitle?: string) => {
      if (!bundle) return;
      let match: Book | undefined;

      if (bookId) {
        match = bundle.books.find((b) => b.id === bookId);
      }
      if (!match && fallbackTitle) {
        const q = fallbackTitle.toLowerCase().trim();
        match = bundle.books.find(
          (b) =>
            b.title.toLowerCase().includes(q) || b.cleanTitle.toLowerCase().includes(q)
        );
      }

      if (match) {
        setSelectedBook(match);
        setIsDossierOpen(true);
      }
    },
    [bundle]
  );

  // Prev / Next book navigation within Dossier
  const booksList = useMemo(() => bundle?.books || [], [bundle]);
  const currentBookIndex = useMemo(() => {
    if (!selectedBook || booksList.length === 0) return -1;
    return booksList.findIndex((b) => b.id === selectedBook.id);
  }, [selectedBook, booksList]);

  const handlePrevBook = useCallback(() => {
    if (booksList.length === 0 || currentBookIndex < 0) return;
    const prevIdx = (currentBookIndex - 1 + booksList.length) % booksList.length;
    setSelectedBook(booksList[prevIdx]);
  }, [booksList, currentBookIndex]);

  const handleNextBook = useCallback(() => {
    if (booksList.length === 0 || currentBookIndex < 0) return;
    const nextIdx = (currentBookIndex + 1) % booksList.length;
    setSelectedBook(booksList[nextIdx]);
  }, [booksList, currentBookIndex]);

  // Navigate to Library with a specific filter
  const handleGoToLibraryWithFilter = useCallback(
    (filter: { shelf?: string; rating?: number }) => {
      setLibraryFilter(filter);
      setActiveTab('library');
    },
    []
  );

  // Update bundle on new import
  const handleBundleUpdated = useCallback((newBundle: LibraryBundle) => {
    setBundle(newBundle);
  }, []);

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-canvas)] text-[var(--text-ink)]">
        <div className="p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-md text-center max-w-sm flex flex-col items-center">
          <div className="w-12 h-12 rounded-lg bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center mb-4">
            <BookOpen className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="font-serif-editorial text-xl font-bold">EX LIBRIS</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 mb-4">
            Opening reading archive &amp; observatory...
          </p>
          <Loader2 className="w-5 h-5 text-[var(--accent-primary)] animate-spin" />
        </div>
      </div>
    );
  }

  // Error Screen
  if (loadError || !bundle) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg-canvas)] text-[var(--text-ink)]">
        <div className="p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--accent-primary)]/40 shadow-md text-center max-w-md flex flex-col items-center">
          <AlertCircle className="w-10 h-10 text-[var(--accent-primary)] mb-3" />
          <h2 className="font-serif-editorial text-xl font-bold">Unable to Load Archive</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 mb-5">
            {loadError || 'The library archive bundle could not be retrieved.'}
          </p>
          <button
            onClick={loadInitialData}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent-primary)] text-white text-xs font-semibold cursor-pointer hover:opacity-90"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  const enrichedCount = Object.keys(enrichmentCache).length;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--text-ink)]">
      {/* 1. Universal Top Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenEnrichModal={() => setIsEnrichOpen(true)}
        showCovers={userState.showCovers}
        onToggleCovers={handleToggleCovers}
        theme={theme}
        onToggleTheme={toggleTheme}
        totalBooks={bundle.books.length}
        enrichedCount={enrichedCount}
      />

      {/* 2. Main Content Views Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'study' && (
          <StudyView
            bundle={bundle}
            userState={userState}
            enrichmentCache={enrichmentCache}
            onUpdateBookOverride={handleUpdateBookOverride}
            onSelectBook={handleSelectBook}
            onSelectBookById={handleSelectBookById}
            onGoToOracle={() => setActiveTab('oracle')}
            onGoToLibraryWithFilter={handleGoToLibraryWithFilter}
            onOpenImport={() => setIsImportOpen(true)}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            books={bundle.books}
            onSelectBook={handleSelectBook}
            initialFilter={libraryFilter}
            userState={userState}
            enrichmentCache={enrichmentCache}
          />
        )}

        {activeTab === 'oracle' && (
          <OracleView
            bundle={bundle}
            onSelectBook={handleSelectBook}
            onSelectBookById={handleSelectBookById}
            userState={userState}
            enrichmentCache={enrichmentCache}
            onOpenEnrichModal={() => setIsEnrichOpen(true)}
          />
        )}

        {activeTab === 'observatory' && (
          <ObservatoryView
            bundle={bundle}
            onSelectBook={handleSelectBook}
            onSelectBookById={handleSelectBookById}
            userState={userState}
            enrichmentCache={enrichmentCache}
            onOpenEnrichModal={() => setIsEnrichOpen(true)}
          />
        )}
      </main>

      {/* 3. Scholarly Ledger Footer */}
      <footer className="w-full border-t border-[var(--border-ledger)] bg-[var(--bg-surface)] py-6 text-xs text-[var(--text-muted)] font-mono-tabular">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
              EX LIBRIS
            </span>
            <span>·</span>
            <span>Reading Archive &amp; Literary Observatory</span>
          </div>

          <div className="flex items-center gap-4">
            <span>{bundle.books.length} Cataloged Works</span>
            <span>·</span>
            <span>
              Press{' '}
              <kbd className="px-1 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[10px]">
                1
              </kbd>
              –
              <kbd className="px-1 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[10px]">
                4
              </kbd>{' '}
              to Navigate
            </span>
            <span>·</span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[10px]">
                ⌘K
              </kbd>{' '}
              Search
            </span>
          </div>
        </div>
      </footer>

      {/* 4. Deep Book Dossier Drawer */}
      {React.createElement(BookDossierDrawer as React.ComponentType<any>, {
        book: selectedBook,
        isOpen: isDossierOpen,
        onClose: () => setIsDossierOpen(false),
        onPrevBook: handlePrevBook,
        onNextBook: handleNextBook,
        onSelectBookById: handleSelectBookById,
        allKindleNotes: bundle.kindleNotes,
        userState: userState,
        onUpdateBookOverride: handleUpdateBookOverride,
        enrichmentCache: enrichmentCache,
        onEnrichBook: handleEnrichSingleBook,
      })}

      {/* 5. Command Palette Modal (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        books={bundle.books}
        onSelectBook={handleSelectBook}
      />

      {/* 6. Import Archive Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        currentBundle={bundle}
        onBundleUpdated={handleBundleUpdated}
        onClippingsImported={handleClippingsImported}
      />

      {/* 7. Metadata Enrichment Modal */}
      <EnrichmentModal
        isOpen={isEnrichOpen}
        onClose={() => setIsEnrichOpen(false)}
        books={bundle.books}
        enrichmentCache={enrichmentCache}
        userState={userState}
        onToggleCovers={handleToggleCovers}
        onBatchFlushed={handleEnrichmentBatch}
      />
    </div>
  );
};

export default App;
