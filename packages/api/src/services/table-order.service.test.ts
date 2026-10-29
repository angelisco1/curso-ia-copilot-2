import { describe, it, expect, beforeEach } from 'vitest'
import { TableOrderService } from './table-order.service.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockRestaurantRepository } from '@repositories/mocks/MockRestaurantRepository.js'
import type { Actor } from '@models/actor.model.js'
import type { Order } from '@models/order.model.js'
import { TableNotFoundError, ForbiddenRestaurantError, RestaurantNotFoundError } from '@errors/DomainErrors.js'

const admin: Actor = { id: 'a', role: 'admin', restaurantId: null }
const waiter: Actor = { id: 'w', role: 'camarero', restaurantId: 'r1' }
const otherWaiter: Actor = { id: 'w2', role: 'camarero', restaurantId: 'r2' }
const cook: Actor = { id: 'k', role: 'cocinero', restaurantId: 'r1' }
const client: Actor = { id: 'c', role: 'cliente', restaurantId: null }

const order = (id: string, sessionId: string | null): Order => ({
    id, restaurantId: 'r1', tableId: 't1', clientId: 'c', createdAt: new Date(), tableSessionId: sessionId,
    tableNumber: 1, tableSessionEndedAt: null, items: []
})

describe('TableOrderService.listCurrent', () => {
    let tables: MockTableRepository
    let orders: MockOrderRepository
    let service: TableOrderService

    beforeEach(async () => {
        tables = new MockTableRepository()
        orders = new MockOrderRepository()
        const restaurants = new MockRestaurantRepository()
        const base = { address: 'a', email: 'e@e.com', phone: '1', ownerFirstName: 'o', ownerLastName: 'w', logoUrl: null, createdAt: '', updatedAt: '' }
        await restaurants.save({ id: 'r1', name: 'R1', ...base })
        await restaurants.save({ id: 'r2', name: 'R2', ...base })
        service = new TableOrderService(tables, orders, restaurants)
    })

    it('mesa libre sin sesion → lista vacia aunque existan pedidos historicos', async () => {
        const t = await tables.create({ id: 't1', restaurantId: 'r1', number: 1, description: '', capacity: 2, status: 'libre' })
        await orders.create(order('old', 's-old'))
        expect(await service.listCurrent(waiter, 'r1', t.id)).toEqual([])
    })

    it('mesa ocupada → solo pedidos de su sesion activa', async () => {
        const t = await tables.create({ id: 't1', restaurantId: 'r1', number: 1, description: '', capacity: 2, status: 'ocupada' })
        await orders.create(order('old', 's-old'))
        await orders.create(order('now', t.activeSessionId))
        expect((await service.listCurrent(admin, 'r1', t.id)).map(o => o.id)).toEqual(['now'])
    })

    it('mesa inexistente o de otro restaurante → TableNotFoundError', async () => {
        const t = await tables.create({ id: 't1', restaurantId: 'r1', number: 1, description: '', capacity: 2, status: 'libre' })
        await expect(service.listCurrent(admin, 'r1', 'nope')).rejects.toBeInstanceOf(TableNotFoundError)
        await expect(service.listCurrent(admin, 'r2', t.id)).rejects.toBeInstanceOf(TableNotFoundError)
    })

    it('permisos: otro restaurante, cocinero y cliente → ForbiddenRestaurantError; restaurante inexistente → 404', async () => {
        const t = await tables.create({ id: 't1', restaurantId: 'r1', number: 1, description: '', capacity: 2, status: 'libre' })
        for (const actor of [otherWaiter, cook, client]) {
            await expect(service.listCurrent(actor, 'r1', t.id)).rejects.toBeInstanceOf(ForbiddenRestaurantError)
        }
        await expect(service.listCurrent(admin, 'nope', t.id)).rejects.toBeInstanceOf(RestaurantNotFoundError)
    })
})
