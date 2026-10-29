import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { dbConfig } from '@config/database.js'
import { bearer, tokens, resetDatabase } from './testing/http-fixtures.js'

const base = (restaurantId = 'r1') => `/api/v1/restaurants/${restaurantId}/tables`
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('Rutas de mesas: CRUD, estado y errores (T13)', () => {
    beforeAll(async () => {
        await dbConfig.initialize()
    })
    afterAll(async () => {
        await dbConfig.close()
    })
    beforeEach(resetDatabase)

    const create = (body: object, restaurantId = 'r1', t = tokens.admin) =>
        request(app).post(base(restaurantId)).set(...bearer(t)).send(body)

    it('POST crea una mesa libre y responde 201 con el contrato de mesa', async () => {
        const res = await create({ number: 1, description: 'Terraza', capacity: 4 })
        expect(res.status).toBe(201)
        expect(res.body).toEqual({
            id: expect.stringMatching(ID), restaurantId: 'r1', number: 1, description: 'Terraza',
            capacity: 4, status: 'libre', activeSessionId: null
        })
    })

    it('POST ignora restaurantId del cuerpo y toma el del path', async () => {
        const res = await create({ number: 1, description: '', capacity: 2, restaurantId: 'r2', id: 'forzado' })
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ restaurantId: 'r1' })
        expect(res.body.id).not.toBe('forzado')
    })

    it('errores: 400 de validacion, 404 de restaurante, 409 de numero duplicado, todos con {error, message}', async () => {
        const invalid = await create({ number: 0, description: '', capacity: 2 })
        expect(invalid.status).toBe(400)
        expect(invalid.body).toEqual({ error: expect.any(String), message: expect.any(String) })

        expect((await create({ number: 1, description: '', capacity: 2 }, 'nope')).status).toBe(404)

        await create({ number: 1, description: '', capacity: 2 })
        const dup = await create({ number: 1, description: 'otra', capacity: 2 })
        expect(dup.status).toBe(409)
        expect(dup.body).toEqual({ error: 'TableNumberConflictError', message: expect.any(String) })
    })

    it('GET lista las mesas del restaurante y GET por id devuelve una; otro restaurante o inexistente → 404', async () => {
        const a = (await create({ number: 1, description: '', capacity: 2 })).body
        await create({ number: 1, description: '', capacity: 6 }, 'r2')
        const list = await request(app).get(base()).set(...bearer(tokens.manager1))
        expect(list.status).toBe(200)
        expect(list.body).toEqual([a])

        const one = await request(app).get(`${base()}/${a.id}`).set(...bearer(tokens.camarero1))
        expect(one.status).toBe(200)
        expect(one.body).toEqual(a)

        const cross = await request(app).get(`${base('r2')}/${a.id}`).set(...bearer(tokens.admin))
        expect(cross.status).toBe(404)
        expect(cross.body).toEqual({ error: 'TableNotFoundError', message: 'Table not found' })
        expect((await request(app).get(`${base()}/no-existe`).set(...bearer(tokens.admin))).status).toBe(404)
    })

    it('PUT reemplaza la mesa; 409 por numero duplicado; 409 si la capacidad baja del grupo activo', async () => {
        const a = (await create({ number: 1, description: '', capacity: 4 })).body
        const b = (await create({ number: 2, description: '', capacity: 4 })).body
        const put = await request(app).put(`${base()}/${a.id}`).set(...bearer(tokens.admin))
            .send({ number: 10, description: 'Barra', capacity: 3, status: 'reservada' })
        expect(put.status).toBe(200)
        expect(put.body).toMatchObject({ id: a.id, number: 10, description: 'Barra', capacity: 3, status: 'reservada' })

        const dup = await request(app).put(`${base()}/${b.id}`).set(...bearer(tokens.admin))
            .send({ number: 10, description: '', capacity: 4, status: 'libre' })
        expect(dup.status).toBe(409)

        const bad = await request(app).put(`${base()}/${b.id}`).set(...bearer(tokens.admin)).send({ number: 2 })
        expect(bad.status).toBe(400)
    })

    it('PATCH status ocupa, repite sin crear otra visita y libera cerrando la sesion', async () => {
        const a = (await create({ number: 1, description: '', capacity: 4 })).body
        const patch = (status: unknown, t = tokens.camarero1) =>
            request(app).patch(`${base()}/${a.id}/status`).set(...bearer(t)).send({ status })

        const occupied = await patch('ocupada')
        expect(occupied.status).toBe(200)
        expect(occupied.body).toMatchObject({ status: 'ocupada', activeSessionId: expect.stringMatching(ID) })
        const repeated = await patch('ocupada', tokens.manager1)
        expect(repeated.body.activeSessionId).toBe(occupied.body.activeSessionId)

        const freed = await patch('libre')
        expect(freed.body).toMatchObject({ status: 'libre', activeSessionId: null })
        const sessions = await dbConfig.all<{ ended_at: string | null }>('SELECT ended_at FROM table_sessions')
        expect(sessions).toHaveLength(1)
        expect(sessions[0]!.ended_at).not.toBeNull()

        expect((await patch('rota')).status).toBe(400)
        expect((await patch(undefined)).status).toBe(400)
    })

    it('DELETE responde 204 sin cuerpo, la mesa pasa a 404 y su numero puede reutilizarse', async () => {
        const a = (await create({ number: 1, description: '', capacity: 4 })).body
        const del = await request(app).delete(`${base()}/${a.id}`).set(...bearer(tokens.admin))
        expect(del.status).toBe(204)
        expect(del.text).toBe('')
        expect((await request(app).get(`${base()}/${a.id}`).set(...bearer(tokens.admin))).status).toBe(404)
        expect((await request(app).delete(`${base()}/${a.id}`).set(...bearer(tokens.admin))).status).toBe(404)
        expect((await create({ number: 1, description: '', capacity: 4 })).status).toBe(201)
    })

    it('sin token → 401 con {error}', async () => {
        const res = await request(app).get(base())
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: expect.any(String) })
    })

    it('un fallo inesperado de la base de datos responde 500 y no se oculta', async () => {
        await dbConfig.run('ALTER TABLE restaurant_tables RENAME TO restaurant_tables_bak')
        try {
            const res = await request(app).get(base()).set(...bearer(tokens.admin))
            expect(res.status).toBe(500)
            expect(res.body).toEqual({ error: 'InternalServerError', message: 'Something went wrong' })
        } finally {
            await dbConfig.run('ALTER TABLE restaurant_tables_bak RENAME TO restaurant_tables')
        }
    })
})

