-- Run in Supabase SQL editor (or via CLI) before first deploy.

create table if not exists poll_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  days_polled int,
  slots_found int not null default 0,
  error text
);

create table if not exists matched_slots (
  id uuid primary key default gen_random_uuid(),
  poll_run_id uuid references poll_runs(id) on delete set null,
  resource_id text not null,
  court_label text,
  slot_date date not null,
  start_time time not null,
  duration_minutes int not null check (duration_minutes in (60, 90)),
  players int not null check (players in (4, 6)),
  price text,
  rule_label text not null,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (resource_id, starts_at, duration_minutes)
);

create index if not exists matched_slots_starts_at_idx on matched_slots (starts_at asc);

create table if not exists app_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table poll_runs enable row level security;
alter table matched_slots enable row level security;
alter table app_meta enable row level security;

-- No public policies: Worker uses service role key server-side only.

insert into app_meta (key, value)
values (
  'disclaimers',
  '[
    "This page is unofficial and not affiliated with your club.",
    "Availability may be updated on a schedule; slots can be booked by others before you see them.",
    "Always confirm price, court, and cancellation terms with the venue before paying.",
    "Club cancellation policies vary: late cancellations often forfeit the court fee or a percentage.",
    "Many venues require 24–48 hours'' notice for a full refund; inside that window you may receive no refund.",
    "Group bookings (4×60 or 6×90) mean one person often pays the full court — agree split and backup players before booking."
  ]'::jsonb
)
on conflict (key) do nothing;
