import { TestBed } from '@angular/core/testing'
import { signal } from '@angular/core'
import { provideRouter } from '@angular/router'
import { LucideAngularModule, Flame, Beer, Armchair, LogOut, AlertCircle } from 'lucide-angular'
import { importProvidersFrom } from '@angular/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthService, AuthStore } from '@resttek/web-shared'
import { ShellComponent } from './shell.component'

function menu(role: string, restaurantId: string | null): { links: string[]; blocked: boolean } {
  TestBed.resetTestingModule()
  const user = signal<any>({ role, restaurantId, firstName: 'A', lastName: 'B' })
  TestBed.configureTestingModule({
    imports: [ShellComponent],
    providers: [
      provideRouter([]),
      importProvidersFrom(LucideAngularModule.pick({ Flame, Beer, Armchair, LogOut, AlertCircle })),
      { provide: AuthStore, useValue: { user, userRole: signal(role) } },
      { provide: AuthService, useValue: { logout: () => {} } }
    ]
  })
  const f = TestBed.createComponent(ShellComponent)
  f.detectChanges()
  const el = f.nativeElement as HTMLElement
  return {
    links: Array.from(el.querySelectorAll('nav a')).map(a => a.getAttribute('href') ?? ''),
    blocked: !!el.querySelector('.no-restaurant-container')
  }
}

describe('ShellComponent menú de acceso', () => {
  beforeEach(() => TestBed.resetTestingModule())

  it('mantiene la matriz previa de cocinero, camarero y manager', () => {
    expect(menu('cocinero', 'r1').links).toEqual(['/cocina'])
    expect(menu('camarero', 'r1').links).toEqual(['/barra', '/salon'])
    expect(menu('manager', 'r1').links).toEqual(['/cocina', '/barra', '/salon'])
  })

  it('cocinero sin restaurante sigue bloqueado', () => {
    expect(menu('cocinero', null).blocked).toBe(true)
    expect(menu('camarero', null).blocked).toBe(true)
  })

  it('admin sin restaurante accede solo a Salón, sin cocina ni barra', () => {
    const m = menu('admin', null)
    expect(m.blocked).toBe(false)
    expect(m.links).toEqual(['/salon'])
  })
})
