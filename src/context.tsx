import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { State } from './model'
import { load, mutate } from './storage'
import { Store } from './store'
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [failure, setFailure] = useState('')
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  )
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  )
  useEffect(() => {
    load()
      .then(setState)
      .catch(() =>
        setFailure(
          'Penyimpanan IndexedDB tidak dapat dibuka. Gunakan profil browser kerja biasa, periksa ruang kosong, lalu muat ulang. Jangan hapus data browser. Jika tetap gagal, gunakan tablet cadangan atau daftar hadir kertas.',
        ),
      )
    const refresh = () => {
      load()
        .then(setState)
        .catch(() =>
          notify(
            'Gagal membaca penyimpanan. Gunakan cadangan atau pencatatan kertas.',
            true,
          ),
        )
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [notify])
  async function commit<T>(change: (s: State) => T) {
    try {
      const updated = await mutate(change)
      setState(updated.state)
      return updated.result
    } catch (error) {
      notify(
        error instanceof DOMException
          ? `Gagal tersimpan. ${error.message} Coba ulang; jika tetap gagal gunakan tablet cadangan atau daftar hadir kertas. Ekspor data yang masih dapat dibaca.`
          : error instanceof Error
            ? error.message
            : 'Gagal tersimpan. Coba ulang atau gunakan daftar hadir kertas.',
        true,
      )
      throw error
    }
  }
  if (failure)
    return (
      <main className="fatal">
        <h1>Penyimpanan belum tersedia</h1>
        <p role="alert">{failure}</p>
        <button onClick={() => location.reload()}>Muat ulang</button>
      </main>
    )
  if (!state)
    return (
      <main className="fatal" aria-busy="true">
        Membuka penyimpanan lokal…
      </main>
    )
  return (
    <Store.Provider value={{ state, commit, notify }}>
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          <span>{toast.text}</span>
          <button
            aria-label="Tutup pemberitahuan"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </Store.Provider>
  )
}
