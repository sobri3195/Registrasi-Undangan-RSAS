import { openDB } from 'idb'
import { initialState, stateSchema } from './model'
import type { State } from './model'

export const openDatabase = () =>
  openDB('rsas-registration', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore('state')
      if (oldVersion < 2) {
        const presence = db.createObjectStore('local_presence', {
          keyPath: 'record_id',
        })
        presence.createIndex('event_slot', ['event_id', 'invitation_id'], {
          unique: true,
        })
      }
      if (oldVersion < 3) db.createObjectStore('cloud')
    },
  })
export async function load(): Promise<State> {
  const database = await openDatabase()
  const tx = database.transaction('state', 'readwrite')
  const existing = await tx.store.get('current')
  const state = existing ? stateSchema.parse(existing) : initialState()
  if (!existing) await tx.store.put(state, 'current')
  await tx.done
  return state
}
export async function mutate<T>(
  change: (state: State) => T,
): Promise<{ state: State; result: T }> {
  const database = await openDatabase()
  const tx = database.transaction(['state', 'local_presence'], 'readwrite')
  try {
    const state = stateSchema.parse(
      (await tx.objectStore('state').get('current')) || initialState(),
    )
    const result = change(state)
    if (result instanceof Promise)
      throw new Error(
        'Mutasi penyimpanan harus sinkron; siapkan hash sebelum transaksi.',
      )
    await tx.objectStore('state').put(stateSchema.parse(state), 'current')
    // A native unique compound index enforces one active local check-in per event/slot.
    const presence = tx.objectStore('local_presence')
    await presence.clear()
    const voided = new Set(
      state.records.filter((r) => r.action === 'void').map((r) => r.target_id),
    )
    for (const r of state.records.filter(
      (r) =>
        r.device_id === state.device_id &&
        r.action === 'checkin' &&
        !voided.has(r.record_id),
    )) {
      await presence.add({
        record_id: r.record_id,
        event_id: r.event_id,
        invitation_id: r.invitation_id,
      })
    }
    await tx.done
    return { state, result }
  } catch (error) {
    try {
      tx.abort()
    } catch {
      /* Transaction may already have aborted. */
    }
    await tx.done.catch(() => undefined)
    throw error
  }
}
