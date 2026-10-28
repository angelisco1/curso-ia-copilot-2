import { Component, DestroyRef, inject, OnInit } from '@angular/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { FormsModule } from '@angular/forms'
import { LucideAngularModule } from 'lucide-angular'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { distinctUntilChanged, map } from 'rxjs'
import { DishStore } from '../../store/dish.store'

@Component({
  selector: 'app-dish-list',
  standalone: true,
  imports: [RouterLink, FormsModule, LucideAngularModule],
  templateUrl: './dish-list.component.html',
  styleUrl: './dish-list.component.css'
})
export class DishListComponent implements OnInit {
  readonly store = inject(DishStore)
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  restaurantId = ''

  ngOnInit(): void {
    this.route.parent?.paramMap.pipe(
      map(params => params.get('restaurantId') ?? ''),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(restaurantId => {
      this.restaurantId = restaurantId
      if (restaurantId) {
        void this.store.loadByRestaurant(restaurantId)
      }
    })
  }

  async onDelete(id: string): Promise<void> {
    if (!this.restaurantId) return
    if (confirm('¿Estás seguro de eliminar este plato?')) {
      try {
        await this.store.delete(this.restaurantId, id)
      } catch {
        alert('Error al eliminar el plato.')
      }
    }
  }

  async onToggleAvailable(id: string, dish: any): Promise<void> {
    if (!this.restaurantId) return
    try {
      await this.store.update(this.restaurantId, id, {
        ...dish,
        available: !dish.available
      })
    } catch {
      alert('Error al actualizar disponibilidad.')
    }
  }

  formatPrice(price: number): string {
    return price.toFixed(2) + ' €'
  }

  getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      'entrante': 'Entrante',
      'principal': 'Principal',
      'postre': 'Postre',
      'bebida': 'Bebida'
    }
    return labels[category] ?? category
  }
}
