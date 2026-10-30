import { TestBed } from '@angular/core/testing'
import { Router, UrlTree, provideRouter } from '@angular/router'
import { signal } from '@angular/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthStore } from '@resttek/web-shared'
import { canAccessSalon, salonGuard } from './salon-access'

describe('salon-access', () => {
  const role = signal<string | null>(null)

  beforeEach(() => {
    role.set(null)
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthStore, useValue: { userRole: role } }]
    })
  })

  it('permite camarero, manager y admin; deniega cocinero y desconocidos', () => {
    expect(canAccessSalon('camarero')).toBe(true)
    expect(canAccessSalon('manager')).toBe(true)
    expect(canAccessSalon('admin')).toBe(true)
    expect(canAccessSalon('cocinero')).toBe(false)
    expect(canAccessSalon('cliente')).toBe(false)
    expect(canAccessSalon(null)).toBe(false)
  })

  it('el guard deja pasar a camarero y redirige a / al cocinero', () => {
    role.set('camarero')
    expect(TestBed.runInInjectionContext(() => salonGuard({} as any, {} as any))).toBe(true)
    role.set('cocinero')
    const result = TestBed.runInInjectionContext(() => salonGuard({} as any, {} as any))
    expect(result instanceof UrlTree).toBe(true)
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/')
  })
})
