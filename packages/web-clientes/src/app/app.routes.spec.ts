import { routes } from './app.routes'
import { tableSessionGuard } from './core/guards/table-session.guard'
import { TableSelectionPage } from './features/tables/table-selection.page'
import { Route } from '@angular/router'

function child(path: string): Route {
  const shell = routes.find(r => r.path === '' && r.children)!
  const found = shell.children!.find(r => r.path === path)
  expect(found, `ruta ${path}`).toBeDefined()
  return found!
}

describe('rutas de clientes', () => {
  it('registra restaurants/:id/tables con TableSelectionPage y sin guard de sesión (evita bucles)', async () => {
    const route = child('restaurants/:id/tables')
    expect(await route.loadComponent!()).toBe(TableSelectionPage)
    expect(route.canActivate ?? []).not.toContain(tableSessionGuard)
  })

  it('conserva la carta en restaurants/:id protegida por el guard de sesión', () => {
    const route = child('restaurants/:id')
    expect(route.canActivate).toContain(tableSessionGuard)
  })

  it('el listado de restaurantes sigue en restaurants', () => {
    expect(child('restaurants').path).toBe('restaurants')
  })
})
