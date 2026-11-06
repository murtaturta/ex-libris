import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { LibraryBundle, UserLocalState, Book, KindleClipping } from '../types/library';
import {
  BookOpen,
  Search,
  Quote,
  Sparkles,
  Download,
  Copy,
  Check,
  X,
  Shuffle,
  Star,
  Feather,
  Layers,
  ArrowRight,
  Filter,
} from 'lucide-react';

export interface CommonplaceBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  bundle: LibraryBundle;
  userState: UserLocalState;
  onSelectBookById: (bookId: string | null, fallbackTitle?: string) => void;
}

type CardTheme = 'parchment' | 'lamp';

const formatLocation = (c: { locationStart?: number | null; locationEnd?: number | null; page?: number | null }) => {
  if (c.locationStart != null && c.locationEnd != null) {
    return c.locationStart === c.locationEnd ? `${c.locationStart}` : `${c.locationStart}–${c.locationEnd}`;
  }
  if (c.locationStart != null) return `${c.locationStart}`;
  if (c.page != null) return `p. ${c.page}`;
  return null;
};

export const CommonplaceBookModal: React.FC<CommonplaceBookModalProps> = ({
  isOpen,
  onClose,
  bundle,
  userState,
  onSelectBookById,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'canon' | 'long' | 'recent'>('all');
  const [cardTheme, setCardTheme] = useState<CardTheme>('parchment');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [serendipityIndex, setSerendipityIndex] = useState<number>(0);
  const [isExportingPng, setIsExportingPng] = useState<string | null>(null);

  // Map books by clean title or id for fast metadata lookup
  const booksByTitle = useMemo(() => {
    const map = new Map<string, Book>();
    for (const b of bundle.books) {
      map.set(b.cleanTitle.toLowerCase(), b);
      map.set(b.title.toLowerCase(), b);
      map.set(b.id, b);
    }
    return map;
  }, [bundle.books]);

  // Aggregate all clippings from userState and bundle
  const allPassages = useMemo(() => {
    const list: Array<KindleClipping & { bookRating?: number | null }> = [];
    const seen = new Set<string>();

    const rawClippings = userState.kindleClippings || [];
    for (const c of rawClippings) {
      if (!c.content || c.content.trim().length < 15) continue;
      const key = `${c.cleanTitle}_${c.content.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const matchedBook =
        (c.matchedBookId ? booksByTitle.get(c.matchedBookId) : null) ||
        booksByTitle.get(c.cleanTitle.toLowerCase()) ||
        booksByTitle.get(c.rawTitle.toLowerCase());

      list.push({
        ...c,
        bookRating: matchedBook?.myRating ?? null,
      });
    }

    return list;
  }, [userState.kindleClippings, booksByTitle]);

  // Serendipity Candidates: 4★/5★ passages or evocative quotes
  const serendipityCandidates = useMemo(() => {
    const highRated = allPassages.filter(
      (p) => (p.bookRating && p.bookRating >= 4) || p.content.length > 80
    );
    return highRated.length > 0 ? highRated : allPassages;
  }, [allPassages]);

  // Select random passage on modal open
  useEffect(() => {
    if (isOpen && serendipityCandidates.length > 0) {
      const rand = Math.floor(Math.random() * serendipityCandidates.length);
      setSerendipityIndex(rand);
    }
  }, [isOpen, serendipityCandidates.length]);

  const currentSerendipityPassage = serendipityCandidates[serendipityIndex] || allPassages[0];

  const rollSerendipity = () => {
    if (serendipityCandidates.length <= 1) return;
    let next = Math.floor(Math.random() * serendipityCandidates.length);
    while (next === serendipityIndex && serendipityCandidates.length > 1) {
      next = Math.floor(Math.random() * serendipityCandidates.length);
    }
    setSerendipityIndex(next);
  };

  // Filter and search passages
  const filteredPassages = useMemo(() => {
    let result = allPassages;

    if (activeFilter === 'canon') {
      result = result.filter((p) => p.bookRating === 5);
    } else if (activeFilter === 'long') {
      result = result.filter((p) => p.content.length >= 180);
    } else if (activeFilter === 'recent') {
      result = [...result].sort((a, b) => {
        const dA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
        const dB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
        return dB - dA;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.content.toLowerCase().includes(q) ||
          p.cleanTitle.toLowerCase().includes(q) ||
          (p.author && p.author.toLowerCase().includes(q))
      );
    }

    return result;
  }, [allPassages, activeFilter, searchQuery]);

  // Copy Markdown snippet
  const handleCopyMarkdown = async (passage: KindleClipping) => {
    const author = passage.author || 'Unknown';
    const locStr = formatLocation(passage);
    const loc = locStr ? ` (Loc ${locStr})` : '';
    const snippet = `> "${passage.content.trim()}"\n>\n> — **${author}**, *${passage.cleanTitle}*${loc}`;

    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedId(passage.id);
      setTimeout(() => setCopiedId(null), 2200);
    } catch {
      // Ignore clipboard write restrictions
    }
  };

  // Off-screen canvas broadside card generator (300 DPI 1200x675)
  const handleExportBroadsideCard = async (passage: KindleClipping) => {
    setIsExportingPng(passage.id);
    try {
      const width = 1200;
      const height = 675;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2d canvas context');

      const isParchment = cardTheme === 'parchment';
      const bgColor = isParchment ? '#FAF8F2' : '#141311';
      const textColor = isParchment ? '#1C1B18' : '#FAF8F2';
      const accentGold = isParchment ? '#C89D3C' : '#E6C673';
      const mutedColor = isParchment ? '#5E5A52' : '#9E988D';
      const borderColor = isParchment ? '#DCD6C8' : '#332E27';

      // 1. Background fill
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // 2. Double border & corner ornaments
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(30, 30, width - 60, height - 60);

      ctx.strokeStyle = accentGold;
      ctx.lineWidth = 1;
      ctx.strokeRect(42, 42, width - 84, height - 84);

      // Corner filigree ticks
      ctx.fillStyle = accentGold;
      ctx.fillRect(40, 40, 8, 8);
      ctx.fillRect(width - 48, 40, 8, 8);
      ctx.fillRect(40, height - 48, 8, 8);
      ctx.fillRect(width - 48, height - 48, 8, 8);

      // 3. Header Colophon
      ctx.fillStyle = accentGold;
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.letterSpacing = '3px';
      ctx.textAlign = 'center';
      ctx.fillText('EX LIBRIS ARCHIVUM · COMMONPLACE PASSAGE', width / 2, 80);

      // 4. Large decorative quotation mark
      ctx.fillStyle = isParchment ? 'rgba(200, 157, 60, 0.22)' : 'rgba(230, 198, 115, 0.18)';
      ctx.font = 'italic 160px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText('“', 70, 220);

      // 5. Wrap and draw quotation text
      ctx.fillStyle = textColor;
      ctx.font = 'italic 26px Georgia, serif';
      ctx.textAlign = 'center';

      const maxWidth = width - 220;
      const words = passage.content.trim().split(/\s+/);
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth) {
          lines.push(currentLine);
          currentLine = word;
          if (lines.length >= 7) {
            currentLine += '…';
            break;
          }
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine && lines.length < 8) lines.push(currentLine);

      const lineHeight = 38;
      const startY = height / 2 - (lines.length * lineHeight) / 2 + 10;
      lines.forEach((line, i) => {
        ctx.fillText(line, width / 2, startY + i * lineHeight);
      });

      // 6. Attribution Divider & Text
      const attrY = height - 120;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 160, attrY - 25);
      ctx.lineTo(width / 2 + 160, attrY - 25);
      ctx.stroke();

      ctx.fillStyle = accentGold;
      ctx.beginPath();
      ctx.arc(width / 2, attrY - 25, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Author & Title
      ctx.fillStyle = textColor;
      ctx.font = 'bold 18px Georgia, serif';
      ctx.textAlign = 'center';
      const authorText = passage.author || 'Unknown';
      ctx.fillText(`— ${authorText} —`, width / 2, attrY);

      ctx.fillStyle = mutedColor;
      ctx.font = 'italic 15px Georgia, serif';
      const locStr = formatLocation(passage);
      const locText = locStr ? ` · Loc ${locStr}` : '';
      ctx.fillText(`“${passage.cleanTitle}”${locText}`, width / 2, attrY + 26);

      // 7. Footer colophon mark
      ctx.fillStyle = mutedColor;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.letterSpacing = '2px';
      ctx.fillText('REPUBLICA LITERARIA · EST. 2026', width / 2, height - 48);

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          setIsExportingPng(null);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanName = (passage.author || 'quote').toLowerCase().replace(/\s+/g, '-');
        a.download = `ex-libris-passage-${cleanName}-${passage.id.slice(0, 6)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setIsExportingPng(null);
      }, 'image/png');
    } catch (err) {
      console.error('Failed to export broadside quote card:', err);
      setIsExportingPng(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="drawer-backdrop fixed inset-0 transition-opacity"
        aria-hidden="true"
      />

      {/* Main Dialog Container */}
      <div className="relative w-full max-w-5xl max-h-[92vh] rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-ledger)] shadow-2xl flex flex-col overflow-hidden animate-card-draw">
        {/* Top Masthead */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-ledger)] bg-[var(--bg-card)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/30 text-[var(--accent-gold)] flex items-center justify-center shadow-2xs">
              <Quote className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif-editorial text-lg sm:text-xl font-bold text-[var(--text-ink)]">
                  The Commonplace Book
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular uppercase tracking-wider bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] font-bold">
                  {allPassages.length} Archival Passages
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                Kindle Annotations · Serendipitous Discovery · 300 DPI Typographic Cards
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle for Cards */}
            <div className="hidden sm:flex items-center rounded-lg border border-[var(--border-ledger)] p-0.5 bg-[var(--bg-surface)] text-xs font-mono-tabular">
              <button
                type="button"
                onClick={() => setCardTheme('parchment')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  cardTheme === 'parchment'
                    ? 'bg-[var(--accent-gold)] text-[#1C1B18] font-bold shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                }`}
              >
                Parchment
              </button>
              <button
                type="button"
                onClick={() => setCardTheme('lamp')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  cardTheme === 'lamp'
                    ? 'bg-[var(--accent-gold)] text-[#1C1B18] font-bold shadow-2xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                }`}
              >
                Library Lamp
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
              aria-label="Close commonplace book"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1 bg-[var(--bg-surface)]/30">
          {/* 1. Serendipity: Passage of the Moment */}
          {currentSerendipityPassage && (
            <div className="relative p-6 sm:p-8 rounded-xl bg-[var(--bg-card)] border-2 border-[var(--accent-gold)]/40 shadow-sm overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--accent-gold)]/5 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" />
                    <span className="font-mono-tabular text-xs uppercase tracking-wider font-bold text-[var(--accent-gold)]">
                      Passage of the Moment · Serendipity Roll
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={rollSerendipity}
                      className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-ledger)] border border-[var(--border-ledger)] text-xs font-mono-tabular text-[var(--text-ink)] flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Roll another random passage from your library"
                    >
                      <Shuffle className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                      <span>Next Serendipity</span>
                    </button>
                  </div>
                </div>

                {/* Big Serendipity Quote */}
                <blockquote className="font-serif-editorial italic text-base sm:text-xl text-[var(--text-ink)] leading-relaxed pl-4 border-l-2 border-[var(--accent-gold)]">
                  &ldquo;{currentSerendipityPassage.content.trim()}&rdquo;
                </blockquote>

                {/* Attribution and Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[var(--border-ledger)]">
                  <div>
                    <span className="font-serif-editorial font-bold text-sm text-[var(--text-ink)]">
                      {currentSerendipityPassage.author || 'Unknown'}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] font-serif-editorial italic ml-2">
                      &mdash; {currentSerendipityPassage.cleanTitle}
                    </span>
                    {formatLocation(currentSerendipityPassage) && (
                      <span className="text-[11px] font-mono-tabular text-[var(--text-muted)] ml-2">
                        (Loc {formatLocation(currentSerendipityPassage)})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyMarkdown(currentSerendipityPassage)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-ledger)] border border-[var(--border-ledger)] text-xs font-mono-tabular text-[var(--text-ink)] flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedId === currentSerendipityPassage.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          <span>Copy Markdown</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportBroadsideCard(currentSerendipityPassage)}
                      disabled={isExportingPng === currentSerendipityPassage.id}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-gold)] hover:brightness-105 text-[#1C1B18] font-serif-editorial font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {isExportingPng === currentSerendipityPassage.id
                          ? 'Rendering...'
                          : 'Download 300 DPI Card'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. Controls & Search Bar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)]">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across all passages, authors, or book titles..."
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-mono-tabular text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)] transition-colors"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 md:pb-0">
              {[
                { id: 'all' as const, label: `All (${allPassages.length})` },
                { id: 'canon' as const, label: '5★ Canon' },
                { id: 'long' as const, label: 'Long Passages' },
                { id: 'recent' as const, label: 'Recent' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono-tabular transition-all cursor-pointer ${
                    activeFilter === f.id
                      ? 'bg-[var(--accent-gold)] text-[#1C1B18] font-bold shadow-2xs'
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] border border-[var(--border-ledger)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Passages Gallery Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPassages.length > 0 ? (
              filteredPassages.map((p) => {
                const book =
                  (p.matchedBookId ? booksByTitle.get(p.matchedBookId) : null) ||
                  booksByTitle.get(p.cleanTitle.toLowerCase());

                return (
                  <div
                    key={p.id}
                    className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)]/50 transition-all flex flex-col justify-between space-y-4 shadow-2xs group"
                  >
                    <div className="space-y-3">
                      {/* Quote Content */}
                      <blockquote className="font-serif-editorial italic text-sm text-[var(--text-ink)] leading-relaxed line-clamp-6">
                        &ldquo;{p.content.trim()}&rdquo;
                      </blockquote>

                      {/* Work & Author Attribution */}
                      <div className="pt-2 border-t border-[var(--border-ledger)] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onSelectBookById(book?.id || null, p.cleanTitle)}
                            className="font-serif-editorial font-bold text-xs text-[var(--text-ink)] hover:text-[var(--accent-primary)] truncate block text-left cursor-pointer transition-colors"
                          >
                            {p.cleanTitle}
                          </button>
                          <p className="text-[11px] text-[var(--text-muted)] font-serif-editorial truncate">
                            {p.author || 'Unknown Author'}
                            {formatLocation(p) && (
                              <span className="font-mono-tabular text-[10px] ml-1.5 text-[var(--text-muted)]/80">
                                · Loc {formatLocation(p)}
                              </span>
                            )}
                          </p>
                        </div>

                        {p.bookRating && (
                          <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] font-bold shrink-0">
                            {p.bookRating}★
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border-ledger)]/60 text-xs font-mono-tabular">
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {p.addedAt ? p.addedAt.slice(0, 10) : 'Archived'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyMarkdown(p)}
                          className="p-1.5 rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
                          title="Copy Markdown Quote"
                        >
                          {copiedId === p.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExportBroadsideCard(p)}
                          disabled={isExportingPng === p.id}
                          className="p-1.5 rounded hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
                          title="Download 300 DPI Broadside Card PNG"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center space-y-2">
                <Quote className="w-8 h-8 mx-auto text-[var(--text-muted)]/40" />
                <p className="font-serif-editorial text-sm text-[var(--text-muted)] italic">
                  No passages match your current filter or search criteria.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
