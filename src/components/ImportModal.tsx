import React, { useState, useRef } from 'react';
import {
  LibraryBundle,
  KindleClipping,
  UserLocalState,
  EnrichmentCacheMap,
} from '../types/library';
import { parseGoodreadsCsv, mergeBooksIntoBundle } from '../lib/parsers/goodreadsCsv';
import { importGoodreadsZip } from '../lib/parsers/goodreadsZip';
import { parseKindleClippings, SAMPLE_KINDLE_CLIPPINGS_TXT } from '../lib/parsers/kindleClippings';
import { isKindleNotebookHtml, parseKindleNotebookHtml } from '../lib/parsers/kindleHtml';
import {
  computeLibraryImportDiff,
  computeClippingsImportDiff,
  mergeLibraryBundlesNonDestructive,
  LibraryImportDiffReport,
  ClippingsImportDiffReport,
} from '../lib/parsers/importDiffAuditor';
import { persistLibraryBundle } from '../lib/storage/localStateClient';
import {
  fetchGoodreadsPublicLibrary,
  RssFetchProgress,
} from '../lib/parsers/goodreadsRss';
import { bookHasAnnotations } from '../lib/exporters/markdownNoteExporter';
import { downloadObsidianVault } from '../lib/exporters/obsidianVaultExporter';
import {
  isLetterboxdCsv,
  isLetterboxdZip,
  importLetterboxdZip,
  mergeSingleLetterboxdCsv,
} from '../lib/parsers/letterboxdParser';
import type { LetterboxdArchiveData } from '../types/library';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Archive,
  Loader2,
  Feather,
  Sparkles,
  Globe,
  Copy,
  Check,
  FileDown,
  FolderArchive,
  ArrowRight,
  Film,
} from 'lucide-react';

export interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBundle: LibraryBundle;
  onBundleUpdated: (newBundle: LibraryBundle) => void;
  onClippingsImported?: (clippings: KindleClipping[]) => void;
  onLetterboxdImported?: (data: LetterboxdArchiveData) => void;
  userState?: UserLocalState;
  enrichmentCache?: EnrichmentCacheMap;
  onPublicProfileLoaded?: (payload: {
    bundle: LibraryBundle;
    enrichment: EnrichmentCacheMap;
    userId: string;
    profileName: string | null;
  }) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  currentBundle,
  onBundleUpdated,
  onClippingsImported,
  onLetterboxdImported,
  userState,
  enrichmentCache,
  onPublicProfileLoaded,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [importedKindleCount, setImportedKindleCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // B-02: Public Goodreads Profile URL lookup
  const [profileInput, setProfileInput] = useState('');
  const [isFetchingRss, setIsFetchingRss] = useState(false);
  const [rssProgress, setRssProgress] = useState<RssFetchProgress | null>(null);
  const [rssError, setRssError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  // B-03: Export state
  const [isExportingZip, setIsExportingZip] = useState(false);

  // B-14 (Vance's Grant): Non-Destructive Sync Audit Reports
  const [libraryDiffReport, setLibraryDiffReport] = useState<LibraryImportDiffReport | null>(null);
  const [clippingsDiffReport, setClippingsDiffReport] = useState<ClippingsImportDiffReport | null>(
    null
  );

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setStatus('processing');
    setStatusMessage(`Reading ${file.name}...`);
    setImportedKindleCount(0);
    setLibraryDiffReport(null);
    setClippingsDiffReport(null);

    try {
      const fileName = file.name.toLowerCase();

      // 1. Kindle My Clippings.txt
      if (fileName.endsWith('.txt')) {
        setStatusMessage(`Parsing Kindle clippings & paired margin notes from ${file.name}...`);
        const text = await file.text();
        const clippings = parseKindleClippings(text, currentBundle.books);
        if (clippings.length === 0) {
          throw new Error(
            `No clippings could be extracted from ${file.name}. Ensure it is a valid Kindle 'My Clippings.txt' file.`
          );
        }
        const diff = computeClippingsImportDiff(userState?.kindleClippings || [], clippings);
        setClippingsDiffReport(diff);
        setImportedKindleCount(clippings.length);
        onClippingsImported?.(clippings);
        setStatus('success');
        setStatusMessage(
          `Extracted ${clippings.length} Kindle highlights (${diff.newClippingsCount} new, ${diff.duplicateSkippedCount} duplicates safely skipped) from ${file.name}.`
        );
      }
      // 1B. Kindle Notebook HTML Export (.html / .htm — Silas's Grant)
      else if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
        setStatusMessage(
          `Parsing Kindle Notebook HTML (chapters, highlight colors & paired notes) from ${file.name}...`
        );
        const html = await file.text();
        if (!isKindleNotebookHtml(html, file.name)) {
          throw new Error(
            `${file.name} does not appear to be a Kindle Notebook HTML export. Export notes from the Kindle mobile/desktop app or read.amazon.com/notebook.`
          );
        }
        const parsed = parseKindleNotebookHtml(html, currentBundle.books);
        if (parsed.clippings.length === 0) {
          throw new Error(
            `No highlights or notes could be extracted from ${file.name}.`
          );
        }
        const diff = computeClippingsImportDiff(
          userState?.kindleClippings || [],
          parsed.clippings
        );
        setClippingsDiffReport(diff);
        setImportedKindleCount(parsed.clippings.length);
        onClippingsImported?.(parsed.clippings);
        setStatus('success');
        setStatusMessage(
          `Extracted ${parsed.clippings.length} Kindle Notebook passages (${parsed.chaptersFound} chapter headings, ${diff.newClippingsCount} new highlights) from ${file.name}!`
        );
      }
      // 2. ZIP Archive: Either Letterboxd or Goodreads DSAR
      else if (fileName.endsWith('.zip')) {
        if (await isLetterboxdZip(file)) {
          setStatusMessage(`Extracting Letterboxd cinephile archive from ${file.name}...`);
          const lbData = await importLetterboxdZip(file);
          onLetterboxdImported?.(lbData);
          setStatus('success');
          setStatusMessage(
            `Extracted Letterboxd cinema archive from ${file.name}: ${lbData.totalWatchedCount} films watched (${lbData.totalReviewsCount} reviews, ${lbData.totalWatchlistCount} watchlist queued). Cinema mode is now active on your calendar matrix!`
          );
        } else {
          setStatusMessage('Extracting and reconciling Goodreads .ZIP archive files...');
          const rawIncoming = await importGoodreadsZip(file, currentBundle);
          const diff = computeLibraryImportDiff(currentBundle, rawIncoming, userState);
          const updatedBundle = mergeLibraryBundlesNonDestructive(currentBundle, rawIncoming);
          setLibraryDiffReport(diff);
          await persistLibraryBundle(updatedBundle);
          onBundleUpdated(updatedBundle);
          setStatus('success');
          setStatusMessage(
            `Non-destructively reconciled ${file.name}. Library now catalogs ${updatedBundle.books.length} volumes (${diff.preservedOverridesCount} local book overrides preserved untouched).`
          );
        }
      }
      // 3. CSV: Either Letterboxd or Goodreads Classic
      else if (fileName.endsWith('.csv')) {
        const text = await file.text();
        if (isLetterboxdCsv(file.name, text)) {
          setStatusMessage(`Parsing Letterboxd CSV data from ${file.name}...`);
          const mergedLb = mergeSingleLetterboxdCsv(file.name, text, userState?.letterboxdData);
          onLetterboxdImported?.(mergedLb);
          setStatus('success');
          setStatusMessage(
            `Synced Letterboxd file ${file.name}. Archive now tracks ${mergedLb.totalWatchedCount} films watched (${mergedLb.totalReviewsCount} reviews, ${mergedLb.totalWatchlistCount} watchlist items).`
          );
        } else {
          setStatusMessage('Parsing Goodreads CSV library export...');
          const incomingBooks = await parseGoodreadsCsv(text);
          const candidateBundle = mergeBooksIntoBundle(currentBundle, incomingBooks);
          const diff = computeLibraryImportDiff(currentBundle, candidateBundle, userState);
          const updatedBundle = mergeLibraryBundlesNonDestructive(currentBundle, candidateBundle);
          setLibraryDiffReport(diff);
          await persistLibraryBundle(updatedBundle);
          onBundleUpdated(updatedBundle);
          setStatus('success');
          setStatusMessage(
            `Non-destructively synced ${incomingBooks.length} CSV records from ${file.name}. Library now catalogs ${updatedBundle.books.length} volumes.`
          );
        }
      } else {
        throw new Error(
          'Unsupported format. Please select a Goodreads .csv, Letterboxd .csv/.zip, full export .zip, Kindle Notebook .html, or My Clippings.txt file.'
        );
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setStatus('error');
      setStatusMessage(err?.message || 'Failed to parse archive file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleProcessFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleProcessFile(file);
    }
  };

  const handleLoadSampleClippings = () => {
    setStatus('processing');
    setStatusMessage('Loading curated sample Kindle highlights...');
    try {
      const clippings = parseKindleClippings(SAMPLE_KINDLE_CLIPPINGS_TXT, currentBundle.books);
      setImportedKindleCount(clippings.length);
      onClippingsImported?.(clippings);
      setStatus('success');
      setStatusMessage(
        `Loaded ${clippings.length} sample Kindle highlights & paired marginalia (Osamu Dazai, Frank Herbert, Yusuf Atılgan). Check them out in The Study!`
      );
    } catch (err: any) {
      setStatus('error');
      setStatusMessage('Failed to load sample Kindle clippings.');
    }
  };

  // B-02: Fetch public Goodreads profile by URL or ID
  const handleFetchPublicProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanInput = profileInput.trim();
    if (!cleanInput) return;

    setIsFetchingRss(true);
    setRssError(null);
    setShareUrl(null);
    setRssProgress({
      shelf: 'read',
      page: 1,
      loadedBooks: 0,
      statusText: 'Connecting to Goodreads public shelves gateway...',
    });

    try {
      const res = await fetchGoodreadsPublicLibrary(cleanInput, (progress) => {
        setRssProgress(progress);
      });

      const share = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(res.userId)}`;
      setShareUrl(share);

      if (onPublicProfileLoaded) {
        onPublicProfileLoaded(res);
      } else {
        await persistLibraryBundle(res.bundle);
        onBundleUpdated(res.bundle);
      }

      setStatus('success');
      setStatusMessage(
        `Successfully loaded ${res.bundle.books.length} volumes from ${res.profileName || `Goodreads User #${res.userId}`}'s public shelves!`
      );
    } catch (err: any) {
      console.error('Failed to load public Goodreads profile:', err);
      setRssError(
        err?.message ||
          'Failed to load public shelves. Please ensure your profile is set to Public, or drop your .csv/.zip export below.'
      );
    } finally {
      setIsFetchingRss(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2200);
    } catch {
      // Ignore clipboard write restrictions
    }
  };

  // B-03: Export Markdown literature notes
  const annotatedBooks = currentBundle.books.filter((b) => bookHasAnnotations(b, userState));
  const readBooks = currentBundle.books.filter((b) => b.exclusiveShelf === 'read');

  const handleExportAnnotatedZip = async () => {
    if (isExportingZip || annotatedBooks.length === 0) return;
    setIsExportingZip(true);
    try {
      await downloadObsidianVault(annotatedBooks, userState, enrichmentCache, 'annotated');
    } catch (err) {
      console.error('Failed to export markdown zip:', err);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportReadZip = async () => {
    if (isExportingZip || readBooks.length === 0) return;
    setIsExportingZip(true);
    try {
      await downloadObsidianVault(readBooks, userState, enrichmentCache, 'read');
    } catch (err) {
      console.error('Failed to export markdown zip:', err);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setStatusMessage('');
    setImportedKindleCount(0);
    setRssError(null);
    setLibraryDiffReport(null);
    setClippingsDiffReport(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="drawer-backdrop fixed inset-0 transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl max-h-[92vh] rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-ledger)] shadow-2xl p-5 sm:p-7 overflow-y-auto animate-card-draw">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] flex items-center justify-center border border-[var(--accent-secondary)]/30">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif-editorial text-lg sm:text-xl font-bold text-[var(--text-ink)]">
                Archive, Profiles &amp; Literature Notes
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                Public Profile URL · File Drops (.csv, .zip, .html, .txt) · Markdown Exporter
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="mt-5 space-y-6">
          {status === 'idle' && (
            <>
              {/* SECTION 1 (B-02): SteamDB-Style Public Goodreads Profile URL Lookup */}
              <section className="p-4 sm:p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                  <h3 className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold">
                    Load Public Goodreads Profile by URL (SteamDB-style)
                  </h3>
                </div>

                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Enter any public Goodreads profile link or User ID to instantly pull all shelves, covers, reading dates, and ratings via polite RSS:
                </p>

                <form onSubmit={handleFetchPublicProfile} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={profileInput}
                    onChange={(e) => setProfileInput(e.target.value)}
                    placeholder="https://www.goodreads.com/user/show/137464693-murat or 137464693"
                    disabled={isFetchingRss}
                    className="flex-1 px-3 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs text-[var(--text-ink)] placeholder-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--accent-primary)] font-mono-tabular"
                  />
                  <button
                    type="submit"
                    disabled={isFetchingRss || !profileInput.trim()}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer whitespace-nowrap min-h-[38px]"
                  >
                    {isFetchingRss ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Pacing Feeds...</span>
                      </>
                    ) : (
                      <>
                        <span>Fetch Public Shelves</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>

                {/* Live RSS Fetching Progress Indicator */}
                {isFetchingRss && rssProgress && (
                  <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--accent-gold)]/40 space-y-2 animate-card-draw">
                    <div className="flex items-center justify-between text-xs font-mono-tabular">
                      <span className="text-[var(--text-muted)] font-medium">
                        Fetching shelf: <strong className="text-[var(--accent-primary)]">{rssProgress.shelf}</strong> (page {rssProgress.page})
                      </span>
                      <span className="font-bold text-[var(--accent-gold)]">
                        {rssProgress.loadedBooks} books loaded
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--border-ledger)] overflow-hidden">
                      <div className="h-full bg-[var(--accent-gold)] animate-pulse w-3/4 rounded-full" />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] italic">
                      {rssProgress.statusText}
                    </p>
                  </div>
                )}

                {/* Error Banner */}
                {rssError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold">Unable to fetch profile feeds</p>
                      <p className="text-[11px] mt-0.5">{rssError}</p>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-[var(--text-muted)]">
                  💡 <em>Note:</em> Private or friends-only profiles cannot be read by public RSS. If your shelves are set to private, drop your classic <strong className="text-[var(--text-ink)]">.csv</strong> or DSAR <strong className="text-[var(--text-ink)]">.zip</strong> export below!
                </p>
              </section>

              {/* SECTION 2: Drag & Drop Zone for Files */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
                  <h3 className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold">
                    Or Drop Classic Files (.csv, .zip, .html, .txt)
                  </h3>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-6 sm:p-8 rounded-xl border-2 border-dashed transition-all text-center cursor-pointer flex flex-col items-center justify-center ${
                    isDragging
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 scale-99'
                      : 'border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/60 bg-[var(--bg-card)]'
                  }`}
                >
                  <UploadCloud className="w-9 h-9 text-[var(--text-muted)] mb-2" />
                  <p className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)]">
                    Drag and drop your file here
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm">
                    Drop a <strong className="text-[var(--text-ink)]">goodreads_library_export.csv</strong>, Letterboxd <strong className="text-[var(--text-ink)]">diary.csv / .zip</strong>, account export <strong className="text-[var(--text-ink)]">.zip</strong>, Kindle <strong className="text-[var(--text-ink)]">Notebook.html</strong>, or <strong className="text-[var(--text-ink)]">My Clippings.txt</strong>.
                  </p>

                  <button
                    type="button"
                    className="mt-3 px-4 py-1.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-semibold text-[var(--text-ink)] hover:border-[var(--accent-primary)] transition-colors shadow-2xs cursor-pointer"
                  >
                    Browse Files (.csv, .zip, .html, .txt)
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.zip,.txt,.html,.htm"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* 4 Supported File Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-left">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--text-ink)] mb-1">
                      <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>Goodreads CSV</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-tight">
                      Standard export with reading dates, shelves, and ratings.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--text-ink)] mb-1">
                      <Archive className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                      <span>Goodreads ZIP</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-tight">
                      Full DSAR GDPR archive with quotes, notes, and activity.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--text-ink)] mb-1">
                      <Feather className="w-3.5 h-3.5 text-[var(--accent-gold)]" />
                      <span>Kindle .HTML / .TXT</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-tight">
                      Notebook.html or USB My Clippings.txt with passages &amp; notes.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)]">
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--text-ink)] mb-1">
                      <Film className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>Letterboxd .CSV / .ZIP</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-tight">
                      diary.csv, watched.csv, or account export .zip for screen intake.
                    </p>
                  </div>
                </div>

                {/* Demo Helper for Kindle Highlights */}
                <div className="p-3 rounded-lg bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--accent-gold)] shrink-0" />
                    <div className="text-xs text-[var(--text-ink)]">
                      <span className="font-semibold">No Kindle on hand?</span> Preview highlights &amp; paired margin notes right away with demo data.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleLoadSampleClippings}
                    className="px-3 py-1.5 rounded-md bg-[var(--accent-gold)] text-black text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer shadow-xs"
                  >
                    Load Demo Highlights
                  </button>
                </div>
              </section>

              {/* SECTION 3 (B-03): Book-by-Book Obsidian / Markdown Literature Notes Exporter */}
              <section className="p-4 sm:p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <FolderArchive className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
                  <h3 className="text-xs font-mono-tabular uppercase tracking-wider text-[var(--text-ink)] font-bold">
                    Export Obsidian / Markdown Literature Notes
                  </h3>
                </div>

                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Export your reading vault into your knowledge base. Every volume is formatted as its own individual <strong className="text-[var(--text-ink)] font-mono-tabular">&lt;Clean-Title&gt;.md</strong> file packed with YAML frontmatter, translation passport, personal review, and Kindle highlights:
                </p>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  {/* Export Annotated Books */}
                  <button
                    type="button"
                    onClick={handleExportAnnotatedZip}
                    disabled={isExportingZip || annotatedBooks.length === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)] hover:border-[var(--accent-secondary)] hover:bg-[var(--accent-secondary)]/10 text-xs font-mono-tabular font-medium text-[var(--text-ink)] disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                    title="Export books that have reviews, private notes, or Kindle highlights as individual .md files"
                  >
                    <FileDown className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-[11px] sm:text-xs">
                        Export Annotated Books ({annotatedBooks.length})
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        .zip of individual .md literature notes
                      </div>
                    </div>
                  </button>

                  {/* Export All Read Books */}
                  <button
                    type="button"
                    onClick={handleExportReadZip}
                    disabled={isExportingZip || readBooks.length === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-[var(--border-ledger)] bg-[var(--bg-surface)] hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10 text-xs font-mono-tabular font-medium text-[var(--text-ink)] disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                    title="Export all completed books as individual .md files"
                  >
                    <FolderArchive className="w-4 h-4 text-[var(--accent-gold)] shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-[11px] sm:text-xs">
                        Export All Read Books ({readBooks.length})
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        .zip of individual .md literature notes
                      </div>
                    </div>
                  </button>
                </div>
              </section>
            </>
          )}

          {status === 'processing' && (
            <div className="p-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-ledger)] text-center flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin" />
              <div className="font-serif-editorial text-base font-bold text-[var(--text-ink)]">
                Processing Archive
              </div>
              <p className="text-xs text-[var(--text-muted)] max-w-sm">
                {statusMessage}
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--accent-secondary)]/50 text-center space-y-4">
              <CheckCircle2 className="w-10 h-10 text-[var(--accent-secondary)] mx-auto" />
              <div>
                <h3 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
                  Library Ready
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-md mx-auto">
                  {statusMessage}
                </p>
              </div>

              {/* Non-Destructive Sync Audit Card (Vance's Grant) */}
              {libraryDiffReport && (
                <div className="p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-left max-w-lg mx-auto space-y-2.5 text-xs">
                  <div className="font-mono-tabular text-[10px] uppercase tracking-wider text-[var(--accent-secondary)] font-bold">
                    Non-Destructive Merge Audit Report
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-tabular text-center">
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)]">
                      <div className="font-bold text-sm text-[var(--accent-secondary)]">
                        +{libraryDiffReport.addedBooks.length}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">New Volumes</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)]">
                      <div className="font-bold text-sm text-[var(--accent-primary)]">
                        {libraryDiffReport.shelfTransitions.length}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Shelf Moves</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)]">
                      <div className="font-bold text-sm text-[var(--accent-gold)]">
                        {libraryDiffReport.ratingChanges.length}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Rating Updates</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)]">
                      <div className="font-bold text-sm text-[var(--text-ink)]">
                        {libraryDiffReport.preservedOverridesCount}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Overrides Safe</div>
                    </div>
                  </div>
                  {libraryDiffReport.shelfTransitions.length > 0 && (
                    <div className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-ledger)]/60">
                      <strong className="text-[var(--text-ink)]">Shelf Transitions:</strong>{' '}
                      {libraryDiffReport.shelfTransitions
                        .slice(0, 3)
                        .map((t) => `${t.title} (${t.fromShelf} → ${t.toShelf})`)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {clippingsDiffReport && (
                <div className="p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-left max-w-lg mx-auto space-y-2 text-xs">
                  <div className="font-mono-tabular text-[10px] uppercase tracking-wider text-[var(--accent-gold)] font-bold">
                    Kindle Marginalia Audit ({clippingsDiffReport.sourceFormat})
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-tabular text-center">
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)]">
                      <div className="font-bold text-sm text-[var(--accent-secondary)]">
                        +{clippingsDiffReport.newClippingsCount}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">New Passages</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)]">
                      <div className="font-bold text-sm text-[var(--text-muted)]">
                        {clippingsDiffReport.duplicateSkippedCount}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Dupes Skipped</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)]">
                      <div className="font-bold text-sm text-[var(--accent-primary)]">
                        {clippingsDiffReport.matchedBooksCount}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Books Matched</div>
                    </div>
                    <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-ledger)]">
                      <div className="font-bold text-sm text-[var(--accent-gold)]">
                        {clippingsDiffReport.chaptersDetectedCount}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Chapters Tagged</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Shareable URL Chip if loaded via Public Profile */}
              {shareUrl && (
                <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-ledger)] flex flex-col sm:flex-row items-center justify-between gap-2 max-w-lg mx-auto text-left">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[var(--text-muted)] font-bold block mb-0.5">
                      Shareable Ex Libris Link:
                    </span>
                    <span className="text-xs font-mono-tabular text-[var(--text-ink)] truncate block">
                      {shareUrl}
                    </span>
                  </div>

                  <button
                    onClick={handleCopyShareUrl}
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--accent-primary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs shrink-0"
                  >
                    {copiedShare ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-md bg-[var(--accent-secondary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                >
                  Explore Archive
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
                >
                  Load Another Source
                </button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="p-6 rounded-xl bg-[var(--bg-card)] border border-[var(--accent-primary)]/50 text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-[var(--accent-primary)] mx-auto" />
              <div>
                <h3 className="font-serif-editorial text-lg font-bold text-[var(--text-ink)]">
                  Import Failed
                </h3>
                <p className="text-xs text-[var(--accent-primary)] mt-1">
                  {statusMessage}
                </p>
              </div>

              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-semibold text-[var(--text-ink)] hover:border-[var(--accent-primary)] cursor-pointer"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
