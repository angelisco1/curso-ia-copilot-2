import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router'
import { Subject, of, throwError } from 'rxjs'
import { TableSelectionPage } from './table-selection.page'
import { TableService } from '../../core/services/table.service'
import { AvailableTable, TableOccupation } from '../../core/models/table.model'

const t1: AvailableTable = { id: 't-1', number: 1, description: 'Terraza', capacity: 4 }
const t2: AvailableTable = { id: 't-2', number: 2, description: '', capacity: 6 }

describe('TableSelectionPage (selección)', () => {
  let fixture: ComponentFixture<TableSelectionPage>
  let page: TableSelectionPage
  let service: { getAvailable: ReturnType<typeof vi.fn>; getCurrent: ReturnType<typeof vi.fn>; confirmOccupation: ReturnType<typeof vi.fn> }

  const el = () => fixture.nativeElement as HTMLElement
  const typeParty = (value: string) => {
    const input = el().querySelector<HTMLInputElement>('input[name="partySize"]')!
    input.value = value
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
  }
  const searchButton = () => el().querySelector<HTMLButtonElement>('[data-testid="search"]')!

  beforeEach(() => {
    service = {
      getAvailable: vi.fn(),
      getCurrent: vi.fn().mockReturnValue(of(null)),
      confirmOccupation: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TableService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r-1' }) } } }
      ]
    })
    fixture = TestBed.createComponent(TableSelectionPage)
    page = fixture.componentInstance
    fixture.detectChanges()
  })

  it('al abrir recupera desde el servidor la ocupación del restaurante', () => {
    expect(service.getCurrent).toHaveBeenCalledWith('r-1')
  })

  it.each(['', '0', '-1', '2.5', 'abc', '1e2'])('rechaza el grupo %j sin llamar a la API', value => {
    typeParty(value)
    expect(searchButton().disabled).toBe(true)
    page.search()
    expect(service.getAvailable).not.toHaveBeenCalled()
  })

  it('avisa de un grupo no válido pero no de un campo vacío', () => {
    typeParty('0')
    expect(el().querySelector('[data-testid="party-error"]')).not.toBeNull()
    typeParty('')
    expect(el().querySelector('[data-testid="party-error"]')).toBeNull()
  })

  it('con un grupo válido lista las mesas elegibles', () => {
    service.getAvailable.mockReturnValue(of([t1, t2]))
    typeParty('4')
    searchButton().click()
    fixture.detectChanges()

    expect(service.getAvailable).toHaveBeenCalledWith('r-1', 4)
    expect(el().querySelectorAll('[data-testid="table-option"]').length).toBe(2)
    expect(el().textContent).toContain('Mesa 1')
    expect(el().textContent).toContain('6')
  })

  it('muestra carga mientras consulta', () => {
    service.getAvailable.mockReturnValue(new Subject<AvailableTable[]>())
    typeParty('2')
    searchButton().click()
    fixture.detectChanges()
    expect(el().querySelector('[data-testid="loading"]')).not.toBeNull()
  })

  it('muestra un estado vacío sin mesas elegibles', () => {
    service.getAvailable.mockReturnValue(of([]))
    typeParty('8')
    searchButton().click()
    fixture.detectChanges()
    expect(el().querySelector('[data-testid="empty"]')).not.toBeNull()
    expect(el().querySelectorAll('[data-testid="table-option"]').length).toBe(0)
  })

  it('muestra el error de carga y permite reintentar', () => {
    service.getAvailable.mockReturnValueOnce(throwError(() => ({ status: 500, error: { error: 'InternalServerError', message: 'Something went wrong' } })))
    typeParty('2')
    searchButton().click()
    fixture.detectChanges()
    expect(el().querySelector('[data-testid="search-error"]')).not.toBeNull()

    service.getAvailable.mockReturnValueOnce(of([t1]))
    searchButton().click()
    fixture.detectChanges()
    expect(el().querySelector('[data-testid="search-error"]')).toBeNull()
    expect(el().querySelectorAll('[data-testid="table-option"]').length).toBe(1)
  })

  it('seleccionar una mesa solo la marca y no llama a la API de ocupación', () => {
    service.getAvailable.mockReturnValue(of([t1, t2]))
    typeParty('2')
    searchButton().click()
    fixture.detectChanges()

    el().querySelectorAll<HTMLButtonElement>('[data-testid="table-option"]')[1].click()
    fixture.detectChanges()

    expect(page.selectedTableId()).toBe('t-2')
    expect(el().querySelectorAll('[data-testid="table-option"]')[1].getAttribute('aria-pressed')).toBe('true')
    expect(service.confirmOccupation).not.toHaveBeenCalled()
  })

  it('cambiar el grupo invalida la lista y la selección anteriores', () => {
    service.getAvailable.mockReturnValue(of([t1, t2]))
    typeParty('2')
    searchButton().click()
    fixture.detectChanges()
    page.select(t1)

    typeParty('5')
    expect(page.selectedTableId()).toBeNull()
    expect(page.tables()).toBeNull()
    expect(el().querySelectorAll('[data-testid="table-option"]').length).toBe(0)
  })

  it('descarta la respuesta tardía de un grupo anterior', () => {
    const slow = new Subject<AvailableTable[]>()
    service.getAvailable.mockReturnValueOnce(slow).mockReturnValueOnce(of([t2]))
    typeParty('2')
    searchButton().click()
    typeParty('6')
    searchButton().click()
    fixture.detectChanges()

    slow.next([t1])
    fixture.detectChanges()

    expect(page.tables()).toEqual([t2])
    expect(page.searching()).toBe(false)
  })

  it('descarta la respuesta tardía si el grupo cambió sin volver a buscar', () => {
    const slow = new Subject<AvailableTable[]>()
    service.getAvailable.mockReturnValueOnce(slow)
    typeParty('2')
    searchButton().click()
    typeParty('3')
    slow.next([t1])
    expect(page.tables()).toBeNull()
    expect(page.searching()).toBe(false)
  })
})

