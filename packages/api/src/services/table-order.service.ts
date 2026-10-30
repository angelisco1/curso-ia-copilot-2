import type { TableRepository } from '@repositories/table.repository.js'
import type { OrderRepository } from '@repositories/order.repository.js'
import type { RestaurantRepository } from '@repositories/restaurant.repository.js'
import type { Actor } from '@models/actor.model.js'
import type { Order } from '@models/order.model.js'
import { ForbiddenRestaurantError, RestaurantNotFoundError, TableNotFoundError } from '@errors/DomainErrors.js'

export class TableOrderService {
    constructor(
        private readonly tableRepository: TableRepository,
        private readonly orderRepository: OrderRepository,
        private readonly restaurantRepository: RestaurantRepository
    ) {}

    /** Pedidos de la visita (sesion abierta) de la mesa; sin sesion abierta no hay pedidos que mostrar. */
    async listCurrent(actor: Actor, restaurantId: string, tableId: string): Promise<Order[]> {
        const isStaff = actor.role === 'manager' || actor.role === 'camarero'
        if (actor.role !== 'admin' && !(isStaff && actor.restaurantId === restaurantId)) {
            throw new ForbiddenRestaurantError()
        }
        if (!(await this.restaurantRepository.findById(restaurantId))) throw new RestaurantNotFoundError()
        const table = await this.tableRepository.findById(restaurantId, tableId)
        if (!table) throw new TableNotFoundError()
        if (table.activeSessionId === null) return []
        return this.orderRepository.findBySession(table.activeSessionId)
    }
}
