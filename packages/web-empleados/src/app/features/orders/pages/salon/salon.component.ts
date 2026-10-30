import { Component, inject, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '@resttek/web-shared';
import { RestaurantOption, RestaurantService } from '../../../tables/services/restaurant.service';
import { OrderStore } from '../../store/order.store';
import { TableStore } from '../../../tables/store/table.store';
import { Table, TableStatus, TABLE_STATUSES } from '../../../tables/models/table.model';
import { TableOrdersComponent } from '../../../tables/components/table-orders/table-orders.component';
import { isClosedVisit, tableLabel } from '../../utils/table-label';

@Component({
  selector: 'app-salon',
  standalone: true,
  imports: [TableOrdersComponent],
  templateUrl: './salon.component.html',
  styleUrl: './salon.component.css'
})
export class SalonComponent implements OnInit, OnDestroy {
  private readonly authStore = inject(AuthStore);
  readonly orderStore = inject(OrderStore);
  readonly tableStore = inject(TableStore);
  private readonly restaurantService = inject(RestaurantService);

  private readonly _restaurants = signal<RestaurantOption[]>([]);
  private readonly _restaurantsError = signal<string | null>(null);
  private readonly _selectedRestaurantId = signal<string | null>(null);
  private restaurantsRequest = 0;
  readonly restaurants = this._restaurants.asReadonly();
  readonly restaurantsError = this._restaurantsError.asReadonly();
  readonly selectedRestaurantId = this._selectedRestaurantId.asReadonly();

  readonly statuses = TABLE_STATUSES;
  readonly tableLabel = tableLabel;
  readonly isClosedVisit = isClosedVisit;

  readonly selectedTable = computed(() =>
    this.tableStore.tables().find(t => t.id === this.tableStore.selectedTableId()) ?? null
  );

  ngOnInit(): void {
    const user = this.authStore.user();
    const restaurantId = user?.restaurantId;
    if (restaurantId) {
      // Camarero/manager (y admin con asignación): restaurante del JWT, no seleccionable.
      this.activate(restaurantId);
    } else if (this.authStore.userRole() === 'admin') {
      void this.loadRestaurants();
    }
  }

  ngOnDestroy(): void {
    this.restaurantsRequest++;
    this.orderStore.stopPolling();
    this.tableStore.stopPolling();
  }

  /** Solo admin sin restaurante asignado elige uno. */
  readonly canChooseRestaurant = computed(
    () => this.authStore.userRole() === 'admin' && !this.authStore.user()?.restaurantId
  );

  private activate(restaurantId: string): void {
    this.orderStore.startPolling(restaurantId);
    this.tableStore.startPolling(restaurantId);
  }

  private async loadRestaurants(): Promise<void> {
    const request = ++this.restaurantsRequest;
    this._restaurantsError.set(null);
    try {
      const list = await firstValueFrom(this.restaurantService.getAll());
      if (request === this.restaurantsRequest) this._restaurants.set(list);
    } catch (err: any) {
      if (request === this.restaurantsRequest) {
        this._restaurantsError.set(err?.error?.message || err?.message || 'Error al cargar restaurantes');
      }
    }
  }

  selectRestaurant(restaurantId: string): void {
    if (!this.canChooseRestaurant()) return;
    this._selectedRestaurantId.set(restaurantId || null);
    if (restaurantId) {
      this.activate(restaurantId);
    } else {
      this.orderStore.stopPolling();
      this.tableStore.stopPolling();
      this.orderStore.clear();
      this.tableStore.reset();
    }
  }

  get readyOrders() {
    return this.orderStore.orders().map(order => ({
      ...order,
      items: order.items.filter(item => item.status === 'listo')
    })).filter(order => order.items.length > 0);
  }

  deliver(orderId: string, itemId: string): void {
    this.orderStore.updateItemStatus(orderId, itemId, 'entregado');
  }

  getStatusClass(status: string): string {
    return `badge badge-${status}`;
  }

  isUpdating(table: Table): boolean {
    return this.tableStore.updatingIds().has(table.id);
  }

  openTable(table: Table): void {
    this.tableStore.selectTable(table);
  }

  async changeStatus(table: Table, status: TableStatus): Promise<void> {
    if (status === table.status || this.isUpdating(table)) return;
    if (table.status === 'ocupada') {
      const pending = this.pendingItems(table);
      const warning = pending > 0
        ? `\nHay ${pending} producto(s) sin entregar; no se cancelarán.`
        : '';
      const ok = confirm(
        `¿Cerrar la ocupación de la mesa ${table.number} y marcarla como ${status}?${warning}`
      );
      if (!ok) return;
    }
    await this.tableStore.changeStatus(table, status);
  }

  /** Ítems sin entregar; solo se conocen si el detalle de esa mesa está abierto. */
  private pendingItems(table: Table): number {
    if (this.tableStore.selectedTableId() !== table.id) return 0;
    return this.tableStore
      .detailOrders()
      .flatMap(o => o.items)
      .filter(i => i.status !== 'entregado').length;
  }
}
