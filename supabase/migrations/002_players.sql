-- Group members shown on the availability page.

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint players_name_unique unique (name)
);

alter table players enable row level security;

insert into players (name, created_at)
values ('Chris', clock_timestamp())
on conflict (name) do nothing;

insert into players (name, created_at)
values ('Casey', clock_timestamp())
on conflict (name) do nothing;
