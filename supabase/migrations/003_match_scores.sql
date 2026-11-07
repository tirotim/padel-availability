-- Scores for a match week. Each row is one game on a date.

create table if not exists match_scores (
  id uuid primary key default gen_random_uuid(),
  match_date date not null,
  game_number int not null check (game_number > 0),
  side_a text[] not null check (cardinality(side_a) > 0),
  score_a int not null check (score_a >= 0),
  side_b text[] not null check (cardinality(side_b) > 0),
  score_b int not null check (score_b >= 0),
  created_at timestamptz not null default now(),
  constraint match_scores_date_game_unique unique (match_date, game_number)
);

alter table match_scores enable row level security;

insert into match_scores (match_date, game_number, side_a, score_a, side_b, score_b)
values
  ('2026-11-05', 1, array['Tim', 'Casey'], 6, array['Spike', 'Matt'], 2),
  ('2026-11-05', 2, array['Tim', 'Matt'], 6, array['Casey', 'Spike'], 6)
on conflict (match_date, game_number) do nothing;
