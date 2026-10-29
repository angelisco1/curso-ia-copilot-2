import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { dbConfig } from '@config/database.js'
import { bearer, tokens, resetDatabase } from './testing/http-fixtures.js'

const tablesUrl = (r = 'r1') => `/api/v1/restaurants/${r}/tables`
const sessionsUrl = (r = 'r1') => `/api/v1/restaurants/${r}/table-sessions`

describe('Rutas de ocupacion de mesas (T13)', () => {
    beforeAll(async () => {
        await dbConfig.initialize()
    })
    afterAll(async () => {
        await dbConfig.close()
    })
    beforeEach(resetDatabase)

    const mkTable = async (number: number, capacity: number, restaurantId = 'r1') =>
        (await request(app).post(tablesUrl(restaurantId)).set(...bearer(tokens.admin)).send({ number, description: `M${number}`, capacity })).body

    it('available no se interpreta como :tableId y devuelve solo libres con capacidad suficiente y sin identidad', async () => {
        const small = await mkTable(1, 2)
        const big = await mkTable(2, 6)
        const busy = await mkTable(3, 6)
        await request(app).patch(`${tablesUrl()}/${busy.id}/status`).set(...bearer(tokens.admin)).send({ status: 'ocupada' })
        await mkTable(4, 6, 'r2')

        const res = await request(app).get(`${tablesUrl()}/available?partySize=4`).set(...bearer(tokens.cliente))
        expect(res.status).toBe(200)
        expect(res.body).toEqual([{ id: big.id, number: 2, description: 'M2', capacity: 6 }])
        expect(small.id).toBeDefined()
    })

    it('available valida partySize con 400 y restaurante con 404', async () => {
        for (const q of ['', '?partySize=', '?partySize=0', '?partySize=-1', '?partySize=abc', '?partySize=2.5', '?partySize=1&partySize=2']) {
            const res = await request(app).get(`${tablesUrl()}/available${q}`).set(...bearer(tokens.cliente))
            expect(res.status, q).toBe(400)
            expect(res.body).toEqual({ error: expect.any(String), message: expect.any(String) })
        }
        const res = await request(app).get(`${tablesUrl('nope')}/available?partySize=2`).set(...bearer(tokens.cliente))
        expect(res.status).toBe(404)
    })

    it('POST table-sessions confirma (201), el reintento identico devuelve 200 con la misma sesion', async () => {
        const t = await mkTable(1, 4)
        const first = await request(app).post(sessionsUrl()).set(...bearer(tokens.cliente)).send({ tableId: t.id, partySize: 3 })
        expect(first.status).toBe(201)
        expect(first.body.session).toMatchObject({ restaurantId: 'r1', tableId: t.id, clientId: 'cli-1', partySize: 3, endedAt: null })
        expect(first.body.table).toMatchObject({ id: t.id, status: 'ocupada', activeSessionId: first.body.session.id })

        const retry = await request(app).post(sessionsUrl()).set(...bearer(tokens.cliente)).send({ tableId: t.id, partySize: 3 })
        expect(retry.status).toBe(200)
        expect(retry.body.session.id).toBe(first.body.session.id)
    })

    it('POST ignora clientId del cuerpo y usa el del JWT', async () => {
        const t = await mkTable(1, 4)
        const res = await request(app).post(sessionsUrl()).set(...bearer(tokens.cliente)).send({ tableId: t.id, partySize: 2, clientId: 'otro' })
        expect(res.body.session.clientId).toBe('cli-1')
    })

    it('errores de confirmacion: 400 validacion, 404 mesa, 409 no disponible, capacidad y sesion activa en otra mesa', async () => {
        const t = await mkTable(1, 2)
        const t2 = await mkTable(2, 2)
        const other = await mkTable(3, 4, 'r2')
        const post = (body: object, t = tokens.cliente, r = 'r1') => request(app).post(sessionsUrl(r)).set(...bearer(t)).send(body)

        expect((await post({ partySize: 2 })).status).toBe(400)
        expect((await post({ tableId: t.id, partySize: 0 })).status).toBe(400)
        expect((await post({ tableId: 'nope', partySize: 2 })).status).toBe(404)
        expect((await post({ tableId: other.id, partySize: 2 })).status).toBe(404)

        const cap = await post({ tableId: t.id, partySize: 3 })
        expect(cap.status).toBe(409)
        expect(cap.body.error).toBe('TableCapacityExceededError')

        expect((await post({ tableId: t.id, partySize: 2 })).status).toBe(201)
        const taken = await post({ tableId: t.id, partySize: 2 }, tokens.cliente2)
        expect(taken.status).toBe(409)
        expect(taken.body.error).toBe('TableNotAvailableError')
        const again = await post({ tableId: t2.id, partySize: 2 })
        expect(again.status).toBe(409)
        expect(again.body.error).toBe('ActiveTableSessionExistsError')
    })

    it('GET current devuelve literalmente null sin sesion y la ocupacion propia despues', async () => {
        const t = await mkTable(1, 4)
        const none = await request(app).get(`${sessionsUrl()}/current`).set(...bearer(tokens.cliente))
        expect(none.status).toBe(200)
        expect(none.text).toBe('null')
        const created = (await request(app).post(sessionsUrl()).set(...bearer(tokens.cliente)).send({ tableId: t.id, partySize: 2 })).body
        const current = await request(app).get(`${sessionsUrl()}/current`).set(...bearer(tokens.cliente))
        expect(current.body).toEqual(created)
        const other = await request(app).get(`${sessionsUrl()}/current`).set(...bearer(tokens.cliente2))
        expect(other.text).toBe('null')
        expect((await request(app).get(`${sessionsUrl('nope')}/current`).set(...bearer(tokens.cliente))).status).toBe(404)
    })

    it('un token con rol desconocido o sin id se rechaza con 401', async () => {
        const jwt = (await import('jsonwebtoken')).default
        const bad = jwt.sign({ id: 'x', role: 'hacker' }, process.env.JWT_SECRET || 'super-secret-resttek-key')
        const res = await request(app).get(`${sessionsUrl()}/current`).set(...bearer(bad))
        expect([401, 403]).toContain(res.status)
    })
})

