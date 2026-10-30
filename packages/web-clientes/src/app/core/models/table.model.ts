export type TableStatus = 'libre' | 'ocupada' | 'reservada'

/** Vista pública de una mesa elegible (sin estado, sesión ni datos personales). */
export interface AvailableTable {
  id: string
  number: number
  description: string
  capacity: number
}

export interface Table {
  id: string
  restaurantId: string
  number: number
  description: string
  capacity: number
  status: TableStatus
  activeSessionId: string | null
}

export interface TableSession {
  id: string
  restaurantId: string
  tableId: string
  clientId: string | null
  partySize: number | null
  startedAt: string
  endedAt: string | null
}

/** Ocupación abierta del propio cliente: sesión y su mesa. */
export interface TableOccupation {
  session: TableSession
  table: Table
}
