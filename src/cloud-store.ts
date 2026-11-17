import { createContext, useContext } from 'react'
import type { CloudConfig } from './cloud-model'
import type { CloudMember } from './cloud-domain'
import type { State } from './model'
interface CloudContext {
  config: CloudConfig | null
  email: string | null
  member: CloudMember | null
  busy: boolean
  error: string
  lastAt: string | null
  pending: number
  configure: (config: CloudConfig) => Promise<void>
  check: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  sync: () => Promise<State | null>
  syncPending: () => Promise<State | null>
  prepareScanner: (operator: string) => Promise<void>
  publish: () => Promise<void>
}
export const CloudStore = createContext<CloudContext | null>(null)
export function useCloud() {
  const context = useContext(CloudStore)
  if (!context) throw new Error('Koneksi cloud belum dimuat')
  return context
}
