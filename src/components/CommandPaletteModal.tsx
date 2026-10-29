import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Book } from '../types/library';
import { Search, BookOpen, Star, Layers, X, CornerDownLeft, Sparkles, Feather } from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  onSelectBook: (book: Book) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  books,
  onSelectBook,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Results matching query
  const matchingBooks = useMemo(() => {
    if (!query.trim()) {
      // Suggest recent or currently reading books
      return books
        .filter(b => b.exclusiveShelf === 'currently-reading' || b.myRating === 5)
        .slice(0, 10);
    }

    const q = query.toLowerCase().trim();
    return books
      .filter((b) => {
        const matchesTitle = b.cleanTitle?.toLowerCase().includes(q) || b.title?.toLowerCase().includes(q);
        const matchesAuthor = b.author?.toLowerCase().includes(q);
        const matchesSeries = b.seriesName?.toLowerCase().includes(q);
        const matchesIsbn = b.isbn?.includes(q) || b.isbn13?.includes(q);
        const matchesReview = b.myReview?.toLowerCase().includes(q);
        return matchesTitle || matchesAuthor || matchesSeries || matchesIsbn || matchesReview;
      })
      .slice(0, 15);
  }, [books, query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, matchingBooks.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + matchingBooks.length) % Math.max(1, matchingBooks.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (matchingBooks[selectedIndex]) {
          onSelectBook(matchingBooks[selectedIndex]);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, matchingBooks, selectedIndex, onSelectBook, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="drawer-backdrop fixed inset-0 transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-ledger)] shadow-2xl overflow-hidden animate-card-draw">
        
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--border-ledger)] bg-[var(--bg-surface)]">
          <Search className="w-5 h-5 text-[var(--text-muted)] mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a book title, author, series, ISBN, or quote..."
            className="w-full bg-transparent text-sm sm:text-base text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
              }}
              className="text-[var(--text-muted)] hover:text-[var(--text-ink)] p-1 mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono-tabular bg-[var(--bg-card)] border border-[var(--border-ledger)] rounded text-[var(--text-muted)]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2">
          {matchingBooks.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              No matching volumes found for “{query}”.
            </div>
          ) : (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                {query.trim() ? `Search Matches (${matchingBooks.length})` : 'Desk & 5-Star Highlights'}
              </div>

              <div className="space-y-1">
                {matchingBooks.map((book, idx) => {
                  const isSelected = idx === selectedIndex;

                  return (
                    <div
                      key={book.id}
                      onClick={() => {
                        onSelectBook(book);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent-primary)] text-white shadow-2xs'
                          : 'hover:bg-[var(--bg-surface)] text-[var(--text-ink)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div
                          className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-ledger)]'
                          }`}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                        </div>

                        <div className="min-w-0">
                          <div className="font-serif-editorial font-bold text-sm truncate">
                            {book.cleanTitle || book.title}
                          </div>
                          <div
                            className={`text-[11px] truncate ${
                              isSelected ? 'text-white/80' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            by {book.author}
                            {book.seriesName ? ` · ${book.seriesName} ${book.seriesNumber ? `#${book.seriesNumber}` : ''}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono-tabular text-[11px]">
                        {book.myRating && (
                          <span className={`flex items-center gap-0.5 ${isSelected ? 'text-white' : 'text-[var(--accent-gold)]'}`}>
                            <Star className="w-3 h-3 fill-current" />
                            {book.myRating}★
                          </span>
                        )}

                        <span
                          className={`px-1.5 py-0.5 rounded uppercase text-[9px] font-semibold ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-ledger)]'
                          }`}
                        >
                          {book.exclusiveShelf}
                        </span>

                        {isSelected && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-white/70 ml-1" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer shortcuts info */}
        <div className="px-4 py-2.5 bg-[var(--bg-surface)] border-t border-[var(--border-ledger)] flex items-center justify-between text-[11px] font-mono-tabular text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Open Dossier</span>
          </div>
          <span>Total Catalog: {books.length} volumes</span>
        </div>

      </div>
    </div>
  );
};
