import { Bus, Car, CarTaxiFront, Footprints, Plane, Route, Sailboat, Ship, TrainFront, TramFront, type LucideIcon } from 'lucide-react'
import type { TransportMode } from '@/lib/types'

export const MODE_ICONS: Record<TransportMode, LucideIcon> = {
  plane: Plane,
  car: Car,
  train: TrainFront,
  subway: TramFront,
  ferry: Sailboat,
  cruise: Ship,
  bus: Bus,
  rideshare: CarTaxiFront,
  walk: Footprints,
  other: Route,
}

/** Field labels that read naturally for each mode. */
export const MODE_FIELDS: Record<TransportMode, { carrier: string; number: string | null }> = {
  plane: { carrier: 'Airline', number: 'Flight number' },
  car: { carrier: 'Rental company', number: null },
  train: { carrier: 'Rail line', number: 'Train number' },
  subway: { carrier: 'System', number: 'Line' },
  walk: { carrier: 'Route', number: null },
  ferry: { carrier: 'Ferry line', number: 'Sailing' },
  cruise: { carrier: 'Cruise line', number: 'Ship' },
  bus: { carrier: 'Bus line', number: 'Route' },
  rideshare: { carrier: 'Service', number: null },
  other: { carrier: 'Provider', number: 'Reference' },
}
