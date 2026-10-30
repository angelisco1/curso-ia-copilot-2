import { Injectable, inject, signal, computed } from '@angular/core';
import { Order, OrderStatus } from '../models/order.model';
import { OrderService } from '../services/order.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OrderStore {
  private readonly orderService = inject(OrderService);

  private readonly _orders = signal<Order[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  /** Invalida respuestas en vuelo al cambiar de restaurante o parar el polling. */
  private generation = 0;

  readonly orders = this._orders.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async loadOrders(restaurantId: string): Promise<void> {
    const gen = this.generation;
    this._loading.set(true);
    this._error.set(null);
    try {
      const orders = await firstValueFrom(this.orderService.getActiveOrders(restaurantId));
      if (gen !== this.generation) return;
      this._orders.set(orders);
    } catch (err: any) {
      if (gen !== this.generation) return;
      this._error.set(err.message || 'Error al cargar pedidos');
    } finally {
      if (gen === this.generation) this._loading.set(false);
    }
  }

  async updateItemStatus(orderId: string, itemId: string, status: OrderStatus): Promise<void> {
    try {
      await firstValueFrom(this.orderService.updateItemStatus(orderId, itemId, { status }));
      this._orders.update(orders => 
        orders.map(order => {
          if (order.id === orderId) {
            return {
              ...order,
              items: order.items.map(item => 
                item.id === itemId ? { ...item, status } : item
              )
            };
          }
          return order;
        })
      );
    } catch (err: any) {
      this._error.set(err.message || 'Error al actualizar estado');
    }
  }

  clear(): void {
    this._orders.set([]);
    this._error.set(null);
  }

  startPolling(restaurantId: string): void {
    this.stopPolling();
    this._orders.set([]);
    this._error.set(null);
    this.loadOrders(restaurantId);
    this.pollingInterval = setInterval(() => {
      this.loadOrders(restaurantId);
    }, 30000);
  }

  stopPolling(): void {
    this.generation++;
    this._loading.set(false);
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
