export type ExclusiveShelf =
  | 'read'
  | 'to-read'
  | 'currently-reading'
  | 'did-not-finish'
  | string;

export type LanguageCode =
  | 'EN'
  | 'TR'
  | 'FR'
  | 'DE'
  | 'RU'
  | 'JA'
  | 'PL'
  | 'ZH'
  | 'IT'
  | 'ES'
  | 'PT'
  | 'GRC'
  | 'KY'
  | 'IS'
  | 'NO'
  | 'OTHER';

export type BookFormat = 'prose' | 'comic-manga' | 'short-essay' | 'academic-ref';

export type NightstandState = 'active' | 'on-hold';

export interface BookLanguageProfile {
  editionLanguage: LanguageCode; // Language the user read / shelved the edition in
  originalLanguage: LanguageCode; // Language the work was originally published in
  isTranslation: boolean;
  translationFlow: string; // e.g. 'FR · Original' or 'JA → EN'
  translators: string[];
  format: BookFormat;
}

export interface BookProgressLog {
  date: string;
  page: number;
}

export interface BookUserOverride {
  nightstandState?: NightstandState;
  currentPage?: number | null;
  targetFinishDate?: string | null;
  progressLogs?: BookProgressLog[];
  editionLanguageOverride?: LanguageCode | null;
  originalLanguageOverride?: LanguageCode | null;
  formatOverride?: BookFormat | null;
  localNotes?: string | null;
  moodTags?: string[];
}

export interface KindleClipping {
  id: string;
  rawTitle: string;
  cleanTitle: string;
  author: string | null;
  matchedBookId: string | null;
  type: 'highlight' | 'note' | 'bookmark';
  page: number | null;
  locationStart: number | null;
  locationEnd: number | null;
  addedAt: string | null;
  content: string;
  attachedNote?: string | null;
  chapter?: string | null;
  highlightColor?: 'yellow' | 'pink' | 'blue' | 'orange' | string | null;
  sourceFormat?: 'clippings-txt' | 'notebook-html';
}

export type ExternalDiscoveryEngine =
  | 'author-backlist'
  | 'subject-dna'
  | 'dsar-graph';

export interface ExternalDiscoveryPick {
  id: string;
  engine: ExternalDiscoveryEngine;
  title: string;
  author: string | null;
  yearPublished: number | null;
  pageCount: number | null;
  communityRating: number | null;
  ratingsCount: number | null;
  editionCount?: number | null;
  subjects: string[];
  synopsis: string | null;
  coverUrl: string | null;
  isbn?: string | null;
  openLibraryKey?: string | null;
  isSequel?: boolean;
  seriesHint?: string | null;
  anchorBookId?: string | null;
  anchorBookTitle?: string | null;
  anchorRating?: number | null;
  anchorShelf?: ExclusiveShelf | null;
  provenance: string;
  reasons: string[];
  score: number;
}

export interface ExternalWantListItem {
  id: string;
  title: string;
  author: string | null;
  engine: ExternalDiscoveryEngine;
  provenance: string;
  addedAt: string;
  yearPublished?: number | null;
  coverUrl?: string | null;
}

export interface BookplateConfig {
  ownerName: string;
  motto: string;
  fleuron: 'aldine' | 'compass' | 'owl' | 'quill';
  borderStyle: 'venetian' | 'modernist' | 'guild';
}

export interface VaultBookReview {
  bookId: string;
  bookTitle: string;
  vaultFilePath: string;
  wordsCount: number;
  content: string;
  obsidianUri: string;
}

export interface WritingProjectStat {
  name: string;
  words: number;
  filesCount: number;
  activeDaysCount: number;
}

export interface DraftedFileRecord {
  filePath: string;
  fileName: string;
  folder: string;
  words: number;
}

export interface WritingTelemetryData {
  version: string;
  updatedAt: string;
  source: string;
  totalWords: number;
  totalChars: number;
  dailyGoal: number;
  completedGoalDaysCount: number;
  completedGoalDates: string[];
  activeDaysCount: number;
  dailyTotals: Record<string, number>;
  hourlyTotals: number[];
  projects: WritingProjectStat[];
  matchedReviews: Record<string, VaultBookReview>;
  dailyFiles?: Record<string, DraftedFileRecord[]>;
}

export interface LetterboxdFilmWatch {
  id: string;
  name: string;
  year: number;
  uri: string;
  rating: number | null; // 0.5 to 5.0
  rewatch: boolean;
  date: string; // YYYY-MM-DD (Watched Date or Date)
  review?: string | null;
  tags?: string[];
  source: 'diary' | 'review' | 'watched';
}

export interface LetterboxdWatchlistItem {
  name: string;
  year: number;
  uri: string;
  dateAdded: string; // YYYY-MM-DD
}

export interface LetterboxdArchiveData {
  version: string;
  updatedAt: string;
  totalWatchedCount: number;
  totalDiaryCount: number;
  totalReviewsCount: number;
  totalWatchlistCount: number;
  watches: LetterboxdFilmWatch[];
  ratingsMap: Record<string, number>;
  reviewsMap: Record<string, string>;
  watchlist: LetterboxdWatchlistItem[];
}

