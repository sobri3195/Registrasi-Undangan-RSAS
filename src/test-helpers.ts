import type { Slot } from './model'
export const draft = (code = 'DEMO-1'): Slot => ({
  id: crypto.randomUUID(),
  code,
  name: '',
  label: 'PT Contoh Sehat',
  organization: 'Perusahaan Sintetis',
  group: 'Mitra provider dan korporasi',
  category: 'REGULER',
  kind: 'institution',
  status: 'draft',
  representative: '',
  desk: '',
  rsvp: 'unknown',
})
