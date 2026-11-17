import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import QRCode from 'qrcode'
import { fixture, project } from './helpers/supabase'
import { activate, invitationUrl } from '../src/domain'
import { EVENT } from '../src/model'
import type { RosterPackage, Slot } from '../src/model'
import { draft } from '../src/test-helpers'

const officialOrigin = 'https://registrasi.example'
const packageFor = (slots: Slot[], version: number): RosterPackage => ({
  schema_version: 1,
  type: 'roster-package',
  event_id: EVENT,
  package_version: version,
  created_at: new Date().toISOString(),
  slots: slots.map((slot) => {
    const copy = { ...slot }
    delete copy.token
    return copy
  }),
})
async function publicConfiguration(page: Page, empty = false) {
  await page.goto('/petugas')
  await expect(
    page.getByRole('region', { name: 'Persiapan pemindai Supabase' }),
  ).toBeVisible()
  // Simulate prefilled Vercel public configuration only, leaving operator/roster empty.
  // There is no auth session, membership bypass or operational data seeded in the browser.
  await page.evaluate(
    async ({ project, officialOrigin, empty }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('rsas-registration', 3)
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['state', 'cloud'], 'readwrite')
        tx.objectStore('cloud').put(
          {
            url: empty ? '' : project,
            key: empty ? '' : 'sb_publishable_synthetic',
            enabled: false,
          },
          'config',
        )
        const r = tx.objectStore('state').get('current')
        r.onsuccess = () => {
          const state = r.result
          state.config.officialOrigin = officialOrigin
          tx.objectStore('state').put(state, 'current')
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    },
    { project, officialOrigin, empty },
  )
  await page.reload()
}
async function loginScanner(page: Page) {
  await page
    .getByLabel('Email petugas pemindai')
    .fill('operator@example.invalid')
  await page.getByLabel('Password petugas pemindai').fill('synthetic-password')
  await page
    .getByRole('button', { name: 'Login pemindai', exact: true })
    .click()
  await expect(page.getByLabel('Nama operator pemindai')).toBeVisible()
}
async function prepareScanner(page: Page) {
  await loginScanner(page)
  await page.getByLabel('Nama operator pemindai').fill('Petugas QR Sintetis')
  await page
    .getByRole('button', {
      name: 'Hubungkan & muat roster Supabase',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Pemindai siap digunakan', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.station-pill')).toHaveText('T02')
}
async function uploadQR(page: Page, payload: string) {
  const png = await QRCode.toBuffer(payload, { width: 720, margin: 4 })
  await page
    .getByText('Pindai foto QR', { exact: true })
    .locator('input')
    .setInputFiles({
      name: 'qr-synthetic.png',
      mimeType: 'image/png',
      buffer: png,
    })
}
async function confirm(page: Page) {
  await page.getByLabel('Nama orang yang datang').fill('Perwakilan QR Sintetis')
  await page.getByRole('button', { name: 'Catat hadir', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Hadir tercatat di tablet ini' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Tamu berikutnya' }).click()
}

