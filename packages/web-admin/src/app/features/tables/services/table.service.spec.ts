import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { environment } from '../../../../environments/environment'
import type { CreateTableDto, RestaurantTable, UpdateTableDto } from '../models/table.model'
import { TableService } from './table.service'

const base = `${environment.apiUrl}/restaurants/rest-1/tables`

const table: RestaurantTable = {
  id: '7d1f3b4e-0a2c-4c5d-9e11-aaaaaaaaaaa1',
  restaurantId: 'rest-1',
  number: 1,
  description: 'Terraza',
  capacity: 4,
  status: 'libre',
  activeSessionId: null
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

  it('lists the tables of the given restaurant with GET', () => {
    let result: RestaurantTable[] | undefined
    service.getAll('rest-1').subscribe(r => (result = r))

    const req = http.expectOne(base)
    expect(req.request.method).toBe('GET')
    req.flush([table])
    expect(result).toEqual([table])
  })

  it('gets one table by id within the restaurant path', () => {
    service.getById('rest-1', table.id).subscribe()

    const req = http.expectOne(`${base}/${table.id}`)
    expect(req.request.method).toBe('GET')
    req.flush(table)
  })

  it('creates a table sending exactly the DTO', () => {
    const dto: CreateTableDto = { number: 1, description: '', capacity: 4, status: 'reservada' }
    service.create('rest-1', dto).subscribe()

    const req = http.expectOne(base)
    expect(req.request.method).toBe('POST')
    expect(req.request.body).toEqual(dto)
    req.flush({ ...table, ...dto })
  })

  it('replaces a table with PUT sending number, description, capacity and status', () => {
    const dto: UpdateTableDto = { number: 2, description: 'Barra', capacity: 6, status: 'libre' }
    service.update('rest-1', table.id, dto).subscribe()

    const req = http.expectOne(`${base}/${table.id}`)
    expect(req.request.method).toBe('PUT')
    expect(req.request.body).toEqual(dto)
    req.flush({ ...table, ...dto })
  })

  it('deletes a table with DELETE and no body', () => {
    service.delete('rest-1', table.id).subscribe()

    const req = http.expectOne(`${base}/${table.id}`)
    expect(req.request.method).toBe('DELETE')
    req.flush(null, { status: 204, statusText: 'No Content' })
  })

  it('propagates a 409 conflict with the API error body', () => {
    let error: { status: number; error: { error: string; message: string } } | undefined
    service.create('rest-1', { number: 1, description: '', capacity: 2 }).subscribe({
      error: e => (error = e)
    })

    http.expectOne(base).flush(
      { error: 'ConflictError', message: 'Table number already exists' },
      { status: 409, statusText: 'Conflict' }
    )
    expect(error?.status).toBe(409)
    expect(error?.error.error).toBe('ConflictError')
  })
})
