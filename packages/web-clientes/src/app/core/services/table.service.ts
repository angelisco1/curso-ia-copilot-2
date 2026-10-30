import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable, map } from 'rxjs'
import { API_URL } from '@resttek/web-shared'
import { AvailableTable, TableOccupation } from '../models/table.model'

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = inject(API_URL)

  /** Consulta mesas libres con capacidad suficiente. No cambia ningún estado en el servidor. */
  getAvailable(restaurantId: string, partySize: number): Observable<AvailableTable[]> {
    const params = new HttpParams().set('partySize', String(partySize))
    return this.http.get<AvailableTable[]>(
      `${this.apiUrl}/restaurants/${restaurantId}/tables/available`,
      { params }
    )
  }

  /**
   * Confirma la ocupación. El cliente lo identifica el JWT en el servidor:
   * nunca se envía clientId. Los errores (p. ej. 409) se propagan tal cual.
   */
  confirmOccupation(restaurantId: string, tableId: string, partySize: number): Observable<TableOccupation> {
    return this.http.post<TableOccupation>(
      `${this.apiUrl}/restaurants/${restaurantId}/table-sessions`,
      { tableId, partySize }
    )
  }

  /** Recupera la ocupación propia; el servidor responde el literal `null` si no existe. */
  getCurrent(restaurantId: string): Observable<TableOccupation | null> {
    return this.http
      .get<TableOccupation | null>(`${this.apiUrl}/restaurants/${restaurantId}/table-sessions/current`)
      .pipe(map(body => (body && body.session && body.table ? body : null)))
  }
}
