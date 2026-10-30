import type { AvailableTable, NewTable, TableRepository } from '@repositories/table.repository.js'
import type { RestaurantTable, TableInput, TableStatus } from '@models/table.model.js'
import { TableNumberConflictError, TableCapacityConflictError } from '@errors/DomainErrors.js'

/** Repositorio en memoria; modela unicidad de numero, borrado logico y grupo activo, no la atomicidad SQL. */
export class MockTableRepository implements TableRepository {
    tables: RestaurantTable[] = []
    deleted = new Set<string>()
    /** tableId -> partySize de la sesion de cliente activa */
    activePartySize = new Map<string, number>()
    private sessionCounter = 0

    private live(restaurantId: string, tableId: string): RestaurantTable | undefined {
        return this.tables.find(t => t.id === tableId && t.restaurantId === restaurantId && !this.deleted.has(t.id))
    }

    private numberTaken(restaurantId: string, number: number, exceptId?: string): boolean {
        return this.tables.some(t => t.restaurantId === restaurantId && t.number === number && t.id !== exceptId && !this.deleted.has(t.id))
    }

    private applyStatus(table: RestaurantTable, status: TableStatus): void {
        if (table.status === status) return
        table.status = status
        table.activeSessionId = status === 'ocupada' ? `session-${++this.sessionCounter}` : null
        if (status !== 'ocupada') this.activePartySize.delete(table.id)
    }

    async create(table: NewTable): Promise<RestaurantTable> {
        if (this.numberTaken(table.restaurantId, table.number)) throw new TableNumberConflictError()
        const created: RestaurantTable = { ...table, activeSessionId: null }
        this.tables.push(created)
        if (table.status === 'ocupada') {
            created.status = 'libre'
            this.applyStatus(created, 'ocupada')
        }
        return { ...created }
    }

    async findById(restaurantId: string, tableId: string): Promise<RestaurantTable | null> {
        const table = this.live(restaurantId, tableId)
        return table ? { ...table } : null
    }

    async findByRestaurant(restaurantId: string): Promise<RestaurantTable[]> {
        return this.tables
            .filter(t => t.restaurantId === restaurantId && !this.deleted.has(t.id))
            .sort((a, b) => a.number - b.number)
            .map(t => ({ ...t }))
    }

    async findAvailable(restaurantId: string, partySize: number): Promise<AvailableTable[]> {
        return this.tables
            .filter(t => t.restaurantId === restaurantId && !this.deleted.has(t.id) && t.status === 'libre' && t.capacity >= partySize)
            .sort((a, b) => a.capacity - b.capacity || a.number - b.number)
            .map(t => ({ id: t.id, number: t.number, description: t.description, capacity: t.capacity }))
    }

    async replace(restaurantId: string, tableId: string, input: TableInput): Promise<RestaurantTable | null> {
        const table = this.live(restaurantId, tableId)
        if (!table) return null
        const party = this.activePartySize.get(tableId)
        if (input.status === 'ocupada' && party !== undefined && input.capacity < party) throw new TableCapacityConflictError()
        if (this.numberTaken(restaurantId, input.number, tableId)) throw new TableNumberConflictError()
        table.number = input.number
        table.description = input.description
        table.capacity = input.capacity
        this.applyStatus(table, input.status)
        return { ...table }
    }

    async changeStatus(restaurantId: string, tableId: string, status: TableStatus): Promise<RestaurantTable | null> {
        const table = this.live(restaurantId, tableId)
        if (!table) return null
        this.applyStatus(table, status)
        return { ...table }
    }

    async delete(restaurantId: string, tableId: string): Promise<boolean> {
        const table = this.live(restaurantId, tableId)
        if (!table) return false
        this.deleted.add(tableId)
        this.activePartySize.delete(tableId)
        return true
    }
}
