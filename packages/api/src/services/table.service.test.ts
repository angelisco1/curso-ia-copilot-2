import { describe, it, expect, beforeEach } from 'vitest'
import { TableService } from './table.service.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import { MockRestaurantRepository } from '@repositories/mocks/MockRestaurantRepository.js'
import type { Actor } from '@models/actor.model.js'
import {
    RestaurantNotFoundError,
    TableNotFoundError,
    TableNumberConflictError,
    TableCapacityConflictError,
    ForbiddenRestaurantError,
    ForbiddenRoleError,
    InvalidTableNumberError,
    InvalidTableCapacityError,
    InvalidTableStatusError
} from '@errors/DomainErrors.js'

const admin: Actor = { id: 'a', role: 'admin', restaurantId: null }
const manager: Actor = { id: 'm', role: 'manager', restaurantId: 'r1' }
const waiter: Actor = { id: 'w', role: 'camarero', restaurantId: 'r1' }
const otherWaiter: Actor = { id: 'w2', role: 'camarero', restaurantId: 'r2' }
const cook: Actor = { id: 'k', role: 'cocinero', restaurantId: 'r1' }
const client: Actor = { id: 'c', role: 'cliente', restaurantId: null }

describe('TableService', () => {
    let tables: MockTableRepository
    let service: TableService

    beforeEach(async () => {
        tables = new MockTableRepository()
        const restaurants = new MockRestaurantRepository()
        const base = { address: 'a', email: 'e@e.com', phone: '1', ownerFirstName: 'o', ownerLastName: 'w', logoUrl: null, createdAt: '', updatedAt: '' }
        await restaurants.save({ id: 'r1', name: 'R1', ...base })
        await restaurants.save({ id: 'r2', name: 'R2', ...base })
        service = new TableService(tables, restaurants)
    })

    describe('create', () => {
        it('admin crea una mesa libre con id generado y restaurante de la ruta', async () => {
            const table = await service.create(admin, 'r1', { id: 'forzado', restaurantId: 'r2', number: 1, capacity: 4 })
            expect(table).toMatchObject({ restaurantId: 'r1', number: 1, description: '', capacity: 4, status: 'libre', activeSessionId: null })
            expect(table.id).not.toBe('forzado')
            expect(table.id).toMatch(/^[0-9a-f-]{36}$/)
        })

        it('crear ocupada devuelve una sesion activa', async () => {
            const table = await service.create(admin, 'r1', { number: 1, capacity: 2, status: 'ocupada' })
            expect(table.activeSessionId).not.toBeNull()
        })

        it('rechaza restaurante inexistente', async () => {
            await expect(service.create(admin, 'nope', { number: 1, capacity: 2 })).rejects.toThrow(RestaurantNotFoundError)
        })

        it('solo admin puede crear: manager, camarero, cocinero y cliente reciben 403', async () => {
            for (const actor of [manager, waiter, cook, client]) {
                await expect(service.create(actor, 'r1', { number: 1, capacity: 2 })).rejects.toThrow(ForbiddenRoleError)
            }
            expect(tables.tables).toHaveLength(0)
        })

        it('valida la entrada', async () => {
            await expect(service.create(admin, 'r1', { number: 0, capacity: 2 })).rejects.toThrow(InvalidTableNumberError)
            await expect(service.create(admin, 'r1', { number: 1, capacity: 1.5 })).rejects.toThrow(InvalidTableCapacityError)
            await expect(service.create(admin, 'r1', { number: 1, capacity: 1, status: 'x' })).rejects.toThrow(InvalidTableStatusError)
        })

        it('propaga el conflicto de numero y permite el mismo numero en otro restaurante', async () => {
            await service.create(admin, 'r1', { number: 1, capacity: 2 })
            await expect(service.create(admin, 'r1', { number: 1, capacity: 2 })).rejects.toThrow(TableNumberConflictError)
            await service.create(admin, 'r2', { number: 1, capacity: 2 })
        })
    })

    describe('lectura y pertenencia', () => {
        beforeEach(async () => {
            await service.create(admin, 'r1', { number: 2, capacity: 2 })
            await service.create(admin, 'r1', { number: 1, capacity: 2 })
            await service.create(admin, 'r2', { number: 1, capacity: 8 })
        })

        it('admin, manager y camarero listan las mesas de su restaurante ordenadas', async () => {
            for (const actor of [admin, manager, waiter]) {
                expect((await service.list(actor, 'r1')).map(t => t.number)).toEqual([1, 2])
            }
            expect(await service.list(admin, 'r2')).toHaveLength(1)
        })

        it('manager y camarero no operan en otro restaurante; cocinero y cliente no acceden', async () => {
            await expect(service.list(otherWaiter, 'r1')).rejects.toThrow(ForbiddenRestaurantError)
            await expect(service.list(cook, 'r1')).rejects.toThrow(ForbiddenRestaurantError)
            await expect(service.list(client, 'r1')).rejects.toThrow(ForbiddenRestaurantError)
            await expect(service.get(otherWaiter, 'r1', 'x')).rejects.toThrow(ForbiddenRestaurantError)
        })

        it('lista vacia de un restaurante sin mesas y 404 de restaurante inexistente', async () => {
            tables.tables = []
            expect(await service.list(admin, 'r1')).toEqual([])
            await expect(service.list(admin, 'nope')).rejects.toThrow(RestaurantNotFoundError)
        })

        it('get devuelve la mesa o 404 si no existe, esta borrada o es de otro restaurante', async () => {
            const [first, , other] = tables.tables
            expect((await service.get(waiter, 'r1', first!.id)).id).toBe(first!.id)
            await expect(service.get(waiter, 'r1', 'nope')).rejects.toThrow(TableNotFoundError)
            await expect(service.get(admin, 'r1', other!.id)).rejects.toThrow(TableNotFoundError)
            await service.delete(admin, 'r1', first!.id)
            await expect(service.get(admin, 'r1', first!.id)).rejects.toThrow(TableNotFoundError)
        })
    })

    describe('replace (PUT)', () => {
        it('sustituye los datos conservando id y restaurante', async () => {
            const created = await service.create(admin, 'r1', { number: 1, capacity: 4 })
            const updated = await service.replace(admin, 'r1', created.id, {
                id: 'otro', restaurantId: 'r2', number: 5, description: 'Barra', capacity: 6, status: 'reservada'
            })
            expect(updated).toMatchObject({ id: created.id, restaurantId: 'r1', number: 5, description: 'Barra', capacity: 6, status: 'reservada' })
        })

        it('exige los cuatro campos y solo admin', async () => {
            const created = await service.create(admin, 'r1', { number: 1, capacity: 4 })
            await expect(service.replace(admin, 'r1', created.id, { number: 1, capacity: 4, status: 'libre' })).rejects.toThrow()
            await expect(service.replace(manager, 'r1', created.id, { number: 1, description: '', capacity: 4, status: 'libre' })).rejects.toThrow(ForbiddenRoleError)
        })

        it('404 para mesa inexistente y conflicto de numero', async () => {
            const a = await service.create(admin, 'r1', { number: 1, capacity: 4 })
            await service.create(admin, 'r1', { number: 2, capacity: 4 })
            await expect(service.replace(admin, 'r1', 'nope', { number: 9, description: '', capacity: 4, status: 'libre' })).rejects.toThrow(TableNotFoundError)
            await expect(service.replace(admin, 'r1', a.id, { number: 2, description: '', capacity: 4, status: 'libre' })).rejects.toThrow(TableNumberConflictError)
        })

        it('conflicto de capacidad frente al grupo activo y misma transicion de estado que PATCH', async () => {
            const a = await service.create(admin, 'r1', { number: 1, capacity: 6, status: 'ocupada' })
            tables.activePartySize.set(a.id, 5)
            await expect(service.replace(admin, 'r1', a.id, { number: 1, description: '', capacity: 4, status: 'ocupada' })).rejects.toThrow(TableCapacityConflictError)
            const freed = await service.replace(admin, 'r1', a.id, { number: 1, description: '', capacity: 4, status: 'libre' })
            expect(freed).toMatchObject({ status: 'libre', activeSessionId: null })
            const b = await service.create(admin, 'r1', { number: 2, capacity: 4 })
            const viaPut = await service.replace(admin, 'r1', b.id, { number: 2, description: '', capacity: 4, status: 'ocupada' })
            const c = await service.create(admin, 'r1', { number: 3, capacity: 4 })
            const viaPatch = await service.changeStatus(admin, 'r1', c.id, { status: 'ocupada' })
            expect(viaPut.activeSessionId).not.toBeNull()
            expect(viaPatch.activeSessionId).not.toBeNull()
        })
    })

    describe('changeStatus (PATCH)', () => {
        it('admin, manager y camarero cambian el estado de su restaurante', async () => {
            const t = await service.create(admin, 'r1', { number: 1, capacity: 4 })
            for (const actor of [admin, manager, waiter]) {
                expect((await service.changeStatus(actor, 'r1', t.id, { status: 'reservada' })).status).toBe('reservada')
                expect((await service.changeStatus(actor, 'r1', t.id, { status: 'libre' })).status).toBe('libre')
            }
        })

        it('repetir ocupada es idempotente', async () => {
            const t = await service.create(admin, 'r1', { number: 1, capacity: 4 })
            const first = await service.changeStatus(waiter, 'r1', t.id, { status: 'ocupada' })
            const again = await service.changeStatus(waiter, 'r1', t.id, { status: 'ocupada' })
            expect(again.activeSessionId).toBe(first.activeSessionId)
        })

        it('rechaza otro restaurante, cocinero, cliente, estado invalido y mesa inexistente', async () => {
            const t = await service.create(admin, 'r1', { number: 1, capacity: 4 })
            await expect(service.changeStatus(otherWaiter, 'r1', t.id, { status: 'libre' })).rejects.toThrow(ForbiddenRestaurantError)
            await expect(service.changeStatus(cook, 'r1', t.id, { status: 'libre' })).rejects.toThrow(ForbiddenRestaurantError)
            await expect(service.changeStatus(client, 'r1', t.id, { status: 'libre' })).rejects.toThrow(ForbiddenRestaurantError)
            await expect(service.changeStatus(waiter, 'r1', t.id, { status: 'cerrada' })).rejects.toThrow(InvalidTableStatusError)
            await expect(service.changeStatus(waiter, 'r1', t.id, undefined)).rejects.toThrow(InvalidTableStatusError)
            await expect(service.changeStatus(waiter, 'r1', 'nope', { status: 'libre' })).rejects.toThrow(TableNotFoundError)
        })
    })

    describe('delete', () => {
        it('admin borra; otra llamada devuelve 404; no admin recibe 403', async () => {
            const t = await service.create(admin, 'r1', { number: 1, capacity: 4, status: 'ocupada' })
            await expect(service.delete(manager, 'r1', t.id)).rejects.toThrow(ForbiddenRoleError)
            await service.delete(admin, 'r1', t.id)
            await expect(service.delete(admin, 'r1', t.id)).rejects.toThrow(TableNotFoundError)
            await expect(service.delete(admin, 'nope', t.id)).rejects.toThrow(RestaurantNotFoundError)
        })
    })
})
