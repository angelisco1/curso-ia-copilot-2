import { Injectable, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import type { CreateTableDto, RestaurantTable, UpdateTableDto } from '../models/table.model'
import { TableService } from '../services/table.service'

@Injectable({ providedIn: 'root' })
export class TableStore {
  private readonly service = inject(TableService)

  private readonly _tables = signal<RestaurantTable[]>([])
  private readonly _loading = signal(false)
  private readonly _error = signal<string | null>(null)
  private _loadSequence = 0
  private _currentRestaurantId: string | null = null

  readonly tables = this._tables.asReadonly()
  readonly loading = this._loading.asReadonly()
  readonly error = this._error.asReadonly()

  async loadByRestaurant(restaurantId: string): Promise<void> {
    const loadSequence = ++this._loadSequence
    this._currentRestaurantId = restaurantId
    this._tables.set([])
    this._loading.set(true)
    this._error.set(null)
    try {
      const data = await firstValueFrom(this.service.getAll(restaurantId))
      if (loadSequence === this._loadSequence) {
        this._tables.set(this.sorted(data))
      }
    } catch {
      if (loadSequence === this._loadSequence) {
        this._error.set('No se pudieron cargar las mesas.')
      }
    } finally {
      if (loadSequence === this._loadSequence) {
        this._loading.set(false)
      }
    }
  }

  async create(restaurantId: string, dto: CreateTableDto): Promise<void> {
    const table = await firstValueFrom(this.service.create(restaurantId, dto))
    if (restaurantId === this._currentRestaurantId) {
      this._tables.update(list => this.sorted([...list, table]))
    }
  }

  async update(restaurantId: string, id: string, dto: UpdateTableDto): Promise<void> {
    const updated = await firstValueFrom(this.service.update(restaurantId, id, dto))
    if (restaurantId === this._currentRestaurantId) {
      this._tables.update(list => this.sorted(list.map(t => (t.id === id ? updated : t))))
    }
  }

  async delete(restaurantId: string, id: string): Promise<void> {
    await firstValueFrom(this.service.delete(restaurantId, id))
    if (restaurantId === this._currentRestaurantId) {
      this._tables.update(list => list.filter(t => t.id !== id))
    }
  }

  private sorted(list: RestaurantTable[]): RestaurantTable[] {
    return [...list].sort((a, b) => a.number - b.number)
  }
}
