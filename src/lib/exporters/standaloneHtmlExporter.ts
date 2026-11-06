import type { LibraryBundle, UserLocalState, EnrichmentCacheMap } from '../../types/library';

/**
 * Generates a self-contained, standalone, offline HTML document of the reader's entire Ex Libris catalog.
 * Zero servers or build steps required: opens in any desktop or mobile browser.
 */
export function generateStandaloneLibraryHtml(
  bundle: LibraryBundle,
  userState: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): string {
  const books = bundle.books || [];
  const clippings = userState.kindleClippings || [];
  const exportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Prepare safe JSON for embedding
  const payloadJson = JSON.stringify({
    generatedAt: new Date().toISOString(),
    stats: bundle.summaryStats,
    books: books.map((b) => ({
      id: b.id,
      title: b.cleanTitle || b.title,
      author: b.author,
      myRating: b.myRating,
      averageRating: b.averageRating,
      pageCount: b.pageCount,
      yearPublished: b.yearPublished || b.originalPublicationYear,
      exclusiveShelf: b.exclusiveShelf,
      dateRead: b.dateRead,
      coverUrl: enrichmentCache?.[b.id]?.coverUrl || null,
      clippingsCount: clippings.filter((c) => c.matchedBookId === b.id).length,
    })),
    clippingsSample: clippings.slice(0, 100).map((c) => ({
      id: c.id,
      title: c.cleanTitle,
      author: c.author,
      content: c.content,
      matchedBookId: c.matchedBookId,
    })),
  }).replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ex Libris — Standalone Reading Archive (${books.length} Volumes)</title>
  <style>
    :root {
      --bg-canvas: #F8F5EE;
      --bg-card: #FFFFFF;
      --bg-surface: #EFE9DC;
      --text-ink: #1C1B18;
      --text-muted: #6B6559;
      --accent-primary: #8C2D19;
      --accent-gold: #C28B1E;
      --border-ledger: #E0D9C8;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-canvas: #141311;
        --bg-card: #1D1C19;
        --bg-surface: #262420;
        --text-ink: #EAE6DE;
        --text-muted: #9E988D;
        --accent-primary: #D95338;
        --accent-gold: #E5A93C;
        --border-ledger: #33302A;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif;
      background-color: var(--bg-canvas);
      color: var(--text-ink);
      line-height: 1.5;
      padding: 24px;
    }
    .header {
      max-width: 1200px;
      margin: 0 auto 24px auto;
      border-bottom: 2px solid var(--border-ledger);
      padding-bottom: 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand h1 {
      font-family: Georgia, serif;
      font-size: 24px;
      font-weight: bold;
      letter-spacing: -0.5px;
    }
    .brand p { font-size: 12px; color: var(--text-muted); font-family: monospace; }
    .kpi-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .kpi-pill {
      background: var(--bg-card);
      border: 1px solid var(--border-ledger);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-family: monospace;
    }
    .kpi-pill strong { color: var(--accent-primary); }
    .controls {
      max-width: 1200px;
      margin: 0 auto 20px auto;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    .search-input {
      flex: 1;
      min-width: 240px;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--border-ledger);
      background: var(--bg-card);
      color: var(--text-ink);
      font-size: 14px;
      font-family: inherit;
    }
    .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid var(--border-ledger);
      background: var(--bg-card);
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      font-family: monospace;
      transition: all 0.15s ease;
    }
    .filter-btn.active {
      background: var(--accent-primary);
      color: #fff;
      border-color: var(--accent-primary);
      font-weight: bold;
    }
    .catalog-grid {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }
    .book-card {
      background: var(--bg-card);
      border: 1px solid var(--border-ledger);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.15s ease, border-color 0.15s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .book-card:hover {
      transform: translateY(-2px);
      border-color: var(--accent-gold);
    }
    .book-title {
      font-family: Georgia, serif;
      font-size: 15px;
      font-weight: bold;
      color: var(--text-ink);
      line-height: 1.3;
      margin-bottom: 4px;
    }
    .book-author {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .book-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 10px;
      border-top: 1px solid var(--border-ledger);
      font-size: 11px;
      font-family: monospace;
      color: var(--text-muted);
    }
    .rating-stars { color: var(--accent-gold); font-weight: bold; }
    .shelf-badge {
      text-transform: uppercase;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--bg-surface);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h1>EX LIBRIS · PORTABLE ARCHIVE</h1>
      <p>Standalone Offline Reading Ledger · Exported ${exportDate}</p>
    </div>
    <div class="kpi-row">
      <div class="kpi-pill"><strong>${books.length}</strong> Volumes</div>
      <div class="kpi-pill"><strong>${books.filter((b) => b.exclusiveShelf === 'read').length}</strong> Completed</div>
      <div class="kpi-pill"><strong>${clippings.length}</strong> Kindle Highlights</div>
    </div>
  </div>

  <div class="controls">
    <input type="text" id="searchInput" class="search-input" placeholder="Search by title, author, or keyword...">
    <div class="filter-pills">
      <button class="filter-btn active" data-shelf="all">All (${books.length})</button>
      <button class="filter-btn" data-shelf="read">Read</button>
      <button class="filter-btn" data-shelf="currently-reading">On Desk</button>
      <button class="filter-btn" data-shelf="to-read">TBR</button>
      <button class="filter-btn" data-shelf="5star">5★ Canon</button>
    </div>
  </div>

  <div class="catalog-grid" id="catalogGrid"></div>

  <script id="exLibrisPayload" type="application/json">${payloadJson}</script>
  <script>
    (function() {
      const data = JSON.parse(document.getElementById('exLibrisPayload').textContent);
      const books = data.books || [];
      const grid = document.getElementById('catalogGrid');
      const searchInput = document.getElementById('searchInput');
      const filterBtns = document.querySelectorAll('.filter-btn');

      let currentShelf = 'all';
      let currentQuery = '';

      function render() {
        const q = currentQuery.toLowerCase().trim();
        const filtered = books.filter(b => {
          if (currentShelf === 'read' && b.exclusiveShelf !== 'read') return false;
          if (currentShelf === 'currently-reading' && b.exclusiveShelf !== 'currently-reading') return false;
          if (currentShelf === 'to-read' && b.exclusiveShelf !== 'to-read') return false;
          if (currentShelf === '5star' && b.myRating !== 5) return false;

          if (q) {
            return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
          }
          return true;
        });

        grid.innerHTML = filtered.map(b => {
          const stars = b.myRating ? ('★'.repeat(b.myRating) + (b.myRating < 5 ? '☆'.repeat(5 - b.myRating) : '')) : '';
          return \`
            <div class="book-card">
              <div>
                <div class="book-title">\${b.title}</div>
                <div class="book-author">by \${b.author}</div>
              </div>
              <div class="book-meta">
                <span>\${b.pageCount ? b.pageCount + ' pp' : 'Length n/a'}</span>
                \${stars ? \`<span class="rating-stars">\${stars}</span>\` : \`<span class="shelf-badge">\${b.exclusiveShelf || 'Shelved'}</span>\`}
              </div>
            </div>
          \`;
        }).join('');
      }

      searchInput.addEventListener('input', (e) => {
        currentQuery = e.target.value;
        render();
      });

      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentShelf = btn.dataset.shelf;
          render();
        });
      });

      render();
    })();
  </script>
</body>
</html>`;
}

/**
 * Triggers a browser download of the standalone offline HTML file.
 */
export function downloadStandaloneLibraryHtml(
  bundle: LibraryBundle,
  userState: UserLocalState,
  enrichmentCache?: EnrichmentCacheMap
): void {
  const html = generateStandaloneLibraryHtml(bundle, userState, enrichmentCache);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ex_libris_standalone_archive_${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
