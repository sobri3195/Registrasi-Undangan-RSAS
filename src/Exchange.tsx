import { useState } from 'react'
import {
  Download,
  FileJson,
  Layers,
  Shield,
  ArrowDownToLine,
} from 'lucide-react'
import { useStore } from './store'
import {
  checkin,
  hash,
  issuePackage,
  merge,
  previewImport,
  stationExport,
} from './domain'
import { EVENT, audit, backupSchema, requireOperator, wib } from './model'
import type { State } from './model'
import { Badge, FileInput, Modal } from './components'
import { filename, jsonDownload, readJSON } from './files'

export default function Exchange() {
  const { state, commit, notify } = useStore()
  const [files, setFiles] = useState<unknown[] | null>(null)
  const [preview, setPreview] = useState<ReturnType<
    typeof previewImport
  > | null>(null)
  const [backup, setBackup] = useState<State | null>(null),
    [busy, setBusy] = useState(false)
  const [slotId, setSlotId] = useState(''),
    [representative, setRepresentative] = useState(''),
    [paperTime, setPaperTime] = useState('')
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      notify((e as Error).message, true)
    }
  }
  async function inspect(files: File[]) {
    await run(async () => {
      const data = await Promise.all(files.map(readJSON))
      setPreview(previewImport(state, data))
      setFiles(data)
    })
  }
  async function inspectBackup(file: File) {
    await run(async () => {
      const b = backupSchema.parse(await readJSON(file))
      if (!b.state.slots.some((s) => s.token))
        throw new Error('Berkas ini bukan backup master penerbit undangan.')
      if (
        new Set(b.state.slots.map((s) => s.id)).size !== b.state.slots.length ||
        new Set(b.state.slots.map((s) => s.code)).size !== b.state.slots.length
      )
        throw new Error('Backup memiliki slot duplikat.')
      if (
        new Set(b.state.packages.map((p) => p.package_version)).size !==
        b.state.packages.length
      )
        throw new Error('Revisi paket backup duplikat.')
      for (const s of b.state.slots)
        if (s.token && (await hash(s.token)) !== s.tokenHash)
          throw new Error('Token backup tidak cocok dengan hash.')
      // Reuse log validation for package/slot references, IDs, and correction targets.
      const logs = new Map<string, typeof b.state.records>()
      b.state.records.forEach((r) =>
        logs.set(r.device_id, [...(logs.get(r.device_id) || []), r]),
      )
      if (
        new Set(b.state.records.map((r) => r.record_id)).size !==
        b.state.records.length
      )
        throw new Error('ID catatan backup duplikat.')
      const exports = [...logs].map(([device_id, records]) => ({
        schema_version: 1,
        type: 'station-log',
        event_id: EVENT,
        device_id,
        station_id: records[0].station_id,
        package_version: b.state.package_version,
        exported_at: b.exported_at,
        records,
      }))
      previewImport({ ...b.state, records: [] }, exports)
      setBackup(b.state)
    })
  }
  return (
    <>
      <div className="section-header">
        <div>
          <h2>Paket & penggabungan</h2>
          <p>
            Transfer berkas melalui jalur internal yang telah diuji. Tidak ada
            sinkronisasi cloud.
          </p>
        </div>
        <Badge>Format JSON v1</Badge>
      </div>
      <div className="exchange-grid">
        <section className="panel">
          <div className="feature-icon">
            <Layers size={24} />
          </div>
          <h2>1. Paket roster tablet</h2>
          <p>
            Terbitkan dari master T05, lalu salin ke T01–T04 dan T06. Hanya
            metadata pencocokan dan hash token yang disertakan.
          </p>
          <p>
            <strong>
              Versi saat ini:{' '}
              {state.package_version
                ? `v${state.package_version}`
                : 'belum diterbitkan'}
            </strong>
          </p>
          <button
            onClick={() =>
              run(async () => {
                if (!state.slots.some((s) => s.token))
                  throw new Error(
                    'Paket hanya diterbitkan dari master yang menyimpan token asli.',
                  )
                const p = await commit((s) => issuePackage(s))
                jsonDownload(p, filename(`paket-v${p.package_version}`))
                notify(
                  'Paket dibuat. Distribusikan versi yang sama ke semua tablet.',
                )
              })
            }
          >
            <Download size={18} />
            Buat & unduh paket baru
          </button>
          {state.packages.at(-1) && (
            <button
              className="text-button"
              onClick={() =>
                jsonDownload(
                  state.packages.at(-1),
                  filename(`paket-v${state.package_version}`),
                )
              }
            >
              Unduh ulang paket v{state.package_version}
            </button>
          )}
          <p className="muted">
            Draf tidak masuk paket. Pembatalan atau penggantian QR berlaku
            setelah paket baru diimpor ke setiap tablet.
          </p>
        </section>
        <section className="panel">
          <div className="feature-icon">
            <FileJson size={24} />
          </div>
          <h2>2. Gabungkan catatan</h2>
          <p>
            Ekspor JSON dari setiap tablet yang digunakan, termasuk T05 bila
            mencatat. Anda dapat memilih beberapa berkas sekaligus.
          </p>
          <FileInput
            label="Pilih JSON catatan tablet"
            accept=".json,application/json"
            multiple
            onFiles={inspect}
          />
          <button
            className="text-button"
            onClick={() => {
              try {
                jsonDownload(
                  stationExport(state),
                  filename('catatan', state.config.station),
                )
              } catch (e) {
                notify((e as Error).message, true)
              }
            }}
          >
            <ArrowDownToLine size={16} />
            Ekspor catatan tablet ini
          </button>
          <p className="muted">
            Impor berulang aman. Konflik ID membatalkan seluruh batch dan
            mempertahankan data tersimpan.
          </p>
        </section>
        <section className="panel">
          <div className="feature-icon gold">
            <Shield size={24} />
          </div>
          <h2>3. Backup master privat</h2>
          <p>
            Berisi token penerbitan, roster, RSVP, audit, riwayat paket, dan
            seluruh catatan gabungan. Simpan secara terbatas.
          </p>
          <div className="actions">
            <button
              className="secondary"
              onClick={() =>
                jsonDownload(
                  {
                    schema_version: 1,
                    type: 'master-backup',
                    event_id: EVENT,
                    exported_at: new Date().toISOString(),
                    state,
                  },
                  filename('BACKUP-PRIVAT'),
                )
              }
            >
              <Download size={18} />
              Backup master
            </button>
            <FileInput
              label="Pulihkan backup"
              accept=".json,application/json"
              onFiles={(files) => inspectBackup(files[0])}
            />
          </div>
          <p className="muted">
            Pemulihan hanya pada master kosong untuk mencegah kehilangan data
            lokal. Identitas perangkat baru dipertahankan.
          </p>
        </section>
        <section className="panel">
          <h2>Masukkan catatan kertas</h2>
          <p>
            Gunakan waktu kedatangan yang tertulis, bukan waktu input. Stasiun
            dan operator diambil dari pengaturan perangkat; sesuaikan dengan
            asal kertas sebelum input.
          </p>
          <label>
            Undangan
            <select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
              <option value="">Pilih slot aktif</option>
              {state.slots
                .filter((s) => ['active', 'extra'].includes(s.status))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name || s.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Nama yang datang
            <input
              value={representative}
              onChange={(e) => setRepresentative(e.target.value)}
              maxLength={300}
            />
          </label>
          <label>
            Waktu observasi WIB
            <input
              type="datetime-local"
              value={paperTime}
              onChange={(e) => setPaperTime(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={!slotId || !paperTime}
            onClick={() =>
              run(async () => {
                const r = await commit((s) =>
                  checkin(
                    s,
                    slotId,
                    representative,
                    'paper',
                    `${paperTime}:00+07:00`,
                  ),
                )
                notify(
                  r.duplicate
                    ? 'Slot sudah tercatat di tablet ini. Tinjau catatan pertama untuk koreksi.'
                    : 'Catatan kertas tersimpan dengan waktu observasi WIB.',
                )
                setRepresentative('')
              })
            }
          >
            Simpan dari kertas
          </button>
        </section>
      </div>
      <section className="panel">
        <h2>Riwayat impor terakhir</h2>
        {state.receipts
          .slice(-12)
          .reverse()
          .map((r, i) => (
            <p key={`${r.device}-${i}`}>
              <strong>{r.station}</strong> · {r.count} catatan · diimpor{' '}
              {wib(r.at)} <small>Berkas dibuat {wib(r.exportedAt)}</small>
            </p>
          ))}
        {!state.receipts.length && <p>Belum ada berkas yang digabungkan.</p>}
      </section>
      {preview && files && (
        <Modal
          title="Pratinjau penggabungan"
          onClose={() => {
            setPreview(null)
            setFiles(null)
          }}
        >
          <div className="import-counts">
            <span>
              <strong>{preview.newRecords.length}</strong>Baru
            </span>
            <span>
              <strong>{preview.duplicates}</strong>Sudah ada
            </span>
            <span>
              <strong>{preview.conflicts.length}</strong>Konflik ID
            </span>
            <span>
              <strong>{preview.review}</strong>Slot ditinjau
            </span>
          </div>
          {preview.parsed.map((f, i) => (
            <p key={i}>
              <strong>{f.station_id}</strong> · paket v{f.package_version} ·{' '}
              {f.records.length} catatan
              <br />
              <small>
                Dibuat {wib(f.exported_at)} · perangkat {f.device_id}
              </small>
            </p>
          ))}
          {!!preview.conflicts.length && (
            <p className="notice error">
              ID sama dengan data berbeda. Batch ini tidak akan diimpor. Simpan
              berkas asli dan minta koordinator menelusuri konflik.
            </p>
          )}
          <button
            className="wide"
            disabled={!!preview.conflicts.length || busy}
            onClick={() =>
              run(async () => {
                setBusy(true)
                try {
                  const result = await commit((s) => merge(s, files))
                  setFiles(null)
                  setPreview(null)
                  notify(
                    `${result.newRecords.length} catatan digabungkan. Kehadiran dihitung satu per slot.`,
                  )
                } finally {
                  setBusy(false)
                }
              })
            }
          >
            Gabungkan secara atomik
          </button>
        </Modal>
      )}
      {backup && (
        <Modal title="Pulihkan master privat" onClose={() => setBackup(null)}>
          <p>
            {backup.slots.length} slot · {backup.records.length} catatan · paket
            v{backup.package_version}
          </p>
          <p>
            Pastikan ini master pengganti. Perangkat berisi data tidak dapat
            ditimpa; ekspor dan amankan data tersebut terlebih dahulu.
          </p>
          <button
            className="wide"
            onClick={() =>
              run(async () => {
                await commit((s) => {
                  requireOperator(s)
                  if (s.slots.length || s.records.length || s.packages.length)
                    throw new Error(
                      'Pemulihan hanya diizinkan pada master kosong. Jangan hapus data lokal untuk melewati pemeriksaan ini.',
                    )
                  const device = s.device_id,
                    operator = s.config.operator
                  Object.assign(s, structuredClone(backup), {
                    device_id: device,
                  })
                  s.config.station = 'T05'
                  s.config.operator = operator
                  audit(
                    s,
                    'restore',
                    `Backup ${backup.slots.length} slot; identitas perangkat baru dipertahankan`,
                  )
                })
                setBackup(null)
                notify(
                  'Master dipulihkan. Periksa konfigurasi dan versi paket sebelum dipakai.',
                )
              })
            }
          >
            Pulihkan pada master kosong
          </button>
        </Modal>
      )}
    </>
  )
}
