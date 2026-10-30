import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sqlite3 from 'sqlite3'
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

describe('evolucion de pedidos existentes', () => {
    let dir: string
    let file: string

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resttek-legacy-'))
        file = path.join(dir, 'legacy.db')
        await createLegacyDatabase(file)
    })

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true })
    })

    async function columns(db: Database): Promise<string[]> {
        const info = await db.all<{ name: string }>('PRAGMA table_info(orders)')
        return info.map(c => c.name)
    }

    it('anade table_session_id nullable una sola vez sin perder datos', async () => {
        const db = new Database(file)
        await db.initialize()
        const cols = await columns(db)
        expect(cols.filter(c => c === 'table_session_id')).toHaveLength(1)

        const order = await db.get<Record<string, unknown>>('SELECT * FROM orders WHERE id = ?', ['o1'])
        expect(order).toMatchObject({ id: 'o1', restaurant_id: 'r1', table_id: 'mesa-7', client_id: 'c1', table_session_id: null })
        const items = await db.all<{ id: string; status: string }>('SELECT id, status FROM order_items WHERE order_id = ? ORDER BY id', ['o1'])
        expect(items).toEqual([{ id: 'i1', status: 'pendiente' }, { id: 'i2', status: 'entregado' }])
        await db.close()
    })

    it('reabrir la base no repite la migracion ni borra datos', async () => {
        const first = new Database(file)
        await first.initialize()
        await first.close()

        const second = new Database(file)
        await second.initialize()
        const cols = await columns(second)
        expect(cols.filter(c => c === 'table_session_id')).toHaveLength(1)
        const orders = await second.all<{ id: string }>('SELECT id FROM orders')
        expect(orders).toEqual([{ id: 'o1' }])
        await second.close()
    })

    it('un pedido nuevo puede referenciar una sesion y la FK se aplica', async () => {
        const db = new Database(file)
        await db.initialize()
        await insertTable(db, 't1', 'r1', 1)
        await insertSession(db, 's1', 'r1', 't1', 'c1')
        await db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at, table_session_id) VALUES (?, ?, ?, ?, ?, ?)',
            ['o2', 'r1', 't1', 'c1', now, 's1'])
        await expect(db.run('INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at, table_session_id) VALUES (?, ?, ?, ?, ?, ?)',
            ['o3', 'r1', 't1', 'c1', now, 'no-existe'])).rejects.toThrow(/FOREIGN KEY/)
        await db.close()
    })

    it('una base nueva tambien tiene la columna', async () => {
        const db = new Database()
        await db.initialize()
        expect(await columns(db)).toContain('table_session_id')
        await db.close()
    })
})

function createLegacyDatabase(file: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const raw = new sqlite3.Database(file, err => {
            if (err) return reject(err)
            raw.exec(`
                CREATE TABLE restaurants (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, owner_first_name TEXT NOT NULL, owner_last_name TEXT NOT NULL, logo_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE dishes (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, price REAL NOT NULL, category TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1, restaurant_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(restaurant_id) REFERENCES restaurants(id));
                CREATE TABLE orders (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, table_id TEXT, client_id TEXT, created_at TEXT NOT NULL, FOREIGN KEY(restaurant_id) REFERENCES restaurants(id));
                CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, dish_id TEXT NOT NULL, quantity INTEGER NOT NULL, notes TEXT, status TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY(dish_id) REFERENCES dishes(id));
                INSERT INTO restaurants VALUES ('r1', 'R', 'A', 'r@r.com', '1', 'O', 'W', NULL, '${now}', '${now}');
                INSERT INTO dishes VALUES ('d1', 'Plato', NULL, 5, 'principal', 1, 'r1', '${now}', '${now}');
                INSERT INTO orders VALUES ('o1', 'r1', 'mesa-7', 'c1', '${now}');
                INSERT INTO order_items VALUES ('i1', 'o1', 'd1', 1, NULL, 'pendiente');
                INSERT INTO order_items VALUES ('i2', 'o1', 'd1', 1, NULL, 'entregado');
            `, err2 => raw.close(err3 => (err2 || err3) ? reject(err2 || err3) : resolve()))
        })
    })
}

describe('transacciones sobre la conexion compartida', () => {
    let db: Database

    beforeEach(async () => {
        db = new Database()
        await db.initialize()
        await insertRestaurant(db, 'r1')
    })

    afterEach(async () => {
        await db.close()
    })

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const countTables = async () => (await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM restaurant_tables'))!.c

    it('confirma todas las escrituras si el trabajo termina bien', async () => {
        const result = await db.transaction(async tx => {
            await tx.run('INSERT INTO restaurant_tables (id, restaurant_id, number, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['a', 'r1', 1, 2, 'libre', now, now])
            await tx.run('INSERT INTO restaurant_tables (id, restaurant_id, number, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['b', 'r1', 2, 2, 'libre', now, now])
            return 'ok'
        })
        expect(result).toBe('ok')
        expect(await countTables()).toBe(2)
    })

    it('revierte todas las escrituras y propaga el error original si el trabajo falla', async () => {
        const boom = new Error('boom')
        await expect(db.transaction(async tx => {
            await tx.run('INSERT INTO restaurant_tables (id, restaurant_id, number, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['a', 'r1', 1, 2, 'libre', now, now])
            throw boom
        })).rejects.toBe(boom)
        expect(await countTables()).toBe(0)
    })

    it('revierte si una sentencia SQL falla a mitad de la transaccion', async () => {
        await expect(db.transaction(async tx => {
            await tx.run('INSERT INTO restaurant_tables (id, restaurant_id, number, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['a', 'r1', 1, 2, 'libre', now, now])
            await tx.run('INSERT INTO restaurant_tables (id, restaurant_id, number, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['b', 'r1', 1, 2, 'libre', now, now])
        })).rejects.toThrow(/UNIQUE/)
        expect(await countTables()).toBe(0)
    })

    it('las consultas ajenas no se intercalan dentro de una transaccion en curso', async () => {
        let seenOutside: number | undefined
        const tx = db.transaction(async t => {
            await t.run('INSERT INTO restaurant_tables (id, restaurant_id, number, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['a', 'r1', 1, 2, 'libre', now, now])
            await wait(30)
            throw new Error('rollback')
        })
        await wait(5)
        const outside = countTables().then(c => { seenOutside = c })
        await expect(tx).rejects.toThrow('rollback')
        await outside
        expect(seenOutside).toBe(0)
    })

    it('una escritura ajena emitida durante la transaccion no se pierde ni se revierte con ella', async () => {
        const tx = db.transaction(async t => {
            await t.run('INSERT INTO restaurant_tables (id, restaurant_id, number, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', ['a', 'r1', 1, 2, 'libre', now, now])
            await wait(30)
            throw new Error('rollback')
        })
        await wait(5)
        const outside = insertTable(db, 'outside', 'r1', 2)
        await expect(tx).rejects.toThrow('rollback')
        await outside
        const ids = (await db.all<{ id: string }>('SELECT id FROM restaurant_tables')).map(r => r.id)
        expect(ids).toEqual(['outside'])
    })

    it('las transacciones concurrentes se serializan', async () => {
        const order: string[] = []
        const make = (name: string) => db.transaction(async t => {
            order.push(`${name}:start`)
            await t.run('SELECT 1')
            await wait(10)
            order.push(`${name}:end`)
        })
        await Promise.all([make('a'), make('b'), make('c')])
        expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
    })
})
