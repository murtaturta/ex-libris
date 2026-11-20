import React, { useState } from 'react';
import {
  BookOpen,
  Upload,
  Sparkles,
  FileSpreadsheet,
  Highlighter,
  Film,
  Feather,
  Download,
  ShieldCheck,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface LandingViewProps {
  onOpenImport: () => void;
  onLoadDemoArchive: () => Promise<void>;
}

const SUPPORTED_IMPORTS = [
  {
    icon: FileSpreadsheet,
    title: 'Goodreads Archive',
    formats: '.csv · DSAR .zip · Public Profile URL',
    description:
      'Bookshelves, ratings, reviews, reading dates, yearly goals, and edition metadata.',
    accent: 'text-[var(--accent-primary)]',
  },
  {
    icon: Highlighter,
    title: 'Kindle Marginalia',
    formats: 'My Clippings.txt · Notebook.html · JSON',
    description:
      'Highlights, paired margin notes, page/location anchors, and reading heatmap.',
    accent: 'text-[var(--accent-gold)]',
  },
  {
    icon: Film,
    title: 'Letterboxd Diary',
    formats: '.zip · diary.csv / watched.csv',
    description:
      'Cross-media film watches linked to literary adaptations and narrative DNA.',
    accent: 'text-sky-600 dark:text-sky-400',
  },
  {
    icon: Feather,
    title: 'Scriptor & Obsidian',
    formats: 'data.json · scriptor_telemetry_*.json',
    description:
      'Daily writing word counts paired against reading chronology in The Scriptorium.',
    accent: 'text-emerald-600 dark:text-emerald-400',
  },
];

export const LandingView: React.FC<LandingViewProps> = ({
  onOpenImport,
  onLoadDemoArchive,
}) => {
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleLoadDemo = async () => {
    if (isLoadingDemo) return;
    setIsLoadingDemo(true);
    setDemoError(null);
    try {
      await onLoadDemoArchive();
    } catch (err: any) {
      setDemoError(err?.message || 'Could not load demo archive.');
    } finally {
      setIsLoadingDemo(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6 sm:py-10 space-y-8 animate-fadeIn">
      {/* 1. Hero Card */}
      <section className="p-6 sm:p-10 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-xs relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-[var(--accent-primary)]/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-[11px] font-mono-tabular text-[var(--text-muted)]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Local-first &amp; private — your reading data stays in your browser</span>
          </div>

          <div className="space-y-2.5">
            <h1 className="font-serif-editorial text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-ink)]">
              Welcome to Ex Libris
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-muted)] max-w-2xl leading-relaxed">
              A personal reading archive and literary observatory. Import your own Goodreads,
              Kindle, Letterboxd, or Scriptor files to explore your shelves, translation flows,
              yearly targets, and marginalia—or preview the workspace with our made-up demo archive.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Import Your Archive</span>
            </button>

            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={isLoadingDemo}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)] text-[var(--text-ink)] text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
            >
              {isLoadingDemo ? (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-gold)]" />
              ) : (
                <Sparkles className="w-4 h-4 text-[var(--accent-gold)]" />
              )}
              <span>{isLoadingDemo ? 'Loading Demo Archive...' : 'Load Demo Archive'}</span>
            </button>
          </div>

          {demoError && (
            <div className="inline-flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-mono-tabular">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{demoError}</span>
            </div>
          )}
        </div>
      </section>

      {/* 2. What You Can Import */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[var(--accent-primary)]" />
          <h2 className="font-serif-editorial text-xl font-bold text-[var(--text-ink)]">
            What You Can Import
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SUPPORTED_IMPORTS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${item.accent}`} />
                    <h3 className="font-semibold text-sm text-[var(--text-ink)]">{item.title}</h3>
                  </div>
                </div>
                <div className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
                  {item.formats}
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Review Demo Files */}
      <section className="p-5 sm:p-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-ledger)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
            Want to review the demo files first?
          </h3>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Download our fictional sample files to inspect their format or drag-and-drop them into
            the Importer yourself.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 font-mono-tabular text-xs">
          <a
            href="./demo/demo_goodreads_library.csv"
            download="demo_goodreads_library.csv"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-primary)] text-[var(--text-ink)] transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>demo_goodreads_library.csv</span>
          </a>
          <a
            href="./demo/demo_my_clippings.txt"
            download="demo_my_clippings.txt"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-ledger)] hover:border-[var(--accent-gold)] text-[var(--text-ink)] transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
            <span>demo_my_clippings.txt</span>
          </a>
        </div>
      </section>
    </div>
  );
};

export default LandingView;
