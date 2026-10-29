import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteTableRepository } from '@repositories/table.repository.js'
import { seedTables } from './seed-tables.js'

describe('seedTables', () => {
    let db: Database

    beforeEach(async () => {
        db = new Database()
        await db.initialize()
        const now = new Date().toISOString()
        for (const id of ['rest-1', 'rest-2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, id, 'A', `${id}@r.com`, '1', 'O', 'W', now, now]
            )
        }
    })

    afterEach(async () => {
        await db.close()
    })

    it('siembra mesas deterministas: libres 2/4/6, una reservada y una ocupada manual', async () => {
        await seedTables(db)
        const tables = await new SqliteTableRepository(db).findByRestaurant('rest-1')
        expect(tables.map(t => [t.number, t.capacity, t.status])).toEqual([
            [1, 2, 'libre'], [2, 4, 'libre'], [3, 6, 'libre'], [4, 4, 'reservada'], [5, 4, 'ocupada']
        ])
        const occupied = tables.find(t => t.status === 'ocupada')!
        expect(occupied.activeSessionId).not.toBeNull()
        const sessions = await db.all<{ id: string; client_id: string | null; party_size: number | null; ended_at: string | null; table_id: string }>(
            'SELECT id, client_id, party_size, ended_at, table_id FROM table_sessions')
        expect(sessions).toEqual([{ id: occupied.activeSessionId, client_id: null, party_size: null, ended_at: null, table_id: occupied.id }])
        expect((await new SqliteTableRepository(db).findByRestaurant('rest-2')).map(t => [t.number, t.capacity, t.status]))
            .toEqual([[1, 2, 'libre'], [2, 4, 'libre'], [3, 6, 'libre']])
    })

    it('los ids son estables entre ejecuciones y al repetir no se duplican mesas ni sesiones', async () => {
        await seedTables(db)
        const before = await db.all('SELECT id, restaurant_id, number, capacity, status FROM restaurant_tables ORDER BY id')
        await seedTables(db)
        await seedTables(db)
        expect(await db.all('SELECT id, restaurant_id, number, capacity, status FROM restaurant_tables ORDER BY id')).toEqual(before)
        expect(before).toHaveLength(8)
        expect(await db.all('SELECT id FROM table_sessions')).toHaveLength(1)
    })

    it('no pisa el estado actual de las mesas al repetirla ni recrea mesas borradas', async () => {
        await seedTables(db)
        await db.run("UPDATE restaurant_tables SET status = 'reservada' WHERE restaurant_id = 'rest-1' AND number = 1")
        await db.run("UPDATE restaurant_tables SET deleted_at = ? WHERE restaurant_id = 'rest-1' AND number = 2", [new Date().toISOString()])
        await seedTables(db)
        const tables = await new SqliteTableRepository(db).findByRestaurant('rest-1')
        expect(tables.find(t => t.number === 1)?.status).toBe('reservada')
        expect(tables.find(t => t.number === 2)).toBeUndefined()
        expect(await db.all("SELECT id FROM restaurant_tables WHERE restaurant_id = 'rest-1'")).toHaveLength(5)
    })

    it('omite restaurantes que no existen sin fallar', async () => {
        await db.run("DELETE FROM restaurants WHERE id = 'rest-2'")
        await seedTables(db)
        expect(await db.all("SELECT id FROM restaurant_tables WHERE restaurant_id = 'rest-2'")).toEqual([])
        expect(await db.all("SELECT id FROM restaurant_tables WHERE restaurant_id = 'rest-1'")).toHaveLength(5)
    })
})
