import { TestBed, ComponentFixture } from '@angular/core/testing'
import { signal } from '@angular/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthStore } from '@resttek/web-shared'
import type { Order } from '../../models/order.model'
import { OrderStore } from '../../store/order.store'
import { CocinaComponent } from './cocina.component'

const order = (id: string, extra: Partial<Order>): Order => ({
  id, restaurantId: 'r1', tableId: null, clientId: null, createdAt: '',
  items: [{ id: id + '-i', orderId: id, dishName: 'Plato', dishCategory: 'principal', quantity: 1, notes: null, status: 'pendiente' } as any],
  ...extra
})

describe('CocinaComponent etiquetas de mesa', () => {
  let fixture: ComponentFixture<CocinaComponent>
  let orders: ReturnType<typeof signal<Order[]>>

  beforeEach(() => {
    orders = signal<Order[]>([])
    TestBed.configureTestingModule({
      imports: [CocinaComponent],
      providers: [
        { provide: AuthStore, useValue: { user: signal({ restaurantId: 'r1' }) } },
        { provide: OrderStore, useValue: { orders, loading: signal(false), error: signal(null), startPolling: vi.fn(), stopPolling: vi.fn(), updateItemStatus: vi.fn() } }
      ]
    })
  })

  const render = () => {
    fixture = TestBed.createComponent(CocinaComponent)
    fixture.detectChanges()
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.order-card')).map(e => e.textContent ?? '')
  }

  it('muestra tableNumber y marca la visita cerrada', () => {
    orders.set([order('o1', { tableId: 'uuid-x', tableNumber: 5, tableSessionEndedAt: '2026-10-29T10:00:00Z' })])
    const [card] = render()
    expect(card).toContain('Mesa 5')
    expect(card).not.toContain('uuid-x')
    expect(card).toContain('Visita cerrada')
  })

  it('pedido de visita abierta no se etiqueta como cerrada', () => {
    orders.set([order('o1', { tableId: 'uuid-x', tableNumber: 5, tableSessionEndedAt: null })])
    expect(render()[0]).not.toContain('Visita cerrada')
  })

  it('pedido histórico sin sesión usa tableId y sigue visible', () => {
    orders.set([order('o1', { tableId: '8' })])
    const [card] = render()
    expect(card).toContain('Mesa 8')
    expect(card).not.toContain('Visita cerrada')
  })

  it('pedido sin mesa no muestra etiqueta de mesa', () => {
    orders.set([order('o1', {})])
    expect(render()[0]).not.toContain('Mesa')
  })
})
