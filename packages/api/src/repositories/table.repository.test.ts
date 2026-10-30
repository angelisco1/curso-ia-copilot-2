import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteTableRepository } from './table.repository.js'
import { TableNumberConflictError, TableCapacityConflictError } from '@errors/DomainErrors.js'

const now = new Date().toISOString()

describe('SqliteTableRepository (integracion)', () => {
    let db: Database
    let repo: SqliteTableRepository

    const newTable = (id: string, restaurantId: string, number: number, extra: Partial<{ description: string; capacity: number; status: 'libre' | 'ocupada' | 'reservada' }> = {}) => ({
        id, restaurantId, number, description: extra.description ?? '', capacity: extra.capacity ?? 4, status: extra.status ?? 'libre' as const
    })

    beforeEach(async () => {
        db = new Database()
        await db.initialize()
        for (const id of ['r1', 'r2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, id, 'A', 'r@r.com', '1', 'O', 'W', now, now]
            )
        }
        repo = new SqliteTableRepository(db)
    })

    afterEach(async () => {
        await db.close()
    })

    it('crea y recupera una mesa con activeSessionId nulo', async () => {
        const created = await repo.create(newTable('t1', 'r1', 1, { description: 'Terraza', capacity: 4 }))
        expect(created).toEqual({ id: 't1', restaurantId: 'r1', number: 1, description: 'Terraza', capacity: 4, status: 'libre', activeSessionId: null })
        expect(await repo.findById('r1', 't1')).toEqual(created)
    })

    it('findById esta acotado al restaurante y excluye borradas', async () => {
        await repo.create(newTable('t1', 'r1', 1))
        expect(await repo.findById('r2', 't1')).toBeNull()
        expect(await repo.findById('r1', 'no-existe')).toBeNull()
        await db.run('UPDATE restaurant_tables SET deleted_at = ? WHERE id = ?', [now, 't1'])
        expect(await repo.findById('r1', 't1')).toBeNull()
    })

    it('lista por restaurante ordenado por numero y sin borradas', async () => {
        await repo.create(newTable('t3', 'r1', 3, { status: 'reservada' }))
        await repo.create(newTable('t1', 'r1', 1))
        await repo.create(newTable('t2', 'r1', 2))
        await repo.create(newTable('x1', 'r2', 1))
        await db.run('UPDATE restaurant_tables SET deleted_at = ? WHERE id = ?', [now, 't2'])
        const list = await repo.findByRestaurant('r1')
        expect(list.map(t => t.id)).toEqual(['t1', 't3'])
        expect(list.map(t => t.status)).toEqual(['libre', 'reservada'])
        expect(await repo.findByRestaurant('sin-mesas')).toEqual([])
    })

    it('expone activeSessionId solo de la sesion abierta', async () => {
        await repo.create(newTable('t1', 'r1', 1))
        await db.run("UPDATE restaurant_tables SET status = 'ocupada' WHERE id = 't1'")
        await db.run('INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['old', 'r1', 't1', 'c0', 2, now, now])
        await db.run('INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at) VALUES (?, ?, ?, ?, ?, ?)', ['open', 'r1', 't1', 'c1', 2, now])
        expect((await repo.findById('r1', 't1'))?.activeSessionId).toBe('open')
        expect((await repo.findByRestaurant('r1'))[0]?.activeSessionId).toBe('open')
    })

    it('rechaza numero duplicado por restaurante pero lo permite en otro restaurante', async () => {
        await repo.create(newTable('t1', 'r1', 1))
        await expect(repo.create(newTable('t2', 'r1', 1))).rejects.toThrow(TableNumberConflictError)
        await repo.create(newTable('t3', 'r2', 1))
    })

    it('reutiliza el numero tras el borrado logico con un id distinto', async () => {
        await repo.create(newTable('t1', 'r1', 1))
        await db.run('UPDATE restaurant_tables SET deleted_at = ? WHERE id = ?', [now, 't1'])
        const again = await repo.create(newTable('t2', 'r1', 1))
        expect(again.id).toBe('t2')
        expect(await db.get('SELECT id FROM restaurant_tables WHERE id = ?', ['t1'])).toBeDefined()
        expect((await repo.findByRestaurant('r1')).map(t => t.id)).toEqual(['t2'])
    })

    it('no oculta errores SQL distintos de la unicidad', async () => {
        await expect(repo.create(newTable('t1', 'no-existe', 1))).rejects.toThrow(/FOREIGN KEY/)
    })

    it('disponibles: solo libres con capacidad suficiente, ordenadas, sin estado ni sesion', async () => {
        await repo.create(newTable('a', 'r1', 5, { capacity: 6 }))
        await repo.create(newTable('b', 'r1', 2, { capacity: 4, description: 'Terraza' }))
        await repo.create(newTable('c', 'r1', 1, { capacity: 4 }))
        await repo.create(newTable('d', 'r1', 3, { capacity: 2 }))
        await repo.create(newTable('e', 'r1', 4, { capacity: 8, status: 'reservada' }))
        await repo.create(newTable('f', 'r1', 6, { capacity: 8, status: 'ocupada' }))
        await repo.create(newTable('g', 'r1', 7, { capacity: 8 }))
        await repo.create(newTable('h', 'r2', 1, { capacity: 8 }))
        await db.run('UPDATE restaurant_tables SET deleted_at = ? WHERE id = ?', [now, 'g'])
        const result = await repo.findAvailable('r1', 3)
        expect(result).toEqual([
            { id: 'c', number: 1, description: '', capacity: 4 },
            { id: 'b', number: 2, description: 'Terraza', capacity: 4 },
            { id: 'a', number: 5, description: '', capacity: 6 }
        ])
        expect(await repo.findAvailable('r1', 100)).toEqual([])
    })

    it('replace cambia numero, descripcion y capacidad sin tocar restaurante ni estado', async () => {
        await repo.create(newTable('t1', 'r1', 1, { status: 'reservada' }))
        const updated = await repo.replace('r1', 't1', { number: 9, description: 'Nueva', capacity: 10, status: 'reservada' })
        expect(updated).toEqual({ id: 't1', restaurantId: 'r1', number: 9, description: 'Nueva', capacity: 10, status: 'reservada', activeSessionId: null })
    })

    it('replace devuelve null para mesa ajena o borrada y detecta duplicados', async () => {
        await repo.create(newTable('t1', 'r1', 1))
        await repo.create(newTable('t2', 'r1', 2))
        expect(await repo.replace('r2', 't1', { number: 5, description: '', capacity: 1, status: 'libre' })).toBeNull()
        await db.run('UPDATE restaurant_tables SET deleted_at = ? WHERE id = ?', [now, 't2'])
        expect(await repo.replace('r1', 't2', { number: 5, description: '', capacity: 1, status: 'libre' })).toBeNull()
        await repo.create(newTable('t3', 'r1', 3))
        await expect(repo.replace('r1', 't3', { number: 1, description: '', capacity: 1, status: 'libre' })).rejects.toThrow(TableNumberConflictError)
        expect((await repo.findById('r1', 't3'))?.number).toBe(3)
    })
})

describe('SqliteTableRepository: estados, sesiones manuales y borrado (integracion)', () => {
    let db: Database
    let repo: SqliteTableRepository

    const base = (id: string, number: number, status: 'libre' | 'ocupada' | 'reservada' = 'libre', capacity = 4) =>
        ({ id, restaurantId: 'r1', number, description: '', capacity, status })
    const sessions = (tableId: string) => db.all<{ id: string; client_id: string | null; party_size: number | null; ended_at: string | null }>(
        'SELECT id, client_id, party_size, ended_at FROM table_sessions WHERE table_id = ? ORDER BY started_at, id', [tableId])
    const openCount = async () => (await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM table_sessions WHERE ended_at IS NULL'))!.c

    beforeEach(async () => {
        db = new Database()
        await db.initialize()
        await db.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['r1', 'r1', 'A', 'r@r.com', '1', 'O', 'W', now, now]
        )
        repo = new SqliteTableRepository(db)
    })

    afterEach(async () => {
        await db.close()
    })

    it('crear una mesa ocupada abre una sesion manual sin cliente', async () => {
        const table = await repo.create(base('t1', 1, 'ocupada'))
        expect(table.status).toBe('ocupada')
        const rows = await sessions('t1')
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ client_id: null, party_size: null, ended_at: null })
        expect(table.activeSessionId).toBe(rows[0]!.id)
    })

    it('libre -> ocupada abre una sesion manual y repetir ocupada no crea otra', async () => {
        await repo.create(base('t1', 1))
        const first = await repo.changeStatus('r1', 't1', 'ocupada')
        const again = await repo.changeStatus('r1', 't1', 'ocupada')
        expect(first?.status).toBe('ocupada')
        expect(again?.activeSessionId).toBe(first?.activeSessionId)
        expect(await sessions('t1')).toHaveLength(1)
    })

    it('reservada -> ocupada abre sesion manual y ocupada -> reservada la cierra', async () => {
        await repo.create(base('t1', 1, 'reservada'))
        const occupied = await repo.changeStatus('r1', 't1', 'ocupada')
        expect(occupied?.activeSessionId).not.toBeNull()
        const reserved = await repo.changeStatus('r1', 't1', 'reservada')
        expect(reserved).toMatchObject({ status: 'reservada', activeSessionId: null })
        const rows = await sessions('t1')
        expect(rows).toHaveLength(1)
        expect(rows[0]!.ended_at).not.toBeNull()
    })

    it('libre <-> reservada no abre ni cierra sesiones', async () => {
        await repo.create(base('t1', 1))
        expect((await repo.changeStatus('r1', 't1', 'reservada'))?.status).toBe('reservada')
        expect((await repo.changeStatus('r1', 't1', 'libre'))?.status).toBe('libre')
        expect(await sessions('t1')).toHaveLength(0)
    })

    it('liberar una mesa de cliente cierra su sesion sin tocar pedidos pendientes', async () => {
        await repo.create(base('t1', 1))
        await db.run("UPDATE restaurant_tables SET status = 'ocupada' WHERE id = 't1'")
        await db.run('INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at) VALUES (?, ?, ?, ?, ?, ?)', ['s1', 'r1', 't1', 'c1', 2, now])
        await db.run('INSERT INTO dishes (id, name, price, category, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['d1', 'P', 5, 'principal', 'r1', now, now])
        await db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at, table_session_id) VALUES (?, ?, ?, ?, ?, ?)', ['o1', 'r1', 't1', 'c1', now, 's1'])
        await db.run("INSERT INTO order_items (id, order_id, dish_id, quantity, status) VALUES ('i1', 'o1', 'd1', 1, 'pendiente')")

        const freed = await repo.changeStatus('r1', 't1', 'libre')
        expect(freed).toMatchObject({ status: 'libre', activeSessionId: null })
        expect((await sessions('t1'))[0]!.ended_at).not.toBeNull()
        expect(await db.get("SELECT status FROM order_items WHERE id = 'i1'")).toEqual({ status: 'pendiente' })
        expect(await db.get('SELECT table_session_id FROM orders WHERE id = ?', ['o1'])).toEqual({ table_session_id: 's1' })
    })

    it('changeStatus devuelve null para mesa inexistente, ajena o borrada', async () => {
        await repo.create(base('t1', 1))
        expect(await repo.changeStatus('r1', 'nope', 'libre')).toBeNull()
        expect(await repo.changeStatus('otro', 't1', 'ocupada')).toBeNull()
        await db.run('UPDATE restaurant_tables SET deleted_at = ? WHERE id = ?', [now, 't1'])
        expect(await repo.changeStatus('r1', 't1', 'ocupada')).toBeNull()
        expect(await sessions('t1')).toHaveLength(0)
    })

    it('replace aplica las mismas transiciones que changeStatus', async () => {
        await repo.create(base('t1', 1))
        const occupied = await repo.replace('r1', 't1', { number: 1, description: 'x', capacity: 4, status: 'ocupada' })
        expect(occupied?.activeSessionId).not.toBeNull()
        const freed = await repo.replace('r1', 't1', { number: 1, description: 'x', capacity: 4, status: 'libre' })
        expect(freed).toMatchObject({ status: 'libre', activeSessionId: null })
        expect(await sessions('t1')).toHaveLength(1)
    })

    it('replace no reduce la capacidad por debajo del grupo activo y no cambia nada', async () => {
        await repo.create(base('t1', 1, 'libre', 6))
        await db.run("UPDATE restaurant_tables SET status = 'ocupada' WHERE id = 't1'")
        await db.run('INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at) VALUES (?, ?, ?, ?, ?, ?)', ['s1', 'r1', 't1', 'c1', 5, now])
        await expect(repo.replace('r1', 't1', { number: 7, description: 'cambio', capacity: 4, status: 'ocupada' })).rejects.toThrow(TableCapacityConflictError)
        expect(await repo.findById('r1', 't1')).toMatchObject({ number: 1, description: '', capacity: 6 })
        const ok = await repo.replace('r1', 't1', { number: 1, description: '', capacity: 5, status: 'ocupada' })
        expect(ok?.capacity).toBe(5)
    })

    it('replace permite reducir la capacidad si la misma peticion libera la mesa', async () => {
        await repo.create(base('t1', 1, 'libre', 6))
        await db.run("UPDATE restaurant_tables SET status = 'ocupada' WHERE id = 't1'")
        await db.run('INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at) VALUES (?, ?, ?, ?, ?, ?)', ['s1', 'r1', 't1', 'c1', 5, now])
        const result = await repo.replace('r1', 't1', { number: 1, description: '', capacity: 2, status: 'libre' })
        expect(result).toMatchObject({ capacity: 2, status: 'libre', activeSessionId: null })
    })

    it('replace es atomico: un conflicto de numero no deja el cambio de estado a medias', async () => {
        await repo.create(base('t1', 1))
        await repo.create(base('t2', 2, 'ocupada'))
        await expect(repo.replace('r1', 't2', { number: 1, description: '', capacity: 4, status: 'libre' })).rejects.toThrow(TableNumberConflictError)
        expect(await repo.findById('r1', 't2')).toMatchObject({ status: 'ocupada', number: 2 })
        expect((await sessions('t2'))[0]!.ended_at).toBeNull()
    })

    it('borrar una mesa ocupada cierra su sesion, la elimina logicamente y conserva el historial', async () => {
        await repo.create(base('t1', 1, 'ocupada'))
        await db.run('INSERT INTO dishes (id, name, price, category, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['d1', 'P', 5, 'principal', 'r1', now, now])
        const sessionId = (await sessions('t1'))[0]!.id
        await db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at, table_session_id) VALUES (?, ?, ?, ?, ?, ?)', ['o1', 'r1', 't1', null, now, sessionId])
        await db.run("INSERT INTO order_items (id, order_id, dish_id, quantity, status) VALUES ('i1', 'o1', 'd1', 1, 'pendiente')")

        expect(await repo.delete('r1', 't1')).toBe(true)
        expect(await repo.findById('r1', 't1')).toBeNull()
        expect(await repo.findByRestaurant('r1')).toEqual([])
        expect(await openCount()).toBe(0)
        expect((await sessions('t1'))[0]!.ended_at).not.toBeNull()
        expect(await db.get('SELECT deleted_at FROM restaurant_tables WHERE id = ?', ['t1'])).not.toEqual({ deleted_at: null })
        expect(await db.get("SELECT status FROM order_items WHERE id = 'i1'")).toEqual({ status: 'pendiente' })
        expect(await repo.delete('r1', 't1')).toBe(false)
        expect(await repo.delete('r1', 'nope')).toBe(false)
        const reused = await repo.create(base('t9', 1))
        expect(reused.id).toBe('t9')
    })

    it('borrar no afecta a mesas de otro restaurante', async () => {
        await repo.create(base('t1', 1))
        expect(await repo.delete('otro', 't1')).toBe(false)
        expect(await repo.findById('r1', 't1')).not.toBeNull()
    })
})
