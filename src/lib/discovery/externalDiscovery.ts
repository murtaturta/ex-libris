import type {
  Book,
  EnrichedBookMetadata,
  EnrichmentCacheMap,
  ExclusiveShelf,
  ExternalDiscoveryPick,
  LibraryBundle,
} from '../../types/library';
import { extractSeriesFromTitle, sanitizeIsbn } from '../formatters';

export interface DiscoveryProgress {
  phase?: 'idle' | 'authors' | 'subjects' | 'complete' | 'error' | string;
  step?: string;
  detail: string;
  completedSteps: number;
  totalSteps: number;
}

export interface ExternalDiscoveryBundle {
  fetchedAt: string;
  authorBacklist: ExternalDiscoveryPick[];
  subjectDna: ExternalDiscoveryPick[];
  dsarGraph: ExternalDiscoveryPick[];
}

export interface LibraryDedupeIndex {
  exactNormalizedTitles: Set<string>;
  titlesByAuthor: Map<string, Set<string>>;
  isbnSet: Set<string>;
  openLibraryWorkKeys: Set<string>;
}

const STORAGE_KEY_EXTERNAL_DISCOVERY = 'exlibris_external_discovery_cache_v01';

/**
 * Deterministic hash generator for pick IDs.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * High-school curriculum staples and over-recommended blockbusters.
 * Suppressed from Subject DNA intersections to allow genuine niche gems to shine.
 */
export const MEGA_CANONICAL_BLOCKLIST = new Set([
  '1984',
  'nineteen eighty four',
  'animal farm',
  'the great gatsby',
  'great gatsby',
  'to kill a mockingbird',
  'brave new world',
  'fahrenheit 451',
  'lord of the flies',
  'pride and prejudice',
  'the catcher in the rye',
  'catcher in the rye',
  'the hobbit',
  'hobbit',
  'harry potter and the sorcerer s stone',
  'harry potter and the philosopher s stone',
  'romeo and juliet',
  'hamlet',
  'macbeth',
  'the odyssey',
  'odyssey',
  'the iliad',
  'iliad',
  'jane eyre',
  'wuthering heights',
  'of mice and men',
  'frankenstein',
  'dracula',
  'the scarlet letter',
  'the crucible',
  'the picture of dorian gray',
  'the metamorphosis',
  'the stranger',
  'metamorphosis',
]);

/**
 * Cross-lingual canonical translation dictionary.
 * Maps Turkish, French, and international translated editions on Murat's shelves
 * to their English/original titles so unread backlist searches never recommend
 * a work the user has already read in another language.
 */
export const CANONICAL_TRANSLATION_MAP: Record<string, string> = {
  'sil bastan': 'replay',
  replay: 'sil bastan',
  olasiliksiz: 'improbable',
  improbable: 'olasiliksiz',
  mecburiyet: 'compulsion',
  compulsion: 'mecburiyet',
  'gun olur asra bedel': 'the day lasts more than a hundred years',
  'the day lasts more than a hundred years': 'gun olur asra bedel',
  'les mouches': 'the flies',
  'the flies': 'les mouches',
  calikusu: 'the wren',
  'the wren': 'calikusu',
  'anayurt oteli': 'motherland hotel',
  'motherland hotel': 'anayurt oteli',
  'kurk mantolu madonna': 'madonna in a fur coat',
  'madonna in a fur coat': 'kurk mantolu madonna',
  'saatleri ayarlama enstitusu': 'the time regulation institute',
  'the time regulation institute': 'saatleri ayarlama enstitusu',
  'hayvan ciftligi': 'animal farm',
  donusum: 'the metamorphosis',
  'insanligimi yitirirken': 'no longer human',
  sefiller: 'les miserables',
  'les miserables': 'sefiller',
  'suc ve ceza': 'crime and punishment',
  'crime and punishment': 'suc ve ceza',
  yabanci: 'the stranger',
  'l etranger': 'the stranger',
  'the stranger': 'yabanci',
  'puslu kitalar atlasi': 'the atlas of misty continents',
  tutunamayanlar: 'the disconnected',
};

