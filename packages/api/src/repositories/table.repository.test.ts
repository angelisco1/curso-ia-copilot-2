import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteTableRepository } from './table.repository.js'
import { TableNumberConflictError } from '@errors/DomainErrors.js'

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
        await repo.create(newTable('t1', 'r1', 1, { status: 'ocupada' }))
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

    it('updateDetails cambia numero, descripcion y capacidad sin tocar restaurante ni estado', async () => {
        await repo.create(newTable('t1', 'r1', 1, { status: 'reservada' }))
        const updated = await repo.updateDetails('r1', 't1', { number: 9, description: 'Nueva', capacity: 10 })
        expect(updated).toEqual({ id: 't1', restaurantId: 'r1', number: 9, description: 'Nueva', capacity: 10, status: 'reservada', activeSessionId: null })
    })

    it('updateDetails devuelve null para mesa ajena o borrada y detecta duplicados', async () => {
        await repo.create(newTable('t1', 'r1', 1))
        await repo.create(newTable('t2', 'r1', 2))
        expect(await repo.updateDetails('r2', 't1', { number: 5, description: '', capacity: 1 })).toBeNull()
        await db.run('UPDATE restaurant_tables SET deleted_at = ? WHERE id = ?', [now, 't2'])
        expect(await repo.updateDetails('r1', 't2', { number: 5, description: '', capacity: 1 })).toBeNull()
        await repo.create(newTable('t3', 'r1', 3))
        await expect(repo.updateDetails('r1', 't3', { number: 1, description: '', capacity: 1 })).rejects.toThrow(TableNumberConflictError)
        expect((await repo.findById('r1', 't3'))?.number).toBe(3)
    })
})