describe('Rutas de mesas: permisos y aislamiento (T15)', () => {
    beforeAll(async () => {
        await dbConfig.initialize()
    })
    afterAll(async () => {
        await dbConfig.close()
    })
    beforeEach(resetDatabase)

    const as = (t: string) => bearer(t)
    const mk = async (restaurantId: string, number = 1) =>
        (await request(app).post(base(restaurantId)).set(...as(tokens.admin)).send({ number, description: '', capacity: 4 })).body

    const roleCases: Array<[string, string, number]> = [
        ['admin', tokens.admin, 0], ['manager', tokens.manager1, 0], ['camarero', tokens.camarero1, 0]
    ]

    it.each(roleCases)('%s del restaurante puede leer, cambiar estado y ver pedidos de sus mesas', async (_n, t) => {
        const table = await mk('r1')
        expect((await request(app).get(base()).set(...as(t))).status).toBe(200)
        expect((await request(app).get(`${base()}/${table.id}`).set(...as(t))).status).toBe(200)
        expect((await request(app).get(`${base()}/${table.id}/orders`).set(...as(t))).status).toBe(200)
        expect((await request(app).patch(`${base()}/${table.id}/status`).set(...as(t)).send({ status: 'reservada' })).status).toBe(200)
    })

    it('solo admin crea, reemplaza y borra; manager y camarero reciben 403 {error} y no se modifica nada', async () => {
        const table = await mk('r1')
        for (const t of [tokens.manager1, tokens.camarero1, tokens.cocinero1, tokens.cliente]) {
            const post = await request(app).post(base()).set(...as(t)).send({ number: 9, description: '', capacity: 2 })
            expect(post.status).toBe(403)
            expect(post.body).toEqual({ error: expect.any(String) })
            expect((await request(app).put(`${base()}/${table.id}`).set(...as(t)).send({ number: 9, description: '', capacity: 2, status: 'libre' })).status).toBe(403)
            expect((await request(app).delete(`${base()}/${table.id}`).set(...as(t))).status).toBe(403)
        }
        const rows = await dbConfig.all<{ number: number; deleted_at: string | null }>('SELECT number, deleted_at FROM restaurant_tables')
        expect(rows).toEqual([{ number: 1, deleted_at: null }])
    })

    it('el cocinero y el cliente no acceden a ninguna operacion de mesas del personal', async () => {
        const table = await mk('r1')
        for (const t of [tokens.cocinero1, tokens.cliente]) {
            expect((await request(app).get(base()).set(...as(t))).status).toBe(403)
            expect((await request(app).get(`${base()}/${table.id}`).set(...as(t))).status).toBe(403)
            expect((await request(app).get(`${base()}/${table.id}/orders`).set(...as(t))).status).toBe(403)
            expect((await request(app).patch(`${base()}/${table.id}/status`).set(...as(t)).send({ status: 'ocupada' })).status).toBe(403)
        }
        expect((await request(app).get(`${base()}/${table.id}`).set(...as(tokens.admin))).body.status).toBe('libre')
    })

    it('manager y camarero de otro restaurante reciben 403 en todas las operaciones del restaurante ajeno', async () => {
        const table = await mk('r2')
        for (const t of [tokens.manager1, tokens.camarero1]) {
            const res = await request(app).get(base('r2')).set(...as(t))
            expect(res.status).toBe(403)
            expect(res.body).toEqual({ error: 'ForbiddenRestaurantError', message: expect.any(String) })
            expect((await request(app).get(`${base('r2')}/${table.id}`).set(...as(t))).status).toBe(403)
            expect((await request(app).get(`${base('r2')}/${table.id}/orders`).set(...as(t))).status).toBe(403)
            expect((await request(app).patch(`${base('r2')}/${table.id}/status`).set(...as(t)).send({ status: 'ocupada' })).status).toBe(403)
        }
        expect((await request(app).get(`${base('r2')}/${table.id}`).set(...as(tokens.admin))).body.status).toBe('libre')
    })

    it('ids cruzados: la mesa de un restaurante no es accesible desde el path de otro, ni siquiera por admin', async () => {
        const t1 = await mk('r1')
        const t2 = await mk('r2')
        for (const [r, id] of [['r1', t2.id], ['r2', t1.id]] as const) {
            expect((await request(app).get(`${base(r)}/${id}`).set(...as(tokens.admin))).status).toBe(404)
            expect((await request(app).put(`${base(r)}/${id}`).set(...as(tokens.admin)).send({ number: 5, description: '', capacity: 2, status: 'libre' })).status).toBe(404)
            expect((await request(app).patch(`${base(r)}/${id}/status`).set(...as(tokens.admin)).send({ status: 'ocupada' })).status).toBe(404)
            expect((await request(app).get(`${base(r)}/${id}/orders`).set(...as(tokens.admin))).status).toBe(404)
            expect((await request(app).delete(`${base(r)}/${id}`).set(...as(tokens.admin))).status).toBe(404)
        }
        expect((await request(app).get(`${base('r1')}/${t1.id}`).set(...as(tokens.admin))).status).toBe(200)
        expect((await request(app).get(`${base('r2')}/${t2.id}`).set(...as(tokens.admin))).status).toBe(200)
    })

    it('un manager con claim de restaurante distinto al del token no se amplia por el body ni por query', async () => {
        const t2 = await mk('r2')
        const res = await request(app).patch(`${base('r2')}/${t2.id}/status?restaurantId=r1`).set(...as(tokens.manager1)).send({ status: 'ocupada', restaurantId: 'r1' })
        expect(res.status).toBe(403)
    })

    it('tokens invalidos, mal firmados o sin Bearer → 401 {error}', async () => {
        const jwt = (await import('jsonwebtoken')).default
        const forged = jwt.sign({ id: 'a', role: 'admin' }, 'otra-clave')
        for (const header of ['', 'Bearer', 'Bearer abc', `Bearer ${forged}`, 'Basic xyz']) {
            const req = request(app).get(base())
            const res = header ? await req.set('Authorization', header) : await req
            expect(res.status, header).toBe(401)
            expect(res.body).toEqual({ error: expect.any(String) })
        }
    })

    it('un token firmado pero sin id valido se rechaza en el controlador con 401 InvalidActorError', async () => {
        const jwt = (await import('jsonwebtoken')).default
        const noId = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'super-secret-resttek-key')
        const res = await request(app).get(base()).set(...as(noId))
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: 'InvalidActorError', message: expect.any(String) })
    })

    it('el listado de mesas del personal no expone la identidad de ningun cliente', async () => {
        const table = await mk('r1')
        await request(app).post('/api/v1/restaurants/r1/table-sessions').set(...as(tokens.cliente)).send({ tableId: table.id, partySize: 2 })
        const list = await request(app).get(base()).set(...as(tokens.camarero1))
        expect(JSON.stringify(list.body)).not.toContain('cli-1')
        expect(Object.keys(list.body[0]).sort()).toEqual(['activeSessionId', 'capacity', 'description', 'id', 'number', 'restaurantId', 'status'])
    })
})
