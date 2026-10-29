import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Database } from './database.js'

const now = new Date().toISOString()

async function insertRestaurant(db: Database, id: string) {
    await db.run(
        'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, 'R', 'A', 'r@r.com', '1', 'O', 'W', now, now]
    )
}

async function insertTable(db: Database, id: string, restaurantId: string, number: number, extra: { status?: string; deletedAt?: string | null; capacity?: number } = {}) {
    await db.run(
        'INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, restaurantId, number, '', extra.capacity ?? 4, extra.status ?? 'libre', extra.deletedAt ?? null, now, now]
    )
}

async function insertSession(db: Database, id: string, restaurantId: string, tableId: string, clientId: string | null, endedAt: string | null = null) {
    await db.run(
        'INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, restaurantId, tableId, clientId, clientId ? 2 : null, now, endedAt]
    )
}

describe('esquema de mesas y sesiones', () => {
    let db: Database

    beforeEach(async () => {
        db = new Database()
        await db.initialize()
        await insertRestaurant(db, 'r1')
        await insertRestaurant(db, 'r2')
    })

    afterEach(async () => {
        await db.close()
    })

    it('crea las tablas restaurant_tables y table_sessions', async () => {
        const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        const names = rows.map(r => r.name)
        expect(names).toContain('restaurant_tables')
        expect(names).toContain('table_sessions')
    })

    it('exige que el restaurante de la mesa exista (FK)', async () => {
        await expect(insertTable(db, 't1', 'no-existe', 1)).rejects.toThrow(/FOREIGN KEY/)
    })

    it('rechaza estado, numero y capacidad invalidos', async () => {
        await expect(insertTable(db, 't1', 'r1', 1, { status: 'cerrada' })).rejects.toThrow(/CHECK/)
        await expect(insertTable(db, 't2', 'r1', 0)).rejects.toThrow(/CHECK/)
        await expect(insertTable(db, 't3', 'r1', 3, { capacity: 0 })).rejects.toThrow(/CHECK/)
    })

    it('el numero es unico entre mesas no eliminadas del mismo restaurante', async () => {
        await insertTable(db, 't1', 'r1', 1)
        await expect(insertTable(db, 't2', 'r1', 1)).rejects.toThrow(/UNIQUE/)
        await insertTable(db, 't3', 'r2', 1)
    })

    it('el numero se reutiliza tras un borrado logico', async () => {
        await insertTable(db, 't1', 'r1', 1, { deletedAt: now })
        await insertTable(db, 't2', 'r1', 1)
        await insertTable(db, 't3', 'r1', 1, { deletedAt: now })
    })

    it('exige que restaurante y mesa de la sesion existan (FK)', async () => {
        await insertTable(db, 't1', 'r1', 1)
        await expect(insertSession(db, 's1', 'r1', 'no-existe', 'c1')).rejects.toThrow(/FOREIGN KEY/)
        await expect(insertSession(db, 's2', 'no-existe', 't1', 'c1')).rejects.toThrow(/FOREIGN KEY/)
    })

    it('solo permite una sesion abierta por mesa', async () => {
        await insertTable(db, 't1', 'r1', 1)
        await insertSession(db, 's1', 'r1', 't1', 'c1')
        await expect(insertSession(db, 's2', 'r1', 't1', 'c2')).rejects.toThrow(/UNIQUE/)
        await expect(insertSession(db, 's3', 'r1', 't1', null)).rejects.toThrow(/UNIQUE/)
    })

    it('permite varias sesiones cerradas de la misma mesa y una nueva abierta', async () => {
        await insertTable(db, 't1', 'r1', 1)
        await insertSession(db, 's1', 'r1', 't1', 'c1', now)
        await insertSession(db, 's2', 'r1', 't1', 'c2', now)
        await insertSession(db, 's3', 'r1', 't1', 'c3')
    })

    it('solo permite una sesion abierta por cliente y restaurante, pero varias restaurantes', async () => {
        await insertTable(db, 't1', 'r1', 1)
        await insertTable(db, 't2', 'r1', 2)
        await insertTable(db, 't3', 'r2', 1)
        await insertSession(db, 's1', 'r1', 't1', 'c1')
        await expect(insertSession(db, 's2', 'r1', 't2', 'c1')).rejects.toThrow(/UNIQUE/)
        await insertSession(db, 's3', 'r2', 't3', 'c1')
    })

    it('permite varias sesiones manuales abiertas sin cliente en mesas distintas', async () => {
        await insertTable(db, 't1', 'r1', 1)
        await insertTable(db, 't2', 'r1', 2)
        await insertSession(db, 's1', 'r1', 't1', null)
        await insertSession(db, 's2', 'r1', 't2', null)
    })

    it('rechaza partySize no positivo', async () => {
        await insertTable(db, 't1', 'r1', 1)
        await expect(db.run(
            'INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['s1', 'r1', 't1', 'c1', 0, now]
        )).rejects.toThrow(/CHECK/)
    })
})

describe('inicializacion repetida sobre un archivo', () => {
    let dir: string
    let file: string

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resttek-db-'))
        file = path.join(dir, 'test.db')
    })

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('inicializar dos veces no duplica ni destruye datos', async () => {
        const first = new Database(file)
        await first.initialize()
        await insertRestaurant(first, 'r1')
        await insertTable(first, 't1', 'r1', 1)
        await insertSession(first, 's1', 'r1', 't1', 'c1')
        await first.close()

        const second = new Database(file)
        await second.initialize()
        const tables = await second.all<{ id: string }>('SELECT id FROM restaurant_tables')
        const sessions = await second.all<{ id: string }>('SELECT id FROM table_sessions')
        const indexes = await second.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_table%'")
        await second.close()

        expect(tables).toEqual([{ id: 't1' }])
        expect(sessions).toEqual([{ id: 's1' }])
        expect(indexes.length).toBe(3)
    })
})
