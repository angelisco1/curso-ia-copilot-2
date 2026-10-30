import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface RestaurantOption {
  id: string
  name: string
}

/** Solo lo necesario para que admin elija restaurante en salón. */
@Injectable({ providedIn: 'root' })
export class RestaurantService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<RestaurantOption[]> {
    return this.http.get<RestaurantOption[]>(`${environment.apiUrl}/restaurants`);
  }
}
