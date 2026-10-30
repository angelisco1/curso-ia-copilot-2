import { importProvidersFrom } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { ChevronLeft, LucideAngularModule } from 'lucide-angular'
import { of, throwError } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RestaurantTable } from '../../models/table.model'
import { TableService } from '../../services/table.service'
import { TableStore } from '../../store/table.store'
import { TableFormPage } from './table-form.page'

describe('TableFormPage (alta)', () => {
  let create: ReturnType<typeof vi.fn>
  let harness: RouterTestingHarness

  const root = () => harness.routeNativeElement as HTMLElement
  const field = <T extends HTMLElement>(selector: string) => root().querySelector<T>(selector)!
  const setValue = (selector: string, value: string) => {
    const el = field<HTMLInputElement | HTMLSelectElement>(selector)
    el.value = value
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'))
    harness.detectChanges()
  }
  const submitButton = () => field<HTMLButtonElement>('button[type="submit"]')
  const submit = async () => {
    field<HTMLFormElement>('form').dispatchEvent(new Event('submit'))
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const fillValid = () => {
    setValue('#number', '3')
    setValue('#capacity', '4')
  }

  beforeEach(async () => {
    create = vi.fn().mockResolvedValue(undefined)
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'restaurants/:restaurantId',
            children: [
              {
                path: 'tables',
                children: [
                  { path: '', component: TableFormPage },
                  { path: 'new', component: TableFormPage }
                ]
              }
            ]
          }
        ]),
        importProvidersFrom(LucideAngularModule.pick({ ChevronLeft })),
        { provide: TableStore, useValue: { create } }
      ]
    })
    harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/restaurants/rest-1/tables/new', TableFormPage)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('renders number, description, capacity and a three-option status selector defaulting to libre', () => {
    expect(field('#number')).not.toBeNull()
    expect(field('#description')).not.toBeNull()
    expect(field('#capacity')).not.toBeNull()
    const options = Array.from(field<HTMLSelectElement>('#status').options).map(o => o.value)
    expect(options).toEqual(['libre', 'ocupada', 'reservada'])
    expect(field<HTMLSelectElement>('#status').value).toBe('libre')
    expect(root().querySelector('h1')?.textContent).toContain('Nueva mesa')
  })

  it('blocks submission while the form is invalid and never calls the store', async () => {
    expect(submitButton().disabled).toBe(true)

    await submit()

    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    ['number', '#number', '0'],
    ['number', '#number', '-1'],
    ['number', '#number', '1.5'],
    ['capacity', '#capacity', '0'],
    ['capacity', '#capacity', '-2'],
    ['capacity', '#capacity', '2.5']
  ])('rejects a non positive integer %s (%s = %s)', async (_name, selector, value) => {
    fillValid()
    setValue(selector, value)

    expect(submitButton().disabled).toBe(true)
    await submit()

    expect(create).not.toHaveBeenCalled()
    expect(root().querySelector('.field-error')?.textContent).toContain('entero positivo')
  })

  it('accepts an empty description and creates the table, then returns to the list', async () => {
    const router = TestBed.inject(Router)
    fillValid()
    setValue('#status', 'reservada')

    expect(submitButton().disabled).toBe(false)
    await submit()

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith('rest-1', { number: 3, description: '', capacity: 4, status: 'reservada' })
    expect(router.url).toBe('/restaurants/rest-1/tables')
  })

  it('blocks a second submission while saving and shows the saving state', async () => {
    let resolve!: () => void
    create.mockReturnValue(new Promise<void>(r => (resolve = r)))
    fillValid()

    field<HTMLFormElement>('form').dispatchEvent(new Event('submit'))
    harness.detectChanges()
    field<HTMLFormElement>('form').dispatchEvent(new Event('submit'))
    harness.detectChanges()

    expect(create).toHaveBeenCalledTimes(1)
    expect(submitButton().disabled).toBe(true)
    expect(submitButton().textContent).toContain('Guardando')

    resolve()
    await harness.fixture.whenStable()
  })

  it('shows the number conflict on 409 and stays on the form ready to retry', async () => {
    const router = TestBed.inject(Router)
    create.mockRejectedValue({ status: 409, error: { error: 'TableNumberConflictError', message: 'Table number already exists in this restaurant' } })
    fillValid()

    await submit()

    expect(root().querySelector('.alert-error')?.textContent).toContain('Ya existe una mesa con ese número')
    expect(router.url).toBe('/restaurants/rest-1/tables/new')
    expect(submitButton().disabled).toBe(false)
  })

  it('shows a generic error for other failures', async () => {
    create.mockRejectedValue({ status: 500 })
    fillValid()

    await submit()

    expect(root().querySelector('.alert-error')?.textContent).toContain('No se pudo guardar la mesa')
  })
})

