# v0 UI/UX Design System & Interactive Visualization Specification

**Aesthetic North Star**: *"Warm Literary Modernism"*  
An interface that feels like a cross between an independent architectural bookshop, a Criterion Collection liner booklet, and an interactive *Pudding.cool* data journalism essay. We reject sterile SaaS dashboard templates in favor of tactile paper textures, archival typography, and high-density literary cartography.

---

## 1. Aesthetic Direction & Design Tokens

### 1.1 Color Palette Tokens

The theming system uses semantic CSS variables designed around physical materials: archival rag paper, fountain pen ink, clothbound bookbuckram, and warm brass library lamps.

| Token | Parchment Light Mode (`:root`) | Library Lamp Dark Mode (`[data-theme="dark"]`) | Usage & Material Reference |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `#F7F4EB` (Warm Rag Parchment) | `#121316` (Deep Folio Charcoal) | Primary application background |
| `--bg-surface` | `#EFECE2` (Unbleached Vellum) | `#1A1C20` (Shadowed Mahogany/Slate) | Cards, filter rails, secondary containers |
| `--bg-elevated` | `#FFFFFF` (Crisp Archival Card) | `#22252A` (Lit Lectern Surface) | Slide-over drawers, command palette, modals |
| `--bg-glass` | `rgba(247, 244, 235, 0.85)` | `rgba(18, 19, 22, 0.85)` | Sticky headers with `backdrop-filter: blur(12px)` |
| `--text-primary` | `#1C1B18` (Iron Gall Ink) | `#EAE6DF` (Warm Chalk / Deckle Edge) | Book titles, primary body copy, headings |
| `--text-secondary` | `#5A564C` (Weathered Graphite) | `#A39E93` (Muted Pewter) | Author names, metadata labels, subtitles |
| `--text-muted` | `#8C867A` (Faded Colophon) | `#6E6A61` (Dimmed Marginalia) | Timestamps, ISBNs, empty states, axis ticks |
| `--border-hairline` | `#DFD9CD` (1px Ledger Rule) | `#2C2F36` (1px Etched Brass Shadow) | Table dividers, card borders, shelf ledges |
| `--accent-primary` | `#9E3B24` (Terracotta / Libris Red) | `#D96B4E` (Warm Vermilion) | Primary actions, active states, personal rating highlights |
| `--accent-secondary`| `#2B4C3F` (First-Edition Buckram Green)| `#4E8771` (Sage Clothbound) | Reading streaks, completion badges, positive divergence |
| `--accent-gold` | `#B8860B` (Gilded Fore-Edge) | `#E5B842` (Library Lamp Amber) | 5-star indicators, canon/favorite markers, spotlights |
| `--chart-community` | `#7D8CA3` (Slate Blue-Grey) | `#687B96` (Muted Steel) | Goodreads community baseline in comparative charts |

### 1.2 Typography & Scannable Hierarchy

We pair an expressive, high-contrast editorial serif with a crisp humanist sans-serif and a technical monospace face for archival catalog numbers and statistics.

- **`--font-display` / Editorial Serif**: `'Newsreader'`, `'Instrument Serif'`, or `'Playfair Display'` (Fallback: `Georgia, serif`)
  - Used for page headers, book titles, pull quotes, and narrative insight callouts.
  - Features optical sizing (`font-optical-sizing: auto`) and italic swashes for emphasis (e.g., *"The Contrarian Index"*).
- **`--font-sans` / UI & Controls**: `'Plus Jakarta Sans'` or `'Inter'` (Fallback: `system-ui, sans-serif`)
  - Used for navigation pills, filter chips, button labels, author subtitles, and dense body reviews.
- **`--font-mono` / Archival & Tabular Data**: `'JetBrains Mono'` or `'IBM Plex Mono'`
  - Mandatory `font-variant-numeric: tabular-nums` across all numerical metrics, page counts, publication years, ISBNs, and rating deltas (`+1.42★`).

