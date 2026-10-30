import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router'
import { catchError, map, of } from 'rxjs'
import { TableSessionStore } from '../store/table-session.store'

/**
 * Protege la carta: consulta siempre al servidor la ocupación propia del
 * restaurante. Sin ocupación (o si no se puede comprobar) redirige al paso de
 * mesas, que no lleva este guard, por lo que no hay bucles.
 */
export const tableSessionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const store = inject(TableSessionStore)
  const router = inject(Router)
  const restaurantId = route.paramMap.get('id') ?? ''
  const toTables = () => router.createUrlTree(['/restaurants', restaurantId, 'tables'])

  return store.load(restaurantId).pipe(
    map(occupation => (occupation ? true : toTables())),
    catchError(() => of(toTables()))
  )
}
