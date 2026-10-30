import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { API_URL } from '@resttek/web-shared'
import { TableService } from './table.service'
import { TableOccupation } from '../models/table.model'

const occupation: TableOccupation = {
  session: {
    id: 's-1', restaurantId: 'r-1', tableId: 't-1', clientId: 'c-1', partySize: 3,
    startedAt: '2026-10-29T18:00:00.000Z', endedAt: null
  },
  table: {
    id: 't-1', restaurantId: 'r-1', number: 1, description: '', capacity: 4,
    status: 'ocupada', activeSessionId: 's-1'
  }
}

describe('TableService', () => {
  let service: TableService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: '/api/v1' }
      ]
    })
    service = TestBed.inject(TableService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => http.verify())

  it('consulta disponibilidad con GET y partySize, sin cuerpo ni clientId', () => {
    let result: unknown
    service.getAvailable('r-1', 3).subscribe(r => (result = r))

    const req = http.expectOne(r => r.url === '/api/v1/restaurants/r-1/tables/available')
    expect(req.request.method).toBe('GET')
    expect(req.request.params.get('partySize')).toBe('3')
    expect(req.request.params.has('clientId')).toBe(false)
    req.flush([{ id: 't-1', number: 1, description: '', capacity: 4 }])

    expect(result).toEqual([{ id: 't-1', number: 1, description: '', capacity: 4 }])
  })

  it('no hace ninguna petición al listar hasta que se suscribe', () => {
    service.getAvailable('r-1', 2)
    http.expectNone(() => true)
  })

  it('confirma la ocupación con POST solo con tableId y partySize', () => {
    let result: TableOccupation | undefined
    service.confirmOccupation('r-1', 't-1', 3).subscribe(r => (result = r))

    const req = http.expectOne('/api/v1/restaurants/r-1/table-sessions')
    expect(req.request.method).toBe('POST')
    expect(req.request.body).toEqual({ tableId: 't-1', partySize: 3 })
    expect(Object.keys(req.request.body)).not.toContain('clientId')
    req.flush(occupation, { status: 201, statusText: 'Created' })

    expect(result).toEqual(occupation)
  })

  it('acepta 200 en un reintento idempotente', () => {
    let result: TableOccupation | undefined
    service.confirmOccupation('r-1', 't-1', 3).subscribe(r => (result = r))
    http.expectOne('/api/v1/restaurants/r-1/table-sessions').flush(occupation, { status: 200, statusText: 'OK' })
    expect(result).toEqual(occupation)
  })

  it('recupera la ocupación actual con GET current', () => {
    let result: TableOccupation | null | undefined
    service.getCurrent('r-1').subscribe(r => (result = r))
    const req = http.expectOne('/api/v1/restaurants/r-1/table-sessions/current')
    expect(req.request.method).toBe('GET')
    req.flush(occupation)
    expect(result).toEqual(occupation)
  })

  it('trata el literal JSON null de current como ausencia de sesión', () => {
    let result: TableOccupation | null | undefined = undefined
    let emitted = 0
    service.getCurrent('r-1').subscribe(r => { result = r; emitted++ })
    http.expectOne('/api/v1/restaurants/r-1/table-sessions/current').flush('null')
    expect(emitted).toBe(1)
    expect(result).toBeNull()
  })

  it('trata un cuerpo vacío o sin sesión como ausencia de sesión', () => {
    const results: unknown[] = []
    service.getCurrent('r-1').subscribe(r => results.push(r))
    http.expectOne('/api/v1/restaurants/r-1/table-sessions/current').flush({})
    service.getCurrent('r-1').subscribe(r => results.push(r))
    http.expectOne('/api/v1/restaurants/r-1/table-sessions/current').flush(null)
    expect(results).toEqual([null, null])
  })

  it('propaga los 409 de confirmación con su cuerpo, sin transformarlos', () => {
    let error: { status: number; error: unknown } | undefined
    service.confirmOccupation('r-1', 't-1', 3).subscribe({ error: e => (error = e) })
    http.expectOne('/api/v1/restaurants/r-1/table-sessions').flush(
      { error: 'TableNotAvailableError', message: 'Table is not available' },
      { status: 409, statusText: 'Conflict' }
    )
    expect(error?.status).toBe(409)
    expect(error?.error).toEqual({ error: 'TableNotAvailableError', message: 'Table is not available' })
  })
})
