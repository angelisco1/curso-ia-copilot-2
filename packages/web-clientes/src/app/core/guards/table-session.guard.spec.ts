import { TestBed } from '@angular/core/testing'
import { ActivatedRouteSnapshot, Router, UrlTree, convertToParamMap, provideRouter } from '@angular/router'
import { Observable, of, throwError } from 'rxjs'
import { AuthStore } from '@resttek/web-shared'
import { tableSessionGuard } from './table-session.guard'
import { TableService } from '../services/table.service'
import { TableOccupation } from '../models/table.model'

const occupation: TableOccupation = {
  session: { id: 's-1', restaurantId: 'r-1', tableId: 't-1', clientId: 'c-1', partySize: 2, startedAt: '2026-10-29T18:00:00.000Z', endedAt: null },
  table: { id: 't-1', restaurantId: 'r-1', number: 1, description: '', capacity: 4, status: 'ocupada', activeSessionId: 's-1' }
}

describe('tableSessionGuard', () => {
  let service: { getCurrent: ReturnType<typeof vi.fn> }
  let router: Router

  const run = (id = 'r-1') => {
    const route = { paramMap: convertToParamMap({ id }) } as ActivatedRouteSnapshot
    return TestBed.runInInjectionContext(() => tableSessionGuard(route, {} as never)) as Observable<boolean | UrlTree>
  }
  const result = (obs: Observable<boolean | UrlTree>) => {
    let value: boolean | UrlTree | undefined
    obs.subscribe(v => (value = v))
    return value
  }

  beforeEach(() => {
    localStorage.clear()
    service = { getCurrent: vi.fn() }
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TableService, useValue: service }]
    })
    TestBed.inject(AuthStore).setSession('tok', { id: 'c-1', role: 'cliente' })
    router = TestBed.inject(Router)
  })

  it('permite la carta cuando el servidor devuelve una ocupación propia', () => {
    service.getCurrent.mockReturnValue(of(occupation))
    expect(result(run())).toBe(true)
    expect(service.getCurrent).toHaveBeenCalledWith('r-1')
  })

  it('redirige al paso de mesas cuando no hay ocupación (null)', () => {
    service.getCurrent.mockReturnValue(of(null))
    const value = result(run()) as UrlTree
    expect(router.serializeUrl(value)).toBe('/restaurants/r-1/tables')
  })

  it('redirige al paso de mesas si no se puede comprobar la ocupación', () => {
    service.getCurrent.mockReturnValue(throwError(() => ({ status: 500, error: null })))
    const value = result(run('r-2')) as UrlTree
    expect(router.serializeUrl(value)).toBe('/restaurants/r-2/tables')
  })

  it('consulta siempre al servidor y no confía en una ocupación local previa', () => {
    service.getCurrent.mockReturnValueOnce(of(occupation)).mockReturnValueOnce(of(null))
    expect(result(run())).toBe(true)
    const second = result(run()) as UrlTree
    expect(service.getCurrent).toHaveBeenCalledTimes(2)
    expect(router.serializeUrl(second)).toBe('/restaurants/r-1/tables')
  })
})
