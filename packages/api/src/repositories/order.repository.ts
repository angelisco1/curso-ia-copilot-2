import { Database } from '@config/database.js'
import type { DbExecutor } from '@config/database.js'
import {
    TableSessionNotFoundError, TableSessionForbiddenError, TableSessionClosedError, TableSessionMismatchError
} from '@errors/DomainErrors.js'
import type { Order, OrderItem } from '@models/order.model.js'
import { normalizeOrderStatus } from '@models/order.model.js'

interface OrderRow {
    id: string
    restaurant_id: string
    table_id: string | null
    client_id: string | null
    created_at: string
    table_session_id: string | null
    table_number: number | null
    table_session_ended_at: string | null
}

interface OrderRowWithRestaurant extends OrderRow {
    restaurant_name: string
    restaurant_logo_url: string | null
}

interface OrderItemRow {
    id: string
    order_id: string
    dish_id: string
    quantity: number
    notes: string | null
    status: string
}

interface OrderItemWithDishRow extends OrderItemRow {
    dish_name: string
    dish_price: number
    dish_category: string
}

const SELECT_ORDER = `SELECT o.*, rt.number AS table_number, ts.ended_at AS table_session_ended_at`
const JOIN_SESSION = `LEFT JOIN table_sessions ts ON ts.id = o.table_session_id
             LEFT JOIN restaurant_tables rt ON rt.id = ts.table_id`

interface SessionRow {
    restaurant_id: string
    table_id: string
    client_id: string | null
    ended_at: string | null
    table_number: number
}

async function insertOrder(exec: DbExecutor, order: Order): Promise<void> {
    await exec.run(
        'INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at, table_session_id) VALUES (?, ?, ?, ?, ?, ?)',
        [order.id, order.restaurantId, order.tableId, order.clientId, order.createdAt.toISOString(), order.tableSessionId]
    )
    for (const item of order.items) {
        await exec.run(
            'INSERT INTO order_items (id, order_id, dish_id, quantity, notes, status) VALUES (?, ?, ?, ?, ?, ?)',
            [item.id, order.id, item.dishId, item.quantity, item.notes, item.status]
        )
    }
}

function sessionFields(row: OrderRow) {
    return {
        tableSessionId: row.table_session_id,
        tableNumber: row.table_number,
        tableSessionEndedAt: row.table_session_ended_at
    }
}

export interface OrderRepository {
    create(order: Order): Promise<void>
    findById(id: string): Promise<Order | null>
    updateItemStatus(orderId: string, itemId: string, status: string): Promise<void>
    findActiveByRestaurant(restaurantId: string): Promise<Order[]>
    findByClientId(clientId: string): Promise<Order[]>
    findBySession(sessionId: string): Promise<Order[]>
    /**
     * Valida la sesion y escribe el pedido en una unica transaccion: ningun pedido
     * puede crearse sobre una sesion cerrada. El servidor fija `tableId` desde la sesion.
     */
    createInSession(order: Order, rules: SessionOrderRules): Promise<Order>
}

export interface SessionOrderRules {
    /** Si se indica, la sesion debe pertenecer a este cliente. */
    ownerId: string | null
    /** `tableId` enviado por el actor; si existe debe coincidir con la mesa de la sesion. */
    requestedTableId: string | null
}

export class SqliteOrderRepository implements OrderRepository {
    constructor(private readonly db: Database) {}

    async create(order: Order): Promise<void> {
        await insertOrder(this.db, order)
    }

    async findById(id: string): Promise<Order | null> {
        const orderRow = await this.db.get<OrderRowWithRestaurant>(
            `${SELECT_ORDER}, r.name as restaurant_name, r.logo_url as restaurant_logo_url
             FROM orders o
             ${JOIN_SESSION}
             LEFT JOIN restaurants r ON o.restaurant_id = r.id
             WHERE o.id = ?`,
            [id]
        )
        if (!orderRow) return null

        const items = await this.getOrderItems(id)

        return {
            id: orderRow.id,
            restaurantId: orderRow.restaurant_id,
            tableId: orderRow.table_id,
            clientId: orderRow.client_id,
            createdAt: new Date(orderRow.created_at),
            items,
            ...sessionFields(orderRow),
            restaurantName: orderRow.restaurant_name,
            restaurantLogoUrl: orderRow.restaurant_logo_url
        }
    }

