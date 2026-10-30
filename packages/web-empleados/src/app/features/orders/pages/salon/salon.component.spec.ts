import { TestBed, ComponentFixture } from '@angular/core/testing'
import { signal } from '@angular/core'
import { of, throwError } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthStore } from '@resttek/web-shared'
import type { Order } from '../../models/order.model'
import type { Table } from '../../../tables/models/table.model'
import { RestaurantService } from '../../../tables/services/restaurant.service'
import { TableStore } from '../../../tables/store/table.store'
import { OrderStore } from '../../store/order.store'
import { SalonComponent } from './salon.component'

const table = (id: string, number: number, status: Table['status'], activeSessionId: string | null = null, capacity = 4): Table => ({
  id, restaurantId: 'r1', number, description: '', capacity, status, activeSessionId
})

const order = (id: string, status: 'pendiente' | 'listo' | 'entregado', extra: Partial<Order> = {}): Order => ({
  id, restaurantId: 'r1', tableId: 't1', clientId: null, createdAt: '',
  items: [{ id: id + '-i', orderId: id, dishId: 'd', dishName: 'Plato ' + id, quantity: 1, notes: null, status } as any],
  ...extra
})

describe('SalonComponent', () => {
  let fixture: ComponentFixture<SalonComponent>
  let user: ReturnType<typeof signal<any>>
  let role: ReturnType<typeof signal<string | null>>
  let tables: ReturnType<typeof signal<Table[]>>
  let tableStore: any
  let orderStore: any
  let restaurantService: { getAll: ReturnType<typeof vi.fn> }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? ''
  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null
  const qa = (sel: string) => Array.from(fixture.nativeElement.querySelectorAll(sel)) as HTMLElement[]

  function create() {
    fixture = TestBed.createComponent(SalonComponent)
    fixture.detectChanges()
  }

  beforeEach(() => {
    user = signal({ restaurantId: 'r1', role: 'camarero' })
    role = signal('camarero')
    tables = signal<Table[]>([])
    tableStore = {
      tables,
      loading: signal(false),
      error: signal<string | null>(null),
      statusError: signal<string | null>(null),
      updatingIds: signal<ReadonlySet<string>>(new Set()),
      selectedTableId: signal<string | null>(null),
      detailOrders: signal<Order[]>([]),
      detailLoading: signal(false),
      detailError: signal<string | null>(null),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
      reset: vi.fn(),
      clearDetail: vi.fn(),
      selectTable: vi.fn(),
      changeStatus: vi.fn(async () => true)
    }
    orderStore = {
      orders: signal<Order[]>([]),
      loading: signal(false),
      error: signal<string | null>(null),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
      clear: vi.fn(),
      updateItemStatus: vi.fn()
    }
    restaurantService = { getAll: vi.fn(() => of([{ id: 'r1', name: 'Uno' }, { id: 'r2', name: 'Dos' }])) }
    TestBed.configureTestingModule({
      imports: [SalonComponent],
      providers: [
        { provide: AuthStore, useValue: { user, userRole: role } },
        { provide: TableStore, useValue: tableStore },
        { provide: OrderStore, useValue: orderStore },
        { provide: RestaurantService, useValue: restaurantService }
      ]
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    TestBed.resetTestingModule()
  })

  describe('T28 mesas y estados', () => {
    it('arranca el polling de mesas y pedidos del restaurante del JWT y lo para al destruir', () => {
      create()
      expect(tableStore.startPolling).toHaveBeenCalledWith('r1')
      expect(orderStore.startPolling).toHaveBeenCalledWith('r1')
      expect(restaurantService.getAll).not.toHaveBeenCalled()
      fixture.destroy()
      expect(tableStore.stopPolling).toHaveBeenCalled()
      expect(orderStore.stopPolling).toHaveBeenCalled()
    })

    it('muestra todas las mesas con número, capacidad y estado en texto, también ocupada sin pedidos', () => {
      tables.set([table('t1', 1, 'libre'), table('t2', 2, 'ocupada', 's2', 6), table('t3', 3, 'reservada')])
      create()
      const cards = qa('.table-card')
      expect(cards).toHaveLength(3)
      expect(cards[0].textContent).toContain('Mesa 1')
      expect(cards[0].querySelector('.status')?.textContent?.trim()).toBe('libre')
      expect(cards[1].textContent).toContain('Capacidad: 6')
      expect(cards[1].querySelector('.status')?.textContent?.trim()).toBe('ocupada')
      expect(cards[2].querySelector('.status')?.textContent?.trim()).toBe('reservada')
      expect(text()).not.toContain('Este restaurante no tiene mesas')
    })

    it('presenta cargando, error y vacío de forma explícita', () => {
      tableStore.loading.set(true)
      create()
      expect(q('.spinner')).not.toBeNull()
      tableStore.loading.set(false)
      fixture.detectChanges()
      expect(text()).toContain('Este restaurante no tiene mesas')
      tableStore.error.set('Error al cargar las mesas')
      fixture.detectChanges()
      expect(q('.alert-error')?.textContent).toContain('Error al cargar las mesas')
      expect(text()).not.toContain('Este restaurante no tiene mesas')
    })
  })

  describe('T29 cambio de estado', () => {
    beforeEach(() => {
      tables.set([table('t1', 1, 'libre'), table('t2', 2, 'ocupada', 's2')])
    })

    it('ofrece los tres estados por mesa y marca el actual', () => {
      create()
      const buttons = qa('.table-card')[0].querySelectorAll('.table-actions button')
      expect(Array.from(buttons).map(b => b.textContent?.trim())).toEqual(['libre', 'ocupada', 'reservada'])
      expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
      expect(buttons[1].getAttribute('aria-pressed')).toBe('false')
    })

    it('ocupar una mesa libre no pide confirmación', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm')
      create()
      await fixture.componentInstance.changeStatus(tables()[0], 'ocupada')
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(tableStore.changeStatus).toHaveBeenCalledWith(tables()[0], 'ocupada')
    })

    it('cerrar la ocupación pide confirmación y no cambia si se cancela', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      create()
      await fixture.componentInstance.changeStatus(tables()[1], 'libre')
      expect(confirmSpy).toHaveBeenCalledOnce()
      expect(tableStore.changeStatus).not.toHaveBeenCalled()
    })

    it('al confirmar, libera aunque haya pendientes, y los advierte sin cancelarlos', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      tableStore.selectedTableId.set('t2')
      tableStore.detailOrders.set([order('a', 'pendiente'), order('b', 'entregado')])
      create()
      await fixture.componentInstance.changeStatus(tables()[1], 'libre')
      expect(confirmSpy.mock.calls[0][0]).toContain('1 producto(s) sin entregar')
      expect(confirmSpy.mock.calls[0][0]).toContain('no se cancelarán')
      expect(tableStore.changeStatus).toHaveBeenCalledWith(tables()[1], 'libre')
      expect(orderStore.updateItemStatus).not.toHaveBeenCalled()
    })

    it('no hace nada si el estado es el mismo o la mesa se está actualizando', async () => {
      tableStore.updatingIds.set(new Set(['t1']))
      create()
      await fixture.componentInstance.changeStatus(tables()[0], 'libre')
      await fixture.componentInstance.changeStatus(tables()[0], 'reservada')
      expect(tableStore.changeStatus).not.toHaveBeenCalled()
      expect(qa('.table-card')[0].querySelector('.table-actions button')?.hasAttribute('disabled')).toBe(true)
    })

    it('muestra el error del servidor', () => {
      tableStore.statusError.set('Conflicto de ocupación')
      create()
      expect(text()).toContain('Conflicto de ocupación')
    })
  })

  describe('T30 detalle de la visita actual', () => {
    beforeEach(() => {
      tables.set([table('t1', 1, 'libre'), table('t2', 2, 'ocupada', 's2')])
    })

    it('solo ofrece ver pedidos en mesas ocupadas y selecciona la mesa', () => {
      create()
      expect(qa('.table-card')[0].textContent).not.toContain('Ver pedidos de la visita')
      const btn = Array.from(qa('.table-card')[1].querySelectorAll('button')).find(b => b.textContent?.includes('Ver pedidos'))!
      btn.click()
      expect(tableStore.selectTable).toHaveBeenCalledWith(tables()[1])
    })

    it('muestra los pedidos de la visita con todos sus ítems, incluidos entregados', () => {
      tableStore.selectedTableId.set('t2')
      tableStore.detailOrders.set([order('o1', 'pendiente'), order('o2', 'entregado')])
      create()
      const detail = q('.table-detail')!
      expect(detail.textContent).toContain('Pedidos de la mesa 2 (visita actual)')
      expect(detail.querySelectorAll('.order')).toHaveLength(2)
      expect(detail.textContent).toContain('Pedido 1')
      expect(detail.textContent).toContain('Pedido 2')
      expect(detail.textContent).toContain('entregado')
    })

    it('ocupada sin pedidos informa de visita sin pedidos; mesa sin sesión informa que no hay visita', () => {
      tableStore.selectedTableId.set('t2')
      create()
      expect(q('.table-detail')?.textContent).toContain('Esta visita aún no tiene pedidos')
      tableStore.selectedTableId.set('t1')
      fixture.detectChanges()
      expect(q('.table-detail')?.textContent).toContain('no tiene una visita abierta')
    })

    it('muestra el error de detalle y el cargando', () => {
      tableStore.selectedTableId.set('t2')
      tableStore.detailError.set('fallo detalle')
      tableStore.detailLoading.set(true)
      create()
      expect(q('.table-detail .alert-error')?.textContent).toContain('fallo detalle')
      expect(q('.table-detail .spinner')).not.toBeNull()
    })
  })

  describe('T31 entregas', () => {
    it('conserva el panel de entregas: solo ítems listos y entregar llama al store', () => {
      orderStore.orders.set([
        order('o1', 'listo', { tableNumber: 3, tableId: 'uuid' }),
        order('o2', 'pendiente')
      ])
      create()
      const cards = qa('.order-card')
      expect(cards).toHaveLength(1)
      expect(cards[0].textContent).toContain('Mesa 3')
      cards[0].querySelector<HTMLButtonElement>('button')!.click()
      expect(orderStore.updateItemStatus).toHaveBeenCalledWith('o1', 'o1-i', 'entregado')
    })

    it('etiqueta pedidos de visita cerrada y usa tableId en pedidos antiguos', () => {
      orderStore.orders.set([
        order('o1', 'listo', { tableNumber: 4, tableSessionEndedAt: '2026-10-29T10:00:00Z' }),
        order('o2', 'listo', { tableId: '9', tableNumber: null })
      ])
      create()
      const [closed, legacy] = qa('.order-card')
      expect(closed.textContent).toContain('Visita cerrada')
      expect(legacy.textContent).toContain('Mesa 9')
      expect(legacy.textContent).not.toContain('Visita cerrada')
    })
  })

  describe('T32 restaurante de admin', () => {
    beforeEach(() => {
      user.set({ role: 'admin', restaurantId: null })
      role.set('admin')
    })

    it('admin sin restaurante ve selector y no arranca polling hasta elegir', async () => {
      create()
      await fixture.whenStable()
      fixture.detectChanges()
      expect(restaurantService.getAll).toHaveBeenCalled()
      expect(text()).toContain('Selecciona un restaurante')
      expect(tableStore.startPolling).not.toHaveBeenCalled()
      expect(qa('#restaurant-select option').map(o => o.textContent?.trim())).toEqual(['Selecciona un restaurante', 'Uno', 'Dos'])
    })

    it('elegir restaurante inicia el polling de ese restaurante; volver a vacío lo limpia', () => {
      create()
      fixture.componentInstance.selectRestaurant('r2')
      expect(tableStore.startPolling).toHaveBeenCalledWith('r2')
      expect(orderStore.startPolling).toHaveBeenCalledWith('r2')
      fixture.componentInstance.selectRestaurant('r1')
      expect(tableStore.startPolling).toHaveBeenLastCalledWith('r1')
      fixture.componentInstance.selectRestaurant('')
      expect(tableStore.stopPolling).toHaveBeenCalled()
      expect(tableStore.reset).toHaveBeenCalled()
      expect(orderStore.clear).toHaveBeenCalled()
    })

    it('muestra el error al cargar restaurantes', async () => {
      restaurantService.getAll.mockReturnValue(throwError(() => ({ error: { message: 'sin acceso' } })))
      create()
      await fixture.whenStable()
      fixture.detectChanges()
      expect(text()).toContain('sin acceso')
    })

    it('camarero/manager no ven selector ni pueden cambiar de restaurante', () => {
      user.set({ role: 'manager', restaurantId: 'r1' })
      role.set('manager')
      create()
      expect(q('#restaurant-select')).toBeNull()
      fixture.componentInstance.selectRestaurant('r2')
      expect(tableStore.startPolling).toHaveBeenCalledTimes(1)
      expect(tableStore.startPolling).not.toHaveBeenCalledWith('r2')
    })
  })
})
