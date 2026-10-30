export type MatchedSlotRow = {
  id: string;
  resource_id: string;
  court_label: string | null;
  slot_date: string;
  start_time: string;
  duration_minutes: number;
  players: number;
  price: string | null;
  rule_label: string;
  starts_at: string;
};

type SupabaseEnv = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

function headers(env: SupabaseEnv, extra?: Record<string, string>) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function createPollRun(env: SupabaseEnv): Promise<string> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/poll_runs`, {
    method: "POST",
    headers: headers(env, { Prefer: "return=representation" }),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Supabase poll_runs insert: ${await res.text()}`);
  }
  const rows = (await res.json()) as { id: string }[];
  return rows[0]!.id;
}

export async function finishPollRun(
  env: SupabaseEnv,
  id: string,
  data: {
    days_polled: number;
    slots_found: number;
    error?: string | null;
  },
): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/poll_runs?id=eq.${id}`, {
    method: "PATCH",
    headers: headers(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      finished_at: new Date().toISOString(),
      days_polled: data.days_polled,
      slots_found: data.slots_found,
      error: data.error ?? null,
    }),
  });
  if (!res.ok) {
    throw new Error(`Supabase poll_runs patch: ${await res.text()}`);
  }
}

export async function replaceMatchedSlots(
  env: SupabaseEnv,
  pollRunId: string,
  slots: {
    resource_id: string;
    court_label: string | null;
    slot_date: string;
    start_time: string;
    duration_minutes: number;
    players: number;
    price: string | null;
    rule_label: string;
    starts_at: string;
  }[],
): Promise<void> {
  const del = await fetch(`${env.SUPABASE_URL}/rest/v1/matched_slots?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: "DELETE",
    headers: headers(env, { Prefer: "return=minimal" }),
  });
  if (!del.ok) {
    throw new Error(`Supabase matched_slots delete: ${await del.text()}`);
  }
  if (slots.length === 0) return;

  const withRun = slots.map((s) => ({ ...s, poll_run_id: pollRunId }));
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/matched_slots`, {
    method: "POST",
    headers: headers(env, { Prefer: "return=minimal" }),
    body: JSON.stringify(withRun),
  });
  if (!res.ok) {
    throw new Error(`Supabase matched_slots insert: ${await res.text()}`);
  }
}

export async function listMatchedSlots(
  env: SupabaseEnv,
): Promise<MatchedSlotRow[]> {
  const params = new URLSearchParams({
    select:
      "id,resource_id,court_label,slot_date,start_time,duration_minutes,players,price,rule_label,starts_at",
    order: "starts_at.asc",
    starts_at: `gte.${new Date().toISOString()}`,
  });
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/matched_slots?${params}`,
    { headers: headers(env) },
  );
  if (!res.ok) {
    throw new Error(`Supabase matched_slots select: ${await res.text()}`);
  }
  return (await res.json()) as MatchedSlotRow[];
}

export async function listPlayerNames(env: SupabaseEnv): Promise<string[]> {
  const params = new URLSearchParams({
    select: "name",
    order: "created_at.asc",
  });
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/players?${params}`, {
    headers: headers(env),
  });
  if (!res.ok) {
    throw new Error(`Supabase players select: ${await res.text()}`);
  }
  const rows = (await res.json()) as { name: string }[];
  return rows.map((row) => row.name);
}

export async function getMeta(
  env: SupabaseEnv,
  key: string,
): Promise<unknown | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/app_meta?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: headers(env) },
  );
  if (!res.ok) {
    throw new Error(`Supabase app_meta select: ${await res.text()}`);
  }
  const rows = (await res.json()) as { value: unknown }[];
  return rows[0]?.value ?? null;
}

export async function upsertMeta(
  env: SupabaseEnv,
  key: string,
  value: unknown,
): Promise<void> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/app_meta?on_conflict=key`,
    {
    method: "POST",
    headers: headers(env, {
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      key,
      value,
      updated_at: new Date().toISOString(),
    }),
  },
  );
  if (!res.ok) {
    throw new Error(`Supabase app_meta upsert: ${await res.text()}`);
  }
}

export async function latestPollRun(
  env: SupabaseEnv,
): Promise<{ finished_at: string | null; slots_found: number; error: string | null } | null> {
  const params = new URLSearchParams({
    select: "finished_at,slots_found,error",
    order: "started_at.desc",
    limit: "1",
  });
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/poll_runs?${params}`, {
    headers: headers(env),
  });
  if (!res.ok) {
    throw new Error(`Supabase poll_runs select: ${await res.text()}`);
  }
  const rows = (await res.json()) as {
    finished_at: string | null;
    slots_found: number;
    error: string | null;
  }[];
  return rows[0] ?? null;
}
