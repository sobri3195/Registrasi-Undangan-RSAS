import { describe, expect, it } from 'vitest'
import { activate, invitationUrl, parseScannerQR } from './domain'
import { EVENT } from './model'
import { draft } from './test-helpers'

const origin = 'https://registrasi.example'
describe('Scanner supports check-in and official invitation QR', () => {
  it('accepts a check-in payload without making a URL request', () => {
    expect(
      parseScannerQR(` RSAS-CI1:${EVENT}:abcdefghijklmnopqrstuvwx\n`, [origin]),
    ).toEqual({ token: 'abcdefghijklmnopqrstuvwx' })
  })
  it('extracts the same token and invitation code from an official invitation URL', async () => {
    const slot = await activate(draft())
    expect(parseScannerQR(invitationUrl(slot, origin), [origin])).toEqual({
      token: slot.token,
      code: slot.code,
    })
  })
  it('keeps two company invitation slots distinct', async () => {
    const first = await activate(draft('TEST-A')),
      second = await activate(draft('TEST-B'))
    expect(parseScannerQR(invitationUrl(first, origin), [origin])).not.toEqual(
      parseScannerQR(invitationUrl(second, origin), [origin]),
    )
  })
  it.each([
    'https://other.example/rsvp',
    'https://registrasi.example.attacker.invalid/rsvp',
    'http://registrasi.example/rsvp',
    'https://registrasi.example/wrong',
    'https://user:pass@registrasi.example/rsvp',
    'https://registrasi.example/rsvp?tracking=1',
  ])('rejects untrusted or unsupported URL %s', (url) => {
    expect(() =>
      parseScannerQR(
        `${url}#v=1&e=${EVENT}&c=TEST-A&t=abcdefghijklmnopqrstuvwx`,
        [origin],
      ),
    ).toThrow()
  })
  it('rejects another event, an unsupported version and malformed text without echoing tokens', () => {
    for (const raw of [
      `${origin}/rsvp#v=2&e=${EVENT}&c=TEST-A&t=abcdefghijklmnopqrstuvwx`,
      `${origin}/rsvp#v=1&e=other&c=TEST-A&t=abcdefghijklmnopqrstuvwx`,
      'not a QR',
    ]) {
      expect(() => parseScannerQR(raw, [origin])).toThrow()
      try {
        parseScannerQR(raw, [origin])
      } catch (e) {
        expect((e as Error).message).not.toContain('abcdefghijklmnopqrstuvwx')
      }
    }
  })
})
