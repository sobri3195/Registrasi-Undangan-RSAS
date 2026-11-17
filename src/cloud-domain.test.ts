import { describe, it, expect } from 'vitest'
import {
  activate,
  approveDenominator,
  checkin,
  issuePackage,
  metrics,
} from './domain'
import { initialState } from './model'
import { draft } from './test-helpers'
import { applyCloud, pendingRecords } from './cloud-domain'
import { cloudConfigSchema } from './cloud-model'
import 'fake-indexeddb/auto'

async function master() {
  const s = initialState()
  s.config.operator = 'Koordinator Sintetis'
  s.slots = [await activate(draft())]
  issuePackage(s)
  return s
}
describe('Optional Supabase sync domain', () => {
  it('accepts publishable configuration but rejects browser secret keys and untrusted endpoints', () => {
    const valid = {
      url: 'https://demo.supabase.co',
      key: 'sb_publishable_synthetic',
      enabled: true,
    }
    expect(cloudConfigSchema.safeParse(valid).success).toBe(true)
    for (const url of [
      'http://demo.supabase.co',
      'https://example.com',
      'https://demo.supabase.co/path',
      'https://user:pass@demo.supabase.co',
    ])
      expect(cloudConfigSchema.safeParse({ ...valid, url }).success).toBe(false)
    expect(
      cloudConfigSchema.safeParse({
        ...valid,
        key: 'sb_secret_never-use-in-browser',
      }).success,
    ).toBe(false)
    const legacy = `x.${btoa(JSON.stringify({ role: 'service_role' }))}.x`
    expect(cloudConfigSchema.safeParse({ ...valid, key: legacy }).success).toBe(
      false,
    )
    expect(
      cloudConfigSchema.safeParse({ ...valid, key: '', enabled: true }).success,
    ).toBe(false)
  })
  it('downloads a hash-only package to a scanner without publishing raw tokens', async () => {
    const m = await master(),
      s = initialState()
    s.config.operator = 'Petugas Sintetis'
    applyCloud(s, m.packages, [])
    expect(s.package_version).toBe(1)
    expect(s.slots[0].token).toBeUndefined()
    expect(s.slots[0].tokenHash).toBe(m.slots[0].tokenHash)
  })
  it('preserves master tokens, RSVP and denominator when the same package is downloaded', async () => {
    const m = await master()
    m.slots[0].rsvp = 'yes'
    approveDenominator(m, 1, 'Sintetis')
    const original = structuredClone(m.slots)
    applyCloud(m, JSON.parse(JSON.stringify(m.packages)), [])
    expect(m.slots).toEqual(original)
    expect(m.denominator).toBe(1)
  })
  it('rejects divergent versions and refuses to replace a private master or its drafts', async () => {
    const m = await master(),
      remote = structuredClone(m.packages)
    remote[0].slots[0].label = 'Versi bentrok'
    expect(() => applyCloud(m, remote, [])).toThrow('bentrok')
    issuePackage(m)
    const s = initialState()
    s.config.operator = 'Demo'
    s.slots = [draft('LOCAL-DRAFT')]
    expect(() => applyCloud(s, m.packages, [])).toThrow('token atau draf')
  })
  it('keeps pending own-device records until acknowledged, including after partial retry', async () => {
    const m = await master()
    const first = checkin(m, m.slots[0].id, 'Demo', 'manual').record
    expect(pendingRecords(m, [])).toEqual([first])
    expect(pendingRecords(m, [first.record_id])).toEqual([])
    m.records.push({
      ...first,
      record_id: crypto.randomUUID(),
      device_id: crypto.randomUUID(),
    })
    expect(pendingRecords(m, [])).toHaveLength(1)
  })
  it('merges two devices once while cloud receipts do not claim final reconciliation', async () => {
    const m = await master(),
      a = initialState(),
      b = initialState()
    for (const [index, s] of [a, b].entries()) {
      s.config.operator = 'Petugas Sintetis'
      s.config.station = index ? 'T03' : 'T02'
      applyCloud(s, m.packages, [])
      checkin(
        s,
        s.slots[0].id,
        'Perwakilan Sintetis',
        'qr',
        '2026-11-19T08:45:00+07:00',
      )
    }
    const rows = [...a.records, ...b.records].map((payload, i) => ({
      seq: i + 1,
      payload,
      received_at: '2026-11-19T02:00:00Z',
    }))
    applyCloud(m, m.packages, rows)
    applyCloud(m, m.packages, rows)
    expect(m.records).toHaveLength(2)
    expect(metrics(m).present).toBe(1)
    approveDenominator(m, 1, 'Sintetis')
    m.unusedStations = ['T01', 'T04', 'T05', 'T06']
    expect(metrics(m).provisional).toBe(true)
    expect(m.receipts.every((r) => r.source === 'cloud')).toBe(true)
  })
})
