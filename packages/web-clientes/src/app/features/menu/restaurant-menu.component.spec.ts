import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router'
import { of } from 'rxjs'
import { RestaurantMenuComponent } from './restaurant-menu.component'
import { DishService } from '../../core/services/dish.service'
import { RestaurantService } from '../../core/services/restaurant.service'
import { TableService } from '../../core/services/table.service'
import { TableSessionStore } from '../../core/store/table-session.store'
import { CartStore } from '../../core/store/cart.store'

describe('RestaurantMenuComponent (ocupación)', () => {
  function setup(sessionId: string, before?: (cart: CartStore) => void) {
    const dish = { id: 'd-1', name: 'Paella', description: null, price: 10, category: 'Principal', available: true, restaurantId: 'r-1', ingredients: [] }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: DishService, useValue: { getByRestaurant: () => of([dish]) } },
        { provide: RestaurantService, useValue: { getById: () => of({ id: 'r-1', name: 'Uno' }) } },
        { provide: TableService, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'r-1' }) } } }
      ]
    })
    TestBed.inject(TableSessionStore).setOccupation({
      session: { id: sessionId, restaurantId: 'r-1', tableId: 't-5', clientId: 'c', partySize: 4, startedAt: '', endedAt: null },
      table: { id: 't-5', restaurantId: 'r-1', number: 5, description: '', capacity: 6, status: 'ocupada', activeSessionId: sessionId }
    })
    before?.(TestBed.inject(CartStore))
    const fixture = TestBed.createComponent(RestaurantMenuComponent)
    fixture.detectChanges()
    return { fixture, cart: TestBed.inject(CartStore), dish }
  }

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
