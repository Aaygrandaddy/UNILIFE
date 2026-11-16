-- Force Life database: accounts, chat, posts, snaps, saves, safety.
-- Every table has Row Level Security. Writes that need cross-checks (sending a message,
-- liking, deleting an account, exporting data) go through security-definer functions.

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 30),
  dept text not null default '' check (char_length(dept) <= 60),
  level text not null default '100' check (char_length(level) <= 4),
  skin int not null default 0 check (skin between 0 and 10),
  consent_version text not null check (char_length(consent_version) between 1 and 20),
  consent_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "signed-in players can see profiles" on public.profiles for select to authenticated using (true);
create policy "players update their own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- other players see only public columns; username and consent can never be changed by the client
revoke all on public.profiles from anon, authenticated;
grant select (id, username, display_name, dept, level, skin, last_seen) on public.profiles to authenticated;
grant update (display_name, dept, level, skin, last_seen) on public.profiles to authenticated;

-- The profile is created by the database at sign-up, from the details the game sends.
-- Sign-up fails unless the player accepted the Terms and Privacy Policy.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m jsonb := new.raw_user_meta_data;
begin
  if coalesce(m->>'consent_version', '') = '' then
    raise exception 'Accept the Terms and Privacy Policy to create an account';
  end if;
  insert into public.profiles (id, username, display_name, dept, level, skin, consent_version)
  values (
    new.id,
    lower(m->>'username'),
    left(coalesce(nullif(btrim(m->>'display_name'), ''), m->>'username'), 30),
    left(coalesce(m->>'dept', ''), 60),
    left(coalesce(m->>'level', '100'), 4),
    least(greatest(coalesce((m->>'skin')::int, 0), 0), 10),
    m->>'consent_version'
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.username_available(name text) returns boolean
language sql security definer stable set search_path = '' as $$
  select not exists (select 1 from public.profiles where username = lower(name));
$$;

-- ---------- blocks (private to the blocker) ----------
create table public.blocks (
  blocker uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy "see own blocks" on public.blocks for select to authenticated using (blocker = (select auth.uid()));
create policy "add own blocks" on public.blocks for insert to authenticated with check (blocker = (select auth.uid()));
create policy "remove own blocks" on public.blocks for delete to authenticated using (blocker = (select auth.uid()));

create function public.is_blocked(by_player uuid, target uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.blocks where blocker = by_player and blocked = target);
$$;

-- ---------- saved progress ----------
create table public.saves (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null check (pg_column_size(data) < 8192),
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
create policy "own save only" on public.saves for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- chats and messages ----------
create table public.chats (
  id text primary key,
  members uuid[] not null check (cardinality(members) = 2),
  last_text text not null default '' check (char_length(last_text) <= 1000),
  updated_at timestamptz not null default now()
);
create index chats_members_idx on public.chats using gin (members);
alter table public.chats enable row level security;
create policy "members see their chats" on public.chats for select to authenticated using ((select auth.uid()) = any (members));

create table public.messages (
  id bigint generated always as identity primary key,
  chat_id text not null references public.chats (id) on delete cascade,
  sender uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  at timestamptz not null default now()
);
create index messages_chat_idx on public.messages (chat_id, at);
create index messages_sender_idx on public.messages (sender, at);
alter table public.messages enable row level security;
create policy "members read messages" on public.messages for select to authenticated
  using (exists (select 1 from public.chats c where c.id = chat_id and (select auth.uid()) = any (c.members)));

-- The only way to send: checks blocks, trims, rate-limits, and keeps the chat summary in step.
create function public.send_message(other uuid, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t text := left(btrim(body), 1000);
  a text; b text; cid text;
begin
  if me is null then raise exception 'Sign in to send messages'; end if;
  if t = '' then return; end if;
  if other = me then raise exception 'You cannot message yourself'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'Player not found'; end if;
  if public.is_blocked(other, me) then raise exception 'You can’t message this player.' using errcode = 'P0403'; end if;
  if (select count(*) from public.messages where sender = me and at > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too fast. Wait a minute.' using errcode = 'P0429';
  end if;
  a := least(me::text collate "C", other::text collate "C");
  b := greatest(me::text collate "C", other::text collate "C");
  cid := a || '_' || b;
  insert into public.chats (id, members, last_text, updated_at) values (cid, array[a::uuid, b::uuid], t, now())
  on conflict (id) do update set last_text = excluded.last_text, updated_at = now();
  insert into public.messages (chat_id, sender, body) values (cid, me, t);
end $$;

-- ---------- posts (Yarn and Frame) ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 30),
  username text not null,
  kind text not null check (kind in ('yarn', 'frame')),
  body text not null default '' check (char_length(body) <= 280),
  image text check (image is null or char_length(image) < 400000),
  at timestamptz not null default now(),
  likes uuid[] not null default '{}',
  check (kind = 'yarn' or image is not null)
);
create index posts_kind_at_idx on public.posts (kind, at desc);
create index posts_user_idx on public.posts (user_id);
alter table public.posts enable row level security;
create policy "signed-in players read posts" on public.posts for select to authenticated using (true);
create policy "players post as themselves" on public.posts for insert to authenticated
  with check (user_id = (select auth.uid()) and likes = '{}'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.username = posts.username));
create policy "authors delete their posts" on public.posts for delete to authenticated using (user_id = (select auth.uid()));

create function public.toggle_like(post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in to like posts'; end if;
  update public.posts
     set likes = case when me = any (likes) then array_remove(likes, me) else array_append(likes, me) end
   where id = post;
end $$;

-- ---------- snaps (Flash) ----------
create table public.snaps (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_name text not null check (char_length(sender_name) <= 30),
  recipient uuid not null references auth.users (id) on delete cascade,
  image text not null check (char_length(image) < 400000),
  at timestamptz not null default now(),
  expire_at timestamptz not null default now() + interval '30 days'
);
create index snaps_recipient_idx on public.snaps (recipient);
alter table public.snaps enable row level security;
create policy "recipient opens snaps" on public.snaps for select to authenticated using (recipient = (select auth.uid()));
create policy "recipient deletes snaps" on public.snaps for delete to authenticated using (recipient = (select auth.uid()));
create policy "send snaps unless blocked" on public.snaps for insert to authenticated
  with check (sender = (select auth.uid()) and recipient <> sender and not public.is_blocked(recipient, (select auth.uid())));

-- ---------- reports (write-only for players) ----------
create table public.reports (
  id bigint generated always as identity primary key,
  reporter uuid default auth.uid() references auth.users (id) on delete set null,
  target uuid not null,
  kind text not null check (kind in ('user', 'message', 'post', 'snap')),
  ref_id text not null default '' check (char_length(ref_id) <= 100),
  reason text not null check (char_length(reason) <= 100),
  excerpt text not null default '' check (char_length(excerpt) <= 500),
  at timestamptz not null default now(),
  expire_at timestamptz not null default now() + interval '365 days'
);
alter table public.reports enable row level security;
create policy "players file reports" on public.reports for insert to authenticated with check (reporter = (select auth.uid()));

-- ---------- account deletion and data export (NDPA rights) ----------
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = auth.uid();   -- cascades to profile, save, posts, snaps, blocks
end $$;

create function public.export_my_data() returns jsonb
language sql security definer stable set search_path = '' as $$
  select jsonb_build_object(
    'exportedAt', now(),
    'account', (select jsonb_build_object('email', email, 'created', created_at, 'lastSignIn', last_sign_in_at) from auth.users where id = auth.uid()),
    'profile', (select to_jsonb(p) from public.profiles p where id = auth.uid()),
    'savedProgress', (select data from public.saves where user_id = auth.uid()),
    'posts', coalesce((select jsonb_agg(to_jsonb(x) - 'likes') from public.posts x where user_id = auth.uid()), '[]'),
    'messagesYouSent', coalesce((select jsonb_agg(jsonb_build_object('chat', chat_id, 'text', body, 'at', at)) from public.messages where sender = auth.uid()), '[]'),
    'playersYouBlocked', coalesce((select jsonb_agg(blocked) from public.blocks where blocker = auth.uid()), '[]'),
    'reportsYouFiled', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'reason', reason, 'at', at)) from public.reports where reporter = auth.uid()), '[]')
  );
$$;

-- functions: only signed-in players, except the username check used on the sign-up form
revoke execute on all functions in schema public from public, anon;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.send_message(uuid, text), public.toggle_like(uuid), public.delete_my_account(), public.export_my_data(), public.is_blocked(uuid, uuid) to authenticated;

-- ---------- live updates ----------
alter publication supabase_realtime add table public.messages, public.chats, public.posts, public.snaps;

-- ---------- retention: delete expired snaps and reports every night ----------
create extension if not exists pg_cron;
select cron.schedule('force-life-expire', '17 3 * * *', $$
  delete from public.snaps where expire_at < now();
  delete from public.reports where expire_at < now();
$$);
