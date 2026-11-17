import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cloud, Download, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useCloud } from './cloud-store'
import { useStore } from './store'
import { download } from './files'
import setupSQL from '../supabase/migrations/202611170001_attendance.sql?raw'

export default function ScannerSetup({
  expanded,
  ready,
  onToggle,
}: {
  expanded: boolean
  ready: boolean
  onToggle: () => void
}) {
  const c = useCloud(),
    { state, notify } = useStore()
  const [url, setUrl] = useState(''),
    [key, setKey] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('')
  const [operator, setOperator] = useState(state.config.operator),
    [working, setWorking] = useState(false)
  useEffect(() => {
    if (c.config) {
      setUrl(c.config.url)
      setKey(c.config.key)
    }
  }, [c.config])
  useEffect(() => {
    setOperator(state.config.operator)
  }, [state.config.operator])
  const run = async (fn: () => Promise<void>) => {
    setWorking(true)
    try {
      await fn()
    } catch (e) {
      notify(
        e instanceof Error ? e.message : 'Persiapan pemindai belum berhasil.',
        true,
      )
    } finally {
      setWorking(false)
    }
  }
  const busy = working || c.busy
  let sqlURL = ''
  try {
    const host = new URL(c.config?.url || '').hostname
    if (/^[a-z0-9-]+\.supabase\.co$/.test(host))
      sqlURL = `https://supabase.com/dashboard/project/${host.replace('.supabase.co', '')}/sql/new`
  } catch {
    /* Wait for valid project configuration. */
  }
  return (
    <section
      id="scanner-setup"
      className="panel scanner-setup"
      aria-label="Persiapan pemindai Supabase"
    >
      <div className="section-header">
        <div>
          <h2>
            {ready ? <CheckCircle2 size={20} /> : <Cloud size={20} />}{' '}
            {ready
              ? 'Pemindai siap digunakan'
              : 'Hubungkan pemindai ke Supabase'}
          </h2>
          <p>
            {ready
              ? `${state.config.station} · ${state.config.operator} · paket v${state.package_version}`
              : 'Siapkan akun, nama operator, dan roster di halaman ini sebelum menerima tamu.'}
          </p>
        </div>
        {ready && (
          <button className="secondary" onClick={onToggle}>
            {expanded ? 'Tutup persiapan' : 'Pengaturan pemindai'}
          </button>
        )}
      </div>
      {expanded && (
        <>
          <ol className="scanner-steps">
            <li>
              <strong>Database dan akun</strong>
              <span>
                {c.member
                  ? 'Penugasan akun sudah terverifikasi.'
                  : 'Pemilik proyek menjalankan SQL dan membuat akun petugas sekali sebelum acara.'}
              </span>
            </li>
            <li>
              <strong>Login petugas</strong>
              <span>
                {c.email
                  ? `Masuk: ${c.email}`
                  : 'Gunakan akun Supabase yang ditugaskan panitia.'}
              </span>
            </li>
            <li>
              <strong>Muat roster resmi</strong>
              <span>
                {state.package_version
                  ? `Paket v${state.package_version} tersedia di perangkat.`
                  : 'T05 harus membuat dan memublikasikan paket setelah mengesahkan undangan.'}
              </span>
            </li>
          </ol>
          {!c.member && (
            <div className="notice">
              <p>
                Backend belum pernah disiapkan? Buka SQL Editor, jalankan SQL
                pemasangan, buat akun di Authentication → Users dan isi
                rsas_members sesuai panduan. Kunci publik tidak dapat melakukan
                langkah administrator ini.
              </p>
              <div className="actions">
                {sqlURL && (
                  <a
                    href={sqlURL}
                    target="_blank"
                    rel="noreferrer"
                    className="button secondary"
                  >
                    Buka SQL Editor proyek
                  </a>
                )}
                <button
                  className="secondary"
                  onClick={() =>
                    download(setupSQL, 'rsas-supabase-setup.sql', 'text/plain')
                  }
                >
                  <Download size={17} />
                  SQL pemasangan
                </button>
                <a
                  className="button secondary"
                  href="https://github.com/sobri3195/Registrasi-Undangan-RSAS/blob/main/docs/SETUP_SUPABASE.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Panduan akun petugas
                </a>
              </div>
            </div>
          )}
          <div className="settings-grid">
            <div>
              {!c.config?.url || !c.config.key ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run(async () => {
                      await c.configure({
                        url: url.trim().replace(/\/$/, ''),
                        key: key.trim(),
                        enabled: false,
                      })
                      notify(
                        'Konfigurasi Supabase disimpan. Lanjutkan login petugas.',
                      )
                    })
                  }}
                >
                  <label>
                    URL Supabase pemindai
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://project-ref.supabase.co"
                      required
                      maxLength={300}
                    />
                  </label>
                  <label>
                    Publishable key pemindai
                    <input
                      type="password"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="sb_publishable_…"
                      required
                      maxLength={2000}
                      autoComplete="off"
                    />
                  </label>
                  <button disabled={busy}>Simpan koneksi pemindai</button>
                  <p className="muted">
                    Jangan gunakan secret/service_role key. Jika isian awal
                    kosong, periksa variabel VITE_SUPABASE_URL dan
                    VITE_SUPABASE_PUBLISHABLE_KEY di Vercel lalu redeploy.
                  </p>
                </form>
              ) : !c.email ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run(async () => {
                      try {
                        await c.login(email.trim(), password)
                      } finally {
                        setPassword('')
                      }
                    })
                  }}
                >
                  <label>
                    Email petugas pemindai
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label>
                    Password petugas pemindai
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <button disabled={busy}>Login pemindai</button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run(async () => {
                      await c.prepareScanner(operator)
                      notify(
                        'Identitas pemindai disimpan. Mengambil roster Supabase; tunggu status paket tersedia.',
                      )
                    })
                  }}
                >
                  <p>
                    Akun: <strong>{c.email}</strong>
                    {c.member && ` · ${c.member.station_id}`}
                  </p>
                  <label>
                    Nama operator pemindai
                    <input
                      value={operator}
                      onChange={(e) => setOperator(e.target.value)}
                      maxLength={300}
                      required
                      autoComplete="name"
                    />
                  </label>
                  <button disabled={busy}>
                    <RefreshCw size={17} />
                    Hubungkan & muat roster Supabase
                  </button>
                  <p className="muted">
                    Stasiun mengikuti penugasan akun. Sinkronisasi akan aktif
                    setelah nama operator disimpan.
                  </p>
                </form>
              )}
            </div>
            <div className="scanner-troubleshooting">
              <h3>Status persiapan</h3>
              <p>
                {c.error ||
                  (c.busy
                    ? 'Sedang menghubungkan dan mengambil roster…'
                    : state.package_version
                      ? `Paket v${state.package_version} sudah termuat.`
                      : 'Belum ada paket roster yang dimuat.')}
              </p>
              {state.slots.some((s) => s.status === 'draft') && (
                <p className="notice">
                  Ada draf lokal yang belum disahkan. Selesaikan pengesahan di
                  T05 sebelum membuat paket.
                </p>
              )}
              {c.email && !state.package_version && (
                <p>
                  Jika paket tetap kosong, koordinator perlu mengesahkan slot,
                  membuat paket, lalu memublikasikannya ke Supabase.
                </p>
              )}
              <div className="actions">
                <Link to="/koordinator/undangan" className="button secondary">
                  Daftar undangan T05
                </Link>
                <Link to="/koordinator/berkas" className="button secondary">
                  Buat paket T05
                </Link>
                <Link to="/pengaturan" className="button secondary">
                  Pengaturan lengkap
                </Link>
              </div>
              <p className="muted">
                Tanpa internet, impor paket JSON yang sudah disahkan dan isi
                operator melalui Pengaturan. Catatan offline tetap dapat
                diekspor.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
