export type TableStatus = 'libre' | 'ocupada' | 'reservada'

export const TABLE_STATUSES: readonly TableStatus[] = ['libre', 'ocupada', 'reservada']

export interface RestaurantTable {
  id: string
  restaurantId: string
  number: number
  description: string
  capacity: number
  status: TableStatus
  /** Sesión abierta o null. Solo lectura; no revela al cliente. */
  activeSessionId: string | null
}

export interface CreateTableDto {
  number: number
  description?: string
  capacity: number
  status?: TableStatus
}

export interface UpdateTableDto {
  number: number
  description: string
  capacity: number
  status: TableStatus
}
