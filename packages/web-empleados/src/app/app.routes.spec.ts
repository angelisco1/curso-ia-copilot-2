import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { describe, expect, it } from 'vitest'
import { AuthStore } from '@resttek/web-shared'
import { routes } from './app.routes'
import { salonGuard } from './core/auth/salon-access'

const children = routes.find(r => r.path === '' && r.children)!.children!
const child = (path: string) => children.find(r => r.path === path)!

describe('rutas de empleados', () => {
  it('solo salón añade guarda; cocina y barra conservan su acceso previo', () => {
    expect(child('salon').canActivate).toEqual([salonGuard])
    expect(child('cocina').canActivate).toBeUndefined()
    expect(child('barra').canActivate).toBeUndefined()
  })

  it('la raíz redirige a salón solo para admin y a cocina para el resto', () => {
    const redirect = child('').redirectTo as () => string
    for (const [role, dest] of [['admin', 'salon'], ['manager', 'cocina'], ['cocinero', 'cocina'], ['camarero', 'cocina']]) {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: { userRole: signal(role) } }] })
      expect(TestBed.runInInjectionContext(redirect)).toBe(dest)
    }
  })
})
