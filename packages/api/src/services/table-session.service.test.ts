import { describe, it, expect, beforeEach } from 'vitest'
import { TableSessionService } from './table-session.service.js'
import { TableService } from './table.service.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import { MockTableSessionRepository } from '@repositories/mocks/MockTableSessionRepository.js'
import { MockRestaurantRepository } from '@repositories/mocks/MockRestaurantRepository.js'
import type { Actor } from '@models/actor.model.js'
import {
    RestaurantNotFoundError,
    TableNotFoundError,
    TableNotAvailableError,
    TableCapacityExceededError,
    ActiveTableSessionExistsError,
    ForbiddenRoleError,
    InvalidPartySizeError,
    InvalidTableIdError
} from '@errors/DomainErrors.js'

const admin: Actor = { id: 'a', role: 'admin', restaurantId: null }
const waiter: Actor = { id: 'w', role: 'camarero', restaurantId: 'r1' }
const c1: Actor = { id: 'c1', role: 'cliente', restaurantId: null }
const c2: Actor = { id: 'c2', role: 'cliente', restaurantId: null }

describe('TableSessionService', () => {
    let tables: MockTableRepository
    let tableService: TableService
    let service: TableSessionService
    let ids: Record<string, string>

    beforeEach(async () => {
        tables = new MockTableRepository()
        const restaurants = new MockRestaurantRepository()
        const base = { address: 'a', email: 'e@e.com', phone: '1', ownerFirstName: 'o', ownerLastName: 'w', logoUrl: null, createdAt: '', updatedAt: '' }
        await restaurants.save({ id: 'r1', name: 'R1', ...base })
        await restaurants.save({ id: 'r2', name: 'R2', ...base })
        tableService = new TableService(tables, restaurants)
        service = new TableSessionService(tables, new MockTableSessionRepository(tables), restaurants)
        ids = {
            small: (await tableService.create(admin, 'r1', { number: 1, capacity: 2 })).id,
            big: (await tableService.create(admin, 'r1', { number: 2, capacity: 6 })).id,
            reserved: (await tableService.create(admin, 'r1', { number: 3, capacity: 6, status: 'reservada' })).id,
            manual: (await tableService.create(admin, 'r1', { number: 4, capacity: 6, status: 'ocupada' })).id,
            other: (await tableService.create(admin, 'r2', { number: 1, capacity: 6 })).id
        }
    })

    describe('listAvailable', () => {
        it('devuelve solo libres con capacidad suficiente, sin estado ni sesion', async () => {
            const result = await service.listAvailable(c1, 'r1', '2')
            expect(result.map(t => t.id)).toEqual([ids.small, ids.big])
            expect(Object.keys(result[0]!).sort()).toEqual(['capacity', 'description', 'id', 'number'])
            expect((await service.listAvailable(c1, 'r1', 3)).map(t => t.id)).toEqual([ids.big])
            expect(await service.listAvailable(c1, 'r1', '7')).toEqual([])
        })

        it('listar no cambia el estado', async () => {
            await service.listAvailable(c1, 'r1', '2')
            expect((await tables.findById('r1', ids.small!))?.status).toBe('libre')
        })

        it('valida partySize y rol cliente y restaurante', async () => {
            for (const bad of [undefined, '', 'abc', '0', '-1', '2.5', '1e1', ' 2', ['2'], 0, 1.5]) {
                await expect(service.listAvailable(c1, 'r1', bad)).rejects.toThrow(InvalidPartySizeError)
            }
            await expect(service.listAvailable(waiter, 'r1', '2')).rejects.toThrow(ForbiddenRoleError)
            await expect(service.listAvailable(admin, 'r1', '2')).rejects.toThrow(ForbiddenRoleError)
            await expect(service.listAvailable(c1, 'nope', '2')).rejects.toThrow(RestaurantNotFoundError)
        })
    })

    describe('confirm', () => {
        it('ocupa una mesa libre suficiente con el id del actor y marca la mesa ocupada', async () => {
            const result = await service.confirm(c1, 'r1', { tableId: ids.big, partySize: 4, clientId: 'falso', restaurantId: 'r2' })
            expect(result.created).toBe(true)
            expect(result.occupancy.session).toMatchObject({ restaurantId: 'r1', tableId: ids.big, clientId: 'c1', partySize: 4, endedAt: null })
            expect(result.occupancy.session.id).toMatch(/^[0-9a-f-]{36}$/)
            expect(result.occupancy.table).toMatchObject({ id: ids.big, status: 'ocupada' })
        })

        it('reintento identico devuelve la misma sesion sin duplicar', async () => {
            const first = await service.confirm(c1, 'r1', { tableId: ids.big, partySize: 4 })
            const retry = await service.confirm(c1, 'r1', { tableId: ids.big, partySize: 4 })
            expect(retry.created).toBe(false)
            expect(retry.occupancy.session.id).toBe(first.occupancy.session.id)
        })

        it('rechaza mesa ajena, inexistente o borrada con 404 y no cambia nada', async () => {
            await expect(service.confirm(c1, 'r1', { tableId: ids.other, partySize: 2 })).rejects.toThrow(TableNotFoundError)
            await expect(service.confirm(c1, 'r1', { tableId: 'nope', partySize: 2 })).rejects.toThrow(TableNotFoundError)
            await tableService.delete(admin, 'r1', ids.small!)
            await expect(service.confirm(c1, 'r1', { tableId: ids.small, partySize: 1 })).rejects.toThrow(TableNotFoundError)
            expect((await tables.findById('r2', ids.other!))?.status).toBe('libre')
        })

        it('rechaza mesas reservadas, ocupadas por otro y capacidad insuficiente con conflicto', async () => {
            await expect(service.confirm(c1, 'r1', { tableId: ids.reserved, partySize: 2 })).rejects.toThrow(TableNotAvailableError)
            await expect(service.confirm(c1, 'r1', { tableId: ids.manual, partySize: 2 })).rejects.toThrow(TableNotAvailableError)
            await service.confirm(c2, 'r1', { tableId: ids.big, partySize: 2 })
            await expect(service.confirm(c1, 'r1', { tableId: ids.big, partySize: 2 })).rejects.toThrow(TableNotAvailableError)
            await expect(service.confirm(c1, 'r1', { tableId: ids.small, partySize: 3 })).rejects.toThrow(TableCapacityExceededError)
        })

        it('otra mesa con sesion activa en el restaurante es conflicto; en otro restaurante se permite', async () => {
            await service.confirm(c1, 'r1', { tableId: ids.big, partySize: 4 })
            await expect(service.confirm(c1, 'r1', { tableId: ids.small, partySize: 2 })).rejects.toThrow(ActiveTableSessionExistsError)
            const other = await service.confirm(c1, 'r2', { tableId: ids.other, partySize: 2 })
            expect(other.created).toBe(true)
        })

        it('valida entrada, rol y restaurante', async () => {
            await expect(service.confirm(c1, 'r1', { partySize: 2 })).rejects.toThrow(InvalidTableIdError)
            await expect(service.confirm(c1, 'r1', { tableId: ids.big, partySize: 0 })).rejects.toThrow(InvalidPartySizeError)
            await expect(service.confirm(c1, 'r1', { tableId: ids.big, partySize: '2' })).rejects.toThrow(InvalidPartySizeError)
            await expect(service.confirm(waiter, 'r1', { tableId: ids.big, partySize: 2 })).rejects.toThrow(ForbiddenRoleError)
            await expect(service.confirm(admin, 'r1', { tableId: ids.big, partySize: 2 })).rejects.toThrow(ForbiddenRoleError)
            await expect(service.confirm(c1, 'nope', { tableId: ids.big, partySize: 2 })).rejects.toThrow(RestaurantNotFoundError)
        })
    })

    describe('current', () => {
        it('devuelve null sin sesion y la propia con su mesa', async () => {
            expect(await service.current(c1, 'r1')).toBeNull()
            const { occupancy } = await service.confirm(c1, 'r1', { tableId: ids.big, partySize: 4 })
            const current = await service.current(c1, 'r1')
            expect(current?.session.id).toBe(occupancy.session.id)
            expect(current?.table).toMatchObject({ id: ids.big, status: 'ocupada' })
        })

        it('solo recupera la del actor y por restaurante', async () => {
            await service.confirm(c1, 'r1', { tableId: ids.big, partySize: 4 })
            expect(await service.current(c2, 'r1')).toBeNull()
            expect(await service.current(c1, 'r2')).toBeNull()
            await service.confirm(c1, 'r2', { tableId: ids.other, partySize: 2 })
            expect((await service.current(c1, 'r1'))?.table.id).toBe(ids.big)
            expect((await service.current(c1, 'r2'))?.table.id).toBe(ids.other)
        })

        it('tras liberar la mesa ya no hay ocupacion actual; rol y restaurante validados', async () => {
            await service.confirm(c1, 'r1', { tableId: ids.big, partySize: 4 })
            const repo = (service as unknown as { sessionRepository: MockTableSessionRepository }).sessionRepository
            repo.sessions.forEach(s => { s.endedAt = new Date().toISOString() })
            expect(await service.current(c1, 'r1')).toBeNull()
            await expect(service.current(waiter, 'r1')).rejects.toThrow(ForbiddenRoleError)
            await expect(service.current(c1, 'nope')).rejects.toThrow(RestaurantNotFoundError)
        })
    })
})
