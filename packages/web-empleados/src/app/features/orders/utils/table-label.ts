import { Order } from '../models/order.model';

/** Número visible de mesa; recurre a tableId para pedidos antiguos sin tableNumber. */
export function tableLabel(order: Pick<Order, 'tableId' | 'tableNumber'>): string | null {
  if (order.tableNumber != null) return String(order.tableNumber);
  return order.tableId ?? null;
}

export function isClosedVisit(order: Pick<Order, 'tableSessionEndedAt'>): boolean {
  return !!order.tableSessionEndedAt;
}
