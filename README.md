# Padel availability (Cloudflare + Supabase)

Lightweight page on **Cloudflare Workers** that shows padel court slots matching your group rules, stored in **Supabase**. There is **no Playtomic integration** — you connect your **local venue** via a JSON feed URL or by pushing slots to the API.

## Rules

| Duration | Players |
| -------- | ------- |
| 60 min   | 4       |
| 90 min   | 6       |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql) in the SQL editor.
3. Copy **Project URL** and **service_role** key.

### 2. Cloudflare Worker

```bash
npm install
cp .env.example .dev.vars
# Edit .dev.vars

npm run dev
npm run deploy
```

Secrets:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put POLL_SECRET
# Optional — poll your venue on a schedule:
npx wrangler secret put AVAILABILITY_FEED_URL
```

Set `VENUE_NAME`, `WEEKS_AHEAD`, `TIMEZONE`, and `WEEKENDS_ONLY` in [`wrangler.jsonc`](wrangler.jsonc).

### 3. Getting availability in

**Option A — JSON feed (cron every 15 min)**  
Host or generate JSON like [`docs/example-feed.json`](docs/example-feed.json) and set `AVAILABILITY_FEED_URL`. The Worker fetches it on cron and on `POST /api/sync`.

**Option B — Push slots**  
Your own script (or a small scraper for your club site) POSTs to the Worker:

```bash
curl -X POST https://YOUR-WORKER.workers.dev/api/slots \
  -H "Content-Type: application/json" \
  -H "X-Poll-Secret: YOUR_SECRET" \
  -d @docs/example-feed.json
```

Only slots with **60** or **90** minute durations within the next `WEEKS_AHEAD` weeks are kept (optional weekends-only filter).

## API

| Route | Description |
| ----- | ----------- |
| `GET /` | Static UI |
| `GET /api/availability` | Slots + disclaimers + last sync |
| `POST /api/sync` | Pull from `AVAILABILITY_FEED_URL` |
| `POST /api/slots` | Replace matched slots from JSON body |

Both write routes require header `X-Poll-Secret`.
