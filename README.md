# Stremio Catalog — my personal Stremio / Nuvio collections

My own catalog & collections addon for **Stremio** and **Nuvio**.

```
collections.json (this repo)  ──►  Cloudflare Worker  ──►  Stremio / Nuvio
     edit lists here                 fetches on demand,
     version-controlled               caches 5 min at the edge
```

## Daily use

Edit **`collections.json`** (click the pencil on GitHub), commit — the addon
updates within ~5 minutes. No redeploys.

```json
{
  "collections": [
    {
      "type": "movie",
      "id": "my-favorites",
      "name": "My Favorites",
      "items": ["tt0111161", "tt0468569"]
    },
    {
      "type": "series",
      "id": "my-shows",
      "name": "My Shows",
      "items": ["tt0903747"]
    }
  ]
}
```

- `type` — `movie` or `series`
- `id` — short unique id, no spaces
- `name` — the label shown in Stremio/Nuvio
- `items` — IMDb ids from the title's URL: imdb.com/title/**tt0111161**

## One-time Cloudflare setup

1. dash.cloudflare.com → **Workers & Pages** → Create Worker (e.g.
   `my-collection`) → Deploy.
2. **Edit code** → paste `worker/worker.js` → Deploy.
3. Open your worker URL and tap **Install on Stremio** / **Install on Nuvio**.

The Worker already points at this repo's `collections.json` and falls back to
a built-in list if GitHub is ever unreachable.

## Repo contents

| Path | Purpose |
|---|---|
| `collections.json` | Your lists — the only file you edit |
| `worker/worker.js` | The Cloudflare Worker (already configured for this repo) |
*Optional:* a wrangler-deploy workflow can be added later by pasting `deploy-worker.yml` from your local zip via the GitHub web editor (it needs a `CF_API_TOKEN` secret).

## Notes

- Metadata (posters, descriptions, ratings) comes from **Cinemeta**, Stremio's
  free metadata API, cached 12h at Cloudflare's edge.
- This is a catalog/metadata addon; playback streams come from your streaming
  addons.
- Everything runs on free tiers: public GitHub repo, Cloudflare Workers
  100k req/day, unlimited Cinemeta.
