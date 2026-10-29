export interface OrderItem {
  id: string
  dishId: string
  quantity: number
  notes: string | null
  status: string
  dishName?: string
  dishPrice?: number
}

export interface Order {
  id: string
  restaurantId: string
  restaurantName?: string
  restaurantLogoUrl?: string | null
  tableId: string | null
  clientId: string | null
  createdAt: string
  items: OrderItem[]
  /** Campos de ocupación: pueden faltar (pedidos históricos o respuestas antiguas) o ser null. */
  tableSessionId?: string | null
  tableNumber?: number | null
  tableSessionEndedAt?: string | null
}
