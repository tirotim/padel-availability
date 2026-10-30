export type BookingRule = {
  id: "four-sixty" | "six-ninety";
  players: 4 | 6;
  durationMinutes: 60 | 90;
  label: string;
  shortLabel: string;
};

export const BOOKING_RULES: BookingRule[] = [
  {
    id: "four-sixty",
    players: 4,
    durationMinutes: 60,
    label: "4 players · 60 minutes",
    shortLabel: "4p / 60m",
  },
  {
    id: "six-ninety",
    players: 6,
    durationMinutes: 90,
    label: "6 players · 90 minutes",
    shortLabel: "6p / 90m",
  },
];

export function ruleForDuration(durationMinutes: number): BookingRule | null {
  return (
    BOOKING_RULES.find((r) => r.durationMinutes === durationMinutes) ?? null
  );
}