#### Type Scale & Rules
- **Hero Literary Stat**: `clamp(2.25rem, 4vw, 3.5rem)` | `--font-display` | Line-height `1.05` | Tracking `-0.02em`
- **Section Header (Index Rubric)**: `1.5rem` (24px) | `--font-display` | Weight `500`
- **Book Card Title**: `1.0625rem` (17px) | `--font-display` | Weight `600` | Line-clamp `2`
- **Archival Label / Micro-Header**: `0.75rem` (12px) | `--font-mono` | Uppercase | Tracking `0.08em` | `--text-muted`

### 1.3 Tactile Surfaces & Motion Language

- **Book Cover Physics**: Covers render with a subtle spine crease gradient overlay (`linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0.15) 3%, rgba(255,255,255,0) 8%)`), realistic aspect ratios, and multi-layered ambient drop shadows.
- **Ledger Rules**: Exposed `1px solid var(--border-hairline)` grid lines reminiscent of library index cards and archival catalog sheets.

---

## 2. Navigation Architecture & Core Views

### Global Shell
- **Top Archival Header / Left Rail**: Minimalist navigation featuring four primary rooms plus a global **`Cmd/Ctrl + K` Command Palette** trigger and quick CSV/Library sync indicator.
- **Persistent Room Switcher**:
  1. `01 / THE STUDY` (Home & Pulse)
  2. `02 / THE LIBRARY` (Interactive Shelf & Cover Wall)
  3. `03 / THE ORACLE` (TBR Concierge & Matcher)
  4. `04 / THE OBSERVATORY` (Analytics & Literary DNA)

---

### 2.1 The Study (Home Dashboard)

Designed as an inviting morning desk rather than a corporate KPI board.

```
+-----------------------------------------------------------------------+
|  01 / THE STUDY                              [Cmd+K Search] [Theme]   |
+-----------------------------------+-----------------------------------+
|  CURRENTLY ON THE NIGHTSTAND      |  READING PACE & PULSE (2026)      |
|  +-------+  Title in Serif        |  28 Books  |  9,410 Pages         |
|  | COVER |  Author Name           |  [|||||||....] 70% of Annual Goal |
|  |       |  342p • Started 6d ago |  Avg Velocity: 42 pages/day       |
|  +-------+  [Log Progress / Note] |  12-Month Sparkline Cadence       |
+-----------------------------------+-----------------------------------+
|  UP NEXT FROM YOUR TBR (ORACLE)   |  ON THIS DAY / REDISCOVER         |
|  "In the mood for a brisk         |  3 Years Ago Today (Oct 2023)     |
|   <250p 20th-century classic?"    |  You finished "Invisible Cities"  |
|  -> 3 Tactile Cover Picks         |  Your Rating: ★★★★★ vs 4.14 Avg   |
|  [Shuffle Picks] [Open Oracle ->] |  "A prism of memory and desire..."|
+-----------------------------------+-----------------------------------+
```

- **Currently Reading Spotlight**: Displays books on the `currently-reading` shelf with cover art, days on the nightstand, estimated completion time at current page velocity, and one-click access to open the Book Dossier to jot down markdown notes.
- **Reading Streak & Pace Pulse**: Tabular readout of year-to-date books vs. pages read (solving the "short novella vs. 1,100-page tome" distortion), with a 52-week contribution/cadence strip.
- **Quick TBR Recommendation**: A live mini-widget powered by *The Oracle* surfacing 3 immediate candidates from `to-read` based on a rotating daily prompt (e.g., *"Short Weekend Reads under 220 Pages"*, *"Highest Community Acclaim Waiting on Your Shelf"*).
- **"On This Day / Rediscover" Memory Card**: Surfaces a book finished on the same month/week in a previous year, or a 5-star favorite read more than 3 years ago, complete with your original review excerpt.

---

### 2.2 The Library (Interactive Shelf & Cover Wall)

High-performance browsing engineered for 1,000+ books with zero layout shift, virtualized scrolling, and instant multi-faceted filtering.

#### Tri-Mode View Switcher
1. **Cover Grid View**:
   - Responsive masonry/grid displaying enriched high-res covers (Open Library / Google Books fallback to procedural clothbound typographic covers generated from title, author, and genre palette).
   - Hover state reveals a subtle translucent pill with personal star rating (`★★★★½`) and page count.
