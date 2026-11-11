-- Lock-in schema (Cloudflare D1 / SQLite). Dates are 'YYYY-MM-DD' in Israel time; timestamps are ISO UTC.

create table users (
  id integer primary key autoincrement,
  email text not null unique,
  pass_hash text not null,
  salt text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table sessions (
  token_hash text primary key,
  user_id integer not null references users(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table login_failures (
  at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table profiles (
  user_id integer primary key references users(id) on delete cascade,
  tz text not null default 'Asia/Jerusalem',
  ask_time text not null default '18:30',
  review_time text not null default '20:30',
  weekly_goal integer not null default 4,
  push_enabled integer not null default 1
);

create table plans (
  user_id integer primary key references users(id) on delete cascade,
  data text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table plan_versions (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  data text not null,
  note text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table checkins (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  day text not null,
  status text not null check (status in ('going', 'game', 'skipped', 'done')),
  workout_code text,
  skip_reason text,
  rating integer check (rating between 1 and 5),
  energy integer check (energy between 1 and 5),
  notes text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (user_id, day)
);

create table set_logs (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  day text not null,
  workout_code text,
  exercise text not null,
  set_no integer not null,
  weight real,
  reps integer
);
create index set_logs_user_day on set_logs (user_id, day);

create table metrics (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  day text not null,
  kind text not null,
  value real not null,
  unique (user_id, day, kind)
);

create table messages (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  kind text not null default 'chat',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index messages_user_time on messages (user_id, created_at);

create table memories (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  fact text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table push_subs (
  id integer primary key autoincrement,
  user_id integer not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null
);

create table notify_log (
  user_id integer not null references users(id) on delete cascade,
  day text not null,
  kind text not null,
  primary key (user_id, day, kind)
);
