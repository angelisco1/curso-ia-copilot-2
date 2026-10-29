import { importProvidersFrom, signal, type Type } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import {
  AlertCircle,
  Armchair,
  Beer,
  ChevronRight,
  Flame,
  LogOut,
  LucideAngularModule,
  Utensils
} from 'lucide-angular'
import { AuthService, AuthStore, LoginComponent } from '@resttek/web-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from './app.routes'
import { BarraComponent } from './features/orders/pages/barra/barra.component'
import { CocinaComponent } from './features/orders/pages/cocina/cocina.component'
import { SalonComponent } from './features/orders/pages/salon/salon.component'
import { OrderStore } from './features/orders/store/order.store'
import type { EmployeeRole, EmployeeView } from './core/auth/employee-access'

type WorkPath = `/${EmployeeView}`

const workPaths: WorkPath[] = ['/barra', '/salon', '/cocina']

const rolePathCases: Array<[EmployeeRole, WorkPath, WorkPath]> = [
  ['camarero', '/barra', '/barra'],
  ['camarero', '/salon', '/salon'],
  ['camarero', '/cocina', '/barra'],
  ['cocinero', '/barra', '/cocina'],
  ['cocinero', '/salon', '/cocina'],
  ['cocinero', '/cocina', '/cocina'],
  ['manager', '/barra', '/barra'],
  ['manager', '/salon', '/salon'],
  ['manager', '/cocina', '/cocina'],
  ['admin', '/barra', '/barra'],
  ['admin', '/salon', '/salon'],
  ['admin', '/cocina', '/cocina'],
]

const initialRouteCases: Array<[EmployeeRole, WorkPath]> = [
  ['camarero', '/barra'],
  ['cocinero', '/cocina'],
  ['manager', '/salon'],
  ['admin', '/salon'],
]

const unauthenticatedRouteCases: Array<[EmployeeRole, WorkPath]> = []
for (const role of ['camarero', 'cocinero', 'manager', 'admin'] as const) {
  for (const path of workPaths) {
    unauthenticatedRouteCases.push([role, path])
  }
}

const unsupportedRoleCases: Array<[string | null, WorkPath]> = []
for (const role of ['cliente', null, 'desconocido'] as const) {
  for (const path of workPaths) {
    unsupportedRoleCases.push([role, path])
  }
}

function componentForPath(path: WorkPath): Type<unknown> {
  switch (path) {
    case '/barra':
      return BarraComponent
    case '/cocina':
      return CocinaComponent
    case '/salon':
      return SalonComponent
  }
}

function initForPath(path: WorkPath): () => void {
  switch (path) {
    case '/barra':
      return BarraComponent.prototype.ngOnInit
    case '/cocina':
      return CocinaComponent.prototype.ngOnInit
    case '/salon':
      return SalonComponent.prototype.ngOnInit
  }
}

