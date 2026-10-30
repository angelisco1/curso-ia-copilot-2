import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from '@resttek/web-shared';

/** Matriz específica de salón: cocinero no accede. */
export const SALON_ROLES: readonly string[] = ['camarero', 'manager', 'admin'];

export function canAccessSalon(role: string | null | undefined): boolean {
  return !!role && SALON_ROLES.includes(role);
}

export const salonGuard: CanActivateFn = () => {
  const role = inject(AuthStore).userRole();
  return canAccessSalon(role) ? true : inject(Router).createUrlTree(['/']);
};
