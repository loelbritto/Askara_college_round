begin;

-- These tables are deliberately outside the exposed public schema.
create schema if not exists second_opinion_private;
revoke all on schema second_opinion_private from public, anon, authenticated;
create table second_opinion_private.request_limits (
  key text primary key check (length(key)=64),
  count integer not null,
  expires_at timestamptz not null
);
alter table second_opinion_private.request_limits enable row level security;
revoke all on second_opinion_private.request_limits from public, anon, authenticated;

-- Return only the caller's identity, never a caller-supplied user/session ID.
-- auth.jwt() is populated by the gateway after signature/expiry validation.
create function public.so_current_session() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('sid',s.id,'userId',s.user_id,'exp',(auth.jwt()->>'exp')::bigint)
  from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id=(auth.jwt()->>'session_id')::uuid
    and s.user_id=auth.uid()
    and (u.banned_until is null or u.banned_until <= now())
    and (s.not_after is null or s.not_after > now())
    and (auth.jwt()->>'exp')::bigint > extract(epoch from now())
$$;
revoke all on function public.so_current_session() from public, anon;
grant execute on function public.so_current_session() to authenticated;

-- One atomic upsert serializes concurrent requests for a given key across all
-- application instances. Only the server secret key can call this function.
create function public.so_take_limit(p_key text,p_limit integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  if p_key is null or p_limit is null or p_key !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid limit arguments';
  end if;
  delete from second_opinion_private.request_limits where expires_at <= now();
  insert into second_opinion_private.request_limits as limits (key,count,expires_at)
  values(p_key,1,now()+interval '1 minute')
  on conflict(key) do update set count=least(limits.count+1,p_limit+1)
  returning count into used;
  return used <= p_limit;
end
$$;
revoke all on function public.so_take_limit(text,integer) from public, anon, authenticated;
grant execute on function public.so_take_limit(text,integer) to service_role;

commit;