describe('employee routes', () => {
  let router: Router
  let role: string | null
  let authenticated: boolean
  let orderStore: {
    orders: ReturnType<typeof signal>
    loading: ReturnType<typeof signal>
    error: ReturnType<typeof signal>
    startPolling: ReturnType<typeof vi.fn>
    stopPolling: ReturnType<typeof vi.fn>
    updateItemStatus: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    role = 'manager'
    authenticated = true
    orderStore = {
      orders: signal([]),
      loading: signal(false),
      error: signal(null),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
      updateItemStatus: vi.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        importProvidersFrom(
          LucideAngularModule.pick({
            Utensils, Flame, Beer, Armchair, LogOut, ChevronRight, AlertCircle
          })
        ),
        {
          provide: AuthStore,
          useValue: {
            isAuthenticated: () => authenticated,
            userRole: () => role,
            user: () => ({
              restaurantId: 'restaurant-1',
              firstName: 'Test',
              lastName: 'Employee'
            })
          }
        },
        { provide: AuthService, useValue: { logout: vi.fn() } },
        { provide: OrderStore, useValue: orderStore }
      ]
    })

    router = TestBed.inject(Router)
    vi.spyOn(BarraComponent.prototype, 'ngOnInit')
    vi.spyOn(CocinaComponent.prototype, 'ngOnInit')
    vi.spyOn(SalonComponent.prototype, 'ngOnInit')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    TestBed.resetTestingModule()
  })

  function activeComponent(): unknown {
    const rootRoute = router.routerState.snapshot.root.firstChild
    return rootRoute?.firstChild?.component ?? rootRoute?.component
  }

  it.each(rolePathCases)('%s request to %s resolves to %s', async (testRole, path, expectedPath) => {
    role = testRole
    const harness = await RouterTestingHarness.create()

    await harness.navigateByUrl(path)

    expect(router.url).toBe(expectedPath)
    expect(activeComponent()).toBe(componentForPath(expectedPath))
    expect(orderStore.startPolling).toHaveBeenCalledTimes(1)
    if (path !== expectedPath) {
      expect(initForPath(path)).not.toHaveBeenCalled()
    }
  })

  it.each(initialRouteCases)('%s entering / resolves to %s', async (testRole, expectedPath) => {
    role = testRole
    const harness = await RouterTestingHarness.create()

    await harness.navigateByUrl('/')

    expect(router.url).toBe(expectedPath)
    expect(activeComponent()).toBe(componentForPath(expectedPath))
  })

  it.each(unauthenticatedRouteCases)(
    '%s without a session cannot open %s',
    async (testRole, path) => {
      role = testRole
      authenticated = false
      const harness = await RouterTestingHarness.create()

      await harness.navigateByUrl(path)

      expect(router.url).toBe('/login')
      expect(activeComponent()).toBe(LoginComponent)
      expect(orderStore.startPolling).not.toHaveBeenCalled()
    }
  )

  it.each(unsupportedRoleCases)(
    'role %s with a session cannot open %s',
    async (testRole, path) => {
      role = testRole
      const harness = await RouterTestingHarness.create()

      await harness.navigateByUrl(path)

      expect(router.url).toBe('/login')
      expect(activeComponent()).toBe(LoginComponent)
      expect(orderStore.startPolling).not.toHaveBeenCalled()
    }
  )

  it('rechecks sibling navigation for a waiter and permits their salon view', async () => {
    role = 'camarero'
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/barra')

    await harness.navigateByUrl('/cocina')

    expect(router.url).toBe('/barra')
    expect(CocinaComponent.prototype.ngOnInit).not.toHaveBeenCalled()
    expect(orderStore.startPolling).toHaveBeenCalledTimes(1)

    await harness.navigateByUrl('/salon')

    expect(router.url).toBe('/salon')
    expect(SalonComponent.prototype.ngOnInit).toHaveBeenCalledOnce()
    expect(orderStore.startPolling).toHaveBeenCalledTimes(2)
  })

  it('rechecks sibling navigation for a cook and rejects both forbidden views', async () => {
    role = 'cocinero'
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/cocina')

    await harness.navigateByUrl('/barra')
    expect(router.url).toBe('/cocina')
    expect(BarraComponent.prototype.ngOnInit).not.toHaveBeenCalled()

    await harness.navigateByUrl('/salon')
    expect(router.url).toBe('/cocina')
    expect(SalonComponent.prototype.ngOnInit).not.toHaveBeenCalled()
    expect(orderStore.startPolling).toHaveBeenCalledTimes(1)
  })

  it.each(['manager', 'admin'] as const)('%s can navigate between all work views', async testRole => {
    role = testRole
    const harness = await RouterTestingHarness.create()

    for (const path of workPaths) {
      await harness.navigateByUrl(path)
      expect(router.url).toBe(path)
      expect(activeComponent()).toBe(componentForPath(path))
    }

    expect(orderStore.startPolling).toHaveBeenCalledTimes(3)
  })
})
