import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { Persister } from '@tanstack/react-query-persist-client'
import type { Query } from '@tanstack/react-query'
import { del, get, set } from 'idb-keyval'
import { storedSessionUserId } from './supabase'

const KEY = 'travel-query-cache'
const OWNER_KEY = 'travel:cache-user'

/** How long the on-device copy of trip data is trusted for offline viewing. */
export const PERSIST_MAX_AGE = 30 * 24 * 60 * 60 * 1000

const idbPersister = createAsyncStoragePersister({
  key: KEY,
  storage: { getItem: (k) => get<string>(k).then((v) => v ?? null), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  throttleTime: 1000,
})

/**
 * Saves the query cache to IndexedDB so trips open with no signal. A copy is only restored for the user it was saved
 * for, so someone signing in on a shared phone (e.g. from an invite link) never sees the previous user's trips.
 */
export const queryPersister: Persister = {
  ...idbPersister,
  restoreClient: async () => {
    const user = storedSessionUserId()
    return user && user === localStorage.getItem(OWNER_KEY) ? idbPersister.restoreClient() : undefined
  },
}

/** Leaves out queries nobody has refreshed in a month (deleted trips, old weather keys) so the copy doesn't grow. */
export function shouldPersistQuery(query: Query) {
  return query.state.status === 'success' && Date.now() - query.state.dataUpdatedAt < PERSIST_MAX_AGE
}

/**
 * Busts the saved copy whenever a new build loads, so data cached by an older version (missing newer fields) is
 * never rendered. A new build only installs while online, where the data is refetched straight away.
 */
export const PERSIST_BUSTER = __APP_BUILD__

/**
 * Records whose data the cache holds. Returns true when that changed, meaning the cache (in memory and on disk)
 * holds someone else's data and must be cleared.
 */
export function claimCache(userId: string | null): boolean {
  const changed = localStorage.getItem(OWNER_KEY) !== userId
  if (userId) localStorage.setItem(OWNER_KEY, userId)
  else localStorage.removeItem(OWNER_KEY)
  if (changed) void del(KEY)
  return changed
}
