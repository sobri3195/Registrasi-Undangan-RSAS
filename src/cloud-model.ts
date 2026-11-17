import { z } from 'zod'
import { openDatabase } from './storage'

export const cloudConfigSchema = z
  .object({
    url: z.string().refine((value) => {
      if (!value) return true
      try {
        const u = new URL(value)
        return (
          u.protocol === 'https:' &&
          /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) &&
          !u.port &&
          !u.username &&
          !u.password &&
          u.pathname === '/' &&
          !u.search &&
          !u.hash
        )
      } catch {
        return false
      }
    }, 'Gunakan Project URL HTTPS Supabase tanpa path.'),
    key: z
      .string()
      .max(2000)
      .refine((value) => {
        if (!value) return true
        if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true
        try {
          return (
            JSON.parse(
              atob(
                value.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'),
              ),
            ).role === 'anon'
          )
        } catch {
          return false
        }
      }, 'Gunakan publishable key atau anon key. Secret/service_role key tidak boleh dipakai di browser.'),
    enabled: z.boolean(),
  })
  .refine(
    (c) => !c.enabled || Boolean(c.url && c.key),
    'Isi Project URL dan publishable key sebelum mengaktifkan sinkronisasi.',
  )
export type CloudConfig = z.infer<typeof cloudConfigSchema>
const progressSchema = z.object({
  url: z.string(),
  user: z.string(),
  cursor: z.number().int().nonnegative().safe(),
  acked: z.array(z.uuid()),
  lastAt: z.iso.datetime({ offset: true }).nullable(),
})
export type Progress = z.infer<typeof progressSchema>
export const emptyProgress = (url: string, user: string): Progress => ({
  url,
  user,
  cursor: 0,
  acked: [],
  lastAt: null,
})
export async function readCloudConfig(): Promise<CloudConfig> {
  const db = await openDatabase()
  return cloudConfigSchema.parse(
    (await db.get('cloud', 'config')) || {
      url: import.meta.env.VITE_SUPABASE_URL || '',
      key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      enabled: false,
    },
  )
}
export async function writeCloudConfig(value: CloudConfig) {
  const config = cloudConfigSchema.parse(value)
  const db = await openDatabase(),
    tx = db.transaction('cloud', 'readwrite')
  const previous = await tx.store.get('config')
  if (!previous || previous.url !== config.url || previous.key !== config.key)
    await tx.store.delete('progress')
  await tx.store.put(config, 'config')
  await tx.done
  return config
}
export async function readProgress(
  url: string,
  user: string,
): Promise<Progress> {
  const db = await openDatabase(),
    parsed = progressSchema.safeParse(await db.get('cloud', 'progress'))
  return parsed.success && parsed.data.url === url && parsed.data.user === user
    ? parsed.data
    : emptyProgress(url, user)
}
export async function writeProgress(p: Progress) {
  const db = await openDatabase()
  await db.put('cloud', progressSchema.parse(p), 'progress')
}