describe('Rutas de ocupacion: permisos y aislamiento (T15)', () => {
    beforeAll(async () => {
        await dbConfig.initialize()
    })
    afterAll(async () => {
        await dbConfig.close()
    })
    beforeEach(resetDatabase)

    const mk = async (restaurantId: string, number = 1, capacity = 4) =>
        (await request(app).post(tablesUrl(restaurantId)).set(...bearer(tokens.admin)).send({ number, description: '', capacity })).body
    const staffTokens = [tokens.admin, tokens.manager1, tokens.camarero1, tokens.cocinero1]

    it('solo el cliente usa disponibilidad, confirmacion y sesion actual: personal → 403 {error} sin efectos', async () => {
        const table = await mk('r1')
        for (const t of staffTokens) {
            const available = await request(app).get(`${tablesUrl()}/available?partySize=2`).set(...bearer(t))
            expect(available.status).toBe(403)
            expect(available.body).toEqual({ error: expect.any(String) })
            expect((await request(app).post(sessionsUrl()).set(...bearer(t)).send({ tableId: table.id, partySize: 2 })).status).toBe(403)
            expect((await request(app).get(`${sessionsUrl()}/current`).set(...bearer(t))).status).toBe(403)
        }
        expect(await dbConfig.all('SELECT id FROM table_sessions')).toEqual([])
    })

    it('sin JWT las tres rutas responden 401', async () => {
        expect((await request(app).get(`${tablesUrl()}/available?partySize=2`)).status).toBe(401)
        expect((await request(app).post(sessionsUrl()).send({ tableId: 'x', partySize: 2 })).status).toBe(401)
        expect((await request(app).get(`${sessionsUrl()}/current`)).status).toBe(401)
    })

    it('la disponibilidad no expone identidad: ni clientId, ni estado, ni sesion; mesas de otros restaurantes no aparecen', async () => {
        const t1 = await mk('r1', 1)
        const t2 = await mk('r1', 2)
        await mk('r2', 1)
        await request(app).post(sessionsUrl()).set(...bearer(tokens.cliente2)).send({ tableId: t1.id, partySize: 2 })
        const res = await request(app).get(`${tablesUrl()}/available?partySize=2`).set(...bearer(tokens.cliente))
        expect(res.body).toEqual([{ id: t2.id, number: 2, description: '', capacity: 4 }])
        const raw = JSON.stringify(res.body)
        for (const forbidden of ['cli-2', 'clientId', 'status', 'activeSessionId', 'restaurantId']) {
            expect(raw).not.toContain(forbidden)
        }
    })

    it('ids cruzados: confirmar en el path de otro restaurante con la mesa ajena → 404 y no ocupa la mesa', async () => {
        const t2 = await mk('r2')
        const res = await request(app).post(sessionsUrl('r1')).set(...bearer(tokens.cliente)).send({ tableId: t2.id, partySize: 2 })
        expect(res.status).toBe(404)
        expect((await request(app).get(`${tablesUrl('r2')}/${t2.id}`).set(...bearer(tokens.admin))).body.status).toBe('libre')
    })

    it('current solo devuelve la sesion del propio cliente y por restaurante; otro cliente recibe null', async () => {
        const t1 = await mk('r1')
        const t2 = await mk('r2')
        const mine = (await request(app).post(sessionsUrl('r1')).set(...bearer(tokens.cliente)).send({ tableId: t1.id, partySize: 2 })).body
        await request(app).post(sessionsUrl('r2')).set(...bearer(tokens.cliente2)).send({ tableId: t2.id, partySize: 2 })
        expect((await request(app).get(`${sessionsUrl('r1')}/current`).set(...bearer(tokens.cliente))).body).toEqual(mine)
        expect((await request(app).get(`${sessionsUrl('r2')}/current`).set(...bearer(tokens.cliente))).text).toBe('null')
        expect((await request(app).get(`${sessionsUrl('r1')}/current`).set(...bearer(tokens.cliente2))).text).toBe('null')
    })

    it('un cliente puede mantener sesiones en restaurantes distintos y no libera la otra al ocupar', async () => {
        const t1 = await mk('r1')
        const t2 = await mk('r2')
        expect((await request(app).post(sessionsUrl('r1')).set(...bearer(tokens.cliente)).send({ tableId: t1.id, partySize: 2 })).status).toBe(201)
        expect((await request(app).post(sessionsUrl('r2')).set(...bearer(tokens.cliente)).send({ tableId: t2.id, partySize: 2 })).status).toBe(201)
        expect((await request(app).get(`${sessionsUrl('r1')}/current`).set(...bearer(tokens.cliente))).body).not.toBeNull()
    })

    it('un cliente sin permiso no puede liberar su propia mesa (solo personal): PATCH status → 403 y la sesion sigue abierta', async () => {
        const t1 = await mk('r1')
        await request(app).post(sessionsUrl()).set(...bearer(tokens.cliente)).send({ tableId: t1.id, partySize: 2 })
        const res = await request(app).patch(`${tablesUrl()}/${t1.id}/status`).set(...bearer(tokens.cliente)).send({ status: 'libre' })
        expect(res.status).toBe(403)
        expect((await request(app).get(`${sessionsUrl()}/current`).set(...bearer(tokens.cliente))).body).not.toBeNull()
    })
})
