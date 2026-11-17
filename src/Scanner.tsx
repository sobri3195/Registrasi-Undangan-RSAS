import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { CameraOff } from 'lucide-react'
export default function Scanner({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const callback = useRef(onScan)
  useEffect(() => {
    callback.current = onScan
  }, [onScan])
  const [error, setError] = useState('')
  useEffect(() => {
    let stream: MediaStream | undefined,
      frame = 0,
      disposed = false,
      last = 0
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            'Kamera memerlukan HTTPS dan browser yang mendukungnya.',
          )
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
          },
          audio: false,
        })
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.current!.srcObject = stream
        await video.current!.play()
        function scan(now: number) {
          if (disposed) return
          const v = video.current
          if (
            v &&
            ctx &&
            v.readyState >= 2 &&
            v.videoWidth > 0 &&
            v.videoHeight > 0 &&
            now - last > 150
          ) {
            last = now
            canvas.width = Math.min(v.videoWidth, 960)
            canvas.height = (v.videoHeight * canvas.width) / v.videoWidth
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(pixels.data, pixels.width, pixels.height, {
              inversionAttempts: 'attemptBoth',
            })
            if (code) {
              callback.current(code.data)
              return
            }
          }
          frame = requestAnimationFrame(scan)
        }
        frame = requestAnimationFrame(scan)
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop())
        if (!disposed)
          setError(
            `${e instanceof Error ? e.message : 'Kamera gagal.'} Gunakan pencarian manual di bawah.`,
          )
      }
    }
    start()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])
  return (
    <div className="scanner">
      <video
        ref={video}
        playsInline
        muted
        aria-label="Pratinjau kamera belakang"
      />
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <p>
          Arahkan QR check-in atau kartu undangan resmi ke kamera. Cocokkan
          identitas sebelum mencatat.
        </p>
      )}
      <button className="secondary" onClick={onClose}>
        <CameraOff size={18} />
        Tutup kamera · gunakan pencarian
      </button>
    </div>
  )
}
