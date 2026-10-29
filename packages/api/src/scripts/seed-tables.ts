import type { Database } from '@config/database.js'

interface SeedTable {
    number: number
    capacity: number
    status: 'libre' | 'reservada' | 'ocupada'
}

const SEED_TABLES: SeedTable[] = [
    { number: 1, capacity: 2, status: 'libre' },
    { number: 2, capacity: 4, status: 'libre' },
    { number: 3, capacity: 6, status: 'libre' },
    { number: 4, capacity: 4, status: 'reservada' },
    { number: 5, capacity: 4, status: 'ocupada' }
]

const SEED_RESTAURANTS: Array<{ id: string; prefix: number; tables: SeedTable[] }> = [
    { id: 'rest-1', prefix: 1, tables: SEED_TABLES },
    { id: 'rest-2', prefix: 2, tables: SEED_TABLES.filter(t => t.status === 'libre') }
]

/** Ids fijos con forma de UUID: la semilla puede repetirse sin duplicar filas. */
const seedId = (kind: 'table' | 'session', restaurantPrefix: number, tableNumber: number): string =>
    `${kind === 'table' ? '7ab1e000' : '5e550000'}-000${restaurantPrefix}-4000-8000-${String(tableNumber).padStart(12, '0')}`

/**
 * Siembra mesas deterministas (INSERT OR IGNORE por id fijo): no duplica, no pisa el estado
 * actual de mesas ya existentes y no recrea mesas borradas. Omite restaurantes inexistentes.
 */
export async function seedTables(db: Database): Promise<void> {
    const now = new Date().toISOString()
    for (const restaurant of SEED_RESTAURANTS) {
        await db.transaction(async tx => {
            const exists = await tx.get('SELECT id FROM restaurants WHERE id = ?', [restaurant.id])
            if (!exists) return
            for (const table of restaurant.tables) {
                const tableId = seedId('table', restaurant.prefix, table.number)
                await tx.run(
                    `INSERT OR IGNORE INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [tableId, restaurant.id, table.number, `Mesa ${table.number}`, table.capacity, table.status, now, now]
                )
                if (table.status === 'ocupada') {
                    // Ocupacion manual: sin cliente ni tamano de grupo.
                    await tx.run(
                        `INSERT OR IGNORE INTO table_sessions (id, restaurant_id, table_id, client_id, party_size, started_at)
                         VALUES (?, ?, ?, NULL, NULL, ?)`,
                        [seedId('session', restaurant.prefix, table.number), restaurant.id, tableId, now]
                    )
                }
            }
        })
    }
}
