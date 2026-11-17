-- Run in the project's Supabase SQL Editor as the database owner.
-- Idempotent setup: it never seeds operational guests or replaces existing data.
begin;

create table if not exists public.rsas_members (
  event_id text not null check (event_id = 'rsas-2026-11-19'),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('coordinator', 'operator')),
  station_id text not null check (station_id in ('T01','T02','T03','T04','T05','T06')),
  primary key (event_id, user_id)
);
create table if not exists public.rsas_devices (
  event_id text not null,
  device_id uuid not null,
  owner_id uuid not null references auth.users(id),
  primary key (event_id, device_id)
);
create table if not exists public.rsas_packages (
  event_id text not null,
  package_version integer not null check (package_version > 0),
  payload jsonb not null,
  created_by uuid not null references auth.users(id),
  received_at timestamptz not null default now(),
  primary key (event_id, package_version)
);
create table if not exists public.rsas_records (
  seq bigint generated always as identity unique,
  event_id text not null,
  record_id uuid not null,
  payload jsonb not null,
  created_by uuid not null references auth.users(id),
  received_at timestamptz not null default now(),
  primary key (event_id, record_id)
);

alter table public.rsas_members enable row level security;
alter table public.rsas_devices enable row level security;
alter table public.rsas_packages enable row level security;
alter table public.rsas_records enable row level security;
drop policy if exists rsas_member_self on public.rsas_members;
create policy rsas_member_self on public.rsas_members for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists rsas_device_self on public.rsas_devices;
create policy rsas_device_self on public.rsas_devices for select to authenticated
using (owner_id = (select auth.uid()));
drop policy if exists rsas_package_read on public.rsas_packages;
create policy rsas_package_read on public.rsas_packages for select to authenticated
using (exists (select 1 from public.rsas_members m where m.event_id = rsas_packages.event_id and m.user_id = (select auth.uid())));
drop policy if exists rsas_record_read on public.rsas_records;
create policy rsas_record_read on public.rsas_records for select to authenticated
using (exists (select 1 from public.rsas_members m where m.event_id = rsas_records.event_id and m.user_id = (select auth.uid())));

revoke all on public.rsas_members, public.rsas_devices, public.rsas_packages, public.rsas_records from public, anon, authenticated;
grant select on public.rsas_members, public.rsas_devices, public.rsas_packages, public.rsas_records to authenticated;
revoke all on sequence public.rsas_records_seq_seq from public, anon, authenticated;

create or replace function public.rsas_status(p_event text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare member public.rsas_members;
begin
  select * into member from public.rsas_members where event_id = p_event and user_id = auth.uid();
  if not found then raise exception 'RSAS_MEMBER_REQUIRED' using errcode = '42501'; end if;
  return jsonb_build_object('role', member.role, 'station_id', member.station_id);
end;
$$;

create or replace function public.rsas_valid_slot(s jsonb)
returns boolean language sql immutable set search_path = '' as $$
select coalesce(
  jsonb_typeof(s) = 'object'
  and s ?& array['id','code','name','label','organization','group','category','kind','status','representative','desk','rsvp','tokenHash']
  and not exists (select 1 from jsonb_object_keys(s) k where k <> all(array['id','code','name','label','organization','group','category','kind','status','representative','desk','rsvp','tokenHash']))
  and s->>'id' ~ '^[A-Za-z0-9_-]{1,100}$' and s->>'code' ~ '^[A-Za-z0-9_-]{1,100}$'
  and s->>'tokenHash' ~ '^[a-f0-9]{64}$'
  and s->>'category' in ('REGULER','VIP','VVIP') and s->>'kind' in ('person','institution')
  and s->>'status' in ('active','cancelled','extra') and s->>'rsvp' = 'unknown'
  and length(btrim(s->>'label')) > 0
  and (s->>'status' <> 'active' or s->>'kind' <> 'person' or length(btrim(s->>'name')) > 0)
  and not exists (select 1 from unnest(array['name','label','organization','group','representative','desk']) k where jsonb_typeof(s->k) is distinct from 'string' or length(s->>k) > 300)
, false);
$$;

create or replace function public.rsas_publish_package(p_package jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare ev text := p_package->>'event_id'; ver integer; old jsonb; slot_entry jsonb; previous jsonb;
begin
  if not exists (select 1 from public.rsas_members where event_id = ev and user_id = auth.uid() and role = 'coordinator')
    then raise exception 'RSAS_COORDINATOR_REQUIRED' using errcode = '42501'; end if;
  -- Serialize version allocation across coordinator devices.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(ev));
  if jsonb_typeof(p_package) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_package) k where k <> all(array['schema_version','type','event_id','package_version','created_at','slots']))
    or p_package->>'schema_version' is distinct from '1'
    or p_package->>'type' is distinct from 'roster-package'
    or jsonb_typeof(p_package->'slots') is distinct from 'array'
    or jsonb_array_length(p_package->'slots') not between 1 and 5000
    or p_package->>'created_at' is null
    or not (p_package->>'created_at' ~ '(Z|[+-][0-9]{2}:[0-9]{2})$')
    or octet_length(p_package::text) > 5242880
    then raise exception 'RSAS_INVALID_PACKAGE'; end if;
  perform (p_package->>'created_at')::timestamptz;
  ver := (p_package->>'package_version')::integer;
  if ver is null or ver < 1 then raise exception 'RSAS_INVALID_PACKAGE'; end if;
  for slot_entry in select value from jsonb_array_elements(p_package->'slots') loop
    if not public.rsas_valid_slot(slot_entry) then raise exception 'RSAS_INVALID_SLOT'; end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_package->'slots') s group by s->>'id' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(p_package->'slots') s group by s->>'code' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(p_package->'slots') s group by s->>'tokenHash' having count(*) > 1)
    then raise exception 'RSAS_DUPLICATE_SLOT'; end if;
  select payload into old from public.rsas_packages where event_id = ev and package_version = ver;
  if found then
    if old <> p_package then raise exception 'RSAS_PACKAGE_CONFLICT'; end if;
    return;
  end if;
  if ver <> (select coalesce(max(package_version), 0) + 1 from public.rsas_packages where event_id = ev)
    then raise exception 'RSAS_PACKAGE_SEQUENCE'; end if;
  select payload into previous from public.rsas_packages where event_id = ev order by package_version desc limit 1;
  if previous is not null and exists (
    select 1 from jsonb_array_elements(previous->'slots') a where not exists (
      select 1 from jsonb_array_elements(p_package->'slots') b where a->>'id' = b->>'id' and a->>'code' = b->>'code'
    )
  ) then raise exception 'RSAS_STABLE_SLOT_REQUIRED'; end if;
  insert into public.rsas_packages(event_id, package_version, payload, created_by) values (ev, ver, p_package, auth.uid());
