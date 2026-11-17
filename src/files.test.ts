import { describe, expect, it } from 'vitest'
import { readJSON } from './files'
import { MAX_FILE } from './model'

// Synthetic data only: never check the operational roster into test fixtures.
const csv =
  'invitation_code,name,invited_label,organization,guest_group,guest_category,roster_status\nTEST-001,,Perwakilan Sintetis,PT Contoh,Demo,,draft\n'
const purposes = ['roster-package', 'station-log', 'master-backup'] as const

describe('Import file format guidance', () => {
  it.each(purposes)(
    'directs CSV to roster import instead of JSON parsing for %s',
    async (purpose) => {
      await expect(
        readJSON(
          new File([csv], 'roster-draft.csv', { type: 'text/csv' }),
          purpose,
        ),
      ).rejects.toThrow('Koordinator → Daftar undangan → Impor CSV')
    },
  )
  it('recognizes a CSV roster renamed to JSON, with BOM, quoted/reordered headers and blank lines', async () => {
    const content =
      '\uFEFF\n"roster_status","invited_label","invitation_code"\ndraft,Perwakilan Sintetis,TEST-001'
    await expect(
      readJSON(
        new File([content], 'misnamed.json', { type: 'application/json' }),
        'roster-package',
      ),
    ).rejects.toThrow('Ini CSV daftar undangan')
  })
  it('gives a repair instruction for malformed JSON without exposing parser excerpts', async () => {
    const marker = 'SyntheticPrivateValue'
    const error = await readJSON(
      new File([`{"secret":"${marker}"`], 'broken.json'),
      'station-log',
    ).catch((error) => error as Error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(
      'JSON tidak valid atau berkas rusak',
    )
    expect((error as Error).message).toContain('Ekspor catatan tablet')
    expect((error as Error).message).not.toContain(marker)
    expect((error as Error).message).not.toContain('Unexpected token')
  })
  it('does not expose CSV cell values in the error', async () => {
    const error = await readJSON(
      new File([csv], 'roster.csv'),
      'roster-package',
    ).catch((error) => error as Error)
    expect((error as Error).message).not.toContain('Perwakilan Sintetis')
    expect((error as Error).message).toContain('Buat & unduh paket baru')
  })
  it('explains why a CSV cannot restore a master backup', async () => {
    await expect(
      readJSON(new File([csv], 'roster.csv'), 'master-backup'),
    ).rejects.toThrow('CSV tidak dapat memulihkan token')
  })
  it('accepts valid JSON including a UTF-8 BOM without depending on the filename', async () => {
    const value = { type: 'roster-package', slots: [] }
    await expect(
      readJSON(
        new File([`\uFEFF${JSON.stringify(value)}`], 'package.json'),
        'roster-package',
      ),
    ).resolves.toEqual(value)
    await expect(
      readJSON(
        new File([JSON.stringify(value)], 'renamed.csv'),
        'roster-package',
      ),
    ).resolves.toEqual(value)
  })
  it('preserves the 5 MB limit before attempting to parse any content', async () => {
    await expect(
      readJSON(
        new File(['x'.repeat(MAX_FILE + 1)], 'large.csv'),
        'roster-package',
      ),
    ).rejects.toThrow('large.csv: berkas melebihi 5 MB.')
  })
  it('rejects an empty file with an actionable JSON message', async () => {
    await expect(
      readJSON(new File(['\uFEFF\n'], 'empty.json'), 'master-backup'),
    ).rejects.toThrow('Pilih berkas .json dari tombol Backup master')
  })
})
