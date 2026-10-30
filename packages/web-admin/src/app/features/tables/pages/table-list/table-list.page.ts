import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { LucideAngularModule } from 'lucide-angular'
import { distinctUntilChanged, map } from 'rxjs'
import type { RestaurantTable, TableStatus } from '../../models/table.model'
import { TableStore } from '../../store/table.store'

@Component({
  selector: 'app-table-list',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './table-list.page.html',
  styleUrl: './table-list.page.css'
})
export class TableListPage implements OnInit {
  readonly store = inject(TableStore)
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)

  readonly restaurantId = signal('')
  readonly deleteError = signal<string | null>(null)

  readonly statusLabels: Record<TableStatus, string> = {
    libre: 'Libre',
    ocupada: 'Ocupada',
    reservada: 'Reservada'
  }

  ngOnInit(): void {
    this.route.parent?.paramMap.pipe(
      map(params => params.get('restaurantId') ?? ''),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(restaurantId => {
      this.restaurantId.set(restaurantId)
      this.deleteError.set(null)
      if (restaurantId) {
        void this.store.loadByRestaurant(restaurantId)
      }
    })
  }

  async onDelete(table: RestaurantTable): Promise<void> {
    const restaurantId = this.restaurantId()
    if (!restaurantId) return
    const confirmed = confirm(
      `¿Eliminar la mesa ${table.number}? Si está ocupada se cerrará su ocupación. ` +
      'Los pedidos y su historial se conservan, y los pendientes siguen en cocina y barra.'
    )
    if (!confirmed) return

    this.deleteError.set(null)
    try {
      await this.store.delete(restaurantId, table.id)
    } catch {
      if (this.restaurantId() === restaurantId) {
        this.deleteError.set('No se pudo eliminar la mesa. Inténtalo de nuevo.')
      }
    }
  }
}
