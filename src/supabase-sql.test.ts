import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { activate, checkin, issuePackage } from './domain'
import { initialState, EVENT } from './model'
import { draft } from './test-helpers'

let db: PGlite
const coordinator = '00000000-0000-4000-8000-000000000001',
  operator = '00000000-0000-4000-8000-000000000002',
  outsider = '00000000-0000-4000-8000-000000000003'
const master = initialState(),
  scanner = initialState()
async function as(user: string | null, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user || '',
  ])
  await db.exec(`set role ${role}`)
}
const push = (records: unknown[], device = scanner.device_id) =>
  db.query('select public.rsas_push_records($1,$2,$3::jsonb)', [
    EVENT,
    device,
    JSON.stringify(records),
  ])
describe('Real PostgreSQL policies and RPCs (PGlite)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
    for (const id of [coordinator, operator, outsider])
      await db.query('insert into auth.users values($1)', [id])
    const sql = await readFile(
      new URL(
        '../supabase/migrations/202611170001_attendance.sql',
        import.meta.url,
      ),
      'utf8',
    )
    await db.exec(sql)
    await db.query(
      "insert into public.rsas_members values($1,$2,'coordinator','T05'),($1,$3,'operator','T02')",
      [EVENT, coordinator, operator],
    )
    master.config.operator = 'Koordinator Sintetis'
    master.slots = [await activate(draft('SQL-DEMO'))]
    issuePackage(master)
    scanner.config.operator = 'Petugas Sintetis'
    scanner.config.station = 'T02'
    scanner.slots = master.packages[0].slots
    scanner.packages = master.packages
    scanner.package_version = 1
    checkin(
      scanner,
      scanner.slots[0].id,
      'Perwakilan Sintetis',
      'qr',
      '2026-11-19T08:45:00+07:00',
    )
  }, 30000)
  afterAll(async () => {
    await db?.close()
  })
  it('denies anonymous roster/attendance reads and RPC calls', async () => {
    await as(null, 'anon')
    await expect(
      db.query('select * from public.rsas_packages'),
    ).rejects.toThrow('permission denied')
    await expect(push([])).rejects.toThrow('permission denied')
  })
  it('gives non-members no rows and no ability to register themselves', async () => {
    await as(outsider)
    expect((await db.query('select * from public.rsas_packages')).rows).toEqual(
      [],
    )
    await expect(
      db.query('select public.rsas_status($1)', [EVENT]),
    ).rejects.toThrow('RSAS_MEMBER_REQUIRED')
    await expect(
      db.query(
        "insert into public.rsas_members values($1,$2,'coordinator','T05')",
        [EVENT, outsider],
      ),
    ).rejects.toThrow('permission denied')
  })
  it('allows only a coordinator to publish immutable, token-free packages', async () => {
    await as(operator)
    await expect(
      db.query('select public.rsas_publish_package($1::jsonb)', [
        JSON.stringify(master.packages[0]),
      ]),
    ).rejects.toThrow('RSAS_COORDINATOR_REQUIRED')
    await as(coordinator)
    await db.query('select public.rsas_publish_package($1::jsonb)', [
      JSON.stringify(master.packages[0]),
    ])
    await db.query('select public.rsas_publish_package($1::jsonb)', [
      JSON.stringify(master.packages[0]),
    ])
    const conflict = structuredClone(master.packages[0])
    conflict.slots[0].label = 'Konflik'
    await expect(
      db.query('select public.rsas_publish_package($1::jsonb)', [
        JSON.stringify(conflict),
      ]),
    ).rejects.toThrow('RSAS_PACKAGE_CONFLICT')
    const raw = { ...master.packages[0], slots: master.slots }
    await expect(
      db.query('select public.rsas_publish_package($1::jsonb)', [
        JSON.stringify(raw),
      ]),
    ).rejects.toThrow('RSAS_INVALID_SLOT')
  })
  it('idempotently accepts owned records but forbids direct updates or deletes', async () => {
    await as(operator)
    await push(scanner.records)
    await push(scanner.records)
    expect(
      (await db.query('select * from public.rsas_records')).rows,
    ).toHaveLength(1)
    await expect(db.query('delete from public.rsas_records')).rejects.toThrow(
      'permission denied',
    )
    await expect(
      db.query("update public.rsas_records set payload='{}'"),
    ).rejects.toThrow('permission denied')
  })
  it('rejects a conflicting batch atomically instead of overwriting original records', async () => {
    await as(operator)
    const other = { ...scanner.records[0], record_id: crypto.randomUUID() }
    const conflict = { ...scanner.records[0], representative: 'Nama bentrok' }
    await expect(push([other, conflict])).rejects.toThrow(
      'RSAS_RECORD_CONFLICT',
    )
    expect(
      (await db.query('select * from public.rsas_records')).rows,
    ).toHaveLength(1)
  })
  it('enforces device ownership, membership station and package references', async () => {
    await as(coordinator)
    await expect(push(scanner.records)).rejects.toThrow('RSAS_DEVICE_OWNER')
    await as(operator)
    await expect(
      push([
        {
          ...scanner.records[0],
          record_id: crypto.randomUUID(),
          station_id: 'T03',
        },
      ]),
    ).rejects.toThrow('RSAS_INVALID_RECORD')
    await expect(
      push([
        {
          ...scanner.records[0],
          record_id: crypto.randomUUID(),
          package_version: 999,
        },
      ]),
    ).rejects.toThrow('RSAS_UNKNOWN_PACKAGE')
  })
  it('requires a coordinator and reason for append-only corrections', async () => {
    const target = scanner.records[0]
    const correction = {
      ...target,
      record_id: crypto.randomUUID(),
      target_id: target.record_id,
      action: 'void',
      reason: 'Pemeriksaan sintetis',
    }
    await as(operator)
    await expect(push([correction])).rejects.toThrow(
      'RSAS_COORDINATOR_REQUIRED',
    )
    await as(coordinator)
    await push(
      [{ ...correction, device_id: master.device_id, station_id: 'T05' }],
      master.device_id,
    )
    expect(
      (await db.query('select * from public.rsas_records')).rows,
    ).toHaveLength(2)
  })
  it('reruns setup without deleting data or opening anonymous access', async () => {
    await as(null, 'postgres')
    const sql = await readFile(
      new URL(
        '../supabase/migrations/202611170001_attendance.sql',
        import.meta.url,
      ),
      'utf8',
    )
    await db.exec(sql)
    expect(
      (await db.query('select * from public.rsas_records')).rows,
    ).toHaveLength(2)
    await as(null, 'anon')
    await expect(db.query('select * from public.rsas_records')).rejects.toThrow(
      'permission denied',
    )
  })
})
