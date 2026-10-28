export type EmployeeView = 'barra' | 'salon' | 'cocina'

export function canAccessView(_role: unknown, _view: unknown): boolean {
  return false
}

export function getInitialRoute(_role: unknown): string {
  return '/login'
}
