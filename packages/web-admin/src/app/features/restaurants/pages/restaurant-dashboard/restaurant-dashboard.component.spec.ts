import { importProvidersFrom } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { AuthStore } from '@resttek/web-shared'
import { LayoutGrid, LucideAngularModule, Package, Users, Utensils } from 'lucide-angular'
import { afterEach, describe, expect, it } from 'vitest'
import { RestaurantStore } from '../../store/restaurant.store'
import { RestaurantDashboardComponent } from './restaurant-dashboard.component'

describe('RestaurantDashboardComponent - acceso a mesas', () => {
  const render = async (role: string) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'restaurants/:restaurantId', children: [{ path: 'dashboard', component: RestaurantDashboardComponent }] }
        ]),
        importProvidersFrom(LucideAngularModule.pick({ LayoutGrid, Package, Users, Utensils })),
        { provide: AuthStore, useValue: { userRole: () => role } },
        { provide: RestaurantStore, useValue: { getById: () => ({ id: 'rest-1', name: 'Uno' }) } }
      ]
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/restaurants/rest-1/dashboard', RestaurantDashboardComponent)
    return harness.routeNativeElement as HTMLElement
  }

  afterEach(() => TestBed.resetTestingModule())

  it('enlaza el listado de mesas del restaurante para el admin', async () => {
    const el = await render('admin')

    const card = el.querySelector<HTMLAnchorElement>('a[href="/restaurants/rest-1/tables"]')
    expect(card).not.toBeNull()
    expect(card!.textContent).toContain('Mesas')
  })

  it('no ofrece mesas a un manager y conserva el resto de tarjetas', async () => {
    const el = await render('manager')

    expect(el.querySelector('a[href="/restaurants/rest-1/tables"]')).toBeNull()
    expect(el.querySelector('a[href="/restaurants/rest-1/dishes"]')).not.toBeNull()
    expect(el.querySelector('a[href="/restaurants/rest-1/employees"]')).not.toBeNull()
  })
})
