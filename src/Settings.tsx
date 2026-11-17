import { useEffect, useState } from 'react'
import { Save, HardDrive, WifiOff, Tablet, CheckCircle2 } from 'lucide-react'
import { useStore } from './store'
import { audit, stations, wib } from './model'
import { useOffline } from './offline'
import { Badge } from './components'
import { CloudSettings } from './CloudSettings'
const roles = {
  T01: 'VIP / VVIP bersama protokol',
  T02: 'Reguler A',
  T03: 'Reguler B & mitra perusahaan',
  T04: 'Bantuan & check-in manual',
  T05: 'Master, koordinator & rekap',
  T06: 'Cadangan siap pakai',
}
export default function Settings() {
  const { state, commit, notify } = useStore()
  const [config, setConfig] = useState(state.config),
    [persisted, setPersisted] = useState<boolean | null>(null),
    [space, setSpace] = useState('Belum diperiksa')
  const offline = useOffline()
  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => undefined)
    navigator.storage
      ?.estimate?.()
      .then((s) =>
        setSpace(
          `${((s.usage || 0) / 1024 / 1024).toFixed(1)} MB terpakai / ${((s.quota || 0) / 1024 / 1024).toFixed(0)} MB kuota`,
        ),
      )
      .catch(() => undefined)
  }, [])
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PERANGKAT & KESIAPAN</span>
          <h1>Persiapkan meja Anda.</h1>
          <p>Pengaturan hanya berlaku pada instalasi dan profil browser ini.</p>
        </div>
        <Badge>Mode lokal</Badge>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <h2>
            <Tablet size={20} /> Identitas perangkat
          </h2>
          <p>
            Mode lokal membantu pembagian tugas. Ini bukan autentikasi terpusat.
          </p>
          <label>
            Label tablet fisik
            <select
              value={config.station}
              onChange={(e) =>
                setConfig({
                  ...config,
                  station: e.target.value as typeof config.station,
                })
              }
            >
              {stations.map((st) => (
                <option key={st} value={st}>
                  {st} · {roles[st]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nama operator yang ditugaskan
            <input
              value={config.operator}
              onChange={(e) =>
                setConfig({ ...config, operator: e.target.value })
              }
              maxLength={300}
              placeholder="Masukkan nama petugas"
            />
          </label>
          <label>
            Origin HTTPS resmi untuk kartu undangan
            <input
              type="url"
              value={config.officialOrigin}
              onChange={(e) =>
                setConfig({ ...config, officialOrigin: e.target.value })
              }
              placeholder="https://domain-resmi.vercel.app"
              maxLength={300}
            />
          </label>
          <p className="muted">
            Gunakan origin yang sama di semua tablet. Halaman Preview memakai
            data sintetis. Jangan menerbitkan kartu produksi dari Preview.
          </p>
          <button
            onClick={() => {
              if (!config.operator.trim()) {
                notify('Nama operator wajib diisi.', true)
                return
              }
              commit((s) => {
                s.config = config
                audit(
                  s,
                  'configure',
                  `Stasiun ${config.station}; operator lokal diperbarui`,
                )
              })
                .then(() => notify('Konfigurasi perangkat tersimpan.'))
                .catch(() => undefined)
            }}
          >
            <Save size={18} />
            Simpan pengaturan
          </button>
          <p className="muted code">Device ID: {state.device_id}</p>
        </section>
        <section className="panel">
          <h2>
            <CheckCircle2 size={20} /> Pemeriksaan kesiapan
          </h2>
          <ul className="readiness-list">
            <li>
              <span>Aset aplikasi offline</span>
              <Badge tone={offline.ready ? '' : 'gold'}>
                {offline.ready ? 'Cache lengkap' : 'Belum terbukti'}
              </Badge>
            </li>
            <li>
              <span>Paket roster</span>
              <Badge tone={state.package_version ? '' : 'gold'}>
                {state.package_version
                  ? `v${state.package_version}`
                  : 'Belum dimuat'}
              </Badge>
            </li>
            <li>
              <span>Identitas operator</span>
              <Badge tone={state.config.operator ? '' : 'gold'}>
                {state.config.operator ? 'Sudah diisi' : 'Belum diisi'}
              </Badge>
            </li>
            <li>
              <span>Koneksi</span>
              <Badge>{offline.online ? 'Online' : 'Offline'}</Badge>
            </li>
            <li>
              <span>Ketahanan penyimpanan</span>
              <Badge tone={persisted ? '' : 'gold'}>
                {persisted === null
                  ? 'Belum diketahui'
                  : persisted
                    ? 'Persisten'
                    : 'Best effort'}
              </Badge>
            </li>
          </ul>
          <p>{space}</p>
          <button
            className="secondary"
            onClick={() => {
              if (!navigator.storage?.persist) {
                notify(
                  'Permintaan penyimpanan persisten tidak didukung. Cadangkan berkas secara berkala.',
                  true,
                )
                return
              }
              navigator.storage
                .persist()
                .then((value) => {
                  setPersisted(value)
                  notify(
                    value
                      ? 'Penyimpanan persisten diberikan.'
                      : 'Browser belum memberi penyimpanan persisten. Cadangkan berkala.',
                  )
                })
                .catch(() =>
                  notify(
                    'Gagal meminta penyimpanan persisten. Cadangkan berkala.',
                    true,
                  ),
                )
            }}
          >
            <HardDrive size={18} />
            Minta penyimpanan persisten
          </button>
          <div className="notice">
            <WifiOff size={18} />
            <p>
              {offline.ready && state.package_version && state.config.operator
                ? 'Siap offline untuk uji perangkat.'
                : 'Siapkan cache, paket, dan operator terlebih dahulu.'}{' '}
              Tetap uji membuka ulang halaman, memindai QR, dan menyimpan ekspor
              dalam mode pesawat pada tablet yang sama.
            </p>
          </div>
          {offline.waiting && (
            <div className="notice">
              <p>
                Versi aplikasi baru menunggu. Aktifkan hanya setelah sesi
                registrasi selesai dan backup disimpan.
              </p>
              <button
                className="secondary"
                onClick={async () => {
                  if (
                    !window.confirm(
                      'Sesi selesai dan semua catatan sudah diekspor? Muat versi baru sekarang?',
                    )
                  )
                    return
                  const reg = await navigator.serviceWorker.getRegistration()
                  navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    () => location.reload(),
                    { once: true },
                  )
                  reg?.waiting?.postMessage('ACTIVATE_AFTER_SESSION')
                }}
              >
                Aktifkan setelah sesi selesai
              </button>
            </div>
          )}
        </section>
      </div>
      <CloudSettings />
      <section className="panel">
        <h2>Audit lokal</h2>
        <p>
          Jam berasal dari tablet. Aktifkan waktu otomatis dan cocokkan WIB
          sebelum registrasi.
        </p>
        <div className="audit-list">
          {state.audit
            .slice(-40)
            .reverse()
            .map((a) => (
              <article key={a.id}>
                <strong>{a.action}</strong>
                <p>{a.detail}</p>
                <small>
                  {wib(a.at)} · {a.operator || 'Operator belum diisi'}
                </small>
              </article>
            ))}
          {!state.audit.length && <p>Belum ada peristiwa audit.</p>}
        </div>
      </section>
    </>
  )
}
