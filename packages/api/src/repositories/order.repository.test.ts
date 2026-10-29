import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteOrderRepository } from './order.repository.js'
import { SqliteTableRepository } from './table.repository.js'
import type { Order } from '@models/order.model.js'
import {
    TableSessionNotFoundError, TableSessionForbiddenError, TableSessionClosedError, TableSessionMismatchError
} from '@errors/DomainErrors.js'

const iso = (minute: number) => `2026-10-29T18:${String(minute).padStart(2, '0')}:00.000Z`

describe('SqliteOrderRepository: sesiones de mesa (integracion)', () => {
    let db: Database
    let repo: SqliteOrderRepository

    const makeOrder = (id: string, minute: number, extra: Partial<Order> = {}, statuses: Array<'pendiente' | 'preparando' | 'listo' | 'entregado'> = ['pendiente']): Order => ({
        id,
        restaurantId: 'r1',
        tableId: null,
        clientId: null,
        createdAt: new Date(iso(minute)),
        tableSessionId: null,
        tableNumber: null,
        tableSessionEndedAt: null,
        items: statuses.map((status, i) => ({ id: `${id}-i${i}`, dishId: 'd1', quantity: 1, notes: null, status })),
        ...extra
    })

    beforeEach(async () => {
        db = new Database()
        await db.initialize()
        const now = iso(0)
        await db.run('INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ['r1', 'R1', 'A', 'r@r.com', '1', 'O', 'W', now, now])
        await db.run('INSERT INTO dishes (id, name, price, category, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['d1', 'Tortilla', 7.5, 'principal', 'r1', now, now])
        await db.run("INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES ('t1', 'r1', 5, '', 4, 'ocupada', ?, ?)", [now, now])
        // sesion anterior (cerrada) y sesion actual (abierta) de la misma mesa
        await db.run("INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at, ended_at) VALUES ('sA', 'r1', 't1', 'cA', 2, ?, ?)", [iso(1), iso(30)])
        await db.run("INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at) VALUES ('sB', 'r1', 't1', 'cB', 3, ?)", [iso(31)])
        repo = new SqliteOrderRepository(db)
    })

    afterEach(async () => {
        await db.close()
    })

    it('guarda y lee tableSessionId junto al numero de mesa y el cierre de sesion', async () => {
        await repo.create(makeOrder('o-open', 40, { tableId: 't1', clientId: 'cB', tableSessionId: 'sB' }))
        await repo.create(makeOrder('o-closed', 10, { tableId: 't1', clientId: 'cA', tableSessionId: 'sA' }))

        const open = await repo.findById('o-open')
        expect(open).toMatchObject({ tableId: 't1', tableSessionId: 'sB', tableNumber: 5, tableSessionEndedAt: null })
        const closed = await repo.findById('o-closed')
        expect(closed).toMatchObject({ tableSessionId: 'sA', tableNumber: 5, tableSessionEndedAt: iso(30) })
    })

    it('los pedidos historicos sin sesion devuelven los tres campos nuevos a null', async () => {
        await repo.create(makeOrder('legacy', 5, { tableId: 'mesa-7', clientId: 'cX' }))
        expect(await repo.findById('legacy')).toMatchObject({ tableId: 'mesa-7', tableSessionId: null, tableNumber: null, tableSessionEndedAt: null })
        const mine = await repo.findByClientId('cX')
        expect(mine[0]).toMatchObject({ id: 'legacy', tableSessionId: null, tableNumber: null, tableSessionEndedAt: null })
        const active = await repo.findActiveByRestaurant('r1')
        expect(active[0]).toMatchObject({ id: 'legacy', tableSessionId: null, tableNumber: null, tableSessionEndedAt: null })
    })

    it('findActiveByRestaurant proyecta el cierre de sesion y conserva los pendientes de visitas anteriores', async () => {
        await repo.create(makeOrder('o-closed', 10, { tableId: 't1', tableSessionId: 'sA' }, ['pendiente', 'listo']))
        await repo.create(makeOrder('o-open', 40, { tableId: 't1', tableSessionId: 'sB' }))
        await repo.create(makeOrder('o-done', 20, { tableId: 't1', tableSessionId: 'sA' }, ['entregado']))
        const active = await repo.findActiveByRestaurant('r1')
        expect(active.map(o => o.id)).toEqual(['o-closed', 'o-open'])
        expect(active[0]).toMatchObject({ tableSessionId: 'sA', tableNumber: 5, tableSessionEndedAt: iso(30) })
        expect(active[1]).toMatchObject({ tableSessionId: 'sB', tableNumber: 5, tableSessionEndedAt: null })
    })

    it('findByClientId incluye pedidos de sesiones cerradas con su cierre', async () => {
        await repo.create(makeOrder('o1', 10, { clientId: 'cA', tableId: 't1', tableSessionId: 'sA' }))
        const mine = await repo.findByClientId('cA')
        expect(mine[0]).toMatchObject({ restaurantName: 'R1', tableSessionEndedAt: iso(30) })
    })

    it('findBySession devuelve todos los items incluidos entregados, solo de esa sesion y ordenados', async () => {
        await repo.create(makeOrder('b2', 50, { tableId: 't1', tableSessionId: 'sB' }, ['pendiente']))
        await repo.create(makeOrder('b1', 45, { tableId: 't1', tableSessionId: 'sB' }, ['entregado', 'entregado']))
        await repo.create(makeOrder('a1', 12, { tableId: 't1', tableSessionId: 'sA' }, ['pendiente']))
        await repo.create(makeOrder('legacy', 46, { tableId: 't1' }, ['pendiente']))

        const orders = await repo.findBySession('sB')
        expect(orders.map(o => o.id)).toEqual(['b1', 'b2'])
        expect(orders[0]!.items.map(i => i.status)).toEqual(['entregado', 'entregado'])
        expect(orders[0]!.items[0]).toMatchObject({ dishName: 'Tortilla', dishPrice: 7.5, dishCategory: 'principal' })
        expect(orders[0]).toMatchObject({ tableSessionId: 'sB', tableNumber: 5, tableSessionEndedAt: null })
        expect((await repo.findBySession('sA')).map(o => o.id)).toEqual(['a1'])
        expect(await repo.findBySession('no-existe')).toEqual([])
    })

    it('el avance de items y la lectura de pedidos antiguos siguen funcionando', async () => {
        await repo.create(makeOrder('o1', 10, { tableId: 't1', tableSessionId: 'sA' }))
        await repo.updateItemStatus('o1', 'o1-i0', 'entregado')
        expect((await repo.findById('o1'))?.items[0]?.status).toBe('entregado')
        expect(await repo.findActiveByRestaurant('r1')).toEqual([])
        expect((await repo.findBySession('sA'))[0]?.items[0]?.status).toBe('entregado')
    })
})

describe('SqliteOrderRepository.createInSession: atomicidad (integracion)', () => {
    let db: Database
    let repo: SqliteOrderRepository
    let tables: SqliteTableRepository

    const order = (id: string, over: Partial<Order> = {}): Order => ({
        id, restaurantId: 'r1', tableId: null, clientId: 'cB', createdAt: new Date(iso(50)),
        tableSessionId: 'sB', tableNumber: null, tableSessionEndedAt: null,
        items: [{ id: `${id}-i0`, dishId: 'd1', quantity: 1, notes: null, status: 'pendiente' }],
        ...over
    })
    const rules = { ownerId: 'cB', requestedTableId: null }
    const orderIds = async () => (await db.all<{ id: string }>('SELECT id FROM orders ORDER BY id')).map(r => r.id)

    beforeEach(async () => {
        db = new Database()
        await db.initialize()
        const now = iso(0)
        for (const id of ['r1', 'r2']) {
            await db.run('INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, id, 'A', 'r@r.com', '1', 'O', 'W', now, now])
        }
        await db.run('INSERT INTO dishes (id, name, price, category, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['d1', 'Tortilla', 7.5, 'principal', 'r1', now, now])
        await db.run("INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES ('t1', 'r1', 5, '', 4, 'ocupada', ?, ?)", [now, now])
        await db.run("INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES ('t2', 'r1', 6, '', 4, 'libre', ?, ?)", [now, now])
        await db.run("INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at) VALUES ('sB', 'r1', 't1', 'cB', 3, ?)", [iso(31)])
        await db.run("INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at, ended_at) VALUES ('sC', 'r1', 't1', 'cC', 2, ?, ?)", [iso(1), iso(30)])
        repo = new SqliteOrderRepository(db)
        tables = new SqliteTableRepository(db)
    })

    afterEach(async () => {
        await db.close()
    })

    it('crea el pedido fijando tableId y tableNumber desde la sesion', async () => {
        const created = await repo.createInSession(order('o1', { tableId: 'falsa' }), { ownerId: 'cB', requestedTableId: 't1' })
        expect(created).toMatchObject({ id: 'o1', tableId: 't1', tableNumber: 5, tableSessionId: 'sB', tableSessionEndedAt: null })
        expect(await repo.findById('o1')).toMatchObject({ tableId: 't1', tableNumber: 5 })
    })

    it('rechaza sesion inexistente, ajena, cerrada o con restaurante/mesa discordantes sin escribir nada', async () => {
        await expect(repo.createInSession(order('o1', { tableSessionId: 'nope' }), rules)).rejects.toBeInstanceOf(TableSessionNotFoundError)
        await expect(repo.createInSession(order('o2'), { ownerId: 'otro', requestedTableId: null })).rejects.toBeInstanceOf(TableSessionForbiddenError)
        await expect(repo.createInSession(order('o3', { tableSessionId: 'sC', clientId: 'cC' }), { ownerId: 'cC', requestedTableId: null })).rejects.toBeInstanceOf(TableSessionClosedError)
        await expect(repo.createInSession(order('o4', { restaurantId: 'r2' }), rules)).rejects.toBeInstanceOf(TableSessionMismatchError)
        await expect(repo.createInSession(order('o5'), { ownerId: 'cB', requestedTableId: 't2' })).rejects.toBeInstanceOf(TableSessionMismatchError)
        expect(await orderIds()).toEqual([])
    })

    it('sin propietario exigido (actor no cliente) acepta sesion de otro pero no cerrada', async () => {
        await expect(repo.createInSession(order('o1', { clientId: 'camarero' }), { ownerId: null, requestedTableId: null })).resolves.toMatchObject({ tableId: 't1' })
    })

    it('carrera: si la mesa se libera antes que el pedido, el pedido se rechaza y no se escribe', async () => {
        const [freed, created] = await Promise.allSettled([
            tables.changeStatus('r1', 't1', 'libre'),
            repo.createInSession(order('o1'), rules)
        ])
        expect(freed.status).toBe('fulfilled')
        expect(created.status).toBe('rejected')
        expect((created as PromiseRejectedResult).reason).toBeInstanceOf(TableSessionClosedError)
        expect(await orderIds()).toEqual([])
    })

    it('carrera: si el pedido entra antes de liberar, queda guardado y la sesion se cierra despues', async () => {
        const [created, freed] = await Promise.allSettled([
            repo.createInSession(order('o1'), rules),
            tables.changeStatus('r1', 't1', 'libre')
        ])
        expect(created.status).toBe('fulfilled')
        expect(freed.status).toBe('fulfilled')
        expect(await orderIds()).toEqual(['o1'])
        expect(await repo.findById('o1')).toMatchObject({ tableSessionEndedAt: expect.any(String) })
    })

    it('carrera con borrado logico de la mesa: ningun pedido posterior al cierre', async () => {
        const results = await Promise.allSettled([
            tables.delete('r1', 't1'),
            repo.createInSession(order('o1'), rules),
            repo.createInSession(order('o2'), rules)
        ])
        expect(results[1].status).toBe('rejected')
        expect(results[2].status).toBe('rejected')
        expect(await orderIds()).toEqual([])
    })

    it('rollback: si falla la escritura de un item no queda el pedido a medias', async () => {
        const broken = order('o1', { items: [
            { id: 'dup', dishId: 'd1', quantity: 1, notes: null, status: 'pendiente' },
            { id: 'dup', dishId: 'd1', quantity: 1, notes: null, status: 'pendiente' }
        ] })
        await expect(repo.createInSession(broken, rules)).rejects.toThrow()
        expect(await orderIds()).toEqual([])
        expect(await db.all('SELECT id FROM order_items')).toEqual([])
        await expect(repo.createInSession(order('o2'), rules)).resolves.toMatchObject({ id: 'o2' })
    })

    it('muchos pedidos concurrentes con cierre intercalado: todos los guardados son anteriores al cierre', async () => {
        const attempts = Array.from({ length: 10 }, (_, i) => repo.createInSession(order(`o${String(i).padStart(2, '0')}`), rules))
        const close = tables.changeStatus('r1', 't1', 'libre')
        const late = Array.from({ length: 5 }, (_, i) => repo.createInSession(order(`late${i}`), rules))
        const results = await Promise.allSettled([...attempts, close, ...late])
        expect(results.slice(0, 10).every(r => r.status === 'fulfilled')).toBe(true)
        expect(results.slice(11).every(r => r.status === 'rejected')).toBe(true)
        expect((await orderIds()).some(id => id.startsWith('late'))).toBe(false)
    })
})
