import Papa from 'papaparse'
import {
  EVENT,
  audit,
  exportSchema,
  packageSchema,
  requireOperator,
  stable,
  TOR_TARGET,
  wib,
} from './model'
import type {
  AttendanceRecord,
  RosterPackage,
  Slot,
  State,
  StationExport,
} from './model'

export function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
export function parseCheckin(value: string) {
  const match = /^RSAS-CI1:([a-zA-Z0-9_-]{1,100}):([a-zA-Z0-9_-]{22,86})$/.exec(
    value,
  )
  if (!match)
    throw new Error(
      value.includes('/rsvp')
        ? 'Ini QR undangan. Minta tamu membuka QR check-in saya, atau cari nama secara manual.'
        : 'QR tidak dikenali. Gunakan QR check-in RSAS atau pencarian manual.',
    )
  if (match[1] !== EVENT) throw new Error('QR berasal dari acara berbeda.')
  return match[2]
}
export function parseInvitation(fragment: string) {
  const p = new URLSearchParams(fragment.replace(/^#/, ''))
  const t = p.get('t') || '',
    c = p.get('c') || ''
  if (
    p.get('v') !== '1' ||
    p.get('e') !== EVENT ||
    !/^[A-Za-z0-9_-]{22,86}$/.test(t) ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(c)
  )
    throw new Error(
      'Tautan undangan tidak valid. Hubungi panitia melalui chat undangan semula.',
    )
  return { token: t, code: c }
}
export function invitationUrl(slot: Slot, origin: string) {
  const url = new URL(origin)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Tetapkan origin HTTPS resmi tanpa path di Pengaturan.')
  if (slot.status !== 'active' || !slot.token)
    throw new Error(
      'Hanya slot aktif pada perangkat master yang dapat menerbitkan kartu.',
    )
  return `${url.origin}/rsvp#${new URLSearchParams({ v: '1', e: EVENT, c: slot.code, t: slot.token })}`
}
export async function activate(slot: Slot): Promise<Slot> {
  if (slot.kind === 'person' && !slot.name.trim())
    throw new Error('Nama wajib untuk undangan orang.')
  if (!slot.label.trim()) throw new Error('Label undangan wajib.')
  const t = slot.token || token()
  return { ...slot, status: 'active', token: t, tokenHash: await hash(t) }
}
export function issuePackage(state: State): RosterPackage {
  requireOperator(state)
  const slots = state.slots
    .filter((s) => s.status !== 'draft')
    .map((s) => ({ ...s, token: undefined, rsvp: 'unknown' as const }))
  if (!slots.length)
    throw new Error('Sahkan setidaknya satu slot sebelum membuat paket.')
  const p = packageSchema.parse({
    schema_version: 1,
    type: 'roster-package',
    event_id: EVENT,
    package_version: state.package_version + 1,
    created_at: new Date().toISOString(),
    slots,
  })
  state.package_version = p.package_version
  state.packages.push(p)
  audit(state, 'package', `Paket v${p.package_version}; ${slots.length} slot`)
  return p
}
export function importPackage(state: State, value: unknown) {
  requireOperator(state)
  const p = packageSchema.parse(value)
  if (state.slots.some((s) => s.token))
    throw new Error(
      'Perangkat master memiliki token asli. Impor paket pemindai hanya ke tablet petugas; gunakan backup untuk pemulihan master.',
    )
  if (p.package_version <= state.package_version)
    throw new Error('Paket harus lebih baru dari versi yang telah dimuat.')
  if (
    state.packages.some((old) =>
      old.slots.some((s) => {
        const next = p.slots.find((n) => n.id === s.id)
        return !next || next.code !== s.code
      }),
    )
  )
    throw new Error(
      'Paket harus mempertahankan ID/kode slot lama. Gunakan status cancelled untuk pembatalan.',
    )
  state.slots = p.slots
  state.package_version = p.package_version
  state.packages.push(p)
  audit(state, 'import-package', `Paket v${p.package_version}`)
}
export function effective(state: State, slotId: string) {
  const logs = state.records.filter((r) => r.invitation_id === slotId)
  const voided = new Set(
    logs.filter((r) => r.action === 'void').map((r) => r.target_id),
  )
  const candidates = logs
    .filter((r) => r.action === 'checkin' && !voided.has(r.record_id))
    .sort(
      (a, b) =>
        Date.parse(a.occurred_at) - Date.parse(b.occurred_at) ||
        a.record_id.localeCompare(b.record_id),
    )
  const selection = logs
    .filter((r) => r.action === 'select')
    .sort(
      (a, b) =>
        Date.parse(b.occurred_at) - Date.parse(a.occurred_at) ||
        b.record_id.localeCompare(a.record_id),
    )[0]
  const chosen =
    candidates.find((r) => r.record_id === selection?.target_id) ||
    candidates[0]
  const names = new Set(
    candidates
      .map((r) => r.representative.trim().toLocaleLowerCase())
      .filter(Boolean),
  )
  const suspectClock = candidates.some((r) => {
    const d = new Date(r.occurred_at).getTime()
    return (
      d < Date.parse('2026-11-19T00:00:00+07:00') ||
      d > Date.parse('2026-11-20T00:00:00+07:00')
    )
  })
  return {
    chosen,
    candidates,
    review: candidates.length > 1 || names.size > 1 || suspectClock,
    suspectClock,
    differentNames: names.size > 1,
  }
}
export function checkin(
  state: State,
  slotId: string,
  representative: string,
  source: AttendanceRecord['source'],
  observedAt?: string,
) {
  requireOperator(state)
  const slot = state.slots.find((s) => s.id === slotId)
  if (
    !slot ||
    !['active', 'extra'].includes(slot.status) ||
    !state.package_version
  )
    throw new Error('Slot tidak aktif atau paket belum diterbitkan/dimuat.')
  const latest = state.packages.at(-1)?.slots.find((s) => s.id === slotId)
  if (
    !latest ||
    latest.tokenHash !== slot.tokenHash ||
    latest.status !== slot.status
  )
    throw new Error(
      'Daftar berubah. Buat dan distribusikan paket baru sebelum check-in.',
    )
  const prior = effective(
    {
      ...state,
      records: state.records.filter((r) => r.device_id === state.device_id),
    },
    slotId,
  ).chosen
  if (prior) return { record: prior, duplicate: true }
  if (slot.kind === 'institution' && !representative.trim())
    throw new Error('Isi nama perwakilan yang benar-benar datang.')
  const at = observedAt ? new Date(observedAt) : new Date()
  if (Number.isNaN(at.getTime()))
    throw new Error('Waktu observasi tidak valid.')
  const record: AttendanceRecord = {
    record_id: crypto.randomUUID(),
    event_id: EVENT,
    invitation_id: slot.id,
    invitation_code: slot.code,
    device_id: state.device_id,
    station_id: state.config.station,
    operator: state.config.operator.trim(),
    occurred_at: at.toISOString(),
    package_version: state.package_version,
    action: 'checkin',
    source,
    representative: representative.trim() || slot.name,
    reason: '',
  }
  state.records.push(record)
  return { record, duplicate: false }
}
export function correct(
  state: State,
  target: AttendanceRecord,
  action: 'select' | 'void',
  reason: string,
) {
  requireOperator(state)
  if (!reason.trim()) throw new Error('Alasan koreksi wajib diisi.')
  state.records.push({
    ...target,
    record_id: crypto.randomUUID(),
    target_id: target.record_id,
    device_id: state.device_id,
    station_id: state.config.station,
    operator: state.config.operator,
    occurred_at: new Date().toISOString(),
    action,
    reason: reason.trim(),
  })
}
export function stationExport(state: State): StationExport {
  if (!state.package_version) throw new Error('Belum ada paket yang dimuat.')
  return exportSchema.parse({
    schema_version: 1,
    type: 'station-log',
    event_id: EVENT,
    device_id: state.device_id,
    station_id: state.config.station,
    package_version: state.package_version,
    exported_at: new Date().toISOString(),
    records: state.records.filter((r) => r.device_id === state.device_id),
  })
}
export function previewImport(state: State, files: unknown[]) {
  const parsed = files.map((f) => exportSchema.parse(f))
  const known = new Map(state.records.map((r) => [r.record_id, r]))
  const incoming = parsed.flatMap((f) => f.records)
  const conflicts: string[] = [],
    newRecords: AttendanceRecord[] = []
  let duplicates = 0
  for (const f of parsed)
    if (!state.packages.some((p) => p.package_version === f.package_version))
      throw new Error(`Revisi paket v${f.package_version} tidak dikenali.`)
  for (const r of incoming) {
    const pkg = state.packages.find(
      (p) => p.package_version === r.package_version,
    )
    const slot = pkg?.slots.find(
      (s) => s.id === r.invitation_id && s.code === r.invitation_code,
    )
    if (!slot || !state.slots.some((s) => s.id === r.invitation_id))
      throw new Error(
        `Slot/revisi tidak dikenali: ${r.invitation_code} / v${r.package_version}`,
      )
    if (r.action === 'checkin' && !['active', 'extra'].includes(slot.status))
      throw new Error(
        `Slot tidak aktif pada revisi catatan: ${r.invitation_code}`,
      )
    const old = known.get(r.record_id)
    if (old) {
      if (stable(old) !== stable(r)) conflicts.push(r.record_id)
      else duplicates++
    } else {
      newRecords.push(r)
      known.set(r.record_id, r)
    }
  }
  for (const r of newRecords.filter((r) => r.action !== 'checkin')) {
    const target = known.get(r.target_id!)
    if (
      !target ||
      target.action !== 'checkin' ||
      target.invitation_id !== r.invitation_id
    )
      throw new Error('Target koreksi tidak ditemukan atau tidak sesuai slot.')
  }
  const projected = { ...state, records: [...state.records, ...newRecords] }
  const review = new Set(
    newRecords
      .filter((r) => effective(projected, r.invitation_id).review)
      .map((r) => r.invitation_id),
  ).size
  return { parsed, newRecords, duplicates, conflicts, review }
}
export function merge(state: State, files: unknown[]) {
  requireOperator(state)
  const result = previewImport(state, files)
  // A conflicting batch is rejected entirely; existing originals remain intact.
  if (result.conflicts.length)
    throw new Error(
      `${result.conflicts.length} ID bentrok. Seluruh impor dibatalkan; catatan tersimpan dipertahankan.`,
    )
  state.records.push(...result.newRecords)
  for (const f of result.parsed)
    state.receipts.push({
      device: f.device_id,
      station: f.station_id,
      at: new Date().toISOString(),
      exportedAt: f.exported_at,
      count: f.records.length,
    })
  audit(
    state,
    'merge',
    `${result.newRecords.length} baru; ${result.duplicates} sudah ada`,
  )
  return result
}
export function metrics(state: State) {
  const official = state.slots.filter((s) => s.status === 'active')
  const present = official.filter((s) => effective(state, s.id).chosen).length
  const extra = state.slots.filter(
    (s) => s.status === 'extra' && effective(state, s.id).chosen,
  ).length
  const denominator = state.denominator
  return {
    official: official.length,
    present,
    extra,
    denominator,
    rsvp: official.filter((s) => s.rsvp === 'yes').length,
    percent: denominator ? (present / denominator) * 100 : null,
    reached: denominator ? present * 100 >= denominator * 85 : false,
    minimum: Math.ceil((denominator || TOR_TARGET) * 0.85),
    provisional:
      !denominator ||
      official.length !== denominator ||
      !['T01', 'T02', 'T03', 'T04', 'T05', 'T06'].every(
        (s) =>
          state.unusedStations.includes(s as State['config']['station']) ||
          state.receipts.some((r) => r.station === s),
      ),
  }
}
export function approveDenominator(
  state: State,
  value: number,
  reason: string,
) {
  requireOperator(state)
  if (!Number.isInteger(value) || value < 1 || value > 5000 || !reason.trim())
    throw new Error('Isi jumlah resmi 1–5000 dan alasan pengesahan.')
  audit(
    state,
    'denominator',
    `${state.denominator ?? 'belum disahkan'} → ${value}; ${reason}`,
  )
  state.denominator = value
}
export const csvColumns = [
  'invitation_code',
  'name',
  'invited_label',
  'organization',
  'guest_group',
  'guest_category',
  'roster_status',
]
export function parseRoster(csv: string, existing: Slot[]) {
  const parsed = Papa.parse<Record<string, string>>(
    csv.replace(/^\uFEFF/, ''),
    {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    },
  )
  const errors = parsed.errors.map(
    (e) => `Baris ${(e.row ?? 0) + 2}: ${e.message}`,
  )
  for (const col of csvColumns)
    if (!parsed.meta.fields?.includes(col))
      errors.push(`Kolom wajib hilang: ${col}`)
  const codes = new Set(existing.map((s) => s.code))
  const slots: Slot[] = []
  parsed.data.forEach((r, index) => {
    const row = index + 2,
      code = r.invitation_code?.trim() || ''
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(code))
      errors.push(`Baris ${row}: kode tidak valid`)
    if (codes.has(code)) errors.push(`Baris ${row}: kode duplikat ${code}`)
    codes.add(code)
    if (!r.invited_label?.trim())
      errors.push(`Baris ${row}: invited_label wajib`)
    if (Object.values(r).some((v) => v.length > 300))
      errors.push(`Baris ${row}: teks melebihi 300 karakter`)
    const category = r.guest_category?.trim() || 'REGULER'
    if (!['REGULER', 'VIP', 'VVIP'].includes(category))
      errors.push(`Baris ${row}: kategori harus REGULER, VIP, atau VVIP`)
    if (r.roster_status?.trim() !== 'draft')
      errors.push(
        `Baris ${row}: roster_status harus draft; pengesahan dilakukan lokal`,
      )
    slots.push({
      id: crypto.randomUUID(),
      code,
      name: r.name?.trim() || '',
      label: r.invited_label?.trim() || '',
      organization: r.organization?.trim() || '',
      group: r.guest_group?.trim() || '',
      category: category as Slot['category'],
      kind: r.name?.trim() ? 'person' : 'institution',
      status: 'draft',
      representative: '',
      desk: '',
      rsvp: 'unknown',
    })
  })
  if (!slots.length) errors.push('CSV tidak berisi undangan.')
  if (slots.length + existing.length > 5000) errors.push('Maksimum 5000 slot.')
  return { slots, errors }
}
export function csvReport(state: State) {
  const coverage = [...new Set(state.receipts.map((r) => r.station))]
    .sort()
    .join('; ')
  const exportedAt = new Date().toISOString()
  const rows = state.slots
    .filter((s) => s.status !== 'draft')
    .map((s) => {
      const r = effective(state, s.id).chosen
      return {
        kode: s.code,
        nama_undangan: s.name || s.label,
        perwakilan_aktual: r?.representative || '',
        instansi: s.organization,
        kategori: s.category,
        slot_status: s.status,
        rsvp: s.rsvp,
        hadir: r ? 'Hadir' : 'Belum hadir',
        waktu_WIB: r ? wib(r.occurred_at) : '',
        waktu_ISO: r?.occurred_at || '',
        stasiun: r?.station_id || '',
        sumber: r?.source || '',
        perlu_tinjauan: effective(state, s.id).review ? 'Ya' : 'Tidak',
        diekspor_pada: exportedAt,
        cakupan_tablet: coverage,
        status_rekap: metrics(state).provisional
          ? 'Sementara'
          : 'Terekonsiliasi',
      }
    })
  return (
    '\uFEFF' + Papa.unparse(rows, { escapeFormulae: /^[\s]*[=+\-@\t\r\n]/ })
  )
}
