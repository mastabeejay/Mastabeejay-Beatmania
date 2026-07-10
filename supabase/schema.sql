-- Beejay's Deejay Jackey — Supabase schema
--
-- Run this once in the Supabase dashboard: Project -> SQL Editor -> New query -> paste -> Run.
--
-- Design: the anon (public, unauthenticated) role can read the leaderboard and guestbook directly,
-- but every WRITE — including the password-protected guestbook edit/delete — goes through a
-- `security definer` function instead of a raw table INSERT/UPDATE/DELETE. That keeps password
-- hashing/verification and the "top 10 only" trimming logic on the server side, matching what the
-- old Node/SQLite API did, without needing a server process of our own.

create extension if not exists pgcrypto;

-- --- Tables -----------------------------------------------------------------------------------

create table if not exists leaderboard (
  id bigint generated always as identity primary key,
  name text not null,
  message text not null,
  score integer not null,
  speed text not null default '-',
  difficulty text not null default '-',
  step integer not null default 1,
  bgm text not null default '-',
  photo text,
  created_at timestamptz not null default now()
);

-- Migrate a database created before these columns existed. Existing rows default to step 1 — they
-- predate the multi-step escalation feature, so they're all single-step runs.
alter table leaderboard add column if not exists photo text;
alter table leaderboard add column if not exists step integer not null default 1;

create table if not exists guestbook (
  id bigint generated always as identity primary key,
  name text not null,
  message text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists visits (
  id integer primary key default 1,
  count integer not null default 0,
  constraint visits_single_row check (id = 1)
);
insert into visits (id, count) values (1, 0) on conflict (id) do nothing;

-- --- Row Level Security -------------------------------------------------------------------------
-- Enabling RLS with no policy = deny-all by default. Only the policies below (plus the
-- `security definer` functions further down, which bypass RLS) can touch these tables.

alter table leaderboard enable row level security;
alter table guestbook enable row level security;
alter table visits enable row level security;

drop policy if exists "public read leaderboard" on leaderboard;
create policy "public read leaderboard" on leaderboard for select using (true);

-- No select policy on `guestbook` itself — password_hash must never reach the client. Anon reads
-- go through the view below instead, which is defined without `security_invoker`, so it queries
-- the underlying table with the view owner's privileges and bypasses the deny-all RLS on the base
-- table while still only exposing the columns listed here.
drop view if exists guestbook_public;
create view guestbook_public as
  select id, name, message, created_at from guestbook order by id desc;
grant select on guestbook_public to anon, authenticated;

-- `visits` has no policies at all — not even select. Only increment_visits() below can touch it.

-- --- RPC functions (all security definer, all owned by postgres) --------------------------------

-- Signature changed (added p_photo, then p_step) — drop the older overloads so they don't linger
-- alongside the current one.
drop function if exists submit_score(text, text, integer, text, text, text);
drop function if exists submit_score(text, text, integer, text, text, text, text);

create or replace function submit_score(
  p_name text, p_message text, p_score integer, p_speed text, p_difficulty text, p_bgm text, p_photo text default null, p_step integer default 1
) returns setof leaderboard
language plpgsql security definer set search_path = public as $$
begin
  insert into leaderboard (name, message, score, speed, difficulty, step, bgm, photo)
  values (left(p_name, 20), left(p_message, 80), p_score, left(p_speed, 10), left(p_difficulty, 10), greatest(p_step, 1), left(p_bgm, 10), left(p_photo, 500000));

  -- Keep only the current top 20 — mirrors the old server's trim-after-insert behavior.
  delete from leaderboard where id not in (
    select id from leaderboard order by score desc, id asc limit 20
  );

  return query select * from leaderboard order by score desc, id asc limit 20;
end;
$$;

create or replace function add_guestbook_entry(p_name text, p_message text, p_password text)
returns setof guestbook_public
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into guestbook (name, message, password_hash)
  values (left(p_name, 20), left(p_message, 200), crypt(p_password, gen_salt('bf')));

  -- Keep the guestbook bounded, same as the old server's GUESTBOOK_LIMIT.
  delete from guestbook where id not in (
    select id from guestbook order by id desc limit 50
  );

  return query select * from guestbook_public order by id desc limit 50;
end;
$$;

create or replace function edit_guestbook_entry(p_id bigint, p_message text, p_password text)
returns setof guestbook_public
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from guestbook where id = p_id;
  if v_hash is null then
    raise exception 'not_found';
  end if;
  if v_hash <> crypt(p_password, v_hash) then
    raise exception 'wrong_password';
  end if;

  update guestbook set message = left(p_message, 200) where id = p_id;
  return query select * from guestbook_public order by id desc limit 50;
end;
$$;

create or replace function delete_guestbook_entry(p_id bigint, p_password text)
returns setof guestbook_public
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from guestbook where id = p_id;
  if v_hash is null then
    raise exception 'not_found';
  end if;
  if v_hash <> crypt(p_password, v_hash) then
    raise exception 'wrong_password';
  end if;

  delete from guestbook where id = p_id;
  return query select * from guestbook_public order by id desc limit 50;
end;
$$;

create or replace function increment_visits()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update visits set count = count + 1 where id = 1 returning count into v_count;
  return v_count;
end;
$$;

grant execute on function submit_score(text, text, integer, text, text, text, text, integer) to anon, authenticated;
grant execute on function add_guestbook_entry(text, text, text) to anon, authenticated;
grant execute on function edit_guestbook_entry(bigint, text, text) to anon, authenticated;
grant execute on function delete_guestbook_entry(bigint, text) to anon, authenticated;
grant execute on function increment_visits() to anon, authenticated;
