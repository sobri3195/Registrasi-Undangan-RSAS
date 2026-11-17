import { z } from 'zod'

export const EVENT = 'rsas-2026-11-19'
export const EVENT_NAME = 'Forum Komunikasi Publik RSAS'
export const TOR_TARGET = 73
export const TOR_REFERENCE = 71
export const MAX_FILE = 5 * 1024 * 1024
export const stations = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'] as const
const text = z.string().max(300)
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/)
const iso = z.iso.datetime({ offset: true })
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22,86}$/)
export const slotSchema = z
  .object({
    id,
    code: id,
    name: text,
    label: text.min(1),
    organization: text,
    group: text,
    category: z.enum(['REGULER', 'VIP', 'VVIP']),
    kind: z.enum(['person', 'institution']),
    status: z.enum(['draft', 'active', 'cancelled', 'extra']),
    representative: text,
    desk: text,
    rsvp: z.enum(['unknown', 'yes', 'no']),
    token: tokenSchema.optional(),
    tokenHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine(
    (s) =>
      s.status !== 'active' ||
      (Boolean(s.tokenHash) && (s.kind !== 'person' || Boolean(s.name.trim()))),
    'Slot aktif harus memiliki hash token dan nama untuk undangan orang',
  )
export type Slot = z.infer<typeof slotSchema>
export const recordSchema = z
  .object({
    record_id: z.uuid(),
    event_id: z.literal(EVENT),
    invitation_id: id,
    invitation_code: id,
    device_id: z.uuid(),
    station_id: z.enum(stations),
    operator: text.min(1),
    occurred_at: iso,
    package_version: z.number().int().positive(),
    action: z.enum(['checkin', 'void', 'select']),
    source: z.enum(['qr', 'manual', 'paper']),
    representative: text,
    reason: text,
    target_id: z.uuid().optional(),
  })
  .refine(
    (r) =>
      r.action === 'checkin' ||
      (Boolean(r.target_id) && Boolean(r.reason.trim())),
    'Koreksi memerlukan target dan alasan',
  )
export type AttendanceRecord = z.infer<typeof recordSchema>
const base = { schema_version: z.literal(1), event_id: z.literal(EVENT) }
export const packageSchema = z
  .object({
    ...base,
    type: z.literal('roster-package'),
    package_version: z.number().int().positive(),
    created_at: iso,
    slots: z.array(slotSchema).min(1).max(5000),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>(),
      codes = new Set<string>(),
      hashes = new Set<string>()
    for (const s of p.slots) {
      if (
        s.token ||
        s.status === 'draft' ||
        !s.tokenHash ||
        ids.has(s.id) ||
        codes.has(s.code) ||
        hashes.has(s.tokenHash)
      ) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Paket berisi token asli, draf, hash kosong, atau slot duplikat',
        })
      }
      ids.add(s.id)
      codes.add(s.code)
      hashes.add(s.tokenHash ?? '')
    }
  })
export type RosterPackage = z.infer<typeof packageSchema>
export const exportSchema = z
  .object({
    ...base,
    type: z.literal('station-log'),
    device_id: z.uuid(),
    station_id: z.enum(stations),
    package_version: z.number().int().positive(),
    exported_at: iso,
    records: z.array(recordSchema).max(20000),
  })
  .refine(
    (f) => f.records.every((r) => r.device_id === f.device_id),
    'Asal perangkat catatan tidak sesuai',
  )
export type StationExport = z.infer<typeof exportSchema>
const configSchema = z.object({
  station: z.enum(stations),
  operator: text,
  officialOrigin: z.string().max(300),
})
const auditSchema = z.object({
  id: z.uuid(),
  at: iso,
  operator: text,
  action: text,
  detail: z.string().max(2000),
})
const receiptSchema = z.object({
  device: z.uuid(),
  station: z.enum(stations),
  at: iso,
  exportedAt: iso,
  count: z.number().int().nonnegative(),
  source: z.enum(['file', 'cloud']).default('file'),
})
export const stateSchema = z.object({
  schema_version: z.literal(1),
  device_id: z.uuid(),
  config: configSchema,
  slots: z.array(slotSchema).max(5000),
  package_version: z.number().int().nonnegative(),
  packages: z.array(packageSchema),
  records: z.array(recordSchema),
  denominator: z.number().int().positive().max(5000).nullable(),
  audit: z.array(auditSchema),
  receipts: z.array(receiptSchema),
  unusedStations: z.array(z.enum(stations)),
})
export type State = z.infer<typeof stateSchema>
export const backupSchema = z.object({
  ...base,
  type: z.literal('master-backup'),
  exported_at: iso,
  state: stateSchema,
})
export function initialState(): State {
  return {
    schema_version: 1,
    device_id: crypto.randomUUID(),
    config: {
      station: 'T05',
      operator: '',
      officialOrigin: import.meta.env.VITE_PUBLIC_ORIGIN || '',
    },
    slots: [],
    package_version: 0,
    packages: [],
    records: [],
    denominator: null,
    audit: [],
    receipts: [],
    unusedStations: ['T06'],
  }
}
export function audit(state: State, action: string, detail: string) {
  state.audit.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    operator: state.config.operator,
    action,
    detail,
  })
}
export function requireOperator(state: State) {
  if (!state.config.operator.trim())
    throw new Error('Isi nama operator pada Pengaturan terlebih dahulu.')
}
export const wib = (date: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
