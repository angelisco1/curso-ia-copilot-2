import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router'
import { of } from 'rxjs'
import { LucideAngularModule, Utensils } from 'lucide-angular'
import { OrderDetailComponent } from './order-detail.component'
import { OrderService } from '../../core/services/order.service'
import { Order } from '../../core/models/order.model'

function render(extra: Partial<Order> = {}) {
  const o: Order = {
    id: 'o-12345678', restaurantId: 'r-1', restaurantName: 'Uno', tableId: null, clientId: null,
    createdAt: '2025-01-01T10:00:00Z',
    items: [{ id: 'i', dishId: 'd', quantity: 1, notes: null, status: 'pendiente', dishName: 'Paella', dishPrice: 5 }],
    ...extra
  }
  TestBed.configureTestingModule({
    imports: [LucideAngularModule.pick({ Utensils })],
    providers: [
      provideRouter([]),
      { provide: OrderService, useValue: { getOrderById: () => of(o) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: o.id }) } } }
    ]
  })
  const fixture = TestBed.createComponent(OrderDetailComponent)
  fixture.detectChanges()
  return fixture.nativeElement as HTMLElement
}

describe('OrderDetailComponent (mesa)', () => {
  it('pedido histórico sin campos de ocupación se muestra igualmente', () => {
    const el = render()
    expect(el.textContent).toContain('Paella')
    expect(el.querySelector('[data-testid="order-table"]')).toBeNull()
  })

  it('muestra la mesa y la marca de ocupación anterior', () => {
    const el = render({ tableSessionId: 's', tableNumber: 3, tableSessionEndedAt: '2025-01-01T12:00:00Z' })
    expect(el.querySelector('[data-testid="order-table"]')?.textContent).toContain('Mesa 3')
    expect(el.querySelector('[data-testid="order-previous"]')?.textContent).toContain('Ocupación anterior')
  })

  it('con ocupación vigente muestra mesa sin marca de anterior', () => {
    const el = render({ tableSessionId: 's', tableNumber: 3, tableSessionEndedAt: null })
    expect(el.querySelector('[data-testid="order-table"]')?.textContent).toContain('Mesa 3')
    expect(el.querySelector('[data-testid="order-previous"]')).toBeNull()
  })
})
