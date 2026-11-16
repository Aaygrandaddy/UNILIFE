-- Use PostgREST's PT codes so blocked or too-fast sends return 403 / 429 instead of 500.
create or replace function public.send_message(other uuid, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t text := left(btrim(body), 1000);
  a text; b text; cid text;
begin
  if me is null then raise exception 'Sign in to send messages' using errcode = 'PT401'; end if;
  if t = '' then return; end if;
  if other = me then raise exception 'You cannot message yourself' using errcode = 'PT400'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'Player not found' using errcode = 'PT404'; end if;
  if public.is_blocked(other, me) then raise exception 'You can’t message this player.' using errcode = 'PT403'; end if;
  if (select count(*) from public.messages where sender = me and at > now() - interval '1 minute') >= 30 then
    raise exception 'You are sending messages too fast. Wait a minute.' using errcode = 'PT429';
  end if;
  a := least(me::text collate "C", other::text collate "C");
  b := greatest(me::text collate "C", other::text collate "C");
  cid := a || '_' || b;
  insert into public.chats (id, members, last_text, updated_at) values (cid, array[a::uuid, b::uuid], t, now())
  on conflict (id) do update set last_text = excluded.last_text, updated_at = now();
  insert into public.messages (chat_id, sender, body) values (cid, me, t);
end $$;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;
