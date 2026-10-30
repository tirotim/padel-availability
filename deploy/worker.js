var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/rules.ts
var BOOKING_RULES = [
  {
    id: "four-sixty",
    players: 4,
    durationMinutes: 60,
    label: "4 players \xB7 60 minutes",
    shortLabel: "4p / 60m"
  },
  {
    id: "six-ninety",
    players: 6,
    durationMinutes: 90,
    label: "6 players \xB7 90 minutes",
    shortLabel: "6p / 90m"
  }
];
function ruleForDuration(durationMinutes) {
  return BOOKING_RULES.find((r) => r.durationMinutes === durationMinutes) ?? null;
}
__name(ruleForDuration, "ruleForDuration");

// src/dates.ts
function localSlotToUtcIso(slotDate, startTime, timeZone) {
  const local = `${slotDate}T${startTime}`;
  const asUtc = /* @__PURE__ */ new Date(`${local}Z`);
  const inTz = new Date(
    asUtc.toLocaleString("en-US", { timeZone })
  );
  const diff = asUtc.getTime() - inTz.getTime();
  return new Date(asUtc.getTime() + diff).toISOString();
}
__name(localSlotToUtcIso, "localSlotToUtcIso");
function isWithinPollWindow(startsAtIso, options) {
  const start = new Date(startsAtIso);
  const now = /* @__PURE__ */ new Date();
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + options.weeksAhead * 7);
  if (start < now || start > horizon) return false;
  if (!options.weekendsOnly) return true;
  const wd = weekdayInZone(start, options.timeZone);
  return wd === 0 || wd === 6;
}
__name(isWithinPollWindow, "isWithinPollWindow");
function weekdayInZone(date, timeZone) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(date);
  const map = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return map[name] ?? 0;
}
__name(weekdayInZone, "weekdayInZone");

// src/feed.ts
function matchIncomingSlots(incoming, env) {
  const weeksAhead = Math.min(8, Math.max(1, parseInt(env.WEEKS_AHEAD, 10) || 3));
  const weekendsOnly = env.WEEKENDS_ONLY === "true";
  const windowOpts = {
    weeksAhead,
    weekendsOnly,
    timeZone: env.TIMEZONE
  };
  const matched = [];
  for (const slot of incoming) {
    const rule = ruleForDuration(slot.duration_minutes);
    if (!rule) continue;
    const starts_at = localSlotToUtcIso(
      slot.slot_date,
      slot.start_time,
      env.TIMEZONE
    );
    if (!isWithinPollWindow(starts_at, windowOpts)) continue;
    matched.push({
      resource_id: slot.resource_id,
      court_label: slot.court_label ?? null,
      slot_date: slot.slot_date,
      start_time: slot.start_time,
      duration_minutes: rule.durationMinutes,
      players: rule.players,
      price: slot.price ?? null,
      rule_label: rule.label,
      starts_at
    });
  }
  return matched;
}
__name(matchIncomingSlots, "matchIncomingSlots");
async function fetchFeedSlots(feedUrl) {
  const res = await fetch(feedUrl, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Feed ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data.slots && Array.isArray(data.slots)) return data.slots;
  throw new Error("Feed JSON must be { slots: [...] } or a slot array.");
}
__name(fetchFeedSlots, "fetchFeedSlots");

// src/supabase.ts
function headers(env, extra) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
__name(headers, "headers");
async function createPollRun(env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/poll_runs`, {
    method: "POST",
    headers: headers(env, { Prefer: "return=representation" }),
    body: JSON.stringify({})
  });
  if (!res.ok) {
    throw new Error(`Supabase poll_runs insert: ${await res.text()}`);
  }
  const rows = await res.json();
  return rows[0].id;
}
__name(createPollRun, "createPollRun");
async function finishPollRun(env, id, data) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/poll_runs?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      finished_at: (/* @__PURE__ */ new Date()).toISOString(),
      days_polled: data.days_polled,
      slots_found: data.slots_found,
      error: data.error ?? null
    })
  });
  if (!res.ok) {
    throw new Error(`Supabase poll_runs patch: ${await res.text()}`);
  }
}
__name(finishPollRun, "finishPollRun");
async function replaceMatchedSlots(env, pollRunId, slots) {
  const del = await fetch(`${env.SUPABASE_URL}/rest/v1/matched_slots?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: "DELETE",
    headers: headers(env, { Prefer: "return=minimal" })
  });
  if (!del.ok) {
    throw new Error(`Supabase matched_slots delete: ${await del.text()}`);
  }
  if (slots.length === 0) return;
  const withRun = slots.map((s) => ({ ...s, poll_run_id: pollRunId }));
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/matched_slots`, {
    method: "POST",
    headers: headers(env, { Prefer: "return=minimal" }),
    body: JSON.stringify(withRun)
  });
  if (!res.ok) {
    throw new Error(`Supabase matched_slots insert: ${await res.text()}`);
  }
}
__name(replaceMatchedSlots, "replaceMatchedSlots");
async function listMatchedSlots(env) {
  const params = new URLSearchParams({
    select: "id,resource_id,court_label,slot_date,start_time,duration_minutes,players,price,rule_label,starts_at",
    order: "starts_at.asc",
    starts_at: `gte.${(/* @__PURE__ */ new Date()).toISOString()}`
  });
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/matched_slots?${params}`,
    { headers: headers(env) }
  );
  if (!res.ok) {
    throw new Error(`Supabase matched_slots select: ${await res.text()}`);
  }
  return await res.json();
}
__name(listMatchedSlots, "listMatchedSlots");
async function getMeta(env, key) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/app_meta?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: headers(env) }
  );
  if (!res.ok) {
    throw new Error(`Supabase app_meta select: ${await res.text()}`);
  }
  const rows = await res.json();
  return rows[0]?.value ?? null;
}
__name(getMeta, "getMeta");
async function upsertMeta(env, key, value) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/app_meta?on_conflict=key`,
    {
      method: "POST",
      headers: headers(env, {
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify({
        key,
        value,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    }
  );
  if (!res.ok) {
    throw new Error(`Supabase app_meta upsert: ${await res.text()}`);
  }
}
__name(upsertMeta, "upsertMeta");
async function latestPollRun(env) {
  const params = new URLSearchParams({
    select: "finished_at,slots_found,error",
    order: "started_at.desc",
    limit: "1"
  });
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/poll_runs?${params}`, {
    headers: headers(env)
  });
  if (!res.ok) {
    throw new Error(`Supabase poll_runs select: ${await res.text()}`);
  }
  const rows = await res.json();
  return rows[0] ?? null;
}
__name(latestPollRun, "latestPollRun");

