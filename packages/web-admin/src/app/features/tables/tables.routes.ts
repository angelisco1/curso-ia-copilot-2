import type { Routes } from '@angular/router'

export const TABLE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/table-list/table-list.page').then(m => m.TableListPage)
  },
  {
    path: 'new',
    loadComponent: () => import('./pages/table-form/table-form.page').then(m => m.TableFormPage)
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./pages/table-form/table-form.page').then(m => m.TableFormPage)
  }
]
