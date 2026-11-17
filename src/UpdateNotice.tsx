import { useState } from 'react'
import { useOffline } from './offline'

export default function UpdateNotice() {
  const offline = useOffline(),
    [message, setMessage] = useState(''),
    [checking, setChecking] = useState(false)
  async function check() {
    if (!('serviceWorker' in navigator)) {
      setMessage('Pembaruan offline tidak didukung browser ini.')
      return
    }
    setChecking(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) {
        setMessage(
          'Buka deployment produksi secara online untuk mempersiapkan aplikasi.',
        )
        return
      }
      await reg.update()
      setMessage(
        reg.waiting
          ? 'Versi baru menunggu. Aktifkan setelah sesi selesai dan backup diamankan.'
          : 'Pemeriksaan diminta. Versi baru dapat memerlukan beberapa detik untuk diunduh; status akan diperbarui otomatis.',
      )
    } catch {
      setMessage('Pemeriksaan versi gagal. Periksa koneksi lalu coba lagi.')
    } finally {
      setChecking(false)
    }
  }
  async function activate() {
    if (
      !window.confirm(
        'Sesi selesai dan semua catatan sudah diekspor? Muat versi baru tanpa menghapus data lokal?',
      )
    )
      return
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg?.waiting) {
      setMessage('Tidak ada versi menunggu. Periksa versi terbaru dahulu.')
      return
    }
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => location.reload(),
      { once: true },
    )
    reg.waiting.postMessage('ACTIVATE_AFTER_SESSION')
  }
  return (
    <section
      className={offline.waiting ? 'notice update-notice' : 'update-notice'}
      aria-label="Versi aplikasi"
    >
      <div>
        <strong>
          {offline.waiting
            ? 'Pembaruan aplikasi tersedia'
            : `Versi aplikasi ${__APP_BUILD__}`}
        </strong>
        {message && <p aria-live="polite">{message}</p>}
      </div>
      <div className="actions">
        <button className="text-button" onClick={check} disabled={checking}>
          Periksa versi terbaru
        </button>
        {offline.waiting && (
          <button
            className="secondary"
            onClick={() =>
              activate().catch(() =>
                setMessage(
                  'Pembaruan gagal dimulai. Catatan lokal tetap disimpan.',
                ),
              )
            }
          >
            Aktifkan setelah sesi selesai
          </button>
        )}
      </div>
    </section>
  )
}
