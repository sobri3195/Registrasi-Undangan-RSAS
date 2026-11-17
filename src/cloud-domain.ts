import { z } from 'zod'
import { EVENT, audit, packageSchema, recordSchema, stable } from './model'
import type { State, RosterPackage, AttendanceRecord } from './model'
import { merge } from './domain'

export const memberSchema = z.object({
  role: z.enum(['coordinator', 'operator']),
  station_id: z.enum(['T01', 'T02', 'T03', 'T04', 'T05', 'T06']),
})
export type CloudMember = z.infer<typeof memberSchema>
export const cloudRowSchema = z.object({
  seq: z.number().int().positive().safe(),
  payload: recordSchema,
  received_at: z.iso.datetime({ offset: true }),
})
export type CloudRow = z.infer<typeof cloudRowSchema>
const comparable = (value: unknown) => stable(JSON.parse(JSON.stringify(value)))
export function pendingRecords(
  state: State,
  acked: string[],
): AttendanceRecord[] {
  const known = new Set(acked)
  return state.records.filter(
    (r) => r.device_id === state.device_id && !known.has(r.record_id),
  )
}
export function applyCloud(
  state: State,
  packages: RosterPackage[],
  rows: CloudRow[],
) {
  const incoming = packages
    .map((p) => packageSchema.parse(p))
    .sort((a, b) => a.package_version - b.package_version)
  const combined = new Map(state.packages.map((p) => [p.package_version, p]))
  for (const p of incoming) {
    const old = combined.get(p.package_version)
    if (old && comparable(old) !== comparable(p))
      throw new Error(
        'Versi paket cloud bentrok dengan paket lokal. Gunakan master dan riwayat paket yang sama.',
      )
    combined.set(p.package_version, p)
  }
  const ordered = [...combined.values()].sort(
    (a, b) => a.package_version - b.package_version,
  )
  for (let i = 1; i < ordered.length; i++) {
    if (
      ordered[i - 1].slots.some(
        (old) =>
          !ordered[i].slots.some((s) => s.id === old.id && s.code === old.code),
      )
    )
      throw new Error(
        'Paket cloud mengubah atau menghapus ID slot yang sudah dikenal.',
      )
  }
  const latest = ordered.at(-1)
  if (latest && latest.package_version > state.package_version) {
    if (state.slots.some((s) => s.token || s.status === 'draft'))
      throw new Error(
        'Master lokal memiliki token atau draf. Jangan timpa dengan roster cloud; gunakan master penerbitan yang benar.',
      )
    state.slots = latest.slots
    state.package_version = latest.package_version
    audit(
      state,
      'cloud-package',
      `Paket v${latest.package_version} dimuat dari Supabase`,
    )
  }
  state.packages = ordered
  const grouped = new Map<string, CloudRow[]>()
  for (const value of rows) {
    const r = cloudRowSchema.parse(value)
    grouped.set(r.payload.device_id, [
      ...(grouped.get(r.payload.device_id) || []),
      r,
    ])
  }
  if (rows.length) {
    const files = [...grouped].map(([device, entries]) => ({
      schema_version: 1,
      type: 'station-log',
      event_id: EVENT,
      device_id: device,
      station_id: entries.at(-1)!.payload.station_id,
      package_version: state.package_version,
      exported_at: entries.at(-1)!.received_at,
      records: entries.map((r) => r.payload),
    }))
    merge(state, files, 'cloud')
  }
}
