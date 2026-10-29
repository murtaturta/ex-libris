import React, { useState, useRef } from 'react';
import { LibraryBundle, KindleClipping } from '../types/library';
import { parseGoodreadsCsv, mergeBooksIntoBundle } from '../lib/parsers/goodreadsCsv';
import { importGoodreadsZip } from '../lib/parsers/goodreadsZip';
import { parseKindleClippings, SAMPLE_KINDLE_CLIPPINGS_TXT } from '../lib/parsers/kindleClippings';
import { persistLibraryBundle } from '../lib/storage/localStateClient';
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
} from 'lucide-react';

export interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBundle: LibraryBundle;
  onBundleUpdated: (newBundle: LibraryBundle) => void;
  onClippingsImported?: (clippings: KindleClipping[]) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  currentBundle,
  onBundleUpdated,
  onClippingsImported,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [importedKindleCount, setImportedKindleCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setStatus('processing');
    setStatusMessage(`Reading ${file.name}...`);
    setImportedKindleCount(0);

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
        setImportedKindleCount(clippings.length);
        onClippingsImported?.(clippings);
        setStatus('success');
        setStatusMessage(
          `Successfully extracted ${clippings.length} Kindle highlights and paired notes from ${file.name}. They are now archived in your Study vault!`
        );
      }
      // 2. Goodreads DSAR Archive (.zip)
      else if (fileName.endsWith('.zip')) {
        setStatusMessage('Extracting and reconciling Goodreads .ZIP archive files...');
        const updatedBundle = await importGoodreadsZip(file, currentBundle);
        await persistLibraryBundle(updatedBundle);
        onBundleUpdated(updatedBundle);
        setStatus('success');
        setStatusMessage(
          `Successfully imported full archive from ${file.name}. Total library now has ${updatedBundle.books.length} volumes.`
        );
      }
      // 3. Goodreads Classic CSV (.csv)
      else if (fileName.endsWith('.csv')) {
        setStatusMessage('Parsing Goodreads CSV library export...');
        const text = await file.text();
        const incomingBooks = await parseGoodreadsCsv(text);
        const updatedBundle = mergeBooksIntoBundle(currentBundle, incomingBooks);
        await persistLibraryBundle(updatedBundle);
        onBundleUpdated(updatedBundle);
        setStatus('success');
        setStatusMessage(
          `Successfully parsed ${incomingBooks.length} records from ${file.name}. Total library updated to ${updatedBundle.books.length} volumes.`
        );
      } else {
        throw new Error(
          'Unsupported format. Please select a Goodreads .csv, full export .zip, or Kindle My Clippings.txt file.'
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

  const handleReset = () => {
    setStatus('idle');
    setStatusMessage('');
    setImportedKindleCount(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
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
      <div className="relative w-full max-w-xl rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-ledger)] shadow-2xl p-6 sm:p-7 overflow-hidden animate-card-draw">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-ledger)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] flex items-center justify-center border border-[var(--accent-secondary)]/30">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif-editorial text-lg sm:text-xl font-bold text-[var(--text-ink)]">
                Import Archive &amp; Marginalia
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                Goodreads .csv / .zip or Kindle My Clippings.txt
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="mt-5 space-y-4">
          {status === 'idle' && (
            <div>
              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-8 rounded-xl border-2 border-dashed transition-all text-center cursor-pointer flex flex-col items-center justify-center ${
                  isDragging
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 scale-99'
                    : 'border-[var(--border-ledger)] hover:border-[var(--accent-primary)]/60 bg-[var(--bg-card)]'
                }`}
              >
                <UploadCloud className="w-10 h-10 text-[var(--text-muted)] mb-3" />
                <p className="font-serif-editorial text-base sm:text-lg font-bold text-[var(--text-ink)]">
                  Drag and drop your file here
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm">
                  Drop a <strong className="text-[var(--text-ink)]">goodreads_library_export.csv</strong>, account export <strong className="text-[var(--text-ink)]">.zip</strong>, or your Kindle <strong className="text-[var(--text-ink)]">My Clippings.txt</strong>.
                </p>

                <button
                  type="button"
                  className="mt-4 px-4 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-semibold text-[var(--text-ink)] hover:border-[var(--accent-primary)] transition-colors shadow-2xs"
                >
                  Browse Files (.csv, .zip, .txt)
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.zip,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* 3 Supported File Cards */}
              <div className="grid grid-cols-3 gap-2.5 mt-4 text-left">
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
                    <span>Kindle Clippings</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] leading-tight">
                    Plug in Kindle via USB and drop My Clippings.txt.
                  </p>
                </div>
              </div>

              {/* Demo Helper for Kindle Highlights */}
              <div className="mt-4 p-3.5 rounded-lg bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30 flex items-center justify-between gap-3">
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
                  Load Sample Kindle Clippings (Demo)
                </button>
              </div>
            </div>
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
                  Import Successful
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-md mx-auto">
                  {statusMessage}
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-md bg-[var(--accent-secondary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
                >
                  Return to Archive
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-md bg-[var(--bg-surface)] border border-[var(--border-ledger)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
                >
                  Import Another File
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
