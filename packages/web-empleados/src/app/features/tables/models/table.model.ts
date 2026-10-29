export type TableStatus = 'libre' | 'ocupada' | 'reservada'

export const TABLE_STATUSES: readonly TableStatus[] = ['libre', 'ocupada', 'reservada']

export interface Table {
  id: string
  restaurantId: string
  number: number
  description: string
  capacity: number
  status: TableStatus
  activeSessionId: string | null
}

export interface UpdateTableStatusDto {
  status: TableStatus
}
