export type EmployeeView = 'barra' | 'salon' | 'cocina'
export type EmployeeRole = 'camarero' | 'cocinero' | 'manager' | 'admin'
export type EmployeeInitialRoute = '/barra' | '/cocina' | '/salon' | '/login'

const accessByRole: Record<EmployeeRole, readonly EmployeeView[]> = {
  camarero: ['barra', 'salon'],
  cocinero: ['cocina'],
  manager: ['barra', 'salon', 'cocina'],
  admin: ['barra', 'salon', 'cocina'],
}

const initialRouteByRole: Record<EmployeeRole, EmployeeInitialRoute> = {
  camarero: '/barra',
  cocinero: '/cocina',
  manager: '/salon',
  admin: '/salon',
}

function isEmployeeRole(role: unknown): role is EmployeeRole {
  return role === 'camarero' || role === 'cocinero' || role === 'manager' || role === 'admin'
}

function isEmployeeView(view: unknown): view is EmployeeView {
  return view === 'barra' || view === 'salon' || view === 'cocina'
}

export function canAccessView(role: unknown, view: unknown): boolean {
  return isEmployeeRole(role) && isEmployeeView(view) && accessByRole[role].includes(view)
}

export function getInitialRoute(role: unknown): EmployeeInitialRoute {
  return isEmployeeRole(role) ? initialRouteByRole[role] : '/login'
}
