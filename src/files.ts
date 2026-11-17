import { EVENT, MAX_FILE } from './model'
export async function copyText(value: string) {
  if (!navigator.clipboard)
    throw new Error(
      'Salin otomatis tidak tersedia. Tekan lama teks tautan/pesan untuk menyalin secara manual.',
    )
  await navigator.clipboard.writeText(value)
}
export async function readFile(file: File) {
  if (file.size > MAX_FILE)
    throw new Error(`${file.name}: berkas melebihi 5 MB.`)
  return file.text()
}
export async function readJSON(file: File): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file))
  } catch (e) {
    throw new Error(
      `${file.name}: ${e instanceof Error ? e.message : 'JSON tidak valid'}`,
    )
  }
}
export function download(
  content: string,
  name: string,
  mime = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
export const filename = (kind: string, station = 'T05', ext = 'json') =>
  `${EVENT}_${station}_${kind}_${new Date().toISOString().replaceAll(':', '-')}.${ext}`
export const jsonDownload = (value: unknown, name: string) =>
  download(JSON.stringify(value, null, 2), name)
