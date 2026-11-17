import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Match the operational file's shape/count, with entirely synthetic content.
const csv =
  'invitation_code,name,invited_label,organization,guest_group,guest_category,roster_status\n' +
  Array.from(
    { length: 71 },
    (_, index) =>
      `TEST-${String(index + 1).padStart(3, '0')},,Undangan Sintetis ${index + 1},PT Contoh ${index + 1},Demo,,draft`,
  ).join('\n')
async function uploadCSV(
  page: Page,
  inputLabel: string,
  name = 'roster-draft.csv',
) {
  await page
    .getByText(inputLabel, { exact: true })
    .locator('input')
    .setInputFiles({
      name,
      mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/json',
      buffer: Buffer.from(csv),
    })
}

for (const input of [
  {
    route: '/petugas',
    label: 'Impor paket roster',
    next: 'Buat & unduh paket baru',
  },
  {
    route: '/koordinator/berkas',
    label: 'Pilih JSON catatan tablet',
    next: 'Ekspor catatan tablet',
  },
  {
    route: '/koordinator/berkas',
    label: 'Pulihkan backup',
    next: 'Backup master',
  },
]) {
  test(`CSV selected for ${input.label} gives the correct route without changing data`, async ({
    page,
  }) => {
    await page.goto(input.route)
    await uploadCSV(page, input.label)
    await expect(page.getByRole('alert')).toContainText(
      'Ini CSV daftar undangan, bukan berkas JSON',
    )
    await expect(page.getByRole('alert')).toContainText(input.next)
    await expect(page.getByRole('alert')).not.toContainText('Unexpected token')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('link', { name: 'Impor CSV di koordinator' }).click()
    await expect(page).toHaveURL(/\/koordinator\/undangan$/)
    await expect(
      page.getByRole('heading', { name: 'Mulai dari daftar yang disahkan' }),
    ).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount(0)
  })
}

test('CSV renamed as JSON is detected and 71 rows import only through the CSV preview as drafts', async ({
  page,
}) => {
  await page.goto('/pengaturan')
  await page
    .getByLabel('Nama operator yang ditugaskan')
    .fill('Koordinator Sintetis')
  await page.getByRole('button', { name: 'Simpan pengaturan' }).click()
  await expect(page.getByRole('status')).toContainText('tersimpan')
  await page.goto('/petugas')
  await uploadCSV(page, 'Impor paket roster', 'renamed.json')
  await expect(page.getByRole('alert')).toContainText('Ini CSV daftar undangan')
  await page.getByRole('link', { name: 'Impor CSV di koordinator' }).click()
  await uploadCSV(page, 'Impor CSV')
  await expect(page.getByRole('dialog')).toContainText(
    '71 baris akan dimasukkan sebagai draf',
  )
  await page.getByRole('button', { name: 'Tutup', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Mulai dari daftar yang disahkan' }),
  ).toBeVisible()
  await uploadCSV(page, 'Impor CSV')
  await page.getByRole('button', { name: 'Impor 71 draf' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('cell', { name: 'Draf', exact: true }),
  ).toHaveCount(71)
  await page.reload()
  await expect(
    page.getByRole('cell', { name: 'Draf', exact: true }),
  ).toHaveCount(71)
  // Verify imported drafts did not create tokens, attendance, packages, or a denominator.
  await page.goto('/koordinator/berkas')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Backup master', exact: true }).click()
  const backup = JSON.parse(
    await readFile((await (await download).path())!, 'utf8'),
  )
  expect(backup.state.slots).toHaveLength(71)
  expect(
    backup.state.slots.every(
      (slot: { status: string; token?: string }) =>
        slot.status === 'draft' && !slot.token,
    ),
  ).toBe(true)
  expect(backup.state.packages).toEqual([])
  expect(backup.state.records).toEqual([])
  expect(backup.state.denominator).toBeNull()
  await page.goto('/petugas')
  await expect(
    page.getByRole('heading', { name: 'Paket roster belum tersedia' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Pindai QR', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Lengkapi nama operator dan muat roster',
  )
  await expect(
    page.getByRole('region', { name: 'Persiapan pemindai Supabase' }),
  ).toBeVisible()
  await expect(page.locator('video')).toHaveCount(0)
})

test('malformed JSON gives repair guidance without exposing its content', async ({
  page,
}) => {
  await page.goto('/petugas')
  await page
    .getByText('Impor paket roster', { exact: true })
    .locator('input')
    .setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"value":"SyntheticPrivateValue"'),
    })
  await expect(page.getByRole('alert')).toContainText(
    'JSON tidak valid atau berkas rusak',
  )
  await expect(page.getByRole('alert')).not.toContainText(
    'SyntheticPrivateValue',
  )
  await expect(page.getByRole('alert')).not.toContainText('Unexpected token')
})