/**
 * Normalizes title strings for rigorous deduplication:
 * Strips diacritics, subtitles after punctuation/parentheses, leading articles,
 * and collapses whitespace.
 */
export function normalizeTitleForDedupe(raw: string | null | undefined): string {
  if (!raw) return '';
  let str = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Strip subtitles after ':' or '—' or '–' or '(' or '['
  str = str.split(/[:—–\(\[]/)[0].trim();

  // Strip leading articles
  str = str.replace(/^(the|a|an|le|la|les|der|die|das|bir)\s+/i, '');

  // Strip non-alphanumeric and collapse spaces
  str = str.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  return str;
}

/**
 * Normalizes author names for fuzzy deduplication.
 */
function normalizeFuzzyAuthor(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates token overlap ratio between two title strings.
 */
function hasHighTokenOverlap(titleA: string, titleB: string): boolean {
  const filterWords = new Set(['the', 'and', 'for', 'with', 'from', 'into']);
  const tokensA = new Set(
    titleA
      .split(' ')
      .filter((t) => t.length > 2 && !filterWords.has(t))
  );
  const tokensB = new Set(
    titleB
      .split(' ')
      .filter((t) => t.length > 2 && !filterWords.has(t))
  );
  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let matches = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) matches++;
  }

  // Jaccard similarity >= 0.75
  const union = tokensA.size + tokensB.size - matches;
  const jaccard = matches / union;
  return jaccard >= 0.75;
}

/**
 * Checks if one title is simply an edition descriptor of the other
 * (e.g. "Dune" vs "Dune Special Collector Edition").
 */
function isEditionVariant(titleA: string, titleB: string): boolean {
  if (titleA === titleB) return true;
  const longer = titleA.length > titleB.length ? titleA : titleB;
  const shorter = titleA.length > titleB.length ? titleB : titleA;

  if (longer.startsWith(shorter + ' ')) {
    const rest = longer.slice(shorter.length + 1).trim();
    const editionTokens = new Set([
      'edition',
      'special',
      'deluxe',
      'anniversary',
      'collector',
      'collectors',
      'illustrated',
      'expanded',
      'updated',
      'revised',
      'unabridged',
    ]);
    const words = rest.split(' ').filter(Boolean);
    if (words.length > 0 && words.every((w) => editionTokens.has(w))) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a candidate title represents a junk catalog edition
 * (box sets, study guides, sparknotes, coloring books, multi-book bundles).
 */
export function isJunkEditionTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const junkPattern =
    /\b(box\s*set|boxed\s*set|omnibus|study\s*guide|summary\s*of|analysis\s*of|sparknotes|cliffsnotes|coloring\s*book|workbook|sampler|slipcase|\d+\s*books?\s*in\s*1|collection|compendium|anthology|boxset|deluxe\s+box|special\s+edition\s+box)\b/i;
  return junkPattern.test(title);
}

/**
 * Builds a fast, in-memory deduplication index across the user's entire library,
 * resolving cross-lingual aliases, ISBNs, and author title sets.
 */
export function buildLibraryDedupeIndex(
  bundle: LibraryBundle,
  enrichmentCache?: EnrichmentCacheMap
): LibraryDedupeIndex {
  const exactNormalizedTitles = new Set<string>();
  const titlesByAuthor = new Map<string, Set<string>>();
  const isbnSet = new Set<string>();
  const openLibraryWorkKeys = new Set<string>();

  for (const book of bundle.books || []) {
    const normClean = normalizeTitleForDedupe(book.cleanTitle);
    const normTitle = normalizeTitleForDedupe(book.title);

    if (normClean) {
      exactNormalizedTitles.add(normClean);
      const alias = CANONICAL_TRANSLATION_MAP[normClean];
      if (alias) exactNormalizedTitles.add(normalizeTitleForDedupe(alias));
    }
    if (normTitle) {
      exactNormalizedTitles.add(normTitle);
      const alias = CANONICAL_TRANSLATION_MAP[normTitle];
      if (alias) exactNormalizedTitles.add(normalizeTitleForDedupe(alias));
    }

    const normAuthor = normalizeFuzzyAuthor(book.author);
    if (normAuthor) {
      if (!titlesByAuthor.has(normAuthor)) {
        titlesByAuthor.set(normAuthor, new Set<string>());
      }
      const set = titlesByAuthor.get(normAuthor)!;
      if (normClean) set.add(normClean);
      if (normTitle) set.add(normTitle);
      const alias = CANONICAL_TRANSLATION_MAP[normClean || normTitle];
      if (alias) set.add(normalizeTitleForDedupe(alias));
    }

    if (book.isbn) isbnSet.add(book.isbn.replace(/[^0-9X]/gi, ''));
    if (book.isbn13) isbnSet.add(book.isbn13.replace(/[^0-9]/g, ''));

    const enriched = enrichmentCache?.[book.id];
    if (enriched && (enriched as any).openLibraryKey) {
      openLibraryWorkKeys.add((enriched as any).openLibraryKey);
    }
  }

  return {
    exactNormalizedTitles,
    titlesByAuthor,
    isbnSet,
    openLibraryWorkKeys,
  };
}

/**
 * Determines whether a candidate book is already present in the user's library,
 * accounting for cross-lingual editions, subtitles, and token overlap.
 */
export function isTitleAlreadyInLibrary(
  title: string,
  author: string | null | undefined,
  index: LibraryDedupeIndex
): boolean {
  if (!title) return true;
  const norm = normalizeTitleForDedupe(title);
  if (!norm) return true;

  // 1. Direct match on normalized title
  if (index.exactNormalizedTitles.has(norm)) {
    return true;
  }

  // 2. Canonical cross-lingual translation alias match
  const alias = CANONICAL_TRANSLATION_MAP[norm];
  if (alias && index.exactNormalizedTitles.has(normalizeTitleForDedupe(alias))) {
    return true;
  }

  // 3. Author-specific checks (edition variant or high token overlap)
  if (author) {
    const normAuthor = normalizeFuzzyAuthor(author);
    for (const [knownAuthor, knownTitles] of index.titlesByAuthor.entries()) {
      if (
        knownAuthor === normAuthor ||
        knownAuthor.includes(normAuthor) ||
        normAuthor.includes(knownAuthor)
      ) {
        for (const kt of knownTitles) {
          if (kt === norm) {
            return true;
          }
          if (isEditionVariant(norm, kt)) {
            return true;
          }
          if (hasHighTokenOverlap(norm, kt)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Engine 3: Synchronously extracts collaborative graph recommendations from Goodreads DSAR,
 * filtered against existing shelves, deduplicated, and ranked with honest provenance.
 */
export function extractDsarCollaborativeDiscovery(
  bundle: LibraryBundle,
  enrichmentCache?: EnrichmentCacheMap
): ExternalDiscoveryPick[] {
  const rawRecs = bundle.recommendations || [];
  if (rawRecs.length === 0) return [];

  const dedupeIndex = buildLibraryDedupeIndex(bundle, enrichmentCache);
  const bookByIdMap = new Map<string, Book>();
  const bookByTitleMap = new Map<string, Book>();

  for (const b of bundle.books || []) {
    bookByIdMap.set(b.id, b);
    bookByTitleMap.set(normalizeTitleForDedupe(b.cleanTitle || b.title), b);
  }

  // Group multiple recommendations for the same target title
  const grouped = new Map<
    string,
    {
      recommendedTitle: string;
      sources: {
        sourceBookTitle: string;
        sourceBookId: string | null;
        shelf: string | null;
        status: string | null;
      }[];
    }
  >();

  for (const rec of rawRecs) {
    const recTitle = (rec.recommendedTitle || '').trim();
    if (!recTitle) continue;

    // Reject junk editions or books already in library
    if (isJunkEditionTitle(recTitle)) continue;
    if (isTitleAlreadyInLibrary(recTitle, null, dedupeIndex)) continue;

    const normKey = normalizeTitleForDedupe(recTitle);
    if (!normKey) continue;

    if (!grouped.has(normKey)) {
      grouped.set(normKey, {
        recommendedTitle: recTitle,
        sources: [],
      });
    }

    grouped.get(normKey)!.sources.push({
      sourceBookTitle: rec.sourceBookTitle,
      sourceBookId: rec.sourceBookId,
      shelf: rec.shelf,
      status: rec.status,
    });
  }

  const picks: ExternalDiscoveryPick[] = [];

  for (const [normKey, group] of grouped.entries()) {
    const primarySource = group.sources[0];
    const sourceBook =
      (primarySource.sourceBookId ? bookByIdMap.get(primarySource.sourceBookId) : null) ||
      bookByTitleMap.get(normalizeTitleForDedupe(primarySource.sourceBookTitle));

    // Calculate ranking score
    let score = 50;

    // Status weighting
    const hasActive = group.sources.some((s) => s.status === 'active');
    const isMarkedForDeletion = group.sources.every((s) => s.status === 'marked for deletion');

    if (hasActive) {
      score += 40;
    } else if (isMarkedForDeletion) {
      score += 5;
    } else {
      score += 25;
    }

    // Anchor book shelf & rating weighting
    if (sourceBook) {
      if (sourceBook.exclusiveShelf === 'read') {
        if ((sourceBook.myRating || 0) >= 4) {
          score += 35;
        } else if (sourceBook.myRating === 3) {
          score += 20;
        } else {
          score += 10;
        }
      } else if (
        sourceBook.exclusiveShelf === 'currently-reading' ||
        sourceBook.exclusiveShelf === 'to-read'
      ) {
        score += 25;
      } else if (sourceBook.exclusiveShelf === 'did-not-finish') {
        score += 5;
      }
    }

    // Co-recommendation stacking bonus
    if (group.sources.length > 1) {
      score += Math.min(30, (group.sources.length - 1) * 15);
    }

    // Honest provenance string
    const anchorTitle = sourceBook?.cleanTitle || primarySource.sourceBookTitle || 'Shelf';
    let anchorDesc = '';
    if (sourceBook?.myRating) {
      anchorDesc = `Read · ${sourceBook.myRating}★`;
    } else if (sourceBook?.exclusiveShelf === 'to-read') {
      anchorDesc = 'On TBR';
    } else if (sourceBook?.exclusiveShelf === 'currently-reading') {
      anchorDesc = 'Currently Reading';
    } else {
      anchorDesc = 'Shelved';
    }

    let provenance = `Goodreads Graph · Anchored to ${anchorTitle} (${anchorDesc})`;
    if (group.sources.length > 1) {
      provenance += ` + ${group.sources.length - 1} other volumes`;
    }

    const reasons: string[] = [
      `Collaborative pick linked to your shelving of "${anchorTitle}"`,
    ];
    if (group.sources.length > 1) {
      reasons.push(
        `Cross-recommended across ${group.sources.length} distinct volumes in your Goodreads archive`
      );
    }

    const { cleanTitle } = extractSeriesFromTitle(group.recommendedTitle);

    picks.push({
      id: `dsar-${normKey}`,
      engine: 'dsar-graph',
      title: cleanTitle || group.recommendedTitle,
      author: null,
      yearPublished: null,
      pageCount: null,
      communityRating: null,
      ratingsCount: null,
      subjects: [],
      synopsis: null,
      coverUrl: null,
      anchorBookId: sourceBook?.id || primarySource.sourceBookId || null,
      anchorBookTitle: anchorTitle,
      anchorRating: sourceBook?.myRating || null,
      anchorShelf: sourceBook?.exclusiveShelf || null,
      provenance,
      reasons,
      score,
    });
  }

  picks.sort((a, b) => b.score - a.score);
  return picks;
}

let memoryCacheFallback: string | null = null;

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Storage restricted
  }
  return null;
}

/**
 * Loads cached external discovery results from localStorage.
 */
export function loadCachedExternalDiscovery(): {
  fetchedAt: string | null;
  authorBacklist: ExternalDiscoveryPick[];
  subjectDna: ExternalDiscoveryPick[];
} {
  try {
    const ls = getLocalStorage();
    const raw = ls ? ls.getItem(STORAGE_KEY_EXTERNAL_DISCOVERY) : memoryCacheFallback;
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        fetchedAt: parsed.fetchedAt || null,
        authorBacklist: Array.isArray(parsed.authorBacklist) ? parsed.authorBacklist : [],
        subjectDna: Array.isArray(parsed.subjectDna) ? parsed.subjectDna : [],
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { fetchedAt: null, authorBacklist: [], subjectDna: [] };
}

/**
 * Saves external discovery results to localStorage.
 */
export function saveCachedExternalDiscovery(data: {
  authorBacklist: ExternalDiscoveryPick[];
  subjectDna: ExternalDiscoveryPick[];
}): void {
  try {
    const payload = {
      fetchedAt: new Date().toISOString(),
      authorBacklist: data.authorBacklist,
      subjectDna: data.subjectDna,
    };
    const ls = getLocalStorage();
    if (ls) {
      ls.setItem(STORAGE_KEY_EXTERNAL_DISCOVERY, JSON.stringify(payload));
    } else {
      memoryCacheFallback = JSON.stringify(payload);
    }
  } catch {
    // Quota or storage restriction
  }
}

/**
 * Core 3-Engine External Discovery Scout.
 * Queries OpenLibrary & Google Books with rate-limit pacing and cross-lingual deduplication.
 */
export async function scoutExternalDiscovery(
  bundle: LibraryBundle,
  enrichmentCache: EnrichmentCacheMap,
  optionsOrProgress?:
    | ((progress: DiscoveryProgress) => void)
    | {
        signal?: AbortSignal;
        onProgress?: (progress: DiscoveryProgress) => void;
      },
  signalParam?: AbortSignal
): Promise<ExternalDiscoveryBundle> {
  let signal: AbortSignal | undefined;
  let onProgress: ((progress: DiscoveryProgress) => void) | undefined;

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
    signal = signalParam;
  } else if (optionsOrProgress && typeof optionsOrProgress === 'object') {
    onProgress = optionsOrProgress.onProgress;
    signal = optionsOrProgress.signal || signalParam;
  }

  const dedupeIndex = buildLibraryDedupeIndex(bundle, enrichmentCache);
  const authorBacklistPicks: ExternalDiscoveryPick[] = [];
  const subjectDnaPicks: ExternalDiscoveryPick[] = [];

  // =========================================================================
  // Engine 1: Unread Backlist & Missing Sequels from 4★–5★ Authors
  // =========================================================================
  onProgress?.({
    phase: 'authors',
    step: 'author-backlist',
    detail: 'Curating top 4★–5★ authors and detecting unfinished series…',
    completedSteps: 0,
    totalSteps: 8,
  });

  // Calculate author scores
  const authorStats = new Map<
    string,
    {
      author: string;
      readCount: number;
      avgRating: number;
      hasUnfinishedSeries: boolean;
      topBookTitle: string;
      topBookRating: number;
    }
  >();

  const followedAuthorsSet = new Set(
    (bundle.followedAuthors || []).map((a) => normalizeFuzzyAuthor(a.authorName))
  );

  for (const b of bundle.books || []) {
    if (!b.author || (b.myRating || 0) < 4) continue;
    const authorKey = b.author.trim();
    const normAuthor = normalizeFuzzyAuthor(authorKey);
    if (!normAuthor) continue;

    if (!authorStats.has(authorKey)) {
      authorStats.set(authorKey, {
        author: authorKey,
        readCount: 0,
        avgRating: 0,
        hasUnfinishedSeries: false,
        topBookTitle: b.cleanTitle || b.title,
        topBookRating: b.myRating || 5,
      });
    }

    const st = authorStats.get(authorKey)!;
    st.readCount++;
    st.avgRating = (st.avgRating * (st.readCount - 1) + (b.myRating || 5)) / st.readCount;

    if (b.seriesName && (b.seriesNumber === '1' || b.seriesNumber === '2')) {
      st.hasUnfinishedSeries = true;
    }

    if ((b.myRating || 0) > st.topBookRating) {
      st.topBookRating = b.myRating || 5;
      st.topBookTitle = b.cleanTitle || b.title;
    }
  }

  // Sort authors by priority
  const topAuthors = Array.from(authorStats.values())
    .sort((a, b) => {
      // Unfinished series prioritized
      if (a.hasUnfinishedSeries && !b.hasUnfinishedSeries) return -1;
      if (!a.hasUnfinishedSeries && b.hasUnfinishedSeries) return 1;

      // Followed authors bonus
      const aFollow = followedAuthorsSet.has(normalizeFuzzyAuthor(a.author));
      const bFollow = followedAuthorsSet.has(normalizeFuzzyAuthor(b.author));
      if (aFollow && !bFollow) return -1;
      if (!aFollow && bFollow) return 1;

      // Rating average
      return b.avgRating - a.avgRating;
    })
    .slice(0, 8);

  // Query each author's bibliography
  let step = 0;
  for (const aStat of topAuthors) {
    if (signal?.aborted) break;
    step++;
    onProgress?.({
      phase: 'authors',
      step: 'author-backlist',
      detail: `Scouting backlist for ${aStat.author} (${aStat.avgRating.toFixed(1)}★)…`,
      completedSteps: step,
      totalSteps: 8,
    });

    try {
      const olUrl = `https://openlibrary.org/search.json?author=${encodeURIComponent(
        aStat.author
      )}&sort=rating&fields=key,title,author_name,first_publish_year,number_of_pages_median,ratings_average,ratings_count,edition_count,subject,cover_i,isbn&limit=12`;

      let docs: any[] = [];
      const res = await fetch(olUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.docs)) {
          docs = data.docs;
        }
      }

      // Filter and score candidate works
      let authorPicksCount = 0;
      for (const doc of docs) {
        if (authorPicksCount >= 3) break;
        const candidateTitle = doc.title;
        if (!candidateTitle) continue;

        // Verify author name match (prevent fuzzy homonym errors)
        const docAuthors = Array.isArray(doc.author_name) ? doc.author_name : [];
        const normQueried = normalizeFuzzyAuthor(aStat.author);
        const matchesAuthor = docAuthors.some((da: string) => {
          const normDa = normalizeFuzzyAuthor(da);
          return normDa.includes(normQueried) || normQueried.includes(normDa);
        });
        if (docAuthors.length > 0 && !matchesAuthor) continue;

        // Deduplication & Junk filter
        if (isJunkEditionTitle(candidateTitle)) continue;
        if (isTitleAlreadyInLibrary(candidateTitle, aStat.author, dedupeIndex)) continue;

        // Sequel detection
        const { seriesName, seriesNumber } = extractSeriesFromTitle(candidateTitle);
        const isSequel = Boolean(
          seriesName &&
            aStat.hasUnfinishedSeries &&
            (seriesNumber ? parseInt(seriesNumber, 10) > 1 : true)
        );

        let score = 60 + (aStat.topBookRating >= 5 ? 15 : 5);
        if (isSequel) score += 25;
        if (doc.ratings_average) score += Math.round(doc.ratings_average * 5);
        if (doc.edition_count && doc.edition_count >= 3 && doc.edition_count <= 250) {
          score += 15;
        }

        const coverUrl =
          typeof doc.cover_i === 'number'
            ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
            : null;

        const isbn = Array.isArray(doc.isbn) && doc.isbn.length > 0 ? sanitizeIsbn(doc.isbn[0]) : null;

        const provenance = isSequel
          ? `Missing Sequel · You rated ${aStat.topBookTitle} ${aStat.topBookRating}★`
          : `Unread Backlist · You rated ${aStat.topBookTitle} ${aStat.topBookRating}★`;

        const reasons: string[] = [
          `Unread title by ${aStat.author} (${aStat.avgRating.toFixed(1)}★ across your shelves)`,
        ];
        if (isSequel) reasons.push('Identified as next installment in an ongoing series');
        if (doc.ratings_average) {
          reasons.push(`Community rated ${Number(doc.ratings_average).toFixed(2)}★ on OpenLibrary`);
        }

        authorBacklistPicks.push({
          id: `author-${doc.key || hashString(candidateTitle)}`,
          engine: 'author-backlist',
          title: candidateTitle,
          author: aStat.author,
          yearPublished: doc.first_publish_year || null,
          pageCount: doc.number_of_pages_median || null,
          communityRating: doc.ratings_average ? Number(doc.ratings_average.toFixed(2)) : null,
          ratingsCount: doc.ratings_count || null,
          editionCount: doc.edition_count || null,
          subjects: Array.isArray(doc.subject) ? doc.subject.slice(0, 4) : [],
          synopsis: null,
          coverUrl,
          isbn,
          openLibraryKey: doc.key || null,
          isSequel,
          seriesHint: seriesName ? `${seriesName} #${seriesNumber || '?'}` : null,
          anchorBookTitle: aStat.topBookTitle,
          anchorRating: aStat.topBookRating,
          provenance,
          reasons,
          score,
        });

        authorPicksCount++;
      }
    } catch {
      // Gracefully continue to next author
    }

    // Polite pacing delay between author queries
    await new Promise((r) => setTimeout(r, 400));
  }

  // =========================================================================
  // Engine 2: Multi-Subject "Literary DNA" Intersections
  // =========================================================================
  onProgress?.({
    phase: 'subjects',
    step: 'subject-dna',
    detail: 'Synthesizing literary DNA subject intersections…',
    completedSteps: 4,
    totalSteps: 8,
  });

  // Extract niche subjects from 4★–5★ enriched books
  const subjectFrequency = new Map<string, number>();
  for (const b of bundle.books || []) {
    if ((b.myRating || 0) < 4) continue;
    const enriched = enrichmentCache[b.id];
    if (!enriched || !Array.isArray(enriched.subjects)) continue;

    for (const sub of enriched.subjects) {
      const lower = sub.toLowerCase().trim();
      if (
        lower.length < 4 ||
        lower === 'fiction' ||
        lower === 'general' ||
        lower.includes('bestseller') ||
        lower.includes('literature') ||
        lower.includes('open_syllabus')
      ) {
        continue;
      }
      subjectFrequency.set(lower, (subjectFrequency.get(lower) || 0) + 1);
    }
  }

  const sortedNicheSubjects = Array.from(subjectFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  // Form subject pairs (use curated fallbacks if user library subjects are sparse)
  const subjectPairs: [string, string][] = [];
  if (sortedNicheSubjects.length >= 2) {
    subjectPairs.push([sortedNicheSubjects[0], sortedNicheSubjects[1]]);
    if (sortedNicheSubjects.length >= 4) {
      subjectPairs.push([sortedNicheSubjects[2], sortedNicheSubjects[3]]);
    }
  }

  // Fallback / standard literary DNA pairs
  const defaultPairs: [string, string][] = [
    ['science fiction', 'dystopias'],
    ['post-apocalyptic', 'survival'],
    ['historical fiction', 'world war'],
    ['philosophy', 'existentialism'],
  ];

  for (const dp of defaultPairs) {
    if (subjectPairs.length < 4) {
      subjectPairs.push(dp);
    }
  }

  for (let pIdx = 0; pIdx < Math.min(4, subjectPairs.length); pIdx++) {
    if (signal?.aborted) break;
    const [s1, s2] = subjectPairs[pIdx];

    onProgress?.({
      phase: 'subjects',
      step: 'subject-dna',
      detail: `Querying intersection: "${s1}" × "${s2}"…`,
      completedSteps: 4 + pIdx + 1,
      totalSteps: 8,
    });

    try {
      const query = `subject:"${s1}" AND subject:"${s2}"`;
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(
        query
      )}&sort=rating&fields=key,title,author_name,first_publish_year,number_of_pages_median,ratings_average,ratings_count,edition_count,subject,cover_i,isbn&limit=10`;

      const res = await fetch(olUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.docs)) {
          for (const doc of data.docs) {
            if (subjectDnaPicks.length >= 16) break;
            const candidateTitle = doc.title;
            if (!candidateTitle) continue;

            const normCandidate = normalizeTitleForDedupe(candidateTitle);

            // Cliché suppression: block mega-canonical high-school staples
            if (MEGA_CANONICAL_BLOCKLIST.has(normCandidate)) continue;

            // Deduplication & Junk filter
            if (isJunkEditionTitle(candidateTitle)) continue;
            const author = Array.isArray(doc.author_name) ? doc.author_name[0] : null;
            if (isTitleAlreadyInLibrary(candidateTitle, author, dedupeIndex)) continue;

            // Prevent duplicate picks across Engine 1 & Engine 2
            if (authorBacklistPicks.some((p) => normalizeTitleForDedupe(p.title) === normCandidate)) {
              continue;
            }
            if (subjectDnaPicks.some((p) => normalizeTitleForDedupe(p.title) === normCandidate)) {
              continue;
            }

            // Score calculation
            let score = 55;
            if (doc.ratings_average) score += Math.round(doc.ratings_average * 6);

            // Reward cult sweet-spot (5..250 editions), penalize >1000 edition mega-blockbusters
            if (doc.edition_count) {
              if (doc.edition_count >= 5 && doc.edition_count <= 250) {
                score += 20;
              } else if (doc.edition_count > 1000) {
                score -= 25;
              }
            }

            const coverUrl =
              typeof doc.cover_i === 'number'
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
                : null;
            const isbn =
              Array.isArray(doc.isbn) && doc.isbn.length > 0 ? sanitizeIsbn(doc.isbn[0]) : null;

            subjectDnaPicks.push({
              id: `dna-${doc.key || hashString(candidateTitle)}`,
              engine: 'subject-dna',
              title: candidateTitle,
              author,
              yearPublished: doc.first_publish_year || null,
              pageCount: doc.number_of_pages_median || null,
              communityRating: doc.ratings_average ? Number(doc.ratings_average.toFixed(2)) : null,
              ratingsCount: doc.ratings_count || null,
              editionCount: doc.edition_count || null,
              subjects: Array.isArray(doc.subject) ? doc.subject.slice(0, 4) : [s1, s2],
              synopsis: null,
              coverUrl,
              isbn,
              openLibraryKey: doc.key || null,
              provenance: `Subject DNA · ${s1} × ${s2}`,
              reasons: [
                `Intersects your high-rated interest in both "${s1}" and "${s2}"`,
                doc.ratings_average
                  ? `Community rating of ${Number(doc.ratings_average).toFixed(2)}★ on OpenLibrary`
                  : 'Acclaimed subject alignment',
              ],
              score,
            });
          }
        }
      }
    } catch {
      // Gracefully continue
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  // Save successful discovery runs to local cache
  saveCachedExternalDiscovery({
    authorBacklist: authorBacklistPicks,
    subjectDna: subjectDnaPicks,
  });

  // Extract Engine 3 DSAR recommendations
  const dsarGraphPicks = extractDsarCollaborativeDiscovery(bundle, enrichmentCache);

  onProgress?.({
    phase: 'complete',
    step: 'complete',
    detail: `Discovery complete! Found ${authorBacklistPicks.length} backlist picks, ${subjectDnaPicks.length} subject intersections, and ${dsarGraphPicks.length} collaborative picks.`,
    completedSteps: 8,
    totalSteps: 8,
  });

  return {
    fetchedAt: new Date().toISOString(),
    authorBacklist: authorBacklistPicks,
    subjectDna: subjectDnaPicks,
    dsarGraph: dsarGraphPicks,
  };
}
