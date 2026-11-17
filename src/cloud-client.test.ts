import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabaseFetch } from './cloud-client'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('Supabase transport', () => {
  it('uses no-store and aborts requests after 15 seconds so the offline queue can retry', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            expect(options.cache).toBe('no-store')
            options.signal?.addEventListener('abort', () =>
              reject(new Error('request aborted')),
            )
          }),
      ),
    )
    const rejected = expect(
      supabaseFetch('https://demo.supabase.co/rest/v1/rsas_records'),
    ).rejects.toThrow('request aborted')
    await vi.advanceTimersByTimeAsync(15000)
    await rejected
  })
  it('propagates an existing cancellation signal', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options: RequestInit) => {
        expect(options.signal?.aborted).toBe(true)
        return Promise.reject(new Error('cancelled'))
      }),
    )
    await expect(
      supabaseFetch('https://demo.supabase.co', { signal: controller.signal }),
    ).rejects.toThrow('cancelled')
  })
})
