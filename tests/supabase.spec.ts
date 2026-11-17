import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

import { fixture, project } from './helpers/supabase'

async function localSettings(page: Page, station: string) {
  await page.goto('/pengaturan')
  await page
    .getByLabel('Nama operator yang ditugaskan')
    .fill(`Petugas Sintetis ${station}`)
  await page.getByLabel('Label tablet fisik').selectOption(station)
  await page
    .getByRole('button', { name: 'Simpan pengaturan', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('tersimpan')
}
async function cloudSettings(page: Page, email: string) {
  await page.goto('/pengaturan')
  await page.getByLabel('Project URL Supabase').fill(project)
  await page
    .getByLabel('Publishable key Supabase')
    .fill('sb_publishable_synthetic')
  await page
    .getByRole('button', { name: 'Simpan Supabase', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Supabase tersimpan')
  await page.getByLabel('Email akun petugas').fill(email)
  await page.getByLabel('Password akun petugas').fill('synthetic-password')
  await page
    .getByRole('button', { name: 'Masuk Supabase', exact: true })
    .click()
  await expect(page.getByText('Masuk sebagai', { exact: false })).toBeVisible()
  await page.getByLabel('Aktifkan sinkronisasi otomatis ke proyek ini').check()
  await page
    .getByRole('button', { name: 'Simpan Supabase', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Sinkronkan sekarang', exact: true }),
  ).toBeEnabled()
}
test('optional authenticated cloud sync preserves failed uploads offline and merges a second tablet', async ({
  page: master,
  browser,
}) => {
  test.setTimeout(90000)
  const api = fixture()
  await api.install(master.context())
  await localSettings(master, 'T05')
  await master.goto('/koordinator/undangan')
  await master
    .getByRole('button', { name: 'Pratinjau 3 slot demo sintetis' })
    .click()
  await master.getByRole('button', { name: 'Impor 3 draf' }).click()
  for (const code of ['DEMO-001', 'DEMO-002', 'DEMO-003']) {
    await master
      .getByRole('button', { name: `Edit ${code}`, exact: true })
      .click()
    await master.getByRole('button', { name: 'Sahkan slot resmi' }).click()
    await expect(master.getByRole('dialog')).toHaveCount(0)
  }
  await master.goto('/koordinator/berkas')
  const packageDownload = master.waitForEvent('download')
  await master.getByRole('button', { name: 'Buat & unduh paket baru' }).click()
  await packageDownload
  await cloudSettings(master, 'coordinator@example.invalid')
  await master.getByRole('button', { name: 'Publikasikan paket T05' }).click()
  await expect(master.getByRole('status')).toContainText(
    'paket roster berhasil',
  )
  expect(api.packages).toHaveLength(1)
  expect(api.packages[0].payload.slots.every((s) => !('token' in s))).toBe(true)
  const ctx = await browser.newContext()
  await api.install(ctx)
  const op = await ctx.newPage()
  await localSettings(op, 'T02')
  await cloudSettings(op, 'operator@example.invalid')
  await expect(
    op.getByRole('region', { name: 'Status Supabase' }),
  ).toContainText('Sinkron lengkap terakhir')
  await expect(
    op.getByRole('button', { name: 'Publikasikan paket T05' }),
  ).toHaveCount(0)
  await op.goto('/petugas')
  await op.getByLabel('Cari undangan', { exact: true }).fill('DEMO-001')
  await op.getByRole('button', { name: /DEMO-001/ }).click()
  await op.getByLabel('Nama orang yang datang').fill('Perwakilan Sintetis')
  api.failNextPush()
  await op.getByRole('button', { name: 'Catat hadir', exact: true }).click()
  await expect(
    op.getByRole('heading', { name: 'Hadir tercatat di tablet ini' }),
  ).toBeVisible()
  await op.getByRole('button', { name: 'Tamu berikutnya' }).click()
  await op.getByRole('link', { name: 'Atur Supabase' }).click()

  await expect(
    op.getByRole('region', { name: 'Status Supabase' }),
  ).toContainText('Koneksi Supabase belum berhasil')
  await expect(
    op.getByText('1 catatan perangkat ini belum dikonfirmasi cloud'),
  ).toBeVisible()
  expect(api.records).toHaveLength(0)
  await ctx.setOffline(true)
  await op
    .getByRole('button', { name: 'Sinkronkan sekarang', exact: true })
    .click()
  await expect(
    op.getByText('1 catatan perangkat ini belum dikonfirmasi cloud'),
  ).toBeVisible()
  await ctx.setOffline(false)
  await expect(
    op.getByText('0 catatan perangkat ini belum dikonfirmasi cloud'),
  ).toBeVisible({ timeout: 15000 })
  expect(api.records).toHaveLength(1)
  await op.reload()
  await expect(
    op.getByText('0 catatan perangkat ini belum dikonfirmasi cloud'),
  ).toBeVisible()
  await op.getByRole('button', { name: 'Keluar Supabase', exact: true }).click()
  await expect(op.getByLabel('Email akun petugas')).toBeVisible()
  await op.getByLabel('Email akun petugas').fill('operator@example.invalid')
  await op.getByLabel('Password akun petugas').fill('synthetic-password')
  await op.getByRole('button', { name: 'Masuk Supabase', exact: true }).click()
  await expect(
    op.getByText('0 catatan perangkat ini belum dikonfirmasi cloud'),
  ).toBeVisible()
  expect(api.records).toHaveLength(1)
  await master
    .getByRole('button', { name: 'Sinkronkan sekarang', exact: true })
    .click()
  await expect(
    master.getByRole('button', { name: 'Sinkronkan sekarang', exact: true }),
  ).toBeEnabled()
  await master.goto('/koordinator')
  await expect(master.locator('.big-number')).toContainText('1')
  await expect(
    master.getByText('Tersinkron cloud', { exact: true }),
  ).toBeVisible()
  await master.goto('/koordinator/berkas')
  const backupDownload = master.waitForEvent('download')
  await master
    .getByRole('button', { name: 'Backup master', exact: true })
    .click()
  const backup = await readFile((await (await backupDownload).path())!, 'utf8')
  expect(backup).not.toContain('access_token')
  expect(backup).not.toContain('synthetic-refresh-token')
  expect(backup).not.toContain('sb_publishable_synthetic')
  expect(JSON.parse(backup).state.records).toHaveLength(1)
  await master.goto('/pengaturan')
  await expect(
    master.getByText('Masuk sebagai', { exact: false }),
  ).toBeVisible()
  await master.screenshot({
    path: 'test-results/cloud-settings.png',
    fullPage: true,
  })
  await master.setViewportSize({ width: 390, height: 844 })
  await master.screenshot({
    path: 'test-results/cloud-settings-mobile.png',
    fullPage: true,
  })
  expect(
    await master.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await ctx.close()
})
test('guest RSVP makes no Supabase requests', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).hostname.endsWith('.supabase.co'))
      requests.push(r.url())
  })
  await page.goto(
    '/rsvp#v=1&e=rsas-2026-11-19&c=DEMO-001&t=abcdefghijklmnopqrstuvwx',
  )
  await expect(
    page.getByRole('heading', { name: 'QR check-in saya' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Siapkan jawaban' }).click()
  await expect(page.getByRole('status')).toContainText('Pesan siap dikirim')
  expect(requests).toEqual([])
})
