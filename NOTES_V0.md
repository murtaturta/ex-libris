# Reading Experience Platform — Master v0.1 Alpha Blueprint (Locked via `/grill-me`)

> **Goal:** Transform your personal Goodreads data—combining your **Goodreads DSAR Archive (`Goodreads.zip`)** and your **Classic Library Export (`goodreads_library_export.csv`)**—into a fast, tactile, text-first local web application.

---

## 1. Locked Alpha (`v0.1`) Decisions

| Dimension | Locked Decision for `v0.1` Alpha |
| :--- | :--- |
| **Data Ingestion** | **Hybrid Dual-Source Engine**: Combines `Goodreads.zip` (DSAR JSON tables) + `goodreads_library_export.csv` (24-column library export), reconciled deterministically by normalized title + series. |
| **Alpha Mode** | **Read-Only Explorer & Recommender**: Zero-friction exploration, filtering, analytics, and recommendations from your Goodreads exports. Local editing/annotation persistence is deferred to `v0.2`. |
| **External APIs / Media** | **Strictly Offline & Text-Only**: No external cover image or metadata API calls in the alpha. All visual craft comes from typography, procedural index cards, and data-driven book spines. |
| **Aesthetic & Theme** | **"Warm Literary Modernism"** in dual themes (**Parchment Light Mode** & **Library Lamp Dark Mode**), pairing editorial serif titles, humanist sans controls, and `tabular-nums` monospace stats. |
| **Core Experience Scope** | **Balanced Trio**: (1) Tri-Mode Library (*Typographic Index Cards*, *Page-Proportional Spine Shelf*, *Archival Data Table*), (2) *The Oracle* (TBR Concierge), and (3) *The Observatory* (Literary DNA Analytics) + *Book Dossier Drawer*. |
| **Agent Model Policy** | Token-efficient model routing enforced via [AGENTS.md](./AGENTS.md): `flash_lite` / `flash` as default workhorses; `pro` reserved strictly for complex custom visualizations or merge logic. |

---

## 2. How `Goodreads.zip` + `goodreads_library_export.csv` Complement Each Other

Auditing your `Goodreads.zip` revealed 48 nested archives containing behavioral data that the CSV lacks, while the CSV provides the bibliographic identifiers and edition metrics that Amazon omitted from the DSAR JSONs:

| Data Domain | From `goodreads_library_export.csv` | From `Goodreads.zip` (DSAR JSONs) |
| :--- | :--- | :--- |
| **Identifiers** | `Book Id`, `ISBN`, `ISBN13` | Title + Series string (`shelvings.json`) + 235 `/book/show/<id>` slugs (`request_logs`) |
| **Bibliographic** | `Author`, `Additional Authors`, `Publisher`, `Binding`, `Number of Pages`, `Year Published`, `Original Publication Year` | `author_following.json` (10 followed authors), `favorite_genres.json` |
| **Shelves & Status** | `Exclusive Shelf` (`read`, `currently-reading`, `to-read`), custom `Bookshelves` | `shelvings.json` (298 unique books: `169 to-read`, `113 read`, `9 currently-reading`, **`8 did-not-finish`**) |
| **Reading Timeline** | Single `Date Read`, `Date Added`, `Read Count` | `reading_sessions.json` (**144 sessions** with exact `started_at` & `ended_at` timestamps + multi-read logs) |
| **Ratings & Reviews** | `My Rating` (`1–5`), `Average Rating` (community), `My Review` | `reviews.json` (**87 reviews + 2 drafts**, `rating_created_at`, `includes_spoilers`) |
| **Notes & Quotes** | `Private Notes` | `notes.json` (**14 live Kindle progress status notes**) + `user_quote.json` (**16 liked quotes**) |
| **Recommendations** | *(None)* | `related_work_recommendation.json` (**69 "Because you read" links**), `suggestions.json` (**64 ranked suggestions**), `suggested_list.json` (**7 lists**) |
| **Goals & Achievements**| *(None)* | `kindle_reading_insights_goal_information.json` (**6 yearly goals, 2023–2026**) + `kindle_book_rewards_achievements.json` (**12 challenge badges**) |

---

## 3. Core Alpha Views & Features

### 01 / The Library (Tri-Mode Shelf Explorer)
- **Typographic Index Cards**: Archival library cards displaying title, series badge, author, publication year, page count, star rating vs. community average, and session count.
- **Page-Proportional Spine Shelf**: Physical shelf view where each book's spine width scales with `Number of Pages` (from CSV) and spine color/embossing reflects shelf status, star rating, and reading duration.
- **Archival Data Table**: High-density sortable ledger with multi-faceted filter pills and `Cmd/Ctrl+K` quick search.
- **Book Dossier Drawer**: Slide-over detail sheet uniting edition colophon (`ISBN13`, `Book Id`, `Original Publication Year`), all chronological `reading_sessions` (`started_at -> ended_at`), full review text, and attached Kindle progress notes (`notes.json`).

### 02 / The Oracle (TBR Concierge — *"What Should I Read Next?"*)
- **Time-Budget Commitment Dial**: Filters your 169 `to-read` books by `Number of Pages` (*Single-Sitting `<150p`*, *Weekend Read `150–220p`*, *Standard `221–420p`*, *Deep Dive `500p+`*).
- **Goodreads Graph & Affinity Matcher**: Surfaces unread books backed by `related_work_recommendation.json` (*"Because you read..."*), `suggestions.json`, and your highest-rated authors.
- **Series Continuation Detector**: Flags next-in-series installments waiting on your shelf (`Title (Series, #N)`).
- **TBR Dust vs. Fresh Momentum**: Contrasts newly added high-intent picks (`<90d`) against forgotten high-rated gems (`>2yr` on TBR).

### 03 / The Observatory (Literary DNA & Deep Analytics)
- **The Contrarian Index ($\Delta = \text{My Rating} - \text{Average Rating}$)**: Scatter plot and leaderboard of *Sacred Cows Slain* ($\Delta \le -1.25$) vs. *Hidden Champions* ($\Delta \ge +1.00$).
- **Session Velocity & Re-Read Hall of Fame**: Analyzes your 144 `reading_sessions` for completion speed (`ended_at - started_at`), Sprint Reads vs. Slow Burns, and multi-session re-reads (*No Longer Human*, *The Hunger Games*, *The Picture of Dorian Gray*).
- **Publication Era & Golden Decade**: Histogram of `Original Publication Year` across decades/centuries.
- **DNF Forensics & Challenge Trophy Case**: Inspects your 8 `did-not-finish` books alongside your 2023–2026 Reading Goals and 12 Kindle Challenge Badges.
- **Quotes & Kindle Marginalia Stream**: Dedicated showcase of your 16 liked quotes (`user_quote.json`) and 14 live Kindle reading notes (`notes.json`).
