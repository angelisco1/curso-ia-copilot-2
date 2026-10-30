import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Order } from '../../orders/models/order.model'
import type { Table } from '../models/table.model'
import { TableService } from './table.service'

const table: Table = {
  id: 't-1',
  restaurantId: 'rest 1',
  number: 1,
  description: '',
  capacity: 4,
  status: 'ocupada',
  activeSessionId: 's-1'
}

describe('TableService', () => {
  let service: TableService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    service = TestBed.inject(TableService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
    TestBed.resetTestingModule()
  })

  it('lista las mesas del restaurante', () => {
    let result: Table[] | undefined
    service.getTables('rest 1').subscribe(r => (result = r))
    const req = http.expectOne('/api/v1/restaurants/rest%201/tables')
    expect(req.request.method).toBe('GET')
    req.flush([table])
    expect(result).toEqual([table])
  })

  it('cambia el estado con PATCH y cuerpo {status}', () => {
    let result: Table | undefined
    service.updateStatus('rest 1', 't-1', { status: 'libre' }).subscribe(r => (result = r))
    const req = http.expectOne('/api/v1/restaurants/rest%201/tables/t-1/status')
    expect(req.request.method).toBe('PATCH')
    expect(req.request.body).toEqual({ status: 'libre' })
    req.flush({ ...table, status: 'libre', activeSessionId: null })
    expect(result?.status).toBe('libre')
  })

  it('consulta los pedidos de la visita actual de la mesa', () => {
    const order = {
      id: 'o-1', restaurantId: 'rest 1', tableId: 't-1', clientId: 'c', createdAt: '', items: [],
      tableSessionId: 's-1', tableNumber: 1, tableSessionEndedAt: null
    } as Order
    let result: Order[] | undefined
    service.getCurrentOrders('rest 1', 't-1').subscribe(r => (result = r))
    const req = http.expectOne('/api/v1/restaurants/rest%201/tables/t-1/orders')
    expect(req.request.method).toBe('GET')
    req.flush([order])
    expect(result).toEqual([order])
  })

  it('acepta pedidos históricos sin campos de sesión', () => {
    const legacy: Order = { id: 'o-0', restaurantId: 'r', tableId: '5', clientId: null, createdAt: '', items: [] }
    expect(legacy.tableSessionId).toBeUndefined()
  })
})
