import { describe, it, expect, beforeEach } from 'vitest'
import {
  activate,
  approveDenominator,
  checkin,
  correct,
  csvReport,
  effective,
  hash,
  importPackage,
  invitationUrl,
  issuePackage,
  merge,
  metrics,
  parseCheckin,
  parseInvitation,
  parseRoster,
  previewImport,
  stationExport,
} from './domain'
import { EVENT, initialState, packageSchema } from './model'
import type { State } from './model'
import { draft } from './test-helpers'

async function master(): Promise<State> {
  const s = initialState()
  s.config.operator = 'Koordinator Demo'
  s.slots = [await activate(draft()), await activate(draft('DEMO-2'))]
  issuePackage(s)
  return s
}
function scanner(s: State, station: State['config']['station']) {
  const t = initialState()
  t.config = { ...s.config, station, operator: `Petugas Demo ${station}` }
  importPackage(t, s.packages.at(-1))
  return t
}
const at = '2026-11-19T08:45:00+07:00'
describe('Penerbitan dan privasi QR', () => {
  it('dua slot perusahaan mempunyai token berbeda dan dipetakan ke slot terpisah', async () => {
    const s = await master()
    expect(s.slots[0].token).not.toBe(s.slots[1].token)
    for (const slot of s.slots) {
      const url = new URL(invitationUrl(slot, 'https://registrasi.example'))
      const p = parseInvitation(url.hash)
      expect(p.code).toBe(slot.code)
      expect(await hash(parseCheckin(`RSAS-CI1:${EVENT}:${p.token}`))).toBe(
        slot.tokenHash,
      )
      expect(url.search).toBe('')
      expect(url.href).not.toContain('Contoh')
    }
  })
  it('paket dan ekspor stasiun tidak berisi token asli', async () => {
    const s = await master()
    const t = scanner(s, 'T02')
    checkin(t, s.slots[0].id, 'Perwakilan Demo A', 'qr', at)
    const exported = JSON.stringify(stationExport(t)),
      pkg = JSON.stringify(s.packages[0])
    for (const slot of s.slots) {
      expect(pkg).not.toContain(slot.token!)
      expect(exported).not.toContain(slot.token!)
      expect(exported).not.toContain(slot.tokenHash!)
    }
    expect(t.slots.every((slot) => slot.token === undefined)).toBe(true)
  })
  it('draf tidak masuk QR, paket, operator atau KPI', async () => {
    const s = await master()
    const d = draft('DRAFT-ONLY')
    s.slots.push(d)
    const p = issuePackage(s)
    expect(p.slots).toHaveLength(2)
    expect(metrics(s).official).toBe(2)
    expect(() => invitationUrl(d, 'https://registrasi.example')).toThrow()
    expect(() => checkin(s, d.id, 'Demo', 'manual')).toThrow()
  })
  it('undangan orang wajib mempunyai nama', async () => {
    await expect(activate({ ...draft(), kind: 'person' })).rejects.toThrow(
      'Nama wajib',
    )
  })
  it('menolak QR asing, acara lain, dan tautan tidak sesuai', () => {
    expect(() => parseCheckin('https://other.example')).toThrow(
      'tidak dikenali',
    )
    expect(() => parseCheckin(`https://example/rsvp#e=${EVENT}`)).toThrow(
      'QR undangan',
    )
    expect(() =>
      parseCheckin('RSAS-CI1:other:abcdefghijklmnopqrstuvwxyz'),
    ).toThrow('berbeda')
    expect(() => parseInvitation('#v=2&e=x&t=no')).toThrow()
  })
  it('hanya menerbitkan kartu pada origin HTTPS tanpa kredensial/path', async () => {
    const s = await master()
    for (const origin of [
      'http://example.com',
      'https://example.com/x',
      'https://user:pass@example.com',
      'https://example.com?x=1',
    ])
      expect(() => invitationUrl(s.slots[0], origin)).toThrow()
  })
  it('paket menolak token asli dan kode duplikat', async () => {
    const s = await master()
    expect(
      packageSchema.safeParse({ ...s.packages[0], slots: s.slots }).success,
    ).toBe(false)
    expect(
      packageSchema.safeParse({
        ...s.packages[0],
        slots: [s.packages[0].slots[0], s.packages[0].slots[0]],
      }).success,
    ).toBe(false)
  })
})
describe('Check-in lokal dan penggabungan', () => {
  let s: State, a: State, b: State
  beforeEach(async () => {
    s = await master()
    a = scanner(s, 'T02')
    b = scanner(s, 'T03')
  })
  it('tetap menerima tamu tanpa RSVP dan tidak mengubah RSVP', () => {
    const result = checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    expect(result.duplicate).toBe(false)
    expect(a.slots[0].rsvp).toBe('unknown')
  })
  it('menuntut nama perwakilan dan nama operator', () => {
    expect(() => checkin(a, s.slots[0].id, '', 'manual')).toThrow('perwakilan')
    a.config.operator = ''
    expect(() => checkin(a, s.slots[0].id, 'Demo', 'manual')).toThrow(
      'operator',
    )
  })
  it('mencatat hanya satu kehadiran aktif per slot pada tablet', () => {
    const first = checkin(a, s.slots[0].id, 'Demo A', 'manual', at)
    const retry = checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    expect(retry.duplicate).toBe(true)
    expect(retry.record.record_id).toBe(first.record.record_id)
    expect(a.records).toHaveLength(1)
  })
  it('dua tablet mencatat slot sama: satu kehadiran gabungan, dua jejak', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    checkin(b, s.slots[0].id, 'Demo A', 'manual', '2026-11-19T08:46:00+07:00')
    merge(s, [stationExport(a), stationExport(b)])
    expect(metrics(s).present).toBe(1)
    expect(s.records).toHaveLength(2)
    expect(effective(s, s.slots[0].id).chosen?.station_id).toBe('T02')
    expect(effective(s, s.slots[0].id).review).toBe(true)
  })
  it('dua slot berbeda menambah dua kehadiran', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    checkin(b, s.slots[1].id, 'Demo B', 'qr', at)
    merge(s, [stationExport(a), stationExport(b)])
    expect(metrics(s).present).toBe(2)
  })
  it('impor sama dan ekspor bertumpang tindih idempoten', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    const first = stationExport(a)
    merge(s, [first])
    expect(merge(s, [first]).duplicates).toBe(1)
    checkin(a, s.slots[1].id, 'Demo B', 'manual', at)
    const next = stationExport(a)
    expect(merge(s, [next]).newRecords).toHaveLength(1)
    expect(s.records).toHaveLength(2)
  })
  it('ID bentrok dipratinjau dan seluruh batch ditolak tanpa mengganti asal', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    const first = stationExport(a)
    merge(s, [first])
    const conflict = structuredClone(first)
    conflict.records[0].representative = 'Nama Berbeda'
    checkin(b, s.slots[1].id, 'Demo B', 'qr', at)
    const before = JSON.stringify(s)
    expect(previewImport(s, [conflict]).conflicts).toHaveLength(1)
    expect(() => merge(s, [stationExport(b), conflict])).toThrow('bentrok')
    expect(JSON.stringify(s)).toBe(before)
  })
  it('menolak acara lain, versi, jenis aksi, referensi slot dan koreksi asing', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    const f = stationExport(a)
    const invalid = [
      { ...f, event_id: 'other' },
      { ...f, schema_version: 2 },
      { ...f, package_version: 99 },
      { ...f, records: [{ ...f.records[0], action: 'delete' }] },
      { ...f, records: [{ ...f.records[0], invitation_id: 'unknown' }] },
      {
        ...f,
        records: [
          {
            ...f.records[0],
            action: 'void',
            target_id: crypto.randomUUID(),
            reason: 'Demo',
          },
        ],
      },
    ]
    for (const value of invalid) {
      const before = JSON.stringify(s)
      expect(() => merge(s, [value])).toThrow()
      expect(JSON.stringify(s)).toBe(before)
    }
  })
  it('menerima revisi lama yang dikenali dan tetap mempertahankan catatan', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    issuePackage(s)
    merge(s, [stationExport(a)])
    expect(s.records[0].package_version).toBe(1)
    expect(metrics(s).present).toBe(1)
  })
  it('tidak memperbolehkan penurunan paket dan hilangnya slot stabil', () => {
    expect(() => importPackage(a, s.packages[0])).toThrow('lebih baru')
    const pkg = issuePackage(s)
    expect(() =>
      importPackage(a, { ...pkg, slots: pkg.slots.slice(0, 1) }),
    ).toThrow('mempertahankan')
  })
  it('menolak paket kosong agar tidak menampilkan kesiapan roster palsu', async () => {
    const s = await master()
    expect(
      packageSchema.safeParse({ ...s.packages[0], slots: [] }).success,
    ).toBe(false)
  })
  it('token lama tidak cocok setelah penggantian dan paket baru dimuat', async () => {
    const old = a.slots[0].tokenHash
    s.slots[0] = await activate({ ...s.slots[0], token: undefined })
    issuePackage(s)
    importPackage(a, s.packages.at(-1))
    expect(a.slots[0].tokenHash).not.toBe(old)
  })
  it('koreksi baru menyimpan jejak, pilihan efektif, dan alasan', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    checkin(b, s.slots[0].id, 'Demo B', 'manual', at)
    merge(s, [stationExport(a), stationExport(b)])
    const target = s.records[1]
    correct(s, target, 'select', 'Identitas cocok setelah pemeriksaan')
    expect(effective(s, target.invitation_id).chosen?.record_id).toBe(
      target.record_id,
    )
    correct(s, target, 'void', 'Salah slot')
    expect(effective(s, target.invitation_id).chosen?.record_id).toBe(
      s.records[0].record_id,
    )
    expect(s.records).toHaveLength(4)
    expect(() => correct(s, target, 'void', '')).toThrow('Alasan')
  })
  it('urutan ID menstabilkan waktu identik dan menandai jam/nama meragukan', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    checkin(b, s.slots[0].id, 'Demo B', 'qr', at)
    merge(s, [stationExport(b), stationExport(a)])
    const e = effective(s, s.slots[0].id)
    expect(e.chosen?.record_id).toBe(
      [...s.records].map((r) => r.record_id).sort()[0],
    )
    expect(e.differentNames).toBe(true)
    s.records[0].occurred_at = '2026-11-18T01:00:00Z'
    expect(effective(s, s.slots[0].id).suspectClock).toBe(true)
  })
  it('mengurutkan timestamp berdasarkan waktu absolut walau offset berbeda', () => {
    checkin(a, s.slots[0].id, 'Demo A', 'qr', at)
    checkin(b, s.slots[0].id, 'Demo A', 'manual', at)
    const f = stationExport(a),
      g = stationExport(b)
    f.records[0].occurred_at = '2026-11-19T08:30:00+07:00'
    g.records[0].occurred_at = '2026-11-19T02:00:00Z'
    merge(s, [g, f])
    expect(effective(s, s.slots[0].id).chosen?.station_id).toBe('T02')
  })
  it('catatan kertas mempertahankan waktu observasi dengan sumber paper', () => {
    const r = checkin(a, s.slots[0].id, 'Demo A', 'paper', at).record
    expect(r.occurred_at).toBe('2026-11-19T01:45:00.000Z')
    expect(r.source).toBe('paper')
  })
})
describe('KPI, CSV dan pengesahan', () => {
  it('62/73 belum mencapai 85%; 63/73 mencapai; tambahan dikecualikan', async () => {
    const s = initialState()
    s.config.operator = 'Demo'
    s.slots = await Promise.all(
      Array.from({ length: 74 }, (_, i) => activate(draft(`DEMO-${i}`))),
    )
    s.slots[73].status = 'extra'
    issuePackage(s)
    approveDenominator(s, 73, 'Pengesahan sintetis')
    for (const slot of s.slots.slice(0, 62))
      checkin(s, slot.id, 'Demo', 'manual', at)
    checkin(s, s.slots[73].id, 'Tambahan Demo', 'manual', at)
    expect(metrics(s).reached).toBe(false)
    expect(metrics(s).percent).toBeCloseTo(84.9315)
    expect(metrics(s).extra).toBe(1)
    checkin(s, s.slots[62].id, 'Demo', 'manual', at)
    expect(metrics(s).reached).toBe(true)
    expect(metrics(s).percent).toBeCloseTo(86.3014)
    expect(s.audit.find((a) => a.action === 'denominator')?.detail).toContain(
      '73',
    )
  })
  it('rekap sementara sampai penyebut dan cakupan meja disahkan', async () => {
    const s = await master()
    expect(metrics(s).provisional).toBe(true)
    approveDenominator(s, 2, 'Demo')
    s.unusedStations = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06']
    expect(metrics(s).provisional).toBe(false)
  })
  it('CSV memvalidasi kolom, baris, status dan duplikat', () => {
    const header =
      'invitation_code,name,invited_label,organization,guest_group,guest_category,roster_status\n'
    const valid = parseRoster(
      header + 'DEMO-1,,Label,PT Contoh,Demo,VIP,draft\n',
      [],
    )
    expect(valid.errors).toEqual([])
    expect(valid.slots[0].status).toBe('draft')
    expect(
      parseRoster(
        header +
          'DEMO-1,,Label,PT Contoh,Demo,VIP,active\nDEMO-1,,,PT Contoh,Demo,invalid,draft',
        [],
      ).errors.join(),
    ).toContain('Baris 3')
    expect(parseRoster('name\nDemo', []).errors.join()).toContain('Kolom wajib')
    expect(
      parseRoster(
        header + 'DEMO-1,,Label,,,VIP,draft',
        valid.slots,
      ).errors.join(),
    ).toContain('duplikat')
  })
  it('CSV UTF-8 menetralkan formula Excel dan menyertakan cakupan/waktu', async () => {
    const s = await master()
    s.slots[0].label = '=HYPERLINK("https://example")'
    s.slots[1].organization = '\t=1+1'
    const csv = csvReport(s)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain("'\t=1+1")
    expect(csv).toContain('cakupan_tablet')
    expect(csv).toContain('Sementara')
  })
})