// src/sync.ts
async function runAvailabilitySync(env, incoming) {
  requireSupabase(env);
  let raw;
  let sourcesChecked;
  if (incoming) {
    raw = incoming;
    sourcesChecked = 0;
  } else if (env.AVAILABILITY_FEED_URL) {
    raw = await fetchFeedSlots(env.AVAILABILITY_FEED_URL);
    sourcesChecked = 1;
  } else {
    throw new Error(
      "No availability source configured. Set AVAILABILITY_FEED_URL or POST slots to /api/slots."
    );
  }
  const pollRunId = await createPollRun(env);
  const matched = matchIncomingSlots(raw, env);
  try {
    await replaceMatchedSlots(env, pollRunId, matched);
    await finishPollRun(env, pollRunId, {
      days_polled: sourcesChecked,
      slots_found: matched.length
    });
    await upsertMeta(env, "last_poll", {
      at: (/* @__PURE__ */ new Date()).toISOString(),
      sources_checked: sourcesChecked,
      slots_found: matched.length,
      venue: env.VENUE_NAME,
      weeks_ahead: parseInt(env.WEEKS_AHEAD, 10) || 3,
      weekends_only: env.WEEKENDS_ONLY === "true"
    });
    return { sourcesChecked, slotsFound: matched.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishPollRun(env, pollRunId, {
      days_polled: sourcesChecked,
      slots_found: 0,
      error: message
    });
    throw err;
  }
}
__name(runAvailabilitySync, "runAvailabilitySync");
function requireSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured on this Worker.");
  }
}
__name(requireSupabase, "requireSupabase");

// src/index.ts
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }
    if (url.pathname === "/api/rules") {
      return json({ rules: BOOKING_RULES });
    }
    if (url.pathname === "/api/availability" && request.method === "GET") {
      try {
        requireSupabase2(env);
        const [slots, lastPoll, disclaimers] = await Promise.all([
          listMatchedSlots(env),
          latestPollRun(env),
          getMeta(env, "disclaimers")
        ]);
        return json({
          venue: env.VENUE_NAME,
          timezone: env.TIMEZONE,
          weeksAhead: env.WEEKS_AHEAD,
          weekendsOnly: env.WEEKENDS_ONLY === "true",
          rules: BOOKING_RULES,
          disclaimers: Array.isArray(disclaimers) ? disclaimers : [],
          lastPoll,
          slots
        });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500
        );
      }
    }
    if ((url.pathname === "/api/sync" || url.pathname === "/api/poll") && request.method === "POST") {
      return handleProtectedSync(request, env);
    }
    if (url.pathname === "/api/slots" && request.method === "POST") {
      const secret = request.headers.get("X-Poll-Secret");
      if (!env.POLL_SECRET || secret !== env.POLL_SECRET) {
        return json({ error: "Unauthorized" }, 401);
      }
      try {
        const body = await request.json();
        if (!body.slots?.length) {
          return json({ error: "Body must include slots: [...]" }, 400);
        }
        const result = await runAvailabilitySync(env, body.slots);
        return json({ ok: true, ...result });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500
        );
      }
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller, env, ctx) {
    if (!env.AVAILABILITY_FEED_URL) {
      console.log("Scheduled sync skipped: no AVAILABILITY_FEED_URL.");
      return;
    }
    try {
      requireSupabase2(env);
      ctx.waitUntil(runAvailabilitySync(env));
    } catch (err) {
      console.error("Scheduled sync failed:", err);
    }
  }
};
async function handleProtectedSync(request, env) {
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
      500
    );
  }
}
__name(handleProtectedSync, "handleProtectedSync");
function requireSupabase2(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase is not configured on this Worker.");
  }
}
__name(requireSupabase2, "requireSupabase");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
__name(json, "json");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
