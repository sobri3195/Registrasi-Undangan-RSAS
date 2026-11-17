import { useState } from 'react'
import {
  ArrowUpRight,
  Users,
  UserCheck,
  MailCheck,
  Target,
  Clock3,
  Download,
} from 'lucide-react'
import { useStore } from './store'
import {
  approveDenominator,
  correct,
  csvReport,
  effective,
  metrics,
} from './domain'
import { audit, stations, TOR_REFERENCE, TOR_TARGET, wib } from './model'
import type { AttendanceRecord } from './model'
import { Badge, Empty, Modal } from './components'
import { download, filename } from './files'

export default function Dashboard() {
  const { state, commit, notify } = useStore()
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [station, setStation] = useState(''),
    [status, setStatus] = useState(''),
    [group, setGroup] = useState('')
  const [review, setReview] = useState<string | null>(null),
    [reason, setReason] = useState('')
  const m = metrics(state)
  const groups = [
    ...new Set(
      state.slots
        .filter((s) => s.status === 'active')
        .map((s) => s.organization || 'Tanpa instansi'),
    ),
  ]
    .map((name) => {
      const slots = state.slots.filter(
        (s) =>
          s.status === 'active' &&
          (s.organization || 'Tanpa instansi') === name,
      )
      return {
        name,
        total: slots.length,
        present: slots.filter((s) => effective(state, s.id).chosen).length,
      }
    })
    .sort((a, b) => b.total - a.total)
  const filtered = state.slots
    .filter((s) => s.status !== 'draft')
    .filter((s) => {
      const r = effective(state, s.id)
      return (
        `${s.name} ${s.label} ${s.organization} ${s.code} ${r.chosen?.representative || ''}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()) &&
        (!category || s.category === category) &&
        (!station || r.chosen?.station_id === station) &&
        (!group || s.group === group) &&
        (!status ||
          (status === 'present'
            ? !!r.chosen
            : status === 'review'
              ? r.review
              : !r.chosen))
      )
    })
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      notify((e as Error).message, true)
    }
  }
  async function correction(
    record: AttendanceRecord,
    action: 'select' | 'void',
  ) {
    await run(async () => {
      await commit((s) => correct(s, record, action, reason))
      setReason('')
      notify('Koreksi dicatat sebagai aksi baru. Catatan asli tetap tersedia.')
    })
  }
  return (
    <>
      <div className="overview-grid">
        <section className="target-panel">
          <div className="section-header">
            <span className="eyebrow">KEHADIRAN FISIK RESMI</span>
            <Badge tone="light">
              {m.provisional ? 'Sementara' : 'Terekonsiliasi'}
            </Badge>
          </div>
          <div className="big-number">
            {m.present}
            <span>/ {m.denominator ?? '—'} slot</span>
          </div>
          <div className="progress">
            <span style={{ width: `${Math.min(m.percent || 0, 100)}%` }} />
          </div>
          <div className="target-footer">
            <strong>
              {m.percent === null
                ? 'Penyebut belum disahkan'
                : `${m.percent.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% hadir`}
            </strong>
            <span>
              {m.reached
                ? 'Ambang 85% tercapai'
                : `Target 85% · minimum ${m.minimum} orang`}
            </span>
          </div>
          <p>
            Rekap gabungan per waktu impor. Angka dari tablet lain baru masuk
            setelah berkas digabungkan.
          </p>
        </section>
        <div className="stats-grid">
          <div className="stat-card">
            <div>
              <Users size={18} />
              <span>Slot resmi aktif</span>
            </div>
            <strong>{m.official}</strong>
            <small>
              Selisih TOR: {m.official - TOR_TARGET > 0 ? '+' : ''}
              {m.official - TOR_TARGET}
            </small>
          </div>
          <div className="stat-card">
            <div>
              <MailCheck size={18} />
              <span>RSVP akan hadir</span>
            </div>
            <strong>{m.rsvp}</strong>
            <small>Diverifikasi panitia</small>
          </div>
          <div className="stat-card">
            <div>
              <UserCheck size={18} />
              <span>Tamu tambahan</span>
            </div>
            <strong>{m.extra}</strong>
            <small>Di luar KPI resmi</small>
          </div>
          <div className="stat-card">
            <div>
              <Target size={18} />
              <span>Target TOR</span>
            </div>
            <strong>{TOR_TARGET}</strong>
            <small>{TOR_REFERENCE} entri rujukan · min. 63 hadir</small>
          </div>
        </div>
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="section-header">
            <div>
              <h2>Status enam tablet</h2>
              <p>Pembaruan berdasarkan berkas, bukan koneksi langsung.</p>
            </div>
            <Clock3 size={19} />
          </div>
          <div className="station-grid">
            {stations.map((st) => {
              const receipt = state.receipts
                .filter((r) => r.station === st)
                .sort((a, b) => b.at.localeCompare(a.at))[0]
              const unused = state.unusedStations.includes(st)
              return (
                <div className="station-card" key={st}>
                  <div>
                    <strong>{st}</strong>
                    <Badge tone={receipt ? '' : 'muted'}>
                      {receipt
                        ? 'Sudah diimpor'
                        : unused
                          ? 'Cadangan belum dipakai'
                          : 'Belum diimpor'}
                    </Badge>
                  </div>
                  <small>
                    {receipt
                      ? `Impor ${wib(receipt.at)}`
                      : st === 'T05'
                        ? 'Impor ekspor T05 juga untuk menutup rekap'
                        : 'Menunggu berkas meja'}
                  </small>
                  <small>
                    {receipt
                      ? `Berkas ${wib(receipt.exportedAt)}`
                      : 'Tidak ada sinkronisasi otomatis'}
                  </small>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={unused}
                      onChange={(e) =>
                        run(() =>
                          commit((s) => {
                            s.unusedStations = e.target.checked
                              ? [
                                  ...s.unusedStations.filter((x) => x !== st),
                                  st,
                                ]
                              : s.unusedStations.filter((x) => x !== st)
                            audit(
                              s,
                              'station-use',
                              `${st}: ${e.target.checked ? 'tidak digunakan' : 'digunakan'}`,
                            )
                          }),
                        )
                      }
                    />
                    Tidak dipakai (sahkan lokal)
                  </label>
                </div>
              )
            })}
          </div>
        </section>
        <section className="panel">
          <div className="section-header">
            <div>
              <h2>Perusahaan & instansi</h2>
              <p>Hadir resmi / slot aktif</p>
            </div>
            <ArrowUpRight size={19} />
          </div>
          {groups.length ? (
            <div className="organization-list">
              {groups.map((g) => (
                <div key={g.name}>
                  <span>{g.name}</span>
                  <strong>
                    {g.present}
                    <small> / {g.total}</small>
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Belum ada slot resmi">
              Sahkan daftar undangan untuk melihat subtotal.
            </Empty>
          )}
          <h3>Subtotal kategori</h3>
          {(['REGULER', 'VIP', 'VVIP'] as const).map((c) => {
            const slots = state.slots.filter(
              (s) => s.status === 'active' && s.category === c,
            )
            return (
              <p className="subtotal" key={c}>
                <span>{c}</span>
                <strong>
                  {slots.filter((s) => effective(state, s.id).chosen).length} /{' '}
                  {slots.length}
                </strong>
              </p>
            )
          })}
        </section>
      </div>
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Rekap kehadiran</h2>
            <p>
              Jejak asli tersimpan; koreksi menggunakan aksi baru dengan alasan.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => {
              if (!state.slots.some((s) => s.status !== 'draft')) {
                notify('Belum ada slot untuk diekspor.', true)
                return
              }
              download(
                csvReport(state),
                filename('rekap', 'T05', 'csv'),
                'text/csv;charset=utf-8',
              )
              notify(
                'Rekap CSV dibuat. Periksa status Sementara dan cakupan tablet.',
              )
            }}
          >
            <Download size={17} />
            Ekspor CSV
          </button>
        </div>
        <div className="filter-row wrap">
          <input
            placeholder="Cari nama, perusahaan, kode…"
            aria-label="Cari rekap"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filter kategori"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Semua kategori</option>
            <option>REGULER</option>
            <option>VIP</option>
            <option>VVIP</option>
          </select>
          <select
            aria-label="Filter stasiun"
            value={station}
            onChange={(e) => setStation(e.target.value)}
          >
            <option value="">Semua stasiun</option>
            {stations.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filter kehadiran"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Semua kehadiran</option>
            <option value="present">Hadir</option>
            <option value="absent">Belum hadir</option>
            <option value="review">Perlu tinjauan</option>
          </select>
          <select
            aria-label="Filter kelompok"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">Semua kelompok</option>
            {[...new Set(state.slots.map((s) => s.group).filter(Boolean))].map(
              (g) => (
                <option key={g}>{g}</option>
              ),
            )}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Undangan</th>
                <th>Kategori</th>
                <th>Kehadiran</th>
                <th>Waktu WIB</th>
                <th>Stasiun</th>
                <th>Jejak</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const r = effective(state, s.id)
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name || s.label}</strong>
                      <small>
                        {s.code} · {s.organization}
                      </small>
                      {r.chosen?.representative && (
                        <small>Datang: {r.chosen.representative}</small>
                      )}
                    </td>
                    <td>
                      {s.category}
                      {s.status === 'extra' && <small>Di luar KPI</small>}
                      {s.status === 'cancelled' && <small>Dibatalkan</small>}
                    </td>
                    <td>
                      <Badge tone={r.chosen ? '' : 'muted'}>
                        {r.chosen ? 'Hadir' : 'Belum hadir'}
                      </Badge>
                      {r.review && (
                        <small className="review-text">Perlu tinjauan</small>
                      )}
                    </td>
                    <td>{r.chosen ? wib(r.chosen.occurred_at) : '—'}</td>
                    <td>{r.chosen?.station_id || '—'}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setReview(s.id)
                          setReason('')
                        }}
                      >
                        Tinjau (
                        {
                          state.records.filter((r) => r.invitation_id === s.id)
                            .length
                        }
                        )
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <Empty title="Belum ada hasil">
              Kehadiran akan muncul setelah check-in lokal atau impor catatan
              tablet.
            </Empty>
          )}
        </div>
      </section>
      <section className="denominator-panel">
        <div>
          <h3>Pengesahan jumlah slot resmi</h3>
          <p>
            Penyebut saat ini:{' '}
            <strong>{state.denominator ?? 'belum disahkan'}</strong>. Perubahan
            disimpan dalam audit. Rekap tetap Sementara bila penyebut tidak sama
            dengan slot aktif.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            run(async () => {
              const value = window.prompt(
                'Jumlah slot resmi yang disahkan:',
                String(state.denominator || 73),
              )
              if (value === null) return
              const reason = window.prompt(
                'Alasan / rujukan pengesahan sekretariat:',
              )
              if (reason === null) return
              await commit((s) => approveDenominator(s, Number(value), reason))
            })
          }
        >
          Sahkan penyebut
        </button>
      </section>
      {review && (
        <Modal
          title="Jejak dan koreksi kehadiran"
          onClose={() => setReview(null)}
        >
          {(() => {
            const e = effective(state, review)
            return (
              <>
                {e.suspectClock && (
                  <p className="notice">
                    Jam perlu ditinjau: ada catatan di luar tanggal acara WIB.
                  </p>
                )}
                {e.differentNames && (
                  <p className="notice">
                    Nama perwakilan berbeda. Cocokkan dengan keputusan panitia.
                  </p>
                )}
                <label>
                  Alasan koreksi (wajib)
                  <input
                    value={reason}
                    onChange={(ev) => setReason(ev.target.value)}
                    maxLength={300}
                  />
                </label>
                <div className="record-list">
                  {state.records
                    .filter((r) => r.invitation_id === review)
                    .map((r) => (
                      <article key={r.record_id}>
                        <div className="section-header">
                          <strong>
                            {r.action === 'checkin'
                              ? 'Check-in'
                              : r.action === 'void'
                                ? 'Pembatalan'
                                : 'Pemilihan efektif'}{' '}
                            · {r.station_id}
                          </strong>
                          {e.chosen?.record_id === r.record_id && (
                            <Badge>Efektif</Badge>
                          )}
                        </div>
                        <p>
                          {r.representative} · {wib(r.occurred_at)}
                        </p>
                        <small>
                          {r.operator} · {r.source} · paket v{r.package_version}
                        </small>
                        <small className="code">{r.record_id}</small>
                        {r.reason && <p>Alasan: {r.reason}</p>}
                        {r.target_id && <small>Target: {r.target_id}</small>}
                        {r.action === 'checkin' && (
                          <div className="actions">
                            <button
                              className="secondary"
                              disabled={
                                !reason.trim() ||
                                !e.candidates.some(
                                  (c) => c.record_id === r.record_id,
                                )
                              }
                              onClick={() => correction(r, 'select')}
                            >
                              Jadikan efektif
                            </button>
                            <button
                              className="secondary danger"
                              disabled={
                                !reason.trim() ||
                                !e.candidates.some(
                                  (c) => c.record_id === r.record_id,
                                )
                              }
                              onClick={() => correction(r, 'void')}
                            >
                              Batalkan catatan
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                </div>
                {!state.records.some((r) => r.invitation_id === review) && (
                  <p>Belum ada catatan untuk slot ini.</p>
                )}
              </>
            )
          })()}
        </Modal>
      )}
    </>
  )
}
