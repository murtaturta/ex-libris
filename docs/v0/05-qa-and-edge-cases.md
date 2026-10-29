# v0 QA, Edge-Case Matrix & Verification Notes

**Owner:** `qa-verifier` (Data Integrity & UX Quality Reviewer)  
**Target Scope:** v0 Local-First Goodreads Ingestion, Canonical Store Merge, and Reading Intelligence Analytics

---

## 1. Real-World Goodreads CSV Edge-Case Matrix

Goodreads library exports (`goodreads_library_export.csv`) contain legacy formatting quirks, Excel-specific formula wrappers, and sparse historical metadata. The v0 parser and analytics engine must enforce strict normalization rules so malformed or missing fields never crash ingestion or skew statistical outputs.

### 1.1 Edge-Case Normalization & Invariant Matrix

| Category | Raw CSV Input Pattern | Failure Mode if Unhandled | v0 Parser & Analytics Invariant |
| :--- | :--- | :--- | :--- |
| **Excel-Escaped ISBNs** | `="0140283293"`<br>`="9780140283297"`<br>`="043902348X"`<br>`=""` or empty | Literal `="` characters stored in DB; OpenLibrary / Google Books cover lookups fail with 400/404; empty `""` treated as duplicate ISBN key. | Strip leading `="` and trailing `"` via `/^="?([^"]*)"?$/`. Validate checksum/length (10 or 13 chars, allowing trailing `X`/`x` for ISBN-10). Normalize empty `=""` or whitespace-only strings to `null` (never `""`—preventing unique-index collisions). |
| **Unrated Books (`My Rating = 0`)** | `My Rating` is `0` for all `to-read`, `currently-reading`, and unrated `read` books | Personal average rating collapses toward `0.0` (e.g., 50 TBR books at `0` + 50 read books at `4.0` yields `2.0` average); Contrarian Index (`my_rating - average_rating`) flags unrated books as `-4.1` "hated" books. | Map `My Rating === "0"` or `0` to `my_rating: null`. **Strict Invariant:** Only books where `my_rating !== null && my_rating >= 1 && my_rating <= 5` may enter personal rating averages, rating distribution histograms, or Contrarian Index calculations. |
| **Historical Reads Missing `Date Read`** | `Exclusive Shelf = "read"`, `Date Read = ""`, `Date Added = "2014/05/12"` | Parser drops the book from `read` counts, defaults `Date Read` to `1970-01-01` (spiking 1970 chart bars), or silently copies `Date Added` (creating fake reading velocity spikes on account creation day). | Keep `exclusive_shelf = "read"` and `date_read = null`. Include the book in lifetime **Total Books Read**, **Total Pages Read**, and **Literary DNA (Genre/Era/Rating)** aggregates. Exclude from **Monthly/Annual Pace & Velocity** charts, surfacing a clear badge: *"N historical reads without completion dates excluded from timeline."* |
| **Multi-Line Reviews & HTML/Spoiler Tags** | Embedded `\r\n` newlines, escaped quotes `""`, commas, `<br/>`, `<br>`, `<i>`, `<b>`, `<a href="...">`, and `<spoiler>...</spoiler>` | Naive `.split("\n")` or regex CSV splitters break row alignment; raw HTML injection causes XSS or layout breakage; `<spoiler>` text is exposed in plain sight on summary cards. | Parse with a strict RFC 4180 state-machine CSV parser (`papaparse` or equivalent). Sanitize HTML to an allowlist (`br`, `i`, `em`, `b`, `strong`, `p`, `blockquote`) and convert `<spoiler>...</spoiler>` into interactive blurred spoiler nodes (`<span data-spoiler="true">`). |
| **Re-Reads (`Read Count > 1`)** | `Read Count = 3`, single `Date Read = "2024/11/02"` | Total books/pages read ignores re-reads (`Read Count` ignored) or creates 3 identical reading logs on `2024/11/02`. | Store `read_count: 3` on the book record. Create 1 dated `ReadingLog` for `2024-11-02` (marked `cycle: 3`) and synthesize `read_count - 1` undated historical cycle records (unless local dated session logs already exist for those earlier reads). |
| **Custom Exclusive Shelves** | `Exclusive Shelf` is `dnf`, `abandoned`, `reference`, `paused`, or `owned-unopened` | Strict enum validation (`read \| currently-reading \| to-read`) throws a fatal parse error and aborts import. | Normalize canonical status into known buckets (`read`, `currently-reading`, `to-read`, `did-not-finish`, `reference`, `custom`) while preserving the exact raw `exclusive_shelf` slug. Exclude `dnf`/`abandoned` from completed book counts unless explicitly toggled. |
| **Missing Page Counts** | `Number of Pages` is `""`, `0`, or negative | `NaN` propagates into Total Pages Read; TBR Concierge filter *"Under 250 pages"* falsely matches `0`-page books (`0 < 250`). | Parse `""` or `<= 0` as `page_count: null`. Exclude `null` page counts from page-length filters unless the user toggles *"Include unknown length"*, and impute or exclude cleanly in page totals. |
| **Publication Years & Classical BCE Dates** | `Original Publication Year = "-380"` (Plato's *Republic*), `"-750"` (Homer), `""`, or `"0"` | Unsigned integer regex `/^\d{4}$/` rejects negative BCE years; `0` or `""` plots books at Year 0 on the Publication Era timeline. | Parse signed integers (`-3000` to `2100`). Format negative years as `380 BCE` in UI labels and sort mathematically (`-380 < 1984`). Map `""` or `0` to `original_publication_year: null` and fall back to `Year Published` only when valid. |
| **Author & Series Formatting Quirks** | `Title = "Dune (Dune Chronicles, #1)"`, `Author = "Frank   Herbert"`, `Additional Authors = "Brian Herbert, Kevin J. Anderson"` | Duplicate author buckets due to extra internal whitespace; inability to group series or match clean titles against OpenLibrary. | Collapse internal whitespace (`/\s+/g -> " "`). Extract series name and position (`series_name: "Dune Chronicles"`, `series_index: 1`) into structured fields while preserving `raw_title` and clean `title` (`"Dune"`). |

---

### 1.2 Canonical Synthetic CSV Fixture (`fixtures/goodreads_edge_cases.csv`)

Every v0 build must pass ingestion against this exact 8-row torture fixture covering all edge cases above:

```csv
Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies
1001,"The Republic",Plato,"Plato, ",,="0140449140",="9780140449143",5,3.96,Penguin Classics,Paperback,416,2003,-380,2023/08/14,2023/01/10,"philosophy, classics","philosophy (#1), classics (#2)",read,"A foundational dialogue.<br/><br/><i>""Justice in the soul mirrors justice in the city.""</i><br/><spoiler>The Myth of Er concludes Book X.</spoiler>",true,"Read alongside academic commentary.",2,1
1002,"Ficciones (Collected Fictions, #1)",Jorge Luis Borges,"Borges, Jorge Luis",Andrew Hurley,="",="",0,4.45,Grove Press,Paperback,174,1999,1944,,2016/03/22,"short-stories, magical-realism","short-stories (#1), magical-realism (#2)",read,"Read years ago before I tracked dates, and forgot to rate it.",,"Need to re-read ""Tlön, Uqbar, Orbis Tertius"".",1,1
1003,"The Hunger Games (The Hunger Games, #1)",Suzanne   Collins,"Collins, Suzanne",,="043902348X",="9780439023481",3,4.34,Scholastic Press,Hardcover,374,2008,2008,2012/05/01,2012/04/28,sci-fi,sci-fi (#1),read,"Fast-paced, multiline review
with an embedded newline, ""quoted phrase"", and commas, inside RFC 4180 quotes.",,,1,0
1004,"Infinite Jest",David Foster Wallace,"Wallace, David Foster",,="0316066524",="9780316066525",0,4.26,Back Bay Books,Paperback,1079,2006,1996,,2021/11/04,"dnf, heavy-tomes","dnf (#1), heavy-tomes (#2)",dnf,"Stopped at page 310. Might return next winter.",,"Bookmark left at Eschaton chapter.",0,1
1005,"Untitled Indie Zine",Unknown Author,"Author, Unknown",,="",="",0,0.00,Self-Published,Zine,,0,,2025/01/15,to-read,to-read (#1),to-read,,,,0,0
```

**Expected Post-Ingestion Fixture Assertions:**
- **Row `1001` (*The Republic*):** `isbn10 = "0140449140"`, `isbn13 = "9780140449143"`, `original_publication_year = -380`, `my_rating = 5`, `read_count = 2`, spoiler block extracted cleanly.
- **Row `1002` (*Ficciones*):** `isbn10 = null`, `isbn13 = null`, `my_rating = null` (excluded from rating average), `exclusive_shelf = "read"`, `date_read = null` (included in lifetime read count, excluded from monthly pace chart).
- **Row `1003` (*The Hunger Games*):** `isbn10 = "043902348X"` (trailing `X` preserved), `author = "Suzanne Collins"` (whitespace collapsed), `series_name = "The Hunger Games"`, `series_index = 1`, multiline review preserved intact as a single record.
- **Row `1004` (*Infinite Jest*):** `exclusive_shelf = "dnf"` (mapped to `did-not-finish` status, not throwing an enum error, and excluded from completed `read` book totals).
- **Row `1005` (*Untitled Indie Zine*):** `page_count = null`, `original_publication_year = null`, `year_published = null`, excluded from *"Under 250 pages"* TBR Concierge filter.
- **Fixture Personal Rating Average:** Only rows `1001` (`5`) and `1003` (`3`) are rated $\rightarrow$ **Mean = `4.00`** (never `(5 + 0 + 3 + 0 + 0) / 5 = 1.60`).

---

## 2. Idempotency & Non-Destructive Re-Import Invariants

Per **Core Architectural Principle #2**, users periodically export a fresh `goodreads_library_export.csv` and drop it into the app. Re-importing must be **100% idempotent** (importing the same file $N$ times produces zero state drift) and **non-destructive** (local enrichments created inside the app are never wiped out).

### 2.1 Field-Level Merge Contract (`goodreads_book_id` Primary Match Key)

| Data Domain / Field | CSV Source Column | Local Store Authority | Merge Strategy on Re-Import |
| :--- | :--- | :--- | :--- |
| **External Identity** (`goodreads_book_id`) | `Book Id` | Primary upsert key | Match existing canonical `Book` via `external_ids.goodreads_book_id`. Never create duplicate book rows. |
| **Core Bibliographic Metadata** (`title`, `author`, `isbn10`, `isbn13`) | `Title`, `Author`, `ISBN`, `ISBN13` | CSV-updated unless locally locked | Update from CSV **unless** `local_overrides.metadata_locked === true` (e.g., user manually fixed a typo or edition). |
| **Page Count & Pub Year** (`page_count`, `original_publication_year`) | `Number of Pages`, `Original Publication Year` | Prefer non-null local override | If `local_overrides.page_count` is set, preserve it; otherwise update from CSV if CSV value is non-null. |
| **Shelf Status** (`exclusive_shelf`) | `Exclusive Shelf` | Latest state wins (with transition check) | Update `exclusive_shelf` from CSV. If transitioning `currently-reading` $\rightarrow$ `read` via CSV, close any open local reading session cleanly without deleting session history. |
| **Tags & Shelves** (`bookshelves` vs `custom_mood_tags`) | `Bookshelves` | **Set Union (Non-Destructive)** | Sync `source_shelves` from CSV `Bookshelves`, while **strictly preserving** all `local_mood_tags` (e.g., `rainy-weekend`, `comfort-read`, `dense`) added in the app. |
| **Personal Rating** (`my_rating`) | `My Rating` | Conditional update | If CSV `My Rating > 0`, update `my_rating` (unless `local_overrides.rating_locked` is true). If CSV `My Rating === 0` **and** the user previously rated the book locally in the app, **preserve the local rating** instead of wiping it to `null`. |
| **Community Rating** (`average_rating`) | `Average Rating` | CSV always refreshes | Always update `community_average_rating` from the latest CSV export so Contrarian Index deltas stay fresh. |
| **Reviews & Private Notes** (`my_review`, `private_notes`) | `My Review`, `Private Notes` | Upstream sync + Local preservation | Update `goodreads_review` and `goodreads_private_notes` fields if changed in CSV, while **never modifying or deleting** local `annotations[]` (quotes, marginalia, page notes, reflection responses). |
| **Reading Logs & Sessions** (`reading_sessions[]`) | `Date Read`, `Date Added`, `Read Count` | Append / Reconcile by date | Match CSV `Date Read` against existing `ReadingLog` entries. If already recorded, no-op. If CSV has a new `Date Read` not in local logs, append a new completion cycle while preserving all granular local reading session logs and page checkpoints. |
| **Cover Artwork** (`cover_url`, `pinned_cover_url`) | *(Enriched via API / Local)* | **Strictly Local** | Never overwrite `pinned_cover_url` or cached OpenLibrary/Google Books cover assets during CSV re-import. |

### 2.2 Formal Idempotency Invariants

Let $S_0$ be an existing database state containing local annotations, custom mood tags, reading sessions, and a pinned cover. Let $I(S, C)$ be the state after importing CSV file $C$.

1. **Pure Idempotency Invariant:**
   $$I(I(S_0, C), C) \equiv I(S_0, C)$$
   Running the import twice on the same CSV must result in **zero** new rows in `books`, `reading_logs`, `shelves`, or `annotations`, and identical computed analytics snapshots.
2. **Local Enrichment Preservation Invariant:**
   $$\forall b \in S_0: \quad b_{\text{after}}.\text{annotations} = b_{\text{before}}.\text{annotations} \quad \land \quad b_{\text{after}}.\text{local\_mood\_tags} \supseteq b_{\text{before}}.\text{local\_mood\_tags}$$
   No CSV import path may execute `DELETE` or destructive `REPLACE` on `annotations`, `reading_sessions`, `local_mood_tags`, or `pinned_cover_url`.

---

## 3. Automated Test Suite Plan for v0 (`vitest`)

The v0 verification suite uses **Vitest** for fast, deterministic unit and integration testing across the data pipeline and analytics engine.

### 3.1 Test Suite Architecture

| Test File | Scope & Responsibilities |
| :--- | :--- |
| `tests/unit/csv-sanitizer.spec.ts` | Tests Excel `=".."` unwrapping, ISBN-10/13 validation (including trailing `X`), `My Rating = 0 -> null`, negative BCE year parsing (`-380`), series extraction from titles, and HTML/spoiler tag sanitization. |
| `tests/unit/csv-parser.spec.ts` | Runs full ingestion against `fixtures/goodreads_edge_cases.csv`. Verifies multiline quoted reviews, empty `Date Read` on `read` shelf, and custom exclusive shelves (`dnf`, `reference`). |
| `tests/integration/idempotent-merge.spec.ts` | Verifies that seeding local `annotations`, `local_mood_tags`, `reading_sessions`, and `pinned_cover_url`, then re-importing an updated CSV twice, updates upstream fields while leaving local enrichments 100% intact. |
| `tests/unit/analytics-dna.spec.ts` | Verifies **Literary DNA** math: ensures `My Rating = 0` (`null`) never enters personal mean rating or Contrarian Index (`my_rating - community_rating`), verifies undated reads are counted in lifetime totals but excluded from monthly pace velocity, and checks BCE publication era binning. |
| `tests/unit/tbr-concierge.spec.ts` | Verifies **TBR Concierge** filtering: ensures books with `page_count: null` do not falsely match `< 250 pages` filters, and verifies mood/length/rating scoring. |

### 3.2 Reference Vitest Specification (`tests/unit/analytics-and-merge.spec.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { parseGoodreadsCsv } from '../../src/lib/parser/goodreadsCsv';
import { computeLiteraryDna } from '../../src/lib/analytics/literaryDna';
import { mergeGoodreadsImport } from '../../src/lib/store/mergeImport';
import fs from 'node:fs';
import path from 'node:path';

const fixtureCsv = fs.readFileSync(
  path.resolve(__dirname, '../fixtures/goodreads_edge_cases.csv'),
  'utf-8'
);

describe('Goodreads CSV Edge-Case Parser & Analytics Invariants', () => {
  it('sanitizes Excel-escaped ISBNs and maps empty ="" to null', () => {
    const rows = parseGoodreadsCsv(fixtureCsv);
    const republic = rows.find((r) => r.goodreadsBookId === '1001')!;
    const ficciones = rows.find((r) => r.goodreadsBookId === '1002')!;
    const hungerGames = rows.find((r) => r.goodreadsBookId === '1003')!;

    expect(republic.isbn10).toBe('0140449140');
    expect(republic.isbn13).toBe('9780140449143');
    expect(ficciones.isbn10).toBeNull();
    expect(ficciones.isbn13).toBeNull();
    expect(hungerGames.isbn10).toBe('043902348X');
  });

  it('strictly excludes My Rating = 0 (null) from personal rating averages and Contrarian Index', () => {
    const books = parseGoodreadsCsv(fixtureCsv);
    const dna = computeLiteraryDna(books);

    // Only Book 1001 (5 stars) and Book 1003 (3 stars) are rated -> average must be 4.0
    expect(dna.ratedBookCount).toBe(2);
    expect(dna.averagePersonalRating).toBeCloseTo(4.0, 5);

    // Unrated books (1002, 1004, 1005) must never appear in Contrarian Index deltas
    const contrarianIds = dna.contrarianItems.map((item) => item.goodreadsBookId);
    expect(contrarianIds).toEqual(expect.arrayContaining(['1001', '1003']));
    expect(contrarianIds).not.toContain('1002');
    expect(contrarianIds).not.toContain('1004');
  });

  it('handles negative BCE publication years and undated historical reads accurately', () => {
    const books = parseGoodreadsCsv(fixtureCsv);
    const republic = books.find((b) => b.goodreadsBookId === '1001')!;
    const ficciones = books.find((b) => b.goodreadsBookId === '1002')!;
    const dna = computeLiteraryDna(books);

    expect(republic.originalPublicationYear).toBe(-380);
    expect(ficciones.exclusiveShelf).toBe('read');
    expect(ficciones.dateRead).toBeNull();

    // Total read count includes 1001, 1002, 1003 (3 unique books read), excluding 1004 (dnf) and 1005 (to-read)
    expect(dna.totalUniqueBooksRead).toBe(3);
    // Dated pace timeline only includes books with non-null dateRead (1001, 1003)
    expect(dna.datedReadCount).toBe(2);
    expect(dna.undatedReadCount).toBe(1);
  });

  it('preserves local annotations, mood tags, and pinned covers across idempotent CSV re-imports', () => {
    const initialBooks = parseGoodreadsCsv(fixtureCsv);
    let store = mergeGoodreadsImport(
      { books: {}, annotations: {}, sessions: {} },
      initialBooks
    );

    // Simulate local user enrichments on Book 1001
    store.books['1001'].localMoodTags = ['classical-seminar', 'slow-read'];
    store.books['1001'].pinnedCoverUrl = '/local-covers/republic-custom.jpg';
    store.annotations['1001'] = [
      { id: 'ann-1', page: 210, quote: 'The cave allegory', note: 'Key turning point' }
    ];

    // Re-import the exact same CSV twice
    const afterFirstReimport = mergeGoodreadsImport(store, initialBooks);
    const afterSecondReimport = mergeGoodreadsImport(afterFirstReimport, initialBooks);

    expect(Object.keys(afterSecondReimport.books)).toHaveLength(5);
    expect(afterSecondReimport.books['1001'].localMoodTags).toEqual([
      'classical-seminar',
      'slow-read'
    ]);
    expect(afterSecondReimport.books['1001'].pinnedCoverUrl).toBe(
      '/local-covers/republic-custom.jpg'
    );
    expect(afterSecondReimport.annotations['1001']).toHaveLength(1);
    expect(afterSecondReimport).toEqual(afterFirstReimport);
  });
});
```

---

## 4. Build, Type & UI Verification Checklist (v0 Gate)

Before marking any v0 milestone complete, `qa-verifier` executes the following verification gates:

1. **Zero TypeScript Diagnostics (`tsc --noEmit`):** Strict mode enabled (`strictNullChecks: true`), ensuring `my_rating: number | null`, `page_count: number | null`, and `date_read: string | null` are explicitly handled across every UI component and chart.
2. **Unit & Integration Test Gate (`vitest run`):** 100% pass rate on `csv-sanitizer`, `csv-parser`, `idempotent-merge`, `analytics-dna`, and `tbr-concierge` suites.
3. **Real Export Smoke Test:** Ingest the workspace's real `goodreads_library_export.csv` (if present) alongside `fixtures/goodreads_edge_cases.csv` and verify:
   - Zero console errors or unhandled promise rejections.
   - Cover fallbacks render clean typographic spines/cards when ISBN is `null` or OpenLibrary returns 404.
   - Spoiler blocks (`<spoiler>`) in Book Dossier drawers remain blurred until clicked.
   - Re-uploading the same CSV shows `"0 new books, N updated, 0 local notes lost"` in the import summary toast.
