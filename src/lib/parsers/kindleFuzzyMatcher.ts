import type { Book, KindleClipping } from '../../types/library';

/**
 * Normalizes book or clipping titles for robust fuzzy matching.
 * Removes common Kindle export noise (e.g. subtitles, 'A Novel', '(Turkish Edition)', series tags).
 */
export function normalizeTitleForMatching(title: string): string {
  if (!title) return '';

  let clean = title.toLowerCase().trim();

  // Strip anything after colon, hyphen, or dash (subtitles)
  clean = clean.split(/[:\u2013\u2014-]/)[0].trim();

  // Strip parenthetical tags like (Turkish Edition), (Dune #1), (Author, #2)
  clean = clean.replace(/\([^)]*\)/g, '').trim();

  // Strip common filler phrases
  clean = clean
    .replace(/\b(a novel|the novel|novella|a graphic novel|series|cilt|kitap)\b/g, '')
    .trim();

  // Strip leading English articles
  clean = clean.replace(/^(the|a|an)\s+/i, '').trim();

  // Remove non-alphanumeric characters (keep unicode letters)
  clean = clean.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

  return clean;
}

/**
 * Computes bigram (Dice's coefficient) similarity between two strings (0.0 to 1.0).
 */
export function computeTitleSimilarity(strA: string, strB: string): number {
  const normA = normalizeTitleForMatching(strA);
  const normB = normalizeTitleForMatching(strB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    return Math.max(0.75, shorter / longer);
  }

  // Generate bigrams
  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  };

  const bigramsA = getBigrams(normA);
  const bigramsB = getBigrams(normB);

  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

export interface CandidateBookMatch {
  book: Book;
  score: number; // 0.0 - 1.0
  matchReason: 'exact' | 'normalized-exact' | 'author-token' | 'fuzzy';
}

/**
 * Finds candidate books from the library bundle for an unmatched clipping.
 */
export function findCandidateBooksForClipping(
  clippingTitle: string,
  clippingAuthor: string | null,
  books: Book[],
  minScore = 0.4
): CandidateBookMatch[] {
  const candidates: CandidateBookMatch[] = [];
  const normClip = normalizeTitleForMatching(clippingTitle);
  const authorLower = (clippingAuthor || '').toLowerCase().trim();

  for (const b of books) {
    const bTitle = b.cleanTitle || b.title;
    const normBook = normalizeTitleForMatching(bTitle);

    // 1. Exact or normalized exact
    if (clippingTitle.toLowerCase().trim() === bTitle.toLowerCase().trim()) {
      candidates.push({ book: b, score: 1.0, matchReason: 'exact' });
      continue;
    }
    if (normClip && normBook && normClip === normBook) {
      candidates.push({ book: b, score: 0.95, matchReason: 'normalized-exact' });
      continue;
    }

    // 2. Similarity calculation
    let sim = computeTitleSimilarity(clippingTitle, bTitle);

    // Author bonus
    if (authorLower && b.author) {
      const bAuthorLower = b.author.toLowerCase();
      if (authorLower.includes(bAuthorLower) || bAuthorLower.includes(authorLower)) {
        sim = Math.min(1.0, sim + 0.25);
      }
    }

    if (sim >= minScore) {
      candidates.push({
        book: b,
        score: Math.round(sim * 100) / 100,
        matchReason: sim >= 0.8 ? 'author-token' : 'fuzzy',
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Reconciles and pairs all clippings matching rawTitle or cleanTitle with a target bookId.
 */
export function reconcileClippingsWithBook(
  clippings: KindleClipping[],
  targetTitle: string,
  bookId: string
): {
  updatedClippings: KindleClipping[];
  reconciledCount: number;
} {
  const targetNorm = normalizeTitleForMatching(targetTitle);
  let reconciledCount = 0;

  const updatedClippings = clippings.map((c) => {
    // If already paired to another book, keep it unless it matches targetTitle
    const cNorm = normalizeTitleForMatching(c.cleanTitle || c.rawTitle);
    const isTarget =
      c.cleanTitle.toLowerCase().trim() === targetTitle.toLowerCase().trim() ||
      c.rawTitle.toLowerCase().trim() === targetTitle.toLowerCase().trim() ||
      (cNorm && targetNorm && cNorm === targetNorm);

    if (isTarget && c.matchedBookId !== bookId) {
      reconciledCount++;
      return {
        ...c,
        matchedBookId: bookId,
      };
    }
    return c;
  });

  return { updatedClippings, reconciledCount };
}
