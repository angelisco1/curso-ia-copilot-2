import { importProvidersFrom } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { ChevronLeft, Edit, LucideAngularModule, Plus, Trash2, Utensils } from 'lucide-angular'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { environment } from '../../../environments/environment'
import { TableFormPage } from './pages/table-form/table-form.page'
import { TableListPage } from './pages/table-list/table-list.page'
import type { RestaurantTable } from './models/table.model'
import { TABLE_ROUTES } from './tables.routes'

const api = environment.apiUrl

const table = (restaurantId: string, id: string, number: number, extra: Partial<RestaurantTable> = {}): RestaurantTable => ({
  id,
  restaurantId,
  number,
  description: `Mesa ${restaurantId}-${number}`,
  capacity: 4,
  status: 'libre',
  activeSessionId: null,
  ...extra
})

describe('mesas: navegación entre restaurantes y errores de CRUD (store y HTTP reales)', () => {
  let http: HttpTestingController
  let harness: RouterTestingHarness
  let confirmSpy: ReturnType<typeof vi.fn>
  let alertSpy: ReturnType<typeof vi.fn>

  const root = () => harness.routeNativeElement as HTMLElement
  const rows = () => Array.from(root().querySelectorAll('tbody tr'))
  const settle = async () => {
    await harness.fixture.whenStable()
    harness.detectChanges()
  }

  beforeEach(async () => {
    confirmSpy = vi.fn(() => true)
    alertSpy = vi.fn()
    vi.stubGlobal('confirm', confirmSpy)
    vi.stubGlobal('alert', alertSpy)
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'restaurants/:restaurantId', children: [{ path: 'tables', children: TABLE_ROUTES }] }]),
        importProvidersFrom(LucideAngularModule.pick({ ChevronLeft, Edit, Plus, Trash2, Utensils }))
      ]
    })
    http = TestBed.inject(HttpTestingController)
    harness = await RouterTestingHarness.create()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    TestBed.resetTestingModule()
  })

  describe('listado', () => {
    it('al ir de A a B reutiliza la page, limpia A, carga B y apunta las acciones a B', async () => {
      const pageA = await harness.navigateByUrl('/restaurants/A/tables', TableListPage)
      http.expectOne(`${api}/restaurants/A/tables`).flush([table('A', 'tA', 1)])
      await settle()
      expect(rows()).toHaveLength(1)

      const pageB = await harness.navigateByUrl('/restaurants/B/tables', TableListPage)
      expect(pageB).toBe(pageA)
      await settle()
      expect(rows()).toHaveLength(0)

      http.expectOne(`${api}/restaurants/B/tables`).flush([table('B', 'tB', 7)])
      await settle()

      expect(rows()).toHaveLength(1)
      expect(rows()[0].textContent).toContain('Mesa B-7')
      expect(root().querySelector('a[href$="/restaurants/B/tables/tB/edit"]')).not.toBeNull()
      expect(root().querySelector('a[href$="/restaurants/B/tables/new"]')).not.toBeNull()
      expect(root().querySelector('a[href*="/restaurants/A/"]')).toBeNull()
    })

    it('una respuesta tardía de A no sustituye la lista de B', async () => {
      await harness.navigateByUrl('/restaurants/A/tables', TableListPage)
      const requestA = http.expectOne(`${api}/restaurants/A/tables`)
      await harness.navigateByUrl('/restaurants/B/tables', TableListPage)
      http.expectOne(`${api}/restaurants/B/tables`).flush([table('B', 'tB', 7)])
      await settle()

      requestA.flush([table('A', 'tA', 1)])
      await settle()

      expect(rows()).toHaveLength(1)
      expect(rows()[0].textContent).toContain('Mesa B-7')
    })

    it('un fallo HTTP al borrar no elimina la fila ni notifica éxito', async () => {
      await harness.navigateByUrl('/restaurants/A/tables', TableListPage)
      http.expectOne(`${api}/restaurants/A/tables`).flush([table('A', 'tA', 1), table('A', 'tA2', 2)])
      await settle()

      root().querySelector<HTMLButtonElement>('button[aria-label="Eliminar mesa 1"]')!.click()
      http.expectOne({ method: 'DELETE', url: `${api}/restaurants/A/tables/tA` }).flush(
        { error: 'InternalServerError', message: 'boom' },
        { status: 500, statusText: 'Server Error' }
      )
      await settle()

      expect(rows()).toHaveLength(2)
      expect(root().querySelector('.alert-error')?.textContent).toContain('No se pudo eliminar la mesa')
      expect(root().querySelector('.alert-success')).toBeNull()
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it('un borrado correcto quita solo esa fila y no muestra error', async () => {
      await harness.navigateByUrl('/restaurants/A/tables', TableListPage)
      http.expectOne(`${api}/restaurants/A/tables`).flush([table('A', 'tA', 1), table('A', 'tA2', 2)])
      await settle()

      root().querySelector<HTMLButtonElement>('button[aria-label="Eliminar mesa 1"]')!.click()
      http.expectOne({ method: 'DELETE', url: `${api}/restaurants/A/tables/tA` }).flush(null, { status: 204, statusText: 'No Content' })
      await settle()

      expect(rows()).toHaveLength(1)
      expect(rows()[0].textContent).toContain('Mesa A-2')
      expect(root().querySelector('.alert-error')).toBeNull()
    })

    it('cancelar la confirmación no llama al servidor', async () => {
      confirmSpy.mockReturnValue(false)
      await harness.navigateByUrl('/restaurants/A/tables', TableListPage)
      http.expectOne(`${api}/restaurants/A/tables`).flush([table('A', 'tA', 1)])
      await settle()

      root().querySelector<HTMLButtonElement>('button[aria-label="Eliminar mesa 1"]')!.click()
      await settle()

      http.expectNone({ method: 'DELETE' })
      expect(rows()).toHaveLength(1)
    })

    it('muestra el error de carga HTTP sin simular una lista vacía', async () => {
      await harness.navigateByUrl('/restaurants/A/tables', TableListPage)
      http.expectOne(`${api}/restaurants/A/tables`).flush({ error: 'x' }, { status: 500, statusText: 'Server Error' })
      await settle()

      expect(root().querySelector('.alert-error')?.textContent).toContain('No se pudieron cargar las mesas')
      expect(root().querySelector('.empty-state')).toBeNull()
    })
  })

  describe('formulario de edición', () => {
    it('al ir de A a B recarga la mesa de B y guarda contra B', async () => {
      const router = TestBed.inject(Router)
      const formA = await harness.navigateByUrl('/restaurants/A/tables/t1/edit', TableFormPage)
      http.expectOne(`${api}/restaurants/A/tables/t1`).flush(table('A', 't1', 1, { description: 'de A' }))
      await settle()
      expect((root().querySelector('#description') as HTMLInputElement).value).toBe('de A')

      const formB = await harness.navigateByUrl('/restaurants/B/tables/t1/edit', TableFormPage)
      expect(formB).toBe(formA)
      http.expectOne(`${api}/restaurants/B/tables/t1`).flush(table('B', 't1', 3, { description: 'de B' }))
      await settle()
      expect((root().querySelector('#description') as HTMLInputElement).value).toBe('de B')
      expect((root().querySelector('#number') as HTMLInputElement).value).toBe('3')

      root().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
      const put = http.expectOne({ method: 'PUT', url: `${api}/restaurants/B/tables/t1` })
      put.flush(table('B', 't1', 3, { description: 'de B' }))
      await settle()

      expect(router.url).toBe('/restaurants/B/tables')
    })

    it('un fallo HTTP al guardar no navega ni da por bueno el guardado', async () => {
      const router = TestBed.inject(Router)
      await harness.navigateByUrl('/restaurants/A/tables/t1/edit', TableFormPage)
      http.expectOne(`${api}/restaurants/A/tables/t1`).flush(table('A', 't1', 1))
      await settle()

      root().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'))
      http.expectOne({ method: 'PUT', url: `${api}/restaurants/A/tables/t1` }).flush(
        { error: 'TableCapacityConflictError', message: 'Capacity cannot be lower than the active party size' },
        { status: 409, statusText: 'Conflict' }
      )
      await settle()

      expect(router.url).toBe('/restaurants/A/tables/t1/edit')
      expect(root().querySelector('.alert-error')?.textContent).toContain('capacidad no puede ser menor')
    })
  })
})
