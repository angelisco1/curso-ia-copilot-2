import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { dbConfig } from '@config/database.js'
import { bearer, tokens, resetDatabase } from './testing/http-fixtures.js'

const tablesUrl = (r = 'r1') => `/api/v1/restaurants/${r}/tables`
const sessionsUrl = (r = 'r1') => `/api/v1/restaurants/${r}/table-sessions`
const items = [{ dishId: 'd1', quantity: 2, notes: 'sin sal' }, { dishId: 'd1', quantity: 1, notes: null }]

describe('POST /orders y pedidos de mesa (T14)', () => {
    beforeAll(async () => {
        await dbConfig.initialize()
    })
    afterAll(async () => {
        await dbConfig.close()
    })
    beforeEach(resetDatabase)

    const mkTable = async (number = 1) =>
        (await request(app).post(tablesUrl()).set(...bearer(tokens.admin)).send({ number, description: '', capacity: 4 })).body
    const occupy = async (t: string, tableId: string) =>
        (await request(app).post(sessionsUrl()).set(...bearer(t)).send({ tableId, partySize: 2 })).body
    const postOrder = (body: object, t = tokens.cliente) => request(app).post('/api/v1/orders').set(...bearer(t)).send(body)

    it('un cliente con sesion propia crea el pedido: 201, un item por unidad, identidad del JWT y mesa de la sesion', async () => {
        const table = await mkTable(7)
        const { session } = await occupy(tokens.cliente, table.id)
        const res = await postOrder({ restaurantId: 'r1', tableSessionId: session.id, clientId: 'falso', items })
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({
            restaurantId: 'r1', tableId: table.id, tableNumber: 7, clientId: 'cli-1',
            tableSessionId: session.id, tableSessionEndedAt: null
        })
        expect(res.body.items).toHaveLength(3)
        expect(res.body.items.every((i: { quantity: number; status: string }) => i.quantity === 1 && i.status === 'pendiente')).toBe(true)
    })

    it('errores de sesion usan {error, message} con 400/403/404/409 y no crean pedido', async () => {
        const table = await mkTable()
        const { session } = await occupy(tokens.cliente, table.id)

        const missing = await postOrder({ restaurantId: 'r1', items })
        expect(missing.status).toBe(400)
        expect(missing.body).toEqual({ error: 'TableSessionRequiredError', message: 'A table session is required to place an order' })

        const unknown = await postOrder({ restaurantId: 'r1', tableSessionId: 'nope', items })
        expect(unknown.status).toBe(404)
        expect(unknown.body).toEqual({ error: 'TableSessionNotFoundError', message: 'Table session not found' })

        const foreign = await postOrder({ restaurantId: 'r1', tableSessionId: session.id, items }, tokens.cliente2)
        expect(foreign.status).toBe(403)
        expect(foreign.body).toEqual({ error: 'TableSessionForbiddenError', message: 'The table session does not belong to the client' })

        const mismatch = await postOrder({ restaurantId: 'r2', tableSessionId: session.id, items })
        expect(mismatch.status).toBe(400)
        expect(mismatch.body.error).toBe('TableSessionMismatchError')
        expect((await postOrder({ restaurantId: 'r1', tableId: 'otra', tableSessionId: session.id, items })).status).toBe(400)

        await request(app).patch(`${tablesUrl()}/${table.id}/status`).set(...bearer(tokens.camarero1)).send({ status: 'libre' })
        const closed = await postOrder({ restaurantId: 'r1', tableSessionId: session.id, items })
        expect(closed.status).toBe(409)
        expect(closed.body).toEqual({ error: 'TableSessionClosedError', message: 'The table session is closed' })

        expect(await dbConfig.all('SELECT id FROM orders')).toEqual([])
    })

    it('formato heredado: restaurantId ausente sigue siendo 400 {error: mensaje}; sin token 401', async () => {
        const res = await postOrder({ items }, tokens.camarero1)
        expect(res.status).toBe(400)
        expect(res.body).toEqual({ error: 'Restaurant ID is required' })
        expect((await request(app).post('/api/v1/orders').send({ restaurantId: 'r1', items })).status).toBe(401)
    })

    it('actores no cliente conservan la llamada antigua sin sesion', async () => {
        const res = await postOrder({ restaurantId: 'r1', tableId: 'mesa-libre-3', items }, tokens.camarero1)
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ tableId: 'mesa-libre-3', tableSessionId: null, tableNumber: null, tableSessionEndedAt: null, clientId: 'wtr-1' })
    })

    it('GET /tables/:id/orders: mesa libre sin sesion → [] ; mesa inexistente/otro restaurante → 404', async () => {
        const table = await mkTable()
        const free = await request(app).get(`${tablesUrl()}/${table.id}/orders`).set(...bearer(tokens.camarero1))
        expect(free.status).toBe(200)
        expect(free.body).toEqual([])
        expect((await request(app).get(`${tablesUrl()}/nope/orders`).set(...bearer(tokens.admin))).status).toBe(404)
        expect((await request(app).get(`${tablesUrl('r2')}/${table.id}/orders`).set(...bearer(tokens.admin))).status).toBe(404)
    })

    it('GET /tables/:id/orders devuelve solo los pedidos de la visita actual con todos sus items, por createdAt ASC', async () => {
        const table = await mkTable()
        const { session } = await occupy(tokens.cliente, table.id)
        const first = (await postOrder({ restaurantId: 'r1', tableSessionId: session.id, items: [{ dishId: 'd1', quantity: 1, notes: null }] })).body
        const second = (await postOrder({ restaurantId: 'r1', tableSessionId: session.id, items })).body
        await request(app).patch(`/api/v1/orders/${first.id}/items/${first.items[0].id}/status`).set(...bearer(tokens.cocinero1)).send({ status: 'entregado' })

        const res = await request(app).get(`${tablesUrl()}/${table.id}/orders`).set(...bearer(tokens.manager1))
        expect(res.status).toBe(200)
        expect(res.body.map((o: { id: string }) => o.id)).toEqual([first.id, second.id])
        expect(res.body[0].items[0]).toMatchObject({ status: 'entregado', dishName: 'Tortilla' })
        expect(res.body[1].items).toHaveLength(3)
    })
})

