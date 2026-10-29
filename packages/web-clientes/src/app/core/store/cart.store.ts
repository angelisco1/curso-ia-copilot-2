import { Injectable, signal, computed } from '@angular/core'

export interface Dish {
  id: string
  name: string
  description: string | null
  price: number
  category: string
  available: boolean
  restaurantId: string
  ingredients: { ingredientId: string; quantity: number }[]
}

export interface CartItem {
  dish: Dish
  quantity: number
  notes: string
}

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly _items = signal<CartItem[]>([])
  private readonly _restaurantId = signal<string | null>(null)
  private readonly _sessionId = signal<string | null>(null)

  readonly items = this._items.asReadonly()
  readonly restaurantId = this._restaurantId.asReadonly()
  /** Ocupación (visita) a la que pertenece el carrito. */
  readonly sessionId = this._sessionId.asReadonly()

  readonly total = computed(() =>
    this._items().reduce((sum, item) => sum + item.dish.price * item.quantity, 0)
  )

  readonly itemCount = computed(() =>
    this._items().reduce((count, item) => count + item.quantity, 0)
  )

  /** Vincula el carrito a una visita; si cambia la sesión o el restaurante, descarta los productos previos. */
  bindSession(restaurantId: string, sessionId: string): void {
    if (this._sessionId() !== sessionId || this._restaurantId() !== restaurantId) {
      this._items.set([])
    }
    this._restaurantId.set(restaurantId)
    this._sessionId.set(sessionId)
  }

  addItem(dish: Dish, quantity: number = 1, notes: string = ''): void {
    if (this._restaurantId() && this._restaurantId() !== dish.restaurantId) {
      this._items.set([])
      this._sessionId.set(null)
    }
    this._restaurantId.set(dish.restaurantId)

    const existingIndex = this._items().findIndex(
      item => item.dish.id === dish.id && item.notes === notes
    )

    if (existingIndex >= 0) {
      const items = [...this._items()]
      items[existingIndex] = {
        ...items[existingIndex],
        quantity: items[existingIndex].quantity + quantity
      }
      this._items.set(items)
    } else {
      this._items.update(items => [...items, { dish, quantity, notes }])
    }
  }

  removeItem(dishId: string): void {
    const items = this._items().filter(item => item.dish.id !== dishId)
    this._items.set(items)
    if (items.length === 0 && !this._sessionId()) {
      this._restaurantId.set(null)
    }
  }

  updateQuantity(dishId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(dishId)
      return
    }
    const items = this._items().map(item =>
      item.dish.id === dishId ? { ...item, quantity } : item
    )
    this._items.set(items)
  }

  /** Vacía los productos (p. ej. tras enviar el pedido). La vinculación a la visita se conserva. */
  clear(): void {
    this._items.set([])
    if (!this._sessionId()) this._restaurantId.set(null)
  }

  /** Descarta productos y vinculación (visita obsoleta o cerrada). */
  reset(): void {
    this._items.set([])
    this._restaurantId.set(null)
    this._sessionId.set(null)
  }
}
