import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { dbConfig } from '@config/database.js'
import { bearer, tokens, resetDatabase } from './testing/http-fixtures.js'

const tablesUrl = (r = 'r1') => `/api/v1/restaurants/${r}/tables`
const sessionsUrl = (r = 'r1') => `/api/v1/restaurants/${r}/table-sessions`

// Evidencia HTTP de la parte de API de los criterios CA02, CA03, CA04, CA12, CA14 y CA17.
describe('Criterios de aceptacion verificables con la API', () => {
    beforeAll(async () => {
        await dbConfig.initialize()
    })
    afterAll(async () => {
        await dbConfig.close()
    })
    beforeEach(resetDatabase)

    const admin = () => bearer(tokens.admin)
    const mk = async (number: number, capacity: number, restaurant = 'r1', status?: string) => {
        const res = await request(app).post(tablesUrl(restaurant)).set(...admin()).send({ number, description: `M${number}`, capacity, status })
        expect(res.status).toBe(201)
        return res.body as { id: string }
    }
    const setStatus = (id: string, status: string) =>
        request(app).patch(`${tablesUrl()}/${id}/status`).set(...admin()).send({ status })
    const available = (n: number, t = tokens.cliente, r = 'r1') =>
        request(app).get(`${tablesUrl(r)}/available?partySize=${n}`).set(...bearer(t))
    const occupy = (tableId: string, partySize: number, t = tokens.cliente) =>
        request(app).post(sessionsUrl()).set(...bearer(t)).send({ tableId, partySize })
    const orderOn = (tableSessionId: string) =>
        request(app).post('/api/v1/orders').set(...bearer(tokens.cliente))
            .send({ restaurantId: 'r1', tableSessionId, items: [{ dishId: 'd1', quantity: 1, notes: null }] })

    it('CA02: matriz de entradas invalidas, mismo numero en otro restaurante y duplicado activo', async () => {
        const invalid: Array<Record<string, unknown>> = [
            { number: 0, capacity: 2 }, { number: -1, capacity: 2 }, { number: 1.5, capacity: 2 },
            { number: '1', capacity: 2 }, { number: null, capacity: 2 }, { capacity: 2 },
            { number: 1, capacity: 0 }, { number: 1, capacity: -3 }, { number: 1, capacity: 2.5 },
            { number: 1, capacity: '2' }, { number: 1, capacity: null }, { number: 1 },
            { number: 1, capacity: 2, status: 'desconocido' }, { number: 1, capacity: 2, status: 'LIBRE' }
        ]
        for (const body of invalid) {
            const res = await request(app).post(tablesUrl()).set(...admin()).send({ description: '', ...body })
            expect(res.status, JSON.stringify(body)).toBe(400)
            expect(res.body).toEqual({ error: expect.any(String), message: expect.any(String) })
        }
        for (const status of ['libre', 'ocupada', 'reservada']) {
            const t = await request(app).post(tablesUrl()).set(...admin()).send({ number: 50 + status.length, description: '', capacity: 2, status })
            expect(t.status, status).toBe(201)
        }
        const t1 = await mk(1, 2)
        expect(await mk(1, 2, 'r2')).toBeDefined()
        const dup = await request(app).post(tablesUrl()).set(...admin()).send({ number: 1, description: '', capacity: 4 })
        expect(dup.status).toBe(409)
        expect(dup.body.error).toBe('TableNumberConflictError')
        // Una mesa borrada ya no bloquea el numero.
        await request(app).delete(`${tablesUrl()}/${t1.id}`).set(...admin())
        expect((await request(app).post(tablesUrl()).set(...admin()).send({ number: 1, description: '', capacity: 4 })).status).toBe(201)
        // Capacidad exacta al grupo admitida.
        const exact = await mk(7, 3)
        expect((await occupy(exact.id, 3)).status).toBe(201)
    })

    it('CA03: para 4 personas solo capacidad 4 y 6 libres del restaurante; vacio explicito sin coincidencias', async () => {
        await mk(1, 2)
        const four = await mk(2, 4)
        const six = await mk(3, 6)
        await mk(4, 6, 'r1', 'ocupada')
        await mk(5, 6, 'r1', 'reservada')
        const gone = await mk(6, 6)
        await request(app).delete(`${tablesUrl()}/${gone.id}`).set(...admin())
        await mk(7, 6, 'r2')

        const res = await available(4)
        expect(res.status).toBe(200)
        expect((res.body as Array<{ id: string }>).map(t => t.id).sort()).toEqual([four.id, six.id].sort())
        expect(await available(7).then(r => r.body)).toEqual([])
    })

    it('CA04: listar y consultar disponibilidad no ocupa; confirmar abre sesion y marca ocupada', async () => {
        const t = await mk(1, 4)
        await available(2)
        await available(2)
        const status = async () => (await request(app).get(`${tablesUrl()}/${t.id}`).set(...admin())).body
        expect(await status()).toMatchObject({ status: 'libre', activeSessionId: null })
        expect((await request(app).get(`${sessionsUrl()}/current`).set(...bearer(tokens.cliente))).text).toBe('null')
        expect((await occupy(t.id, 0)).status).toBe(400)
        expect(await status()).toMatchObject({ status: 'libre', activeSessionId: null })

        const ok = await occupy(t.id, 2)
        expect(ok.status).toBe(201)
        expect(await status()).toMatchObject({ status: 'ocupada', activeSessionId: ok.body.session.id })
        expect((await available(2)).body).toEqual([])
    })

    it('CA12: recrear el numero de una mesa borrada da id nuevo, no hereda pedidos y no aparece mientras esta borrada', async () => {
        const t = await mk(1, 4)
        const s = (await occupy(t.id, 2)).body
        const ord = (await orderOn(s.session.id)).body
        await request(app).delete(`${tablesUrl()}/${t.id}`).set(...admin())

        const list = await request(app).get(tablesUrl()).set(...admin())
        expect(list.body).toEqual([])
        expect((await available(1)).body).toEqual([])

        const again = await mk(1, 4)
        expect(again.id).not.toBe(t.id)
        const orders = await request(app).get(`${tablesUrl()}/${again.id}/orders`).set(...admin())
        expect(orders.status).toBe(200)
        expect(orders.body).toEqual([])
        const old = await request(app).get(`/api/v1/orders/${ord.id}`).set(...bearer(tokens.cocinero1))
        expect(old.status).toBe(200)
        expect(old.body).toMatchObject({ id: ord.id, tableId: t.id, tableSessionId: s.session.id })
    })

    it('CA14: un pedido anterior sin sesion sigue consultable, activo, preparable y entregable', async () => {
        const now = new Date().toISOString()
        await dbConfig.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at) VALUES (?, ?, ?, ?, ?)', ['old-1', 'r1', 'mesa-7', 'cli-1', now])
        await dbConfig.run("INSERT INTO order_items (id, order_id, dish_id, quantity, notes, status) VALUES ('oi-1', 'old-1', 'd1', 1, NULL, 'pendiente')")

        const cook = bearer(tokens.cocinero1)
        const active = await request(app).get('/api/v1/orders/active?restaurantId=r1').set(...cook)
        expect(active.body).toHaveLength(1)
        expect(active.body[0]).toMatchObject({ id: 'old-1', tableId: 'mesa-7', tableSessionId: null, tableNumber: null, tableSessionEndedAt: null })
        for (const status of ['preparando', 'listo', 'entregado']) {
            const res = await request(app).patch('/api/v1/orders/old-1/items/oi-1/status').set(...cook).send({ status })
            expect(res.status, status).toBe(204)
        }
        const done = await request(app).get('/api/v1/orders/old-1').set(...cook)
        expect(done.body.items[0].status).toBe('entregado')
        expect((await request(app).get('/api/v1/orders/mine').set(...bearer(tokens.cliente))).body).toHaveLength(1)
        expect((await request(app).get('/api/v1/orders/active?restaurantId=r1').set(...cook)).body).toEqual([])
    })

    it('CA17: capacidad bajo el grupo activo 409, igual al grupo 200; ocupada->reservada cierra y repetir ocupada no abre otra', async () => {
        const t = await mk(1, 6)
        const s = (await occupy(t.id, 4)).body
        const put = (capacity: number) =>
            request(app).put(`${tablesUrl()}/${t.id}`).set(...admin()).send({ number: 1, description: 'M1', capacity, status: 'ocupada' })
        expect((await put(2)).status).toBe(409)
        expect((await put(2)).body.error).toBe('TableCapacityConflictError')
        expect((await put(4)).status).toBe(200)
        expect((await request(app).get(`${tablesUrl()}/${t.id}`).set(...admin())).body).toMatchObject({ capacity: 4, activeSessionId: s.session.id })

        expect((await setStatus(t.id, 'ocupada')).status).toBe(200)
        expect(await dbConfig.all('SELECT id FROM table_sessions WHERE table_id = ?', [t.id])).toHaveLength(1)

        const res = await setStatus(t.id, 'reservada')
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ status: 'reservada', activeSessionId: null })
        expect(await dbConfig.all('SELECT id FROM table_sessions WHERE table_id = ? AND ended_at IS NULL', [t.id])).toHaveLength(0)
        expect((await request(app).get(`${sessionsUrl()}/current`).set(...bearer(tokens.cliente))).text).toBe('null')

        // Ocupada manual sin pedidos: detalle de visita vacio (CA10, parte manual).
        expect((await setStatus(t.id, 'ocupada')).status).toBe(200)
        const orders = await request(app).get(`${tablesUrl()}/${t.id}/orders`).set(...bearer(tokens.camarero1))
        expect(orders.body).toEqual([])
    })
})
