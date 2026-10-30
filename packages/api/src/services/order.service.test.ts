import { describe, it, expect, beforeEach } from 'vitest'
import { OrderService, type CreateOrderRequest } from './order.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import type { Order } from '@models/order.model.js'
import {
    OrderNotFoundError, InvalidOrderStatusError, RestaurantIdRequiredError, TableSessionRequiredError,
    TableSessionNotFoundError, TableSessionForbiddenError, TableSessionClosedError, TableSessionMismatchError
} from '@errors/DomainErrors.js'

describe('OrderService.updateItemStatus', () => {
    let repo: MockOrderRepository
    let service: OrderService
    let testOrder: Order

    beforeEach(async () => {
        repo = new MockOrderRepository()
        service = new OrderService(repo)

        testOrder = {
            id: 'order-1',
            restaurantId: 'rest-1',
            tableId: null,
            clientId: null,
            createdAt: new Date(),
            tableSessionId: null,
            tableNumber: null,
            tableSessionEndedAt: null,
            items: [
                { id: 'item-1', dishId: 'dish-1', quantity: 1, notes: null, status: 'pendiente' }
            ]
        }
        await repo.create(testOrder)
    })

    it('should update the status of an item successfully', async () => {
        await service.updateItemStatus('order-1', 'item-1', 'preparando')
        const updatedItem = testOrder.items[0]!
        expect(updatedItem.status).toBe('preparando')
    })

    it('should throw an error if the order does not exist', async () => {
        await expect(service.updateItemStatus('order-bad', 'item-1', 'preparando'))
            .rejects.toThrow(OrderNotFoundError)
    })

    it('should throw an error if the item does not exist inside the order', async () => {
        await expect(service.updateItemStatus('order-1', 'item-bad', 'preparando'))
            .rejects.toThrow(OrderNotFoundError)
    })

    it('should throw DomainError if status is invalid', async () => {
        await expect(service.updateItemStatus('order-1', 'item-1', 'invalid-status'))
            .rejects.toThrow(InvalidOrderStatusError)
    })
})

describe('OrderService.create con sesion de mesa', () => {
    let repo: MockOrderRepository
    let service: OrderService

    const request = (over: Partial<CreateOrderRequest> = {}): CreateOrderRequest => ({
        restaurantId: 'rest-1',
        tableId: null,
        clientId: 'c1',
        actorRole: 'cliente',
        tableSessionId: 's1',
        items: [{ dishId: 'd1', quantity: 2, notes: 'sin sal' }, { dishId: 'd2', quantity: 1, notes: null }],
        ...over
    })

    beforeEach(() => {
        repo = new MockOrderRepository()
        service = new OrderService(repo)
        repo.sessions.set('s1', { id: 's1', restaurantId: 'rest-1', tableId: 't1', tableNumber: 4, clientId: 'c1', endedAt: null })
        repo.sessions.set('s-closed', { id: 's-closed', restaurantId: 'rest-1', tableId: 't1', tableNumber: 4, clientId: 'c1', endedAt: '2026-10-29T18:00:00.000Z' })
        repo.sessions.set('s-other', { id: 's-other', restaurantId: 'rest-1', tableId: 't2', tableNumber: 5, clientId: 'c2', endedAt: null })
    })

    it('un cliente con sesion propia abierta crea el pedido: un item por unidad y mesa fijada por el servidor', async () => {
        const order = await service.create(request({ tableId: 't1' }))
        expect(order).toMatchObject({ clientId: 'c1', tableId: 't1', tableNumber: 4, tableSessionId: 's1', tableSessionEndedAt: null })
        expect(order.items).toHaveLength(3)
        expect(order.items.every(i => i.quantity === 1 && i.status === 'pendiente')).toBe(true)
        expect(order.items.filter(i => i.dishId === 'd1').map(i => i.notes)).toEqual(['sin sal', 'sin sal'])
        expect(repo.orders).toHaveLength(1)
    })

    it.each([undefined, null, '', '   ', 42])('un cliente sin tableSessionId valido (%s) recibe TableSessionRequiredError', async (value) => {
        await expect(service.create(request({ tableSessionId: value as never }))).rejects.toBeInstanceOf(TableSessionRequiredError)
        expect(repo.orders).toHaveLength(0)
    })

    it('rechaza sesion inexistente, ajena y cerrada', async () => {
        await expect(service.create(request({ tableSessionId: 'nope' }))).rejects.toBeInstanceOf(TableSessionNotFoundError)
        await expect(service.create(request({ tableSessionId: 's-other' }))).rejects.toBeInstanceOf(TableSessionForbiddenError)
        await expect(service.create(request({ tableSessionId: 's-closed' }))).rejects.toBeInstanceOf(TableSessionClosedError)
        expect(repo.orders).toHaveLength(0)
    })

    it('rechaza restaurante o mesa que no coinciden con la sesion', async () => {
        await expect(service.create(request({ restaurantId: 'rest-2' }))).rejects.toBeInstanceOf(TableSessionMismatchError)
        await expect(service.create(request({ tableId: 't9' }))).rejects.toBeInstanceOf(TableSessionMismatchError)
        expect(repo.orders).toHaveLength(0)
    })

    it('mantiene la validacion de restaurantId antes que la de sesion', async () => {
        await expect(service.create(request({ restaurantId: ' ' }))).rejects.toBeInstanceOf(RestaurantIdRequiredError)
    })

    it('un actor no cliente conserva la llamada antigua sin sesion', async () => {
        const order = await service.create(request({ actorRole: 'camarero', clientId: 'w1', tableSessionId: null, tableId: 'libre-7' }))
        expect(order).toMatchObject({ tableId: 'libre-7', tableSessionId: null, tableNumber: null, clientId: 'w1' })
    })

    it('un actor no cliente con sesion indicada no necesita ser su titular, pero la sesion debe estar abierta', async () => {
        const order = await service.create(request({ actorRole: 'camarero', clientId: 'w1', tableSessionId: 's1' }))
        expect(order).toMatchObject({ tableId: 't1', tableSessionId: 's1', clientId: 'w1' })
        await expect(service.create(request({ actorRole: 'camarero', clientId: 'w1', tableSessionId: 's-closed' }))).rejects.toBeInstanceOf(TableSessionClosedError)
    })
})
