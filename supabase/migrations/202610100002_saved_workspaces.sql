begin;
create table public.so_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(title) between 1 and 100),
  latest_version integer not null default 0,
  updated_at timestamptz not null default now()
);
create table public.so_workspace_versions (
  workspace_id uuid not null references public.so_workspaces(id) on delete cascade,
  version integer not null check(version between 1 and 20),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=2097152),
  created_at timestamptz not null default now(),
  primary key(workspace_id,version)
);
alter table public.so_workspaces enable row level security;
alter table public.so_workspace_versions enable row level security;
revoke all on public.so_workspaces,public.so_workspace_versions from public,anon,authenticated;
grant select on public.so_workspaces,public.so_workspace_versions to authenticated;
create policy so_owner_read on public.so_workspaces for select to authenticated
  using(owner_id=(select auth.uid()) and (select public.so_current_session()) is not null);
create policy so_version_read on public.so_workspace_versions for select to authenticated
  using(exists(select 1 from public.so_workspaces w where w.id=workspace_id));

create function public.so_save_workspace(p_title text,p_payload jsonb,p_workspace_id uuid default null,p_expected_version integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare record_id uuid; current_version integer; total_bytes bigint;
begin
  if public.so_current_session() is null then raise sqlstate 'PT401' using message='SESSION_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<0 or p_expected_version>20 then raise sqlstate 'PT400' using message='INVALID_VERSION'; end if;
  if length(trim(p_title)) not between 1 and 100 or jsonb_typeof(p_payload)<>'object'
    or p_payload->>'format' is distinct from 'second-opinion-workspace'
    or p_payload->>'version' is distinct from '1' then raise sqlstate 'PT400' using message='INVALID_ARCHIVE'; end if;
  if octet_length(p_payload::text)>2097152 then raise sqlstate 'PT413' using message='STORAGE_LIMIT'; end if;
  -- Serialize saving against the pilot's global storage budget and version checks.
  -- This is a small bounded pilot, not a high-throughput document store.
  perform pg_advisory_xact_lock(1827301026);
  select coalesce(sum(octet_length(payload::text)),0) into total_bytes from public.so_workspace_versions;
  if total_bytes+octet_length(p_payload::text)>209715200 then raise sqlstate 'PT413' using message='STORAGE_LIMIT'; end if;
  if p_workspace_id is null then
    if p_expected_version<>0 then raise sqlstate 'PT409' using message='SAVE_CONFLICT'; end if;
    if (select count(*) from public.so_workspaces where owner_id=auth.uid())>=5 then raise sqlstate 'PT413' using message='STORAGE_LIMIT'; end if;
    insert into public.so_workspaces(owner_id,title) values(auth.uid(),trim(p_title)) returning id into record_id;
    current_version:=0;
  else
    select id,latest_version into record_id,current_version from public.so_workspaces where id=p_workspace_id and owner_id=auth.uid() for update;
    if record_id is null then raise sqlstate 'PT404' using message='WORKSPACE_NOT_FOUND'; end if;
  end if;
  if current_version<>p_expected_version then raise sqlstate 'PT409' using message='SAVE_CONFLICT'; end if;
  if current_version>=20 then raise sqlstate 'PT413' using message='STORAGE_LIMIT'; end if;
  insert into public.so_workspace_versions(workspace_id,version,payload) values(record_id,current_version+1,p_payload);
  update public.so_workspaces set title=trim(p_title),latest_version=current_version+1,updated_at=now() where id=record_id;
  return jsonb_build_object('id',record_id,'version',current_version+1);
end
$$;

create function public.so_list_workspaces() returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(item order by item->>'updatedAt' desc),'[]'::jsonb) from (
    select jsonb_build_object('id',w.id,'title',w.title,'version',w.latest_version,'updatedAt',w.updated_at,
      'versions',(select jsonb_agg(v.version order by v.version desc) from public.so_workspace_versions v where v.workspace_id=w.id)) item
    from public.so_workspaces w
  ) records
$$;
create function public.so_load_workspace(p_workspace_id uuid,p_version integer) returns jsonb language sql stable security invoker set search_path='' as $$
  select v.payload from public.so_workspace_versions v where v.workspace_id=p_workspace_id and v.version=p_version
$$;
create function public.so_delete_workspace(p_workspace_id uuid,p_expected_version integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_version integer;
begin
  if public.so_current_session() is null then raise sqlstate 'PT401' using message='SESSION_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<1 or p_expected_version>20 then raise sqlstate 'PT400' using message='INVALID_VERSION'; end if;
  select latest_version into current_version from public.so_workspaces where id=p_workspace_id and owner_id=auth.uid() for update;
  if current_version is null then return false; end if;
  if current_version<>p_expected_version then raise sqlstate 'PT409' using message='SAVE_CONFLICT'; end if;
  delete from public.so_workspaces where id=p_workspace_id and owner_id=auth.uid();
  return true;
end
$$;
revoke all on function public.so_save_workspace(text,jsonb,uuid,integer),public.so_list_workspaces(),public.so_load_workspace(uuid,integer),public.so_delete_workspace(uuid,integer) from public,anon;
grant execute on function public.so_save_workspace(text,jsonb,uuid,integer),public.so_list_workspaces(),public.so_load_workspace(uuid,integer),public.so_delete_workspace(uuid,integer) to authenticated;
commit;
