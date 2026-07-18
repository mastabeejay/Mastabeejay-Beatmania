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

-- BDJ Membership accounts. Defined before leaderboard/guestbook since both reference it via
-- member_id. `name` doubles as the login handle (no separate username), so it must be unique —
-- signup rejects a name already taken. Every other profile field is optional. Same deny-all RLS
-- (enabled below, zero policies) as admin_settings: nothing here is ever read except through the
-- security definer functions further down, so password_hash/phone/email/birthdate never reach the
-- client directly.
create table if not exists members (
  id bigint generated always as identity primary key,
  name text not null unique,
  password_hash text not null,
  photo_data text,
  gender text,
  birthdate date,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

-- BDJ Crews direct messages — a member can only message another member who's currently shown as
-- online in the Crews directory (enforced client-side; nothing here stops an offline recipient
-- from receiving one too, but the UI never offers that path). Same deny-all RLS as members —
-- every read/write goes through send_direct_message/load_direct_messages below.
create table if not exists direct_messages (
  id bigint generated always as identity primary key,
  sender_id bigint not null references members(id) on delete cascade,
  recipient_id bigint not null references members(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
alter table direct_messages enable row level security;

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
-- Set only when a logged-in BDJ member submitted this score (see `members` above) — `on delete set
-- null` so a removed member account never takes their historical scores down with it.
alter table leaderboard add column if not exists member_id bigint references members(id) on delete set null;

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
-- attachment_type is 'image' or 'video'; both can also be replaced later via edit_guestbook_entry.
alter table guestbook add column if not exists attachment_data text;
alter table guestbook add column if not exists attachment_type text;
-- No per-visitor identity to key a "who already hearted this" table off of, so this is a bare
-- counter — add_guestbook_heart just increments it, and abuse is mitigated client-side only
-- (main.ts hides the button after one heart per browser via localStorage).
alter table guestbook add column if not exists heart_count integer not null default 0;
-- Set only when a logged-in BDJ member posted this entry (see `members` above) — lets that member
-- edit/delete it later without ever supplying password_hash (see edit/delete_guestbook_entry).
-- `on delete set null` so a removed member account never takes their historical posts down with it.
alter table guestbook add column if not exists member_id bigint references members(id) on delete set null;

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

-- Optional admin-uploaded image (data: URL, same base64-in-Postgres pattern as the banner images
-- and guestbook attachments) shown INSTEAD of the platform's built-in SVG icon when present — lets
-- the admin brand a link button with their own artwork rather than being limited to the fixed
-- platform glyph set.
alter table social_links add column if not exists image_data text;

-- New table -----------------------------------------------------------------------------------

-- "Website" banners: admin-managed clickable rectangles shown below the Jaybot launcher on the
-- start screen (see #website-links-container in index.html), each carrying its own title + content
-- text and styling rather than a platform icon — for linking to things that aren't really "SNS" (a
-- personal site, a store page, etc.). Title and content are styled independently (own font/size/
-- bold each) since a banner reads better with a short bold headline plus smaller detail text below
-- it, same as e.g. the leaderboard's own title-plus-subtext rows. font_color/border_color apply to
-- both (the user asked to vary font/size/bold per field, not color). font_family/animation are
-- validated in the RPC functions below (a small fixed set) rather than a table CHECK, since a CHECK
-- wouldn't retroactively apply to a table that already exists from an earlier run.
create table if not exists website_links (
  id bigint generated always as identity primary key,
  url text not null,
  title text not null,
  title_font_size integer not null default 16,
  title_font_family text not null default 'display',
  title_bold boolean not null default true,
  content text not null default '',
  content_font_size integer not null default 12,
  content_font_family text not null default 'body',
  content_bold boolean not null default false,
  font_color text not null default '#e8f4ff',
  border_color text not null default '#00f0ff',
  animation text not null default 'none',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table website_links enable row level security;

-- "Beejay Bros" link buttons: a second, visually distinct admin-managed link list (see
-- #beejay-bros-links-container in index.html), shown in the right margin below the
-- login/Join-Crew widget. Unlike website_links there's no per-row styling here — font, size-fit,
-- border-less button shape, and the shimmering metallic frame around the whole group are all fixed
-- in CSS/JS, so the admin only ever supplies a url + short label text. Capped at 10 rows, same as
-- website_links, enforced in admin_add_beejay_bros_link below.
create table if not exists beejay_bros_links (
  id bigint generated always as identity primary key,
  url text not null,
  text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table beejay_bros_links enable row level security;

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
-- Site-wide skin choice, set from the admin panel's [Skin design set] section: 'original' is the
-- launch cyberpunk look, 'ai' is the neutral-dark/emerald "AI style" reskin (modeled on the
-- v0 "Pointer AI landing page" template). Same single-row site_notice pattern as chatbot_mode.
alter table site_notice add column if not exists skin_design text not null default 'original';

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
alter table members enable row level security;
-- `admin_settings` has no policies at all — not even select. `members` is the same — every read
-- and write goes through a security definer function below (admin_login()/member_login()/
-- member_signup()/member_update_profile()/list_members()), including the members_public view
-- further down, which is deliberately NOT granted to anon/authenticated directly (the "BDJ Crews"
-- directory is crew-only, gated by list_members() requiring valid member credentials).

drop policy if exists "public read leaderboard" on leaderboard;
create policy "public read leaderboard" on leaderboard for select using (true);

drop policy if exists "public read social_links" on social_links;
create policy "public read social_links" on social_links for select using (true);
grant select on social_links to anon, authenticated;

drop policy if exists "public read website_links" on website_links;
create policy "public read website_links" on website_links for select using (true);
grant select on website_links to anon, authenticated;

drop policy if exists "public read beejay_bros_links" on beejay_bros_links;
create policy "public read beejay_bros_links" on beejay_bros_links for select using (true);
grant select on beejay_bros_links to anon, authenticated;

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
-- member_photo_data is the ONLY members column exposed here (via the left join) — a guest-posted
-- entry (member_id null) just gets null back, same as any other member-only field. This is
-- deliberately narrower than members_public: no name/gender/birthdate/phone/email leak through a
-- guestbook read, only the one field the entry avatar needs, and only for whichever member happens
-- to already be named on that row.
--
-- CASCADE because add/edit/delete_guestbook_entry (+ admin_delete_guestbook_entries) all declare
-- `returns setof guestbook_public`, which makes them depend on the view's row type — plain DROP
-- fails once those functions exist (as they will on any re-run after the first). Every function
-- this cascades away is redefined later in this same script, so re-running the whole file stays
-- safe. add_guestbook_heart/remove_guestbook_heart return a bare integer, not the view's row type,
-- so they're untouched by this.
drop view if exists guestbook_public cascade;
create view guestbook_public as
  select g.id, g.name, g.message, g.parent_id, g.attachment_data, g.attachment_type, g.heart_count, g.member_id, m.photo_data as member_photo_data, g.created_at
  from guestbook g
  left join members m on m.id = g.member_id
  order by g.id desc;
grant select on guestbook_public to anon, authenticated;

-- Backs the "BDJ Crews" directory listing — signup order (oldest first). Includes birthdate/phone/
-- email at the site owner's explicit request (the directory doubles as a crew contact list); still
-- excludes password_hash, the one column that can never leave this table under any circumstance.
--
-- NOT granted to anon/authenticated directly — unlike guestbook_public/leaderboard, this view is
-- crew-only, not public. list_members() below is the only way to read it, and it requires valid
-- member credentials first. CASCADE because list_members declares `returns setof members_public`.
drop view if exists members_public cascade;
create view members_public as
  select id, name, gender, birthdate, phone, email, photo_data, created_at from members order by id asc;

-- `visits` has no policies at all — not even select. Only increment_visits() below can touch it.

-- --- RPC functions (all security definer, all owned by postgres) --------------------------------

-- Signature changed (added p_photo, then p_step, then membership) — drop the prior overload so it
-- doesn't linger alongside the current one.
drop function if exists submit_score(text, text, integer, text, text, text, text, integer);

-- Member path (both p_member_name/p_member_password given) verifies via verify_member(), records
-- member_id, and uses the member's own registered name — same rationale as add_guestbook_entry's
-- member path. Guest path is unchanged except the saved name now gets "(Guest)" appended; the
-- client is responsible for requiring a non-blank p_name from guests going forward (this function
-- never silently defaulted a blank name here, that fallback lived client-side in main.ts).
create or replace function submit_score(
  p_name text, p_message text, p_score integer, p_speed text, p_difficulty text, p_bgm text,
  p_photo text default null, p_step integer default 1,
  p_member_name text default null, p_member_password text default null
) returns setof leaderboard
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_member_id bigint;
  v_final_name text;
begin
  if p_member_name is not null and p_member_password is not null then
    v_member_id := verify_member(p_member_name, p_member_password);
    v_final_name := p_member_name;
  else
    v_member_id := null;
    v_final_name := left(p_name, 20) || '(Guest)';
  end if;

  insert into leaderboard (name, message, score, speed, difficulty, step, bgm, photo, member_id)
  values (v_final_name, left(p_message, 80), p_score, left(p_speed, 10), left(p_difficulty, 10), greatest(p_step, 1), left(p_bgm, 10), left(p_photo, 500000), v_member_id);

  -- Keep only the current top 20 — mirrors the old server's trim-after-insert behavior.
  delete from leaderboard where id not in (
    select id from leaderboard order by score desc, id asc limit 20
  );

  return query select * from leaderboard order by score desc, id asc limit 20;
end;
$$;

-- Leaderboard has never had per-row write access before — only admin bulk-delete. These two are
-- member-only (no anonymous/password path exists for leaderboard rows at all): a valid member
-- whose id matches the row's member_id can edit their own entry's message (never the score, so
-- nobody can rewrite their way onto the board) or delete their own entry outright.
create or replace function edit_leaderboard_entry(p_id bigint, p_message text, p_member_name text, p_member_password text)
returns setof leaderboard
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_member_id bigint;
begin
  v_member_id := verify_member(p_member_name, p_member_password);
  update leaderboard set message = left(p_message, 80) where id = p_id and member_id = v_member_id;
  if not found then
    raise exception 'not_owner';
  end if;
  return query select * from leaderboard order by score desc, id asc limit 20;
end;
$$;

create or replace function delete_leaderboard_entry(p_id bigint, p_member_name text, p_member_password text)
returns setof leaderboard
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_member_id bigint;
begin
  v_member_id := verify_member(p_member_name, p_member_password);
  delete from leaderboard where id = p_id and member_id = v_member_id;
  if not found then
    raise exception 'not_owner';
  end if;
  return query select * from leaderboard order by score desc, id asc limit 20;
end;
$$;

-- Signature changed each time a param was added (p_parent_id, then attachment, then membership) —
-- drop the prior overload so it doesn't linger alongside the current one.
drop function if exists add_guestbook_entry(text, text, text, bigint, text, text);

-- Member path (both p_member_name/p_member_password given) verifies via verify_member(), records
-- member_id, and uses the member's own registered name as-is (the raw p_name argument is ignored
-- in that case, so a logged-in member can never post under a different display name) — no password
-- is ever hashed for a member-owned row, since ownership going forward is member_id, not a per-row
-- password. The guest path (member params absent) is unchanged except the saved name now gets
-- "(Guest)" appended, so at-a-glance every listing shows who's a registered member and who isn't.
create or replace function add_guestbook_entry(
  p_name text, p_message text, p_password text default null, p_parent_id bigint default null,
  p_attachment_data text default null, p_attachment_type text default null,
  p_member_name text default null, p_member_password text default null
)
returns setof guestbook_public
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_member_id bigint;
  v_final_name text;
  v_password_hash text;
begin
  if p_member_name is not null and p_member_password is not null then
    v_member_id := verify_member(p_member_name, p_member_password);
    v_final_name := p_member_name;
    v_password_hash := null;
  else
    v_member_id := null;
    v_final_name := left(p_name, 20) || '(Guest)';
    -- A blank/absent password stores a null hash (see the column's comment) rather than hashing an
    -- empty string — otherwise anyone leaving the password field blank on a later edit/delete
    -- attempt would match every other password-less entry too.
    v_password_hash := case when p_password is null or p_password = '' then null else crypt(p_password, gen_salt('bf')) end;
  end if;

  insert into guestbook (name, message, password_hash, parent_id, attachment_data, attachment_type, member_id)
  values (
    v_final_name,
    left(p_message, 500),
    v_password_hash,
    p_parent_id,
    p_attachment_data,
    case when p_attachment_type in ('image', 'video') then p_attachment_type else null end,
    v_member_id
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

drop function if exists edit_guestbook_entry(bigint, text, text, text, text);

-- p_attachment_data left null means "leave the existing attachment alone" (coalesce keeps it);
-- passing a new data: URL replaces both attachment_data and attachment_type together, since a lone
-- attachment_type with no matching data would be meaningless. Member path (both p_member_name/
-- p_member_password given) bypasses password_hash entirely — it only requires that the verified
-- member's id match this row's member_id — since a logged-in member never had a per-row password
-- to begin with.
create or replace function edit_guestbook_entry(
  p_id bigint, p_message text, p_password text default null,
  p_attachment_data text default null, p_attachment_type text default null,
  p_member_name text default null, p_member_password text default null
)
returns setof guestbook_public
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
  v_member_id bigint;
begin
  if p_member_name is not null and p_member_password is not null then
    v_member_id := verify_member(p_member_name, p_member_password);
    if not exists (select 1 from guestbook where id = p_id and member_id = v_member_id) then
      raise exception 'not_owner';
    end if;
  else
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
  end if;

  update guestbook
  set message = left(p_message, 500),
      attachment_data = coalesce(p_attachment_data, attachment_data),
      attachment_type = case
        when p_attachment_data is not null then case when p_attachment_type in ('image', 'video') then p_attachment_type else null end
        else attachment_type
      end
  where id = p_id;

  return query select * from guestbook_public order by id desc limit 50;
end;
$$;

drop function if exists delete_guestbook_entry(bigint, text);

-- Member path bypasses password_hash entirely — same ownership-by-member_id rationale as
-- edit_guestbook_entry above.
create or replace function delete_guestbook_entry(
  p_id bigint, p_password text default null,
  p_member_name text default null, p_member_password text default null
)
returns setof guestbook_public
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
  v_member_id bigint;
begin
  if p_member_name is not null and p_member_password is not null then
    v_member_id := verify_member(p_member_name, p_member_password);
    if not exists (select 1 from guestbook where id = p_id and member_id = v_member_id) then
      raise exception 'not_owner';
    end if;
  else
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

-- Bare headcount for the "n Crews" welcome-row stat — public (no credentials required), unlike
-- members_public/list_members(), since a total count alone carries no personal information.
create or replace function count_members()
returns integer
language sql security definer set search_path = public as $$
  select count(*)::integer from members;
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

-- BDJ Membership: same stateless "resend the password every call, verify server-side" model as
-- admin above — there's no Supabase Auth session, just a members row and a bcrypt hash. This
-- helper is NOT granted to anon/authenticated (see the grants section) — it only exists to be
-- called from inside the other security definer functions below, so it can't be hit directly as a
-- password-guessing oracle of its own.
create or replace function verify_member(p_name text, p_password text)
returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id bigint;
  v_hash text;
begin
  select id, password_hash into v_id, v_hash from members where name = p_name;
  if not found or v_hash <> crypt(p_password, v_hash) then
    raise exception 'wrong_member_password';
  end if;
  return v_id;
end;
$$;

-- Signature is unchanged from the first version, but the return type gained columns (gender/
-- birthdate/phone/email) so the client has the member's full profile in hand right after signup/
-- login without a separate fetch — CREATE OR REPLACE can't change a return type, so this needs an
-- explicit drop first.
drop function if exists member_signup(text, text, text, text, date, text, text);
drop function if exists member_login(text, text);

-- `name` is the login handle, so it must be unique — raises name_taken rather than silently
-- colliding with an existing account (two real people can share a Korean name; the second one just
-- has to pick a distinguishing variation).
create or replace function member_signup(
  p_name text, p_password text, p_photo_data text default null,
  p_gender text default null, p_birthdate date default null,
  p_phone text default null, p_email text default null
)
returns table(id bigint, name text, photo_data text, gender text, birthdate date, phone text, email text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_name text := left(trim(p_name), 20);
begin
  -- Korean-only name, digits-only password — enforced here too (not just client-side in main.ts),
  -- same defense-in-depth as every other validation in this function.
  if v_name is null or length(v_name) = 0 or v_name !~ '^[가-힣]+$' then
    raise exception 'invalid_name';
  end if;
  if p_password is null or length(p_password) = 0 or p_password !~ '^[0-9]+$' then
    raise exception 'invalid_password';
  end if;
  if p_gender not in ('male', 'female') then
    raise exception 'invalid_gender';
  end if;
  if exists (select 1 from members m where m.name = v_name) then
    raise exception 'name_taken';
  end if;

  insert into members (name, password_hash, photo_data, gender, birthdate, phone, email)
  values (
    v_name,
    crypt(p_password, gen_salt('bf')),
    p_photo_data,
    p_gender,
    p_birthdate,
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), '')
  );

  return query select m.id, m.name, m.photo_data, m.gender, m.birthdate, m.phone, m.email from members m where m.name = v_name;
end;
$$;

create or replace function member_login(p_name text, p_password text)
returns table(id bigint, name text, photo_data text, gender text, birthdate date, phone text, email text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id bigint;
begin
  v_id := verify_member(p_name, p_password);
  return query select m.id, m.name, m.photo_data, m.gender, m.birthdate, m.phone, m.email from members m where m.id = v_id;
end;
$$;

-- Signature gained a trailing param (p_new_password) — drop the prior 7-arg overload first.
drop function if exists member_update_profile(text, text, text, date, text, text, text);

-- Profile edit: re-verifies the password fresh (typed into the profile modal, not silently reused
-- from the cached login credentials) — same "re-enter the current password even though already
-- logged in" caution as admin_change_password. Gender stays required (can't be cleared back to
-- null); birthdate/phone/email are directly set from the form (blank clears them, unlike
-- add/edit_guestbook_entry's coalesce-on-null pattern, since this form always shows the current
-- value and resubmits it as-is when unchanged); a skipped photo re-upload (p_new_photo_data null)
-- keeps the existing one via coalesce. p_new_password is optional (null/blank = keep the current
-- one) — same digits-only rule as signup, enforced here too since the client-side check alone
-- never stops a direct API call.
create or replace function member_update_profile(
  p_name text, p_password text, p_gender text,
  p_birthdate date default null, p_phone text default null, p_email text default null,
  p_new_photo_data text default null, p_new_password text default null
)
returns table(id bigint, name text, photo_data text, gender text, birthdate date, phone text, email text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id bigint;
begin
  v_id := verify_member(p_name, p_password);
  if p_gender not in ('male', 'female') then
    raise exception 'invalid_gender';
  end if;
  if p_new_password is not null and p_new_password <> '' then
    if p_new_password !~ '^[0-9]+$' then
      raise exception 'invalid_password';
    end if;
    update members m set password_hash = crypt(p_new_password, gen_salt('bf')) where m.id = v_id;
  end if;

  -- The alias-qualified column refs matter: this function's RETURNS TABLE names (id, photo_data,
  -- ...) double as PL/pgSQL variables, so a bare `photo_data`/`id` inside the statement is
  -- ambiguous (variable vs column) and raises at runtime — the same reason member_login's select
  -- qualifies everything with `m.`.
  update members m
  set photo_data = coalesce(p_new_photo_data, m.photo_data),
      gender = p_gender,
      birthdate = p_birthdate,
      phone = nullif(trim(p_phone), ''),
      email = nullif(trim(p_email), '')
  where m.id = v_id;

  return query select m.id, m.name, m.photo_data, m.gender, m.birthdate, m.phone, m.email from members m where m.id = v_id;
end;
$$;

-- Deleting the row is enough on its own — guestbook.member_id/leaderboard.member_id both have
-- `on delete set null`, so past posts/scores stick around unowned rather than vanishing, and no
-- password can ever match a member_id that no longer exists (the guest/password path stays the
-- only way to touch a formerly-member-owned row after this).
create or replace function member_withdraw(p_name text, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id bigint;
begin
  v_id := verify_member(p_name, p_password);
  delete from members where id = v_id;
end;
$$;

-- Crew-only directory read: verify_member() raises wrong_member_password if the caller isn't a
-- real logged-in member, and only then is the roster (including birthdate/phone/email) returned —
-- see members_public's own comment for why that view isn't public on its own.
create or replace function list_members(p_name text, p_password text)
returns setof members_public
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform verify_member(p_name, p_password);
  return query select * from members_public;
end;
$$;

-- Crews direct chat: the client is responsible for only ever offering this against a member who's
-- currently online (there's no DB-level online concept — that's Realtime Presence, see
-- src/game/Presence.ts — so this can't enforce it server-side); here we just verify the sender and
-- that the recipient is a real member. Message delivery to the recipient's open chat window is a
-- separate Realtime Broadcast nudge sent client-side after this succeeds (see
-- src/game/DirectMessages.ts) — this row is the durable copy either side can reload from.
create or replace function send_direct_message(p_name text, p_password text, p_recipient_id bigint, p_message text)
returns direct_messages
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_sender_id bigint;
  v_row direct_messages;
begin
  v_sender_id := verify_member(p_name, p_password);
  if p_recipient_id = v_sender_id then
    raise exception 'cannot_message_self';
  end if;
  if not exists (select 1 from members where id = p_recipient_id) then
    raise exception 'recipient_not_found';
  end if;
  insert into direct_messages (sender_id, recipient_id, message)
  values (v_sender_id, p_recipient_id, left(trim(p_message), 500))
  returning * into v_row;
  return v_row;
end;
$$;

-- Full history between the caller and one other member, oldest first — p_other_member_id can be
-- either side of any given row, so both messaging and being messaged surface the same thread.
create or replace function load_direct_messages(p_name text, p_password text, p_other_member_id bigint)
returns setof direct_messages
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id bigint;
begin
  v_id := verify_member(p_name, p_password);
  return query
    select * from direct_messages
    where (sender_id = v_id and recipient_id = p_other_member_id)
       or (sender_id = p_other_member_id and recipient_id = v_id)
    order by created_at asc;
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

-- No password/identity check — anyone can heart any entry or reply. One-heart-per-browser-per-entry
-- is enforced client-side only (main.ts, via localStorage), which is also what lets a second click
-- toggle it back off via remove_guestbook_heart below.
--
-- Returns just the new count (not setof guestbook_public) so a click doesn't pull down every other
-- entry's data along with it — guestbook_public rows can carry multi-MB base64 attachments, and the
-- client only ever needs this one number to update the clicked button in place. This also means
-- these two functions no longer depend on the view, so they survive its CASCADE drop/recreate.
drop function if exists add_guestbook_heart(bigint);

create or replace function add_guestbook_heart(p_id bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update guestbook set heart_count = heart_count + 1 where id = p_id returning heart_count into v_count;
  if not found then
    raise exception 'not_found';
  end if;
  return v_count;
end;
$$;

create or replace function remove_guestbook_heart(p_id bigint)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update guestbook set heart_count = greatest(heart_count - 1, 0) where id = p_id returning heart_count into v_count;
  if not found then
    raise exception 'not_found';
  end if;
  return v_count;
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

-- Signature gained a trailing param (p_image_data) — drop the prior 3-arg overloads first.
drop function if exists admin_add_social_link(text, text, text);
drop function if exists admin_update_social_link(bigint, text, text, text);

-- p_image_data is optional — when supplied (a data: URL, same base64-in-Postgres pattern as the
-- banner images) it's shown INSTEAD of the platform's built-in SVG icon on the public button; when
-- omitted the platform icon still applies, unchanged from before this column existed.
create or replace function admin_add_social_link(p_platform text, p_url text, p_admin_password text, p_image_data text default null)
returns setof social_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  insert into social_links (platform, url, image_data) values (left(p_platform, 20), left(p_url, 500), p_image_data);
  return query select * from social_links order by id;
end;
$$;

-- p_image_data left null means "leave the existing image alone" (coalesce keeps it) — same
-- leave-untouched-on-null convention as edit_guestbook_entry's attachment handling.
create or replace function admin_update_social_link(p_id bigint, p_platform text, p_url text, p_admin_password text, p_image_data text default null)
returns setof social_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  update social_links set platform = left(p_platform, 20), url = left(p_url, 500), image_data = coalesce(p_image_data, image_data) where id = p_id;
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

-- "Website" banners (see website_links' own comment above) — max 10 rows total, enforced here since
-- there's no natural cap otherwise (unlike site_banner_images' hardcoded 4). title/content each get
-- their own font_size/font_family/bold validated the same way; font_color/border_color/animation
-- apply to the whole banner. None of this is a table CHECK, same rationale as elsewhere in this
-- file (a CHECK wouldn't retroactively apply to an already-existing table).
create or replace function admin_add_website_link(
  p_url text,
  p_title text, p_title_font_size integer, p_title_font_family text, p_title_bold boolean,
  p_content text, p_content_font_size integer, p_content_font_family text, p_content_bold boolean,
  p_font_color text, p_border_color text, p_animation text, p_admin_password text
)
returns setof website_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  if (select count(*) from website_links) >= 10 then
    raise exception 'too_many_links';
  end if;
  if p_title_font_size < 8 or p_title_font_size > 32 or p_content_font_size < 8 or p_content_font_size > 32 then
    raise exception 'invalid_font_size';
  end if;
  if p_title_font_family not in ('body', 'display', 'graffiti') or p_content_font_family not in ('body', 'display', 'graffiti') then
    raise exception 'invalid_font_family';
  end if;
  if p_animation not in ('none', 'pulse', 'bounce', 'fade', 'glow') then
    raise exception 'invalid_animation';
  end if;
  if p_font_color !~ '^#[0-9a-fA-F]{6}$' or p_border_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid_color';
  end if;
  insert into website_links (
    url, title, title_font_size, title_font_family, title_bold,
    content, content_font_size, content_font_family, content_bold,
    font_color, border_color, animation, sort_order
  )
  values (
    left(p_url, 500), left(p_title, 20), p_title_font_size, p_title_font_family, p_title_bold,
    left(p_content, 60), p_content_font_size, p_content_font_family, p_content_bold,
    p_font_color, p_border_color, p_animation,
    coalesce((select max(sort_order) + 1 from website_links), 0)
  );
  return query select * from website_links order by sort_order;
end;
$$;

create or replace function admin_update_website_link(
  p_id bigint, p_url text,
  p_title text, p_title_font_size integer, p_title_font_family text, p_title_bold boolean,
  p_content text, p_content_font_size integer, p_content_font_family text, p_content_bold boolean,
  p_font_color text, p_border_color text, p_animation text, p_admin_password text
)
returns setof website_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  if p_title_font_size < 8 or p_title_font_size > 32 or p_content_font_size < 8 or p_content_font_size > 32 then
    raise exception 'invalid_font_size';
  end if;
  if p_title_font_family not in ('body', 'display', 'graffiti') or p_content_font_family not in ('body', 'display', 'graffiti') then
    raise exception 'invalid_font_family';
  end if;
  if p_animation not in ('none', 'pulse', 'bounce', 'fade', 'glow') then
    raise exception 'invalid_animation';
  end if;
  if p_font_color !~ '^#[0-9a-fA-F]{6}$' or p_border_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid_color';
  end if;
  update website_links set
    url = left(p_url, 500),
    title = left(p_title, 20), title_font_size = p_title_font_size, title_font_family = p_title_font_family, title_bold = p_title_bold,
    content = left(p_content, 60), content_font_size = p_content_font_size, content_font_family = p_content_font_family, content_bold = p_content_bold,
    font_color = p_font_color, border_color = p_border_color, animation = p_animation
  where id = p_id;
  return query select * from website_links order by sort_order;
end;
$$;

create or replace function admin_delete_website_link(p_id bigint, p_admin_password text)
returns setof website_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  delete from website_links where id = p_id;
  return query select * from website_links order by sort_order;
end;
$$;

-- "Beejay Bros" link buttons (see beejay_bros_links' own comment above) — max 10 rows, same cap
-- reasoning as website_links.
create or replace function admin_add_beejay_bros_link(p_url text, p_text text, p_admin_password text)
returns setof beejay_bros_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  if (select count(*) from beejay_bros_links) >= 10 then
    raise exception 'too_many_links';
  end if;
  insert into beejay_bros_links (url, text, sort_order)
  values (left(p_url, 500), left(p_text, 40), coalesce((select max(sort_order) + 1 from beejay_bros_links), 0));
  return query select * from beejay_bros_links order by sort_order;
end;
$$;

create or replace function admin_update_beejay_bros_link(p_id bigint, p_url text, p_text text, p_admin_password text)
returns setof beejay_bros_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  update beejay_bros_links set url = left(p_url, 500), text = left(p_text, 40) where id = p_id;
  return query select * from beejay_bros_links order by sort_order;
end;
$$;

create or replace function admin_delete_beejay_bros_link(p_id bigint, p_admin_password text)
returns setof beejay_bros_links
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  delete from beejay_bros_links where id = p_id;
  return query select * from beejay_bros_links order by sort_order;
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

-- [Skin design set]: the admin's site-wide choice between the two full visual skins ('original'
-- cyberpunk vs 'ai' neutral-dark/emerald) — same shape as admin_set_chatbot_mode above.
create or replace function admin_set_skin_design(p_skin text, p_admin_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_login(p_admin_password) then
    raise exception 'wrong_password';
  end if;
  if p_skin not in ('original', 'ai', 'frosted', 'agentic', 'uxbooster') then
    raise exception 'invalid_skin';
  end if;
  update site_notice set skin_design = p_skin, updated_at = now() where id = 1;
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

grant execute on function submit_score(text, text, integer, text, text, text, text, integer, text, text) to anon, authenticated;
grant execute on function edit_leaderboard_entry(bigint, text, text, text) to anon, authenticated;
grant execute on function delete_leaderboard_entry(bigint, text, text) to anon, authenticated;
grant execute on function add_guestbook_entry(text, text, text, bigint, text, text, text, text) to anon, authenticated;
grant execute on function edit_guestbook_entry(bigint, text, text, text, text, text, text) to anon, authenticated;
grant execute on function delete_guestbook_entry(bigint, text, text, text) to anon, authenticated;
grant execute on function add_guestbook_heart(bigint) to anon, authenticated;
grant execute on function remove_guestbook_heart(bigint) to anon, authenticated;
grant execute on function increment_visits() to anon, authenticated;
grant execute on function count_members() to anon, authenticated;
grant execute on function admin_login(text) to anon, authenticated;
grant execute on function admin_change_password(text, text) to anon, authenticated;
-- verify_member is intentionally NOT granted — see its own comment above, it's an internal-only
-- helper called from within these other security definer functions, not something the client calls.
grant execute on function member_signup(text, text, text, text, date, text, text) to anon, authenticated;
grant execute on function member_login(text, text) to anon, authenticated;
grant execute on function member_update_profile(text, text, text, date, text, text, text, text) to anon, authenticated;
grant execute on function member_withdraw(text, text) to anon, authenticated;
grant execute on function list_members(text, text) to anon, authenticated;
grant execute on function send_direct_message(text, text, bigint, text) to anon, authenticated;
grant execute on function load_direct_messages(text, text, bigint) to anon, authenticated;
grant execute on function admin_delete_guestbook_entries(bigint[], text) to anon, authenticated;
grant execute on function admin_delete_leaderboard_entries(bigint[], text) to anon, authenticated;
grant execute on function admin_add_social_link(text, text, text, text) to anon, authenticated;
grant execute on function admin_update_social_link(bigint, text, text, text, text) to anon, authenticated;
grant execute on function admin_delete_social_link(bigint, text) to anon, authenticated;
grant execute on function admin_set_banner(text, text, text, text) to anon, authenticated;
grant execute on function admin_set_chatbot_mode(text, text) to anon, authenticated;
grant execute on function admin_set_skin_design(text, text) to anon, authenticated;
grant execute on function admin_add_banner_images(text[], text) to anon, authenticated;
grant execute on function admin_delete_banner_image(bigint, text) to anon, authenticated;
grant execute on function admin_add_website_link(text, text, integer, text, boolean, text, integer, text, boolean, text, text, text, text) to anon, authenticated;
grant execute on function admin_update_website_link(bigint, text, text, integer, text, boolean, text, integer, text, boolean, text, text, text, text) to anon, authenticated;
grant execute on function admin_delete_website_link(bigint, text) to anon, authenticated;
grant execute on function admin_add_beejay_bros_link(text, text, text) to anon, authenticated;
grant execute on function admin_update_beejay_bros_link(bigint, text, text, text) to anon, authenticated;
grant execute on function admin_delete_beejay_bros_link(bigint, text) to anon, authenticated;
