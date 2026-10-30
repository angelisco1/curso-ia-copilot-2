import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router, type Route } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { AuthStore } from '@resttek/web-shared'
import { importProvidersFrom } from '@angular/core'
import { ChevronLeft, LayoutGrid, LucideAngularModule, Plus, Edit, Trash2, Utensils } from 'lucide-angular'
import { of } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../app.routes'
import { adminGuard } from '../../core/auth/admin.guard'
import { TableService } from './services/table.service'
import { TableStore } from './store/table.store'
import { TABLE_ROUTES } from './tables.routes'
import { TableFormPage } from './pages/table-form/table-form.page'
import { TableListPage } from './pages/table-list/table-list.page'

@Component({ selector: 'app-stub', standalone: true, template: 'stub' })
class StubPage {}

const findRoute = (list: Route[], path: string): Route | undefined => {
  for (const route of list) {
    if (route.path === path) return route
    const found = route.children ? findRoute(route.children, path) : undefined
    if (found) return found
  }
  return undefined
}

describe('rutas de mesas', () => {
  it('declara listado, alta y edición con las pages de mesas', async () => {
    const byPath = Object.fromEntries(TABLE_ROUTES.map(r => [r.path, r]))

    expect(Object.keys(byPath).sort()).toEqual(['', ':id/edit', 'new'])
    expect(await (byPath[''].loadComponent as () => Promise<unknown>)()).toBe(TableListPage)
    expect(await (byPath['new'].loadComponent as () => Promise<unknown>)()).toBe(TableFormPage)
    expect(await (byPath[':id/edit'].loadComponent as () => Promise<unknown>)()).toBe(TableFormPage)
  })

  it('se cuelgan de restaurants/:restaurantId/tables protegidas por el guard de admin', () => {
    const restaurantRoute = findRoute(routes, 'restaurants/:restaurantId')!
    const tables = restaurantRoute.children!.find(r => r.path === 'tables')

    expect(tables).toBeDefined()
    expect(tables!.canActivate).toContain(adminGuard)
    expect(tables!.loadChildren).toBeDefined()
  })

  describe('navegación con guard real', () => {
    const role = signal<string | null>('admin')
    let harness: RouterTestingHarness
    const getAll = () => of([])

    beforeEach(async () => {
      role.set('admin')
      const tablesRoute = findRoute(routes, 'restaurants/:restaurantId')!.children!.find(r => r.path === 'tables')!
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'restaurants/:restaurantId', children: [{ path: 'dashboard', component: StubPage }, tablesRoute] },
            { path: 'dashboard', component: StubPage }
          ]),
          importProvidersFrom(LucideAngularModule.pick({ ChevronLeft, LayoutGrid, Plus, Edit, Trash2, Utensils })),
          {
            provide: AuthStore,
            useValue: {
              isAuthenticated: () => true,
              userRole: () => role(),
              user: () => ({ role: role(), restaurantId: 'rest-1' })
            }
          },
          { provide: TableService, useValue: { getAll, getById: () => of({}) } },
          { provide: TableStore, useValue: { tables: signal([]), loading: signal(false), error: signal(null), loadByRestaurant: () => Promise.resolve() } }
        ]
      })
      harness = await RouterTestingHarness.create()
    })

    afterEach(() => {
      TestBed.resetTestingModule()
    })

    it.each(['/restaurants/rest-1/tables', '/restaurants/rest-1/tables/new', '/restaurants/rest-1/tables/t1/edit'])(
      'un admin accede a %s',
      async url => {
        await harness.navigateByUrl(url)

        expect(TestBed.inject(Router).url).toBe(url)
      }
    )

    it.each(['/restaurants/rest-1/tables', '/restaurants/rest-1/tables/new', '/restaurants/rest-1/tables/t1/edit'])(
      'un manager que entra por URL directa a %s es redirigido a su dashboard',
      async url => {
        role.set('manager')

        await harness.navigateByUrl(url)

        expect(TestBed.inject(Router).url).toBe('/restaurants/rest-1/dashboard')
      }
    )
  })
})
