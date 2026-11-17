import jsQR from 'jsqr'

export async function decodeQRImage(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error(
      'Foto QR maksimal 10 MB. Potong gambar di sekitar QR terlebih dahulu.',
    )
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Pilih foto QR berformat PNG, JPEG, atau WebP.')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new Error(
        'Foto QR tidak dapat dibaca. Pilih PNG, JPEG, atau WebP yang valid.',
      )
    })
    if (
      !img.naturalWidth ||
      !img.naturalHeight ||
      img.naturalWidth * img.naturalHeight > 24000000
    )
      throw new Error('Ukuran foto terlalu besar. Potong gambar di sekitar QR.')
    const scale = Math.min(
      1,
      1800 / Math.max(img.naturalWidth, img.naturalHeight),
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context)
      throw new Error(
        'Pembacaan foto tidak didukung. Gunakan kamera atau pencarian manual.',
      )
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const qr = jsQR(pixels.data, pixels.width, pixels.height, {
      inversionAttempts: 'attemptBoth',
    })
    if (!qr)
      throw new Error(
        'QR tidak terbaca. Potong foto lebih dekat atau gunakan pencarian manual.',
      )
    return qr.data
  } finally {
    URL.revokeObjectURL(url)
  }
}
