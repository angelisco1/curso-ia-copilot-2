import { inject } from '@angular/core'
import { type CanActivateFn, type Route, Router } from '@angular/router'
import { AuthStore } from '@resttek/web-shared'
import { canAccessView, getInitialRoute, type EmployeeView } from './employee-access'

export const employeeRoleGuard: CanActivateFn = (route) => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  const requestedPath = route.routeConfig?.path
  const role = authStore.userRole()

  if (requestedPath === '' || requestedPath === undefined) {
    return router.createUrlTree([getInitialRoute(role)])
  }

  if (canAccessView(role, requestedPath as EmployeeView)) {
    return true
  }

  return router.createUrlTree([getInitialRoute(role)])
}
