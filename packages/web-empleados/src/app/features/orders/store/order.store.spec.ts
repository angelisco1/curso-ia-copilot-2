import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '../models/order.model'
import { OrderService } from '../services/order.service'
import { OrderStore } from './order.store'

const o = (id: string): Order => ({ id, restaurantId: 'r', tableId: null, clientId: null, createdAt: '', items: [] })

describe('OrderStore polling', () => {
  let store: OrderStore
  let calls: { restaurantId: string; res: Subject<Order[]> }[]
  let service: { getActiveOrders: any }

  beforeEach(() => {
    vi.useFakeTimers()
    calls = []
    service = {
      getActiveOrders: vi.fn((restaurantId: string) => {
        const res = new Subject<Order[]>()
        calls.push({ restaurantId, res })
        return res.asObservable()
      })
    }
    TestBed.configureTestingModule({ providers: [OrderStore, { provide: OrderService, useValue: service }] })
    store = TestBed.inject(OrderStore)
  })

  afterEach(() => {
    store.stopPolling()
    vi.useRealTimers()
    TestBed.resetTestingModule()
  })

  it('reiniciar el polling no duplica intervalos', async () => {
    store.startPolling('r1')
    store.startPolling('r1')
    expect(service.getActiveOrders).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10000)
    const base = service.getActiveOrders.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(service.getActiveOrders.mock.calls.length - base).toBeLessThanOrEqual(1)
  })

  it('descarta respuestas tardías tras cambiar de restaurante y limpia pedidos', async () => {
    store.startPolling('r1')
    store.startPolling('r2')
    calls[1].res.next([o('b')])
    await vi.advanceTimersByTimeAsync(0)
    calls[0].res.next([o('a')])
    await vi.advanceTimersByTimeAsync(0)
    expect(store.orders().map(x => x.id)).toEqual(['b'])
    store.clear()
    expect(store.orders()).toEqual([])
  })

  it('stopPolling invalida la respuesta en vuelo', async () => {
    store.startPolling('r1')
    store.stopPolling()
    calls[0].res.next([o('a')])
    await vi.advanceTimersByTimeAsync(0)
    expect(store.orders()).toEqual([])
    expect(store.loading()).toBe(false)
  })
})
