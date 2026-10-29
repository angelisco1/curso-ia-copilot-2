import { Component, computed, inject, signal } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { DecimalPipe } from '@angular/common'
import { CartStore } from '../../core/store/cart.store'
import { TableSessionStore } from '../../core/store/table-session.store'
import { OrderService } from '../../core/services/order.service'
import { describeTableError, isSessionErrorCode, parseApiError } from '../../core/models/api-error'

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  template: `
    <div class="container">
      <div class="page-header">
        <h1>Tu pedido</h1>
      </div>

      @if (cartStore.items().length === 0) {
        <div class="empty-state card">
          <p>Tu carrito está vacío</p>
          <a routerLink="/restaurants" class="btn btn-primary" style="margin-top: 16px;">
            Ver restaurantes
          </a>
        </div>
      } @else {
        <div class="cart-layout">
          <div class="cart-items">
            @for (item of cartStore.items(); track item.dish.id) {
              <div class="cart-item card">
                <div class="item-info">
                  <h3>{{ item.dish.name }}</h3>
                  <p class="item-price">{{ item.dish.price | number:'1.2-2' }} € / ud</p>
                </div>
                <div class="item-controls">
                  <div class="quantity-selector">
                    <button class="qty-btn" (click)="decrement(item.dish.id)">-</button>
                    <span>{{ item.quantity }}</span>
                    <button class="qty-btn" (click)="increment(item.dish.id)">+</button>
                  </div>
                  <span class="item-subtotal">{{ item.dish.price * item.quantity | number:'1.2-2' }} €</span>
                  <button class="btn btn-danger btn-sm" (click)="remove(item.dish.id)">Eliminar</button>
                </div>
              </div>
            }
          </div>

          <aside class="order-summary card">
            <h3>Resumen</h3>
            @if (occupation(); as occ) {
              <p class="table-info" data-testid="table-info">
                Mesa {{ occ.table.number }}@if (occ.session.partySize) { · {{ occ.session.partySize }} personas }
              </p>
            }
            <div class="summary-row">
              <span>Items ({{ cartStore.itemCount() }})</span>
              <span>{{ cartStore.total() | number:'1.2-2' }} €</span>
            </div>
            <div class="summary-row total">
              <span>Total</span>
              <strong>{{ cartStore.total() | number:'1.2-2' }} €</strong>
            </div>
            <button class="btn btn-primary" data-testid="confirm-order" style="width: 100%; justify-content: center; margin-top: 16px;" 
                    [disabled]="loading()" (click)="confirmOrder()">
              @if (loading()) {
                Confirmando...
              } @else if (error()) {
                Reintentar
              } @else {
                Confirmar pedido
              }
            </button>
            @if (error()) {
              <p class="error-msg">{{ error() }}</p>
            }
          </aside>
        </div>
      }
    </div>
  `,
  styles: [`
    .table-info {
      color: var(--text-secondary);
      font-size: 14px;
      margin: 4px 0 12px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .cart-layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 24px;
    }
    @media (max-width: 768px) {
      .cart-layout {
        grid-template-columns: 1fr;
      }
    }
    .cart-items {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .cart-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
    }
    .item-info h3 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .item-price {
      color: var(--text-muted);
      font-size: 13px;
    }
    .item-controls {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .quantity-selector {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-input);
      border-radius: var(--radius-sm);
      padding: 4px;
    }
    .qty-btn {
      width: 28px;
      height: 28px;
      border-radius: 4px;
      background: var(--bg-hover);
      color: var(--text-primary);
      font-weight: 600;
    }
    .qty-btn:hover {
      background: var(--green-glow);
      color: var(--green-light);
    }
    .item-subtotal {
      font-weight: 600;
      color: var(--text-primary);
      min-width: 80px;
      text-align: right;
    }
    .order-summary {
      position: sticky;
      top: 84px;
      height: fit-content;
    }
    .order-summary h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      color: var(--text-secondary);
    }
    .summary-row.total {
      border-top: 1px solid var(--border-color);
      margin-top: 8px;
      padding-top: 12px;
      font-size: 18px;
      color: var(--text-primary);
    }
    .error-msg {
      color: var(--red);
      text-align: center;
      margin-top: 8px;
      font-size: 13px;
    }
  `]
})
export class CartComponent {
  readonly cartStore = inject(CartStore)
  private readonly sessionStore = inject(TableSessionStore)
  private readonly orderService = inject(OrderService)
  private readonly router = inject(Router)

  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly occupation = computed(() => {
    const restaurantId = this.cartStore.restaurantId()
    const occupation = restaurantId ? this.sessionStore.occupationFor(restaurantId) : null
    return occupation && occupation.session.id === this.cartStore.sessionId() ? occupation : null
  })

  increment(dishId: string): void {
    const item = this.cartStore.items().find(i => i.dish.id === dishId)
    if (item) {
      this.cartStore.updateQuantity(dishId, item.quantity + 1)
    }
  }

  decrement(dishId: string): void {
    const item = this.cartStore.items().find(i => i.dish.id === dishId)
    if (item) {
      this.cartStore.updateQuantity(dishId, item.quantity - 1)
    }
  }

  remove(dishId: string): void {
    this.cartStore.removeItem(dishId)
  }

  confirmOrder(): void {
    const restaurantId = this.cartStore.restaurantId()
    if (this.loading() || !restaurantId || this.cartStore.items().length === 0) return

    const occupation = this.occupation()
    if (!occupation) {
      // Sin visita vigente no se envía nada: se vuelve a elegir mesa.
      this.backToTableSelection(restaurantId, describeTableError(
        { status: null, code: 'TableSessionRequiredError', message: null }, ''
      ))
      return
    }

    this.loading.set(true)
    this.error.set(null)

    const items = this.cartStore.items().map(item => ({
      dishId: item.dish.id,
      quantity: item.quantity,
      notes: item.notes || null
    }))

    this.orderService.createOrder(restaurantId, occupation.table.id, occupation.session.id, items).subscribe({
      next: (order) => {
        this.cartStore.clear()
        this.router.navigate(['/orders', order.id])
      },
      error: (err) => {
        const parsed = parseApiError(err)
        if (isSessionErrorCode(parsed.code)) {
          // La visita ya no es válida: no se reenvía el carrito a otra mesa.
          this.loading.set(false)
          this.backToTableSelection(restaurantId, describeTableError(parsed, ''))
          return
        }
        this.error.set('Error al confirmar el pedido. Inténtalo de nuevo.')
        this.loading.set(false)
      }
    })
  }

  private backToTableSelection(restaurantId: string, notice: string): void {
    this.sessionStore.clear()
    this.cartStore.reset()
    this.router.navigate(['/restaurants', restaurantId, 'tables'], { state: { notice } })
  }
}
