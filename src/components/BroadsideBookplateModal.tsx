import React, { useState, useMemo, useRef } from 'react';
import type {
  LibraryBundle,
  UserLocalState,
  EnrichmentCacheMap,
  BookplateConfig,
} from '../types/library';
import { formatPublicationYear } from '../lib/formatters';
import { classifyBookLanguageAndFormat } from '../lib/classifiers/languageAndFormat';
import {
  X,
  Printer,
  Download,
  Copy,
  Check,
  Sparkles,
  BookOpen,
  ScrollText,
  Compass,
  Feather,
  Award,
  Layers,
  Save,
  Shield,
  FileText,
} from 'lucide-react';

export interface BroadsideBookplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  bundle: LibraryBundle;
  userState: UserLocalState;
  enrichmentCache: EnrichmentCacheMap;
  onSaveBookplateConfig: (config: BookplateConfig) => void;
}

const MOTTO_PRESETS = [
  'Private Library of Murat',
  'Ne içindeyim zamanın, ne de büsbütün dışında.',
  'A reader lives a thousand lives before he dies.',
  'So many books, so little time.',
  'We read to know that we are not alone.',
  'Kitaplar sessiz öğretmenlerdir.',
];

export const BroadsideBookplateModal: React.FC<BroadsideBookplateModalProps> = ({
  isOpen,
  onClose,
  bundle,
  userState,
  enrichmentCache,
  onSaveBookplateConfig,
}) => {
  const [activeTab, setActiveTab] = useState<'bookplate' | 'broadside'>('bookplate');

  // Bookplate Studio State
  const initialConfig = userState.bookplateConfig;
  const [ownerName, setOwnerName] = useState<string>(initialConfig?.ownerName || 'Murat');
  const [motto, setMotto] = useState<string>(
    initialConfig?.motto || 'Private Library of Murat'
  );
  const [fleuron, setFleuron] = useState<'aldine' | 'compass' | 'owl' | 'quill'>(
    initialConfig?.fleuron || 'aldine'
  );
  const [borderStyle, setBorderStyle] = useState<'venetian' | 'modernist' | 'guild'>(
    initialConfig?.borderStyle || 'venetian'
  );

  const [savedFeedback, setSavedFeedback] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Archive statistics for Bookplate & Broadside
  const stats = useMemo(() => {
    const books = bundle.books || [];
    const readBooks = books.filter((b) => b.exclusiveShelf === 'read');
    const toReadBooks = books.filter((b) => b.exclusiveShelf === 'to-read');
    const totalPagesRead = readBooks.reduce((sum, b) => sum + (b.pageCount || 0), 0);
    const ratedBooks = books.filter(
      (b) => b.myRating !== null && b.myRating >= 1 && b.myRating <= 5
    );
    const meanRating =
      ratedBooks.length > 0
        ? ratedBooks.reduce((sum, b) => sum + b.myRating!, 0) / ratedBooks.length
        : 0;

    const fiveStarBooks = books.filter((b) => b.myRating === 5);
    const distinctAuthors = new Set(books.map((b) => b.author.trim()).filter(Boolean)).size;

    // Temporal extremes
    const booksWithYears = books
      .map((b) => b.originalPublicationYear ?? b.yearPublished)
      .filter((y): y is number => typeof y === 'number' && !isNaN(y));
    const earliestYear = booksWithYears.length > 0 ? Math.min(...booksWithYears) : null;
    const latestYear = booksWithYears.length > 0 ? Math.max(...booksWithYears) : null;

    // Translation flows & languages
    const flowCounts = new Map<string, number>();
    for (const b of books) {
      try {
        const override = userState.bookOverrides?.[b.id];
        const enriched = enrichmentCache?.[b.id];
        const profile = classifyBookLanguageAndFormat(b, override, enriched);
        const flow = profile.translationFlow;
        flowCounts.set(flow, (flowCounts.get(flow) || 0) + 1);
      } catch {
        // Fallback gracefully
      }
    }
    const topFlows = Array.from(flowCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([flow, count]) => ({ flow, count }));

    // Top authors by volume of pages read
    const authorPages = new Map<string, { pages: number; count: number }>();
    for (const b of readBooks) {
      const auth = b.author.trim() || 'Unknown';
      const cur = authorPages.get(auth) || { pages: 0, count: 0 };
      cur.pages += b.pageCount || 300;
      cur.count += 1;
      authorPages.set(auth, cur);
    }
    const topAuthors = Array.from(authorPages.entries())
      .sort((a, b) => b[1].pages - a[1].pages)
      .slice(0, 5)
      .map(([author, data]) => ({ author, ...data }));

    return {
      totalVolumes: books.length,
      readCount: readBooks.length,
      toReadCount: toReadBooks.length,
      totalPagesRead,
      meanRating,
      fiveStarBooks,
      distinctAuthors,
      earliestYear,
      latestYear,
      topFlows,
      topAuthors,
    };
  }, [bundle, userState, enrichmentCache]);

  if (!isOpen) return null;

  // Actions
  const handleSaveConfig = () => {
    const config: BookplateConfig = {
      ownerName: ownerName.trim() || 'Murat',
      motto: motto.trim() || 'Private Library of Murat',
      fleuron,
      borderStyle,
    };
    onSaveBookplateConfig(config);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2400);
  };

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    try {
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgRef.current);

      // Ensure XML declaration and xmlns namespaces
      if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(
          /^<svg/,
          '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
        );
      }
      const fullXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!-- Ex Libris Bookplate · Private Library of ${ownerName} -->\n${source}`;

      const blob = new Blob([fullXml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ex-libris-${(ownerName || 'reader').toLowerCase().replace(/\s+/g, '-')}-bookplate.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export SVG bookplate:', e);
    }
  };

  const handleCopyMarkdownEmbed = async () => {
    const cleanName = ownerName.trim() || 'Murat';
    const cleanMotto = motto.trim() || 'Private Library of Murat';
    const snippet = `> [!NOTE] EX LIBRIS · ${cleanName.toUpperCase()}\n> *“${cleanMotto}”*\n> **${stats.totalVolumes} Volumes in Stacks** · *${stats.totalPagesRead.toLocaleString()} Pages Traversed*\n> *Est. Private Archive · Ex Libris*`;

    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    } catch {
      // Ignore clipboard write restrictions
    }
  };

  const handlePrintBroadside = () => {
    window.print();
  };

  return (
    <div
      className="broadside-modal-container fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
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
      <div className="broadside-modal-dialog relative w-full max-w-4xl max-h-[92vh] rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-ledger)] shadow-2xl flex flex-col overflow-hidden animate-card-draw">
        {/* Top Header / Modal Masthead */}
        <div className="no-print flex items-center justify-between px-5 py-4 border-b border-[var(--border-ledger)] bg-[var(--bg-card)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/30 text-[var(--accent-gold)] flex items-center justify-center shadow-2xs">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif-editorial text-lg sm:text-xl font-bold text-[var(--text-ink)]">
                  The Ex Libris Bookplate &amp; Broadside Studio
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono-tabular uppercase tracking-wider bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] font-bold">
                  Bibliophile Craft
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                Archival Woodcut Seals · Venetian Broadsheet Almanac · Obsidian Embeds
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="no-print flex items-center border-b border-[var(--border-ledger)] bg-[var(--bg-surface)] px-5">
          <button
            onClick={() => setActiveTab('bookplate')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-serif-editorial text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'bookplate'
                ? 'border-[var(--accent-gold)] text-[var(--text-ink)] bg-[var(--bg-card)]/50'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
          >
            <Shield className="w-4 h-4 text-[var(--accent-gold)]" />
            <span>Ex Libris Woodcut Bookplate</span>
          </button>

          <button
            onClick={() => setActiveTab('broadside')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-serif-editorial text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'broadside'
                ? 'border-[var(--accent-primary)] text-[var(--text-ink)] bg-[var(--bg-card)]/50'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
          >
            <FileText className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>The Broadside Reading Almanac</span>
          </button>
        </div>

        {/* Tab 1: Bookplate Studio Content */}
        {activeTab === 'bookplate' && (
          <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
              {/* Left Column: Interactive Controls */}
              <div className="lg:col-span-6 space-y-5">
                {/* Owner Name Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-mono-tabular uppercase tracking-wider font-bold text-[var(--text-ink)]">
                    Bookplate Owner Name
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Murat"
                    maxLength={32}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-sm font-serif-editorial text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)] transition-colors"
                  />
                </div>

                {/* Motto Presets & Custom Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-mono-tabular uppercase tracking-wider font-bold text-[var(--text-ink)]">
                    Bibliophilic Inscription or Motto
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOTTO_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setMotto(preset)}
                        className={`text-[11px] font-serif-editorial italic px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                          motto === preset
                            ? 'bg-[var(--accent-gold)]/20 border-[var(--accent-gold)] text-[var(--text-ink)] font-semibold'
                            : 'bg-[var(--bg-surface)] border-[var(--border-ledger)] text-[var(--text-muted)] hover:border-[var(--accent-gold)]/60 hover:text-[var(--text-ink)]'
                        }`}
                      >
                        “{preset}”
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={motto}
                    onChange={(e) => setMotto(e.target.value)}
                    placeholder="Custom motto / inscription..."
                    maxLength={50}
                    className="w-full px-3.5 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-serif-editorial italic text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-gold)] transition-colors"
                  />
                </div>

                {/* Fleuron / Vector Emblem Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-mono-tabular uppercase tracking-wider font-bold text-[var(--text-ink)]">
                    Archival Woodcut Emblem
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        id: 'aldine',
                        label: 'Aldine Dolphin & Anchor',
                        sub: 'Venetian printer Aldus Manutius',
                      },
                      {
                        id: 'compass',
                        label: 'Curatorial Compass',
                        sub: 'Mariner’s astrolabe & navigation',
                      },
                      {
                        id: 'owl',
                        label: 'Owl of Minerva',
                        sub: 'Classical wisdom on codex',
                      },
                      {
                        id: 'quill',
                        label: 'Goose Quill & Laurel',
                        sub: 'The scribal literary arts',
                      },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFleuron(f.id as any)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          fleuron === f.id
                            ? 'bg-[var(--accent-gold)]/15 border-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-ledger)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <div className="text-xs font-serif-editorial font-bold text-[var(--text-ink)]">
                          {f.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
                          {f.sub}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Border Style Selector */}
                <div className="space-y-2">
                  <label className="block text-xs font-mono-tabular uppercase tracking-wider font-bold text-[var(--text-ink)]">
                    Printer’s Border Style
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'venetian', label: 'Venetian', desc: 'Double filigree' },
                      { id: 'modernist', label: 'Modernist', desc: 'Swiss rule ticks' },
                      { id: 'guild', label: 'Guild', desc: 'Triple dentil' },
                    ].map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBorderStyle(b.id as any)}
                        className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                          borderStyle === b.id
                            ? 'bg-[var(--accent-gold)]/15 border-[var(--accent-gold)] font-bold'
                            : 'bg-[var(--bg-surface)] border-[var(--border-ledger)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <div className="text-xs font-serif-editorial text-[var(--text-ink)]">
                          {b.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                          {b.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Studio Action Buttons */}
                <div className="pt-2 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="flex-1 min-w-[140px] px-4 py-2.5 rounded-lg bg-[var(--accent-gold)] hover:brightness-105 text-[#1C1B18] font-serif-editorial font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    {savedFeedback ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-900" />
                        <span>Saved to Archive!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Save Seal to Archive</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSvg}
                    className="px-3.5 py-2.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-ledger)] border border-[var(--border-ledger)] text-[var(--text-ink)] font-mono-tabular text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Download vector SVG to print bookplate stickers or embed in Obsidian"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>Download SVG</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyMarkdownEmbed}
                    className="px-3.5 py-2.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-ledger)] border border-[var(--border-ledger)] text-[var(--text-ink)] font-mono-tabular text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Copy markdown quote embed for Obsidian or reading log notes"
                  >
                    {copiedMarkdown ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <span>Copy Markdown</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Live Rendered SVG Bookplate */}
              <div className="lg:col-span-6 flex flex-col items-center justify-center p-4 sm:p-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                  <span>Live Woodcut Bookplate Preview</span>
                </div>

                <div className="p-3 bg-white/70 dark:bg-black/30 rounded-lg shadow-inner flex items-center justify-center">
                  <svg
                    ref={svgRef}
                    viewBox="0 0 420 560"
                    width="320"
                    height="426"
                    className="w-full max-w-[300px] sm:max-w-[340px] h-auto shadow-md rounded-xs border border-[#DCD6C8]"
                    style={{ backgroundColor: '#FAF8F2' }}
                  >
                    {/* Background Paper Tone */}
                    <rect width="420" height="560" fill="#FAF8F2" />

                    {/* Outer Border based on borderStyle */}
                    {borderStyle === 'venetian' && (
                      <>
                        <rect
                          x="16"
                          y="16"
                          width="388"
                          height="528"
                          fill="none"
                          stroke="#1C1B18"
                          strokeWidth="3.5"
                        />
                        <rect
                          x="24"
                          y="24"
                          width="372"
                          height="512"
                          fill="none"
                          stroke="#1C1B18"
                          strokeWidth="1"
                          strokeDasharray="4,2"
                        />
                        {/* Corner filigree ornaments */}
                        <path d="M24,36 L36,36 L36,24" fill="none" stroke="#9E3B24" strokeWidth="2" />
                        <path
                          d="M396,36 L384,36 L384,24"
                          fill="none"
                          stroke="#9E3B24"
                          strokeWidth="2"
                        />
                        <path
                          d="M24,524 L36,524 L36,536"
                          fill="none"
                          stroke="#9E3B24"
                          strokeWidth="2"
                        />
                        <path
                          d="M396,524 L384,524 L384,536"
                          fill="none"
                          stroke="#9E3B24"
                          strokeWidth="2"
                        />
                      </>
                    )}

                    {borderStyle === 'modernist' && (
                      <>
                        <rect
                          x="18"
                          y="18"
                          width="384"
                          height="524"
                          fill="none"
                          stroke="#1C1B18"
                          strokeWidth="5"
                        />
                        <rect
                          x="28"
                          y="28"
                          width="364"
                          height="504"
                          fill="none"
                          stroke="#9E3B24"
                          strokeWidth="1.5"
                        />
                        {/* Modernist tick marks */}
                        <line x1="18" y1="280" x2="35" y2="280" stroke="#1C1B18" strokeWidth="2" />
                        <line
                          x1="385"
                          y1="280"
                          x2="402"
                          y2="280"
                          stroke="#1C1B18"
                          strokeWidth="2"
                        />
                      </>
                    )}

                    {borderStyle === 'guild' && (
                      <>
                        <rect
                          x="16"
                          y="16"
                          width="388"
                          height="528"
                          fill="none"
                          stroke="#1C1B18"
                          strokeWidth="2"
                        />
                        <rect
                          x="22"
                          y="22"
                          width="376"
                          height="516"
                          fill="none"
                          stroke="#C89D3C"
                          strokeWidth="2"
                        />
                        <rect
                          x="28"
                          y="28"
                          width="364"
                          height="504"
                          fill="none"
                          stroke="#1C1B18"
                          strokeWidth="1"
                          strokeDasharray="3,3"
                        />
                      </>
                    )}

                    {/* Header: EX LIBRIS */}
                    <text
                      x="210"
                      y="70"
                      textAnchor="middle"
                      fontFamily="Georgia, 'Times New Roman', serif"
                      fontSize="22"
                      fontWeight="bold"
                      letterSpacing="6"
                      fill="#1C1B18"
                    >
                      EX LIBRIS
                    </text>

                    {/* Decorative rule */}
                    <line x1="80" y1="88" x2="340" y2="88" stroke="#1C1B18" strokeWidth="1" />
                    <circle cx="210" cy="88" r="3.5" fill="#C89D3C" />
                    <circle cx="160" cy="88" r="2" fill="#1C1B18" />
                    <circle cx="260" cy="88" r="2" fill="#1C1B18" />

                    {/* Center Emblem Graphic */}
                    <g transform="translate(0, 10)">
                      {fleuron === 'aldine' && (
                        <g id="emblem-aldine">
                          {/* Aldine Anchor & Dolphin Vector */}
                          <circle
                            cx="210"
                            cy="165"
                            r="13"
                            fill="none"
                            stroke="#1C1B18"
                            strokeWidth="3.5"
                          />
                          <line
                            x1="210"
                            y1="178"
                            x2="210"
                            y2="278"
                            stroke="#1C1B18"
                            strokeWidth="4.5"
                          />
                          <line
                            x1="175"
                            y1="200"
                            x2="245"
                            y2="200"
                            stroke="#1C1B18"
                            strokeWidth="4"
                          />
                          <circle cx="175" cy="200" r="3" fill="#1C1B18" />
                          <circle cx="245" cy="200" r="3" fill="#1C1B18" />
                          {/* Anchor bottom curved flukes */}
                          <path
                            d="M165,255 C175,295 245,295 255,255"
                            fill="none"
                            stroke="#1C1B18"
                            strokeWidth="4"
                          />
                          <polygon points="160,250 172,255 165,263" fill="#1C1B18" />
                          <polygon points="260,250 248,255 255,263" fill="#1C1B18" />
                          {/* Coiled Aldine Dolphin silhouette */}
                          <path
                            d="M210,190 C235,190 248,212 242,235 C236,258 200,260 210,285 C215,295 230,295 235,285"
                            fill="none"
                            stroke="#9E3B24"
                            strokeWidth="3.5"
                          />
                          {/* Ivy leaves flanking */}
                          <path
                            d="M145,225 C135,210 145,195 155,200 C165,205 160,225 145,225 Z"
                            fill="#C89D3C"
                            opacity="0.8"
                          />
                          <path
                            d="M275,225 C285,210 275,195 265,200 C255,205 260,225 275,225 Z"
                            fill="#C89D3C"
                            opacity="0.8"
                          />
                        </g>
                      )}

                      {fleuron === 'compass' && (
                        <g id="emblem-compass">
                          {/* Astrolabe / Mariner's Compass Rose */}
                          <circle
                            cx="210"
                            cy="225"
                            r="52"
                            fill="none"
                            stroke="#1C1B18"
                            strokeWidth="2"
                          />
                          <circle
                            cx="210"
                            cy="225"
                            r="46"
                            fill="none"
                            stroke="#C89D3C"
                            strokeWidth="1"
                            strokeDasharray="4,2"
                          />
                          <circle
                            cx="210"
                            cy="225"
                            r="4"
                            fill="#9E3B24"
                          />
                          {/* 8-Point Star Points */}
                          {/* North Point */}
                          <polygon points="210,170 216,220 210,225" fill="#1C1B18" />
                          <polygon points="210,170 204,220 210,225" fill="#FAF8F2" stroke="#1C1B18" strokeWidth="1" />
                          {/* South Point */}
                          <polygon points="210,280 216,230 210,225" fill="#FAF8F2" stroke="#1C1B18" strokeWidth="1" />
                          <polygon points="210,280 204,230 210,225" fill="#1C1B18" />
                          {/* East Point */}
                          <polygon points="265,225 215,219 210,225" fill="#1C1B18" />
                          <polygon points="265,225 215,231 210,225" fill="#FAF8F2" stroke="#1C1B18" strokeWidth="1" />
                          {/* West Point */}
                          <polygon points="155,225 205,219 210,225" fill="#FAF8F2" stroke="#1C1B18" strokeWidth="1" />
                          <polygon points="155,225 205,231 210,225" fill="#1C1B18" />
                          {/* Fleur-de-lis North ornament */}
                          <polygon points="210,160 215,168 205,168" fill="#9E3B24" />
                        </g>
                      )}

                      {fleuron === 'owl' && (
                        <g id="emblem-owl">
                          {/* Owl of Minerva on Codex */}
                          {/* Open Codex Book below */}
                          <path
                            d="M165,275 C185,270 205,272 210,280 C215,272 235,270 255,275 L255,285 C235,280 215,282 210,290 C205,282 185,280 165,285 Z"
                            fill="#C89D3C"
                            stroke="#1C1B18"
                            strokeWidth="2"
                          />
                          {/* Owl Body & Head */}
                          <ellipse cx="210" cy="225" rx="34" ry="42" fill="#1C1B18" />
                          <circle cx="197" cy="205" r="10" fill="#FAF8F2" stroke="#C89D3C" strokeWidth="2" />
                          <circle cx="223" cy="205" r="10" fill="#FAF8F2" stroke="#C89D3C" strokeWidth="2" />
                          <circle cx="197" cy="205" r="4" fill="#1C1B18" />
                          <circle cx="223" cy="205" r="4" fill="#1C1B18" />
                          <polygon points="210,212 214,222 206,222" fill="#9E3B24" />
                          {/* Ear Tufts */}
                          <polygon points="185,185 195,195 180,200" fill="#1C1B18" />
                          <polygon points="235,185 225,195 240,200" fill="#1C1B18" />
                          {/* Feather Hatching */}
                          <path d="M190,235 Q210,250 230,235" fill="none" stroke="#FAF8F2" strokeWidth="1.5" />
                          <path d="M195,248 Q210,260 225,248" fill="none" stroke="#FAF8F2" strokeWidth="1.5" />
                        </g>
                      )}

                      {fleuron === 'quill' && (
                        <g id="emblem-quill">
                          {/* Crossed Goose Quill and Laurel Arc */}
                          {/* Inkwell base */}
                          <polygon points="195,275 225,275 220,288 200,288" fill="#1C1B18" />
                          <rect x="202" y="270" width="16" height="5" fill="#C89D3C" />
                          {/* Quill shaft */}
                          <path
                            d="M245,170 C235,195 220,240 208,272"
                            fill="none"
                            stroke="#1C1B18"
                            strokeWidth="3.5"
                          />
                          {/* Quill feather vanes */}
                          <path
                            d="M245,170 C220,185 210,215 220,235 C225,220 238,200 245,170 Z"
                            fill="#9E3B24"
                            opacity="0.85"
                          />
                          <path
                            d="M245,170 C258,190 248,220 230,238 C238,218 245,195 245,170 Z"
                            fill="#C89D3C"
                            opacity="0.85"
                          />
                          {/* Laurel Arc */}
                          <path
                            d="M160,250 C155,210 170,185 195,175"
                            fill="none"
                            stroke="#1C1B18"
                            strokeWidth="1.5"
                            strokeDasharray="4,3"
                          />
                        </g>
                      )}
                    </g>

                    {/* Owner Name Section */}
                    <text
                      x="210"
                      y="350"
                      textAnchor="middle"
                      fontFamily="Georgia, 'Times New Roman', serif"
                      fontSize="24"
                      fontWeight="700"
                      letterSpacing="3"
                      fill="#1C1B18"
                    >
                      {(ownerName || 'Murat').toUpperCase()}
                    </text>

                    {/* Motto Ribbon Banner */}
                    <g transform="translate(0, 368)">
                      <path
                        d="M 50,22 L 370,22 L 358,40 L 370,58 L 50,58 L 62,40 Z"
                        fill="#FAF8F2"
                        stroke="#1C1B18"
                        strokeWidth="1.8"
                      />
                      <line x1="66" y1="26" x2="354" y2="26" stroke="#C89D3C" strokeWidth="1" />
                      <line x1="66" y1="54" x2="354" y2="54" stroke="#C89D3C" strokeWidth="1" />
                      <text
                        x="210"
                        y="44"
                        textAnchor="middle"
                        fontFamily="Georgia, 'Times New Roman', serif"
                        fontSize="13"
                        fontStyle="italic"
                        fill="#5C3826"
                      >
                        “{motto || 'Private Library of Murat'}”
                      </text>
                    </g>

                    {/* Archival Metrics Ledger Footer */}
                    <line x1="70" y1="465" x2="350" y2="465" stroke="#DCD6C8" strokeWidth="1" />
                    <text
                      x="210"
                      y="484"
                      textAnchor="middle"
                      fontFamily="'JetBrains Mono', monospace, ui-monospace"
                      fontSize="10.5"
                      letterSpacing="2"
                      fill="#5E5A52"
                    >
                      {stats.totalVolumes} VOLUMES · {stats.totalPagesRead.toLocaleString()} PAGES READ
                    </text>

                    <text
                      x="210"
                      y="504"
                      textAnchor="middle"
                      fontFamily="'JetBrains Mono', monospace, ui-monospace"
                      fontSize="9"
                      letterSpacing="2.5"
                      fill="#9E3B24"
                    >
                      EX LIBRIS ARCHIVE · EST. 2026
                    </text>

                    <text
                      x="210"
                      y="522"
                      textAnchor="middle"
                      fontFamily="Georgia, 'Times New Roman', serif"
                      fontSize="9"
                      fontStyle="italic"
                      fill="#9A958C"
                    >
                      ❧ Aldus Manutius Studio Edition ❧
                    </text>
                  </svg>
                </div>

                <div className="mt-3 text-[11px] text-[var(--text-muted)] italic text-center">
                  Rendered at 420 × 560 intaglio ratio · Clean vector linework
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: The Broadside Reading Almanac Content */}
        {activeTab === 'broadside' && (
          <div className="p-5 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-[var(--bg-card)]">
            {/* Action Bar for Broadside */}
            <div className="no-print flex items-center justify-between p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
              <div className="text-xs font-mono-tabular text-[var(--text-muted)]">
                Ready for framing, archiving, or exporting as a 1-page PDF.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintBroadside}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:brightness-105 text-white font-serif-editorial font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Export PDF Broadside</span>
                </button>
              </div>
            </div>

            {/* The Physical Broadside Sheet */}
            <div className="broadside-sheet rounded-xl bg-[var(--bg-card)] border-2 border-[var(--text-ink)] p-6 sm:p-10 shadow-md space-y-8 max-w-3xl mx-auto">
              {/* Broadside Masthead */}
              <div className="text-center space-y-2 border-b-2 border-[var(--text-ink)] pb-6">
                <div className="text-[10px] font-mono-tabular uppercase tracking-[0.25em] text-[var(--accent-gold)] font-bold">
                  ESTABLISHED IN THE PRIVATE ARCHIVE OF {ownerName.toUpperCase()}
                </div>
                <h1 className="font-serif-editorial text-2xl sm:text-4xl font-black tracking-tight text-[var(--text-ink)] uppercase">
                  The Broadside Reading Almanac
                </h1>
                <p className="text-xs sm:text-sm font-serif-editorial italic text-[var(--text-muted)] max-w-xl mx-auto">
                  A Comprehensive Chronology, Canon &amp; Linguistic Survey of the Private Stacks
                </p>

                <div className="pt-3 flex items-center justify-center gap-4 text-[10px] sm:text-xs font-mono-tabular text-[var(--text-muted)] border-t border-[var(--border-ledger)] mt-3">
                  <span>
                    COLOPHON DATE:{' '}
                    {new Date().toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span>·</span>
                  <span>{stats.totalVolumes} VOLUMES CATALOGED</span>
                  <span>·</span>
                  <span>EX LIBRIS VENETIIS</span>
                </div>
              </div>

              {/* Vital Stacks Telemetry (4-Stat Grid) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2 border-b border-[var(--border-ledger)]">
                <div className="text-center p-3 rounded-lg bg-[var(--bg-surface)]/60 border border-[var(--border-ledger)]">
                  <div className="text-xs font-mono-tabular text-[var(--text-muted)] uppercase">
                    Volumes Read
                  </div>
                  <div className="text-xl sm:text-2xl font-serif-editorial font-black text-[var(--text-ink)] mt-1">
                    {stats.readCount}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                    (+{stats.toReadCount} queued TBR)
                  </div>
                </div>

                <div className="text-center p-3 rounded-lg bg-[var(--bg-surface)]/60 border border-[var(--border-ledger)]">
                  <div className="text-xs font-mono-tabular text-[var(--text-muted)] uppercase">
                    Pages Traversed
                  </div>
                  <div className="text-xl sm:text-2xl font-serif-editorial font-black text-[var(--accent-primary)] mt-1">
                    {stats.totalPagesRead.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                    ink and paper
                  </div>
                </div>

                <div className="text-center p-3 rounded-lg bg-[var(--bg-surface)]/60 border border-[var(--border-ledger)]">
                  <div className="text-xs font-mono-tabular text-[var(--text-muted)] uppercase">
                    Distinct Authors
                  </div>
                  <div className="text-xl sm:text-2xl font-serif-editorial font-black text-[var(--text-ink)] mt-1">
                    {stats.distinctAuthors}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                    individual minds
                  </div>
                </div>

                <div className="text-center p-3 rounded-lg bg-[var(--bg-surface)]/60 border border-[var(--border-ledger)]">
                  <div className="text-xs font-mono-tabular text-[var(--text-muted)] uppercase">
                    Personal Standard
                  </div>
                  <div className="text-xl sm:text-2xl font-serif-editorial font-black text-[var(--accent-gold)] mt-1">
                    {stats.meanRating.toFixed(2)} ★
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                    average rating
                  </div>
                </div>
              </div>

              {/* The 5-Star Canon & Masterpieces */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-ledger)] pb-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-[var(--accent-gold)]" />
                    <h3 className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)]">
                      The 5-Star Canon ({stats.fiveStarBooks.length} Private Masterpieces)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                    Highest Criterion of Excellence
                  </span>
                </div>

                {stats.fiveStarBooks.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)] italic">
                    No 5-star volumes cataloged yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {stats.fiveStarBooks.slice(0, 10).map((b) => (
                      <div
                        key={b.id}
                        className="p-2.5 rounded-lg bg-[var(--bg-surface)]/40 border border-[var(--border-ledger)] flex items-center justify-between"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-serif-editorial font-bold text-[var(--text-ink)] truncate">
                            {b.cleanTitle || b.title}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate">
                            by {b.author}
                          </div>
                        </div>
                        <div className="font-mono-tabular text-[10px] text-[var(--accent-gold)] shrink-0 font-semibold">
                          {formatPublicationYear(b.originalPublicationYear ?? b.yearPublished)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Temporal & Linguistic Horizons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                {/* Temporal Span */}
                <div className="space-y-2 p-4 rounded-xl bg-[var(--bg-surface)]/30 border border-[var(--border-ledger)]">
                  <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                    <span>Temporal Horizon</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    From{' '}
                    <strong className="text-[var(--text-ink)]">
                      {formatPublicationYear(stats.earliestYear)}
                    </strong>{' '}
                    through to contemporary volumes in{' '}
                    <strong className="text-[var(--text-ink)]">
                      {formatPublicationYear(stats.latestYear)}
                    </strong>
                    . An intellectual span traversing centuries of human inquiry.
                  </p>
                </div>

                {/* Linguistic Bridges */}
                <div className="space-y-2 p-4 rounded-xl bg-[var(--bg-surface)]/30 border border-[var(--border-ledger)]">
                  <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>Primary Translation Conduits</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.topFlows.map((f, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-[11px] font-mono-tabular bg-[var(--bg-card)] border border-[var(--border-ledger)] text-[var(--text-ink)]"
                      >
                        {f.flow} ({f.count})
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Prolific Author Stacks */}
              <div className="space-y-2">
                <div className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-bold">
                  Most Explored Minds (By Pages Traversed)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                  {stats.topAuthors.map((a, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-[var(--bg-surface)]/50 border border-[var(--border-ledger)]"
                    >
                      <div className="font-serif-editorial font-bold text-xs text-[var(--text-ink)] truncate">
                        {a.author}
                      </div>
                      <div className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                        {a.pages.toLocaleString()} pp · {a.count} vol
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Printer's Colophon Stamp */}
              <div className="border-t-2 border-[var(--text-ink)] pt-4 text-center space-y-1">
                <div className="text-sm text-[var(--accent-gold)]">❧ · ❦ · ❧</div>
                <p className="font-serif-editorial italic text-xs text-[var(--text-muted)] max-w-lg mx-auto">
                  “Typeset for {ownerName}’s permanent Ex Libris archive. Text rendering calibrated
                  for Newsreader, Plus Jakarta Sans, and JetBrains Mono on warm electronic substrate.”
                </p>
                <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-[var(--text-muted)] pt-1">
                  EX LIBRIS ARCHIVUM · REPUBLICA LITERARIA
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
