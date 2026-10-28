import { TestBed } from '@angular/core/testing'
import { canAccessView, EmployeeView, getInitialRoute } from './employee-access'

const accessCases: Array<[string | null, EmployeeView, boolean]> = [
  ['camarero', 'barra', true],
  ['camarero', 'salon', true],
  ['camarero', 'cocina', false],
  ['cocinero', 'barra', false],
  ['cocinero', 'salon', false],
  ['cocinero', 'cocina', true],
  ['manager', 'barra', true],
  ['manager', 'salon', true],
  ['manager', 'cocina', true],
  ['admin', 'barra', true],
  ['admin', 'salon', true],
  ['admin', 'cocina', true],
  ['cliente', 'barra', false],
  ['cliente', 'salon', false],
  ['cliente', 'cocina', false],
  [null, 'barra', false],
  [null, 'salon', false],
  [null, 'cocina', false],
  ['desconocido', 'barra', false],
  ['desconocido', 'salon', false],
  ['desconocido', 'cocina', false],
]

const initialRouteCases: Array<[string | null, string]> = [
  ['camarero', '/barra'],
  ['cocinero', '/cocina'],
  ['manager', '/salon'],
  ['admin', '/salon'],
  ['cliente', '/login'],
  [null, '/login'],
  ['desconocido', '/login'],
]

describe('Employee access test setup', () => {
  it('initializes Angular TestBed', async () => {
    await TestBed.configureTestingModule({}).compileComponents()

    expect(TestBed).toBeDefined()
  })
})

describe('employee access policy', () => {
  it.each(accessCases)('%s access to %s is %s', (role, view, expected) => {
    expect(canAccessView(role, view)).toBe(expected)
  })

  it.each(initialRouteCases)('%s starts at %s', (role, route) => {
    expect(getInitialRoute(role)).toBe(route)
  })

  it('denies a view outside the employee route set', () => {
    expect(canAccessView('manager', 'unknown')).toBe(false)
  })
})
