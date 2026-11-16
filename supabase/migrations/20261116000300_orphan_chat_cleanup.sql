-- A conversation is deleted once both participants have deleted their accounts.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = 'PT401'; end if;
  delete from auth.users where id = me;   -- cascades to profile, save, posts, snaps, blocks
  delete from public.chats c
   where me = any (c.members)
     and not exists (select 1 from auth.users u where u.id = any (c.members));
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
-- one-off: remove conversations whose participants are all gone
delete from public.chats c where not exists (select 1 from auth.users u where u.id = any (c.members));
