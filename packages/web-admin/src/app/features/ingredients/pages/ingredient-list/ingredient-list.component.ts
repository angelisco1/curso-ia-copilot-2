import { Component, DestroyRef, inject, OnInit } from '@angular/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { FormsModule } from '@angular/forms'
import { LucideAngularModule } from 'lucide-angular'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { distinctUntilChanged, map } from 'rxjs'
import { IngredientStore } from '../../store/ingredient.store'

@Component({
  selector: 'app-ingredient-list',
  standalone: true,
  imports: [RouterLink, FormsModule, LucideAngularModule],
  templateUrl: './ingredient-list.component.html',
  styleUrl: './ingredient-list.component.css'
})
export class IngredientListComponent implements OnInit {
  readonly store = inject(IngredientStore)
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
    if (confirm('¿Estás seguro de eliminar este ingrediente?')) {
      try {
        await this.store.delete(this.restaurantId, id)
      } catch {
        alert('Error al eliminar el ingrediente.')
      }
    }
  }
}
