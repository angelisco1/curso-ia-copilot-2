import { importProvidersFrom, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { Edit, LucideAngularModule, Plus, Trash2, Utensils } from 'lucide-angular'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestaurantTable } from '../../models/table.model'
import { TableStore } from '../../store/table.store'
import { TableListPage } from './table-list.page'

const table = (id: string, number: number, status: RestaurantTable['status'], extra: Partial<RestaurantTable> = {}): RestaurantTable => ({
  id,
  restaurantId: 'rest-1',
  number,
  description: `Mesa ${number}`,
  capacity: 4,
  status,
  activeSessionId: null,
  ...extra
})

describe('TableListPage', () => {
  const tables = signal<RestaurantTable[]>([])
  const loading = signal(false)
  const error = signal<string | null>(null)
  let loadByRestaurant: ReturnType<typeof vi.fn>
  let deleteTable: ReturnType<typeof vi.fn>
  let confirmSpy: ReturnType<typeof vi.fn>
  let harness: RouterTestingHarness

  const text = () => (harness.routeNativeElement as HTMLElement).textContent ?? ''
  const query = <T extends Element>(selector: string) => (harness.routeNativeElement as HTMLElement).querySelector<T>(selector)
  const queryAll = <T extends Element>(selector: string) => Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll<T>(selector))

  beforeEach(async () => {
    tables.set([])
    loading.set(false)
    error.set(null)
    loadByRestaurant = vi.fn()
    deleteTable = vi.fn().mockResolvedValue(undefined)
    confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'restaurants/:restaurantId',
            children: [{ path: 'tables', children: [{ path: '', component: TableListPage }] }]
          }
        ]),
        importProvidersFrom(LucideAngularModule.pick({ Plus, Edit, Trash2, Utensils })),
        { provide: TableStore, useValue: { tables, loading, error, loadByRestaurant, delete: deleteTable } }
      ]
    })
    harness = await RouterTestingHarness.create()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    TestBed.resetTestingModule()
  })

  it('loads the tables of the restaurant in the route', async () => {
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    expect(loadByRestaurant).toHaveBeenCalledTimes(1)
    expect(loadByRestaurant).toHaveBeenCalledWith('rest-1')
  })

  it('shows a column per field and one row per table with its status', async () => {
    tables.set([table('t1', 1, 'libre'), table('t2', 2, 'ocupada', { capacity: 6 }), table('t3', 3, 'reservada', { description: '' })])
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    const headers = queryAll('thead th').map(th => th.textContent?.trim())
    expect(headers).toEqual(expect.arrayContaining(['Número', 'Descripción', 'Capacidad', 'Estado']))

    const rows = queryAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[1].textContent).toContain('2')
    expect(rows[1].textContent).toContain('Mesa 2')
    expect(rows[1].textContent).toContain('6')
    expect(rows[0].textContent).toContain('Libre')
    expect(rows[1].textContent).toContain('Ocupada')
    expect(rows[2].textContent).toContain('Reservada')
  })

  it('offers create and edit links scoped to the restaurant and a delete button', async () => {
    tables.set([table('t1', 1, 'libre')])
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    expect(query<HTMLAnchorElement>('a[href$="/restaurants/rest-1/tables/new"]')).not.toBeNull()
    expect(query<HTMLAnchorElement>('a[href$="/restaurants/rest-1/tables/t1/edit"]')).not.toBeNull()
    expect(query('button[aria-label="Eliminar mesa 1"]')).not.toBeNull()
  })

  it('shows only the spinner while loading', async () => {
    loading.set(true)
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    expect(query('.spinner')).not.toBeNull()
    expect(query('table')).toBeNull()
  })

  it('shows the store error instead of an empty list', async () => {
    error.set('No se pudieron cargar las mesas.')
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    expect(query('.alert-error')?.textContent).toContain('No se pudieron cargar las mesas.')
    expect(query('.empty-state')).toBeNull()
  })

  it('shows an explicit empty state when there are no tables', async () => {
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    expect(query('.empty-state')?.textContent).toContain('No hay mesas para este restaurante')
    expect(query('table')).toBeNull()
  })

  it('warns that deleting closes the occupation and keeps the order history, and does not call the API when cancelled', async () => {
    tables.set([table('t1', 1, 'ocupada')])
    confirmSpy.mockReturnValue(false)
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    query<HTMLButtonElement>('button[aria-label="Eliminar mesa 1"]')!.click()
    await harness.fixture.whenStable()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    const message = String(confirmSpy.mock.calls[0][0])
    expect(message).toContain('mesa 1')
    expect(message.toLowerCase()).toContain('ocupación')
    expect(message.toLowerCase()).toContain('pedidos')
    expect(deleteTable).not.toHaveBeenCalled()
  })

  it('deletes the table of the current restaurant after confirmation', async () => {
    tables.set([table('t1', 1, 'libre')])
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    query<HTMLButtonElement>('button[aria-label="Eliminar mesa 1"]')!.click()
    await harness.fixture.whenStable()

    expect(deleteTable).toHaveBeenCalledWith('rest-1', 't1')
    expect(query('.alert-error')).toBeNull()
  })

  it('keeps the row and shows an error when deleting fails', async () => {
    tables.set([table('t1', 1, 'libre')])
    deleteTable.mockRejectedValue({ status: 404 })
    await harness.navigateByUrl('/restaurants/rest-1/tables', TableListPage)

    query<HTMLButtonElement>('button[aria-label="Eliminar mesa 1"]')!.click()
    await harness.fixture.whenStable()
    harness.detectChanges()

    expect(queryAll('tbody tr')).toHaveLength(1)
    expect(text()).toContain('No se pudo eliminar la mesa')
  })
})
