import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import QRCode from 'qrcode'
import { X, Download, Copy, Printer } from 'lucide-react'
import { useStore } from './store'
import { copyText } from './files'

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = document.querySelector<HTMLDialogElement>('dialog')
    dialog?.showModal()
    return () => {
      dialog?.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog onCancel={onClose} className="modal">
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Tutup" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function Badge({
  children,
  tone = '',
}: {
  children: ReactNode
  tone?: string
}) {
  return <span className={`badge ${tone}`}>{children}</span>
}
export function Empty({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-mark">↗</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}
export function FileInput({
  label,
  accept,
  multiple = false,
  disabled = false,
  onFiles,
}: {
  label: string
  accept: string
  multiple?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
}) {
  return (
    <label className="button file-button">
      <Download size={17} />
      {label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
    </label>
  )
}
export function QR({
  value,
  title,
  name,
}: {
  value: string
  title: string
  name: string
}) {
  const [src, setSrc] = useState(''),
    [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, {
      width: 480,
      margin: 4,
      errorCorrectionLevel: 'M',
    })
      .then((data) => {
        if (!cancelled) setSrc(data)
      })
      .catch(() => {
        if (!cancelled)
          setError('QR gagal dibuat. Gunakan tautan atau pencarian kode.')
      })
    return () => {
      cancelled = true
    }
  }, [value])
  return (
    <div className="qr-card">
      <h3>{title}</h3>
      {error && <p role="alert">{error}</p>}
      {src && (
        <>
          <img src={src} width="240" height="240" alt={title} />
          <a
            className="button secondary no-print"
            href={src}
            download={`${name}.png`}
          >
            <Download size={17} />
            Simpan QR PNG
          </a>
        </>
      )}
    </div>
  )
}
export function InvitationCard({
  value,
  code,
  label,
}: {
  value: string
  code: string
  label: string
}) {
  const { notify } = useStore()
  return (
    <div className="invitation">
      <span className="eyebrow">UNDANGAN RESMI · RSAS</span>
      <h2>{label}</h2>
      <p>Kamis, 19 November 2026 · 08.40 WIB</p>
      <p>RSAU Prof. dr. Abdulrachman Saleh, Jakarta Selatan</p>
      <QR value={value} title={`Undangan ${code}`} name={`undangan-${code}`} />
      <p className="code">{code}</p>
      <p>Pindai untuk menjawab RSVP dan menyimpan QR check-in.</p>
      <div className="actions no-print">
        <button
          onClick={() =>
            copyText(value)
              .then(() => notify('Tautan disalin.'))
              .catch((e) => notify(e.message, true))
          }
        >
          <Copy size={17} />
          Salin tautan
        </button>
        <button className="secondary" onClick={() => window.print()}>
          <Printer size={17} />
          Cetak kartu
        </button>
      </div>
      <textarea
        aria-label="Tautan undangan"
        readOnly
        value={value}
        className="no-print"
      />
    </div>
  )
}
