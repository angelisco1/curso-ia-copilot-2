import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Table, TableStatus } from '../models/table.model';
import { Order } from '../../orders/models/order.model';
import { TableService } from '../services/table.service';

const POLLING_MS = 30000;

@Injectable({ providedIn: 'root' })
export class TableStore {
  private readonly service = inject(TableService);

  private readonly _tables = signal<Table[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _updatingIds = signal<ReadonlySet<string>>(new Set());
  private readonly _statusError = signal<string | null>(null);
  private readonly _selectedTableId = signal<string | null>(null);
  private readonly _detailOrders = signal<Order[]>([]);
  private readonly _detailLoading = signal(false);
  private readonly _detailError = signal<string | null>(null);

  readonly tables = this._tables.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly updatingIds = this._updatingIds.asReadonly();
  readonly statusError = this._statusError.asReadonly();
  readonly selectedTableId = this._selectedTableId.asReadonly();
  readonly detailOrders = this._detailOrders.asReadonly();
  readonly detailLoading = this._detailLoading.asReadonly();
  readonly detailError = this._detailError.asReadonly();

  private restaurantId: string | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  /** Incrementa al cambiar de restaurante o parar: invalida respuestas en vuelo. */
  private generation = 0;
  /** Incrementa en cada petición de detalle: solo vale la última. */
  private detailRequest = 0;

  startPolling(restaurantId: string): void {
    this.stopPolling();
    this.restaurantId = restaurantId;
    this._tables.set([]);
    this._error.set(null);
    this._statusError.set(null);
    this.clearDetail();
    void this.loadTables();
    this.pollingInterval = setInterval(() => void this.loadTables(), POLLING_MS);
  }

  reset(): void {
    this._tables.set([]);
    this._error.set(null);
    this._statusError.set(null);
    this.clearDetail();
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.generation++;
    this.detailRequest++;
    this.restaurantId = null;
    this._loading.set(false);
    this._updatingIds.set(new Set());
  }

  async loadTables(): Promise<void> {
    const restaurantId = this.restaurantId;
    if (!restaurantId) return;
    const gen = this.generation;
    if (this._tables().length === 0) this._loading.set(true);
    try {
      const tables = await firstValueFrom(this.service.getTables(restaurantId));
      if (gen !== this.generation) return;
      this._tables.set(tables);
      this._error.set(null);
      this.syncDetail(tables);
    } catch (err: any) {
      if (gen !== this.generation) return;
      this._error.set(err?.error?.message || err?.message || 'Error al cargar las mesas');
    } finally {
      if (gen === this.generation) this._loading.set(false);
    }
  }

  async changeStatus(table: Table, status: TableStatus): Promise<boolean> {
    const restaurantId = this.restaurantId;
    if (!restaurantId || this._updatingIds().has(table.id)) return false;
    const gen = this.generation;
    this._statusError.set(null);
    this.setUpdating(table.id, true);
    try {
      const updated = await firstValueFrom(
        this.service.updateStatus(restaurantId, table.id, { status })
      );
      if (gen !== this.generation) return false;
      this._tables.update(list => list.map(t => (t.id === updated.id ? updated : t)));
      this.syncDetail(this._tables());
      return true;
    } catch (err: any) {
      if (gen === this.generation) {
        this._statusError.set(
          err?.error?.message || err?.message || `No se pudo cambiar la mesa ${table.number}`
        );
      }
      return false;
    } finally {
      if (gen === this.generation) this.setUpdating(table.id, false);
    }
  }

  selectTable(table: Table): void {
    this._selectedTableId.set(table.id);
    this._detailOrders.set([]);
    this._detailError.set(null);
    void this.loadDetail(table);
  }

  clearDetail(): void {
    this.detailRequest++;
    this._selectedTableId.set(null);
    this._detailOrders.set([]);
    this._detailError.set(null);
    this._detailLoading.set(false);
  }

  /** Mantiene el detalle coherente con la mesa y la sesión actuales. */
  private syncDetail(tables: Table[]): void {
    const selectedId = this._selectedTableId();
    if (!selectedId) return;
    const table = tables.find(t => t.id === selectedId);
    if (!table) {
      this.clearDetail();
      return;
    }
    if (!table.activeSessionId) {
      this.detailRequest++;
      this._detailOrders.set([]);
      this._detailError.set(null);
      this._detailLoading.set(false);
      return;
    }
    const current = this._detailOrders();
    const sameSession =
      current.length > 0 && current.every(o => o.tableSessionId === table.activeSessionId);
    if (!sameSession) this._detailOrders.set([]);
    void this.loadDetail(table);
  }

  private async loadDetail(table: Table): Promise<void> {
    const restaurantId = this.restaurantId;
    if (!restaurantId || !table.activeSessionId) {
      this._detailLoading.set(false);
      return;
    }
    const gen = this.generation;
    const request = ++this.detailRequest;
    const sessionId = table.activeSessionId;
    const isStale = () =>
      gen !== this.generation ||
      request !== this.detailRequest ||
      this._selectedTableId() !== table.id ||
      this._tables().find(t => t.id === table.id)?.activeSessionId !== sessionId;
    if (this._detailOrders().length === 0) this._detailLoading.set(true);
    try {
      const orders = await firstValueFrom(this.service.getCurrentOrders(restaurantId, table.id));
      if (isStale()) return;
      this._detailOrders.set(orders);
      this._detailError.set(null);
    } catch (err: any) {
      if (isStale()) return;
      this._detailError.set(err?.error?.message || err?.message || 'Error al cargar los pedidos');
    } finally {
      if (!isStale()) this._detailLoading.set(false);
    }
  }

  private setUpdating(id: string, on: boolean): void {
    this._updatingIds.update(set => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
