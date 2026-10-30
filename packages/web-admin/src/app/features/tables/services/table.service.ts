import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { environment } from '../../../../environments/environment'
import type { CreateTableDto, RestaurantTable, UpdateTableDto } from '../models/table.model'

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient)

  private buildUrl(restaurantId: string): string {
    return `${environment.apiUrl}/restaurants/${restaurantId}/tables`
  }

  getAll(restaurantId: string) {
    return this.http.get<RestaurantTable[]>(this.buildUrl(restaurantId))
  }

  getById(restaurantId: string, id: string) {
    return this.http.get<RestaurantTable>(`${this.buildUrl(restaurantId)}/${id}`)
  }

  create(restaurantId: string, dto: CreateTableDto) {
    return this.http.post<RestaurantTable>(this.buildUrl(restaurantId), dto)
  }

  update(restaurantId: string, id: string, dto: UpdateTableDto) {
    return this.http.put<RestaurantTable>(`${this.buildUrl(restaurantId)}/${id}`, dto)
  }

  delete(restaurantId: string, id: string) {
    return this.http.delete<void>(`${this.buildUrl(restaurantId)}/${id}`)
  }
}
