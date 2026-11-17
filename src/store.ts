import { createContext, useContext } from 'react'
import type { State } from './model'
interface Context {
  state: State
  commit: <T>(change: (state: State) => T) => Promise<T>
  notify: (message: string, error?: boolean) => void
}
export const Store = createContext<Context | null>(null)
export function useStore() {
  const ctx = useContext(Store)
  if (!ctx) throw new Error('Penyimpanan belum siap')
  return ctx
}
