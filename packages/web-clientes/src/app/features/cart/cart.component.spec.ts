import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import { Observable, Subject, of, throwError } from 'rxjs'
import { CartComponent } from './cart.component'
import { OrderService } from '../../core/services/order.service'
import { TableService } from '../../core/services/table.service'
import { CartStore, Dish } from '../../core/store/cart.store'
import { TableSessionStore } from '../../core/store/table-session.store'
import { Order } from '../../core/models/order.model'

const dish: Dish = { id: 'd-1', name: 'Paella', description: null, price: 10, category: 'Principal', available: true, restaurantId: 'r-1', ingredients: [] }
const order = { id: 'o-1', restaurantId: 'r-1', tableId: 't-1', clientId: 'c', createdAt: '', items: [] } as Order

describe('CartComponent (envío con mesa y sesión)', () => {
  let fixture: ComponentFixture<CartComponent>
  let cart: CartStore
  let sessions: TableSessionStore
  let orders: { createOrder: ReturnType<typeof vi.fn> }
  let navigate: ReturnType<typeof vi.fn>

  const el = () => fixture.nativeElement as HTMLElement
  const submit = () => el().querySelector<HTMLButtonElement>('[data-testid="confirm-order"]')!
  const fail = (status: number, body: unknown): Observable<never> => throwError(() => ({ status, error: body }))

  beforeEach(() => {
    orders = { createOrder: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: OrderService, useValue: orders },
        { provide: TableService, useValue: { getCurrent: () => of(null) } }
      ]
    })
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>
    cart = TestBed.inject(CartStore)
    sessions = TestBed.inject(TableSessionStore)
    sessions.setOccupation({
      session: { id: 's-1', restaurantId: 'r-1', tableId: 't-1', clientId: 'c', partySize: 3, startedAt: '', endedAt: null },
      table: { id: 't-1', restaurantId: 'r-1', number: 7, description: '', capacity: 4, status: 'ocupada', activeSessionId: 's-1' }
    })
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish, 2)
    fixture = TestBed.createComponent(CartComponent)
    fixture.detectChanges()
  })

  it('muestra la mesa y el grupo de la visita', () => {
    const text = el().querySelector('[data-testid="table-info"]')?.textContent ?? ''
    expect(text).toContain('Mesa 7')
    expect(text).toContain('3 personas')
  })

  it('envía los ids correctos de restaurante, mesa y sesión y navega al pedido', () => {
    orders.createOrder.mockReturnValue(of(order))
    submit().click()

    expect(orders.createOrder).toHaveBeenCalledWith('r-1', 't-1', 's-1', [{ dishId: 'd-1', quantity: 2, notes: null }])
    expect(cart.items()).toEqual([])
    expect(navigate).toHaveBeenCalledWith(['/orders', 'o-1'])
  })

  it('vaciar el carrito tras el pedido no borra la ocupación', () => {
    orders.createOrder.mockReturnValue(of(order))
    submit().click()
    expect(sessions.sessionId()).toBe('s-1')
  })

  it('no envía dos veces con doble clic', () => {
    orders.createOrder.mockReturnValue(new Subject<Order>())
    submit().click()
    submit().click()
    expect(orders.createOrder).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['TableSessionClosedError', 409, 'liberada'],
    ['TableSessionNotFoundError', 404, 'No se encontró'],
    ['TableSessionForbiddenError', 403, 'no es tuya'],
    ['TableSessionRequiredError', 400, 'Necesitas ocupar']
  ])('error de sesión %s: comunica el motivo y vuelve a la selección sin reenviar', (code, status, fragment) => {
    orders.createOrder.mockReturnValue(fail(status, { error: code, message: 'x' }))
    submit().click()

    expect(navigate).toHaveBeenCalledTimes(1)
    const [commands, extras] = navigate.mock.calls[0]
    expect(commands).toEqual(['/restaurants', 'r-1', 'tables'])
    expect(extras.state.notice).toContain(fragment)
    expect(orders.createOrder).toHaveBeenCalledTimes(1)
    expect(cart.sessionId()).toBeNull()
    expect(sessions.occupation()).toBeNull()
  })

  it('reconoce un error de sesión llegado en formato heredado', () => {
    orders.createOrder.mockReturnValue(fail(409, { error: 'The table session is closed' }))
    submit().click()
    expect(navigate.mock.calls[0][0]).toEqual(['/restaurants', 'r-1', 'tables'])
  })

  it('un fallo de red conserva los productos y permite reintentar', () => {
    orders.createOrder.mockReturnValueOnce(fail(0, null))
    submit().click()
    fixture.detectChanges()

    expect(cart.items().length).toBe(1)
    expect(cart.sessionId()).toBe('s-1')
    expect(navigate).not.toHaveBeenCalled()
    expect(el().querySelector('.error-msg')).not.toBeNull()

    orders.createOrder.mockReturnValueOnce(of(order))
    submit().click()
    expect(navigate).toHaveBeenCalledWith(['/orders', 'o-1'])
  })

  it('un error no relacionado con la sesión (formato heredado) no descarta la ocupación', () => {
    orders.createOrder.mockReturnValue(fail(400, { error: 'Restaurant ID is required' }))
    submit().click()
    expect(sessions.sessionId()).toBe('s-1')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('sin sesión vinculada no envía y lleva a la selección de mesa', () => {
    cart.reset()
    cart.addItem(dish)
    fixture.detectChanges()
    submit().click()
    expect(orders.createOrder).not.toHaveBeenCalled()
    expect(navigate.mock.calls[0][0]).toEqual(['/restaurants', 'r-1', 'tables'])
  })
})
