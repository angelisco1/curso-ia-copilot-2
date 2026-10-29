import { Routes } from '@angular/router';
import { LoginComponent } from '@resttek/web-shared';
import { ShellComponent } from './core/layout/shell.component';
import { authGuard } from '@resttek/web-shared';
import { employeeRoleGuard } from './core/auth/employee-role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('@resttek/web-shared').then(m => m.LoginComponent)
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    canActivateChild: [employeeRoleGuard],
    children: [
      {
        path: '',
        canActivate: [employeeRoleGuard],
        children: []
      },
      {
        path: 'cocina',
        canActivate: [employeeRoleGuard],
        loadComponent: () => import('./features/orders/pages/cocina/cocina.component').then(m => m.CocinaComponent),
      },
      {
        path: 'barra',
        canActivate: [employeeRoleGuard],
        loadComponent: () => import('./features/orders/pages/barra/barra.component').then(m => m.BarraComponent),
      },
      {
        path: 'salon',
        canActivate: [employeeRoleGuard],
        loadComponent: () => import('./features/orders/pages/salon/salon.component').then(m => m.SalonComponent),
      }
    ]
  },
  {
    path: '**',
    loadComponent: () => import('./core/layout/not-found.component').then(m => m.NotFoundComponent)
  }
];
