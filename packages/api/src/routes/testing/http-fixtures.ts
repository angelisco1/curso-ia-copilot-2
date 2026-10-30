import jwt from 'jsonwebtoken'
import { dbConfig } from '@config/database.js'

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-resttek-key'

export const token = (id: string, role: string, restaurantId: string | null = null): string =>
    jwt.sign({ id, role, restaurantId }, JWT_SECRET)

export const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`]

export const tokens = {
    admin: token('admin-1', 'admin'),
    manager1: token('mgr-1', 'manager', 'r1'),
    manager2: token('mgr-2', 'manager', 'r2'),
    camarero1: token('wtr-1', 'camarero', 'r1'),
    cocinero1: token('cook-1', 'cocinero', 'r1'),
    cliente: token('cli-1', 'cliente'),
    cliente2: token('cli-2', 'cliente')
}

/** Reinicia el estado de mesas y deja dos restaurantes (r1, r2) y un plato en la BD en memoria. */
export async function resetDatabase(): Promise<void> {
    await dbConfig.run('DELETE FROM order_items')
    await dbConfig.run('DELETE FROM orders')
    await dbConfig.run('DELETE FROM table_sessions')
    await dbConfig.run('DELETE FROM restaurant_tables')
    await dbConfig.run('DELETE FROM dishes')
    await dbConfig.run('DELETE FROM restaurants')
    const now = new Date().toISOString()
    for (const id of ['r1', 'r2']) {
        await dbConfig.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, `Restaurante ${id}`, 'Calle 1', `${id}@r.com`, '600', 'Ana', 'Gil', now, now]
        )
    }
    await dbConfig.run(
        'INSERT INTO dishes (id, name, price, category, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['d1', 'Tortilla', 7.5, 'principal', 'r1', now, now]
    )
}
