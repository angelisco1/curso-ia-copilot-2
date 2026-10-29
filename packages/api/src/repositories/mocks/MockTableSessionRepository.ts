import type { OccupyTableParams, TableOccupancy, TableSessionRepository } from '@repositories/table-session.repository.js'
import type { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import type { TableSession } from '@models/table-session.model.js'
import {
    TableNotFoundError,
    TableNotAvailableError,
    TableCapacityExceededError,
    ActiveTableSessionExistsError
} from '@errors/DomainErrors.js'

/** Modela las reglas de ocupacion en memoria; la atomicidad real se prueba contra SQLite (T07/T08). */
export class MockTableSessionRepository implements TableSessionRepository {
    sessions: TableSession[] = []

    constructor(private readonly tables: MockTableRepository) {}

    async occupy(params: OccupyTableParams): Promise<TableOccupancy & { created: boolean }> {
        const table = await this.tables.findById(params.restaurantId, params.tableId)
        if (!table) throw new TableNotFoundError()
        const existing = this.sessions.find(s => s.restaurantId === params.restaurantId && s.clientId === params.clientId && s.endedAt === null)
        if (existing) {
            if (existing.tableId === params.tableId && existing.partySize === params.partySize) {
                return { session: { ...existing }, table, created: false }
            }
            throw new ActiveTableSessionExistsError()
        }
        if (table.status !== 'libre') throw new TableNotAvailableError()
        if (table.capacity < params.partySize) throw new TableCapacityExceededError()
        const updated = (await this.tables.changeStatus(params.restaurantId, params.tableId, 'ocupada'))!
        const session: TableSession = {
            id: params.id,
            restaurantId: params.restaurantId,
            tableId: params.tableId,
            clientId: params.clientId,
            partySize: params.partySize,
            startedAt: new Date().toISOString(),
            endedAt: null
        }
        this.sessions.push(session)
        this.tables.activePartySize.set(params.tableId, params.partySize)
        return { session: { ...session }, table: updated, created: true }
    }

    async findActiveByClient(restaurantId: string, clientId: string): Promise<TableOccupancy | null> {
        const session = this.sessions.find(s => s.restaurantId === restaurantId && s.clientId === clientId && s.endedAt === null)
        if (!session) return null
        const table = await this.tables.findById(restaurantId, session.tableId)
        return table ? { session: { ...session }, table } : null
    }

    async findById(sessionId: string): Promise<TableSession | null> {
        const session = this.sessions.find(s => s.id === sessionId)
        return session ? { ...session } : null
    }
}
