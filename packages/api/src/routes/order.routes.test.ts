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
