import { importProvidersFrom } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { ChevronLeft, LucideAngularModule } from 'lucide-angular'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
