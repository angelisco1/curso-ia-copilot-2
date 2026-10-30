import type { OrderRepository, SessionOrderRules } from '@repositories/order.repository.js'
import {
    TableSessionNotFoundError, TableSessionForbiddenError, TableSessionClosedError, TableSessionMismatchError
} from '@errors/DomainErrors.js'
import type { Order } from '@models/order.model.js'

export class MockOrderRepository implements OrderRepository {
    orders: Order[] = []
    sessions = new Map<string, { id: string; restaurantId: string; tableId: string; tableNumber: number; clientId: string | null; endedAt: string | null }>()

    async create(order: Order): Promise<void> {
        this.orders.push(order)
    }

    async findById(id: string): Promise<Order | null> {
        return this.orders.find(o => o.id === id) || null
    }

    async updateItemStatus(_orderId: string, _itemId: string, _status: string): Promise<void> {
        // En un repositorio real esto es un UPDATE SQL. El mock no necesita
        // persistir nada porque el service ya muta el item en memoria
        // antes de llamar a este método.
    }

    async findActiveByRestaurant(restaurantId: string): Promise<Order[]> {
        return this.orders.filter(o => o.restaurantId === restaurantId)
    }

    async findByClientId(clientId: string): Promise<Order[]> {
        return this.orders.filter(o => o.clientId === clientId)
    }

    async findBySession(sessionId: string): Promise<Order[]> {
        return this.orders.filter(o => o.tableSessionId === sessionId)
    }

    async createInSession(order: Order, rules: SessionOrderRules): Promise<Order> {
        const session = this.sessions.get(order.tableSessionId ?? '')
        if (!session) throw new TableSessionNotFoundError()
        if (rules.ownerId !== null && session.clientId !== rules.ownerId) throw new TableSessionForbiddenError()
        if (session.endedAt !== null) throw new TableSessionClosedError()
        if (session.restaurantId !== order.restaurantId) throw new TableSessionMismatchError()
        if (rules.requestedTableId !== null && rules.requestedTableId !== session.tableId) throw new TableSessionMismatchError()
        const stored: Order = { ...order, tableId: session.tableId, tableNumber: session.tableNumber, tableSessionEndedAt: null }
        this.orders.push(stored)
        return stored
    }
}