2. **Physical Spine View (Proportional Width!)**:
   - Renders books standing side-by-side on wooden/brass-ruled shelves.
   - **Proportional Geometry**: Spine width (`px`) scales dynamically with `Number of Pages` (`clamp(18px, pages * 0.09px, 68px)`), while spine height varies subtly by binding format (`Hardcover`, `Paperback`, `Mass Market`) or publication era.
   - Vertical rotated typography (`writing-mode: vertical-rl`) with procedural cloth/leather spine textures and color-coding by primary genre/shelf or dominant cover hue.
   - Clicking or hovering a spine slides the book slightly forward (`translateY(-8px)`) with a tooltip preview.
3. **Archival Data Table View**:
   - Criterion/spreadsheet density with sticky headers, multi-column sorting, and `tabular-nums` alignment.
   - Columns: `Cover Thumb`, `Title`, `Author`, `Shelf`, `My Rating`, `Community Avg`, `Delta (My - Avg)`, `Pages`, `Year Pub`, `Date Read`.

#### Instant Multi-Faceted Filtering & `Cmd/Ctrl + K` Command Palette
- **Faceted Filter Bar**: Filter simultaneously by Exclusive Shelf (`read`, `currently-reading`, `to-read`), Custom Tag/Genre pills, Rating Range (`4★+`, `Unrated`), Page Count brackets (`<200p`, `200–400p`, `400–600p`, `600p+`), Publication Decade, and Read Year.
- **`Cmd/Ctrl + K` Global Command Palette**:
  - Instant fuzzy search across Titles, Authors, ISBNs, Shelves, and Personal Review text.
  - Supports keyboard slash commands: `/shelf to-read`, `/pages <250`, `/decade 1970s`, `/random`, `/theme dark`.

---

### 2.3 The Oracle (TBR Concierge)

Transforms the overwhelming `to-read` graveyard into a tactile, serendipitous discovery ritual.

- **Interactive Mood / Length / Era Matcher**:
  - **Commitment Dial (Length)**: *An Evening's Sit (<180p)* • *Standard Novel (200–380p)* • *Deep Immersion (400–600p)* • *Mammoth Epic (600p+)*.
  - **Temporal Compass (Era)**: *Contemporary (2015–Present)* • *Late 20th Century* • *Mid-Century Modern* • *Pre-1920 Classic*.
  - **Acclaim & Vibe Filter**: *Crowd Pleasers (Avg > 4.20★)* • *Cult & Polarizing* • *Long-Neglected on TBR (Added > 3 years ago)*.
- **Tactile Book Cards ("The Deal")**:
  - Deals 3 to 5 large, physical-feeling tarot/dossier cards onto the table with smooth spring physics.
  - Each card displays: Cover, Title/Author, Page Count + Estimated Reading Hours, Why It Matched badges (e.g., `"212 pages • Added 1,140 days ago • 4.31★ Community"`), and a **"Pin to Nightstand"** or **"Redeal"** action.

---

### 2.4 The Observatory (Analytics & Literary DNA)

Interactive data journalism modules built with SVG/Canvas (D3 primitives + custom React/HTML overlays) where **every data point is a clickable book** that opens the Book Dossier Drawer.

#### 1. The Contrarian Scatter Plot (Personal Rating vs. Community Average)
- **Axes**:
  - **X-Axis**: Goodreads `Average Rating` (`2.50★` to `5.00★`).
  - **Y-Axis**: `My Rating` (`1★` to `5★`, with subtle vertical jitter so overlapping books remain individually clickable).
- **Diagonal Parity Line (`y = x`)**: Divides the canvas into four annotated narrative quadrants:
  - **Top-Left ("Secret Darlings / Underrated Gems")**: Books you loved (`4–5★`) that the wider community rated modestly.
  - **Bottom-Right ("The Skeptic's Corner / Overhyped")**: Beloved bestsellers (`>4.1★` community) that you rated `1–3★`.
  - **Top-Right ("Canon Consensus")**: Shared masterpieces.
  - **Bottom-Left ("Mutual Regret")**: Universally panned.
- **Summary Metric**: Displays your **Contrarian Index Score** (mean absolute residual `|My Rating - Average Rating|`) and net bias (`+0.18★ Generous` vs. `-0.34★Tough Critic`).

