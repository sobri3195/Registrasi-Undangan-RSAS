import { useState } from 'react'
import {
  Plus,
  FileUp,
  QrCode,
  ShieldCheck,
  RotateCcw,
  Ban,
  Pencil,
} from 'lucide-react'
import { useStore } from './store'
import {
  activate,
  csvColumns,
  invitationUrl,
  parseRoster,
  token,
} from './domain'
import { audit, requireOperator } from './model'
import type { Slot } from './model'
import { Badge, Empty, FileInput, InvitationCard, Modal } from './components'
import { download, readFile } from './files'

function blankSlot(): Slot {
  return {
    id: crypto.randomUUID(),
    code: `RSAS-${token().slice(0, 8)}`,
    name: '',
    label: '',
    organization: '',
    group: '',
    category: 'REGULER',
    kind: 'institution',
    status: 'draft',
    representative: '',
    desk: '',
    rsvp: 'unknown',
  }
}
export const demoCSV = `${csvColumns.join(',')}\nDEMO-001,,Perwakilan PT Contoh Sehat A,PT Contoh Sehat,Mitra provider dan korporasi,REGULER,draft\nDEMO-002,,Perwakilan PT Contoh Sehat B,PT Contoh Sehat,Mitra provider dan korporasi,REGULER,draft\nDEMO-003,Tamu Sintetis C,Undangan individu,Organisasi Demo,Tamu umum,VIP,draft\n`

