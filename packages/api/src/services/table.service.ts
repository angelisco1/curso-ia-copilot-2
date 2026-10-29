import { randomUUID } from 'crypto'
import type { TableRepository } from '@repositories/table.repository.js'
import type { RestaurantRepository } from '@repositories/restaurant.repository.js'
import type { RestaurantTable } from '@models/table.model.js'
import { parseCreateTableInput, parseReplaceTableInput } from '@models/table.model.js'
import { parseStatusChangeInput } from '@models/table-session.model.js'
import type { Actor } from '@models/actor.model.js'
import {
    RestaurantNotFoundError,
    TableNotFoundError,
    ForbiddenRestaurantError,
    ForbiddenRoleError
} from '@errors/DomainErrors.js'

export class TableService {
    constructor(
        private readonly tableRepository: TableRepository,
        private readonly restaurantRepository: RestaurantRepository
    ) {}

    async create(actor: Actor, restaurantId: string, body: unknown): Promise<RestaurantTable> {
        this.assertAdmin(actor)
        await this.assertRestaurantExists(restaurantId)
        const input = parseCreateTableInput(body)
        return this.tableRepository.create({ ...input, id: randomUUID(), restaurantId })
    }

    async list(actor: Actor, restaurantId: string): Promise<RestaurantTable[]> {
        await this.authorizeStaff(actor, restaurantId)
        return this.tableRepository.findByRestaurant(restaurantId)
    }

    async get(actor: Actor, restaurantId: string, tableId: string): Promise<RestaurantTable> {
        await this.authorizeStaff(actor, restaurantId)
        const table = await this.tableRepository.findById(restaurantId, tableId)
        if (!table) throw new TableNotFoundError()
        return table
    }

    async replace(actor: Actor, restaurantId: string, tableId: string, body: unknown): Promise<RestaurantTable> {
        this.assertAdmin(actor)
        await this.assertRestaurantExists(restaurantId)
        const input = parseReplaceTableInput(body)
        const table = await this.tableRepository.replace(restaurantId, tableId, input)
        if (!table) throw new TableNotFoundError()
        return table
    }

    async changeStatus(actor: Actor, restaurantId: string, tableId: string, body: unknown): Promise<RestaurantTable> {
        await this.authorizeStaff(actor, restaurantId)
        const status = parseStatusChangeInput(body)
        const table = await this.tableRepository.changeStatus(restaurantId, tableId, status)
        if (!table) throw new TableNotFoundError()
        return table
    }

    async delete(actor: Actor, restaurantId: string, tableId: string): Promise<void> {
        this.assertAdmin(actor)
        await this.assertRestaurantExists(restaurantId)
        const deleted = await this.tableRepository.delete(restaurantId, tableId)
        if (!deleted) throw new TableNotFoundError()
    }

    private assertAdmin(actor: Actor): void {
        if (actor.role !== 'admin') throw new ForbiddenRoleError()
    }

    private async assertRestaurantExists(restaurantId: string): Promise<void> {
        const restaurant = await this.restaurantRepository.findById(restaurantId)
        if (!restaurant) throw new RestaurantNotFoundError()
    }

    /** Admin en cualquier restaurante; manager/camarero solo en el suyo; el resto no accede. */
    private async authorizeStaff(actor: Actor, restaurantId: string): Promise<void> {
        const isStaff = actor.role === 'manager' || actor.role === 'camarero'
        if (actor.role !== 'admin' && !(isStaff && actor.restaurantId === restaurantId)) {
            throw new ForbiddenRestaurantError()
        }
        await this.assertRestaurantExists(restaurantId)
    }
}