test('fresh scanner connects from petugas, refreshes an invitation QR from cloud and uploads check-in immediately', async ({
  page,
}) => {
  test.setTimeout(90000)
  const api = fixture()
  await api.install(page.context())
  const first = await activate(draft('QR-A')),
    oldSecond = await activate(draft('QR-B'))
  api.packages.push({ payload: packageFor([first, oldSecond], 1) })
  await publicConfiguration(page)
  await page.getByRole('button', { name: 'Pindai QR', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Lengkapi nama operator')
  await prepareScanner(page)
  await expect(page).toHaveURL(/\/petugas$/)
  const second = await activate({ ...oldSecond, token: undefined })
  api.packages.push({ payload: packageFor([first, second], 2) })
  await uploadQR(page, invitationUrl(second, officialOrigin))
  await expect(page.getByRole('dialog')).toContainText('QR-B')
  await confirm(page)
  await expect.poll(() => api.records.length).toBe(1)
  expect(api.records[0].payload.source).toBe('qr')
  expect(api.records[0].payload.package_version).toBe(2)
  await uploadQR(page, invitationUrl(second, officialOrigin))
  await page.getByRole('button', { name: 'Catat hadir', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Sudah tercatat di tablet ini' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Tamu berikutnya' }).click()
  expect(api.records).toHaveLength(1)
  await uploadQR(page, invitationUrl(oldSecond, officialOrigin))
  await expect(page.getByRole('alert')).toContainText('QR tidak cocok')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Siap offline', { exact: true })).toBeVisible({
    timeout: 15000,
  })
  await page.context().setOffline(true)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Pemindai siap digunakan', exact: true }),
  ).toBeVisible()
  await uploadQR(page, `RSAS-CI1:${EVENT}:${first.token}`)
  await confirm(page)
  expect(api.records).toHaveLength(1)
  await page.context().setOffline(false)
  await expect.poll(() => api.records.length).toBe(2)
  expect(new Set(api.records.map((r) => r.payload.invitation_id)).size).toBe(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: 'test-results/direct-qr-mobile.png',
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('cloud refresh does not restart the camera and the real decoder reads an official invitation QR', async ({
  page,
}) => {
  test.setTimeout(60000)
  const api = fixture()
  await api.install(page.context())
  const slot = await activate(draft('CAMERA-A'))
  api.packages.push({ payload: packageFor([slot], 1) })
  await publicConfiguration(page)
  await prepareScanner(page)
  const qr = await QRCode.toDataURL(invitationUrl(slot, officialOrigin), {
    width: 600,
    margin: 4,
  })
  await page.evaluate(async (data) => {
    let calls = 0,
      paint = false
    Object.defineProperty(window, '__qrCameraCalls', { get: () => calls })
    Object.defineProperty(window, '__paintQR', {
      value: () => {
        paint = true
      },
    })
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 720
    const context = canvas.getContext('2d')!
    context.fillStyle = 'white'
    context.fillRect(0, 0, 720, 720)
    const image = new Image()
    image.src = data
    await image.decode()
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        calls++
        const stream = canvas.captureStream(10)
        const timer = setInterval(() => {
          if (stream.getTracks().some((t) => t.readyState === 'live')) {
            if (paint) context.drawImage(image, 60, 60, 600, 600)
            else context.fillRect(0, 0, 720, 720)
          } else clearInterval(timer)
        }, 50)
        return stream
      },
    })
  }, qr)
  await page.getByRole('button', { name: 'Pindai QR', exact: true }).click()
  await expect(page.locator('video')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(
    page.getByRole('region', { name: 'Status Supabase' }),
  ).toContainText('0 catatan lokal menunggu')
  expect(
    await page.evaluate(() => Reflect.get(window, '__qrCameraCalls')),
  ).toBe(1)
  await page.evaluate(() => Reflect.get(window, '__paintQR')())
  await expect(page.getByRole('dialog')).toContainText('CAMERA-A')
  await confirm(page)
  await expect.poll(() => api.records.length).toBe(1)
  expect(
    await page.evaluate(() => Reflect.get(window, '__qrCameraCalls')),
  ).toBe(1)
})

test('missing schema provides SQL setup and cannot create a fake roster or bypass membership', async ({
  page,
}) => {
  const api = fixture()
  api.setSchemaReady(false)
  await api.install(page.context())
  await publicConfiguration(page, true)
  await page.getByLabel('URL Supabase pemindai').fill(project)
  await page
    .getByLabel('Publishable key pemindai')
    .fill('sb_secret_synthetic-do-not-use')
  await page.getByRole('button', { name: 'Simpan koneksi pemindai' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Secret/service_role key tidak boleh',
  )
  await page
    .getByLabel('Publishable key pemindai')
    .fill('sb_publishable_synthetic')
  await page.getByRole('button', { name: 'Simpan koneksi pemindai' }).click()
  await loginScanner(page)
  await expect(
    page.getByRole('link', { name: 'Buka SQL Editor proyek' }),
  ).toHaveAttribute(
    'href',
    'https://supabase.com/dashboard/project/testproject/sql/new',
  )
  const script = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'SQL pemasangan', exact: true })
    .click()
  expect((await script).suggestedFilename()).toBe('rsas-supabase-setup.sql')
  await page
    .getByLabel('Nama operator pemindai')
    .fill('Petugas belum ditugaskan')
  await page
    .getByRole('button', {
      name: 'Hubungkan & muat roster Supabase',
      exact: true,
    })
    .click()
  await expect(page.getByRole('alert')).toContainText('Jalankan SQL pemasangan')
  await expect(
    page.getByRole('heading', { name: 'Paket roster belum tersedia' }),
  ).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
  expect(api.records).toEqual([])
})

test('a check-in saved during an in-flight sync is sent without waiting for the periodic timer', async ({
  page,
}) => {
  const api = fixture()
  await api.install(page.context())
  const slot = await activate(draft('CONCURRENT-A'))
  api.packages.push({ payload: packageFor([slot], 1) })
  await publicConfiguration(page)
  await prepareScanner(page)
  await expect(
    page.getByRole('region', { name: 'Status Supabase' }),
  ).toContainText('0 catatan lokal menunggu')
  await page.getByRole('button', { name: /CONCURRENT-A/ }).click()
  const held = api.holdSecondRead()
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(held.holding).toBe(true)
    await confirm(page)
    expect(api.records).toHaveLength(0)
  } finally {
    held.release()
  }
  await expect.poll(() => api.records.length, { timeout: 5000 }).toBe(1)
})
