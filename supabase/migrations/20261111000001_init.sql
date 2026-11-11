-- Lock-in: schema. Every row belongs to one user; RLS keeps it that way.

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  tz text not null default 'Asia/Jerusalem',
  ask_time time not null default '18:30',
  review_time time not null default '20:30',
  weekly_goal int not null default 4,
  push_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- The current training plan as one JSON document (see src/lib/types.ts: Plan).
create table public.plans (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Every saved version, so a bad edit can be undone.
create table public.plan_versions (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  data jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

-- One row per day: did I train, what, why not, how it went.
create table public.checkins (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  status text not null check (status in ('going', 'game', 'skipped', 'done')),
  workout_code text,
  skip_reason text,
  rating int check (rating between 1 and 5),
  energy int check (energy between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create table public.set_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  workout_code text,
  exercise text not null,
  set_no int not null,
  weight numeric,
  reps int,
  created_at timestamptz not null default now()
);
create index on public.set_logs (user_id, exercise, day desc);

-- Numbers tracked over time: sleep (h), bodyweight (kg), vertical (cm), broad (cm), squat5 (kg).
create table public.metrics (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  kind text not null,
  value numeric not null,
  unique (user_id, day, kind)
);

create table public.messages (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  kind text not null default 'chat', -- chat | ask | review | ask_late
  created_at timestamptz not null default now()
);
create index on public.messages (user_id, created_at desc);

-- What the coach knows about me. Written by the coach (save_memory) or by me in Settings.
create table public.memories (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  fact text not null,
  created_at timestamptz not null default now()
);

create table public.push_subs (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.notify_log (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, day, kind)
);

do $$
declare t text;
begin
  foreach t in array array['profiles','plans','plan_versions','checkins','set_logs','metrics','messages','memories','push_subs','notify_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- user_id defaults to the caller, so the client never has to send it.
do $$
declare t text;
begin
  foreach t in array array['profiles','plans','plan_versions','checkins','set_logs','metrics','messages','memories','push_subs'] loop
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
  end loop;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger checkins_touch before update on public.checkins for each row execute function public.touch_updated_at();
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();

-- Keep a version of the plan on every change.
create or replace function public.plan_snapshot() returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.plan_versions (user_id, data) values (new.user_id, new.data);
  return new;
end $$;
create trigger plans_snapshot after insert or update of data on public.plans for each row execute function public.plan_snapshot();
