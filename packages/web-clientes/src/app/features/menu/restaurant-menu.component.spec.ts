import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router'
import { Observable, of } from 'rxjs'
import { RestaurantMenuComponent } from './restaurant-menu.component'
import { DishService } from '../../core/services/dish.service'
import { RestaurantService } from '../../core/services/restaurant.service'
import { TableService } from '../../core/services/table.service'
import { TableSessionStore } from '../../core/store/table-session.store'
import { CartStore } from '../../core/store/cart.store'
import { TableOccupation } from '../../core/models/table.model'

describe('RestaurantMenuComponent (ocupación)', () => {
  function setup(sessionId: string, before?: (cart: CartStore) => void, getCurrent?: () => Observable<TableOccupation | null>) {
    const dish = { id: 'd-1', name: 'Paella', description: null, price: 10, category: 'Principal', available: true, restaurantId: 'r-1', ingredients: [] }
    const occupation: TableOccupation = {
      session: { id: sessionId, restaurantId: 'r-1', tableId: 't-5', clientId: 'c', partySize: 4, startedAt: '', endedAt: null },
      table: { id: 't-5', restaurantId: 'r-1', number: 5, description: '', capacity: 6, status: 'ocupada', activeSessionId: sessionId }
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DishService, useValue: { getByRestaurant: () => of([dish]) } },
        { provide: RestaurantService, useValue: { getById: () => of({ id: 'r-1', name: 'Uno' }) } },
        { provide: TableService, useValue: { getCurrent: getCurrent ?? (() => of(occupation)) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r-1' }) } } }
      ]
    })
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true)
    TestBed.inject(TableSessionStore).setOccupation(occupation)
    before?.(TestBed.inject(CartStore))
    const fixture = TestBed.createComponent(RestaurantMenuComponent)
    fixture.detectChanges()
    return { fixture, cart: TestBed.inject(CartStore), dish, navigate, sessions: TestBed.inject(TableSessionStore) }
  }

  it('al volver a la pestaña revalida: si la sesión sigue abierta no cambia nada', () => {
    const { cart, navigate, dish } = setup('s-1')
    cart.addItem(dish)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(navigate).not.toHaveBeenCalled()
    expect(cart.items().length).toBe(1)
  })

  it('al volver con la sesión liberada o la mesa borrada no permite seguir con contexto obsoleto', () => {
    let current: TableOccupation | null = null
    const first = setup('s-1', undefined, () => of(current))
    first.cart.addItem(first.dish)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(first.navigate).toHaveBeenCalledTimes(1)
    const [commands, extras] = first.navigate.mock.calls[0] as unknown as [string[], { state: { notice: string } }]
    expect(commands).toEqual(['/restaurants', 'r-1', 'tables'])
    expect(extras.state.notice).toContain('liberada')
    expect(first.cart.items()).toEqual([])
    expect(first.cart.sessionId()).toBeNull()
    expect(first.sessions.occupation()).toBeNull()
    void current
  })

  it('no añade al carrito si ya no hay ocupación vigente', () => {
    const { fixture, sessions, cart, dish, navigate } = setup('s-1')
    sessions.clear()
    fixture.componentInstance.addToCart(dish)
    expect(cart.items()).toEqual([])
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('muestra el número de mesa y el grupo de la ocupación activa', () => {
    const { fixture } = setup('s-1')
    const text = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="table-info"]')?.textContent ?? ''
    expect(text).toContain('Mesa 5')
    expect(text).toContain('4 personas')
  })

  it('vincula el carrito a restaurante y sesión actuales', () => {
    const { cart } = setup('s-1')
    expect(cart.sessionId()).toBe('s-1')
    expect(cart.restaurantId()).toBe('r-1')
  })

  it('no reutiliza los productos de una visita anterior al abrir la carta en otra sesión', () => {
    const { cart } = setup('s-nueva', previous => {
      previous.bindSession('r-1', 's-vieja')
      previous.addItem({ id: 'x', name: 'Vieja', description: null, price: 1, category: 'p', available: true, restaurantId: 'r-1', ingredients: [] })
    })
    expect(cart.items()).toEqual([])
    expect(cart.sessionId()).toBe('s-nueva')
  })
})
