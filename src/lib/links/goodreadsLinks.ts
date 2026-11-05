import type { Book } from '../../types/library';

export interface GoodreadsLinkInfo {
  url: string;
  isDirectEdition: boolean;
  label: string;
  shortLabel: string;
}

/**
 * Checks whether an ID is a genuine positive numeric Goodreads Book ID
 * (as opposed to synthetic DSAR zip-* or Kindle clip-* IDs).
 */
export function isNumericGoodreadsId(id: string | null | undefined): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  return Number(trimmed) > 0;
}

/**
 * Resolves a direct Goodreads edition URL when a numeric Book ID exists,
 * gracefully falling back to an ISBN or Title + Author Goodreads search URL (B-01 / #11).
 */
export function getGoodreadsBookUrl(
  book: Pick<Book, 'id' | 'isbn13' | 'isbn' | 'cleanTitle' | 'title' | 'author'>
): GoodreadsLinkInfo {
  if (isNumericGoodreadsId(book.id)) {
    const cleanId = book.id.trim();
    return {
      url: `https://www.goodreads.com/book/show/${cleanId}`,
      isDirectEdition: true,
      label: `Goodreads #${cleanId}`,
      shortLabel: 'Goodreads',
    };
  }

  const query =
    (book.isbn13 && book.isbn13.trim()) ||
    (book.isbn && book.isbn.trim()) ||
    `${book.cleanTitle || book.title || ''} ${book.author || ''}`.trim() ||
    'book';

  return {
    url: `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`,
    isDirectEdition: false,
    label: 'Search on Goodreads',
    shortLabel: 'Find on Goodreads',
  };
}

/**
 * Resolves a Goodreads author search URL for any author or translator name.
 */
export function getGoodreadsAuthorUrl(authorName: string | null | undefined): string {
  const cleaned = (authorName || '').trim();
  if (!cleaned) {
    return 'https://www.goodreads.com/';
  }
  return `https://www.goodreads.com/search?q=${encodeURIComponent(cleaned)}&search_type=books&search%5Bfield%5D=author`;
}