describe('TableSelectionPage (confirmación)', () => {
  let fixture: ComponentFixture<TableSelectionPage>
  let page: TableSelectionPage
  let router: Router
  let navigate: ReturnType<typeof vi.fn>
  let service: { getAvailable: ReturnType<typeof vi.fn>; getCurrent: ReturnType<typeof vi.fn>; confirmOccupation: ReturnType<typeof vi.fn> }

  const el = () => fixture.nativeElement as HTMLElement
  const confirmButton = () => el().querySelector<HTMLButtonElement>('[data-testid="confirm"]')
  const occupation = (tableId = 't-1'): TableOccupation => ({
    session: { id: 's-1', restaurantId: 'r-1', tableId, clientId: 'c-1', partySize: 4, startedAt: '2026-10-29T18:00:00.000Z', endedAt: null },
    table: { id: tableId, restaurantId: 'r-1', number: 1, description: '', capacity: 4, status: 'ocupada', activeSessionId: 's-1' }
  })
  const conflict = (error: string, message: string) => ({ status: 409, error: { error, message } })

  function chooseTable(): void {
    page.onPartyInput('4')
    page.search()
    page.select(t1)
    fixture.detectChanges()
  }

  beforeEach(() => {
    service = {
      getAvailable: vi.fn().mockReturnValue(of([t1, t2])),
      getCurrent: vi.fn().mockReturnValue(of(null)),
      confirmOccupation: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: TableService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r-1' }) } } }
      ]
    })
    router = TestBed.inject(Router)
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>
    fixture = TestBed.createComponent(TableSelectionPage)
    page = fixture.componentInstance
    fixture.detectChanges()
  })

  it('continuar está bloqueado sin selección y no llama a la API', () => {
    page.onPartyInput('4')
    page.search()
    fixture.detectChanges()
    expect(confirmButton()!.disabled).toBe(true)
    page.confirm()
    expect(service.confirmOccupation).not.toHaveBeenCalled()
  })

  it('con 201 guarda la sesión y navega a la carta', () => {
    service.confirmOccupation.mockReturnValue(of(occupation()))
    chooseTable()
    confirmButton()!.click()
    fixture.detectChanges()

    expect(service.confirmOccupation).toHaveBeenCalledWith('r-1', 't-1', 4)
    expect(page.sessionStore.sessionId()).toBe('s-1')
    expect(navigate).toHaveBeenCalledWith(['/restaurants', 'r-1'])
  })

  it('una petición mientras guarda: el doble clic no duplica la llamada', () => {
    const pending = new Subject<TableOccupation>()
    service.confirmOccupation.mockReturnValue(pending)
    chooseTable()
    page.confirm()
    page.confirm()
    fixture.detectChanges()

    expect(service.confirmOccupation).toHaveBeenCalledTimes(1)
    expect(confirmButton()!.disabled).toBe(true)
    pending.next(occupation())
    pending.complete()
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('un 409 por mesa no disponible avisa, no navega y refresca la lista sin elegir otra mesa', () => {
    service.confirmOccupation.mockReturnValue(throwError(() => conflict('TableNotAvailableError', 'Table is not available')))
    chooseTable()
    service.getAvailable.mockClear()
    service.getAvailable.mockReturnValue(of([t2]))
    page.confirm()
    fixture.detectChanges()

    expect(navigate).not.toHaveBeenCalled()
    expect(el().querySelector('[data-testid="action-error"]')?.textContent).toContain('ya no está disponible')
    expect(service.getCurrent).toHaveBeenCalledTimes(2)
    expect(service.getAvailable).toHaveBeenCalledWith('r-1', 4)
    expect(page.tables()).toEqual([t2])
    expect(page.selectedTableId()).toBeNull()
    expect(page.saving()).toBe(false)
  })

  it('un 409 por sesión activa recupera la existente y la ofrece sin navegar ni ocupar de nuevo', () => {
    service.confirmOccupation.mockReturnValue(throwError(() => conflict('ActiveTableSessionExistsError', 'Client already has an active table session in this restaurant')))
    chooseTable()
    service.getCurrent.mockReturnValue(of(occupation('t-9')))
    page.confirm()
    fixture.detectChanges()

    expect(navigate).not.toHaveBeenCalled()
    expect(page.existing()?.session.tableId).toBe('t-9')
    expect(el().querySelector('[data-testid="continue-existing"]')).not.toBeNull()
    expect(service.confirmOccupation).toHaveBeenCalledTimes(1)
  })

  it('un 409 en formato heredado también se trata como conflicto', () => {
    service.confirmOccupation.mockReturnValue(throwError(() => ({ status: 409, error: { error: 'Table is not available' } })))
    chooseTable()
    page.confirm()
    fixture.detectChanges()
    expect(el().querySelector('[data-testid="action-error"]')?.textContent).toContain('ya no está disponible')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('un fallo de red conserva la selección para reintentar', () => {
    service.confirmOccupation.mockReturnValueOnce(throwError(() => ({ status: 0, error: null })))
    chooseTable()
    page.confirm()
    fixture.detectChanges()

    expect(el().querySelector('[data-testid="action-error"]')).not.toBeNull()
    expect(page.selectedTableId()).toBe('t-1')
    expect(navigate).not.toHaveBeenCalled()

    service.confirmOccupation.mockReturnValueOnce(of(occupation()))
    page.confirm()
    expect(navigate).toHaveBeenCalledWith(['/restaurants', 'r-1'])
  })
})
