import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Cloud,
  Download,
  LogIn,
  LogOut,
  RefreshCw,
  UploadCloud,
} from 'lucide-react'
import { useCloud } from './cloud-store'
import { useStore } from './store'
import { wib } from './model'
import { download } from './files'
import setupSQL from '../supabase/migrations/202611170001_attendance.sql?raw'

export function CloudStatus() {
  const c = useCloud()
  if (!c.config?.url) return null
  return (
    <section
      className={`cloud-status ${c.error ? 'cloud-warning' : ''}`}
      aria-label="Status Supabase"
    >
      <Cloud size={19} />
      <div aria-live="polite">
        <strong>
          {!c.config.enabled
            ? 'Supabase belum diaktifkan'
            : !c.email
              ? 'Supabase · login petugas diperlukan'
              : c.busy
                ? 'Supabase · menyinkronkan…'
                : `Supabase · ${c.pending} catatan lokal menunggu`}
        </strong>
        <small>
          {c.error ||
            (!c.config.enabled
              ? 'Mode lokal tetap berjalan. Aktifkan di Pengaturan setelah database siap.'
              : c.lastAt
                ? `Sinkron lengkap terakhir ${wib(c.lastAt)} · pembaruan setiap 15 detik saat online`
                : 'Belum ada sinkronisasi lengkap yang berhasil.')}
        </small>
      </div>
      <Link className="button secondary" to="/pengaturan">
        Atur Supabase
      </Link>
    </section>
  )
}
export function CloudSettings() {
  const c = useCloud(),
    { state, notify } = useStore()
  const [url, setUrl] = useState(''),
    [key, setKey] = useState(''),
    [enabled, setEnabled] = useState(false)
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [working, setWorking] = useState(false)
  useEffect(() => {
    if (c.config) {
      setUrl(c.config.url)
      setKey(c.config.key)
      setEnabled(c.config.enabled)
    }
  }, [c.config])
  const run = async (fn: () => Promise<void>, success: string) => {
    setWorking(true)
    try {
      await fn()
      notify(success)
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Pengaturan cloud belum berhasil.',
        true,
      )
    } finally {
      setWorking(false)
    }
  }
  const busy = working || c.busy
  return (
    <section className="panel cloud-settings" aria-label="Pengaturan Supabase">
      <div className="section-header">
        <div>
          <h2>
            <Cloud size={20} /> Supabase · sinkronisasi antar-tablet
          </h2>
          <p>
            Opsional. Check-in selalu disimpan lokal dahulu; antrean dikirim
            saat online dan login tersedia.
          </p>
        </div>
        <span className="badge">
          {c.config?.enabled ? 'Cloud diaktifkan' : 'Mode lokal'}
        </span>
      </div>
      <div className="notice">
        <strong>Pemasangan pertama:</strong> jalankan SQL pemasangan di Supabase
        SQL Editor, buat akun petugas di Authentication → Users, lalu berikan
        peran/stasiun melalui rsas_members. Publishable key saja tidak dapat
        membuat database atau memberikan peran.
      </div>
      <div className="settings-grid">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (
              c.config?.url &&
              url !== c.config.url &&
              state.records.length &&
              !window.confirm(
                'Beralih proyek? Antrean dan progres cloud akan dimulai ulang untuk proyek baru. Catatan lokal tetap disimpan.',
              )
            )
              return
            void run(async () => {
              await c.configure({
                url: url.trim().replace(/\/$/, ''),
                key: key.trim(),
                enabled,
              })
            }, 'Pengaturan Supabase tersimpan. Login petugas untuk menggunakan cloud.')
          }}
        >
          <label>
            Project URL Supabase
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={300}
              placeholder="https://project-ref.supabase.co"
              autoComplete="off"
            />
          </label>
          <label>
            Publishable key Supabase
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              maxLength={2000}
              placeholder="sb_publishable_…"
              autoComplete="off"
            />
          </label>
          <p className="muted">
            Gunakan publishable/anon key, bukan secret atau service_role. URL
            dan key publik disimpan pada perangkat ini; sesi login tidak masuk
            backup master.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Aktifkan sinkronisasi otomatis ke proyek ini
          </label>
          <div className="actions">
            <button disabled={busy} type="submit">
              Simpan Supabase
            </button>
            <button
              disabled={busy || !c.config?.url}
              type="button"
              className="secondary"
              onClick={() =>
                run(
                  c.check,
                  'Supabase Auth dapat diakses. Login dan skema acara tetap perlu diperiksa.',
                )
              }
            >
              <RefreshCw size={17} />
              Uji koneksi
            </button>
          </div>
        </form>
        <div>
          <h3>Login petugas</h3>
          {c.email ? (
            <>
              <p>
                Masuk sebagai <strong>{c.email}</strong>
              </p>
              <p>
                {c.member
                  ? `Peran: ${c.member.role === 'coordinator' ? 'Koordinator' : 'Petugas'} · stasiun ${c.member.station_id}`
                  : 'Penugasan acara belum terverifikasi.'}
              </p>
              {c.member && c.member.station_id !== state.config.station && (
                <p className="notice">
                  Ubah label tablet lokal menjadi {c.member.station_id} sesuai
                  penugasan akun sebelum sinkronisasi.
                </p>
              )}
              <button
                disabled={busy}
                className="secondary"
                onClick={() =>
                  run(
                    c.logout,
                    'Keluar dari Supabase. Catatan lokal dan antrean tetap disimpan.',
                  )
                }
              >
                <LogOut size={17} />
                Keluar Supabase
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => {
                  try {
                    await c.login(email.trim(), password)
                  } finally {
                    setPassword('')
                  }
                }, 'Login selesai. Periksa penugasan akun dan status sinkronisasi.')
              }}
            >
              <label>
                Email akun petugas
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password akun petugas
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <button disabled={busy || !c.config?.url}>
                <LogIn size={17} />
                Masuk Supabase
              </button>
            </form>
          )}
          <p className="muted">
            Akun dibuat oleh panitia. Halaman tamu tidak membaca roster
            Supabase. Mode lokal tetap memerlukan kendali perangkat panitia.
          </p>
        </div>
      </div>
      <div className="cloud-actions">
        <div>
          <strong>
            {c.pending} catatan perangkat ini belum dikonfirmasi cloud
          </strong>
          <p>
            {c.lastAt
              ? `Sinkron lengkap terakhir: ${wib(c.lastAt)}`
              : 'Belum ada sinkronisasi lengkap.'}{' '}
            Ekspor JSON tetap tersedia sebagai cadangan dan rekonsiliasi
            penutupan.
          </p>
        </div>
        <div className="actions">
          <button
            className="secondary"
            disabled={busy || !c.email || !c.config?.enabled}
            onClick={() => c.sync()}
          >
            <RefreshCw size={17} />
            Sinkronkan sekarang
          </button>
          {c.member?.role === 'coordinator' && (
            <button
              disabled={busy}
              onClick={() =>
                run(
                  c.publish,
                  'Riwayat paket roster berhasil dipublikasikan. Tablet petugas dapat menyinkronkan paket.',
                )
              }
            >
              <UploadCloud size={17} />
              Publikasikan paket T05
            </button>
          )}
          <button
            className="secondary"
            onClick={() =>
              download(setupSQL, 'rsas-supabase-setup.sql', 'text/plain')
            }
          >
            <Download size={17} />
            Unduh SQL pemasangan
          </button>
        </div>
      </div>
      <p className="muted">
        Buat paket melalui Koordinator → Paket & penggabungan sebelum
        dipublikasikan. Cloud hanya menyimpan paket berisi hash dan jejak
        kehadiran; token penerbitan, draf, RSVP master serta penyebut tetap
        dikelola dan dicadangkan di T05. Impor JSON final tiap meja tetap
        diperlukan untuk menutup status Sementara.
      </p>
    </section>
  )
}
