/**
 * Cloudflare Worker: Goodreads Public RSS Proxy
 *
 * Provides CORS headers and 1-hour edge caching via `caches.default`
 * to reliably proxy Goodreads public RSS bookshelf feeds.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Permissive CORS headers for browser consumption
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, User-Agent, Accept',
      'Access-Control-Max-Age': '86400',
    };

    // 2. Handle HTTP OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    const requestUrl = new URL(request.url);

    // 3. Resolve target URL: either direct `?url=...` or `?userId=...&shelf=...&page=...`
    let targetUrl = requestUrl.searchParams.get('url');

    if (!targetUrl) {
      const userId = requestUrl.searchParams.get('userId');
      const shelf = requestUrl.searchParams.get('shelf') || 'read';
      const page = requestUrl.searchParams.get('page') || '1';

      if (userId && /^\d+$/.test(userId.trim())) {
        targetUrl = `https://www.goodreads.com/review/list_rss/${encodeURIComponent(
          userId.trim()
        )}?shelf=${encodeURIComponent(shelf)}&page=${encodeURIComponent(page)}&per_page=200`;
      }
    }

    if (!targetUrl) {
      return new Response(
        JSON.stringify({
          error:
            'Missing target URL. Provide either ?url=<goodreads-rss-url> or ?userId=<numeric-id>&shelf=<shelf>&page=<page>.',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
    }

    // Validate that targetUrl points to goodreads.com
    try {
      const parsedTarget = new URL(targetUrl);
      if (!parsedTarget.hostname.endsWith('goodreads.com')) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Proxy only permits requests to goodreads.com.' }),
          {
            status: 403,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json; charset=utf-8',
            },
          }
        );
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid target URL format.' }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    // 4. Cloudflare Edge Cache lookup (1-hour cache)
    const cache = caches.default;
    const cacheKey = new Request(targetUrl, { method: 'GET' });
    let cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      const newHeaders = new Headers(cachedResponse.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      newHeaders.set('X-Proxy-Cache', 'HIT');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers: newHeaders,
      });
    }

    // 5. Upstream fetch to Goodreads RSS with standard browser User-Agent
    try {
      const upstreamResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ExLibris/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
      });

      if (!upstreamResponse.ok) {
        return new Response(
          JSON.stringify({
            error: `Upstream Goodreads returned status ${upstreamResponse.status}`,
          }),
          {
            status: upstreamResponse.status,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json; charset=utf-8',
            },
          }
        );
      }

      const xmlText = await upstreamResponse.text();

      const responseToCache = new Response(xmlText, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'X-Proxy-Cache': 'MISS',
        },
      });

      // Cache successful RSS response for 1 hour
      ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));

      return responseToCache;
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: `Gateway error contacting Goodreads: ${err?.message || err}`,
        }),
        {
          status: 502,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
    }
  },
};
