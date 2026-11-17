import { EVENT, MAX_FILE } from './model'
import Papa from 'papaparse'

type JSONPurpose = 'roster-package' | 'station-log' | 'master-backup'
const jsonInstructions: Record<JSONPurpose, string> = {
  'roster-package':
    'Pilih paket roster .json yang dibuat T05 melalui Koordinator → Paket & penggabungan → Buat & unduh paket baru.',
  'station-log':
    'Pilih berkas catatan .json dari tombol Ekspor catatan tablet pada perangkat petugas.',
  'master-backup':
    'Pilih berkas .json dari tombol Backup master. CSV tidak dapat memulihkan token atau catatan master.',
}
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
export async function readJSON(
  file: File,
  purpose: JSONPurpose,
): Promise<unknown> {
  const content = (await readFile(file)).replace(/^\uFEFF/, '').trim()
  // Inspect the content as well as the extension: CSV can be renamed to .json.
  // Never include parser excerpts, which may contain operational data, in errors.
  if (content && !content.startsWith('{') && !content.startsWith('[')) {
    const header =
      Papa.parse<string[]>(content, { preview: 1, skipEmptyLines: 'greedy' })
        .data[0] || []
    const rosterCSV = [
      'invitation_code',
      'invited_label',
      'roster_status',
    ].every((column) => header.some((value) => value.trim() === column))
    const otherCSV =
      header.length > 1 &&
      (/\.csv$/i.test(file.name) || file.type === 'text/csv')
    if (rosterCSV || otherCSV) {
      throw new Error(
        `${file.name}: Ini CSV daftar undangan, bukan berkas JSON. Impor di Koordinator → Daftar undangan → Impor CSV, lalu sahkan slot dan buat paket JSON untuk tablet. ${jsonInstructions[purpose]}`,
      )
    }
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(
      `${file.name}: JSON tidak valid atau berkas rusak. ${jsonInstructions[purpose]}`,
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
