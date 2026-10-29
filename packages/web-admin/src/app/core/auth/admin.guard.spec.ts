import { TestBed } from '@angular/core/testing'
import { Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router'
import { AuthStore } from '@resttek/web-shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adminGuard } from './admin.guard'

describe('adminGuard', () => {
  let authenticated: boolean
  let role: string | null
  let restaurantId: string | undefined

  const run = () =>
    TestBed.runInInjectionContext(() =>
      adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    )

  beforeEach(() => {
    authenticated = true
    role = 'admin'
    restaurantId = undefined
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthStore,
          useValue: {
            isAuthenticated: () => authenticated,
            userRole: () => role,
            user: () => (role ? { role, restaurantId } : null)
          }
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('allows an admin', () => {
    expect(run()).toBe(true)
  })

  it.each(['manager', 'camarero', 'cocinero', 'cliente'])('redirects a %s to the dashboard of their restaurant', role_ => {
    role = role_
    restaurantId = 'rest-9'

    const result = run()

    expect(result).toBeInstanceOf(UrlTree)
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/restaurants/rest-9/dashboard')
  })

  it('redirects a non-admin without restaurant to the dashboard', () => {
    role = 'manager'

    expect(TestBed.inject(Router).serializeUrl(run() as UrlTree)).toBe('/dashboard')
  })

  it('redirects an unauthenticated user to login', () => {
    authenticated = false
    role = null

    expect(TestBed.inject(Router).serializeUrl(run() as UrlTree)).toBe('/login')
  })
})
