/**
 * My Collection — Stremio / Nuvio catalog addon (hybrid edition).
 *
 * Your lists live in a GitHub repo (collections.json). This Worker fetches
 * them on demand through the jsDelivr CDN and caches them at the edge, so
 * pushing a change to GitHub updates your addon within minutes — no redeploy
 * needed.
 *
 * SETUP:
 *  1. Set COLLECTIONS_URL below to your repo's collections.json
 *     (jsDelivr format: https://cdn.jsdelivr.net/gh/USER/REPO@main/collections.json)
 *  2. Replace YOUR_SUBDOMAIN in ADDON.id.
 *  3. Deploy on Cloudflare (paste in dashboard) and open your worker URL.
 */

const ADDON = {
  id: "worker.SUFahad007.my-collection",
  version: "1.0.0",
  name: "My Collection",
  description: "My personal movie & series collection, edited on GitHub and served live.",
};

// >>> EDIT THIS: point at your repo's collections.json (raw GitHub updates fastest) <<<
const COLLECTIONS_URL = "https://raw.githubusercontent.com/SUFahad007/stremio-catalog/main/collections.json";
// Faster CDN alternative (updates a bit slower): https://cdn.jsdelivr.net/gh/YOUR_USERNAME/stremio-catalog@main/collections.json
const COLLECTIONS_TTL = 300; // seconds to cache the list at the edge (5 min)

// Fallback used if the repo hasn't been set up yet or is unreachable
const DEFAULT_COLLECTIONS = [
  {
    type: "movie",
    id: "my-favorites",
    name: "My Favorites",
    items: ["tt0111161", "tt0068646", "tt0468569", "tt1375666"],
  },
];

const PAGE_SIZE = 100;
const META_TTL = 43200; // 12 hours
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

// ---------- load collections from GitHub (edge-cached) ----------

let collectionsCache = null; // per-isolate memory cache

async function getCollections() {
  if (collectionsCache && Date.now() - collectionsCache.ts < COLLECTIONS_TTL * 1000) {
    return collectionsCache.data;
  }

  const cache = globalThis.caches && globalThis.caches.default ? globalThis.caches.default : null;
  let data = null;

  if (cache) {
    const cached = await cache.match(COLLECTIONS_URL);
    if (cached) {
      try {
        data = await cached.json();
      } catch { /* fall through */ }
    }
  }

  if (!data) {
    try {
      const resp = await fetch(COLLECTIONS_URL, { cf: { cacheTtl: COLLECTIONS_TTL } });
      if (resp.ok) {
        data = await resp.json();
        if (cache) {
          try {
            const toCache = new Response(JSON.stringify(data), {
              headers: { "Content-Type": "application/json",
                         "Cache-Control": `public, max-age=${COLLECTIONS_TTL}` },
            });
            await cache.put(COLLECTIONS_URL, toCache);
          } catch { /* ignore */ }
        }
      }
    } catch { /* fall through */ }
  }

  const collections = data && Array.isArray(data.collections) && data.collections.length
    ? data.collections
    : DEFAULT_COLLECTIONS;

  collectionsCache = { data: collections, ts: Date.now() };
  return collections;
}

// ---------- metadata from Cinemeta (edge-cached) ----------

async function fetchMeta(type, id) {
  const cache = globalThis.caches && globalThis.caches.default ? globalThis.caches.default : null;
  const url = `https://v3-cinemeta.strem.io/meta/${type}/${id}.json`;

  if (cache) {
    const cached = await cache.match(new Request(url));
    if (cached) return cached;
  }

  const resp = await fetch(url, { cf: { cacheTtl: META_TTL } });
  if (!resp.ok) return null;
  const respToCache = new Response(resp.body, resp);
  respToCache.headers.set("Cache-Control", `public, max-age=${META_TTL}`);
  if (cache) {
    try {
      await cache.put(new Request(url), respToCache.clone());
    } catch { /* ignore */ }
  }
  return respToCache;
}

async function buildMeta(type, id) {
  try {
    const data = await (await fetchMeta(type, id)).json();
    const m = data && data.meta;
    if (!m || !m.name) return null;
    return {
      id: m.id || id,
      type,
      name: m.name,
      poster: m.poster || "",
      background: m.background || "",
      description: m.description || "",
      imdbRating: m.imdbRating || "",
      releaseInfo: m.releaseInfo || "",
      genres: m.genres || [],
    };
  } catch {
    return { id, type, name: id, poster: "" };
  }
}

// ---------- routing ----------

function jsonResponse(obj, status = 200, cacheSeconds = 3600) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${cacheSeconds}`,
      ...CORS,
    },
  });
}

async function manifest(collections) {
  return {
    ...ADDON,
    resources: ["catalog"],
    types: [...new Set(collections.map((c) => c.type))],
    catalogs: collections.map((c) => ({ type: c.type, id: c.id, name: c.name })),
  };
}

function landing(request) {
  const manifestUrl = new URL("/manifest.json", request.url).href;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${ADDON.name} — Stremio / Nuvio Addon</title>
     <style>
       body{font-family:system-ui,sans-serif;background:#101014;color:#eee;display:flex;
            flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;gap:14px}
       h1{font-size:1.5rem;margin:0} p{color:#999;margin:0}
       .btn{display:inline-block;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;margin:4px}
       .stremio{background:#7b2ff7;color:#fff}.nuvio{background:#ff6b2b;color:#fff}
       code{background:#1e1e26;padding:8px 12px;border-radius:6px;color:#9fd3ff;word-break:break-all}
     </style></head><body>
     <h1>${ADDON.name}</h1>
     <p>Install this catalog addon:</p>
     <a class="btn stremio" href="stremio://${manifestUrl}">Install on Stremio</a>
     <a class="btn nuvio" href="nuvio://${manifestUrl}">Install on Nuvio</a>
     <p>Manual addon URL:</p>
     <code>${manifestUrl}</code>
     </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") return landing(request);

    const collections = await getCollections();

    if (path === "/manifest.json") {
      return jsonResponse(await manifest(collections), 200, 60);
    }

    // /catalog/:type/:id.json  (supports ?skip=N and ?genre=)
    const match = path.match(/^\/catalog\/(movie|series)\/([a-z0-9-]+)\.json$/);
    if (match) {
      const [, type, id] = match;
      const coll = collections.find((c) => c.type === type && c.id === id);
      if (!coll) return jsonResponse({ metas: [] }, 404);

      const skip = parseInt(url.searchParams.get("skip") || "0", 10) || 0;
      const genre = url.searchParams.get("genre");

      let metas = await Promise.all(coll.items.map((imdbId) => buildMeta(type, imdbId)));
      metas = metas.filter(Boolean);
      if (genre) metas = metas.filter((m) => (m.genres || []).includes(genre));
      metas = metas.slice(skip, skip + PAGE_SIZE);

      return jsonResponse({ metas: metas });
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};
