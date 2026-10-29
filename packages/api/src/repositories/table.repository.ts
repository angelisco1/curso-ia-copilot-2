import { Database } from '@config/database.js'
import type { RestaurantTable, TableInput, TableStatus } from '@models/table.model.js'
import { TableNumberConflictError } from '@errors/DomainErrors.js'

export interface AvailableTable {
    id: string
    number: number
    description: string
    capacity: number
}

export type NewTable = TableInput & { id: string; restaurantId: string }
export type TableDetails = Pick<TableInput, 'number' | 'description' | 'capacity'>

export interface TableRepository {
    create(table: NewTable): Promise<RestaurantTable>
    findById(restaurantId: string, tableId: string): Promise<RestaurantTable | null>
    findByRestaurant(restaurantId: string): Promise<RestaurantTable[]>
    findAvailable(restaurantId: string, partySize: number): Promise<AvailableTable[]>
    updateDetails(restaurantId: string, tableId: string, details: TableDetails): Promise<RestaurantTable | null>
}

export interface TableRow {
    id: string
    restaurant_id: string
    number: number
    description: string
    capacity: number
    status: TableStatus
    active_session_id: string | null
}

export const SELECT_TABLE = `
    SELECT t.id, t.restaurant_id, t.number, t.description, t.capacity, t.status,
           (SELECT s.id FROM table_sessions s WHERE s.table_id = t.id AND s.ended_at IS NULL) AS active_session_id
    FROM restaurant_tables t
`

export function toTable(row: TableRow): RestaurantTable {
    return {
        id: row.id,
        restaurantId: row.restaurant_id,
        number: row.number,
        description: row.description,
        capacity: row.capacity,
        status: row.status,
        activeSessionId: row.active_session_id
    }
}

export function isUniqueViolation(error: unknown): boolean {
    return error instanceof Error && error.message.includes('UNIQUE constraint failed')
}

export class SqliteTableRepository implements TableRepository {
    constructor(private readonly db: Database) {}

    async create(table: NewTable): Promise<RestaurantTable> {
        const timestamp = new Date().toISOString()
        try {
            await this.db.run(
                `INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [table.id, table.restaurantId, table.number, table.description, table.capacity, table.status, timestamp, timestamp]
            )
        } catch (error) {
            if (isUniqueViolation(error)) throw new TableNumberConflictError()
            throw error
        }
        const created = await this.findById(table.restaurantId, table.id)
        if (!created) throw new Error('Table was not persisted')
        return created
    }

    async findById(restaurantId: string, tableId: string): Promise<RestaurantTable | null> {
        const row = await this.db.get<TableRow>(
            `${SELECT_TABLE} WHERE t.id = ? AND t.restaurant_id = ? AND t.deleted_at IS NULL`,
            [tableId, restaurantId]
        )
        return row ? toTable(row) : null
    }

    async findByRestaurant(restaurantId: string): Promise<RestaurantTable[]> {
        const rows = await this.db.all<TableRow>(
            `${SELECT_TABLE} WHERE t.restaurant_id = ? AND t.deleted_at IS NULL ORDER BY t.number ASC`,
            [restaurantId]
        )
        return rows.map(toTable)
    }

    async findAvailable(restaurantId: string, partySize: number): Promise<AvailableTable[]> {
        return this.db.all<AvailableTable>(
            `SELECT id, number, description, capacity
             FROM restaurant_tables
             WHERE restaurant_id = ? AND deleted_at IS NULL AND status = 'libre' AND capacity >= ?
             ORDER BY capacity ASC, number ASC`,
            [restaurantId, partySize]
        )
    }

    async updateDetails(restaurantId: string, tableId: string, details: TableDetails): Promise<RestaurantTable | null> {
        let changes: number
        try {
            const result = await this.db.run(
                `UPDATE restaurant_tables SET number = ?, description = ?, capacity = ?, updated_at = ?
                 WHERE id = ? AND restaurant_id = ? AND deleted_at IS NULL`,
                [details.number, details.description, details.capacity, new Date().toISOString(), tableId, restaurantId]
            )
            changes = result.changes
        } catch (error) {
            if (isUniqueViolation(error)) throw new TableNumberConflictError()
            throw error
        }
        if (changes === 0) return null
        return this.findById(restaurantId, tableId)
    }
}
