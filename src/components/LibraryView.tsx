import React, { useState, useMemo } from 'react';
import {
  Book,
  EnrichmentCacheMap,
  LanguageCode,
  BookFormat,
  UserLocalState,
} from '../types/library';
import {
  classifyBookLanguageAndFormat,
  FORMAT_LABELS,
  LANGUAGE_LABELS,
} from '../lib/classifiers/languageAndFormat';
import { formatPublicationYear, getSpineStyle } from '../lib/formatters';
import {
  Search,
  Grid,
  AlignJustify,
  Star,
  BookOpen,
  X,
  Layers,
  ChevronDown,
  RotateCcw,
  Feather,
  Globe,
  Languages,
  PauseCircle,
  FileText,
  BookmarkCheck,
  Sparkles,
} from 'lucide-react';

export type ViewMode = 'cards' | 'shelf' | 'ledger';

interface LibraryViewProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  initialFilter?: { shelf?: string; rating?: number };
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  onSelectBook,
  initialFilter,
  userState,
  enrichmentCache,
}) => {
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShelf, setSelectedShelf] = useState<string>(initialFilter?.shelf || 'all');
  const [selectedRating, setSelectedRating] = useState<string>(
    initialFilter?.rating !== undefined ? String(initialFilter.rating) : 'all'
  );
  const [selectedLength, setSelectedLength] = useState<string>('all');
  const [selectedEra, setSelectedEra] = useState<string>('all');

  // 4 v0.2 Language & Format filters
  const [selectedEditionLang, setSelectedEditionLang] = useState<string>('all');
  const [selectedOriginalLang, setSelectedOriginalLang] = useState<string>('all');
  const [selectedTranslationMode, setSelectedTranslationMode] = useState<'all' | 'original' | 'translated'>('all');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');

  // Boolean toggles
  const [seriesOnly, setSeriesOnly] = useState(false);
  const [hasReviewOnly, setHasReviewOnly] = useState(false);
  const [kindleNotesOnly, setKindleNotesOnly] = useState(false);
  const [multiSessionOnly, setMultiSessionOnly] = useState(false);
  const [onHoldOnly, setOnHoldOnly] = useState(false);
  const [hasClippingsOnly, setHasClippingsOnly] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState<string>('dateReadDesc');

  // Hovered spine popover
  const [hoveredBook, setHoveredBook] = useState<Book | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  // Pagination for heavy lists (cards and ledger)
  const [visibleCount, setVisibleCount] = useState(48);

  // Pre-calculate books with clippings
  const clippingsBookIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of userState?.kindleClippings || []) {
      if (c.matchedBookId) set.add(c.matchedBookId);
    }
    return set;
  }, [userState?.kindleClippings]);

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedShelf('all');
    setSelectedRating('all');
    setSelectedLength('all');
    setSelectedEra('all');
    setSelectedEditionLang('all');
    setSelectedOriginalLang('all');
    setSelectedTranslationMode('all');
    setSelectedFormat('all');
    setSeriesOnly(false);
    setHasReviewOnly(false);
    setKindleNotesOnly(false);
    setMultiSessionOnly(false);
    setOnHoldOnly(false);
    setHasClippingsOnly(false);
    setSortBy('dateReadDesc');
    setVisibleCount(48);
  };

  // Filtered & Sorted books calculation
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const override = userState?.bookOverrides?.[book.id];
      const enriched = enrichmentCache?.[book.id];
      const profile = classifyBookLanguageAndFormat(book, override, enriched);

      // 1. Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle =
          book.title?.toLowerCase().includes(q) || book.cleanTitle?.toLowerCase().includes(q);
        const matchesAuthor =
          book.author?.toLowerCase().includes(q) ||
          book.additionalAuthors?.some((a) => a.toLowerCase().includes(q));
        const matchesSeries = book.seriesName?.toLowerCase().includes(q);
        const matchesIsbn = book.isbn?.includes(q) || book.isbn13?.includes(q);
        const matchesReview = book.myReview?.toLowerCase().includes(q);
        const matchesTranslator = profile.translators.some((t) => t.toLowerCase().includes(q));
        if (
          !matchesTitle &&
          !matchesAuthor &&
          !matchesSeries &&
          !matchesIsbn &&
          !matchesReview &&
          !matchesTranslator
        ) {
          return false;
        }
      }

      // 2. Shelf filter
      if (selectedShelf !== 'all') {
        if (selectedShelf === 'favorites') {
          const isFav = book.myRating === 5 || book.bookshelves?.includes('favorites');
          if (!isFav) return false;
        } else if (book.exclusiveShelf !== selectedShelf) {
          return false;
        }
      }

      // 3. Rating filter
      if (selectedRating !== 'all') {
        if (selectedRating === 'unrated') {
          if (book.myRating !== null && book.myRating > 0) return false;
        } else {
          const rNum = parseInt(selectedRating, 10);
          if (book.myRating !== rNum) return false;
        }
      }

      // 4. Page length
      if (selectedLength !== 'all') {
        const pages = book.pageCount || 0;
        if (selectedLength === 'novella' && !(pages > 0 && pages < 200)) return false;
        if (selectedLength === 'standard' && !(pages >= 200 && pages <= 400)) return false;
        if (selectedLength === 'hefty' && !(pages > 400 && pages <= 700)) return false;
        if (selectedLength === 'tome' && !(pages > 700)) return false;
      }

      // 5. Era filter
      if (selectedEra !== 'all') {
        const yr = book.originalPublicationYear || book.yearPublished;
        if (selectedEra === 'classical') {
          if (!yr || yr >= 500) return false;
        } else if (selectedEra === 'pre-modern') {
          if (!yr || yr < 500 || yr > 1800) return false;
        } else if (selectedEra === '19th') {
          if (!yr || yr < 1801 || yr > 1900) return false;
        } else if (selectedEra === '20th') {
          if (!yr || yr < 1901 || yr > 2000) return false;
        } else if (selectedEra === 'contemporary') {
          if (!yr || yr < 2001) return false;
        }
      }

      // 6. v0.2 Language filters
      if (selectedEditionLang !== 'all') {
        if (selectedEditionLang === 'Other') {
          if (['EN', 'TR', 'FR'].includes(profile.editionLanguage)) return false;
        } else if (profile.editionLanguage !== selectedEditionLang) {
          return false;
        }
      }

      if (selectedOriginalLang !== 'all') {
        if (selectedOriginalLang === 'Other') {
          if (['EN', 'TR', 'FR', 'DE', 'RU', 'JA', 'PL', 'ZH', 'GRC'].includes(profile.originalLanguage)) {
            return false;
          }
        } else if (profile.originalLanguage !== selectedOriginalLang) {
          return false;
        }
      }

      // 7. Translation Mode filter
      if (selectedTranslationMode !== 'all') {
        if (selectedTranslationMode === 'original' && profile.isTranslation) return false;
        if (selectedTranslationMode === 'translated' && !profile.isTranslation) return false;
      }

      // 8. Format filter
      if (selectedFormat !== 'all') {
        if (profile.format !== selectedFormat) return false;
      }

      // 9. Boolean toggles
      if (seriesOnly && !book.seriesName) return false;
      if (hasReviewOnly && !book.myReview?.trim()) return false;
      if (kindleNotesOnly && (!book.kindleNotes || book.kindleNotes.length === 0)) return false;
      if (
        multiSessionOnly &&
        !(book.readCount > 1 || (book.readingSessions && book.readingSessions.length > 1))
      ) {
        return false;
      }
      if (onHoldOnly && override?.nightstandState !== 'on-hold') return false;
      if (hasClippingsOnly && !clippingsBookIdSet.has(book.id)) return false;

      return true;
    });
  }, [
    books,
    userState,
    enrichmentCache,
    searchQuery,
    selectedShelf,
    selectedRating,
    selectedLength,
    selectedEra,
    selectedEditionLang,
    selectedOriginalLang,
    selectedTranslationMode,
    selectedFormat,
    seriesOnly,
    hasReviewOnly,
    kindleNotesOnly,
    multiSessionOnly,
    onHoldOnly,
    hasClippingsOnly,
    clippingsBookIdSet,
  ]);

  // Sorting logic
  const sortedBooks = useMemo(() => {
    return [...filteredBooks].sort((a, b) => {
      switch (sortBy) {
        case 'dateReadDesc': {
          const dA = a.dateRead || '1970-01-01';
          const dB = b.dateRead || '1970-01-01';
          return dB.localeCompare(dA);
        }
        case 'dateReadAsc': {
          const dA = a.dateRead || '9999-99-99';
          const dB = b.dateRead || '9999-99-99';
          return dA.localeCompare(dB);
        }
        case 'dateAddedDesc': {
          const dA = a.dateAdded || '1970-01-01';
          const dB = b.dateAdded || '1970-01-01';
          return dB.localeCompare(dA);
        }
        case 'ratingDesc': {
          const rA = a.myRating ?? -1;
          const rB = b.myRating ?? -1;
          if (rB !== rA) return rB - rA;
          return (b.averageRating ?? 0) - (a.averageRating ?? 0);
        }
        case 'ratingAsc': {
          const rA = a.myRating ?? 999;
          const rB = b.myRating ?? 999;
          if (rA !== rB) return rA - rB;
          return (a.averageRating ?? 0) - (b.averageRating ?? 0);
        }
        case 'titleAsc':
          return (a.cleanTitle || a.title).localeCompare(b.cleanTitle || b.title);
        case 'authorAsc':
          return (a.authorSort || a.author).localeCompare(b.authorSort || b.author);
        case 'pagesDesc':
          return (b.pageCount || 0) - (a.pageCount || 0);
        case 'pagesAsc':
          return (a.pageCount || 0) - (b.pageCount || 0);
        case 'pubYearAsc': {
          const yA = a.originalPublicationYear || a.yearPublished || 9999;
          const yB = b.originalPublicationYear || b.yearPublished || 9999;
          return yA - yB;
        }
        case 'pubYearDesc': {
          const yA = a.originalPublicationYear || a.yearPublished || -9999;
          const yB = b.originalPublicationYear || b.yearPublished || -9999;
          return yB - yA;
        }
        default:
          return 0;
      }
    });
  }, [filteredBooks, sortBy]);

  const visibleBooks = sortedBooks.slice(0, visibleCount);
  const isFiltered =
    searchQuery.trim() !== '' ||
    selectedShelf !== 'all' ||
    selectedRating !== 'all' ||
    selectedLength !== 'all' ||
    selectedEra !== 'all' ||
    selectedEditionLang !== 'all' ||
    selectedOriginalLang !== 'all' ||
    selectedTranslationMode !== 'all' ||
    selectedFormat !== 'all' ||
    seriesOnly ||
    hasReviewOnly ||
    kindleNotesOnly ||
    multiSessionOnly ||
    onHoldOnly ||
    hasClippingsOnly;

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border-ledger)]">
        <div>
          <h1 className="font-serif-editorial text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-ink)]">
            The Library
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-mono-tabular mt-0.5">
            Showing <strong className="text-[var(--text-ink)]">{sortedBooks.length}</strong> of{' '}
            {books.length} volumes in catalog
          </p>
        </div>

        {/* Tri-Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-surface)] border border-[var(--border-ledger)] rounded-lg self-start sm:self-auto">
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-[var(--bg-card)] text-[var(--text-ink)] shadow-2xs font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
            title="Index Cards View"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Index Cards</span>
          </button>

          <button
            onClick={() => setViewMode('shelf')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'shelf'
                ? 'bg-[var(--bg-card)] text-[var(--text-ink)] shadow-2xs font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
            title="Physical Spine Shelf View"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Spine Shelf</span>
          </button>

          <button
            onClick={() => setViewMode('ledger')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'ledger'
                ? 'bg-[var(--bg-card)] text-[var(--text-ink)] shadow-2xs font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
            title="Archival Data Ledger View"
          >
            <AlignJustify className="w-3.5 h-3.5" />
            <span>Data Ledger</span>
          </button>
        </div>
      </div>

      {/* 2. Multi-faceted Filter Console */}
      <section
        aria-label="Filter Console"
        className="p-4 sm:p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-4"
      >
        {/* Row 1: Search & Sort */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(48);
              }}
              placeholder="Search title, author, translator, series, ISBN, or notes..."
              className="w-full pl-9 pr-9 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs sm:text-sm text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-[var(--text-muted)] font-medium">Sort by:</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-medium text-[var(--text-ink)] focus:outline-none focus:border-[var(--accent-primary)] cursor-pointer"
              >
                <option value="dateReadDesc">Date Read (Newest first)</option>
                <option value="dateReadAsc">Date Read (Oldest first)</option>
                <option value="dateAddedDesc">Date Added (Newest first)</option>
                <option value="ratingDesc">Rating (High to Low)</option>
                <option value="ratingAsc">Rating (Low to High)</option>
                <option value="titleAsc">Title (A to Z)</option>
                <option value="authorAsc">Author (A to Z)</option>
                <option value="pagesDesc">Page Count (Thickest)</option>
                <option value="pagesAsc">Page Count (Slimmest)</option>
                <option value="pubYearAsc">Pub Year (Oldest / Classical)</option>
                <option value="pubYearDesc">Pub Year (Newest)</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
            </div>

            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1 px-2.5 py-2 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-surface)] text-xs text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]/40 transition-colors cursor-pointer"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Shelf Pills & Star Rating Pills */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-[var(--border-ledger)]/60">
          {/* Shelf Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold mr-1">
              Shelf:
            </span>
            {[
              { id: 'all', label: 'All Shelves' },
              { id: 'read', label: 'Read' },
              { id: 'currently-reading', label: 'On Desk' },
              { id: 'to-read', label: 'To-Read' },
              { id: 'did-not-finish', label: 'DNF' },
              { id: 'favorites', label: '★ Favorites' },
            ].map((shelf) => (
              <button
                key={shelf.id}
                onClick={() => {
                  setSelectedShelf(shelf.id);
                  setVisibleCount(48);
                }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  selectedShelf === shelf.id
                    ? 'bg-[var(--accent-primary)] text-white font-semibold shadow-2xs'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] border border-[var(--border-ledger)]'
                }`}
              >
                {shelf.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-[var(--border-ledger)] hidden lg:block" />

          {/* Star Rating Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold mr-1">
              Rating:
            </span>
            {[
              { id: 'all', label: 'All' },
              { id: '5', label: '5★' },
              { id: '4', label: '4★' },
              { id: '3', label: '3★' },
              { id: '2', label: '2★' },
              { id: '1', label: '1★' },
              { id: 'unrated', label: 'Unrated' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRating(r.id);
                  setVisibleCount(48);
                }}
                className={`px-2 py-0.5 rounded text-xs font-medium font-mono-tabular transition-colors cursor-pointer ${
                  selectedRating === r.id
                    ? 'bg-[var(--accent-gold)] text-black font-bold shadow-2xs'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] border border-[var(--border-ledger)]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: v0.2 Language Passport & Format Filter Console */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-ledger)]/60 text-xs">
          {/* Reading Edition Language */}
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[var(--accent-secondary)] shrink-0" />
            <span className="text-[var(--text-muted)] shrink-0">Reading Lang:</span>
            <select
              value={selectedEditionLang}
              onChange={(e) => {
                setSelectedEditionLang(e.target.value);
                setVisibleCount(48);
              }}
              className="w-full py-1 px-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] cursor-pointer truncate"
            >
              <option value="all">All Languages</option>
              <option value="EN">English (EN)</option>
              <option value="TR">Turkish (TR)</option>
              <option value="FR">French (FR)</option>
              <option value="Other">Other Languages</option>
            </select>
          </div>

          {/* Original Language */}
          <div className="flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-[var(--accent-gold)] shrink-0" />
            <span className="text-[var(--text-muted)] shrink-0">Original Lang:</span>
            <select
              value={selectedOriginalLang}
              onChange={(e) => {
                setSelectedOriginalLang(e.target.value);
                setVisibleCount(48);
              }}
              className="w-full py-1 px-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] cursor-pointer truncate"
            >
              <option value="all">All Originals</option>
              <option value="EN">English (EN)</option>
              <option value="TR">Turkish (TR)</option>
              <option value="FR">French (FR)</option>
              <option value="DE">German (DE)</option>
              <option value="RU">Russian (RU)</option>
              <option value="JA">Japanese (JA)</option>
              <option value="PL">Polish (PL)</option>
              <option value="ZH">Chinese (ZH)</option>
              <option value="GRC">Ancient Greek (GRC)</option>
              <option value="Other">ES/IT/PT/Other</option>
            </select>
          </div>

          {/* Translation Mode */}
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)] shrink-0">Translation:</span>
            <select
              value={selectedTranslationMode}
              onChange={(e) => {
                setSelectedTranslationMode(e.target.value as any);
                setVisibleCount(48);
              }}
              className="w-full py-1 px-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] cursor-pointer truncate"
            >
              <option value="all">All Works</option>
              <option value="original">Read in Original</option>
              <option value="translated">Read in Translation</option>
            </select>
          </div>

          {/* Format */}
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--text-muted)] shrink-0">Format:</span>
            <select
              value={selectedFormat}
              onChange={(e) => {
                setSelectedFormat(e.target.value);
                setVisibleCount(48);
              }}
              className="w-full py-1 px-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] cursor-pointer truncate"
            >
              <option value="all">All Formats</option>
              <option value="prose">Prose</option>
              <option value="comic-manga">Graphic Novel / Manga</option>
              <option value="short-essay">Short / Essay (&lt;80p)</option>
              <option value="academic-ref">Academic / Reference</option>
            </select>
          </div>
        </div>

        {/* Row 4: Length, Era, & Feature Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-ledger)]/60 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Length Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">Length:</span>
              <select
                value={selectedLength}
                onChange={(e) => {
                  setSelectedLength(e.target.value);
                  setVisibleCount(48);
                }}
                className="py-1 px-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] cursor-pointer"
              >
                <option value="all">All Lengths</option>
                <option value="novella">&lt; 200 pp (Novella)</option>
                <option value="standard">200–400 pp (Standard)</option>
                <option value="hefty">400–700 pp (Hefty)</option>
                <option value="tome">700+ pp (Tome)</option>
              </select>
            </div>

            {/* Era Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-muted)]">Era:</span>
              <select
                value={selectedEra}
                onChange={(e) => {
                  setSelectedEra(e.target.value);
                  setVisibleCount(48);
                }}
                className="py-1 px-2 rounded bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] cursor-pointer"
              >
                <option value="all">All Eras</option>
                <option value="classical">Classical / BCE (&lt; 500)</option>
                <option value="pre-modern">Pre-Modern (500–1800)</option>
                <option value="19th">19th Century (1801–1900)</option>
                <option value="20th">20th Century (1901–2000)</option>
                <option value="contemporary">Contemporary (2001+)</option>
              </select>
            </div>
          </div>

          {/* Boolean Feature Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              {
                label: 'On Hold',
                active: onHoldOnly,
                icon: <PauseCircle className="w-3 h-3" />,
                toggle: () => setOnHoldOnly(!onHoldOnly),
              },
              {
                label: 'Has Clippings',
                active: hasClippingsOnly,
                icon: <BookmarkCheck className="w-3 h-3" />,
                toggle: () => setHasClippingsOnly(!hasClippingsOnly),
              },
              {
                label: 'Series Only',
                active: seriesOnly,
                icon: null,
                toggle: () => setSeriesOnly(!seriesOnly),
              },
              {
                label: 'Has Review',
                active: hasReviewOnly,
                icon: null,
                toggle: () => setHasReviewOnly(!hasReviewOnly),
              },
              {
                label: 'Kindle Notes',
                active: kindleNotesOnly,
                icon: null,
                toggle: () => setKindleNotesOnly(!kindleNotesOnly),
              },
              {
                label: 'Multi-Session',
                active: multiSessionOnly,
                icon: null,
                toggle: () => setMultiSessionOnly(!multiSessionOnly),
              },
            ].map((chip, idx) => (
              <button
                key={idx}
                onClick={chip.toggle}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer border ${
                  chip.active
                    ? 'bg-[var(--accent-secondary)] text-white border-[var(--accent-secondary)] font-semibold shadow-2xs'
                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-ledger)] hover:text-[var(--text-ink)]'
                }`}
              >
                {chip.icon}
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Empty State */}
      {sortedBooks.length === 0 && (
        <div className="py-16 text-center rounded-lg bg-[var(--bg-card)] border border-dashed border-[var(--border-ledger)]">
          <BookOpen className="w-10 h-10 text-[var(--text-muted)]/50 mx-auto mb-3" />
          <h3 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
            No matching volumes found
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto mt-1 mb-4">
            No books in your catalog match the current combination of filters and search queries.
          </p>
          <button
            onClick={handleResetFilters}
            className="px-3.5 py-1.5 rounded-md bg-[var(--accent-primary)] text-white text-xs font-medium cursor-pointer shadow-xs hover:opacity-95"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* 4. MODE 1: Index Cards View */}
      {viewMode === 'cards' && sortedBooks.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {visibleBooks.map((book) => {
              const override = userState?.bookOverrides?.[book.id];
              const enriched = enrichmentCache?.[book.id];
              const profile = classifyBookLanguageAndFormat(book, override, enriched);
              const pubYear = book.originalPublicationYear || book.yearPublished;
              const formattedYear = formatPublicationYear(pubYear);
              const showCover = userState?.showCovers && enriched?.coverUrl;

              // Page progress
              const totalPages = book.pageCount || 0;
              const currentPage = override?.currentPage ?? null;
              const hasProgress = currentPage !== null && currentPage > 0 && totalPages > 0;
              const progressPct = hasProgress
                ? Math.min(100, Math.round((currentPage / totalPages) * 100))
                : 0;

              const isOnHold = override?.nightstandState === 'on-hold';
              const hasClippings = clippingsBookIdSet.has(book.id);

              return (
                <div
                  key={book.id}
                  onClick={() => onSelectBook(book)}
                  className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
                >
                  {/* Subtle card top accent line based on shelf */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${
                      isOnHold
                        ? 'bg-amber-500'
                        : book.exclusiveShelf === 'currently-reading'
                        ? 'bg-[var(--accent-primary)]'
                        : book.exclusiveShelf === 'read'
                        ? 'bg-[var(--accent-secondary)]'
                        : book.exclusiveShelf === 'did-not-finish'
                        ? 'bg-[var(--text-muted)]'
                        : 'bg-[var(--accent-gold)]'
                    }`}
                  />

                  <div>
                    {/* Shelf & Year Header */}
                    <div className="flex items-center justify-between gap-2 mb-2 text-[11px] font-mono-tabular">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded uppercase font-semibold text-[10px] ${
                            book.exclusiveShelf === 'read'
                              ? 'bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]'
                              : book.exclusiveShelf === 'currently-reading'
                              ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                              : book.exclusiveShelf === 'did-not-finish'
                              ? 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                              : 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]'
                          }`}
                        >
                          {book.exclusiveShelf === 'currently-reading' ? 'On Desk' : book.exclusiveShelf}
                        </span>

                        {isOnHold && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            On Hold
                          </span>
                        )}
                      </div>

                      {formattedYear && (
                        <span className="text-[var(--text-muted)]">{formattedYear}</span>
                      )}
                    </div>

                    {/* Series Indicator */}
                    {book.seriesName && (
                      <div className="text-[11px] font-medium text-[var(--accent-secondary)] mb-1 truncate">
                        {book.seriesName} {book.seriesNumber ? `#${book.seriesNumber}` : ''}
                      </div>
                    )}

                    {/* Cover thumbnail + Title Layout */}
                    <div className="flex gap-3 items-start">
                      {showCover && (
                        <img
                          src={enriched.coverUrl!}
                          alt={book.title}
                          className="w-12 h-18 object-cover rounded shadow-xs shrink-0 border border-[var(--border-ledger)]"
                          loading="lazy"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors leading-snug line-clamp-2">
                          {book.cleanTitle || book.title}
                        </h3>

                        <p className="text-xs text-[var(--text-muted)] mt-1 font-medium truncate">
                          by <span className="text-[var(--text-ink)]">{book.author}</span>
                        </p>
                      </div>
                    </div>

                    {/* v0.2 Language Passport & Format Tags */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-mono-tabular">
                      {/* Language flow */}
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          profile.isTranslation
                            ? 'bg-[var(--accent-gold)]/15 text-amber-900 dark:text-amber-200 border border-[var(--accent-gold)]/30'
                            : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-ledger)]'
                        }`}
                        title={
                          profile.translators.length > 0
                            ? `Translated by ${profile.translators.join(', ')}`
                            : profile.translationFlow
                        }
                      >
                        {profile.translationFlow}
                        {profile.translators.length > 0
                          ? ` · tr. ${profile.translators[0]}`
                          : ''}
                      </span>

                      {/* Format tag */}
                      <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-ledger)]">
                        {FORMAT_LABELS[profile.format]}
                      </span>
                    </div>

                    {/* Progress Bar (if logged) */}
                    {hasProgress && (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono-tabular text-[var(--text-muted)]">
                          <span>
                            p. {currentPage} of {totalPages}
                          </span>
                          <span className="font-semibold text-[var(--accent-primary)]">
                            {progressPct}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent-primary)] transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Personal review snippet */}
                    {book.myReview && (
                      <p className="mt-3 text-xs text-[var(--text-muted)] italic line-clamp-2 border-l-2 border-[var(--border-ledger)] pl-2">
                        “{book.myReview.replace(/<[^>]+>/g, '')}”
                      </p>
                    )}
                  </div>

                  {/* Footer with Rating, Clippings & Pages */}
                  <div className="mt-4 pt-3 border-t border-[var(--border-ledger)]/60 flex items-center justify-between text-xs text-[var(--text-muted)] font-mono-tabular">
                    <div className="flex items-center gap-1">
                      {book.myRating ? (
                        <div className="flex items-center text-[var(--accent-gold)] font-bold">
                          <span>{book.myRating}</span>
                          <Star className="w-3.5 h-3.5 fill-[var(--accent-gold)] ml-0.5" />
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]/60 italic">Unrated</span>
                      )}

                      {book.averageRating && (
                        <span className="text-[11px] text-[var(--text-muted)]/70 ml-1.5">
                          (avg {book.averageRating.toFixed(2)})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {hasClippings && (
                        <span
                          className="flex items-center text-[var(--accent-secondary)]"
                          title="Attached Kindle Clippings"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {book.kindleNotes && book.kindleNotes.length > 0 && (
                        <span
                          className="flex items-center text-[var(--accent-gold)]"
                          title={`${book.kindleNotes.length} notes`}
                        >
                          <Feather className="w-3 h-3" />
                        </span>
                      )}
                      {book.pageCount ? <span>{book.pageCount} pp.</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load More Button */}
          {sortedBooks.length > visibleCount && (
            <div className="text-center pt-4">
              <button
                onClick={() => setVisibleCount((prev) => prev + 48)}
                className="px-6 py-2.5 rounded-md border border-[var(--border-ledger)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-ink)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer shadow-2xs"
              >
                Load Next 48 Volumes ({sortedBooks.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. MODE 2: Physical Spine Shelf View */}
      {viewMode === 'shelf' && sortedBooks.length > 0 && (
        <div className="space-y-12">
          {Array.from({ length: Math.ceil(sortedBooks.length / 22) }).map((_, shelfIdx) => {
            const shelfBooks = sortedBooks.slice(shelfIdx * 22, (shelfIdx + 1) * 22);

            return (
              <div key={shelfIdx} className="relative pt-6">
                {/* Horizontal row of book spines */}
                <div className="flex items-end justify-start gap-1 overflow-x-auto px-4 pb-0 pt-8 min-h-[300px] border-b-8 border-transparent">
                  {shelfBooks.map((book) => {
                    const spine = getSpineStyle(book);
                    const spineWidth =
                      spine?.widthPx ||
                      Math.min(
                        68,
                        Math.max(28, Math.round(((book.pageCount || 300) / 1000) * 36 + 28))
                      );
                    const spineHeight =
                      spine?.heightPx ||
                      Math.min(290, Math.max(230, 240 + ((book.pageCount || 300) % 50)));
                    const accentClass = spine?.accentClass || 'spine-burgundy';

                    return (
                      <div
                        key={book.id}
                        onClick={() => onSelectBook(book)}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredBook(book);
                          setHoverPosition({ x: rect.left, y: rect.top - 12 });
                        }}
                        onMouseLeave={() => setHoveredBook(null)}
                        style={{
                          width: `${spineWidth}px`,
                          height: `${spineHeight}px`,
                        }}
                        className={`book-spine shrink-0 ${accentClass} flex flex-col justify-between p-1.5`}
                      >
                        {/* Top headband */}
                        <div className="spine-ribbon-band rounded-xs shrink-0" />

                        {/* Vertical Rotated Title & Author */}
                        <div className="flex-1 flex flex-col justify-center items-center overflow-hidden py-1">
                          <span className="spine-text-vertical text-xs font-serif-editorial font-bold tracking-tight truncate max-h-[170px] select-none">
                            {book.cleanTitle || book.title}
                          </span>
                          <span className="spine-text-vertical text-[10px] font-mono-tabular opacity-75 mt-1 truncate max-h-[80px] select-none">
                            {book.author}
                          </span>
                        </div>

                        {/* Base Star Pip or Pages */}
                        <div className="shrink-0 flex flex-col items-center justify-center pt-1 border-t border-white/10">
                          {book.myRating ? (
                            <span className="text-[10px] font-bold spine-gold-emboss font-mono-tabular">
                              {book.myRating}★
                            </span>
                          ) : (
                            <span className="text-[9px] opacity-60 font-mono-tabular">
                              {book.pageCount ? `${book.pageCount}p` : ''}
                            </span>
                          )}
                          <div className="spine-ribbon-band rounded-xs mt-1" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Wooden Shelf Ledge */}
                <div className="shelf-wood-ledge h-5 w-full rounded-b-sm shadow-md flex items-center justify-between px-4">
                  <span className="text-[10px] font-mono-tabular tracking-wider text-amber-200/60 uppercase">
                    Bay {shelfIdx + 1}
                  </span>
                  <span className="text-[10px] font-mono-tabular text-amber-200/40">
                    {shelfBooks.length} volumes
                  </span>
                </div>
              </div>
            );
          })}

          {/* Spine Tooltip Popover */}
          {hoveredBook && hoverPosition && (
            <div
              style={{
                position: 'fixed',
                left: `${Math.min(window.innerWidth - 320, Math.max(16, hoverPosition.x - 100))}px`,
                top: `${Math.max(16, hoverPosition.y - 140)}px`,
              }}
              className="z-50 pointer-events-none w-72 p-3.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] shadow-xl transition-all animate-card-draw"
            >
              <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider mb-1">
                <span className="text-[var(--accent-primary)] font-bold">
                  {hoveredBook.exclusiveShelf}
                </span>
                <span className="text-[var(--text-muted)]">
                  {classifyBookLanguageAndFormat(
                    hoveredBook,
                    userState?.bookOverrides?.[hoveredBook.id],
                    enrichmentCache?.[hoveredBook.id]
                  ).translationFlow}
                </span>
              </div>
              <h4 className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] leading-snug">
                {hoveredBook.cleanTitle || hoveredBook.title}
              </h4>
              <p className="text-xs text-[var(--text-muted)] font-medium">by {hoveredBook.author}</p>
              <div className="mt-2 flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)] border-t border-[var(--border-ledger)] pt-1.5">
                <span>
                  {hoveredBook.pageCount ? `${hoveredBook.pageCount} pp.` : 'Pages unlisted'}
                </span>
                <span>
                  {hoveredBook.myRating
                    ? `${hoveredBook.myRating}★ Personal`
                    : `Avg ${hoveredBook.averageRating?.toFixed(2) || '—'}★`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. MODE 3: Archival Data Ledger View */}
      {viewMode === 'ledger' && sortedBooks.length > 0 && (
        <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans-ui">
              <thead className="bg-[var(--bg-surface)] border-b border-[var(--border-ledger)] uppercase tracking-wider text-[11px] font-mono-tabular text-[var(--text-muted)]">
                <tr>
                  <th className="py-3 px-3.5">Title &amp; Series</th>
                  <th className="py-3 px-3">Author</th>
                  <th className="py-3 px-2.5">Language &amp; Format</th>
                  <th className="py-3 px-2.5">Shelf</th>
                  <th className="py-3 px-2 text-center">My ★</th>
                  <th className="py-3 px-2 text-center">Avg ★</th>
                  <th className="py-3 px-2.5 text-right">Pages</th>
                  <th className="py-3 px-2.5 text-right">Orig. Year</th>
                  <th className="py-3 px-3 text-right">Date Read</th>
                  <th className="py-3 px-3 text-center">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-ledger)]/60">
                {visibleBooks.map((book) => {
                  const override = userState?.bookOverrides?.[book.id];
                  const enriched = enrichmentCache?.[book.id];
                  const profile = classifyBookLanguageAndFormat(book, override, enriched);
                  const origYear = formatPublicationYear(
                    book.originalPublicationYear || book.yearPublished
                  );
                  const isOnHold = override?.nightstandState === 'on-hold';
                  const hasClippings = clippingsBookIdSet.has(book.id);

                  return (
                    <tr
                      key={book.id}
                      onClick={() => onSelectBook(book)}
                      className="hover:bg-[var(--bg-surface)]/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-3.5 font-medium max-w-[260px]">
                        <div className="font-serif-editorial text-sm font-bold text-[var(--text-ink)] group-hover:text-[var(--accent-primary)] transition-colors truncate">
                          {book.cleanTitle || book.title}
                        </div>
                        {book.seriesName && (
                          <div className="text-[11px] text-[var(--accent-secondary)] truncate">
                            {book.seriesName} {book.seriesNumber ? `#${book.seriesNumber}` : ''}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-[var(--text-ink)] max-w-[160px] truncate">
                        {book.author}
                      </td>

                      <td className="py-3 px-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 font-mono-tabular text-[10px]">
                          <span
                            className={`px-1.5 py-0.5 rounded font-semibold ${
                              profile.isTranslation
                                ? 'bg-[var(--accent-gold)]/15 text-amber-900 dark:text-amber-200'
                                : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                            }`}
                          >
                            {profile.translationFlow}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            · {FORMAT_LABELS[profile.format]}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono-tabular uppercase font-semibold ${
                              book.exclusiveShelf === 'read'
                                ? 'bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]'
                                : book.exclusiveShelf === 'currently-reading'
                                ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                                : book.exclusiveShelf === 'did-not-finish'
                                ? 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                                : 'bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]'
                            }`}
                          >
                            {book.exclusiveShelf === 'currently-reading' ? 'On Desk' : book.exclusiveShelf}
                          </span>
                          {isOnHold && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              Hold
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-2 text-center font-mono-tabular font-bold text-[var(--accent-gold)]">
                        {book.myRating ? `${book.myRating}★` : '—'}
                      </td>

                      <td className="py-3 px-2 text-center font-mono-tabular text-[var(--text-muted)]">
                        {book.averageRating ? book.averageRating.toFixed(2) : '—'}
                      </td>

                      <td className="py-3 px-2.5 text-right font-mono-tabular text-[var(--text-ink)]">
                        {book.pageCount ? book.pageCount.toLocaleString() : '—'}
                      </td>

                      <td className="py-3 px-2.5 text-right font-mono-tabular text-[var(--text-muted)]">
                        {origYear || '—'}
                      </td>

                      <td className="py-3 px-3 text-right font-mono-tabular text-[var(--text-muted)] whitespace-nowrap">
                        {book.dateRead ? book.dateRead.slice(0, 10) : '—'}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {hasClippings && (
                            <span
                              className="w-2 h-2 rounded-full bg-[var(--accent-secondary)]"
                              title="Kindle clippings"
                            />
                          )}
                          {book.myReview && (
                            <span
                              className="w-2 h-2 rounded-full bg-[var(--accent-primary)]"
                              title="Review attached"
                            />
                          )}
                          {book.kindleNotes && book.kindleNotes.length > 0 && (
                            <span
                              className="w-2 h-2 rounded-full bg-[var(--accent-gold)]"
                              title={`${book.kindleNotes.length} Kindle highlights`}
                            />
                          )}
                          {!hasClippings &&
                            !book.myReview &&
                            (!book.kindleNotes || book.kindleNotes.length === 0) && (
                              <span className="text-[var(--text-muted)]/40">—</span>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Ledger Pagination */}
          {sortedBooks.length > visibleCount && (
            <div className="p-4 border-t border-[var(--border-ledger)] text-center bg-[var(--bg-surface)]">
              <button
                onClick={() => setVisibleCount((prev) => prev + 50)}
                className="px-5 py-2 rounded-md bg-[var(--bg-card)] border border-[var(--border-ledger)] text-xs font-semibold text-[var(--text-ink)] hover:border-[var(--accent-primary)] transition-colors cursor-pointer shadow-2xs"
              >
                Load Next 50 Ledger Rows ({sortedBooks.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