#### 2. Publication Decade & Era Histogram ("Your Literary Time Machine")
- **Structure**: Interactive bar/lollipop histogram grouping books by `Original Publication Year` (in 10-year bins from antiquity/19th century through the 2020s).
- **Interaction**: Toggle between `Read` vs. `To-Read` stacks to see if your TBR leans older or newer than your actual reading habits. Clicking any decade bar filters a live cover strip below it.

#### 3. Rating Distribution Violin & Bar Chart
- **Structure**: Side-by-side comparison of your discrete `1★–5★` rating bar distribution overlaid against the continuous kernel density (violin curve) of community average ratings for those exact same books.
- **Insight Callout**: Automatically highlights your modal rating (e.g., *"4★ is your workhorse rating (46% of rated books)"*) and identifies your rarest rating tier.

#### 4. Genre & Shelf Treemap / Marimekko ("The Literary Ecosystem")
- **Structure**: Hierarchical treemap derived from user shelves (`Bookshelves`) and enriched Open Library subjects.
- **Encoding**:
  - **Tile Area**: Total `Books Read` (toggleable to `Total Pages Read` by genre).
  - **Tile Color Heat**: Mean personal rating for that genre (from muted slate for `3.0★` to rich terracotta/gold for `4.5★+`), immediately revealing which genres actually bring you the highest satisfaction.

---

### 2.5 Book Dossier Drawer (Slide-Over Detail Sheet)

Clicking any book cover, spine, table row, or chart node anywhere in the app slides open the **Book Dossier Drawer** (`480px–560px` width on desktop, full bottom sheet on mobile) without losing scroll or filter context.

```
+-------------------------------------------------------+
| [X Close]                        ISBN: 9780156453806  |
|                                  Book ID: #9814       |
|  +-----------+  INVISIBLE CITIES                      |
|  |           |  Italo Calvino                         |
|  |   COVER   |  Trans. William Weaver                 |
|  |           |                                        |
|  |           |  165 Pages • Hardcover • 1972 (1978)   |
|  +-----------+  [read] [fiction] [italian] [favorites]|
|                                                       |
|  RATING COMPARISON                                    |
|  My Rating:      ★★★★★ (5.0)   Delta: +0.86★          |
|  Community Avg:  ★★★★☆ (4.14)  [========|===*==]      |
|                                                       |
|  READING TIMELINE                                     |
|  o Added to Library:  2021-04-12                      |
|  o Finished Reading:  2023-10-29 (Read Count: 2)      |
|                                                       |
|  PERSONAL REVIEW (From Goodreads Export)              |
|  "A crystalline dialogue between Kublai Khan and      |
|   Marco Polo where every city is Venice..."           |
|                                                       |
|  LOCAL ARCHIVAL NOTES & MARGINALIA (Markdown)         |
|  +-------------------------------------------------+  |
|  | > "Arriving at each new city, the traveler      |  |
|  | > finds again a past of his that he did not..." |  |
|  | - p. 28                                         |  |
|  +-------------------------------------------------+  |
|  [Auto-saved to local storage / exportable JSON]      |
+-------------------------------------------------------+
```

- **Header & Archival Colophon**: High-res cover with fallback clothbound generator, Title, Author, Additional Contributors (translators/illustrators), Binding, `Number of Pages`, `Original Publication Year` vs. `Year Published` (edition delta), and ISBN13.
- **Personal vs. Community Rating Bullet Bar**: Visualizes your rating alongside the Goodreads community average and calculated delta badge (`+0.86★ Above Consensus`).
- **Reading Provenance & Timeline**: Visual step line showing `Date Added` -> `Date Read` (calculating how many days the book waited on your TBR before being read) and `Read Count`.
- **Goodreads Review & Private Notes**: Renders the imported HTML/text from `My Review` and `Private Notes` with clean editorial typography (and spoiler-tag toggle if `[spoiler]` is present).
- **Local Markdown Marginalia & Quotes**: An editable markdown scratchpad persisted locally (IndexedDB / local JSON export) so readers can add favorite quotes, page citations, and post-export reflections without mutating their raw Goodreads CSV backup.
