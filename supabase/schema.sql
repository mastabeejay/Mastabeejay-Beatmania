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
  -- Null means the entry was posted with no password — anyone can post that way, but the entry can
  -- then never be edited/deleted except by an admin (see edit/delete_guestbook_entry below, which
  -- treat a null hash as "no password was ever set", distinct from a wrong-password attempt).
  password_hash text,
  -- Null for a top-level entry; set for a reply. Only one level deep — replies-to-replies aren't
  -- supported, so the client never lets this point at a row that is itself a reply. Cascading
  -- delete means removing a top-level entry (e.g. via admin moderation) cleans up its replies too.
  parent_id bigint references guestbook(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Migrate a database created before this column existed.
alter table guestbook add column if not exists parent_id bigint references guestbook(id) on delete cascade;
-- Migrate a database where this was still NOT NULL — lets posting without a password insert NULL.
alter table guestbook alter column password_hash drop not null;
-- Optional image/video attached when posting (data: URL, like the leaderboard's celebration photo
-- and the banner images — same base64-in-Postgres pattern, no Supabase Storage bucket needed).
-- attachment_type is 'image' or 'video', set by add_guestbook_entry below; only ever written at
-- post time, never changed by edit_guestbook_entry.
alter table guestbook add column if not exists attachment_data text;
alter table guestbook add column if not exists attachment_type text;

create table if not exists visits (
  id integer primary key default 1,
  count integer not null default 0,
  constraint visits_single_row check (id = 1)
);
insert into visits (id, count) values (1, 0) on conflict (id) do nothing;

-- Holds a single bcrypt hash for the site owner's admin password — never a plaintext default here.
-- After running this schema, set your own password once via the SQL Editor:
--   insert into admin_settings (id, password_hash) values (1, crypt('YOUR_PASSWORD_HERE', gen_salt('bf')))
--   on conflict (id) do update set password_hash = excluded.password_hash;
create table if not exists admin_settings (
  id integer primary key default 1,
  password_hash text not null,
  constraint admin_settings_single_row check (id = 1)
);

-- Admin-configurable link buttons shown on the start screen (replaces what used to be hardcoded
-- YouTube/TikTok links). `platform` is one of the keys the client's icon set knows about
-- (youtube/tiktok/instagram/facebook/x/threads/naver/kakaotalk/custom) — purely a lookup key for
-- which icon to render, not validated against an enum here since the client owns that mapping.
create table if not exists social_links (
  id bigint generated always as identity primary key,
  platform text not null,
  url text not null,
  created_at timestamptz not null default now()
);

-- Singleton banner shown on the start screen, editable only by the admin — a plain notice message,
-- a big graffiti-style tag, or an uploaded image set, never more than one at once (display_mode
-- picks which, if any). display_mode is constrained by admin_set_banner() below, not a table CHECK
-- — a CHECK added here wouldn't retroactively apply to a table that already exists from an earlier
-- run anyway.
create table if not exists site_notice (
  id integer primary key default 1,
  message text,
  graffiti_text text,
  display_mode text not null default 'none',
  updated_at timestamptz not null default now(),
  constraint site_notice_single_row check (id = 1)
);
insert into site_notice (id, message) values (1, null) on conflict (id) do nothing;

-- Migrate a database created before these columns existed.
alter table site_notice add column if not exists graffiti_text text;
alter table site_notice add column if not exists display_mode text not null default 'none';
-- Jaybot's admin-preferred mode: 'gemini' (AI answers, falling back to the fixed FAQ on quota/
-- network failure) or 'faq' (fixed FAQ only, never call Gemini). Rides on this singleton since
-- it's exactly the same shape of site-wide, admin-owned, publicly-readable setting as the banner.
alter table site_notice add column if not exists chatbot_mode text not null default 'gemini';