describe('Recorrido completo de visitas, liberacion y borrado (T16)', () => {
    beforeAll(async () => {
        await dbConfig.initialize()
    })
    afterAll(async () => {
        await dbConfig.close()
    })
    beforeEach(resetDatabase)

    const mkTable = async () =>
        (await request(app).post(tablesUrl()).set(...bearer(tokens.admin)).send({ number: 3, description: '', capacity: 4 })).body
    const occupy = async (t: string, tableId: string) =>
        (await request(app).post(sessionsUrl()).set(...bearer(t)).send({ tableId, partySize: 2 })).body
    const order = (t: string, tableSessionId: string) =>
        request(app).post('/api/v1/orders').set(...bearer(t)).send({ restaurantId: 'r1', tableSessionId, items: [{ dishId: 'd1', quantity: 2, notes: null }] })
    const setStatus = (t: string, tableId: string, status: string) =>
        request(app).patch(`${tablesUrl()}/${tableId}/status`).set(...bearer(t)).send({ status })
    const tableOrders = (tableId: string) =>
        request(app).get(`${tablesUrl()}/${tableId}/orders`).set(...bearer(tokens.camarero1))

    it('ocupar A, pedir, liberar con pendientes y ocupar B en la misma mesa: B no ve pedidos de A, A sigue procesable y no puede pedir', async () => {
        const table = await mkTable()
        const a = await occupy(tokens.cliente, table.id)
        const orderA = (await order(tokens.cliente, a.session.id)).body
        expect(orderA.items).toHaveLength(2)

        expect((await tableOrders(table.id)).body.map((o: { id: string }) => o.id)).toEqual([orderA.id])
        expect((await setStatus(tokens.camarero1, table.id, 'libre')).body).toMatchObject({ status: 'libre', activeSessionId: null })
        expect((await tableOrders(table.id)).body).toEqual([])

        const b = await occupy(tokens.cliente2, table.id)
        expect(b.session.id).not.toBe(a.session.id)
        expect((await tableOrders(table.id)).body).toEqual([])
        const orderB = (await order(tokens.cliente2, b.session.id)).body
        expect((await tableOrders(table.id)).body.map((o: { id: string }) => o.id)).toEqual([orderB.id])

        // A sigue siendo procesable por cocina y visible en activos, con el cierre de su sesion.
        const advance = await request(app)
            .patch(`/api/v1/orders/${orderA.id}/items/${orderA.items[0].id}/status`)
            .set(...bearer(tokens.cocinero1)).send({ status: 'preparando' })
        expect(advance.status).toBe(204)
        const active = (await request(app).get('/api/v1/orders/active?restaurantId=r1').set(...bearer(tokens.cocinero1))).body
        const activeA = active.find((o: { id: string }) => o.id === orderA.id)
        expect(activeA).toMatchObject({ tableSessionId: a.session.id, tableNumber: 3, tableSessionEndedAt: expect.any(String) })
        expect(active.find((o: { id: string }) => o.id === orderB.id)).toMatchObject({ tableSessionEndedAt: null })

        // A no puede pedir de nuevo con su sesion cerrada ni con la de B.
        const again = await order(tokens.cliente, a.session.id)
        expect(again.status).toBe(409)
        expect(again.body.error).toBe('TableSessionClosedError')
        expect((await order(tokens.cliente, b.session.id)).status).toBe(403)

        // El historial de A conserva sus pedidos con el cierre.
        const mine = (await request(app).get('/api/v1/orders/mine').set(...bearer(tokens.cliente))).body
        expect(mine).toHaveLength(1)
        expect(mine[0]).toMatchObject({ id: orderA.id, tableSessionEndedAt: expect.any(String) })
    })

    it('borrar la mesa conserva pedidos y sesion historica, cierra la sesion y deja procesar los pedidos', async () => {
        const table = await mkTable()
        const a = await occupy(tokens.cliente, table.id)
        const orderA = (await order(tokens.cliente, a.session.id)).body

        const del = await request(app).delete(`${tablesUrl()}/${table.id}`).set(...bearer(tokens.admin))
        expect(del.status).toBe(204)
        expect((await tableOrders(table.id)).status).toBe(404)

        const sessions = await dbConfig.all<{ id: string; ended_at: string | null }>('SELECT id, ended_at FROM table_sessions')
        expect(sessions).toHaveLength(1)
        expect(sessions[0]!.ended_at).not.toBeNull()
        expect(await dbConfig.all('SELECT id FROM orders WHERE id = ?', [orderA.id])).toHaveLength(1)
        expect(await dbConfig.all('SELECT id FROM order_items WHERE order_id = ?', [orderA.id])).toHaveLength(2)

        const mine = (await request(app).get('/api/v1/orders/mine').set(...bearer(tokens.cliente))).body
        expect(mine[0]).toMatchObject({ id: orderA.id, tableSessionEndedAt: expect.any(String) })
        expect((await request(app).get(`/api/v1/orders/${orderA.id}`).set(...bearer(tokens.cocinero1))).status).toBe(200)
        expect((await order(tokens.cliente, a.session.id)).status).toBe(409)
        expect((await request(app).get(`${sessionsUrl()}/current`).set(...bearer(tokens.cliente))).text).toBe('null')
    })

    it('carrera HTTP: liberar la mesa mientras el cliente pide nunca deja un pedido posterior al cierre', async () => {
        const table = await mkTable()
        const a = await occupy(tokens.cliente, table.id)
        const [free, ...orders] = await Promise.all([
            setStatus(tokens.camarero1, table.id, 'libre'),
            order(tokens.cliente, a.session.id), order(tokens.cliente, a.session.id), order(tokens.cliente, a.session.id)
        ])
        expect(free.status).toBe(200)
        const created = orders.filter(o => o.status === 201)
        const rejected = orders.filter(o => o.status === 409)
        expect(created.length + rejected.length).toBe(3)
        const stored = await dbConfig.all<{ created_at: string }>('SELECT created_at FROM orders')
        expect(stored).toHaveLength(created.length)
        const { ended_at } = (await dbConfig.get<{ ended_at: string }>('SELECT ended_at FROM table_sessions'))!
        for (const row of stored) expect(row.created_at <= ended_at).toBe(true)
    })
})
