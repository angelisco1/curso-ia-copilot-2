import { Database } from '@config/database.js'
import type { RestaurantTable, TableInput, TableStatus } from '@models/table.model.js'
import { randomUUID } from 'crypto'
import type { DbExecutor } from '@config/database.js'
import { TableNumberConflictError, TableCapacityConflictError } from '@errors/DomainErrors.js'

export interface AvailableTable {
    id: string
    number: number
    description: string
    capacity: number
}

export type NewTable = TableInput & { id: string; restaurantId: string }

export interface TableRepository {
    create(table: NewTable): Promise<RestaurantTable>
    findById(restaurantId: string, tableId: string): Promise<RestaurantTable | null>
    findByRestaurant(restaurantId: string): Promise<RestaurantTable[]>
    findAvailable(restaurantId: string, partySize: number): Promise<AvailableTable[]>
    replace(restaurantId: string, tableId: string, input: TableInput): Promise<RestaurantTable | null>
    changeStatus(restaurantId: string, tableId: string, status: TableStatus): Promise<RestaurantTable | null>
    delete(restaurantId: string, tableId: string): Promise<boolean>
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
            await this.db.transaction(async tx => {
                await tx.run(
                    `INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [table.id, table.restaurantId, table.number, table.description, table.capacity, table.status, timestamp, timestamp]
                )
                if (table.status === 'ocupada') await openManualSession(tx, table.restaurantId, table.id)
            })
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

    async replace(restaurantId: string, tableId: string, input: TableInput): Promise<RestaurantTable | null> {
        try {
            return await this.db.transaction(async tx => {
                const current = await readTable(tx, restaurantId, tableId)
                if (!current) return null

                if (input.status === 'ocupada') {
                    const active = await tx.get<{ party_size: number | null }>(
                        'SELECT party_size FROM table_sessions WHERE table_id = ? AND ended_at IS NULL', [tableId])
                    if (active?.party_size != null && input.capacity < active.party_size) {
                        throw new TableCapacityConflictError()
                    }
                }

                await tx.run(
                    `UPDATE restaurant_tables SET number = ?, description = ?, capacity = ?, updated_at = ?
                     WHERE id = ? AND restaurant_id = ? AND deleted_at IS NULL`,
                    [input.number, input.description, input.capacity, new Date().toISOString(), tableId, restaurantId]
                )
                await transitionStatus(tx, current, input.status)
                return readTable(tx, restaurantId, tableId)
            })
        } catch (error) {
            if (isUniqueViolation(error)) throw new TableNumberConflictError()
            throw error
        }
    }

    async changeStatus(restaurantId: string, tableId: string, status: TableStatus): Promise<RestaurantTable | null> {
        return this.db.transaction(async tx => {
            const current = await readTable(tx, restaurantId, tableId)
            if (!current) return null
            await transitionStatus(tx, current, status)
            return readTable(tx, restaurantId, tableId)
        })
    }

    async delete(restaurantId: string, tableId: string): Promise<boolean> {
        return this.db.transaction(async tx => {
            const current = await readTable(tx, restaurantId, tableId)
            if (!current) return false
            const timestamp = new Date().toISOString()
            await tx.run('UPDATE table_sessions SET ended_at = ? WHERE table_id = ? AND ended_at IS NULL', [timestamp, tableId])
            await tx.run('UPDATE restaurant_tables SET deleted_at = ?, updated_at = ? WHERE id = ?', [timestamp, timestamp, tableId])
            return true
        })
    }
}

async function readTable(executor: DbExecutor, restaurantId: string, tableId: string): Promise<RestaurantTable | null> {
    const row = await executor.get<TableRow>(
        `${SELECT_TABLE} WHERE t.id = ? AND t.restaurant_id = ? AND t.deleted_at IS NULL`,
        [tableId, restaurantId]
    )
    return row ? toTable(row) : null
}

async function openManualSession(tx: DbExecutor, restaurantId: string, tableId: string): Promise<void> {
    await tx.run(
        `INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at, ended_at)
         VALUES (?, ?, ?, NULL, NULL, ?, NULL)`,
        [randomUUID(), restaurantId, tableId, new Date().toISOString()]
    )
}

/** Aplica la transicion de estado y abre/cierra la sesion; repetir el estado actual no hace nada. */
async function transitionStatus(tx: DbExecutor, current: RestaurantTable, status: TableStatus): Promise<void> {
    if (current.status === status) return
    const timestamp = new Date().toISOString()
    if (current.status === 'ocupada') {
        await tx.run('UPDATE table_sessions SET ended_at = ? WHERE table_id = ? AND ended_at IS NULL', [timestamp, current.id])
    }
    await tx.run('UPDATE restaurant_tables SET status = ?, updated_at = ? WHERE id = ?', [status, timestamp, current.id])
    if (status === 'ocupada') await openManualSession(tx, current.restaurantId, current.id)
}
