import { test, expect } from '@playwright/test'
import type { Page, Download } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import QRCode from 'qrcode'

async function json(download: Download) {
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}
async function downloaded(page: Page, action: () => Promise<unknown>) {
  const waiting = page.waitForEvent('download')
  await action()
  return json(await waiting)
}
async function configure(page: Page, station: string) {
  await page.goto('/pengaturan')
  await page.getByLabel('Label tablet fisik').selectOption(station)
  await page
    .getByLabel('Nama operator yang ditugaskan')
    .fill(`Petugas Sintetis ${station}`)
  await page
    .getByLabel('Origin HTTPS resmi untuk kartu undangan')
    .fill('https://registrasi.example')
  await page.getByRole('button', { name: 'Simpan pengaturan' }).click()
  await expect(page.getByRole('status')).toContainText('tersimpan')
}
async function upload(
  page: Page,
  label: string,
  value: unknown,
  name = 'demo.json',
) {
  await page
    .getByText(label, { exact: true })
    .locator('input')
    .setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    })
}

test('company invitations, guest RSVP, two tablets, offline QR scan and atomic merge', async ({
  page: master,
  browser,
}) => {
  test.setTimeout(120000)
  await configure(master, 'T05')
  await master.goto('/koordinator/undangan')
  await master
    .getByRole('button', { name: 'Pratinjau 3 slot demo sintetis' })
    .click()
  await master.getByRole('button', { name: 'Impor 3 draf' }).click()
  await expect(
    master.getByRole('cell', { name: 'Draf', exact: true }),
  ).toHaveCount(3)
  for (const code of ['DEMO-001', 'DEMO-002', 'DEMO-003']) {
    await master
      .getByRole('button', { name: `Edit ${code}`, exact: true })
      .click()
    await master.getByRole('button', { name: 'Sahkan slot resmi' }).click()
    await expect(master.getByRole('dialog')).toHaveCount(0)
  }
  await master.getByRole('button', { name: 'Kartu DEMO-001' }).click()
  const cardLink = await master.getByLabel('Tautan undangan').inputValue()
  expect(new URL(cardLink).hostname).toBe('registrasi.example')
  await master.getByRole('button', { name: 'Tutup', exact: true }).click()
  await master.goto('/koordinator/berkas')
  const pkg = await downloaded(master, () =>
    master.getByRole('button', { name: 'Buat & unduh paket baru' }).click(),
  )
  expect(pkg.slots).toHaveLength(3)
  expect(pkg.slots[0].token).toBeUndefined()
  const backup = await downloaded(master, () =>
    master.getByRole('button', { name: 'Backup master', exact: true }).click(),
  )
  const slots = backup.state.slots as {
    id: string
    code: string
    token: string
  }[]
  const first = slots.find((s) => s.code === 'DEMO-001')!,
    second = slots.find((s) => s.code === 'DEMO-002')!
  expect(first.token).not.toBe(second.token)
  const guest = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await guest.goto(`http://localhost:4173/rsvp${new URL(cardLink).hash}`)
  await expect(
    guest.getByRole('heading', { name: 'QR check-in saya' }),
  ).toBeVisible()
  await guest.getByRole('button', { name: 'Siapkan jawaban' }).click()
  await expect(guest.getByRole('status')).toContainText('Pesan siap dikirim')
  await expect(guest.getByLabel('Draf jawaban RSVP')).toHaveValue(/DEMO-001/)
  await expect(guest.getByText('Balas melalui chat undangan')).toBeVisible()
  const qrDownload = guest.waitForEvent('download')
  await guest.getByRole('link', { name: 'Simpan QR PNG' }).click()
  expect((await qrDownload).suggestedFilename()).toBe('checkin-DEMO-001.png')
  const ctxA = await browser.newContext(),
    ctxB = await browser.newContext()
  const a = await ctxA.newPage(),
    b = await ctxB.newPage()
  await configure(a, 'T02')
  await configure(b, 'T03')
  for (const page of [a, b]) {
    await page.goto('/petugas')
    await upload(page, 'Impor paket roster', pkg)
    await expect(
      page.getByText('Paket dimuat.', { exact: false }),
    ).toBeVisible()
  }
  await expect(a.getByText('Siap offline', { exact: true })).toBeVisible({
    timeout: 15000,
  })
  await b
    .getByLabel('Filter kelompok tamu')
    .selectOption('Mitra provider dan korporasi')
  await expect(b.locator('.guest-row')).toHaveCount(2)
  await b.getByLabel('Filter perusahaan').selectOption('PT Contoh Sehat')
  await expect(b.locator('.guest-row')).toHaveCount(2)
  await b.getByLabel('Filter kelompok tamu').selectOption('')
  await b.getByLabel('Filter perusahaan').selectOption('')
  await ctxA.setOffline(true)
  await a.reload()
  await expect(a.getByRole('heading', { name: 'Cari undangan' })).toBeVisible()
  // Feed an actual encoded QR image through a camera stream to exercise the bundled decoder offline.
  const qr = await QRCode.toDataURL(`RSAS-CI1:rsas-2026-11-19:${first.token}`, {
    width: 600,
    margin: 4,
  })
  await a.bringToFront()
  await a.evaluate(async (data) => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 720
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 720, 720)
    const image = new Image()
    image.src = data
    await image.decode()
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const stream = canvas.captureStream(10)
        const timer = setInterval(() => {
          if (stream.getTracks().some((t) => t.readyState === 'live'))
            ctx.drawImage(image, 60, 60, 600, 600)
          else clearInterval(timer)
        }, 50)
        return stream
      },
    })
  }, qr)
  await a.getByRole('button', { name: 'Pindai QR', exact: true }).click()
  await expect(a.getByRole('dialog')).toBeVisible({ timeout: 15000 })
  await a.getByLabel('Nama orang yang datang').fill('Perwakilan Sintetis A')
  await a.getByRole('button', { name: 'Catat hadir', exact: true }).click()
  await expect(
    a.getByRole('heading', { name: 'Hadir tercatat di tablet ini' }),
  ).toBeVisible()
  await a.getByRole('button', { name: 'Tamu berikutnya' }).click()
  await a.reload()
  await expect(a.getByText('1 kehadiran di tablet ini')).toBeVisible()
  const fileA = await downloaded(a, () =>
    a.getByRole('button', { name: 'Ekspor catatan tablet' }).click(),
  )
  expect(fileA.records[0].source).toBe('qr')
  expect(JSON.stringify(fileA)).not.toContain(first.token)
  // Camera rejection must leave manual search usable.
  await b.evaluate(() =>
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        throw new DOMException('Izin kamera ditolak', 'NotAllowedError')
      },
    }),
  )
  await b.getByRole('button', { name: 'Pindai QR', exact: true }).click()
  await expect(b.getByRole('alert')).toContainText('pencarian manual')
  await b.getByRole('button', { name: 'Tutup kamera', exact: false }).click()
  for (const code of ['DEMO-001', 'DEMO-002', 'DEMO-003']) {
    await b.getByLabel('Cari undangan', { exact: true }).fill(code)
    await b.getByRole('button', { name: new RegExp(code) }).click()
    if (code === 'DEMO-003') {
      await expect(b.getByLabel('Nama orang yang datang')).toHaveValue(
        'Tamu Sintetis C',
      )
    } else {
      await b
        .getByLabel('Nama orang yang datang')
        .fill(
          code === 'DEMO-001'
            ? 'Perwakilan Sintetis A'
            : 'Perwakilan Sintetis B',
        )
    }
    if (code === 'DEMO-001') {
      await b.evaluate(() => {
        const original = IDBObjectStore.prototype.put
        IDBObjectStore.prototype.put = function (
          ...args: Parameters<typeof original>
        ) {
          IDBObjectStore.prototype.put = original
          throw new DOMException(
            `Simulasi kuota penuh pada ${args.length} argumen`,
            'QuotaExceededError',
          )
        }
      })
      await b.getByRole('button', { name: 'Catat hadir', exact: true }).click()
      await expect(b.getByRole('alert')).toContainText('Gagal tersimpan')
      await expect(
        b.getByRole('button', { name: 'Catat hadir', exact: true }),
      ).toBeVisible()
      await expect(
        b.getByRole('heading', { name: 'Hadir tercatat di tablet ini' }),
      ).toHaveCount(0)
    }
    await b.getByRole('button', { name: 'Catat hadir', exact: true }).click()
    await expect(
      b.getByRole('heading', { name: 'Hadir tercatat di tablet ini' }),
    ).toBeVisible()
    await b.getByRole('button', { name: 'Tamu berikutnya' }).click()
  }
  const fileB = await downloaded(b, () =>
    b.getByRole('button', { name: 'Ekspor catatan tablet' }).click(),
  )
  await upload(master, 'Pilih JSON catatan tablet', fileA, 'T02.json')
  await master.getByRole('button', { name: 'Gabungkan secara atomik' }).click()
  await expect(master.getByRole('dialog')).toHaveCount(0)
  await upload(master, 'Pilih JSON catatan tablet', fileB, 'T03.json')
  await master.getByRole('button', { name: 'Gabungkan secara atomik' }).click()
  await expect(master.getByRole('dialog')).toHaveCount(0)
  await upload(master, 'Pilih JSON catatan tablet', fileB, 'T03-again.json')
  await expect(master.getByRole('dialog')).toContainText('Sudah ada')
  await master.getByRole('button', { name: 'Gabungkan secara atomik' }).click()
  await expect(master.getByRole('dialog')).toHaveCount(0)
  const result = await downloaded(master, () =>
    master.getByRole('button', { name: 'Backup master', exact: true }).click(),
  )
  expect(result.state.records).toHaveLength(4)
  expect(
    new Set(
      result.state.records.map(
        (r: { invitation_id: string }) => r.invitation_id,
      ),
    ).size,
  ).toBe(3)
  expect(
    result.state.slots.every((s: { rsvp: string }) => s.rsvp === 'unknown'),
  ).toBe(true)
  const recovery = await browser.newPage()
  await configure(recovery, 'T05')
  await recovery.goto('/koordinator/berkas')
  await upload(recovery, 'Pulihkan backup', result, 'backup-demo.json')
  await recovery
    .getByRole('button', { name: 'Pulihkan pada master kosong' })
    .click()
  await expect(recovery.getByRole('status')).toContainText('Master dipulihkan')
  const restored = await downloaded(recovery, () =>
    recovery
      .getByRole('button', { name: 'Backup master', exact: true })
      .click(),
  )
  expect(restored.state.device_id).not.toBe(result.state.device_id)
  expect(restored.state.records).toEqual(result.state.records)
  expect(restored.state.slots).toEqual(result.state.slots)
  await master.goto('/koordinator')
  await expect(master.locator('.big-number')).toContainText('3')
  await master.screenshot({
    path: 'test-results/dashboard-desktop.png',
    fullPage: true,
  })
  await master.setViewportSize({ width: 390, height: 844 })
  await master.screenshot({
    path: 'test-results/dashboard-mobile.png',
    fullPage: true,
  })
  expect(
    await master.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await ctxA.close()
  await ctxB.close()
  await guest.close()
  await recovery.close()
})

test('deep links work and invalid guest URLs never reveal roster data', async ({
  page,
}) => {
  for (const route of [
    '/rsvp',
    '/petugas',
    '/koordinator/undangan',
    '/pengaturan',
  ]) {
    const response = await page.goto(route)
    expect(response?.status()).toBe(200)
  }
  await page.goto('/rsvp#v=1&e=wrong&t=bad')
  await expect(page.getByRole('alert')).toContainText(
    'Tautan undangan tidak valid',
  )
  await expect(page.locator('body')).not.toContainText('DEMO-001')
})