export interface AdaptationLink {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookShelf: string;
  bookCoverUrl?: string | null;
  bookRating?: number | null;
  filmTitle: string;
  filmYear: number;
  filmUri: string;
  filmRating: number | null;
  filmRewatch: boolean;
  filmReview?: string | null;
  relation: 'watched' | 'watchlist';
  direction: 'codex-to-screen' | 'screen-to-codex';
  matchType: 'direct' | 'alias';
  rationale: string;
}

export interface AdaptationBridgeMetrics {
  totalBridgesCount: number;
  watchedAdaptationsCount: number;
  watchlistAdaptationsCount: number;
  queuedOnWatchlist: AdaptationLink[];
  fromScreenToNightstand: AdaptationLink[];
  allBridges: AdaptationLink[];
}

export interface AdaptationDivergenceItem {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookRating: number | null;
  bookCoverUrl?: string | null;
  filmTitle: string;
  filmYear: number;
  filmRating: number | null;
  filmUri: string;
  filmReview?: string | null;
  delta: number | null; // bookRating - filmRating
  verdict: 'favors-book' | 'favors-film' | 'parity' | 'unrated';
}

export interface NarrativeDietMonth {
  yearMonth: string; // "2025-07"
  label: string; // "Jul '25"
  year: number;
  month: number;
  pagesRead: number;
  booksRead: number;
  filmsWatched: number;
  isCinemaSurge: boolean; // e.g. filmsWatched >= 3 && pagesRead < 350
}

export interface AdaptationForensicsMetrics {
  divergenceItems: AdaptationDivergenceItem[];
  averageDelta: number | null; // e.g. +0.25
  ratedPairsCount: number;
  favorsBookCount: number;
  favorsFilmCount: number;
  parityCount: number;
  dietTimeline: NarrativeDietMonth[];
  maxMonthlyPages: number;
  maxMonthlyFilms: number;
  totalDietPages: number;
  totalDietFilms: number;
}

export interface UserLocalState {
  version: string;
  updatedAt: string;
  showCovers: boolean;
  bookOverrides: Record<string, BookUserOverride>;
  kindleClippings: KindleClipping[];
  externalWantList?: ExternalWantListItem[];
  bookplateConfig?: BookplateConfig;
  writingTelemetry?: WritingTelemetryData;
  letterboxdData?: LetterboxdArchiveData;
}

export interface EnrichedBookMetadata {
  bookId: string;
  fetchedAt: string;
  source: 'openlibrary' | 'googlebooks' | 'hybrid' | 'none';
  synopsis: string | null;
  communityRating: number | null;
  ratingsCount: number | null;
  subjects: string[];
  coverUrl: string | null;
  detectedOriginalLanguage?: LanguageCode | null;
}

export type EnrichmentCacheMap = Record<string, EnrichedBookMetadata>;

export interface ReadingSession {
  startedAt: string | null;
  endedAt: string | null;
  state: 'COMPLETED' | 'READING' | string;
  durationDays: number | null;
}

export interface BookKindleNote {
  activity: string;
  product: string;
  noteText: string;
  noteActivityType?: string;
  createdAt: string;
}

export interface KindleNote extends BookKindleNote {
  bookId: string | null;
  bookTitle: string;
  user?: string;
}

export interface ShelvingRecord {
  readStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastRevisionAt?: string | null;
  notes?: string | null;
}

export interface ReviewDetails {
  rating: number | null;
  ratingCreatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastRevisionAt?: string | null;
  hasText: boolean;
  reviewTextLanguage: string | null;
  includesSpoilers: boolean;
}

export interface RecommendationItem {
  source: string;
  sourceBookId: string | null;
  sourceBookTitle: string;
  recommendedTitle: string;
  shelf: string | null;
  status: string | null;
  rank: number | null;
  updatedAt: string | null;
}

export interface Book {
  id: string;
  title: string;
  cleanTitle: string;
  seriesName: string | null;
  seriesNumber: string | null;
  author: string;
  authorSort: string | null;
  additionalAuthors: string[];
  isbn: string | null;
  isbn13: string | null;
  myRating: number | null;
  averageRating: number | null;
  publisher: string | null;
  binding: string | null;
  pageCount: number | null;
  yearPublished: number | null;
  originalPublicationYear: number | null;
  dateRead: string | null;
  dateAdded: string | null;
  exclusiveShelf: ExclusiveShelf;
  bookshelves: string[];
  bookshelvesWithPositions: string | null;
  readCount: number;
  ownedCopies: number;
  myReview: string | null;
  spoiler: boolean;
  privateNotes: string | null;
  shelving: ShelvingRecord | null;
  reviewDetails: ReviewDetails | null;
  readingSessions: ReadingSession[];
  kindleNotes: BookKindleNote[];
  recommendations: RecommendationItem[];
}

