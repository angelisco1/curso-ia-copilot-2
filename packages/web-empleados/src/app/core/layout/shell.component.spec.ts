import { importProvidersFrom } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
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
import { AuthService, AuthStore } from '@resttek/web-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShellComponent } from './shell.component'

const menuCases: Array<[string | null, string[]]> = [
  ['camarero', ['/barra', '/salon']],
  ['cocinero', ['/cocina']],
  ['manager', ['/barra', '/salon', '/cocina']],
  ['admin', ['/barra', '/salon', '/cocina']],
  ['cliente', []],
  [null, []],
  ['desconocido', []]
]

describe('ShellComponent', () => {
  let role: string | null
  let restaurantId: string | null
  let authService: { logout: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    role = 'manager'
    restaurantId = 'restaurant-1'
    authService = { logout: vi.fn() }

    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([]),
        importProvidersFrom(
          LucideAngularModule.pick({
            Utensils, Flame, Beer, Armchair, LogOut, ChevronRight, AlertCircle
          })
        ),
        {
          provide: AuthStore,
          useValue: {
            userRole: () => role,
            user: () => ({
              restaurantId,
              firstName: 'Test',
              lastName: 'Employee'
            })
          }
        },
        { provide: AuthService, useValue: authService }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it.each(menuCases)('shows only permitted links for %s', (testRole, expectedLinks) => {
    role = testRole
    const fixture = TestBed.createComponent(ShellComponent)
    fixture.detectChanges()

    const visibleLinks = Array.from(
      fixture.nativeElement.querySelectorAll('a.nav-item') as NodeListOf<HTMLAnchorElement>
    ).map(link => link.getAttribute('href')).sort()

    expect(visibleLinks).toEqual([...expectedLinks].sort())
  })

  it('keeps the no-restaurant message and does not render a work outlet', () => {
    restaurantId = null
    const fixture = TestBed.createComponent(ShellComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('Sin restaurante asignado')
    expect(fixture.nativeElement.querySelector('.sidebar')).toBeNull()
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeNull()

    fixture.nativeElement.querySelector('button').click()
    expect(authService.logout).toHaveBeenCalledOnce()
  })

  it('preserves logout behavior from the assigned-restaurant shell', () => {
    const fixture = TestBed.createComponent(ShellComponent)
    fixture.detectChanges()

    fixture.nativeElement.querySelector('.btn-logout').click()

    expect(authService.logout).toHaveBeenCalledOnce()
  })
})
