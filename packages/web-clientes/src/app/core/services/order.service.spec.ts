import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { API_URL } from '@resttek/web-shared'
import { OrderService } from './order.service'

describe('OrderService', () => {
  let service: OrderService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: '/api/v1' }]
    })
    service = TestBed.inject(OrderService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => http.verify())

  it('envía restaurante, mesa y sesión con los items y nunca clientId', () => {
    service.createOrder('r-1', 't-1', 's-1', [{ dishId: 'd-1', quantity: 2, notes: null }]).subscribe()

    const req = http.expectOne('/api/v1/orders')
    expect(req.request.method).toBe('POST')
    expect(req.request.body).toEqual({
      restaurantId: 'r-1',
      tableId: 't-1',
      tableSessionId: 's-1',
      items: [{ dishId: 'd-1', quantity: 2, notes: null }]
    })
    expect(Object.keys(req.request.body)).not.toContain('clientId')
    req.flush({ id: 'o-1', restaurantId: 'r-1', tableId: 't-1', clientId: 'c', createdAt: '', items: [] })
  })

  it('tolera pedidos sin los campos nuevos (históricos o respuestas de creación)', () => {
    let order: { tableSessionId?: string | null; tableNumber?: number | null; tableSessionEndedAt?: string | null } | undefined
    service.getOrderById('o-1').subscribe(o => (order = o))
    http.expectOne('/api/v1/orders/o-1').flush({ id: 'o-1', restaurantId: 'r-1', tableId: null, clientId: null, createdAt: '', items: [] })
    expect(order?.tableSessionId ?? null).toBeNull()
    expect(order?.tableNumber ?? null).toBeNull()
    expect(order?.tableSessionEndedAt ?? null).toBeNull()
  })
})
