import { useCallback, useState } from 'react'
import {
  Camera,
  Search,
  Download,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { useStore } from './store'
import {
  checkin,
  effective,
  hash,
  importPackage,
  parseCheckin,
  stationExport,
} from './domain'
import { wib } from './model'
import type { AttendanceRecord, Slot } from './model'
import { FileInput, Badge, Modal, Empty } from './components'
import Scanner from './Scanner'
import { filename, jsonDownload, readJSON } from './files'

export default function Petugas() {
  const { state, commit, notify } = useStore()
  const [query, setQuery] = useState(''),
    [company, setCompany] = useState(''),
    [group, setGroup] = useState('')
  const [camera, setCamera] = useState(false),
    [selected, setSelected] = useState<Slot | null>(null)
  const [representative, setRepresentative] = useState(''),
    [source, setSource] = useState<'qr' | 'manual'>('manual')
  const [result, setResult] = useState<{
    record: AttendanceRecord
    duplicate: boolean
  } | null>(null)
  const [saving, setSaving] = useState(false),
    [payload, setPayload] = useState('')
  const onScan = useCallback(
    (value: string) => {
      setCamera(false)
      ;(async () => {
        const t = parseCheckin(value),
          h = await hash(t)
        const slot = state.slots.find(
          (s) => s.tokenHash === h && ['active', 'extra'].includes(s.status),
        )
        if (!slot)
          throw new Error(
            'QR tidak cocok dengan paket aktif. Periksa versi paket atau hubungi koordinator.',
          )
        setSelected(slot)
        setRepresentative(slot.representative || slot.name)
        setSource('qr')
        setResult(null)
      })().catch((e) => notify(e.message, true))
    },
    [state.slots, notify],
  )
  function choose(slot: Slot) {
    setCamera(false)
    setSelected(slot)
    setRepresentative(slot.representative || slot.name)
    setSource('manual')
    setResult(null)
  }
  const active = state.slots.filter((s) =>
    ['active', 'extra'].includes(s.status),
  )
  const companies = [
    ...new Set(active.map((s) => s.organization).filter(Boolean)),
  ].sort()
  const filtered = active.filter(
    (s) =>
      (!company || s.organization === company) &&
      (!group || s.group === group) &&
      `${s.code} ${s.name} ${s.label} ${s.organization} ${s.representative}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  )
  const localCount = new Set(
    state.records
      .filter(
        (r) =>
          r.device_id === state.device_id &&
          r.action === 'checkin' &&
          effective(state, r.invitation_id).chosen,
      )
      .map((r) => r.invitation_id),
  ).size
  async function save() {
    if (!selected || saving) return
    setSaving(true)
    try {
      const value = await commit((s) =>
        checkin(s, selected.id, representative, source),
      )
      setResult(value)
      notify(
        value.duplicate
          ? 'Catatan pertama ditemukan. Kehadiran tidak ditambahkan lagi.'
          : 'Hadir tercatat di tablet ini. Ekspor berkala untuk digabungkan di T05.',
      )
    } catch {
      /* Store displays an actionable error; leave dialog open for retry. */
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            MEJA PENERIMAAN · {state.config.station}
          </span>
          <h1>Selamat datang, tamu RSAS.</h1>
          <p>Pindai QR atau cari undangan, lalu cocokkan tamu yang hadir.</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            try {
              jsonDownload(
                stationExport(state),
                filename('catatan', state.config.station),
              )
              notify('Berkas dibuat. Pastikan tersimpan lalu kirim ke T05.')
            } catch (e) {
              notify((e as Error).message, true)
            }
          }}
        >
          <Download size={18} />
          Ekspor catatan tablet
        </button>
      </div>
      <div className="operator-banner">
        <div>
          <strong>{localCount} kehadiran di tablet ini</strong>
          <span>
            Paket{' '}
            {state.package_version
              ? `v${state.package_version}`
              : 'belum dimuat'}{' '}
            · {state.config.operator || 'Nama operator belum diisi'}
          </span>
        </div>
        <FileInput
          label="Impor paket roster"
          accept=".json,application/json"
          onFiles={(files) => {
            readJSON(files[0])
              .then((p) => commit((s) => importPackage(s, p)))
              .then(() =>
                notify('Paket dimuat. Cocokkan versinya dengan semua tablet.'),
              )
              .catch((e) => notify(e.message, true))
          }}
        />
      </div>
      {!state.config.operator && (
        <p className="notice">
          Isi nama operator dan label tablet pada Pengaturan sebelum mencatat
          kehadiran.
        </p>
      )}
      <div className="scan-callout">
        <div className="scan-symbol">
          <Camera size={32} />
        </div>
        <div>
          <h2>Check-in dengan QR</h2>
          <p>Gunakan QR check-in dari layar ponsel atau kartu cetak.</p>
        </div>
        <button
          onClick={() => setCamera(true)}
          disabled={!state.package_version}
        >
          <Camera size={18} />
          Pindai QR
        </button>
      </div>
      {camera && <Scanner onScan={onScan} onClose={() => setCamera(false)} />}
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Cari undangan</h2>
            <p>
              Tanpa QR? Temukan berdasarkan nama, instansi, jabatan, atau kode.
            </p>
          </div>
          <Badge>{filtered.length} slot aktif</Badge>
        </div>
        <div className="filter-row">
          <label className="search">
            <Search size={19} />
            <input
              aria-label="Cari undangan"
              placeholder="Cari nama, instansi, atau kode undangan…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setCamera(false)
              }}
            />
          </label>
          <select
            aria-label="Filter perusahaan"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value)
              setCamera(false)
            }}
          >
            <option value="">Semua perusahaan / instansi</option>
            {companies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Filter kelompok tamu"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value)
              setCamera(false)
            }}
          >
            <option value="">Semua kelompok</option>
            {[...new Set(active.map((s) => s.group).filter(Boolean))].map(
              (g) => (
                <option key={g}>{g}</option>
              ),
            )}
          </select>
        </div>
        {!filtered.length ? (
          <Empty
            title={
              active.length
                ? 'Undangan belum ditemukan'
                : 'Paket roster belum tersedia'
            }
          >
            {active.length
              ? 'Periksa ejaan atau arahkan tamu ke meja bantuan T04.'
              : 'Minta paket roster resmi dari T05, lalu impor di tablet ini.'}
          </Empty>
        ) : (
          <div className="guest-list">
            {filtered.slice(0, 100).map((s) => (
              <button
                className="guest-row"
                key={s.id}
                onClick={() => choose(s)}
              >
                <span className="avatar">
                  {(s.name || s.label).slice(0, 1)}
                </span>
                <span className="guest-info">
                  <strong>{s.name || s.label}</strong>
                  <small>
                    {s.organization || s.label} · {s.code}
                  </small>
                </span>
                <Badge tone={s.category !== 'REGULER' ? 'gold' : ''}>
                  {s.category}
                </Badge>
                <span className="row-status">
                  {effective(state, s.id).chosen
                    ? 'Sudah hadir lokal'
                    : 'Cocokkan tamu'}
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
            {filtered.length > 100 && (
              <p>100 hasil pertama. Persempit pencarian.</p>
            )}
          </div>
        )}
        <details className="payload-input">
          <summary>Masukkan teks QR sebagai alternatif</summary>
          <label>
            Payload QR
            <input
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              placeholder="RSAS-CI1:…"
              autoComplete="off"
            />
          </label>
          <button
            className="secondary"
            onClick={() => {
              onScan(payload)
              setPayload('')
            }}
          >
            Cocokkan QR
          </button>
        </details>
      </section>
      <p className="muted footnote">
        Catatan hanya tersimpan di perangkat ini. Ekspor berkala untuk
        digabungkan di T05. Kamera bermasalah? Gunakan pencarian manual atau
        daftar hadir kertas.
      </p>
      {selected && (
        <Modal
          title={result ? 'Hasil check-in' : 'Cocokkan undangan'}
          onClose={() => setSelected(null)}
        >
          {result ? (
            <div className="checkin-success">
              <CheckCircle2 size={48} />
              <h2>
                {result.duplicate
                  ? 'Sudah tercatat di tablet ini'
                  : 'Hadir tercatat di tablet ini'}
              </h2>
              <p>{result.record.representative || selected.label}</p>
              <p>
                {wib(result.record.occurred_at)} · {result.record.station_id}
              </p>
              <button className="wide" onClick={() => setSelected(null)}>
                Tamu berikutnya <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <>
              <div className="identity-card">
                <Badge tone="gold">{selected.category}</Badge>
                <h2>{selected.name || selected.label}</h2>
                <p>{selected.organization}</p>
                <p className="code">
                  {selected.code} {selected.desk && `· Meja ${selected.desk}`}
                </p>
              </div>
              <label>
                Nama orang yang datang{' '}
                {selected.kind === 'institution' && '(wajib)'}
                <input
                  value={representative}
                  onChange={(e) => setRepresentative(e.target.value)}
                  maxLength={300}
                />
              </label>
              <p>
                Pastikan nama atau perwakilan sesuai undangan. Satu slot untuk
                satu orang.
              </p>
              <button className="wide" disabled={saving} onClick={save}>
                {saving ? 'Menyimpan…' : 'Catat hadir'}
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
