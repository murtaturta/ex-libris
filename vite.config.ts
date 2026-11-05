import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function localDiskStorePlugin(): Plugin {
  const dataDir = path.resolve(__dirname, 'data');
  const publicDataDir = path.resolve(__dirname, 'public/data');
  const userStatePath = path.join(dataDir, 'user_state.json');
  const enrichmentPath = path.join(dataDir, 'enrichment_cache.json');
  const enrichmentPublicPath = path.join(publicDataDir, 'enrichment_cache.json');
  const bundleDataPath = path.join(dataDir, 'library_bundle.json');
  const bundlePublicPath = path.join(publicDataDir, 'library_bundle.json');

  const ensureDirs = () => {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(publicDataDir)) fs.mkdirSync(publicDataDir, { recursive: true });
  };

  const readJsonSafe = <T>(filePath: string, fallback: T): T => {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  const readBody = (req: any): Promise<string> =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf-8');
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });

  return {
    name: 'exlibris-local-disk-store',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (!url || !url.startsWith('/api/')) return next();

        ensureDirs();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        try {
          if (url === '/api/user-state') {
            if (req.method === 'GET') {
              const defaultState = {
                version: '0.2.0',
                updatedAt: new Date().toISOString(),
                showCovers: false,
                bookOverrides: {},
                kindleClippings: [],
              };
              const data = readJsonSafe(userStatePath, defaultState);
              res.statusCode = 200;
              res.end(JSON.stringify(data));
              return;
            }
            if (req.method === 'POST') {
              const raw = await readBody(req);
              const parsed = JSON.parse(raw);
              parsed.updatedAt = new Date().toISOString();
              fs.writeFileSync(userStatePath, JSON.stringify(parsed, null, 2), 'utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, updatedAt: parsed.updatedAt }));
              return;
            }
          }

          if (url === '/api/enrichment-cache') {
            if (req.method === 'GET') {
              const cache = readJsonSafe(enrichmentPath, {});
              res.statusCode = 200;
              res.end(JSON.stringify(cache));
              return;
            }
            if (req.method === 'POST') {
              const raw = await readBody(req);
              const incoming = JSON.parse(raw);
              const existing = readJsonSafe<Record<string, unknown>>(enrichmentPath, {});
              const merged = { ...existing, ...incoming };
              const serialized = JSON.stringify(merged, null, 2);
              fs.writeFileSync(enrichmentPath, serialized, 'utf-8');
              fs.writeFileSync(enrichmentPublicPath, serialized, 'utf-8');
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, count: Object.keys(merged).length }));
              return;
            }
          }

          if (url === '/api/library-bundle' && req.method === 'POST') {
            const raw = await readBody(req);
            const parsed = JSON.parse(raw);
            const serialized = JSON.stringify(parsed, null, 2);
            fs.writeFileSync(bundleDataPath, serialized, 'utf-8');
            fs.writeFileSync(bundlePublicPath, serialized, 'utf-8');
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          if (url === '/api/goodreads-rss' && req.method === 'GET') {
            const parsedUrl = new URL(req.url || '', 'http://localhost');
            const userId = parsedUrl.searchParams.get('userId');
            const shelf = parsedUrl.searchParams.get('shelf') || 'read';
            const page = parsedUrl.searchParams.get('page') || '1';

            if (!userId || !/^\d+$/.test(userId.trim())) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Valid numeric userId is required' }));
              return;
            }

            const targetUrl = `https://www.goodreads.com/review/list_rss/${encodeURIComponent(userId.trim())}?shelf=${encodeURIComponent(shelf)}&page=${encodeURIComponent(page)}&per_page=200`;

            try {
              const upstreamRes = await fetch(targetUrl, {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ExLibris/1.0',
                  Accept: 'application/rss+xml, application/xml, text/xml, */*',
                },
              });

              if (!upstreamRes.ok) {
                res.statusCode = upstreamRes.status;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: `Goodreads RSS returned status ${upstreamRes.status}` }));
                return;
              }

              const xml = await upstreamRes.text();
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/xml; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(xml);
              return;
            } catch (fetchErr: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(
                JSON.stringify({
                  error: `Failed to fetch Goodreads RSS: ${fetchErr?.message || fetchErr}`,
                })
              );
              return;
            }
          }

          return next();
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: err?.message || 'Disk persistence error' }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), localDiskStorePlugin()],
  server: {
    port: 3000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
