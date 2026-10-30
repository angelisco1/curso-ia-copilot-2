import { inject } from '@angular/core'
import { type CanActivateFn, Router } from '@angular/router'
import { AuthStore } from '@resttek/web-shared'
import { canAccessView, getInitialRoute } from './employee-access'

export const employeeRoleGuard: CanActivateFn = (route) => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  const requestedPath = route.routeConfig?.path
  const role = authStore.userRole()

  if (!authStore.isAuthenticated()) {
    return router.createUrlTree(['/login'])
  }

  if (requestedPath === '' || requestedPath === undefined) {
    return router.createUrlTree([getInitialRoute(role)])
  }

  if (canAccessView(role, requestedPath)) {
    return true
  }

  return router.createUrlTree([getInitialRoute(role)])
}
