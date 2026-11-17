import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { readProgress, writeProgress, writeCloudConfig } from './cloud-model'
import { openDatabase } from './storage'

describe('Cloud progress isolation', () => {
  it('scopes acknowledgements by project and user and resets progress on project changes', async () => {
    const config = {
      url: 'https://first.supabase.co',
      key: 'sb_publishable_synthetic',
      enabled: false,
    }
    await writeCloudConfig(config)
    const p = {
      url: config.url,
      user: 'synthetic-user',
      cursor: 3,
      acked: [crypto.randomUUID()],
      lastAt: new Date().toISOString(),
    }
    await writeProgress(p)
    expect(await readProgress(config.url, p.user)).toEqual(p)
    expect((await readProgress(config.url, 'different-user')).acked).toEqual([])
    expect(
      (await readProgress('https://other.supabase.co', p.user)).cursor,
    ).toBe(0)
    await writeCloudConfig({ ...config, url: 'https://second.supabase.co' })
    expect((await readProgress(config.url, p.user)).acked).toEqual([])
  })
  it('recovers from invalid progress metadata without deleting local operational state', async () => {
    const db = await openDatabase()
    await db.put('cloud', { cursor: 'bad', acked: null }, 'progress')
    expect(
      (await readProgress('https://demo.supabase.co', 'synthetic-user')).acked,
    ).toEqual([])
  })
})
