export interface Household {
  id: string
  name: string
}

export type HouseholdRole = 'owner' | 'member'

/** A household the signed-in user belongs to, from `my_households()`. */
export interface MyHousehold extends Household {
  role: HouseholdRole
  last_accessed_at: string | null
}

export interface HouseholdMember {
  user_id: string
  email: string
  role: HouseholdRole
}

export type TripStatus = 'dreaming' | 'planning' | 'happening' | 'complete'

export const TRIP_STATUSES: TripStatus[] = ['dreaming', 'planning', 'happening', 'complete']

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  dreaming: 'Dreaming',
  planning: 'Planning',
  happening: 'Happening Now',
  complete: 'Complete',
}

export interface Trip {
  id: string
  household_id: string
  name: string
  status: TripStatus
  status_auto: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

/** Row of the `travel_trip_summaries` view. */
export interface TripSummary extends Trip {
  start_date: string | null
  end_date: string | null
  destinations: string[]
  /** Same order as `destinations`. */
  destination_ids: string[]
  participant_count: number
  participants: string[]
}

export interface Destination {
  id: string
  trip_id: string
  name: string
  address: string | null
  place_id: string | null
  lat: number | null
  lng: number | null
  timezone: string | null
  start_date: string | null
  end_date: string | null
  sort_order: number
  notes: string | null
  weather_refreshed_at: string | null
}

export interface WeatherDay {
  destination_id: string
  date: string
  temp_max_c: number | null
  temp_min_c: number | null
  precip_prob: number | null
  precip_mm: number | null
  weather_code: number | null
  source: 'forecast' | 'typical'
}

export interface Participant {
  id: string
  trip_id: string
  user_id: string | null
  display_name: string
  sort_order: number
}

export type TransportMode = 'car' | 'plane' | 'train' | 'subway' | 'ferry' | 'cruise' | 'bus' | 'rideshare' | 'walk' | 'other'

export const TRANSPORT_MODES: TransportMode[] = ['plane', 'car', 'train', 'subway', 'ferry', 'cruise', 'bus', 'rideshare', 'walk', 'other']

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  car: 'Car',
  plane: 'Plane',
  train: 'Train',
  subway: 'Subway',
  ferry: 'Ferry',
  cruise: 'Cruise',
  bus: 'Bus',
  rideshare: 'Rideshare / taxi',
  walk: 'Walk',
  other: 'Other',
}

export interface Transport {
  id: string
  trip_id: string
  mode: TransportMode
  carrier: string | null
  number: string | null
  confirmation: string | null
  depart_location: string | null
  depart_place_id: string | null
  /** Local wall-clock date and `HH:mm:ss` time at the departure point; either can be unset. */
  depart_date: string | null
  depart_time: string | null
  depart_tz: string | null
  arrive_location: string | null
  arrive_place_id: string | null
  arrive_date: string | null
  arrive_time: string | null
  arrive_tz: string | null
  notes: string | null
  created_at: string
}

export interface Lodging {
  id: string
  trip_id: string
  destination_id: string | null
  name: string
  address: string | null
  place_id: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  website: string | null
  google_maps_url: string | null
  rating: number | null
  check_in: string
  check_out: string
  /** `HH:mm:ss` */
  check_in_time: string | null
  check_out_time: string | null
  confirmation: string | null
  notes: string | null
}

export type EventKind = 'show' | 'dinner' | 'lunch' | 'breakfast' | 'drinks' | 'tour' | 'museum' | 'activity' | 'shopping' | 'appointment' | 'other'

export const EVENT_KINDS: EventKind[] = [
  'show',
  'dinner',
  'lunch',
  'breakfast',
  'drinks',
  'tour',
  'museum',
  'activity',
  'shopping',
  'appointment',
  'other',
]

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  show: 'Show',
  dinner: 'Dinner',
  lunch: 'Lunch',
  breakfast: 'Breakfast',
  drinks: 'Drinks',
  tour: 'Tour',
  museum: 'Museum',
  activity: 'Activity',
  shopping: 'Shopping',
  appointment: 'Appointment',
  other: 'Other',
}

export interface TripEvent {
  id: string
  trip_id: string
  kind: EventKind
  /** False for ideas not booked yet, which may also have no date. */
  booked: boolean
  date: string | null
  /** `HH:mm:ss`; null means all day. */
  start_time: string | null
  end_time: string | null
  title: string
  /** Place name; the fields below are filled in when it was looked up. */
  location: string | null
  address: string | null
  place_id: string | null
  lat: number | null
  lng: number | null
  google_maps_url: string | null
  /** Seat numbers, for shows. */
  seats: string | null
  /** Set only when adjusted; otherwise the run time is the start-end span. */
  run_time_minutes: number | null
  notes: string | null
}

export interface PackCategory {
  id: string
  household_id: string
  name: string
  sort_order: number
}

/** The table still has a `default_qty` column; it's unused, since quantities are set per trip. */
export interface PackCatalogItem {
  id: string
  household_id: string
  category_id: string | null
  name: string
  /** Which list it's on: the travel cabinet (a checklist on every trip) or packing items (offered when adding to a trip). */
  in_cabinet: boolean
}

export interface PackItem {
  id: string
  trip_id: string
  category_id: string | null
  catalog_item_id: string | null
  name: string
  quantity: number
  packed: boolean
  created_at: string
}

/** Result of the travel-places edge function's details lookup. */
export interface PlaceDetails {
  placeId: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  website: string | null
  rating: number | null
  googleMapsUri: string | null
  country: string | null
}
