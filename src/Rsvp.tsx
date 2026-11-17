import { useState } from 'react'
import { Check, Copy, MessageCircle, ArrowDown } from 'lucide-react'
import { parseInvitation } from './domain'
import { EVENT, EVENT_NAME } from './model'
import { QR } from './components'
import { copyText } from './files'

export default function Rsvp() {
  const [choice, setChoice] = useState<'yes' | 'no'>('yes')
  const [message, setMessage] = useState(''),
    [notice, setNotice] = useState('')
  let invitation: ReturnType<typeof parseInvitation>
  try {
    invitation = parseInvitation(location.hash)
  } catch (e) {
    return (
      <main className="guest-shell">
        <div className="brand">
          <img src="/icon.svg" alt="" />
          RSAS
        </div>
        <h1>Periksa tautan undangan</h1>
        <p role="alert">{(e as Error).message}</p>
      </main>
    )
  }
  const phone = import.meta.env.VITE_WHATSAPP_NUMBER || ''
  const validPhone = /^[1-9]\d{7,14}$/.test(phone)
  const build = () => {
    const text = `RSVP ${EVENT_NAME}\nKode undangan: ${invitation.code}\nJawaban: ${choice === 'yes' ? 'Akan hadir' : 'Tidak dapat hadir'}\nNama perwakilan: [isi nama Anda sebelum mengirim]`
    setMessage(text)
    setNotice(
      'Pesan siap dikirim. Kirim sendiri melalui WhatsApp; panitia akan memverifikasi jawaban Anda.',
    )
  }
  return (
    <main className="guest-shell">
      <header className="guest-brand">
        <div className="brand">
          <img src="/icon.svg" alt="" />
          <div>
            RSAS<small>UNDANGAN & KONFIRMASI</small>
          </div>
        </div>
        <span className="badge">19 NOV 2026</span>
      </header>
      <span className="eyebrow">DENGAN HORMAT, KAMI MENGUNDANG ANDA</span>
      <h1>
        Bersama untuk
        <br />
        pelayanan yang lebih baik.
      </h1>
      <p className="guest-lead">
        Forum Komunikasi Publik, Bakti Sosial, dan Penandatanganan Kerja Sama
        Pelayanan Kesehatan.
      </p>
      <div className="event-note">
        <strong>Kamis, 19 November 2026</strong>
        <p>Registrasi 08.40–09.00 WIB · Pembukaan 09.01 WIB</p>
        <p>
          Lobi & halaman depan RSAU Prof. dr. Abdulrachman Saleh
          <br />
          Jl. Gatot Subroto Kav. 72, Pancoran, Jakarta Selatan
        </p>
      </div>
      <p className="code">Undangan {invitation.code}</p>
      <section className="panel">
        <h2>Konfirmasi kehadiran</h2>
        <p>Jawaban dikirim melalui chat dan dicatat oleh panitia.</p>
        <div className="choice-grid">
          <button
            className={choice === 'yes' ? 'selected' : 'secondary'}
            onClick={() => {
              setChoice('yes')
              setMessage('')
            }}
          >
            <Check size={18} />
            Akan hadir
          </button>
          <button
            className={choice === 'no' ? 'selected' : 'secondary'}
            onClick={() => {
              setChoice('no')
              setMessage('')
            }}
          >
            Tidak dapat hadir
          </button>
        </div>
        <button className="wide" onClick={build}>
          Siapkan jawaban <ArrowDown size={18} />
        </button>
        {message && (
          <div className="rsvp-message">
            <textarea
              aria-label="Draf jawaban RSVP"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="actions">
              <button
                className="secondary"
                onClick={() =>
                  copyText(message)
                    .then(() =>
                      setNotice(
                        'Jawaban disalin. Tempel dan kirim ke chat undangan.',
                      ),
                    )
                    .catch((e) => setNotice(e.message))
                }
              >
                <Copy size={17} />
                Salin jawaban
              </button>
              {validPhone && (
                <a
                  className="button"
                  href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={17} />
                  Buka WhatsApp
                </a>
              )}
            </div>
            {!validPhone && (
              <p>
                Balas melalui chat undangan yang Anda terima. Nomor publik
                panitia belum ditetapkan.
              </p>
            )}
          </div>
        )}
        <p role="status">{notice}</p>
      </section>
      <section className="panel guest-qr">
        <span className="eyebrow">SIMPAN SEBELUM BERANGKAT</span>
        <QR
          value={`RSAS-CI1:${EVENT}:${invitation.token}`}
          title="QR check-in saya"
          name={`checkin-${invitation.code}`}
        />
        <p>
          Tunjukkan QR ini kepada petugas, dari galeri atau kartu cetak. Anda
          tetap dapat check-in meskipun belum menjawab RSVP.
        </p>
        <p className="muted">
          Halaman ini hanya memeriksa format tautan. Keabsahan undangan
          dicocokkan dengan roster oleh petugas.
        </p>
      </section>
      <footer>
        RSAU Prof. dr. Abdulrachman Saleh
        <br />
        Registrasi undangan · Tidak untuk data pasien
      </footer>
    </main>
  )
}