-- Up to 4 admin-uploaded images shown side by side when display_mode = 'images'. Stored as
-- data: URLs (like the leaderboard's celebration photo) rather than Supabase Storage, since the
-- set is always tiny (<=4 rows) and the client already has the same base64-in-Postgres pattern.
-- Managed incrementally — admin_add_banner_images appends (capped at 4 total) and
-- admin_delete_banner_image removes one by id, rather than replacing the whole set every time.
create table if not exists site_banner_images (
  id bigint generated always as identity primary key,
  image_data text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- --- Row Level Security -------------------------------------------------------------------------
-- Enabling RLS with no policy = deny-all by default. Only the policies below (plus the
-- `security definer` functions further down, which bypass RLS) can touch these tables.

alter table leaderboard enable row level security;
alter table guestbook enable row level security;
alter table visits enable row level security;
alter table admin_settings enable row level security;
alter table social_links enable row level security;
alter table site_notice enable row level security;
alter table site_banner_images enable row level security;
-- `admin_settings` has no policies at all — not even select. Only admin_login() below can read it.

drop policy if exists "public read leaderboard" on leaderboard;
create policy "public read leaderboard" on leaderboard for select using (true);

drop policy if exists "public read social_links" on social_links;
create policy "public read social_links" on social_links for select using (true);
grant select on social_links to anon, authenticated;

drop policy if exists "public read site_notice" on site_notice;
create policy "public read site_notice" on site_notice for select using (true);
grant select on site_notice to anon, authenticated;

drop policy if exists "public read site_banner_images" on site_banner_images;
create policy "public read site_banner_images" on site_banner_images for select using (true);
grant select on site_banner_images to anon, authenticated;

-- No select policy on `guestbook` itself — password_hash must never reach the client. Anon reads
-- go through the view below instead, which is defined without `security_invoker`, so it queries
-- the underlying table with the view owner's privileges and bypasses the deny-all RLS on the base
-- table while still only exposing the columns listed here.
--
-- CASCADE because add/edit/delete_guestbook_entry all declare `returns setof guestbook_public`,
-- which makes them depend on the view's row type — plain DROP fails once those functions exist
-- (as they will on any re-run after the first). Every function this cascades away is redefined
-- later in this same script, so re-running the whole file stays safe.
drop view if exists guestbook_public cascade;
create view guestbook_public as
  select id, name, message, parent_id, attachment_data, attachment_type, created_at from guestbook order by id desc;
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

-- Signature changed each time a param was added (p_parent_id, then attachment) — drop every prior
-- overload so it doesn't linger alongside the current one.
drop function if exists add_guestbook_entry(text, text, text);
drop function if exists add_guestbook_entry(text, text, text, bigint);

create or replace function add_guestbook_entry(
  p_name text, p_message text, p_password text, p_parent_id bigint default null,
  p_attachment_data text default null, p_attachment_type text default null
)
returns setof guestbook_public
language plpgsql security definer set search_path = public, extensions as $$
begin
  -- A blank/absent password stores a null hash (see the column's comment) rather than hashing an
  -- empty string — otherwise anyone leaving the password field blank on a later edit/delete attempt
  -- would match every other password-less entry too.
  insert into guestbook (name, message, password_hash, parent_id, attachment_data, attachment_type)
  values (
    left(p_name, 20),
    left(p_message, 500),
    case when p_password is null or p_password = '' then null else crypt(p_password, gen_salt('bf')) end,
    p_parent_id,
    p_attachment_data,
    case when p_attachment_type in ('image', 'video') then p_attachment_type else null end
  );

  -- Keep the guestbook bounded by top-level entry count, same as the old server's GUESTBOOK_LIMIT —
  -- counting replies too would let one busy thread crowd out every other conversation. Trimming a
  -- top-level entry cascades to its replies automatically (see the table's on delete cascade).
  delete from guestbook where parent_id is null and id not in (
    select id from guestbook where parent_id is null order by id desc limit 50
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
  if not found then
    raise exception 'not_found';
  end if;
  -- Distinct from wrong_password: this entry was posted with no password at all, so no password
  -- (blank or otherwise) can ever match it — only admin moderation can touch it from here on.
  if v_hash is null then
    raise exception 'no_password';
  end if;
  if v_hash <> crypt(p_password, v_hash) then
    raise exception 'wrong_password';
  end if;

  update guestbook set message = left(p_message, 500) where id = p_id;
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
  if not found then
    raise exception 'not_found';
  end if;
  if v_hash is null then
    raise exception 'no_password';
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

-- Admin moderation: one shared password (not per-row), checked fresh on every call rather than via
-- any session/token — same stateless pattern as the guestbook's own password checks, just against
-- admin_settings instead of a per-row password_hash. Returns false (not an error) when no password
-- has been configured yet, so a fresh deploy fails closed instead of raising a confusing exception.
create or replace function admin_login(p_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  select password_hash into v_hash from admin_settings where id = 1;
  if v_hash is null then
    return false;
  end if;
  return v_hash = crypt(p_password, v_hash);
end;
$$;

-- Requires the CURRENT password even though the client is already "logged in" for this session —
-- an unattended, still-logged-in tab shouldn't be enough on its own to hijack the admin password.
create or replace function admin_change_password(p_current_password text, p_new_password text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_current_password) then
    raise exception 'wrong_password';
  end if;
  if p_new_password is null or length(trim(p_new_password)) = 0 then
    raise exception 'invalid_new_password';
  end if;
  update admin_settings set password_hash = crypt(p_new_password, gen_salt('bf')) where id = 1;
  return true;
end;
$$;

create or replace function admin_delete_guestbook_entries(p_ids bigint[], p_admin_password text)
returns setof guestbook_public
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  delete from guestbook where id = any(p_ids);
  return query select * from guestbook_public order by id desc limit 50;
end;
$$;

create or replace function admin_delete_leaderboard_entries(p_ids bigint[], p_admin_password text)
returns setof leaderboard
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  delete from leaderboard where id = any(p_ids);
  return query select * from leaderboard order by score desc, id asc limit 20;
end;
$$;

create or replace function admin_add_social_link(p_platform text, p_url text, p_admin_password text)
returns setof social_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  insert into social_links (platform, url) values (left(p_platform, 20), left(p_url, 500));
  return query select * from social_links order by id;
end;
$$;

create or replace function admin_update_social_link(p_id bigint, p_platform text, p_url text, p_admin_password text)
returns setof social_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  update social_links set platform = left(p_platform, 20), url = left(p_url, 500) where id = p_id;
  return query select * from social_links order by id;
end;
$$;

create or replace function admin_delete_social_link(p_id bigint, p_admin_password text)
returns setof social_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  delete from social_links where id = p_id;
  return query select * from social_links order by id;
end;
$$;

-- Superseded by admin_set_banner (also sets graffiti_text/display_mode) — drop it so it doesn't
-- linger as dead code.
drop function if exists admin_set_notice(text, text);

create or replace function admin_set_banner(p_notice_text text, p_graffiti_text text, p_display_mode text, p_admin_password text)
returns setof site_notice
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  update site_notice set
    message = nullif(trim(left(coalesce(p_notice_text, ''), 500)), ''),
    graffiti_text = nullif(trim(left(coalesce(p_graffiti_text, ''), 60)), ''),
    display_mode = case when p_display_mode in ('notice', 'graffiti', 'images') then p_display_mode else 'none' end,
    updated_at = now()
  where id = 1;
  return query select * from site_notice where id = 1;
end;
$$;

-- Jaybot mode switch — 'faq' makes the client answer from its fixed FAQ only (never calling
-- Gemini); 'gemini' restores AI answers, which still degrade to the FAQ on quota/network failure
-- regardless of this setting (the client can't use quota that isn't there).
create or replace function admin_set_chatbot_mode(p_mode text, p_admin_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  if p_mode not in ('gemini', 'faq') then
    raise exception 'invalid_mode';
  end if;
  update site_notice set chatbot_mode = p_mode, updated_at = now() where id = 1;
end;
$$;

-- Superseded by admin_add_banner_images/admin_delete_banner_image — replacing the *entire* set on
-- every call meant uploading images one at a time (the only option most browsers' file pickers make
-- obvious) silently wiped out whatever was already there, leaving just the last upload.
drop function if exists admin_set_banner_images(text[], text);

-- Appends to the existing set (capped at 4 total) rather than replacing it, and switches
-- display_mode to 'images' automatically — uploading images and having to separately remember to
-- flip a mode radio would be a confusing two-step flow. Switching to notice/graffiti mode later
-- (via admin_set_banner above) leaves these rows untouched, so switching back to 'images' doesn't
-- require re-uploading.
create or replace function admin_add_banner_images(p_images text[], p_admin_password text)
returns setof site_banner_images
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_current_count integer;
  v_next_sort integer;
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  if p_images is null or array_length(p_images, 1) is null or array_length(p_images, 1) = 0 then
    raise exception 'no_images';
  end if;

  select count(*), coalesce(max(sort_order), -1) + 1 into v_current_count, v_next_sort from site_banner_images;
  if v_current_count + array_length(p_images, 1) > 4 then
    raise exception 'too_many_images';
  end if;

  insert into site_banner_images (image_data, sort_order)
  select img, v_next_sort + idx - 1 from unnest(p_images) with ordinality as t(img, idx);
  update site_notice set display_mode = 'images', updated_at = now() where id = 1;

  return query select * from site_banner_images order by sort_order;
end;
$$;

create or replace function admin_delete_banner_image(p_id bigint, p_admin_password text)
returns setof site_banner_images
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  delete from site_banner_images where id = p_id;
  return query select * from site_banner_images order by sort_order;
end;
$$;

grant execute on function submit_score(text, text, integer, text, text, text, text, integer) to anon, authenticated;
grant execute on function add_guestbook_entry(text, text, text, bigint, text, text) to anon, authenticated;
grant execute on function edit_guestbook_entry(bigint, text, text) to anon, authenticated;
grant execute on function delete_guestbook_entry(bigint, text) to anon, authenticated;
grant execute on function increment_visits() to anon, authenticated;
grant execute on function admin_login(text) to anon, authenticated;
grant execute on function admin_change_password(text, text) to anon, authenticated;
grant execute on function admin_delete_guestbook_entries(bigint[], text) to anon, authenticated;
grant execute on function admin_delete_leaderboard_entries(bigint[], text) to anon, authenticated;
grant execute on function admin_add_social_link(text, text, text) to anon, authenticated;
grant execute on function admin_update_social_link(bigint, text, text, text) to anon, authenticated;
grant execute on function admin_delete_social_link(bigint, text) to anon, authenticated;
grant execute on function admin_set_banner(text, text, text, text) to anon, authenticated;
grant execute on function admin_set_chatbot_mode(text, text) to anon, authenticated;
grant execute on function admin_add_banner_images(text[], text) to anon, authenticated;
grant execute on function admin_delete_banner_image(bigint, text) to anon, authenticated;
