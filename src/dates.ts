/** Interpret date+time in `timeZone` and return UTC ISO string. */
export function localSlotToUtcIso(
  slotDate: string,
  startTime: string,
  timeZone: string,
): string {
  const local = `${slotDate}T${startTime}`;
  const asUtc = new Date(`${local}Z`);
  const inTz = new Date(
    asUtc.toLocaleString("en-US", { timeZone }),
  );
  const diff = asUtc.getTime() - inTz.getTime();
  return new Date(asUtc.getTime() + diff).toISOString();
}

export function isWithinPollWindow(
  startsAtIso: string,
  options: {
    weeksAhead: number;
    weekendsOnly: boolean;
    timeZone: string;
  },
): boolean {
  const start = new Date(startsAtIso);
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + options.weeksAhead * 7);
  if (start < now || start > horizon) return false;
  if (!options.weekendsOnly) return true;
  const wd = weekdayInZone(start, options.timeZone);
  return wd === 0 || wd === 6;
}

function weekdayInZone(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[name] ?? 0;
}
