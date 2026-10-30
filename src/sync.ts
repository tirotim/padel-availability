import { fetchFeedSlots, matchIncomingSlots, type IncomingSlot } from "./feed";
import {
  createPollRun,
  finishPollRun,
  replaceMatchedSlots,
  upsertMeta,
} from "./supabase";

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AVAILABILITY_FEED_URL?: string;
  WEEKS_AHEAD: string;
  TIMEZONE: string;
  WEEKENDS_ONLY: string;
  VENUE_NAME: string;
};

export async function runAvailabilitySync(
  env: Env,
  incoming?: IncomingSlot[],
): Promise<{ sourcesChecked: number; slotsFound: number }> {
  requireSupabase(env);

  let raw: IncomingSlot[];
  let sourcesChecked: number;

  if (incoming) {
    raw = incoming;
    sourcesChecked = 0;
  } else if (env.AVAILABILITY_FEED_URL) {
    raw = await fetchFeedSlots(env.AVAILABILITY_FEED_URL);
    sourcesChecked = 1;
  } else {
    throw new Error(
      "No availability source configured. Set AVAILABILITY_FEED_URL or POST slots to /api/slots.",
    );
  }

  const pollRunId = await createPollRun(env);
  const matched = matchIncomingSlots(raw, env);

  try {
    await replaceMatchedSlots(env, pollRunId, matched);
    await finishPollRun(env, pollRunId, {
      days_polled: sourcesChecked,
      slots_found: matched.length,
    });
    await upsertMeta(env, "last_poll", {
      at: new Date().toISOString(),
      sources_checked: sourcesChecked,
      slots_found: matched.length,
      venue: env.VENUE_NAME,
      weeks_ahead: parseInt(env.WEEKS_AHEAD, 10) || 3,
      weekends_only: env.WEEKENDS_ONLY === "true",
    });
    return { sourcesChecked, slotsFound: matched.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishPollRun(env, pollRunId, {
      days_polled: sourcesChecked,
      slots_found: 0,
      error: message,
    });
    throw err;
  }
}

function requireSupabase(env: Env): void {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured on this Worker.");
  }
}
