import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'
import { AuthStore } from '@resttek/web-shared'

/**
 * Restringe una ruta a usuarios con rol admin. El resto se redirige a su
 * dashboard de restaurante (o al dashboard general) y el no autenticado a login.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthStore)
  const router = inject(Router)

  if (!auth.isAuthenticated()) return router.createUrlTree(['/login'])
  if (auth.userRole() === 'admin') return true

  const restaurantId = auth.user()?.restaurantId
  return restaurantId
    ? router.createUrlTree(['/restaurants', restaurantId, 'dashboard'])
    : router.createUrlTree(['/dashboard'])
}
