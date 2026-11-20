import type { Book, KindleClipping } from '../../types/library';
import { findMatchingBook } from './kindleClippings';

/**
 * Checks whether raw JSON text is an Ex Libris Kindle Sync bundle
 * (`ex-libris-kindle-sync-v1`) produced by `scripts/sync_kindle.py`
 * (or a `user_state.json` containing `kindleClippings`).
 */
export function isKindleSyncJson(rawText: string): boolean {
  if (!rawText || typeof rawText !== 'string') return false;
  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.format === 'ex-libris-kindle-sync-v1' && Array.isArray(parsed.clippings)) {
      return true;
    }
    if (Array.isArray(parsed.kindleClippings) && parsed.kindleClippings.length > 0) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Parses an Ex Libris Kindle Sync JSON file (combined `My Clippings.txt` +
 * `ksdk_annotation_v1.db` KFX highlights/notes) and re-links books cleanly
 * against the active library catalog.
 */
export function parseKindleSyncJson(
  rawText: string,
  books: Book[] = []
): KindleClipping[] {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  const parsed = JSON.parse(trimmed);
  const rawItems: any[] = Array.isArray(parsed.clippings)
    ? parsed.clippings
    : Array.isArray(parsed.kindleClippings)
      ? parsed.kindleClippings
      : [];

  return rawItems.map((item, idx) => {
    const cleanTitle = String(item.cleanTitle || item.rawTitle || 'Untitled').trim();
    const rawTitle = String(item.rawTitle || cleanTitle).trim();
    const author = item.author ? String(item.author).trim() : null;
    const matched = books.length > 0 ? findMatchingBook(cleanTitle, rawTitle, author, books) : null;

    return {
      id: String(item.id || `ksdk_${idx + 1}`),
      rawTitle,
      cleanTitle,
      author,
      matchedBookId: matched ? matched.id : item.matchedBookId || null,
      type: item.type === 'note' || item.type === 'bookmark' ? item.type : 'highlight',
      page: typeof item.page === 'number' ? item.page : null,
      locationStart: typeof item.locationStart === 'number' ? item.locationStart : null,
      locationEnd: typeof item.locationEnd === 'number' ? item.locationEnd : null,
      addedAt: item.addedAt ? String(item.addedAt) : null,
      content: String(item.content || ''),
      attachedNote: item.attachedNote ? String(item.attachedNote) : null,
      chapter: item.chapter ? String(item.chapter) : null,
      highlightColor: item.highlightColor ? String(item.highlightColor) : null,
      sourceFormat:
        item.sourceFormat === 'ksdk-sync' ||
        item.sourceFormat === 'notebook-html' ||
        item.sourceFormat === 'clippings-txt'
          ? item.sourceFormat
          : 'ksdk-sync',
    };
  });
}
