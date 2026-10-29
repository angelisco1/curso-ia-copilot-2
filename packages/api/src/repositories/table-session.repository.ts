import { Database } from '@config/database.js'
import type { DbExecutor } from '@config/database.js'
import { SELECT_TABLE, toTable, isUniqueViolation } from '@repositories/table.repository.js'
import type { TableRow } from '@repositories/table.repository.js'
import {
    TableNotFoundError,
    TableNotAvailableError,
    TableCapacityExceededError,
    ActiveTableSessionExistsError
} from '@errors/DomainErrors.js'
import type { TableSession } from '@models/table-session.model.js'
import type { RestaurantTable } from '@models/table.model.js'

export interface OccupyTableParams {
    id: string
    restaurantId: string
    tableId: string
    clientId: string
    partySize: number
}

export interface TableOccupancy {
    session: TableSession
    table: RestaurantTable
}

export interface TableSessionRepository {
    occupy(params: OccupyTableParams): Promise<TableOccupancy & { created: boolean }>
    findActiveByClient(restaurantId: string, clientId: string): Promise<TableOccupancy | null>
    findById(sessionId: string): Promise<TableSession | null>
}

interface SessionRow {
    id: string
    restaurant_id: string
    table_id: string
    client_id: string | null
    party_size: number | null
    started_at: string
    ended_at: string | null
}

export function toSession(row: SessionRow): TableSession {
    return {
        id: row.id,
        restaurantId: row.restaurant_id,
        tableId: row.table_id,
        clientId: row.client_id,
        partySize: row.party_size,
        startedAt: row.started_at,
        endedAt: row.ended_at
    }
}

async function readTable(executor: DbExecutor, restaurantId: string, tableId: string): Promise<RestaurantTable | null> {
    const row = await executor.get<TableRow>(
        `${SELECT_TABLE} WHERE t.id = ? AND t.restaurant_id = ? AND t.deleted_at IS NULL`,
        [tableId, restaurantId]
    )
    return row ? toTable(row) : null
}

export class SqliteTableSessionRepository implements TableSessionRepository {
    constructor(private readonly db: Database) {}

    async occupy(params: OccupyTableParams): Promise<TableOccupancy & { created: boolean }> {
        try {
            return await this.db.transaction(async tx => {
                const table = await readTable(tx, params.restaurantId, params.tableId)
                if (!table) throw new TableNotFoundError()

                const existing = await tx.get<SessionRow>(
                    'SELECT * FROM table_sessions WHERE restaurant_id = ? AND client_id = ? AND ended_at IS NULL',
                    [params.restaurantId, params.clientId]
                )
                if (existing) {
                    if (existing.table_id === params.tableId && existing.party_size === params.partySize) {
                        return { session: toSession(existing), table, created: false }
                    }
                    throw new ActiveTableSessionExistsError()
                }

                if (table.status !== 'libre') throw new TableNotAvailableError()
                if (table.capacity < params.partySize) throw new TableCapacityExceededError()

                const update = await tx.run(
                    `UPDATE restaurant_tables SET status = 'ocupada', updated_at = ?
                     WHERE id = ? AND status = 'libre' AND deleted_at IS NULL`,
                    [new Date().toISOString(), params.tableId]
                )
                if (update.changes === 0) throw new TableNotAvailableError()

                const startedAt = new Date().toISOString()
                await tx.run(
                    `INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at, ended_at)
                     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
                    [params.id, params.restaurantId, params.tableId, params.clientId, params.partySize, startedAt]
                )

                const occupied = await readTable(tx, params.restaurantId, params.tableId)
                if (!occupied) throw new TableNotFoundError()
                return {
                    session: {
                        id: params.id,
                        restaurantId: params.restaurantId,
                        tableId: params.tableId,
                        clientId: params.clientId,
                        partySize: params.partySize,
                        startedAt,
                        endedAt: null
                    },
                    table: occupied,
                    created: true
                }
            })
        } catch (error) {
            // Las restricciones unicas son la ultima barrera ante cualquier carrera no prevista
            if (isUniqueViolation(error) && String((error as Error).message).includes('table_sessions.')) {
                if (String((error as Error).message).includes('client_id')) throw new ActiveTableSessionExistsError()
                if (String((error as Error).message).includes('table_id')) throw new TableNotAvailableError()
            }
            throw error
        }
    }

    async findActiveByClient(restaurantId: string, clientId: string): Promise<TableOccupancy | null> {
        const row = await this.db.get<SessionRow>(
            'SELECT * FROM table_sessions WHERE restaurant_id = ? AND client_id = ? AND ended_at IS NULL',
            [restaurantId, clientId]
        )
        if (!row) return null
        const tableRow = await this.db.get<TableRow>(`${SELECT_TABLE} WHERE t.id = ?`, [row.table_id])
        if (!tableRow) return null
        return { session: toSession(row), table: toTable(tableRow) }
    }

    async findById(sessionId: string): Promise<TableSession | null> {
        const row = await this.db.get<SessionRow>('SELECT * FROM table_sessions WHERE id = ?', [sessionId])
        return row ? toSession(row) : null
    }
}
