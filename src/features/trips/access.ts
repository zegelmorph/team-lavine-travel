import { createContext, useContext } from 'react'
import type { TripAccess } from './model'

/** Set by TripPage for the trip on screen. Defaults to view-only, so anything rendered outside a trip can't edit one. */
export const TripAccessContext = createContext<TripAccess>('view')

/**
 * Whether to show the controls that change the open trip. Travellers on someone else's trip get false, and are left
 * with the packing and to-do checkboxes. The database enforces the same rule; this keeps dead controls off screen.
 */
export function useCanEdit(): boolean {
  return useContext(TripAccessContext) === 'manage'
}
