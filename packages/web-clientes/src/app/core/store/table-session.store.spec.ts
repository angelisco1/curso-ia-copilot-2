import { TestBed } from '@angular/core/testing'
import { Subject, of, throwError } from 'rxjs'
import { AuthStore } from '@resttek/web-shared'
import { TableSessionStore } from './table-session.store'
import { TableService } from '../services/table.service'
import { TableOccupation } from '../models/table.model'

function occ(restaurantId: string, sessionId = `s-${restaurantId}`, tableNumber = 1): TableOccupation {
  return {
    session: {
      id: sessionId, restaurantId, tableId: `t-${restaurantId}`, clientId: 'c-1', partySize: 3,
      startedAt: '2026-10-29T18:00:00.000Z', endedAt: null
    },
    table: {
      id: `t-${restaurantId}`, restaurantId, number: tableNumber, description: '', capacity: 4,
      status: 'ocupada', activeSessionId: sessionId
    }
  }
}

describe('TableSessionStore', () => {
  let store: TableSessionStore
  let auth: AuthStore
  let service: { getCurrent: ReturnType<typeof vi.fn>; confirmOccupation: ReturnType<typeof vi.fn>; getAvailable: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    localStorage.clear()
    service = { getCurrent: vi.fn(), confirmOccupation: vi.fn(), getAvailable: vi.fn() }
    TestBed.configureTestingModule({ providers: [{ provide: TableService, useValue: service }] })
    auth = TestBed.inject(AuthStore)
    auth.setSession('tok', { id: 'c-1', role: 'cliente' })
    store = TestBed.inject(TableSessionStore)
  })

  it('arranca sin ocupación ni error', () => {
    expect(store.occupation()).toBeNull()
    expect(store.loading()).toBe(false)
    expect(store.error()).toBeNull()
  })

  it('recupera la ocupación desde el servidor y expone sesión, mesa y grupo', () => {
    service.getCurrent.mockReturnValue(of(occ('r-1', 's-1', 7)))
    let emitted: TableOccupation | null | undefined
    store.load('r-1').subscribe(o => (emitted = o))

    expect(service.getCurrent).toHaveBeenCalledWith('r-1')
    expect(emitted?.session.id).toBe('s-1')
    expect(store.sessionId()).toBe('s-1')
    expect(store.table()?.number).toBe(7)
    expect(store.partySize()).toBe(3)
    expect(store.loading()).toBe(false)
    expect(store.occupationFor('r-1')?.session.id).toBe('s-1')
    expect(store.occupationFor('r-2')).toBeNull()
  })

  it('si el servidor responde null no queda ninguna ocupación', () => {
    service.getCurrent.mockReturnValueOnce(of(occ('r-1')))
    store.load('r-1').subscribe()
    service.getCurrent.mockReturnValueOnce(of(null))
    store.load('r-1').subscribe()
    expect(store.occupation()).toBeNull()
  })

  it('marca la carga mientras la petición está en curso', () => {
    const subject = new Subject<TableOccupation | null>()
    service.getCurrent.mockReturnValue(subject)
    store.load('r-1').subscribe()
    expect(store.loading()).toBe(true)
    subject.next(null)
    subject.complete()
    expect(store.loading()).toBe(false)
  })

  it('un error deja el mensaje, descarta la ocupación local y se propaga', () => {
    service.getCurrent.mockReturnValueOnce(of(occ('r-1')))
    store.load('r-1').subscribe()

    service.getCurrent.mockReturnValueOnce(throwError(() => ({ status: 500, error: { error: 'InternalServerError', message: 'Something went wrong' } })))
    let failed = false
    store.load('r-1').subscribe({ error: () => (failed = true) })

    expect(failed).toBe(true)
    expect(store.error()).toBeTruthy()
    expect(store.occupation()).toBeNull()
    expect(store.loading()).toBe(false)
  })

  it('cambiar de restaurante descarta al instante la ocupación del anterior', () => {
    service.getCurrent.mockReturnValueOnce(of(occ('A')))
    store.load('A').subscribe()
    const pendingB = new Subject<TableOccupation | null>()
    service.getCurrent.mockReturnValueOnce(pendingB)
    store.load('B').subscribe()
    expect(store.occupation()).toBeNull()
    expect(store.occupationFor('A')).toBeNull()
  })

  it('no mezcla respuestas tardías de A cuando ya se pidió B', () => {
    const a = new Subject<TableOccupation | null>()
    const b = new Subject<TableOccupation | null>()
    service.getCurrent.mockReturnValueOnce(a).mockReturnValueOnce(b)
    store.load('A').subscribe()
    store.load('B').subscribe()

    b.next(occ('B'))
    b.complete()
    a.next(occ('A'))
    a.complete()

    expect(store.occupation()?.session.restaurantId).toBe('B')
    expect(store.loading()).toBe(false)
  })

  it('un error tardío de A tampoco pisa a B', () => {
    const a = new Subject<TableOccupation | null>()
    service.getCurrent.mockReturnValueOnce(a).mockReturnValueOnce(of(occ('B')))
    store.load('A').subscribe({ error: () => {} })
    store.load('B').subscribe()
    a.error({ status: 500, error: null })
    expect(store.occupation()?.session.restaurantId).toBe('B')
    expect(store.error()).toBeNull()
  })

  it('setOccupation guarda la ocupación confirmada y clear solo limpia el estado local', () => {
    store.setOccupation(occ('r-1'))
    expect(store.occupationFor('r-1')).not.toBeNull()
    store.clear()
    expect(store.occupation()).toBeNull()
    expect(service.confirmOccupation).not.toHaveBeenCalled()
  })

  it('salir o cambiar de restaurante solo consulta: no existe ni se llama a ninguna liberación', () => {
    service.getCurrent.mockReturnValue(of(occ('A')))
    store.load('A').subscribe()
    store.load('B').subscribe()
    store.clear()
    expect(service.confirmOccupation).not.toHaveBeenCalled()
    expect(Object.keys(store).some(k => /release|libera/i.test(k))).toBe(false)
    expect((store as unknown as Record<string, unknown>)['release']).toBeUndefined()
  })

  it('no persiste la ocupación en el almacenamiento local', () => {
    store.setOccupation(occ('r-1'))
    const dump = JSON.stringify({ ...localStorage })
    expect(dump).not.toContain('s-r-1')
  })

  it('otro usuario tras logout no hereda la ocupación', () => {
    store.setOccupation(occ('r-1'))
    auth.clearSession()
    expect(store.occupation()).toBeNull()
    auth.setSession('tok2', { id: 'c-2', role: 'cliente' })
    expect(store.occupation()).toBeNull()
    expect(store.occupationFor('r-1')).toBeNull()
  })

  it('dos recargas simultáneas de un mismo restaurante usan la última', () => {
    const first = new Subject<TableOccupation | null>()
    service.getCurrent.mockReturnValueOnce(first).mockReturnValueOnce(of(null))
    store.load('r-1').subscribe()
    store.load('r-1').subscribe()
    first.next(occ('r-1'))
    expect(store.occupation()).toBeNull()
  })

  describe('revalidate', () => {
    it('devuelve valid si el servidor confirma la misma sesión', () => {
      service.getCurrent.mockReturnValue(of(occ('r-1', 's-1')))
      let result: string | undefined
      store.revalidate('r-1', 's-1').subscribe(r => (result = r))
      expect(result).toBe('valid')
    })

    it('devuelve closed si el servidor responde null (liberada o mesa borrada)', () => {
      service.getCurrent.mockReturnValue(of(null))
      let result: string | undefined
      store.revalidate('r-1', 's-1').subscribe(r => (result = r))
      expect(result).toBe('closed')
      expect(store.occupation()).toBeNull()
    })

    it('devuelve closed si ahora hay otra sesión distinta', () => {
      service.getCurrent.mockReturnValue(of(occ('r-1', 's-2')))
      let result: string | undefined
      store.revalidate('r-1', 's-1').subscribe(r => (result = r))
      expect(result).toBe('closed')
    })

    it('devuelve unknown ante un error de red sin lanzar', () => {
      service.getCurrent.mockReturnValue(throwError(() => ({ status: 0, error: null })))
      let result: string | undefined
      store.revalidate('r-1', 's-1').subscribe(r => (result = r))
      expect(result).toBe('unknown')
    })
  })
})
