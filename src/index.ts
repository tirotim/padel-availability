import type { IncomingSlot } from "./feed";
import { BOOKING_RULES } from "./rules";
import { runAvailabilitySync, type Env as SyncEnv } from "./sync";
import { getMeta, latestPollRun, listMatchedSlots } from "./supabase";

type Env = SyncEnv & {
  ASSETS: Fetcher;
  POLL_SECRET?: string;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/rules") {
      return json({ rules: BOOKING_RULES });
    }

    if (url.pathname === "/api/availability" && request.method === "GET") {
      try {
        requireSupabase(env);
        const [slots, lastPoll, disclaimers] = await Promise.all([
          listMatchedSlots(env),
          latestPollRun(env),
          getMeta(env, "disclaimers"),
        ]);
        return json({
          venue: env.VENUE_NAME,
          timezone: env.TIMEZONE,
          weeksAhead: env.WEEKS_AHEAD,
          weekendsOnly: env.WEEKENDS_ONLY === "true",
          rules: BOOKING_RULES,
          disclaimers: Array.isArray(disclaimers) ? disclaimers : [],
          lastPoll,
          slots,
        });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    if (
      (url.pathname === "/api/sync" || url.pathname === "/api/poll") &&
      request.method === "POST"
    ) {
      return handleProtectedSync(request, env);
    }

    if (url.pathname === "/api/slots" && request.method === "POST") {
      const secret = request.headers.get("X-Poll-Secret");
      if (!env.POLL_SECRET || secret !== env.POLL_SECRET) {
        return json({ error: "Unauthorized" }, 401);
      }
      try {
        const body = (await request.json()) as { slots?: IncomingSlot[] };
        if (!body.slots?.length) {
          return json({ error: "Body must include slots: [...]" }, 400);
        }
        const result = await runAvailabilitySync(env, body.slots);
        return json({ ok: true, ...result });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.AVAILABILITY_FEED_URL) {
      console.log("Scheduled sync skipped: no AVAILABILITY_FEED_URL.");
      return;
    }
    try {
      requireSupabase(env);
      ctx.waitUntil(runAvailabilitySync(env));
    } catch (err) {
      console.error("Scheduled sync failed:", err);
    }
  },
};

async function handleProtectedSync(
  request: Request,
  env: Env,
): Promise<Response> {
  const secret = request.headers.get("X-Poll-Secret");
  if (!env.POLL_SECRET || secret !== env.POLL_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const result = await runAvailabilitySync(env);
    return json({ ok: true, ...result });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
}

function requireSupabase(env: Env): void {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured on this Worker.");
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
