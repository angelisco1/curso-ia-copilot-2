import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import type { Order } from '../../../orders/models/order.model'
import { TableOrdersComponent } from './table-orders.component'

const order = (id: string, statuses: string[]): Order => ({
  id: id + '-xxxxxxxx', restaurantId: 'r', tableId: 't', clientId: null, createdAt: '',
  items: statuses.map((s, i) => ({ id: id + i, orderId: id, dishName: 'P' + i, quantity: 2, notes: i === 0 ? 'sin sal' : null, status: s } as any))
})

function render(inputs: { orders: Order[]; loading?: boolean; error?: string | null }) {
  const fixture = TestBed.createComponent(TableOrdersComponent)
  fixture.componentRef.setInput('orders', inputs.orders)
  if (inputs.loading !== undefined) fixture.componentRef.setInput('loading', inputs.loading)
  if (inputs.error !== undefined) fixture.componentRef.setInput('error', inputs.error)
  fixture.detectChanges()
  return fixture.nativeElement as HTMLElement
}

describe('TableOrdersComponent', () => {
  it('lista cada pedido por separado con todos sus ítems y estados, incluido entregado', () => {
    const el = render({ orders: [order('a', ['pendiente', 'entregado']), order('b', ['listo'])] })
    const sections = el.querySelectorAll('.order')
    expect(sections).toHaveLength(2)
    expect(sections[0].textContent).toContain('Pedido 1')
    expect(sections[1].textContent).toContain('Pedido 2')
    expect(sections[0].querySelectorAll('li')).toHaveLength(2)
    expect(sections[0].querySelector('.badge-entregado')?.textContent?.trim()).toBe('entregado')
    expect(sections[0].textContent).toContain('2x')
    expect(sections[0].textContent).toContain('sin sal')
  })

  it('muestra vacío explícito, cargando y error', () => {
    expect(render({ orders: [] }).textContent).toContain('Esta visita aún no tiene pedidos')
    expect(render({ orders: [], loading: true }).querySelector('.spinner')).not.toBeNull()
    const err = render({ orders: [], error: 'fallo' })
    expect(err.querySelector('.alert-error')?.textContent).toContain('fallo')
    expect(err.textContent).not.toContain('Esta visita aún no tiene pedidos')
  })
})