end;
$$;

create or replace function public.rsas_push_records(p_event text, p_device uuid, p_records jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare member public.rsas_members; r jsonb; rid uuid; old jsonb; pkg jsonb; slot jsonb; target jsonb; inserted integer := 0;
begin
  select * into member from public.rsas_members where event_id = p_event and user_id = auth.uid();
  if not found then raise exception 'RSAS_MEMBER_REQUIRED' using errcode = '42501'; end if;
  if p_device is null or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records) > 200
    or octet_length(p_records::text) > 1048576 then raise exception 'RSAS_INVALID_BATCH'; end if;
  -- Sequence cursors must follow commit order, including across tablet requests.
  -- All application writes use this event lock; direct client writes are revoked.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_event));
  insert into public.rsas_devices(event_id,device_id,owner_id) values (p_event,p_device,auth.uid()) on conflict do nothing;
  if not exists (select 1 from public.rsas_devices where event_id = p_event and device_id = p_device and owner_id = auth.uid())
    then raise exception 'RSAS_DEVICE_OWNER' using errcode = '42501'; end if;
  for r in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(r) is distinct from 'object'
      or not (r ?& array['record_id','event_id','invitation_id','invitation_code','device_id','station_id','operator','occurred_at','package_version','action','source','representative','reason'])
      or exists (select 1 from jsonb_object_keys(r) k where k <> all(array['record_id','event_id','invitation_id','invitation_code','device_id','station_id','operator','occurred_at','package_version','action','source','representative','reason','target_id']))
      or r->>'event_id' is distinct from p_event
      or r->>'device_id' is distinct from p_device::text
      or r->>'station_id' not in ('T01','T02','T03','T04','T05','T06')
      or (member.role <> 'coordinator' and r->>'station_id' is distinct from member.station_id)
      or r->>'action' not in ('checkin','void','select') or r->>'source' not in ('qr','manual','paper')
      or length(btrim(r->>'operator')) = 0
      or r->>'occurred_at' is null or not (r->>'occurred_at' ~ '(Z|[+-][0-9]{2}:[0-9]{2})$')
      or exists (select 1 from unnest(array['station_id','action','source','operator','representative','reason','invitation_id','invitation_code']) k where jsonb_typeof(r->k) is distinct from 'string' or length(r->>k) > 300)
      then raise exception 'RSAS_INVALID_RECORD'; end if;
    rid := (r->>'record_id')::uuid;
    if rid is null then raise exception 'RSAS_INVALID_RECORD'; end if;
    perform (r->>'occurred_at')::timestamptz;
    select payload into pkg from public.rsas_packages where event_id = p_event and package_version = (r->>'package_version')::integer;
    if pkg is null then raise exception 'RSAS_UNKNOWN_PACKAGE'; end if;
    select value into slot from jsonb_array_elements(pkg->'slots') where value->>'id' = r->>'invitation_id' and value->>'code' = r->>'invitation_code';
    if slot is null or (r->>'action' = 'checkin' and slot->>'status' not in ('active','extra')) then raise exception 'RSAS_UNKNOWN_SLOT'; end if;
    if r->>'action' <> 'checkin' then
      if member.role <> 'coordinator' then raise exception 'RSAS_COORDINATOR_REQUIRED' using errcode = '42501'; end if;
      if length(btrim(r->>'reason')) = 0 or r->>'target_id' is null then raise exception 'RSAS_CORRECTION_REASON'; end if;
      select payload into target from public.rsas_records where event_id = p_event and record_id = (r->>'target_id')::uuid;
      if target is null or target->>'action' <> 'checkin' or target->>'invitation_id' is distinct from r->>'invitation_id' then raise exception 'RSAS_INVALID_TARGET'; end if;
    end if;
    select payload into old from public.rsas_records where event_id = p_event and record_id = rid;
    if found then
      if old <> r then raise exception 'RSAS_RECORD_CONFLICT'; end if;
    else
      insert into public.rsas_records(event_id,record_id,payload,created_by) values(p_event,rid,r,auth.uid()) on conflict do nothing;
      if found then inserted := inserted + 1;
      elsif (select payload from public.rsas_records where event_id = p_event and record_id = rid) <> r then raise exception 'RSAS_RECORD_CONFLICT'; end if;
    end if;
  end loop;
  return inserted;
end;
$$;

revoke all on function public.rsas_valid_slot(jsonb) from public, anon, authenticated;
revoke all on function public.rsas_status(text), public.rsas_publish_package(jsonb), public.rsas_push_records(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.rsas_status(text), public.rsas_publish_package(jsonb), public.rsas_push_records(text,uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
