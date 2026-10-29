import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Database } from '@config/database.js'
import { SqliteTableRepository } from './table.repository.js'
import { SqliteTableSessionRepository } from './table-session.repository.js'
import {
    TableNotFoundError,
    TableNotAvailableError,
    TableCapacityExceededError,
    ActiveTableSessionExistsError
} from '@errors/DomainErrors.js'

const now = new Date().toISOString()

describe('SqliteTableSessionRepository.occupy (integracion)', () => {
    let db: Database
    let tables: SqliteTableRepository
    let repo: SqliteTableSessionRepository

    const params = (id: string, tableId: string, clientId: string, partySize = 2, restaurantId = 'r1') =>
        ({ id, restaurantId, tableId, clientId, partySize })

    const openSessions = () => db.all<{ id: string; table_id: string; client_id: string | null }>(
        'SELECT id, table_id, client_id FROM table_sessions WHERE ended_at IS NULL ORDER BY id')

    beforeEach(async () => {
        db = new Database()
        await db.initialize()
        for (const id of ['r1', 'r2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, id, 'A', 'r@r.com', '1', 'O', 'W', now, now]
            )
        }
        tables = new SqliteTableRepository(db)
        repo = new SqliteTableSessionRepository(db)
        await tables.create({ id: 't1', restaurantId: 'r1', number: 1, description: 'Terraza', capacity: 4, status: 'libre' })
        await tables.create({ id: 't2', restaurantId: 'r1', number: 2, description: '', capacity: 2, status: 'libre' })
        await tables.create({ id: 'x1', restaurantId: 'r2', number: 1, description: '', capacity: 4, status: 'libre' })
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await db.close()
    })

    it('ocupa una mesa libre: abre la sesion y marca la mesa ocupada', async () => {
        const result = await repo.occupy(params('s1', 't1', 'c1', 3))
        expect(result.created).toBe(true)
        expect(result.session).toMatchObject({ id: 's1', restaurantId: 'r1', tableId: 't1', clientId: 'c1', partySize: 3, endedAt: null })
        expect(typeof result.session.startedAt).toBe('string')
        expect(result.table).toMatchObject({ id: 't1', status: 'ocupada', activeSessionId: 's1' })
        expect((await tables.findById('r1', 't1'))?.status).toBe('ocupada')
    })

    it('reintentar la misma confirmacion devuelve la sesion sin duplicarla', async () => {
        const first = await repo.occupy(params('s1', 't1', 'c1', 3))
        const retry = await repo.occupy(params('s-otra', 't1', 'c1', 3))
        expect(retry.created).toBe(false)
        expect(retry.session.id).toBe(first.session.id)
        expect(await openSessions()).toHaveLength(1)
    })

    it('el mismo cliente con otra mesa o grupo en el restaurante recibe conflicto y no cambia nada', async () => {
        await repo.occupy(params('s1', 't1', 'c1', 3))
        await expect(repo.occupy(params('s2', 't2', 'c1', 2))).rejects.toThrow(ActiveTableSessionExistsError)
        await expect(repo.occupy(params('s3', 't1', 'c1', 4))).rejects.toThrow(ActiveTableSessionExistsError)
        expect((await tables.findById('r1', 't2'))?.status).toBe('libre')
        expect(await openSessions()).toHaveLength(1)
    })

    it('un cliente conserva sesiones en restaurantes distintos', async () => {
        await repo.occupy(params('s1', 't1', 'c1', 2))
        const other = await repo.occupy(params('s2', 'x1', 'c1', 2, 'r2'))
        expect(other.created).toBe(true)
        expect(await openSessions()).toHaveLength(2)
    })

    it('rechaza mesa inexistente, de otro restaurante o borrada', async () => {
        await expect(repo.occupy(params('s1', 'no-existe', 'c1'))).rejects.toThrow(TableNotFoundError)
        await expect(repo.occupy(params('s2', 'x1', 'c1', 2, 'r1'))).rejects.toThrow(TableNotFoundError)
        await db.run('UPDATE restaurant_tables SET deleted_at = ? WHERE id = ?', [now, 't1'])
        await expect(repo.occupy(params('s3', 't1', 'c1'))).rejects.toThrow(TableNotFoundError)
        expect(await openSessions()).toHaveLength(0)
    })

    it('rechaza mesas reservadas u ocupadas por otro y capacidad insuficiente', async () => {
        await db.run("UPDATE restaurant_tables SET status = 'reservada' WHERE id = 't2'")
        await expect(repo.occupy(params('s1', 't2', 'c1', 1))).rejects.toThrow(TableNotAvailableError)
        await repo.occupy(params('s2', 't1', 'c2', 2))
        await expect(repo.occupy(params('s3', 't1', 'c3', 2))).rejects.toThrow(TableNotAvailableError)
        await tables.create({ id: 't3', restaurantId: 'r1', number: 3, description: '', capacity: 2, status: 'libre' })
        await expect(repo.occupy(params('s4', 't3', 'c4', 3))).rejects.toThrow(TableCapacityExceededError)
        expect((await tables.findById('r1', 't3'))?.status).toBe('libre')
        expect(await openSessions()).toHaveLength(1)
    })

    it('carrera: dos clientes compiten por la misma mesa, gana uno y el otro recibe conflicto', async () => {
        const results = await Promise.allSettled([
            repo.occupy(params('sa', 't1', 'ca', 2)),
            repo.occupy(params('sb', 't1', 'cb', 2))
        ])
        const fulfilled = results.filter(r => r.status === 'fulfilled')
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0]!.reason).toBeInstanceOf(TableNotAvailableError)
        const open = await openSessions()
        expect(open).toHaveLength(1)
        expect((await tables.findById('r1', 't1'))?.activeSessionId).toBe(open[0]!.id)
    })

    it('carrera: muchos clientes simultaneos por una mesa dejan una sola sesion abierta', async () => {
        const attempts = Array.from({ length: 10 }, (_, i) => repo.occupy(params(`s${i}`, 't1', `c${i}`, 2)))
        const results = await Promise.allSettled(attempts)
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
        expect(await openSessions()).toHaveLength(1)
    })

    it('carrera: el mismo cliente envia dos veces la misma confirmacion a la vez', async () => {
        const [a, b] = await Promise.all([
            repo.occupy(params('s1', 't1', 'c1', 2)),
            repo.occupy(params('s2', 't1', 'c1', 2))
        ])
        expect([a.created, b.created].sort()).toEqual([false, true])
        expect(a.session.id).toBe(b.session.id)
        expect(await openSessions()).toHaveLength(1)
    })

    it('carrera: el mismo cliente en dos mesas a la vez solo obtiene una sesion', async () => {
        const results = await Promise.allSettled([
            repo.occupy(params('s1', 't1', 'c1', 2)),
            repo.occupy(params('s2', 't2', 'c1', 2))
        ])
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
        const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')!
        expect(rejected.reason).toBeInstanceOf(ActiveTableSessionExistsError)
        expect(await openSessions()).toHaveLength(1)
        const occupied = (await tables.findByRestaurant('r1')).filter(t => t.status === 'ocupada')
        expect(occupied).toHaveLength(1)
    })

    it('un fallo intermedio revierte: la mesa sigue libre y no queda sesion huerfana', async () => {
        await db.run("UPDATE restaurant_tables SET status = 'libre' WHERE id = 't2'")
        // id de sesion ya usado por una sesion cerrada: el INSERT falla tras marcar la mesa ocupada
        await db.run('INSERT INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['dup', 'r1', 't2', 'c9', 1, now, now])
        await expect(repo.occupy(params('dup', 't1', 'c1', 2))).rejects.toThrow(/UNIQUE|PRIMARY/)
        expect((await tables.findById('r1', 't1'))?.status).toBe('libre')
        expect(await openSessions()).toHaveLength(0)
        // la mesa sigue siendo ocupable despues del fallo
        const ok = await repo.occupy(params('s-ok', 't1', 'c1', 2))
        expect(ok.created).toBe(true)
    })

    it('un fallo de la base tras el UPDATE (INSERT de sesion rechazado) no deja la mesa ocupada', async () => {
        const original = db.transaction.bind(db)
        vi.spyOn(db, 'transaction').mockImplementation(work => original(async tx => {
            const failing = {
                ...tx,
                run: (sql: string, p?: any[]) => sql.includes('INSERT INTO table_sessions')
                    ? Promise.reject(new Error('disk I/O error'))
                    : tx.run(sql, p)
            }
            return work(failing)
        }))
        await expect(repo.occupy(params('s1', 't1', 'c1', 2))).rejects.toThrow('disk I/O error')
        expect((await tables.findById('r1', 't1'))?.status).toBe('libre')
        expect(await openSessions()).toHaveLength(0)
    })

    it('findActiveByClient devuelve solo la sesion abierta propia con su mesa', async () => {
        await repo.occupy(params('s1', 't1', 'c1', 2))
        const mine = await repo.findActiveByClient('r1', 'c1')
        expect(mine?.session.id).toBe('s1')
        expect(mine?.table).toMatchObject({ id: 't1', status: 'ocupada', activeSessionId: 's1' })
        expect(await repo.findActiveByClient('r1', 'c2')).toBeNull()
        expect(await repo.findActiveByClient('r2', 'c1')).toBeNull()
    })

    it('findActiveByClient ignora sesiones cerradas', async () => {
        await repo.occupy(params('s1', 't1', 'c1', 2))
        await db.run('UPDATE table_sessions SET ended_at = ? WHERE id = ?', [now, 's1'])
        expect(await repo.findActiveByClient('r1', 'c1')).toBeNull()
    })

    it('findById devuelve la sesion (abierta o cerrada) o null', async () => {
        await repo.occupy(params('s1', 't1', 'c1', 2))
        expect(await repo.findById('s1')).toMatchObject({ id: 's1', endedAt: null })
        await db.run('UPDATE table_sessions SET ended_at = ? WHERE id = ?', [now, 's1'])
        expect((await repo.findById('s1'))?.endedAt).toBe(now)
        expect(await repo.findById('nope')).toBeNull()
    })
})
