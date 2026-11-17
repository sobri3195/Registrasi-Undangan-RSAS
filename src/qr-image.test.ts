import { describe, expect, it } from 'vitest'
import { decodeQRImage } from './qr-image'
describe('QR photo upload validation', () => {
  it('rejects oversized images before decoding them', async () => {
    await expect(
      decodeQRImage(
        new File(['x'.repeat(10 * 1024 * 1024 + 1)], 'large.png', {
          type: 'image/png',
        }),
      ),
    ).rejects.toThrow('maksimal 10 MB')
  })
  it('rejects SVG and non-image files before creating image resources', async () => {
    await expect(
      decodeQRImage(new File(['<svg/>'], 'qr.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow('PNG, JPEG, atau WebP')
    await expect(
      decodeQRImage(new File(['text'], 'qr.txt', { type: 'text/plain' })),
    ).rejects.toThrow('PNG, JPEG, atau WebP')
  })
})