    async updateItemStatus(orderId: string, itemId: string, status: string): Promise<void> {
        await this.db.run(
            'UPDATE order_items SET status = ? WHERE id = ? AND order_id = ?',
            [status, itemId, orderId]
        )
    }

    async findActiveByRestaurant(restaurantId: string): Promise<Order[]> {
        const query = `
            ${SELECT_ORDER}
            FROM orders o
            ${JOIN_SESSION}
            WHERE o.restaurant_id = ? AND EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND x.status != 'entregado')
            ORDER BY o.created_at ASC
        `
        const orderRows = await this.db.all<OrderRow>(query, [restaurantId])

        const orders: Order[] = []
        for (const row of orderRows) {
            const items = await this.getOrderItems(row.id)
            orders.push({
                id: row.id,
                restaurantId: row.restaurant_id,
                tableId: row.table_id,
                clientId: row.client_id,
                createdAt: new Date(row.created_at),
                items,
                ...sessionFields(row)
            })
        }

        return orders
    }

    async findByClientId(clientId: string): Promise<Order[]> {
        const orderRows = await this.db.all<OrderRowWithRestaurant>(
            `${SELECT_ORDER}, r.name as restaurant_name, r.logo_url as restaurant_logo_url
             FROM orders o
             ${JOIN_SESSION}
             LEFT JOIN restaurants r ON o.restaurant_id = r.id
             WHERE o.client_id = ?
             ORDER BY o.created_at DESC`,
            [clientId]
        )

        const orders: Order[] = []
        for (const row of orderRows) {
            const items = await this.getOrderItems(row.id)
            orders.push({
                id: row.id,
                restaurantId: row.restaurant_id,
                tableId: row.table_id,
                clientId: row.client_id,
                createdAt: new Date(row.created_at),
                items,
                ...sessionFields(row),
                restaurantName: row.restaurant_name,
                restaurantLogoUrl: row.restaurant_logo_url
            })
        }

        return orders
    }

    async createInSession(order: Order, rules: SessionOrderRules): Promise<Order> {
        return this.db.transaction(async tx => {
            const session = await tx.get<SessionRow>(
                `SELECT ts.restaurant_id, ts.table_id, ts.client_id, ts.ended_at, rt.number AS table_number
                 FROM table_sessions ts JOIN restaurant_tables rt ON rt.id = ts.table_id
                 WHERE ts.id = ?`,
                [order.tableSessionId]
            )
            if (!session) throw new TableSessionNotFoundError()
            if (rules.ownerId !== null && session.client_id !== rules.ownerId) throw new TableSessionForbiddenError()
            if (session.ended_at !== null) throw new TableSessionClosedError()
            if (session.restaurant_id !== order.restaurantId) throw new TableSessionMismatchError()
            if (rules.requestedTableId !== null && rules.requestedTableId !== session.table_id) {
                throw new TableSessionMismatchError()
            }
            const stored: Order = { ...order, tableId: session.table_id, tableNumber: session.table_number, tableSessionEndedAt: null }
            await insertOrder(tx, stored)
            return stored
        })
    }

    async findBySession(sessionId: string): Promise<Order[]> {
        const rows = await this.db.all<OrderRow>(
            `${SELECT_ORDER}
             FROM orders o
             ${JOIN_SESSION}
             WHERE o.table_session_id = ?
             ORDER BY o.created_at ASC, o.id ASC`,
            [sessionId]
        )
        const orders: Order[] = []
        for (const row of rows) {
            orders.push({
                id: row.id,
                restaurantId: row.restaurant_id,
                tableId: row.table_id,
                clientId: row.client_id,
                createdAt: new Date(row.created_at),
                items: await this.getOrderItems(row.id),
                ...sessionFields(row)
            })
        }
        return orders
    }

    private async getOrderItems(orderId: string): Promise<OrderItem[]> {
        const itemRows = await this.db.all<OrderItemWithDishRow>(`
            SELECT oi.*, d.name as dish_name, d.price as dish_price, d.category as dish_category
            FROM order_items oi
            LEFT JOIN dishes d ON oi.dish_id = d.id
            WHERE oi.order_id = ?
        `, [orderId])

        return itemRows.map(row => ({
            id: row.id,
            dishId: row.dish_id,
            quantity: row.quantity,
            notes: row.notes,
            status: normalizeOrderStatus(row.status),
            dishName: row.dish_name,
            dishPrice: row.dish_price,
            dishCategory: row.dish_category
        }))
    }
}
