import { createContext, useContext } from 'react'
import type { TripAccess } from './model'

/** Set by TripPage for the trip on screen. Defaults to view-only, so anything rendered outside a trip can't edit one. */
export const TripAccessContext = createContext<TripAccess>('view')

/**
 * Whether to show the controls that change the open trip's contents: its owner, the admins and its editors. Other
 * travellers get false, and are left with the packing and to-do checkboxes. The database enforces the same rule;
 * this keeps dead controls off screen.
 */
export function useCanEdit(): boolean {
  return useContext(TripAccessContext) !== 'view'
}

/**
 * Whether to show the controls that only the trip's owner and the admins have: who is on the trip and in what role,
 * inviting them, and deleting the trip.
 */
export function useCanManage(): boolean {
  return useContext(TripAccessContext) === 'manage'
}