export interface LikedQuote {
  quote: string;
  liked: boolean;
  origin: string | null;
  quotePosition: number | null;
  createdAt: string | null;
  updatedAt?: string | null;
  user?: string;
}

export interface ReadingGoal {
  goalId: string;
  goalValue: number;
  createDate: string;
  lastModifiedDate?: string;
  hasBeenCongratulated?: boolean;
}

export interface AchievementBadge {
  groupName: string;
  achievementName: string;
  earnDate: string;
  marketplace?: string;
  quantity: number;
}

export interface FollowedAuthor {
  authorName: string;
  createdAt: string | null;
  updatedAt?: string | null;
}

export interface FavoriteGenres {
  genres: string[];
  additionalGenres: string[];
  automaticallyDetermined?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ReviewDraft {
  bookId: string | null;
  bookTitle: string;
  review: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  user?: string;
}

export interface HourlyActivityBucket {
  hour: number;
  count: number;
}

export interface ActivityByHour {
  totalLoginEvents: number;
  peakHour: number;
  quietestHour: number;
  platformBreakdown: Record<string, number>;
  hourlyDistribution: HourlyActivityBucket[];
}

export interface SuggestedList {
  listName: string;
  status: string;
  createdAt: string | null;
  updatedAt?: string | null;
}

export interface SummaryStats {
  totalBooks: number;
  distinctAuthors: number;
  booksWithSeries: number;
  shelves: {
    read: number;
    toRead: number;
    currentlyReading: number;
    didNotFinish: number;
  };
  ratings: {
    ratedCount: number;
    unratedCount: number;
    averageRating: number | null;
    distribution: Record<string, number>;
  };
  pages: {
    totalPagesRead: number;
    totalLibraryPages: number;
    booksWithPagesCount: number;
    booksWithoutPagesCount: number;
  };
  reconciliationCoverage?: Record<string, number>;
  enrichmentCounts?: Record<string, number>;
}

export interface LibraryBundle {
  schemaVersion: string;
  generatedAt: string;
  summaryStats: SummaryStats;
  books: Book[];
  quotes: LikedQuote[];
  kindleNotes: KindleNote[];
  recommendations: RecommendationItem[];
  readingGoals: ReadingGoal[];
  achievements: AchievementBadge[];
  followedAuthors: FollowedAuthor[];
  favoriteGenres: FavoriteGenres | null;
  reviewDrafts: ReviewDraft[];
  activityByHour: ActivityByHour | null;
  suggestedLists: SuggestedList[];
}

// ==========================================
// SPRINT MANDATE #4: THE WORLD SHELF, PREDICTIVE TARGETS & ANNUAL REVIEWS
// ==========================================

export interface WorldShelfHub {
  id: string; // e.g. 'anatolian', 'continental-europe', 'east-asian', 'anglo-american', 'antiquity-nordic'
  name: string;
  subtitle: string;
  languages: LanguageCode[];
  volumeCount: number;
  totalPages: number;
  averageRating: number | null;
  signatureWorks: Array<{
    id: string;
    title: string;
    author: string;
    myRating?: number | null;
    coverUrl?: string | null;
  }>;
  translationFlows: Array<{ flow: string; count: number }>;
}

export interface WorldShelfMetrics {
  hubs: WorldShelfHub[];
  totalVolumes: number;
  totalHubsWithBooks: number;
  topHub: WorldShelfHub | null;
}

export interface PredictiveTargetMetrics {
  targetYear: number;
  goalTarget: number;
  completedCount: number;
  percentComplete: number;
  recentCadence30Days: {
    booksRead: number;
    pagesRead: number;
    pagesPerDay: number;
  };
  recentCadence90Days: {
    booksRead: number;
    pagesRead: number;
    pagesPerDay: number;
  };
  projectedYearEndFinish: number;
  projectedTargetAchievedDate: string | null; // e.g. "October 14, 2026"
  isAheadOfPace: boolean;
  paceDeltaBooks: number; // e.g. +3.2 or -1.5
  requiredPacePerMonth: number;
  requiredPacePagesPerDay: number;
  sprintSuggestions: Array<{
    id: string;
    title: string;
    author: string;
    pageCount: number;
    oracleScore: number;
    coverUrl?: string | null;
  }>;
}

export interface AnnualReadingReview {
  year: number; // e.g. 2024, 2025, 2026
  volumesRead: number;
  pagesRead: number;
  averageRating: number | null;
  medianDaysPerBook: number | null;
  canon5StarBooks: Array<{
    id: string;
    title: string;
    author: string;
    myRating: number;
    coverUrl?: string | null;
  }>;
  fastestSprintBook: {
    id: string;
    title: string;
    author: string;
    pageCount: number;
  } | null;
  deepestSavorBook: {
    id: string;
    title: string;
    author: string;
    pageCount: number;
  } | null;
  narrativeDiet: {
    booksRead: number;
    filmsWatched: number;
    pagesRead: number;
  };
}
