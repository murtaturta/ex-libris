import JSZip from 'jszip';
import type {
  AchievementBadge,
  ActivityByHour,
  Book,
  BookKindleNote,
  FavoriteGenres,
  FollowedAuthor,
  HourlyActivityBucket,
  KindleNote,
  LibraryBundle,
  LikedQuote,
  ReadingGoal,
  ReadingSession,
  RecommendationItem,
  ReviewDetails,
  ReviewDraft,
  ShelvingRecord,
} from '../../types/library';
import { extractSeriesFromTitle } from '../formatters';
import { calculateSummaryStats } from './goodreadsCsv';

/**
 * Normalizes title strings for fuzzy matching across DSAR tables.
 */
function normalizeForMatching(s: string): string {
  const { cleanTitle } = extractSeriesFromTitle(s);
  return cleanTitle
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds a book in the library matching a given raw title string.
 */
function findMatchingBook(books: Book[], rawTitle: string): Book | undefined {
  if (!rawTitle) return undefined;
  const clean = rawTitle.trim();
  const lower = clean.toLowerCase();

  // 1. Exact match on title or cleanTitle
  for (const b of books) {
    if (b.title === clean || b.cleanTitle === clean) return b;
  }

  // 2. Case-insensitive exact match
  for (const b of books) {
    if (b.title.toLowerCase() === lower || b.cleanTitle.toLowerCase() === lower) return b;
  }

  // 3. Normalized title match
  const normRaw = normalizeForMatching(clean);
  if (normRaw) {
    for (const b of books) {
      if (
        normalizeForMatching(b.title) === normRaw ||
        normalizeForMatching(b.cleanTitle) === normRaw
      ) {
        return b;
      }
    }
  }

  // 4. Substring match for titles longer than 6 characters
  if (normRaw.length > 6) {
    for (const b of books) {
      const bNorm = normalizeForMatching(b.cleanTitle);
      if (bNorm.length > 6 && (bNorm.includes(normRaw) || normRaw.includes(bNorm))) {
        return b;
      }
    }
  }

  return undefined;
}

/**
 * Extracts and parses a JSON table from an outer Goodreads zip archive.
 * Handles both inner nested zips (`${name}.zip` -> `${name}.json`) and direct `.json` files.
 */
async function loadJsonFromZip(zip: JSZip, name: string): Promise<any | null> {
  // 1. Look for inner nested zip file: ${name}.zip
  let innerZipFile = zip.file(`${name}.zip`);
  if (!innerZipFile) {
    const matches = zip.file(new RegExp(`(^|/)${name}\\.zip$`, 'i'));
    if (matches && matches.length > 0) {
      innerZipFile = matches[0];
    }
  }

  if (innerZipFile) {
    try {
      const innerBuf = await innerZipFile.async('arraybuffer');
      const innerZip = await JSZip.loadAsync(innerBuf);
      let jsonFile = innerZip.file(`${name}.json`);
      if (!jsonFile) {
        const jsonMatches = innerZip.file(/\.json$/i);
        if (jsonMatches && jsonMatches.length > 0) {
          jsonFile = jsonMatches[0];
        }
      }
      if (jsonFile) {
        const text = await jsonFile.async('string');
        return JSON.parse(text);
      }
    } catch (e) {
      console.warn(`Could not parse inner zip for ${name}:`, e);
    }
  }

  // 2. Look for direct JSON file: ${name}.json
  let directJson = zip.file(`${name}.json`);
  if (!directJson) {
    const jsonMatches = zip.file(new RegExp(`(^|/)${name}\\.json$`, 'i'));
    if (jsonMatches && jsonMatches.length > 0) {
      directJson = jsonMatches[0];
    }
  }

  if (directJson) {
    try {
      const text = await directJson.async('string');
      return JSON.parse(text);
    } catch (e) {
      console.warn(`Could not parse direct JSON for ${name}:`, e);
    }
  }

  return null;
}

/**
 * Ingests a Goodreads DSAR export (Goodreads.zip), reconciling its multi-table JSON
 * data onto an existing LibraryBundle.
 */
export async function importGoodreadsZip(
  fileOrBuffer: Blob | ArrayBuffer,
  existingBundle: LibraryBundle
): Promise<LibraryBundle> {
  const zip = await JSZip.loadAsync(fileOrBuffer);

  // Clone books to allow safe mutation during reconciliation
  const books: Book[] = existingBundle.books.map(b => ({
    ...b,
    readingSessions: [...b.readingSessions],
    kindleNotes: [...b.kindleNotes],
    recommendations: [...b.recommendations],
  }));

  let totalShelvings = 0;
  let matchedShelvings = 0;
  let totalReviews = 0;
  let matchedReviews = 0;
  let totalSessions = 0;
  let attachedSessions = 0;
  let totalNotes = 0;
  let matchedNotes = 0;

  // 1. Process `shelvings.zip` / `shelvings.json` (Archetype A)
  const shelvingsData = await loadJsonFromZip(zip, 'shelvings');
  if (Array.isArray(shelvingsData)) {
    const records = shelvingsData.slice(1); // skip explanation header [0]
    totalShelvings = records.length;

    for (const record of records) {
      if (!record || !record.book) continue;
      const matched = findMatchingBook(books, record.book);

      const shelvingRecord: ShelvingRecord = {
        readStatus: record.read_status || 'to-read',
        createdAt: record.created_at !== '(not provided)' ? record.created_at : null,
        updatedAt: record.updated_at !== '(not provided)' ? record.updated_at : null,
        lastRevisionAt:
          record.last_revision_at !== '(not provided)' ? record.last_revision_at : null,
        notes: record.notes !== '(not provided)' ? record.notes : null,
      };

      if (matched) {
        matchedShelvings++;
        matched.shelving = shelvingRecord;
        if (record.read_status && matched.exclusiveShelf === 'to-read') {
          matched.exclusiveShelf = record.read_status;
        }
      } else {
        // Create an uncataloged book record from shelving if missing from CSV
        const { cleanTitle, seriesName, seriesNumber } = extractSeriesFromTitle(record.book);
        const newBook: Book = {
          id: `dsar-shelf-${books.length + 1}`,
          title: record.book,
          cleanTitle,
          seriesName,
          seriesNumber,
          author: '',
          authorSort: null,
          additionalAuthors: [],
          isbn: null,
          isbn13: null,
          myRating: null,
          averageRating: null,
          publisher: null,
          binding: null,
          pageCount: null,
          yearPublished: null,
          originalPublicationYear: null,
          dateRead: null,
          dateAdded:
            record.created_at && record.created_at !== '(not provided)'
              ? record.created_at.slice(0, 10)
              : null,
          exclusiveShelf: record.read_status || 'to-read',
          bookshelves: [],
          bookshelvesWithPositions: null,
          readCount: record.read_status === 'read' ? 1 : 0,
          ownedCopies: 0,
          myReview: null,
          spoiler: false,
          privateNotes: record.notes !== '(not provided)' ? record.notes : null,
          shelving: shelvingRecord,
          reviewDetails: null,
          readingSessions: [],
          kindleNotes: [],
          recommendations: [],
        };
        books.push(newBook);
      }
    }
  }

  // 2. Process `reviews.zip` / `reviews.json` (Archetype B)
  const updatedReviewDrafts: ReviewDraft[] = [...existingBundle.reviewDrafts];
  const reviewsData = await loadJsonFromZip(zip, 'reviews');
  if (Array.isArray(reviewsData) && reviewsData[1]) {
    const rawReviews = reviewsData[1].reviews;
    const rawDrafts = reviewsData[1].review_drafts;

    if (Array.isArray(rawReviews)) {
      totalReviews = rawReviews.length;
      for (const rev of rawReviews) {
        if (!rev || !rev.book) continue;
        const matched = findMatchingBook(books, rev.book);

        const reviewDetails: ReviewDetails = {
          rating: typeof rev.rating === 'number' ? rev.rating : null,
          ratingCreatedAt:
            rev.rating_created_at !== '(not provided)' ? rev.rating_created_at : null,
          createdAt: rev.created_at !== '(not provided)' ? rev.created_at : null,
          updatedAt: rev.updated_at !== '(not provided)' ? rev.updated_at : null,
          lastRevisionAt:
            rev.last_revision_at !== '(not provided)' ? rev.last_revision_at : null,
          hasText: rev.has_text === 'Yes',
          reviewTextLanguage:
            rev.review_text_language !== '(not provided)' ? rev.review_text_language : null,
          includesSpoilers: rev.includes_spoilers === 'Yes',
        };

        if (matched) {
          matchedReviews++;
          matched.reviewDetails = reviewDetails;
          if (typeof rev.rating === 'number' && matched.myRating === null) {
            matched.myRating = Math.round(rev.rating);
          }
          if (rev.review && rev.review !== '(not provided)' && !matched.myReview) {
            matched.myReview = rev.review;
          }
          if (rev.includes_spoilers === 'Yes') {
            matched.spoiler = true;
          }
        }
      }
    }

    if (Array.isArray(rawDrafts)) {
      for (const draft of rawDrafts) {
        if (!draft || !draft.book) continue;
        const matched = findMatchingBook(books, draft.book);
        updatedReviewDrafts.push({
          bookId: matched?.id ?? null,
          bookTitle: draft.book,
          review: draft.review !== '(not provided)' ? draft.review : null,
          createdAt: draft.created_at !== '(not provided)' ? draft.created_at : null,
          updatedAt: draft.updated_at !== '(not provided)' ? draft.updated_at : null,
          user: draft.user !== '(not provided)' ? draft.user : undefined,
        });
      }
    }
  }

  // 3. Process `reading_sessions.zip` / `reading_sessions.json` (Archetype A)
  const sessionsData = await loadJsonFromZip(zip, 'reading_sessions');
  if (Array.isArray(sessionsData)) {
    const sessionRecords = sessionsData.slice(1);
    totalSessions = sessionRecords.length;

    for (const record of sessionRecords) {
      if (!record || !record.book) continue;
      const matched = findMatchingBook(books, record.book);

      const startedAt =
        record.started_at !== '(not provided)' ? record.started_at : null;
      const endedAt =
        record.ended_at !== '(not provided)' ? record.ended_at : null;

      let durationDays: number | null = null;
      if (startedAt && endedAt) {
        const startMs = new Date(startedAt).getTime();
        const endMs = new Date(endedAt).getTime();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
          durationDays = Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
        }
      }

      const session: ReadingSession = {
        startedAt,
        endedAt,
        state: record.state || 'COMPLETED',
        durationDays,
      };

      if (matched) {
        // Prevent duplicate sessions
        const isDuplicate = matched.readingSessions.some(
          s => s.startedAt === session.startedAt && s.endedAt === session.endedAt
        );
        if (!isDuplicate) {
          matched.readingSessions.push(session);
          attachedSessions++;
        }
        if (endedAt && !matched.dateRead) {
          matched.dateRead = endedAt.slice(0, 10);
        }
      }
    }
  }

  // 4. Process `notes.zip` / `notes.json` (Archetype B)
  const updatedKindleNotes: KindleNote[] = [...existingBundle.kindleNotes];
  const notesData = await loadJsonFromZip(zip, 'notes');
  if (Array.isArray(notesData) && notesData[1] && Array.isArray(notesData[1].notes)) {
    const rawNotes = notesData[1].notes;
    totalNotes = rawNotes.length;

    for (const note of rawNotes) {
      if (!note) continue;

      let matched: Book | undefined;
      // Try resolving via activity text first: "User status for book <title>"
      if (note.activity) {
        const match = note.activity.match(/User status for book (.*)$/i);
        if (match) {
          matched = findMatchingBook(books, match[1].trim());
        }
      }
      // Fallback to product title
      if (!matched && note.product) {
        matched = findMatchingBook(books, note.product.trim());
      }

      const bookNote: BookKindleNote = {
        activity: note.activity || '',
        product: note.product || '',
        noteText: note.note_text || '',
        noteActivityType: note.note_activity_type || undefined,
        createdAt: note.created_at || '',
      };

      if (matched) {
        matchedNotes++;
        matched.kindleNotes.push(bookNote);
      }

      updatedKindleNotes.push({
        ...bookNote,
        bookId: matched?.id ?? null,
        bookTitle: matched?.title ?? note.product ?? '',
        user: note.user || undefined,
      });
    }
  }

  // 5. Process `user_quote.zip` / `user_quote.json` (Archetype A)
  const updatedQuotes: LikedQuote[] = [...existingBundle.quotes];
  const quotesData = await loadJsonFromZip(zip, 'user_quote');
  if (Array.isArray(quotesData)) {
    const records = quotesData.slice(1);
    for (const q of records) {
      if (!q || !q.quote) continue;
      const isDuplicate = updatedQuotes.some(
        uq => uq.quote === q.quote && uq.createdAt === q.created_at
      );
      if (!isDuplicate) {
        updatedQuotes.push({
          quote: q.quote,
          liked: q.liked === 'Yes' || q.liked === 'true',
          origin: q.origin !== '(not provided)' ? q.origin : null,
          quotePosition:
            typeof q.quote_position === 'number'
              ? q.quote_position
              : parseInt(q.quote_position, 10) || null,
          createdAt: q.created_at !== '(not provided)' ? q.created_at : null,
          updatedAt: q.updated_at !== '(not provided)' ? q.updated_at : null,
          user: q.user !== '(not provided)' ? q.user : undefined,
        });
      }
    }
  }

  // 6. Process recommendations: `related_work_recommendation.zip` & `suggestions.zip`
  const updatedRecommendations: RecommendationItem[] = [...existingBundle.recommendations];

  const relatedData = await loadJsonFromZip(zip, 'related_work_recommendation');
  if (Array.isArray(relatedData)) {
    const records = relatedData.slice(1);
    for (const rec of records) {
      if (!rec || !rec.book) continue;
      const sources: string[] = Array.isArray(rec.because_you_read)
        ? rec.because_you_read
        : [];

      for (const srcTitle of sources) {
        const srcBook = findMatchingBook(books, srcTitle);
        const item: RecommendationItem = {
          source: 'related_work',
          sourceBookId: srcBook?.id ?? null,
          sourceBookTitle: srcTitle,
          recommendedTitle: rec.book,
          shelf: rec.shelf !== '(not provided)' ? rec.shelf : null,
          status: rec.status !== '(not provided)' ? rec.status : null,
          rank: null,
          updatedAt: rec.updated_at !== '(not provided)' ? rec.updated_at : null,
        };

        if (srcBook) {
          srcBook.recommendations.push(item);
        }
        updatedRecommendations.push(item);
      }
    }
  }

  const suggestionsData = await loadJsonFromZip(zip, 'suggestions');
  if (Array.isArray(suggestionsData) && suggestionsData[1]) {
    const listMap: Record<string, string> = {
      similarBooksCurRead: 'suggestions_currently_reading',
      similarBooksWantToRead: 'suggestions_want_to_read',
      similarBooks: 'suggestions',
    };

    for (const [key, sourceName] of Object.entries(listMap)) {
      const arr = suggestionsData[1][key];
      if (Array.isArray(arr)) {
        for (const entry of arr) {
          if (!entry) continue;
          const srcBook = findMatchingBook(books, entry.source_book);
          const item: RecommendationItem = {
            source: sourceName,
            sourceBookId: srcBook?.id ?? null,
            sourceBookTitle: entry.source_book || '',
            recommendedTitle: entry.recommended_item || '',
            shelf: null,
            status: null,
            rank: typeof entry.rank === 'number' ? entry.rank : null,
            updatedAt: null,
          };

          if (srcBook) {
            srcBook.recommendations.push(item);
          }
          updatedRecommendations.push(item);
        }
      }
    }
  }

  // 7. Process remaining ancillary tables
  const updatedReadingGoals: ReadingGoal[] = [...existingBundle.readingGoals];
  const goalsData = await loadJsonFromZip(zip, 'kindle_reading_insights_goal_information');
  if (Array.isArray(goalsData)) {
    for (const g of goalsData) {
      if (!g || !g.goal_id) continue;
      const exists = updatedReadingGoals.some(ug => ug.goalId === g.goal_id);
      if (!exists) {
        updatedReadingGoals.push({
          goalId: g.goal_id,
          goalValue: parseInt(g.goal_value, 10) || 0,
          createDate: g.create_date,
          lastModifiedDate: g.last_modified_date,
          hasBeenCongratulated: g.has_been_congratulated === 'true',
        });
      }
    }
  }

  const updatedAchievements: AchievementBadge[] = [...existingBundle.achievements];
  const badgesData = await loadJsonFromZip(zip, 'kindle_book_rewards_achievements');
  if (Array.isArray(badgesData)) {
    for (const b of badgesData) {
      if (!b || !b.AchievementName) continue;
      const exists = updatedAchievements.some(
        ub => ub.achievementName === b.AchievementName && ub.earnDate === b.EarnDate
      );
      if (!exists) {
        updatedAchievements.push({
          groupName: b.AchievementGroupName || '',
          achievementName: b.AchievementName,
          earnDate: b.EarnDate,
          marketplace: b.Marketplace,
          quantity: parseInt(b.Quantity, 10) || 1,
        });
      }
    }
  }

  const updatedFollowedAuthors: FollowedAuthor[] = [...existingBundle.followedAuthors];
  const authorsData = await loadJsonFromZip(zip, 'author_following');
  if (Array.isArray(authorsData)) {
    const records = authorsData.slice(1);
    for (const a of records) {
      const name = a.author_followed || a.author || '';
      if (!name) continue;
      const exists = updatedFollowedAuthors.some(ua => ua.authorName === name);
      if (!exists) {
        updatedFollowedAuthors.push({
          authorName: name,
          createdAt: a.created_at !== '(not provided)' ? a.created_at : null,
          updatedAt: a.updated_at !== '(not provided)' ? a.updated_at : null,
        });
      }
    }
  }

  let updatedFavoriteGenres: FavoriteGenres | null = existingBundle.favoriteGenres;
  const genresData = await loadJsonFromZip(zip, 'favorite_genres');
  if (Array.isArray(genresData) && genresData[1]) {
    const gRecord = genresData[1];
    updatedFavoriteGenres = {
      genres: gRecord.genres
        ? gRecord.genres.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      additionalGenres: gRecord.additional_genres
        ? gRecord.additional_genres.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      automaticallyDetermined: gRecord.genres_automatically_determined === 'Yes',
      createdAt: gRecord.created_at !== '(not provided)' ? gRecord.created_at : null,
      updatedAt: gRecord.updated_at !== '(not provided)' ? gRecord.updated_at : null,
    };
  }

  const updatedSuggestedLists = [...existingBundle.suggestedLists];
  const listsData = await loadJsonFromZip(zip, 'suggested_list');
  if (Array.isArray(listsData)) {
    const records = listsData.slice(1);
    for (const l of records) {
      const listName = l.suggested_list_name || l.list_name || '';
      if (!listName) continue;
      const exists = updatedSuggestedLists.some(ul => ul.listName === listName);
      if (!exists) {
        updatedSuggestedLists.push({
          listName,
          status: l.status || '',
          createdAt: l.created_at !== '(not provided)' ? l.created_at : null,
          updatedAt: l.updated_at !== '(not provided)' ? l.updated_at : null,
        });
      }
    }
  }

  // 8. Recompute summaryStats with updated reconciliation counts
  const booksWithSessionsCount = books.filter(b => b.readingSessions.length > 0).length;
  const booksWithNotesCount = books.filter(b => b.kindleNotes.length > 0).length;

  const baseStats = calculateSummaryStats(books, existingBundle);

  const reconciliationCoverage: Record<string, number> = {
    csvTotalBooks: existingBundle.books.length,
    matchedShelvings,
    dsarTotalShelvings: totalShelvings,
    matchedReviews,
    dsarTotalReviews: totalReviews,
    booksWithReadingSessions: booksWithSessionsCount,
    attachedReadingSessions: attachedSessions,
    dsarTotalSessions: totalSessions,
    matchedKindleNotes: matchedNotes,
    dsarTotalNotes: totalNotes,
    booksWithKindleNotes: booksWithNotesCount,
    writtenReviewsInCsv: books.filter(b => Boolean(b.myReview)).length,
  };

  const enrichmentCounts: Record<string, number> = {
    quotes: updatedQuotes.length,
    recommendations: updatedRecommendations.length,
    followedAuthors: updatedFollowedAuthors.length,
    achievements: updatedAchievements.length,
    readingGoals: updatedReadingGoals.length,
    reviewDrafts: updatedReviewDrafts.length,
    suggestedLists: updatedSuggestedLists.length,
    userLoginEvents: existingBundle.summaryStats.enrichmentCounts?.userLoginEvents ?? 0,
  };

  return {
    ...existingBundle,
    generatedAt: new Date().toISOString(),
    books,
    quotes: updatedQuotes,
    kindleNotes: updatedKindleNotes,
    recommendations: updatedRecommendations,
    readingGoals: updatedReadingGoals,
    achievements: updatedAchievements,
    followedAuthors: updatedFollowedAuthors,
    favoriteGenres: updatedFavoriteGenres,
    reviewDrafts: updatedReviewDrafts,
    suggestedLists: updatedSuggestedLists,
    summaryStats: {
      ...baseStats,
      reconciliationCoverage,
      enrichmentCounts,
    },
  };
}