describe('TableFormPage (edición)', () => {
  const existing: RestaurantTable = {
    id: 't1',
    restaurantId: 'rest-1',
    number: 5,
    description: 'Barra',
    capacity: 2,
    status: 'libre',
    activeSessionId: null
  }
  let update: ReturnType<typeof vi.fn>
  let create: ReturnType<typeof vi.fn>
  let getById: ReturnType<typeof vi.fn>
  let confirmSpy: ReturnType<typeof vi.fn>
  let harness: RouterTestingHarness

  const root = () => harness.routeNativeElement as HTMLElement
  const field = <T extends HTMLElement>(selector: string) => root().querySelector<T>(selector)!
  const setValue = (selector: string, value: string) => {
    const el = field<HTMLInputElement | HTMLSelectElement>(selector)
    el.value = value
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'))
    harness.detectChanges()
  }
  const submit = async () => {
    field<HTMLFormElement>('form').dispatchEvent(new Event('submit'))
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const open = async (table: RestaurantTable | Error | null = existing) => {
    getById.mockReturnValue(table instanceof Error || table === null ? throwError(() => table ?? { status: 404 }) : of(table))
    await harness.navigateByUrl('/restaurants/rest-1/tables/t1/edit', TableFormPage)
    await harness.fixture.whenStable()
    harness.detectChanges()
  }

  beforeEach(async () => {
    update = vi.fn().mockResolvedValue(undefined)
    create = vi.fn()
    getById = vi.fn()
    confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'restaurants/:restaurantId',
            children: [
              {
                path: 'tables',
                children: [
                  { path: '', component: TableFormPage },
                  { path: ':id/edit', component: TableFormPage }
                ]
              }
            ]
          }
        ]),
        importProvidersFrom(LucideAngularModule.pick({ ChevronLeft })),
        { provide: TableStore, useValue: { create, update } },
        { provide: TableService, useValue: { getById } }
      ]
    })
    harness = await RouterTestingHarness.create()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    TestBed.resetTestingModule()
  })

  it('loads the table by id and preloads every field', async () => {
    await open({ ...existing, status: 'reservada' })

    expect(getById).toHaveBeenCalledWith('rest-1', 't1')
    expect(field<HTMLInputElement>('#number').value).toBe('5')
    expect(field<HTMLInputElement>('#description').value).toBe('Barra')
    expect(field<HTMLInputElement>('#capacity').value).toBe('2')
    expect(field<HTMLSelectElement>('#status').value).toBe('reservada')
    expect(root().querySelector('h1')?.textContent).toContain('Editar mesa')
  })

  it('saves with update keeping the table id and restaurant, without creating', async () => {
    const router = TestBed.inject(Router)
    await open()
    setValue('#capacity', '6')
    setValue('#description', 'Barra alta')

    await submit()

    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith('rest-1', 't1', { number: 5, description: 'Barra alta', capacity: 6, status: 'libre' })
    expect(router.url).toBe('/restaurants/rest-1/tables')
  })

  it('shows a capacity conflict when the capacity is lower than the active party', async () => {
    update.mockRejectedValue({ status: 409, error: { error: 'TableCapacityConflictError', message: 'Capacity cannot be lower than the active party size' } })
    await open({ ...existing, status: 'ocupada' })
    setValue('#capacity', '1')

    await submit()

    expect(root().querySelector('.alert-error')?.textContent).toContain('capacidad no puede ser menor')
    expect(field<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false)
  })

  it('shows a duplicate number conflict on edit', async () => {
    update.mockRejectedValue({ status: 409, error: { error: 'TableNumberConflictError', message: 'Table number already exists in this restaurant' } })
    await open()

    await submit()

    expect(root().querySelector('.alert-error')?.textContent).toContain('Ya existe una mesa con ese número')
  })

  it('shows an explanation when the table was deleted while saving (404)', async () => {
    update.mockRejectedValue({ status: 404, error: { error: 'TableNotFoundError', message: 'Table not found' } })
    await open()

    await submit()

    expect(root().querySelector('.alert-error')?.textContent).toContain('ya no existe')
  })

  it('shows an error and blocks saving when the table cannot be loaded', async () => {
    await open(null)

    expect(root().querySelector('.alert-error')?.textContent).toContain('ya no existe')
    expect(field<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true)
    await submit()
    expect(update).not.toHaveBeenCalled()
  })

  it.each(['libre', 'reservada'])('warns about pending orders before freeing an occupied table (ocupada -> %s) and does not save if cancelled', async next => {
    confirmSpy.mockReturnValue(false)
    await open({ ...existing, status: 'ocupada', activeSessionId: 's1' })
    setValue('#status', next)

    await submit()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    const message = String(confirmSpy.mock.calls[0][0]).toLowerCase()
    expect(message).toContain('pedidos pendientes')
    expect(message).toContain('no se eliminan')
    expect(update).not.toHaveBeenCalled()
  })

  it('saves after the release warning is accepted', async () => {
    await open({ ...existing, status: 'ocupada', activeSessionId: 's1' })
    setValue('#status', 'libre')

    await submit()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith('rest-1', 't1', { number: 5, description: 'Barra', capacity: 2, status: 'libre' })
  })

  it('does not warn when the table stays occupied or was not occupied', async () => {
    await open({ ...existing, status: 'ocupada', activeSessionId: 's1' })
    await submit()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)

    update.mockClear()
    await open({ ...existing, status: 'libre' })
    setValue('#status', 'reservada')
    await submit()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
  })
})
