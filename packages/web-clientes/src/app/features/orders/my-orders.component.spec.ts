import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { of } from 'rxjs'
import { MyOrdersComponent } from './my-orders.component'
import { OrderService } from '../../core/services/order.service'
import { Order } from '../../core/models/order.model'

function order(extra: Partial<Order> = {}): Order {
  return {
    id: 'o-1', restaurantId: 'r-1', restaurantName: 'Uno', tableId: null, clientId: null,
    createdAt: '2025-01-01T10:00:00Z',
    items: [{ id: 'i', dishId: 'd', quantity: 1, notes: null, status: 'pendiente', dishPrice: 5 }],
    ...extra
  }
}

function render(orders: Order[]) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: OrderService, useValue: { getMyOrders: () => of(orders) } }]
  })
  const fixture = TestBed.createComponent(MyOrdersComponent)
  fixture.detectChanges()
  return fixture.nativeElement as HTMLElement
}

describe('MyOrdersComponent (mesa)', () => {
  it('sigue mostrando pedidos históricos sin campos de ocupación', () => {
    const el = render([order()])
    expect(el.textContent).toContain('Uno')
    expect(el.querySelector('[data-testid="order-table"]')).toBeNull()
  })

  it('tolera campos de ocupación null', () => {
    const el = render([order({ tableSessionId: null, tableNumber: null, tableSessionEndedAt: null })])
    expect(el.querySelector('[data-testid="order-table"]')).toBeNull()
  })

  it('muestra el número de mesa', () => {
    const el = render([order({ tableSessionId: 's', tableNumber: 7 })])
    expect(el.querySelector('[data-testid="order-table"]')?.textContent).toContain('Mesa 7')
    expect(el.querySelector('[data-testid="order-previous"]')).toBeNull()
  })

  it('marca como ocupación anterior si la sesión ya terminó', () => {
    const el = render([order({ tableSessionId: 's', tableNumber: 7, tableSessionEndedAt: '2025-01-01T12:00:00Z' })])
    expect(el.querySelector('[data-testid="order-previous"]')?.textContent).toContain('Ocupación anterior')
  })
})
