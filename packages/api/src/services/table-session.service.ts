import { randomUUID } from 'crypto'
import type { TableRepository, AvailableTable } from '@repositories/table.repository.js'
import type { TableSessionRepository, TableOccupancy } from '@repositories/table-session.repository.js'
import type { RestaurantRepository } from '@repositories/restaurant.repository.js'
import type { Actor } from '@models/actor.model.js'
import { parseConfirmOccupancyInput, parsePartySize } from '@models/table-session.model.js'
import { ForbiddenRoleError, InvalidPartySizeError, RestaurantNotFoundError } from '@errors/DomainErrors.js'

export interface OccupationResult {
    occupancy: TableOccupancy
    created: boolean
}

export class TableSessionService {
    constructor(
        private readonly tableRepository: TableRepository,
        private readonly sessionRepository: TableSessionRepository,
        private readonly restaurantRepository: RestaurantRepository
    ) {}

    async listAvailable(actor: Actor, restaurantId: string, partySize: unknown): Promise<AvailableTable[]> {
        this.assertClient(actor)
        await this.assertRestaurantExists(restaurantId)
        return this.tableRepository.findAvailable(restaurantId, parseQueryPartySize(partySize))
    }

    async confirm(actor: Actor, restaurantId: string, body: unknown): Promise<OccupationResult> {
        this.assertClient(actor)
        await this.assertRestaurantExists(restaurantId)
        const { tableId, partySize } = parseConfirmOccupancyInput(body)
        const { created, ...occupancy } = await this.sessionRepository.occupy({
            id: randomUUID(),
            restaurantId,
            tableId,
            clientId: actor.id,
            partySize
        })
        return { occupancy, created }
    }

    async current(actor: Actor, restaurantId: string): Promise<TableOccupancy | null> {
        this.assertClient(actor)
        await this.assertRestaurantExists(restaurantId)
        return this.sessionRepository.findActiveByClient(restaurantId, actor.id)
    }

    private assertClient(actor: Actor): void {
        if (actor.role !== 'cliente') throw new ForbiddenRoleError()
    }

    private async assertRestaurantExists(restaurantId: string): Promise<void> {
        const restaurant = await this.restaurantRepository.findById(restaurantId)
        if (!restaurant) throw new RestaurantNotFoundError()
    }
}

/** Acepta el entero positivo de la query string (`"3"`) o un numero; todo lo demas es invalido. */
function parseQueryPartySize(value: unknown): number {
    if (typeof value === 'string') {
        if (!/^[1-9]\d*$/.test(value)) throw new InvalidPartySizeError()
        const parsed = Number(value)
        if (!Number.isSafeInteger(parsed)) throw new InvalidPartySizeError()
        return parsed
    }
    return parsePartySize(value)
}
