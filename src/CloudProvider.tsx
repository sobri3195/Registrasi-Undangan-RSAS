import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useStore } from './store'
import { CloudStore } from './cloud-store'
import { applyCloud, pendingRecords } from './cloud-domain'
import type { CloudMember } from './cloud-domain'
import {
  cloudClient,
  cloudError,
  fetchMember,
  fetchRemote,
  supabaseFetch,
} from './cloud-client'
import {
  cloudConfigSchema,
  emptyProgress,
  readCloudConfig,
  readProgress,
  writeCloudConfig,
  writeProgress,
} from './cloud-model'
import type { CloudConfig, Progress } from './cloud-model'
import { EVENT } from './model'

export function CloudProvider({ children }: { children: ReactNode }) {
  const { state, commit } = useStore()
  const [config, setConfig] = useState<CloudConfig | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<CloudMember | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [progress, setProgress] = useState<Progress>(emptyProgress('', ''))
  const lock = useRef(false),
    current = useRef(state)
  useEffect(() => {
    current.current = state
  }, [state])
  useEffect(() => {
    readCloudConfig()
      .then(setConfig)
      .catch(() =>
        setError(
          'Pengaturan Supabase tidak dapat dibaca. Mode lokal tetap tersedia.',
        ),
      )
  }, [])
  const client = useMemo(
    () => (config?.url && config?.key ? cloudClient(config) : null),
    [config],
  )
  useEffect(() => {
    let disposed = false
    setSession(null)
    setMember(null)
    if (!client) return
    client.auth.startAutoRefresh()
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!disposed) {
          setSession(data.session)
          if (error) setError(cloudError(error))
        }
      })
      .catch((e) => {
        if (!disposed) setError(cloudError(e))
      })
    const { data } = client.auth.onAuthStateChange((_event, value) => {
      if (!disposed) setSession(value)
    })
    return () => {
      disposed = true
      data.subscription.unsubscribe()
      client.auth.stopAutoRefresh()
    }
  }, [client])
  const userId = session?.user.id
  useEffect(() => {
    let disposed = false
    setMember(null)
    if (!client || !userId || !config) {
      setProgress(emptyProgress('', ''))
      return
    }
    Promise.all([fetchMember(client), readProgress(config.url, userId)])
      .then(([m, p]) => {
        if (!disposed) {
          setMember(m)
          setProgress(p)
          setError('')
        }
      })
      .catch((e) => {
        if (!disposed) setError(cloudError(e))
      })
    return () => {
      disposed = true
    }
  }, [client, userId, config])

  const sync = useCallback(async () => {
    if (lock.current || !client || !config?.enabled || !userId) return
    lock.current = true
    setBusy(true)
    try {
      if (!navigator.onLine) throw new Error('Offline')
      if (!current.current.config.operator.trim())
        throw new Error(
          'Isi nama operator pada Pengaturan sebelum sinkronisasi.',
        )
      const m = await fetchMember(client)
      if (m.station_id !== current.current.config.station)
        throw new Error('RSAS_INVALID_RECORD')
      setMember(m)
      let p = await readProgress(config.url, userId)
      const pull = async () => {
        const remote = await fetchRemote(client, p.cursor)
        await commit((s) => applyCloud(s, remote.packages, remote.rows))
        p = { ...p, cursor: remote.cursor }
        await writeProgress(p)
        setProgress(p)
      }
      await pull()
      const records = pendingRecords(current.current, p.acked)
      for (let offset = 0; offset < records.length; offset += 200) {
        const batch = records.slice(offset, offset + 200)
        const { error } = await client.rpc('rsas_push_records', {
          p_event: EVENT,
          p_device: current.current.device_id,
          p_records: batch,
        })
        if (error) throw error
        p = {
          ...p,
          acked: [...new Set([...p.acked, ...batch.map((r) => r.record_id)])],
        }
        await writeProgress(p)
        setProgress(p)
      }
      await pull()
      p = { ...p, lastAt: new Date().toISOString() }
      await writeProgress(p)
      setProgress(p)
      setError('')
    } catch (e) {
      setError(cloudError(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }, [client, config, userId, commit])
  useEffect(() => {
    if (!config?.enabled || !userId) return
    void sync()
    const timer = window.setInterval(() => {
      void sync()
    }, 15000)
    const online = () => {
      void sync()
    }
    window.addEventListener('online', online)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', online)
    }
  }, [config?.enabled, userId, sync])

  async function configure(value: CloudConfig) {
    if (lock.current)
      throw new Error(
        'Tunggu sinkronisasi selesai sebelum mengganti pengaturan.',
      )
    const parsed = cloudConfigSchema.parse(value)
    if ((parsed.url || parsed.key) && (!parsed.url || !parsed.key))
      throw new Error('Isi Project URL dan publishable key bersama-sama.')
    const saved = await writeCloudConfig(parsed)
    setConfig(saved)
    setError('')
  }
  async function check() {
    if (!client)
      throw new Error(
        'Isi dan simpan Project URL serta publishable key terlebih dahulu.',
      )
    try {
      const response = await supabaseFetch(`${config!.url}/auth/v1/settings`, {
        headers: { apikey: config!.key },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Auth settings failed')
      setError('')
    } catch (e) {
      throw new Error(cloudError(e))
    }
  }
  async function login(email: string, password: string) {
    if (!client) throw new Error('Simpan pengaturan Supabase terlebih dahulu.')
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    })
    if (error)
      throw new Error(
        'Login belum berhasil. Periksa koneksi, email dan password akun petugas.',
      )
    setSession(data.session)
    try {
      setMember(await fetchMember(client))
      setError('')
    } catch (e) {
      setError(cloudError(e))
    }
  }
  async function logout() {
    if (lock.current)
      throw new Error('Tunggu sinkronisasi selesai sebelum keluar.')
    const result = await client?.auth.signOut({ scope: 'local' })
    if (result?.error)
      throw new Error(
        'Keluar Supabase belum berhasil. Periksa koneksi lalu coba lagi; catatan lokal tetap disimpan.',
      )
    setSession(null)
    setMember(null)
    setError('')
  }
  async function publish() {
    if (!client || !userId)
      throw new Error(
        'Login petugas terlebih dahulu sebelum memublikasikan paket.',
      )
    if (lock.current)
      throw new Error(
        'Tunggu sinkronisasi selesai sebelum memublikasikan paket.',
      )
    lock.current = true
    setBusy(true)
    try {
      const m = await fetchMember(client)
      if (m.role !== 'coordinator') throw new Error('RSAS_COORDINATOR_REQUIRED')
      if (
        !current.current.packages.length ||
        !current.current.slots.some((s) => s.token)
      )
        throw new Error(
          'Master lokal belum membuat paket. Buat paket melalui Paket & penggabungan terlebih dahulu.',
        )
      for (const p of current.current.packages) {
        const { error } = await client.rpc('rsas_publish_package', {
          p_package: p,
        })
        if (error) throw error
      }
      setError('')
    } catch (e) {
      const message =
        e instanceof Error && e.message.startsWith('Master lokal')
          ? e.message
          : cloudError(e)
      setError(message)
      throw new Error(message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <CloudStore.Provider
      value={{
        config,
        email: session?.user.email || null,
        member,
        busy,
        error,
        lastAt: progress.lastAt,
        pending: pendingRecords(state, progress.acked).length,
        configure,
        check,
        login,
        logout,
        sync,
        publish,
      }}
    >
      {children}
    </CloudStore.Provider>
  )
}