export default function Roster() {
  const { state, commit, notify } = useStore()
  const [preview, setPreview] = useState<ReturnType<typeof parseRoster> | null>(
    null,
  )
  const [editing, setEditing] = useState<Slot | null>(null)
  const [card, setCard] = useState<Slot | null>(null),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      notify((e as Error).message, true)
    }
  }
  function previewCSV(csv: string) {
    setPreview(parseRoster(csv, state.slots))
  }
  async function save(mode: 'draft' | 'active' | 'extra') {
    if (!editing || saving) return
    setSaving(true)
    try {
      if (
        !editing.code ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(editing.code) ||
        !editing.label.trim()
      )
        throw new Error(
          'Isi kode unik (huruf, angka, _ atau -) dan label undangan.',
        )
      const value =
        mode === 'draft'
          ? editing
          : { ...(await activate(editing)), status: mode }
      await commit((s) => {
        requireOperator(s)
        if (
          s.slots.some((old) => old.id !== value.id && old.code === value.code)
        )
          throw new Error('Kode undangan sudah digunakan.')
        const old = s.slots.find((x) => x.id === value.id)
        if (old && old.code !== value.code)
          throw new Error(
            'Kode slot yang tersimpan bersifat stabil; buat slot baru untuk kode baru.',
          )
        s.slots = [...s.slots.filter((x) => x.id !== value.id), value]
        audit(
          s,
          mode === 'draft' ? 'edit' : 'approve-slot',
          `${value.code}; ${value.status}; ${value.kind}`,
        )
      })
      setEditing(null)
      notify(
        mode === 'draft'
          ? 'Draf tersimpan.'
          : 'Slot disahkan. Buat paket baru untuk semua tablet sebelum registrasi.',
      )
    } catch (e) {
      notify((e as Error).message, true)
    } finally {
      setSaving(false)
    }
  }
  const filtered = state.slots.filter(
    (s) =>
      (!status || s.status === status) &&
      `${s.name} ${s.label} ${s.organization} ${s.code}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  )
  return (
    <>
      <div className="section-header">
        <div>
          <h2>Daftar undangan</h2>
          <p>
            Draf adalah rujukan. Sahkan setiap slot sebelum menerbitkan kartu.{' '}
            Impor daftar undangan berformat CSV di sini, termasuk
            roster-draft.csv. Paket tablet dan backup memakai JSON di menu
            terpisah.
          </p>
        </div>
        <div className="actions">
          <FileInput
            label="Impor CSV"
            accept=".csv,text/csv"
            onFiles={(files) => {
              readFile(files[0])
                .then(previewCSV)
                .catch((e) => notify(e.message, true))
            }}
          />
          <button onClick={() => setEditing(blankSlot())}>
            <Plus size={18} />
            Tambah slot
          </button>
        </div>
      </div>
      <div className="notice">
        <strong>Data lokal & privat.</strong> Jangan simpan roster atau backup
        di repositori maupun folder publik. Selisih rujukan TOR 71 entri dan
        target 73 tetap perlu pengesahan sekretariat.
      </div>
      <div className="filter-row">
        <input
          aria-label="Cari daftar master"
          placeholder="Cari di daftar master…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Status roster"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Semua status</option>
          <option value="draft">Draf</option>
          <option value="active">Aktif resmi</option>
          <option value="extra">Tambahan di luar KPI</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
      </div>
      {state.slots.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Undangan / instansi</th>
                <th>Kode</th>
                <th>Kategori</th>
                <th>Status</th>
                <th>RSVP</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name || s.label}</strong>
                    <small>
                      {s.organization}
                      {s.representative && ` · ${s.representative}`}
                    </small>
                  </td>
                  <td className="code">{s.code}</td>
                  <td>{s.category}</td>
                  <td>
                    <Badge
                      tone={
                        s.status === 'draft'
                          ? 'muted'
                          : s.status === 'active'
                            ? ''
                            : 'gold'
                      }
                    >
                      {
                        {
                          draft: 'Draf',
                          active: 'Aktif',
                          extra: 'Tambahan',
                          cancelled: 'Dibatalkan',
                        }[s.status]
                      }
                    </Badge>
                  </td>
                  <td>
                    {s.rsvp === 'yes'
                      ? 'Akan hadir'
                      : s.rsvp === 'no'
                        ? 'Tidak hadir'
                        : 'Belum menjawab'}
                  </td>
                  <td>
                    <div className="actions compact">
                      <button
                        className="icon-button"
                        aria-label={`Edit ${s.code}`}
                        onClick={() => setEditing(s)}
                      >
                        <Pencil size={17} />
                      </button>
                      {s.status === 'active' && s.token && (
                        <button
                          className="icon-button"
                          aria-label={`Kartu ${s.code}`}
                          onClick={() => {
                            try {
                              invitationUrl(s, state.config.officialOrigin)
                              setCard(s)
                            } catch (e) {
                              notify((e as Error).message, true)
                            }
                          }}
                        >
                          <QrCode size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Mulai dari daftar yang disahkan">
          Impor CSV lokal atau tambah slot. Untuk mencoba alur, gunakan data
          demo sintetis di bawah.
        </Empty>
      )}
      <div className="actions below-table">
        <button
          className="text-button"
          onClick={() =>
            download(
              `${csvColumns.join(',')}\n`,
              'template-roster.csv',
              'text/csv;charset=utf-8',
            )
          }
        >
          <FileUp size={16} />
          Unduh template CSV
        </button>
        <button className="text-button" onClick={() => previewCSV(demoCSV)}>
          Pratinjau 3 slot demo sintetis
        </button>
      </div>
      {preview && (
        <Modal title="Pratinjau impor CSV" onClose={() => setPreview(null)}>
          <p>
            {preview.slots.length} baris akan dimasukkan sebagai{' '}
            <strong>draf</strong>. Belum dapat membuat QR atau masuk KPI.
          </p>
          {preview.errors.length > 0 && (
            <div className="notice error" role="alert">
              <ul>
                {preview.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="preview-list">
            {preview.slots.slice(0, 50).map((s) => (
              <p key={s.id}>
                <strong>{s.code}</strong> · {s.name || s.label}
              </p>
            ))}
          </div>
          <button
            className="wide"
            disabled={preview.errors.length > 0 || saving}
            onClick={() =>
              run(async () => {
                setSaving(true)
                try {
                  await commit((s) => {
                    requireOperator(s)
                    if (
                      preview.slots.some((n) =>
                        s.slots.some((old) => old.code === n.code),
                      )
                    )
                      throw new Error(
                        'Daftar berubah: kode duplikat. Ulangi pratinjau.',
                      )
                    s.slots.push(...preview.slots)
                    audit(
                      s,
                      'import-draft',
                      `${preview.slots.length} slot draf`,
                    )
                  })
                  setPreview(null)
                  notify('Draf diimpor. Sahkan slot satu per satu.')
                } finally {
                  setSaving(false)
                }
              })
            }
          >
            Impor {preview.slots.length} draf
          </button>
        </Modal>
      )}
      {editing && (
        <Modal
          title={
            state.slots.some((s) => s.id === editing.id)
              ? `Undangan ${editing.code}`
              : 'Tambah slot undangan'
          }
          onClose={() => setEditing(null)}
        >
          <div className="form-grid">
            <label>
              Kode undangan
              <input
                value={editing.code}
                onChange={(e) =>
                  setEditing({ ...editing, code: e.target.value })
                }
                maxLength={100}
                disabled={state.slots.some((s) => s.id === editing.id)}
              />
            </label>
            <label>
              Tujuan undangan
              <select
                value={editing.kind}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    kind: e.target.value as Slot['kind'],
                  })
                }
              >
                <option value="institution">Jabatan / instansi</option>
                <option value="person">Orang bernama</option>
              </select>
            </label>
            <label className="full">
              Label undangan resmi
              <input
                value={editing.label}
                onChange={(e) =>
                  setEditing({ ...editing, label: e.target.value })
                }
                maxLength={300}
              />
            </label>
            <label>
              Nama undangan {editing.kind === 'person' && '(wajib)'}
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                maxLength={300}
              />
            </label>
            <label>
              Perusahaan / instansi
              <input
                value={editing.organization}
                onChange={(e) =>
                  setEditing({ ...editing, organization: e.target.value })
                }
                maxLength={300}
              />
            </label>
            <label>
              Kelompok
              <input
                value={editing.group}
                onChange={(e) =>
                  setEditing({ ...editing, group: e.target.value })
                }
                maxLength={300}
                placeholder="Mitra provider dan korporasi"
              />
            </label>
            <label>
              Kategori
              <select
                value={editing.category}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    category: e.target.value as Slot['category'],
                  })
                }
              >
                <option>REGULER</option>
                <option>VIP</option>
                <option>VVIP</option>
              </select>
            </label>
            <label>
              Nama perwakilan terverifikasi
              <input
                value={editing.representative}
                onChange={(e) =>
                  setEditing({ ...editing, representative: e.target.value })
                }
                maxLength={300}
              />
            </label>
            <label>
              RSVP dicatat panitia
              <select
                value={editing.rsvp}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    rsvp: e.target.value as Slot['rsvp'],
                  })
                }
              >
                <option value="unknown">Belum menjawab</option>
                <option value="yes">Akan hadir (pesan diverifikasi)</option>
                <option value="no">Tidak dapat hadir</option>
              </select>
            </label>
            <label>
              Meja / arahan protokol
              <input
                value={editing.desk}
                onChange={(e) =>
                  setEditing({ ...editing, desk: e.target.value })
                }
                maxLength={300}
              />
            </label>
          </div>
          <p className="muted">
            RSVP tidak mengubah hadir fisik. Pengganti satu orang tetap memakai
            ID slot yang sama.
          </p>
          <div className="actions">
            <button disabled={saving} onClick={() => save('active')}>
              <ShieldCheck size={18} />
              {editing.status === 'draft'
                ? 'Sahkan slot resmi'
                : 'Simpan slot resmi'}
            </button>
            {editing.status === 'draft' && (
              <button
                className="secondary"
                disabled={saving}
                onClick={() => save('draft')}
              >
                Simpan draf
              </button>
            )}
            <button
              className="secondary"
              disabled={saving}
              onClick={() => save('extra')}
            >
              Simpan sebagai tambahan
            </button>
          </div>
          {editing.status !== 'draft' && (
            <div className="danger-zone">
              <p>
                Pembatalan atau penggantian QR perlu paket baru di seluruh
                tablet. Catatan lama dipertahankan.
              </p>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      if (
                        !window.confirm(
                          'Ganti token QR slot ini? Kartu lama tidak cocok setelah paket baru diimpor.',
                        )
                      )
                        return
                      const updated = await activate({
                        ...editing,
                        token: undefined,
                      })
                      await commit((s) => {
                        requireOperator(s)
                        s.slots = s.slots.map((slot) =>
                          slot.id === updated.id
                            ? { ...updated, status: editing.status }
                            : slot,
                        )
                        audit(s, 'rotate-token', editing.code)
                      })
                      setEditing(null)
                      notify(
                        'Token diganti. Terbitkan paket dan kartu terbaru.',
                      )
                    })
                  }
                >
                  <RotateCcw size={17} />
                  Ganti QR
                </button>
                <button
                  className="secondary danger"
                  onClick={() =>
                    run(async () => {
                      const reason = window.prompt(
                        'Alasan pembatalan slot (wajib):',
                      )
                      if (!reason?.trim()) return
                      await commit((s) => {
                        requireOperator(s)
                        const slot = s.slots.find((x) => x.id === editing.id)!
                        slot.status = 'cancelled'
                        audit(s, 'cancel-slot', `${slot.code}; ${reason}`)
                      })
                      setEditing(null)
                    })
                  }
                >
                  <Ban size={17} />
                  Batalkan slot
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {card && (
        <Modal title="Kartu undangan privat" onClose={() => setCard(null)}>
          <InvitationCard
            value={invitationUrl(card, state.config.officialOrigin)}
            code={card.code}
            label={card.name || card.label}
          />
        </Modal>
      )}
    </>
  )
}
