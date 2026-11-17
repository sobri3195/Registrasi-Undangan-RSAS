import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { load, mutate } from './storage'
import { activate, checkin, issuePackage, merge, stationExport } from './domain'
import { draft } from './test-helpers'

describe('IndexedDB atomicity', () => {
  it('serializes double clicks, persists across reloads, and rolls back failed transactions', async () => {
    await load()
    const slot = await activate(draft('STORAGE-DEMO'))
    await mutate((s) => {
      s.config.operator = 'Demo'
      s.slots = [slot]
      issuePackage(s)
    })
    const results = await Promise.all([
      mutate((s) => checkin(s, slot.id, 'Demo A', 'manual')),
      mutate((s) => checkin(s, slot.id, 'Demo A', 'qr')),
    ])
    expect(results.map((r) => r.result.duplicate).sort()).toEqual([false, true])
    expect((await load()).records).toHaveLength(1)
    const before = JSON.stringify(await load())
    await expect(
      mutate((s) => {
        s.denominator = 99
        throw new Error('Simulated failure')
      }),
    ).rejects.toThrow()
    expect(JSON.stringify(await load())).toBe(before)
    const bad = structuredClone(stationExport(await load()))
    bad.event_id = 'bad' as typeof bad.event_id
    await expect(mutate((s) => merge(s, [bad]))).rejects.toThrow()
    expect(JSON.stringify(await load())).toBe(before)
    await expect(
      mutate((s) => {
        s.records.push({ ...s.records[0], record_id: crypto.randomUUID() })
      }),
    ).rejects.toThrow()
    expect(JSON.stringify(await load())).toBe(before)
  })
})
