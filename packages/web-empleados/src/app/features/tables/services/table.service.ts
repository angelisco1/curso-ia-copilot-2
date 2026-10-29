import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Table, UpdateTableStatusDto } from '../models/table.model';
import { Order } from '../../orders/models/order.model';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient);

  private tablesUrl(restaurantId: string): string {
    return `${environment.apiUrl}/restaurants/${encodeURIComponent(restaurantId)}/tables`;
  }

  getTables(restaurantId: string): Observable<Table[]> {
    return this.http.get<Table[]>(this.tablesUrl(restaurantId));
  }

  updateStatus(restaurantId: string, tableId: string, dto: UpdateTableStatusDto): Observable<Table> {
    return this.http.patch<Table>(
      `${this.tablesUrl(restaurantId)}/${encodeURIComponent(tableId)}/status`,
      dto
    );
  }

  getCurrentOrders(restaurantId: string, tableId: string): Observable<Order[]> {
    return this.http.get<Order[]>(
      `${this.tablesUrl(restaurantId)}/${encodeURIComponent(tableId)}/orders`
    );
  }
}
