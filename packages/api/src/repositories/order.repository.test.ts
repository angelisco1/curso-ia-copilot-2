import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteOrderRepository } from './order.repository.js'
import type { Order } from '@models/order.model.js'

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
