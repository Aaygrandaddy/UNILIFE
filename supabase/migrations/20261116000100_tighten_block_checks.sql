-- Players may only learn whether someone has blocked *them*, not who blocks whom.
create function public.has_blocked_me(other uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.blocks where blocker = other and blocked = auth.uid());
$$;
drop policy "send snaps unless blocked" on public.snaps;
create policy "send snaps unless blocked" on public.snaps for insert to authenticated
  with check (sender = (select auth.uid()) and recipient <> sender and not public.has_blocked_me(recipient));
revoke execute on function public.is_blocked(uuid, uuid) from authenticated, anon, public;
revoke execute on function public.handle_new_user() from authenticated, anon, public;
revoke execute on function public.has_blocked_me(uuid) from anon, public;
grant execute on function public.has_blocked_me(uuid) to authenticated;
