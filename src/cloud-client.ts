import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { EVENT, packageSchema } from './model'
import type { CloudConfig } from './cloud-model'
import { cloudRowSchema, memberSchema } from './cloud-domain'
import type { CloudRow } from './cloud-domain'

const clients = new Map<string, SupabaseClient>()
export async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const original =
    init?.signal || (input instanceof Request ? input.signal : undefined)
  const abort = () => controller.abort()
  const timer = setTimeout(abort, 15000)
  if (original?.aborted) abort()
  original?.addEventListener('abort', abort, { once: true })
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    })
  } finally {
    clearTimeout(timer)
    original?.removeEventListener('abort', abort)
  }
}
export function cloudClient(config: CloudConfig) {
  const id = `${config.url}|${config.key}`
  if (!clients.has(id))
    clients.set(
      id,
      createClient(config.url, config.key, {
        global: { fetch: supabaseFetch },
        auth: {
          storageKey: `rsas-auth-${new URL(config.url).hostname}`,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      }),
    )
  return clients.get(id)!
}
export function cloudError(error: unknown) {
  if (error instanceof z.ZodError)
    return 'Data cloud tidak valid. Sinkronisasi dibatalkan; data lokal dipertahankan.'
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''
  const messages: Record<string, string> = {
    RSAS_MEMBER_REQUIRED:
      'Akun belum ditugaskan pada acara ini. Tambahkan ke rsas_members melalui SQL Editor.',
    RSAS_COORDINATOR_REQUIRED:
      'Hanya akun koordinator yang dapat menerbitkan paket atau mengirim koreksi.',
    RSAS_DEVICE_OWNER:
      'Perangkat terikat ke akun petugas lain. Gunakan akun asal atau minta pengalihan oleh administrator.',
    RSAS_RECORD_CONFLICT:
      'ID catatan cloud bentrok. Data asal dipertahankan; minta koordinator meninjau.',
    RSAS_PACKAGE_CONFLICT:
      'Versi paket cloud bentrok. Gunakan master penerbitan yang sama; jangan menimpa token lokal.',
    RSAS_PACKAGE_SEQUENCE:
      'Riwayat versi paket tidak lengkap. Publikasikan dari master dengan seluruh riwayat paket.',
    RSAS_UNKNOWN_PACKAGE:
      'Versi paket belum diterbitkan ke Supabase. Minta T05 memublikasikan paket terlebih dahulu.',
    RSAS_UNKNOWN_SLOT:
      'Slot tidak dikenal pada paket cloud. Periksa versi paket dan kode undangan.',
    RSAS_INVALID_TARGET:
      'Target koreksi belum ada di cloud. Sinkronkan tablet asal terlebih dahulu.',
    RSAS_INVALID_RECORD:
      'Catatan tidak sesuai akun/stasiun atau format cloud. Periksa penugasan dan pengaturan tablet.',
    RSAS_STABLE_SLOT_REQUIRED:
      'ID slot paket berubah. Pertahankan slot lama dan gunakan status dibatalkan.',
  }
  for (const [code, text] of Object.entries(messages))
    if (message.includes(code)) return text
  if (
    /rsas_status|schema cache|PGRST202|Could not find the function|does not exist/i.test(
      message,
    )
  )
    return 'Skema Supabase belum siap. Jalankan SQL pemasangan di SQL Editor, lalu coba lagi.'
  if (
    /^(Versi paket cloud|Paket cloud|Master lokal|Isi nama operator)/.test(
      message,
    )
  )
    return message
  return 'Koneksi Supabase belum berhasil. Periksa internet, URL, publishable key, login, dan skema. Catatan lokal tetap tersedia.'
}
export async function fetchMember(client: SupabaseClient) {
  const { data, error } = await client.rpc('rsas_status', { p_event: EVENT })
  if (error) throw error
  return memberSchema.parse(data)
}
export async function fetchRemote(client: SupabaseClient, cursor: number) {
  const packages = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from('rsas_packages')
      .select('payload')
      .eq('event_id', EVENT)
      .order('package_version')
      .range(offset, offset + 999)
    if (error) throw error
    const page = z.array(z.object({ payload: packageSchema })).parse(data)
    packages.push(...page.map((row) => row.payload))
    if (page.length < 1000) break
  }
  const rows: CloudRow[] = []
  let next = cursor
  for (;;) {
    const { data, error } = await client
      .from('rsas_records')
      .select('seq,payload,received_at')
      .eq('event_id', EVENT)
      .gt('seq', next)
      .order('seq')
      .limit(1000)
    if (error) throw error
    const page = z.array(cloudRowSchema).parse(data)
    if (page.some((row, i) => row.seq <= (i ? page[i - 1].seq : next)))
      throw new Error('Urutan catatan cloud tidak valid')
    rows.push(...page)
    if (page.length) next = page.at(-1)!.seq
    if (page.length < 1000) break
  }
  return { packages, rows, cursor: next }
}
