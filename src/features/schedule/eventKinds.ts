import {
  CalendarClock,
  Coffee,
  Compass,
  Drama,
  Landmark,
  Mountain,
  Sandwich,
  ShoppingBag,
  Star,
  Utensils,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import type { EventKind } from '@/lib/types'

export const EVENT_ICONS: Record<EventKind, LucideIcon> = {
  show: Drama,
  dinner: Utensils,
  lunch: Sandwich,
  breakfast: Coffee,
  drinks: Wine,
  tour: Compass,
  museum: Landmark,
  activity: Mountain,
  shopping: ShoppingBag,
  appointment: CalendarClock,
  other: Star,
}
