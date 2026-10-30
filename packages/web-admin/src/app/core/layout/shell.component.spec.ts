import { importProvidersFrom, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { AuthService, AuthStore } from '@resttek/web-shared'
import {
  ChevronRight, Edit, LayoutDashboard, LayoutGrid, LogOut, LucideAngularModule, Package, Plus,
  Settings, Trash2, Users, Utensils
} from 'lucide-angular'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RestaurantStore } from '../../features/restaurants/store/restaurant.store'
import { ShellComponent } from './shell.component'

describe('ShellComponent - menú de mesas', () => {
  const role = signal<string>('admin')

  const render = async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: ShellComponent }]),
        importProvidersFrom(
          LucideAngularModule.pick({
            ChevronRight, Edit, LayoutDashboard, LayoutGrid, LogOut, Package, Plus, Settings, Trash2, Users, Utensils
          })
        ),
        {
          provide: AuthStore,
          useValue: {
            userRole: () => role(),
            user: () => ({ firstName: 'Ana', lastName: 'Gil', role: role(), restaurantId: 'rest-1' })
          }
        },
        { provide: AuthService, useValue: { logout: vi.fn() } },
        {
          provide: RestaurantStore,
          useValue: {
            loadAll: vi.fn(),
            restaurants: () => [{ id: 'rest-1', name: 'Uno' }],
            loading: () => false
          }
        }
      ]
    })
    const harness = await RouterTestingHarness.create()
    const shell = await harness.navigateByUrl('/restaurants/rest-1/dashboard', ShellComponent)
    shell.expandedRestaurantId.set('rest-1')
    harness.detectChanges()
    return harness.routeNativeElement as HTMLElement
  }

  beforeEach(() => role.set('admin'))
  afterEach(() => TestBed.resetTestingModule())

  it('muestra el enlace Mesas del restaurante solo al admin', async () => {
    const el = await render()

    const link = el.querySelector<HTMLAnchorElement>('a[href="/restaurants/rest-1/tables"]')
    expect(link).not.toBeNull()
    expect(link!.textContent).toContain('Mesas')
  })

  it.each(['manager', 'camarero'])('no muestra el enlace Mesas a un %s', async r => {
    role.set(r)

    const el = await render()

    expect(el.querySelector('a[href="/restaurants/rest-1/tables"]')).toBeNull()
    expect(el.querySelector('a[href="/restaurants/rest-1/ingredients"]')).not.toBeNull()
  })
})
