import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { LoginComponent } from '@resttek/web-shared';
import { ShellComponent } from './core/layout/shell.component';
import { authGuard, AuthStore } from '@resttek/web-shared';
import { salonGuard } from './core/auth/salon-access';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('@resttek/web-shared').then(m => m.LoginComponent)
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: () => (inject(AuthStore).userRole() === 'admin' ? 'salon' : 'cocina'),
        pathMatch: 'full'
      },
      {
        path: 'cocina',
        loadComponent: () => import('./features/orders/pages/cocina/cocina.component').then(m => m.CocinaComponent),
      },
      {
        path: 'barra',
        loadComponent: () => import('./features/orders/pages/barra/barra.component').then(m => m.BarraComponent),
      },
      {
        path: 'salon',
        canActivate: [salonGuard],
        loadComponent: () => import('./features/orders/pages/salon/salon.component').then(m => m.SalonComponent),
      }
    ]
  },
  {
    path: '**',
    loadComponent: () => import('./core/layout/not-found.component').then(m => m.NotFoundComponent)
  }
];
