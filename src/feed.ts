import { isWithinPollWindow, localSlotToUtcIso } from "./dates";
import { ruleForDuration } from "./rules";

/** Raw slot from your venue feed or POST /api/slots */
export type IncomingSlot = {
  resource_id: string;
  court_label?: string | null;
  slot_date: string;
  start_time: string;
  duration_minutes: number;
  price?: string | null;
};

export type MatchedSlotInsert = {
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

export function matchIncomingSlots(
  incoming: IncomingSlot[],
  env: { TIMEZONE: string; WEEKS_AHEAD: string; WEEKENDS_ONLY: string },
): MatchedSlotInsert[] {
  const weeksAhead = Math.min(8, Math.max(1, parseInt(env.WEEKS_AHEAD, 10) || 3));
  const weekendsOnly = env.WEEKENDS_ONLY === "true";
  const windowOpts = {
    weeksAhead,
    weekendsOnly,
    timeZone: env.TIMEZONE,
  };

  const matched: MatchedSlotInsert[] = [];
  for (const slot of incoming) {
    const rule = ruleForDuration(slot.duration_minutes);
    if (!rule) continue;
    const starts_at = localSlotToUtcIso(
      slot.slot_date,
      slot.start_time,
      env.TIMEZONE,
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
      starts_at,
    });
  }
  return matched;
}

export async function fetchFeedSlots(
  feedUrl: string,
): Promise<IncomingSlot[]> {
  const res = await fetch(feedUrl, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Feed ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { slots?: IncomingSlot[] } | IncomingSlot[];
  if (Array.isArray(data)) return data;
  if (data.slots && Array.isArray(data.slots)) return data.slots;
  throw new Error("Feed JSON must be { slots: [...] } or a slot array.");
}
