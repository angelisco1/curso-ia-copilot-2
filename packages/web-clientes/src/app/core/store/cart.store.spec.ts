import { TestBed } from '@angular/core/testing'
import { AuthStore } from '@resttek/web-shared'
import { CartStore, Dish } from './cart.store'

function dish(id: string, restaurantId = 'r-1', price = 10): Dish {
  return { id, name: `Plato ${id}`, description: null, price, category: 'Principal', available: true, restaurantId, ingredients: [] }
}

describe('CartStore', () => {
  let cart: CartStore

  beforeEach(() => {
    TestBed.configureTestingModule({})
    cart = TestBed.inject(CartStore)
  })

  it('suma totales y unidades', () => {
    cart.addItem(dish('a', 'r-1', 5), 2)
    cart.addItem(dish('b', 'r-1', 3), 1)
    expect(cart.total()).toBe(13)
    expect(cart.itemCount()).toBe(3)
  })

  it('vincula el carrito al restaurante y a la sesión de ocupación', () => {
    cart.bindSession('r-1', 's-1')
    expect(cart.restaurantId()).toBe('r-1')
    expect(cart.sessionId()).toBe('s-1')
  })

  it('conserva los productos si se vincula a la misma sesión', () => {
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a'))
    cart.bindSession('r-1', 's-1')
    expect(cart.items().length).toBe(1)
  })

  it('una visita nueva en el mismo restaurante no reutiliza los productos de la anterior', () => {
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a'))
    cart.bindSession('r-1', 's-2')
    expect(cart.items()).toEqual([])
    expect(cart.sessionId()).toBe('s-2')
  })

  it('cambiar de restaurante vacía el carrito', () => {
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a'))
    cart.bindSession('r-2', 's-9')
    expect(cart.items()).toEqual([])
    expect(cart.restaurantId()).toBe('r-2')
  })

  it('añadir un plato de otro restaurante sigue vaciando el carrito', () => {
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a', 'r-1'))
    cart.addItem(dish('z', 'r-2'))
    expect(cart.items().map(i => i.dish.id)).toEqual(['z'])
  })

  it('vaciar el carrito (p. ej. tras enviar el pedido) conserva la vinculación a la visita', () => {
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a'))
    cart.clear()
    expect(cart.items()).toEqual([])
    expect(cart.sessionId()).toBe('s-1')
    expect(cart.restaurantId()).toBe('r-1')
  })

  it('eliminar el último producto no pierde la vinculación', () => {
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a'))
    cart.removeItem('a')
    expect(cart.sessionId()).toBe('s-1')
  })

  it('reset descarta productos y vinculación (sesión obsoleta)', () => {
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a'))
    cart.reset()
    expect(cart.items()).toEqual([])
    expect(cart.sessionId()).toBeNull()
    expect(cart.restaurantId()).toBeNull()
  })
})

describe('CartStore y usuario autenticado', () => {
  beforeEach(() => {
    localStorage.clear()
    TestBed.configureTestingModule({})
  })

  it('al cerrar sesión o entrar otro usuario no hereda productos ni sesión', () => {
    const auth = TestBed.inject(AuthStore)
    auth.setSession('t1', { id: 'c-1', role: 'cliente' })
    const cart = TestBed.inject(CartStore)
    TestBed.tick()
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a'))

    auth.clearSession()
    TestBed.tick()
    expect(cart.items()).toEqual([])
    expect(cart.sessionId()).toBeNull()

    auth.setSession('t2', { id: 'c-2', role: 'cliente' })
    TestBed.tick()
    cart.bindSession('r-1', 's-2')
    cart.addItem(dish('b'))
    auth.setSession('t3', { id: 'c-3', role: 'cliente' })
    TestBed.tick()
    expect(cart.items()).toEqual([])
  })

  it('no vacía el carrito mientras sea el mismo usuario', () => {
    const auth = TestBed.inject(AuthStore)
    auth.setSession('t1', { id: 'c-1', role: 'cliente' })
    const cart = TestBed.inject(CartStore)
    TestBed.tick()
    cart.bindSession('r-1', 's-1')
    cart.addItem(dish('a'))
    TestBed.tick()
    expect(cart.items().length).toBe(1)
  })
})
