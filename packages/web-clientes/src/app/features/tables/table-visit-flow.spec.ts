import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router'
import { of } from 'rxjs'
import { TableSelectionPage } from './table-selection.page'
import { TableService } from '../../core/services/table.service'
import { CartStore, Dish } from '../../core/store/cart.store'
import { AvailableTable, TableOccupation } from '../../core/models/table.model'

const exact: AvailableTable = { id: 't-1', number: 1, description: '', capacity: 4 }
const larger: AvailableTable = { id: 't-2', number: 2, description: '', capacity: 8 }
const dish: Dish = { id: 'd-1', name: 'Paella', description: null, price: 10, category: 'Principal', available: true, restaurantId: 'r-1', ingredients: [] }

function occupation(sessionId: string, table: AvailableTable, partySize: number): TableOccupation {
  return {
    session: { id: sessionId, restaurantId: 'r-1', tableId: table.id, clientId: 'c', partySize, startedAt: '', endedAt: null },
    table: { id: table.id, restaurantId: 'r-1', number: table.number, description: '', capacity: table.capacity, status: 'ocupada', activeSessionId: sessionId }
  }
}

describe('Recorrido de selección de mesa y visitas', () => {
  let fixture: ComponentFixture<TableSelectionPage>
  let page: TableSelectionPage
  let service: { getAvailable: ReturnType<typeof vi.fn>; getCurrent: ReturnType<typeof vi.fn>; confirmOccupation: ReturnType<typeof vi.fn> }
  const options = () => (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="table-option"]')

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
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    fixture = TestBed.createComponent(TableSelectionPage)
    page = fixture.componentInstance
    fixture.detectChanges()
  })

  it('capacidad exacta: ofrece la mesa cuyo aforo coincide con el grupo', () => {
    service.getAvailable.mockReturnValue(of([exact]))
    page.onPartyInput('4')
    page.search()
    fixture.detectChanges()
    expect(service.getAvailable).toHaveBeenCalledWith('r-1', 4)
    expect(options().length).toBe(1)
  })

  it('capacidad sobrante: ofrece también mesas mayores que el grupo', () => {
    service.getAvailable.mockReturnValue(of([exact, larger]))
    page.onPartyInput('3')
    page.search()
    fixture.detectChanges()
    expect(options().length).toBe(2)
  })

  it('ausencia de mesas: muestra el estado vacío y no permite continuar', () => {
    service.getAvailable.mockReturnValue(of([]))
    page.onPartyInput('12')
    page.search()
    fixture.detectChanges()
    expect(options().length).toBe(0)
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="confirm"]')?.disabled ?? true).toBe(true)
  })

  it('una segunda visita no hereda el carrito de la primera', () => {
    const cart = TestBed.inject(CartStore)

    service.getAvailable.mockReturnValue(of([exact]))
    service.confirmOccupation.mockReturnValueOnce(of(occupation('s-1', exact, 4)))
    page.onPartyInput('4')
    page.search()
    page.select(exact)
    page.confirm()
    cart.bindSession('r-1', page.sessionStore.sessionId()!)
    cart.addItem(dish, 2)
    expect(cart.items().length).toBe(1)

    // La mesa se libera fuera de este cliente y empieza otra visita.
    service.confirmOccupation.mockReturnValueOnce(of(occupation('s-2', larger, 3)))
    page.onPartyInput('3')
    page.search()
    page.select(larger)
    page.confirm()
    cart.bindSession('r-1', page.sessionStore.sessionId()!)

    expect(page.sessionStore.sessionId()).toBe('s-2')
    expect(cart.sessionId()).toBe('s-2')
    expect(cart.items()).toEqual([])
  })
})
